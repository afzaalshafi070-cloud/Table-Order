import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { getOrCreateTabSecret } from '../utils/auth.js'

export default function RiderFoundationPanel({ sessionId, restaurantId }) {
  const [riders, setRiders] = useState([])
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
    const { data, error: err } = await supabase.rpc('staff_list_riders', { p_session_id: sessionId, p_tab_secret: tabSecret() })
    if (err) { setError(err.message || 'Rider list load nahi hui'); return }
    setRiders(Array.isArray(data) ? data : [])
  }
  useEffect(() => { load() }, [sessionId])

  const createRider = async () => {
    if (!name.trim() || !phone.trim() || pin.length < 4) { setError('Name, phone aur PIN (4+) required hain.'); return }
    setBusy(true); setError('')
    try {
      const { data, error: err } = await supabase.rpc('staff_create_rider', {
        p_session_id: sessionId, p_tab_secret: tabSecret(), p_full_name: name.trim(), p_phone: phone.trim(),
        p_pin: pin.trim(), p_photo_url: null, p_email: null, p_whatsapp: null, p_primary_area: area.trim() || null,
      })
      if (err) throw err
      setName(''); setPhone(''); setPin(''); setArea('')
      await load()
      if (data?.link_token) copyLink(data.link_token, true)
    } catch (e) { setError(e?.message || 'Rider create nahi hua') }
    finally { setBusy(false) }
  }

  const copyLink = async (token, silent = false) => {
    const url = `${baseUrl}/rider/${restaurantId}/${token}`
    try { await navigator.clipboard.writeText(url); if (!silent) alert('Rider link copied:\n' + url) }
    catch { prompt('Rider permanent link:', url) }
  }

  const regenerate = async (riderId) => {
    if (!confirm('Purana rider link delete karke naya link banana hai?')) return
    setBusy(true); setError('')
    try {
      const { data, error: err } = await supabase.rpc('staff_regenerate_rider_link', { p_session_id: sessionId, p_tab_secret: tabSecret(), p_rider_id: riderId })
      if (err) throw err
      await load()
      if (data?.link_token) copyLink(data.link_token)
    } catch (e) { setError(e?.message || 'Naya link nahi bana') }
    finally { setBusy(false) }
  }

  const deleteLink = async (riderId) => {
    if (!confirm('Rider ka login link delete karein? Rider active session bhi logout ho jayega.')) return
    setBusy(true); setError('')
    try {
      const { error: err } = await supabase.rpc('staff_delete_rider_link', { p_session_id: sessionId, p_tab_secret: tabSecret(), p_rider_id: riderId })
      if (err) throw err
      await load()
    } catch (e) { setError(e?.message || 'Link delete nahi hua') }
    finally { setBusy(false) }
  }

  const setDuty = async (riderId, status) => {
    const { error: err } = await supabase.rpc('staff_set_rider_duty', { p_session_id: sessionId, p_tab_secret: tabSecret(), p_rider_id: riderId, p_duty_status: status })
    if (err) setError(err.message || 'Duty update failed')
    await load()
  }

  const deactivate = async (riderId) => {
    if (!confirm('Deactivate this rider?')) return
    const { error: err } = await supabase.rpc('staff_deactivate_rider', { p_session_id: sessionId, p_tab_secret: tabSecret(), p_rider_id: riderId })
    if (err) setError(err.message || 'Deactivate failed')
    await load()
  }

  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 13, color: '#1e3a8a', lineHeight: 1.45 }}>
        <b>Rider App:</b> Counter par rider ki basic detail + PIN fill karein. Save karte hi permanent login link banega. Link WhatsApp par bhej dein. Link ki expiry nahi hai, sirf Counter se Delete/Regenerate hone par band hota hai.
      </div>
      <div style={{ background: 'var(--surface, #fff)', border: '1px solid var(--line)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Add Rider</div>
        <div style={{ display: 'grid', gap: 8 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={inp} />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone / WhatsApp" type="tel" style={inp} />
          <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="PIN (4–8 digits)" type="password" inputMode="numeric" style={inp} />
          <input value={area} onChange={e => setArea(e.target.value)} placeholder="Primary area (optional)" style={inp} />
          <button type="button" disabled={busy} onClick={createRider} style={{ ...btn, opacity: busy ? .6 : 1 }}>{busy ? 'Saving…' : 'Create Rider + Generate Link'}</button>
        </div>
      </div>
      {error && <div style={{ color: '#b45309', fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Riders ({riders.length})</div>
      <div style={{ display: 'grid', gap: 9 }}>
        {riders.map(r => {
          const link = r.link_token ? `${baseUrl}/rider/${restaurantId}/${r.link_token}` : ''
          return <div key={r.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, background: 'var(--surface, #fff)' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {r.photo_url ? <img src={r.photo_url} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--brand-soft)', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{(r.full_name || 'R')[0]}</div>}
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800 }}>{r.full_name}</div><div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.phone}{r.primary_area ? ` · ${r.primary_area}` : ''}</div><div style={{ fontSize: 11, fontWeight: 800, marginTop: 3 }}>{r.duty_status} · {r.deliveries_completed_count || 0} deliveries{r.avg_rating != null ? ` · ★ ${r.avg_rating}` : ''}</div></div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {r.duty_status === 'OFF_DUTY' ? <button type="button" onClick={() => setDuty(r.id, 'AVAILABLE')} style={miniBtn}>Set ON DUTY</button> : r.duty_status === 'AVAILABLE' ? <button type="button" onClick={() => setDuty(r.id, 'OFF_DUTY')} style={miniBtn}>Set OFF DUTY</button> : null}
              {link ? <button type="button" onClick={() => copyLink(r.link_token)} style={miniBtn}>Copy Link</button> : <button type="button" onClick={() => regenerate(r.id)} style={miniBtn}>Generate Link</button>}
              {link && <button type="button" onClick={() => deleteLink(r.id)} style={{ ...miniBtn, color: '#b91c1c' }}>Delete Link</button>}
              <button type="button" onClick={() => regenerate(r.id)} style={miniBtn}>Regenerate</button>
              <button type="button" onClick={() => deactivate(r.id)} style={{ ...miniBtn, color: '#b91c1c' }}>Deactivate</button>
            </div>
            {link && <div style={{ marginTop: 7, fontSize: 10, color: '#78716c', wordBreak: 'break-all' }}>{link}</div>}
          </div>
        })}
        {riders.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Abhi koi rider nahi.</div>}
      </div>
    </div>
  )
}

const inp = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line, #e7e5e4)', fontSize: 14, boxSizing: 'border-box' }
const btn = { border: 'none', borderRadius: 999, padding: '10px 16px', background: 'var(--brand-primary, #1c1917)', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }
const miniBtn = { border: '1px solid var(--line)', borderRadius: 8, padding: '6px 9px', background: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }
