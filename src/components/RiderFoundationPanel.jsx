import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { getOrCreateTabSecret } from '../utils/auth.js'

/**
 * Phase 1 staff panel: create riders, generate invite links, view duty status.
 * Does not replace existing Area QR rider portal.
 */
export default function RiderFoundationPanel({ sessionId, restaurantId }) {
  const [riders, setRiders] = useState([])
  const [invites, setInvites] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [area, setArea] = useState('')
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const tabSecret = () => getOrCreateTabSecret()

  const load = async () => {
    if (!sessionId) return
    setError('')
    try {
      const [r, i] = await Promise.all([
        supabase.rpc('staff_list_riders', { p_session_id: sessionId, p_tab_secret: tabSecret() }),
        supabase.rpc('staff_list_rider_invites', { p_session_id: sessionId, p_tab_secret: tabSecret() }),
      ])
      if (r.error) throw r.error
      if (i.error) throw i.error
      setRiders(Array.isArray(r.data) ? r.data : [])
      setInvites(Array.isArray(i.data) ? i.data : [])
    } catch (e) {
      setRiders([])
      setInvites([])
      setError(e?.message || 'Rider foundation SQL migrate karein (PHASE1_RIDER_FOUNDATION.sql)')
    }
  }

  useEffect(() => { load() }, [sessionId])

  const createRider = async () => {
    if (!name.trim() || !phone.trim() || pin.length < 4) {
      setError('Name, phone, PIN (4+) required')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { error: err } = await supabase.rpc('staff_create_rider', {
        p_session_id: sessionId,
        p_tab_secret: tabSecret(),
        p_full_name: name.trim(),
        p_phone: phone.trim(),
        p_pin: pin.trim(),
        p_photo_url: null,
        p_email: null,
        p_whatsapp: null,
        p_primary_area: area.trim() || null,
      })
      if (err) throw err
      setName('')
      setPhone('')
      setPin('')
      setArea('')
      await load()
    } catch (e) {
      setError(e?.message || 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  const createInvite = async () => {
    setBusy(true)
    setError('')
    try {
      const { data, error: err } = await supabase.rpc('staff_create_rider_invite', {
        p_session_id: sessionId,
        p_tab_secret: tabSecret(),
        p_note: null,
        p_expires_hours: 168,
      })
      if (err) throw err
      await load()
      if (data?.invite_token) {
        const url = `${baseUrl}/rider-register/${restaurantId}/${data.invite_token}`
        try {
          await navigator.clipboard.writeText(url)
          alert('Invite link copy ho gaya (Phase 2 registration page):\\n' + url)
        } catch {
          prompt('Invite link:', url)
        }
      }
    } catch (e) {
      setError(e?.message || 'Invite failed')
    } finally {
      setBusy(false)
    }
  }

  const setDuty = async (riderId, status) => {
    try {
      await supabase.rpc('staff_set_rider_duty', {
        p_session_id: sessionId,
        p_tab_secret: tabSecret(),
        p_rider_id: riderId,
        p_duty_status: status,
      })
      await load()
    } catch (e) {
      setError(e?.message || 'Duty update failed')
    }
  }

  const deactivate = async (riderId) => {
    if (!confirm('Deactivate this rider?')) return
    try {
      await supabase.rpc('staff_deactivate_rider', {
        p_session_id: sessionId,
        p_tab_secret: tabSecret(),
        p_rider_id: riderId,
      })
      await load()
    } catch (e) {
      setError(e?.message || 'Deactivate failed')
    }
  }

  const copyInvite = async (token) => {
    const url = `${baseUrl}/rider-register/${restaurantId}/${token}`
    try {
      await navigator.clipboard.writeText(url)
      alert('Link copied')
    } catch {
      prompt('Invite link:', url)
    }
  }

  const dutyColor = (s) => {
    if (s === 'AVAILABLE') return '#065f46'
    if (s === 'OFF_DUTY') return '#57534e'
    return '#9a3412'
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{
        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12,
        padding: 12, marginBottom: 14, fontSize: 13, color: '#1e3a8a', lineHeight: 1.45
      }}>
        <b>Phase 1 — Rider foundation.</b> Permanent riders + invite links + duty status + fair dispatch engine (SQL).
        Existing Area QR Rider Portal still works. Full Rider App registration / auto-dispatch UI = Phase 2.
      </div>

      <div style={{
        background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 12,
        padding: 14, marginBottom: 14
      }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Add rider (staff-assisted)</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={inp} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" type="tel" style={inp} />
          <input value={pin} onChange={e => setPin(e.target.value)} placeholder="PIN (4+ digits)" type="password" inputMode="numeric" style={inp} />
          <input value={area} onChange={e => setArea(e.target.value)} placeholder="Primary area (optional)" style={inp} />
          <button type="button" disabled={busy} onClick={createRider} style={{ ...btn, opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Saving…' : 'Create rider'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={createInvite} style={btnSecondary}>
          Generate invite link
        </button>
        <button type="button" onClick={load} style={btnSecondary}>Refresh</button>
      </div>

      {error && (
        <div style={{ color: '#b45309', fontSize: 12, marginBottom: 10 }}>{error}</div>
      )}

      <div style={{ fontWeight: 700, marginBottom: 8 }}>Riders ({riders.length})</div>
      {riders.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          No permanent riders yet. Add above or generate invite.
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {riders.map(r => (
          <div key={r.id} style={{
            border: '1px solid var(--line)', borderRadius: 12, padding: 12,
            background: 'var(--surface, #fff)', display: 'flex', gap: 10, alignItems: 'center'
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{r.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.phone}{r.primary_area ? ` · ${r.primary_area}` : ''}</div>
              <div style={{ marginTop: 4, fontSize: 11, fontWeight: 700, color: dutyColor(r.duty_status) }}>
                {r.duty_status}
                {r.avg_rating != null ? ` · ★ ${r.avg_rating} (${r.rating_count})` : ''}
                {r.deliveries_completed_count ? ` · ${r.deliveries_completed_count} deliveries` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {r.duty_status === 'OFF_DUTY' ? (
                <button type="button" onClick={() => setDuty(r.id, 'AVAILABLE')} style={miniBtn}>Set AVAILABLE</button>
              ) : r.duty_status === 'AVAILABLE' ? (
                <button type="button" onClick={() => setDuty(r.id, 'OFF_DUTY')} style={miniBtn}>Set OFF DUTY</button>
              ) : null}
              <button type="button" onClick={() => deactivate(r.id)} style={{ ...miniBtn, color: '#b91c1c' }}>Deactivate</button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontWeight: 700, marginBottom: 8 }}>Recent invites</div>
      {invites.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No invites yet.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {invites.slice(0, 8).map(inv => (
          <div key={inv.id} style={{
            fontSize: 12, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px',
            display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center'
          }}>
            <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {inv.used_at ? 'Used' : inv.is_revoked ? 'Revoked' : 'Open'}
              {' · '}expires {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : '—'}
            </div>
            {!inv.used_at && !inv.is_revoked && (
              <button type="button" onClick={() => copyInvite(inv.invite_token)} style={miniBtn}>Copy link</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const inp = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1px solid var(--line, #e7e5e4)', fontSize: 14, boxSizing: 'border-box'
}
const btn = {
  border: 'none', borderRadius: 999, padding: '10px 16px',
  background: 'var(--brand-primary, #1c1917)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer'
}
const btnSecondary = {
  border: '1px solid var(--line)', borderRadius: 999, padding: '8px 14px',
  background: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer'
}
const miniBtn = {
  border: '1px solid var(--line)', borderRadius: 8, padding: '5px 8px',
  background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer'
}
