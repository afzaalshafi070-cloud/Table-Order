import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { ensureAnonymousAuth } from '../utils/auth.js'
import { applyTheme, applyBrandSurface, applyColorMode } from '../utils/theme.js'
import { uploadImage } from '../utils/uploadImage.js'

const SESSION_KEY = 'tableorder:riderPortalSession:v3'

function parseTheme(t) {
  if (!t) return {}
  if (typeof t === 'string') { try { return JSON.parse(t) || {} } catch { return {} } }
  return t
}

function alarmFor15Seconds(audioCtx) {
  let stopped = false
  let beepTimer = null
  let vibTimer = null
  const stop = () => {
    stopped = true
    if (beepTimer) clearInterval(beepTimer)
    if (vibTimer) clearInterval(vibTimer)
    try { navigator.vibrate?.(0) } catch {}
  }
  try {
    const ctx = audioCtx || new (window.AudioContext || window.webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const beep = () => {
      if (stopped) return
      try {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(740, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.18)
        gain.gain.setValueAtTime(0.0001, ctx.currentTime)
        gain.gain.exponentialRampToValueAtTime(0.32, ctx.currentTime + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.48)
        osc.connect(gain).connect(ctx.destination)
        osc.start()
        osc.stop(ctx.currentTime + 0.5)
      } catch {}
    }
    beep()
    beepTimer = setInterval(beep, 650)
    vibTimer = setInterval(() => {
      try { navigator.vibrate?.([500, 120, 500, 120, 700]) } catch {}
    }, 1100)
  } catch {}
  setTimeout(stop, 15000)
  return stop
}

export default function RiderApp() {
  const { restaurantId, linkToken } = useParams()
  const [phase, setPhase] = useState('boot')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rider, setRider] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [orders, setOrders] = useState([])
  const [showInfo, setShowInfo] = useState(false)
  const [edit, setEdit] = useState(null)
  const [infoBusy, setInfoBusy] = useState(false)
  const [alertReady, setAlertReady] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')
  const audioRef = useRef(null)
  const knownOrdersRef = useRef(new Set())
  const stopAlarmRef = useRef(null)

  const applyData = useCallback((data) => {
    setRider({
      id: data.rider_id,
      full_name: data.full_name,
      phone: data.phone,
      whatsapp: data.whatsapp || '',
      photo_url: data.photo_url || '',
      bike_number: data.bike_number || '',
      email: data.email || '',
      duty_status: data.duty_status,
      primary_area: data.primary_area || '',
      rating: data.avg_rating,
      rating_count: data.rating_count || 0,
      deliveries_completed_count: data.deliveries_completed_count || 0,
    })
    setRestaurant({
      restaurant_id: data.restaurant_id,
      restaurant_name: data.restaurant_name,
      logo_url: data.logo_url,
      theme: parseTheme(data.theme),
    })
    applyTheme(parseTheme(data.theme))
    applyBrandSurface(parseTheme(data.theme))
    applyColorMode('light')
    setPhase('ready')
  }, [])

  const savePortalToken = (token) => {
    // localStorage so pull-to-refresh / swipe refresh keeps the rider logged in
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ restaurant_id: restaurantId, link_token: linkToken, portal_token: token })) } catch {}
  }
  const readPortalToken = () => {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
      if (s?.restaurant_id === restaurantId && s?.link_token === linkToken && s?.portal_token) return s.portal_token
    } catch {}
    return null
  }
  const clearPortalToken = () => { try { localStorage.removeItem(SESSION_KEY) } catch {} }

  const enableAlerts = async () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (Ctx) {
        if (!audioRef.current) audioRef.current = new Ctx()
        if (audioRef.current.state === 'suspended') await audioRef.current.resume()
        const osc = audioRef.current.createOscillator()
        const gain = audioRef.current.createGain()
        gain.gain.value = 0.08
        osc.frequency.value = 880
        osc.connect(gain).connect(audioRef.current.destination)
        osc.start(); osc.stop(audioRef.current.currentTime + 0.15)
      }
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') await Notification.requestPermission()
      try { navigator.vibrate?.([100, 80, 100]) } catch {}
      setAlertReady(true)
      setAlertMessage('Order alerts enabled')
    } catch {
      setAlertMessage('Phone/browser ne audio permission allow nahi ki.')
    }
  }

  const fireOrderAlert = useCallback((order) => {
    if (stopAlarmRef.current) stopAlarmRef.current()
    stopAlarmRef.current = alarmFor15Seconds(audioRef.current)
    setAlertMessage(`NEW DELIVERY: ${order.customer_name || 'Customer'}`)
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(`${restaurant?.restaurant_name || 'Restaurant'} • New Delivery`, {
          body: `${order.area_name || ''} ${order.customer_address || ''}`.trim(),
          requireInteraction: true,
          tag: `rider-order-${order.id}`,
        })
      }
    } catch {}
  }, [restaurant?.restaurant_name])

  const loadOrders = useCallback(async (alertNew = true) => {
    const token = readPortalToken()
    if (!token) return
    const { data, error: err } = await supabase.rpc('rider_portal_list_orders', { p_portal_token: token })
    if (err || !Array.isArray(data)) return
    const next = data
    if (alertNew) {
      const fresh = next.find(o => !knownOrdersRef.current.has(o.id) && o.assignment_status === 'ASSIGNED')
      if (fresh) fireOrderAlert(fresh)
    }
    next.forEach(o => knownOrdersRef.current.add(o.id))
    setOrders(next)
  }, [fireOrderAlert])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await ensureAnonymousAuth()
        const token = readPortalToken()
        if (token) {
          const { data, error: err } = await supabase.rpc('rider_portal_resume', {
            p_restaurant_id: restaurantId,
            p_link_token: linkToken,
            p_portal_token: token,
          })
          if (!err && data?.ok) {
            if (!cancelled) applyData(data)
            return
          }
          clearPortalToken()
        }
        if (!cancelled) setPhase('login')
      } catch (e) {
        if (!cancelled) { setPhase('login'); setError(e?.message || '') }
      }
    })()
    return () => { cancelled = true }
  }, [restaurantId, linkToken, applyData])

  useEffect(() => {
    if (phase !== 'ready') return
    loadOrders(false)
    const id = setInterval(() => loadOrders(true), 5000)
    return () => clearInterval(id)
  }, [phase, loadOrders])

  useEffect(() => () => { if (stopAlarmRef.current) stopAlarmRef.current() }, [])

  const login = async (e) => {
    e?.preventDefault()
    if (!pin || pin.length < 4) { setError('PIN 4 digits ya zyada hona chahiye.'); return }
    setBusy(true); setError('')
    try {
      await ensureAnonymousAuth()
      const { data, error: err } = await supabase.rpc('rider_portal_login', {
        p_restaurant_id: restaurantId,
        p_link_token: linkToken,
        p_pin: pin.trim(),
      })
      if (err) throw err
      if (!data?.ok || !data?.portal_token) throw new Error('LOGIN_FAILED')
      savePortalToken(data.portal_token)
      applyData(data)
      setPin('')
      await enableAlerts()
    } catch (e2) {
      const m = String(e2?.message || '')
      setError(m.includes('INVALID_PIN') ? 'PIN ghalat hai.' : m.includes('LINK_REVOKED') ? 'Ye rider link delete ho chuka hai.' : 'Login nahi ho saka. Link ya PIN check karein.')
    } finally { setBusy(false) }
  }

  const setDuty = async (status) => {
    const token = readPortalToken()
    if (!token) return
    setBusy(true)
    try {
      const { data, error: err } = await supabase.rpc('rider_portal_set_duty', { p_portal_token: token, p_duty_status: status })
      if (err) throw err
      if (!data?.ok) throw new Error('DUTY_UPDATE_FAILED')
      setRider(prev => prev ? { ...prev, duty_status: status } : prev)
      await loadOrders(false)
    } catch (e) { setAlertMessage(e?.message || 'Duty update fail') }
    finally { setBusy(false) }
  }

  const acceptOrder = async (orderId) => {
    const token = readPortalToken(); if (!token) return
    const { data, error: err } = await supabase.rpc('rider_accept_order', { p_portal_token: token, p_order_id: orderId })
    if (err || !data?.ok) { setAlertMessage(err?.message || 'Order accept nahi hua.'); return }
    await loadOrders(false)
  }

  const delivered = async (orderId) => {
    const token = readPortalToken(); if (!token) return
    const { data, error: err } = await supabase.rpc('rider_portal_mark_delivered', { p_portal_token: token, p_order_id: orderId })
    if (err || !data?.ok) { setAlertMessage(err?.message || 'Delivery complete nahi hui.'); return }
    await loadOrders(false)
  }

  const saveInfo = async () => {
    const token = readPortalToken(); if (!token || !edit) return
    setInfoBusy(true); setAlertMessage('')
    try {
      let photoUrl = edit.photo_url || null
      if (edit.photoFile) {
        const ext = (edit.photoFile.name.split('.').pop() || 'jpg').toLowerCase()
        photoUrl = await uploadImage('rider-photos', `${rider.id}/${Date.now()}.${ext}`, edit.photoFile)
      }
      const { data, error: err } = await supabase.rpc('rider_portal_update_profile', {
        p_portal_token: token,
        p_full_name: edit.full_name.trim(),
        p_phone: edit.phone.trim(),
        p_whatsapp: edit.whatsapp.trim() || null,
        p_photo_url: photoUrl,
        p_bike_number: edit.bike_number.trim() || null,
        p_primary_area: edit.primary_area.trim() || null,
        p_email: edit.email.trim() || null,
      })
      if (err) throw err
      if (!data?.ok) throw new Error('PROFILE_UPDATE_FAILED')
      applyData(data)
      setShowInfo(false); setEdit(null); setAlertMessage('My Info updated')
    } catch (e) { setAlertMessage(e?.message || 'Info save nahi hui.') }
    finally { setInfoBusy(false) }
  }

  const logout = async () => {
    const token = readPortalToken()
    if (token) { try { await supabase.rpc('rider_portal_logout', { p_portal_token: token }) } catch {} }
    clearPortalToken()
    setRider(null); setOrders([]); setPhase('login')
  }

  if (phase === 'boot') return <div style={centerStyle}>Loading rider portal…</div>
  if (phase === 'login') {
    return (
      <div style={pageStyle}>
        <form onSubmit={login} style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={logoCircle}>{restaurant?.logo_url ? <img src={restaurant.logo_url} alt="" style={{ width: 64, height: 64, borderRadius: 18, objectFit: 'cover' }} /> : '🚴'}</div>
            <div style={{ fontWeight: 900, fontSize: 22, marginTop: 10 }}>Rider Login</div>
            <div style={{ color: 'var(--text-muted, #78716c)', fontSize: 13, marginTop: 4 }}>Sirf apna PIN enter karein</div>
          </div>
          <input autoFocus type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Rider PIN" style={inputStyle} />
          {error && <div style={errorStyle}>{error}</div>}
          <button disabled={busy} type="submit" style={primaryBtn}>{busy ? 'Logging in…' : 'Login'}</button>
          <div style={hintStyle}>Is link ko Counter ne aapko diya hai. Link permanent hai jab tak Counter se delete na kiya jaye.</div>
        </form>
      </div>
    )
  }

  const mapsUrl = (o) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.customer_address || '')}&travelmode=driving`
  const wa = String(rider.whatsapp || rider.phone || '').replace(/\D/g, '').replace(/^0/, '92')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--brand-paper-tint, #fafaf9)', color: 'var(--brand-ink, #1c1917)' }}>
      <header style={{ background: 'var(--brand-ink, #1c1917)', color: '#fff', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 20 }}>
        {rider.photo_url ? <img src={rider.photo_url} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover' }} /> : <div style={avatarStyle}>{(rider.full_name || 'R')[0]}</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rider.full_name}</div>
          <div style={{ fontSize: 11, opacity: .82 }}>{restaurant?.restaurant_name}{rider.bike_number ? ` · ${rider.bike_number}` : ''}</div>
        </div>
        <button type="button" onClick={() => { setEdit({ ...rider }); setShowInfo(true) }} style={iconBtn}>👤<span>My Info</span></button>
      </header>

      <main style={{ padding: 14, maxWidth: 620, margin: '0 auto' }}>
        <div style={{ background: 'var(--surface-elevated, #fff)', borderRadius: 16, border: '1px solid var(--border, #e7e5e4)', padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={busy} onClick={() => setDuty('AVAILABLE')} style={{ ...dutyBtn, background: rider.duty_status === 'AVAILABLE' ? 'var(--brand-primary, #059669)' : 'var(--brand-soft, #f5f5f4)', color: rider.duty_status === 'AVAILABLE' ? 'var(--brand-primary-text, #fff)' : 'var(--text-secondary, #44403c)' }}>ON DUTY</button>
            <button type="button" disabled={busy} onClick={() => setDuty('OFF_DUTY')} style={{ ...dutyBtn, background: rider.duty_status === 'OFF_DUTY' ? 'var(--brand-ink, #57534e)' : 'var(--brand-soft, #f5f5f4)', color: rider.duty_status === 'OFF_DUTY' ? 'var(--dark-ink, #fff)' : 'var(--text-secondary, #44403c)' }}>OFF DUTY</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted, #78716c)' }}>Status: <b>{rider.duty_status}</b>{rider.primary_area ? ` · ${rider.primary_area}` : ''}</div>
          <button type="button" onClick={enableAlerts} style={{ marginTop: 10, border: '1px solid var(--border, #d6d3d1)', background: 'var(--surface-elevated, #fff)', borderRadius: 999, padding: '7px 11px', fontSize: 11, fontWeight: 800 }}>🔔 {alertReady ? 'Alerts enabled' : 'Enable alerts'}</button>
          {alertMessage && <div style={{ marginTop: 8, fontSize: 12, color: '#166534', fontWeight: 700 }}>{alertMessage}</div>}
        </div>

        <div style={{ fontWeight: 900, fontSize: 17, margin: '16px 0 9px' }}>My Deliveries</div>
        {orders.length === 0 ? <div style={{ background: 'var(--surface-elevated, #fff)', border: '1px solid var(--border, #e7e5e4)', borderRadius: 14, padding: 28, textAlign: 'center', color: '#a8a29e' }}>{rider.duty_status === 'AVAILABLE' ? 'Waiting for new delivery orders…' : 'OFF DUTY — new orders nahi aayenge.'}</div> : orders.map(o => (
          <div key={o.id} style={{ background: 'var(--surface-elevated, #fff)', border: '1px solid var(--border, #e7e5e4)', borderRadius: 14, padding: 14, marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b style={{ color: 'var(--brand-primary-dark, #b45309)' }}>DELIVERY</b><span style={{ fontSize: 11, fontWeight: 800 }}>{o.assignment_status || 'ASSIGNED'}</span></div>
            <div style={{ marginTop: 8, fontWeight: 800 }}>{o.customer_name || 'Customer'} · {o.customer_phone || ''}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary, #57534e)', marginTop: 4 }}>{o.customer_address || 'Address unavailable'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted, #78716c)', marginTop: 5 }}>{o.area_name || 'Area'} · {o.branch_name || 'Branch'}</div>
            <div style={{ fontFamily: 'monospace', marginTop: 7, fontWeight: 800 }}>PKR {Number(o.total || 0).toFixed(0)}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <a href={mapsUrl(o)} target="_blank" rel="noreferrer" style={{ ...actionBtn, background: 'var(--brand-accent, #0ea5e9)' }}>📍 Maps</a>
              {o.customer_phone && <a href={`tel:${o.customer_phone}`} style={{ ...actionBtn, background: 'var(--brand-secondary, #059669)' }}>📞 Call</a>}
              {wa && <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" style={{ ...actionBtn, background: 'var(--brand-secondary, #16a34a)' }}>WhatsApp</a>}
            </div>
            {o.assignment_status === 'ASSIGNED' && <button type="button" onClick={() => acceptOrder(o.id)} style={{ ...primaryBtn, marginTop: 9 }}>Accept Delivery</button>}
            {['ACCEPTED','PICKING_UP','OUT_FOR_DELIVERY'].includes(o.assignment_status) && <button type="button" onClick={() => delivered(o.id)} style={{ ...primaryBtn, marginTop: 9, background: 'var(--brand-ink, #111827)' }}>Mark Delivered</button>}
          </div>
        ))}

        <button type="button" onClick={logout} style={{ width: '100%', margin: '18px 0 30px', padding: 11, borderRadius: 999, border: '1px solid var(--border, #d6d3d1)', background: 'var(--surface-elevated, #fff)', fontWeight: 800 }}>Logout</button>
      </main>

      {showInfo && edit && <div style={overlay} onClick={() => setShowInfo(false)}>
        <div style={modalStyle} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><b style={{ fontSize: 18 }}>My Info</b><button type="button" onClick={() => setShowInfo(false)} style={closeBtn}>×</button></div>
          <label style={labelStyle}>Photo</label>
          {edit.photo_url && <img src={edit.photo_url} alt="" style={{ width: 76, height: 76, borderRadius: 16, objectFit: 'cover', marginBottom: 8 }} />}
          <input type="file" accept="image/*" onChange={e => setEdit(x => ({ ...x, photoFile: e.target.files?.[0] || null }))} style={{ ...inputStyle, padding: 8 }} />
          <label style={labelStyle}>Full name</label><input value={edit.full_name || ''} onChange={e => setEdit(x => ({ ...x, full_name: e.target.value }))} style={inputStyle} />
          <label style={labelStyle}>Phone</label><input value={edit.phone || ''} onChange={e => setEdit(x => ({ ...x, phone: e.target.value }))} style={inputStyle} />
          <label style={labelStyle}>WhatsApp number</label><input value={edit.whatsapp || ''} onChange={e => setEdit(x => ({ ...x, whatsapp: e.target.value }))} style={inputStyle} placeholder="03XXXXXXXXX" />
          <label style={labelStyle}>Bike number</label><input value={edit.bike_number || ''} onChange={e => setEdit(x => ({ ...x, bike_number: e.target.value }))} style={inputStyle} placeholder="LEA-1234" />
          <label style={labelStyle}>Primary area</label><input value={edit.primary_area || ''} onChange={e => setEdit(x => ({ ...x, primary_area: e.target.value }))} style={inputStyle} />
          <label style={labelStyle}>Email (optional)</label><input value={edit.email || ''} onChange={e => setEdit(x => ({ ...x, email: e.target.value }))} style={inputStyle} />
          <button type="button" disabled={infoBusy} onClick={saveInfo} style={{ ...primaryBtn, marginTop: 6 }}>{infoBusy ? 'Saving…' : 'Save Info'}</button>
        </div>
      </div>}
    </div>
  )
}

const pageStyle = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--brand-paper-tint, #f5f5f4)' }
const centerStyle = { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--brand-paper-tint, #fafaf9)' }
const cardStyle = { width: '100%', maxWidth: 360, background: 'var(--surface-elevated, #fff)', borderRadius: 18, padding: 24, border: '1px solid var(--border, #e7e5e4)', boxShadow: '0 10px 30px rgba(0,0,0,.07)' }
const logoCircle = { width: 76, height: 76, margin: '0 auto', borderRadius: 22, background: 'var(--brand-soft, #f5f5f4)', display: 'grid', placeItems: 'center', fontSize: 34 }
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '12px 13px', borderRadius: 10, border: '1px solid var(--border, #d6d3d1)', margin: '5px 0 10px', fontSize: 15, background: 'var(--surface-elevated, #fff)', color: 'var(--brand-ink, #1c1917)' }
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 800, marginTop: 4, color: 'var(--text-secondary, #57534e)' }
const primaryBtn = { width: '100%', border: 'none', borderRadius: 999, padding: '12px 14px', background: 'var(--brand-primary, #1c1917)', color: 'var(--brand-primary-text, #fff)', fontWeight: 900, fontSize: 14 }
const errorStyle = { background: '#fef2f2', color: '#b91c1c', borderRadius: 9, padding: 9, fontSize: 12, marginBottom: 8 }
const hintStyle = { fontSize: 11, color: 'var(--text-muted, #a8a29e)', lineHeight: 1.45, marginTop: 12, textAlign: 'center' }
const avatarStyle = { width: 46, height: 46, borderRadius: '50%', background: 'rgba(255,255,255,.12)', display: 'grid', placeItems: 'center', fontWeight: 900 }
const iconBtn = { border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.08)', color: '#fff', borderRadius: 12, padding: '7px 9px', fontSize: 11, fontWeight: 800 }
const dutyBtn = { flex: 1, border: 'none', borderRadius: 12, padding: '13px 8px', fontWeight: 900, fontSize: 14 }
const actionBtn = { flex: 1, textAlign: 'center', color: '#fff', textDecoration: 'none', borderRadius: 999, padding: '9px 6px', fontWeight: 800, fontSize: 12 }
const overlay = { position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, overflowY: 'auto' }
const modalStyle = { width: '100%', maxWidth: 500, maxHeight: '92vh', overflowY: 'auto', background: 'var(--surface-elevated, #fff)', borderRadius: 18, padding: 18, boxSizing: 'border-box' }
const closeBtn = { width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--border, #d6d3d1)', background: 'var(--surface-elevated, #fff)', fontSize: 20 }
