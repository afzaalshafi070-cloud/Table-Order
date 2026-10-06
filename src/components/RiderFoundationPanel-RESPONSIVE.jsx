import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { getOrCreateTabSecret } from '../utils/auth.js'

/**
 * RESPONSIVE: Works on mobile + desktop
 * Mobile-first design with proper breakpoints
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
      setError(e?.message || 'Error: PHASE2_SIMPLE_NO_GENSALT.sql Supabase me run karo')
    }
  }

  useEffect(() => { load() }, [sessionId])

  const createRider = async () => {
    if (!name.trim() || !phone.trim() || pin.length < 4) {
      setError('❌ Name, phone, PIN (4+) zaroori hai')
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
      setError('❌ ' + (e?.message || 'Create failed'))
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
        p_expires_hours: null,
      })
      if (err) throw err
      await load()
      if (data?.invite_token) {
        const url = `${baseUrl}/rider-register/${restaurantId}/${data.invite_token}`
        try {
          await navigator.clipboard.writeText(url)
          alert('✅ Link copy ho gaya!\n(NO EXPIRY - Forever valid)\n\n' + url)
        } catch {
          prompt('Share this link:', url)
        }
      }
    } catch (e) {
      setError('❌ ' + (e?.message || 'Invite failed'))
    } finally {
      setBusy(false)
    }
  }

  const deleteInvite = async (token) => {
    if (!confirm('Kya is invite ko delete karna hai? (Rider link use nahi kar payega)')) return
    try {
      await supabase.rpc('staff_revoke_invite', {
        p_session_id: sessionId,
        p_tab_secret: tabSecret(),
        p_invite_token: token,
      })
      await load()
      alert('✅ Invite deleted!')
    } catch (e) {
      setError('❌ ' + (e?.message || 'Delete failed'))
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
      setError('❌ ' + (e?.message || 'Duty update failed'))
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
      setError('❌ ' + (e?.message || 'Deactivate failed'))
    }
  }

  const copyInvite = async (token) => {
    const url = `${baseUrl}/rider-register/${restaurantId}/${token}`
    try {
      await navigator.clipboard.writeText(url)
      alert('✅ Link copied!')
    } catch {
      prompt('Share link:', url)
    }
  }

  const dutyColor = (s) => {
    if (s === 'AVAILABLE') return '#065f46'
    if (s === 'OFF_DUTY') return '#57534e'
    return '#9a3412'
  }

  return (
    <div style={styles.container}>
      {/* INFO BOX */}
      <div style={styles.infoBox}>
        <b>Phase 1 — Rider foundation</b>
        <p style={styles.infoText}>
          Permanent riders + invite links + duty status + fair dispatch engine (SQL).
          Existing Area QR Rider Portal still works.
        </p>
      </div>

      {/* ADD RIDER SECTION */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Add rider (staff-assisted)</div>
        <div style={styles.formGrid}>
          <input 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="Full name" 
            style={styles.input} 
          />
          <input 
            value={phone} 
            onChange={e => setPhone(e.target.value)} 
            placeholder="Phone" 
            type="tel" 
            style={styles.input} 
          />
          <input 
            value={pin} 
            onChange={e => setPin(e.target.value)} 
            placeholder="PIN (4+ digits)" 
            type="password" 
            inputMode="numeric" 
            style={styles.input} 
          />
          <input 
            value={area} 
            onChange={e => setArea(e.target.value)} 
            placeholder="Primary area (optional)" 
            style={styles.input} 
          />
          <button 
            type="button" 
            disabled={busy} 
            onClick={createRider} 
            style={{...styles.btnPrimary, opacity: busy ? 0.6 : 1}}
          >
            {busy ? 'Saving…' : 'Create rider'}
          </button>
        </div>
      </div>

      {/* BUTTONS */}
      <div style={styles.buttonGroup}>
        <button 
          type="button" 
          disabled={busy} 
          onClick={createInvite} 
          style={styles.btnSecondary}
        >
          ✨ Generate invite (NO EXPIRY)
        </button>
        <button 
          type="button" 
          onClick={load} 
          style={styles.btnSecondary}
        >
          🔄 Refresh
        </button>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div style={styles.error}>{error}</div>
      )}

      {/* RIDERS LIST */}
      <div>
        <div style={styles.sectionTitle}>Riders ({riders.length})</div>
        {riders.length === 0 && (
          <div style={styles.emptyText}>
            No permanent riders yet. Add above or generate invite.
          </div>
        )}
        <div style={styles.ridersList}>
          {riders.map(r => (
            <div key={r.id} style={styles.riderCard}>
              <div style={styles.riderInfo}>
                <div style={styles.riderName}>{r.full_name}</div>
                <div style={styles.riderMeta}>
                  {r.phone}
                  {r.primary_area ? ` · ${r.primary_area}` : ''}
                </div>
                <div style={{...styles.riderStatus, color: dutyColor(r.duty_status)}}>
                  {r.duty_status}
                  {r.avg_rating != null ? ` · ★ ${r.avg_rating} (${r.rating_count})` : ''}
                  {r.deliveries_completed_count ? ` · ${r.deliveries_completed_count} deliveries` : ''}
                </div>
              </div>
              <div style={styles.riderActions}>
                {r.duty_status === 'OFF_DUTY' ? (
                  <button type="button" onClick={() => setDuty(r.id, 'AVAILABLE')} style={styles.miniBtn}>
                    Set AVAILABLE
                  </button>
                ) : r.duty_status === 'AVAILABLE' ? (
                  <button type="button" onClick={() => setDuty(r.id, 'OFF_DUTY')} style={styles.miniBtn}>
                    Set OFF DUTY
                  </button>
                ) : null}
                <button 
                  type="button" 
                  onClick={() => deactivate(r.id)} 
                  style={{...styles.miniBtn, color: '#b91c1c'}}
                >
                  Deactivate
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* INVITES LIST */}
      <div>
        <div style={styles.sectionTitle}>Recent invites</div>
        {invites.length === 0 && (
          <div style={styles.emptyText}>No invites yet.</div>
        )}
        <div style={styles.invitesList}>
          {invites.slice(0, 8).map(inv => (
            <div key={inv.id} style={styles.inviteCard}>
              <div style={styles.inviteStatus}>
                {inv.used_at ? '✅ Used' : inv.is_revoked ? '❌ Deleted' : '🔗 Active'}
                {inv.expires_at 
                  ? ` · expires ${new Date(inv.expires_at).toLocaleDateString()}` 
                  : ' · ♾️ Forever'
                }
              </div>
              <div style={styles.inviteActions}>
                {!inv.used_at && !inv.is_revoked && (
                  <>
                    <button 
                      type="button" 
                      onClick={() => copyInvite(inv.invite_token)} 
                      style={styles.inviteBtn}
                    >
                      Copy
                    </button>
                    <button 
                      type="button" 
                      onClick={() => deleteInvite(inv.invite_token)} 
                      style={{...styles.inviteBtn, color: '#b91c1c'}}
                    >
                      🗑️ Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// RESPONSIVE STYLES
// ============================================================
const styles = {
  container: {
    padding: 'max(8px, 2%)',
    maxWidth: '1200px',
    margin: '0 auto',
    backgroundColor: '#fafaf9',
    minHeight: '100vh',
  },

  infoBox: {
    background: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: 12,
    padding: 'clamp(10px, 3%, 16px)',
    marginBottom: 'clamp(12px, 4%, 20px)',
    fontSize: 'clamp(12px, 2.5vw, 14px)',
    color: '#1e3a8a',
    lineHeight: 1.5,
  },

  infoText: {
    margin: '8px 0 0 0',
    fontSize: 'clamp(11px, 2.2vw, 13px)',
  },

  card: {
    background: 'var(--surface, #fff)',
    border: '1px solid var(--line)',
    borderRadius: 12,
    padding: 'clamp(12px, 3%, 16px)',
    marginBottom: 'clamp(12px, 4%, 18px)',
  },

  cardTitle: {
    fontWeight: 700,
    marginBottom: 'clamp(8px, 2%, 12px)',
    fontSize: 'clamp(14px, 2.8vw, 16px)',
  },

  formGrid: {
    display: 'grid',
    gap: 'clamp(8px, 2%, 12px)',
  },

  input: {
    width: '100%',
    padding: 'clamp(10px, 2%, 14px)',
    borderRadius: 10,
    border: '1px solid var(--line, #e7e5e4)',
    fontSize: 'clamp(12px, 2.2vw, 15px)',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },

  btnPrimary: {
    border: 'none',
    borderRadius: 999,
    padding: 'clamp(10px, 2.5%, 14px) clamp(14px, 3%, 18px)',
    background: 'var(--brand-primary, #1c1917)',
    color: '#fff',
    fontWeight: 700,
    fontSize: 'clamp(12px, 2.2vw, 14px)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },

  buttonGroup: {
    display: 'flex',
    gap: 'clamp(8px, 2%, 12px)',
    marginBottom: 'clamp(12px, 4%, 18px)',
    flexWrap: 'wrap',
  },

  btnSecondary: {
    border: '1px solid var(--line)',
    borderRadius: 999,
    padding: 'clamp(8px, 2%, 12px) clamp(12px, 2.5%, 16px)',
    background: '#fff',
    fontWeight: 600,
    fontSize: 'clamp(11px, 2vw, 13px)',
    cursor: 'pointer',
    flex: '1 1 auto',
    minWidth: 'max(120px, 40%)',
    transition: 'all 0.2s',
  },

  error: {
    color: '#b45309',
    fontSize: 'clamp(11px, 2vw, 13px)',
    marginBottom: 'clamp(8px, 2%, 12px)',
    background: '#fef3c7',
    padding: 'clamp(8px, 2%, 12px)',
    borderRadius: 8,
    wordBreak: 'break-word',
  },

  sectionTitle: {
    fontWeight: 700,
    marginBottom: 'clamp(8px, 2%, 12px)',
    fontSize: 'clamp(14px, 2.8vw, 16px)',
    marginTop: 'clamp(12px, 3%, 16px)',
  },

  emptyText: {
    fontSize: 'clamp(12px, 2.2vw, 13px)',
    color: 'var(--text-muted)',
    marginBottom: 'clamp(12px, 3%, 16px)',
  },

  ridersList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(8px, 2%, 12px)',
    marginBottom: 'clamp(16px, 4%, 24px)',
  },

  riderCard: {
    border: '1px solid var(--line)',
    borderRadius: 12,
    padding: 'clamp(10px, 2.5%, 14px)',
    background: 'var(--surface, #fff)',
    display: 'flex',
    gap: 'clamp(8px, 2%, 12px)',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    '@media (max-width: 600px)': {
      flexDirection: 'column',
    },
  },

  riderInfo: {
    flex: '1 1 auto',
    minWidth: '150px',
  },

  riderName: {
    fontWeight: 700,
    fontSize: 'clamp(13px, 2.5vw, 15px)',
  },

  riderMeta: {
    fontSize: 'clamp(11px, 2vw, 12px)',
    color: 'var(--text-secondary)',
    marginTop: 2,
  },

  riderStatus: {
    marginTop: 'clamp(4px, 1.5%, 6px)',
    fontSize: 'clamp(10px, 1.8vw, 11px)',
    fontWeight: 700,
  },

  riderActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(4px, 1.5%, 6px)',
    minWidth: 'max(100px, 25%)',
  },

  miniBtn: {
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: 'clamp(6px, 1.5%, 8px) clamp(8px, 1.5%, 10px)',
    background: '#fff',
    fontSize: 'clamp(10px, 1.8vw, 11px)',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },

  invitesList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'clamp(6px, 1.5%, 10px)',
  },

  inviteCard: {
    fontSize: 'clamp(11px, 2vw, 12px)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: 'clamp(8px, 2%, 12px)',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 'clamp(6px, 1.5%, 10px)',
    alignItems: 'center',
    flexWrap: 'wrap',
    '@media (max-width: 500px)': {
      flexDirection: 'column',
      alignItems: 'flex-start',
    },
  },

  inviteStatus: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: '1 1 auto',
    wordBreak: 'break-word',
    fontSize: 'clamp(10px, 1.8vw, 11px)',
  },

  inviteActions: {
    display: 'flex',
    gap: 'clamp(4px, 1.5%, 6px)',
    flexWrap: 'wrap',
  },

  inviteBtn: {
    border: '1px solid var(--line)',
    borderRadius: 6,
    padding: 'clamp(5px, 1.2%, 7px) clamp(8px, 1.5%, 10px)',
    background: '#fff',
    fontSize: 'clamp(10px, 1.8vw, 11px)',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap',
  },
}
