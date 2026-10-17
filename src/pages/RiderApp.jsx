import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { ensureAnonymousAuth } from '../utils/auth.js'
import { applyTheme, applyBrandSurface, applyColorMode } from '../utils/theme.js'
import { uploadImage } from '../utils/uploadImage.js'
import { motion, useReducedMotion } from 'framer-motion'
import { Input, EmptyState } from '../components/ui/index.js'
import {
  RippleButton, DutySwitch, DeliveryCard, Sheet, SuccessBurst, RiderSkeleton,
  StatusBadge, itemsSummary, listVariants, EASE_OUT,
} from '../components/rider/RiderUi.jsx'

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
  const [selectedId, setSelectedId] = useState(null)
  const [celebrate, setCelebrate] = useState(false)
  const [listReady, setListReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const reduceMotion = useReducedMotion()

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
    if (err || !Array.isArray(data)) { setLoadError('Deliveries load nahi huin. Dobara try karein.'); setListReady(true); return }
    setLoadError(''); setListReady(true)
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

  useEffect(() => {
    if (!celebrate) return
    const t = setTimeout(() => setCelebrate(false), 2600)
    return () => clearTimeout(t)
  }, [celebrate])

  // Safety net: never render the dashboard without rider data.
  useEffect(() => {
    if (phase === 'ready' && !rider) setPhase('login')
  }, [phase, rider])

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
    setSelectedId(null)
    setCelebrate(true)
    await loadOrders(false)
  }

  const saveInfo = async () => {
    const token = readPortalToken(); if (!token || !edit) return
    setInfoBusy(true); setAlertMessage('')
    try {
      let photoUrl = edit.photo_url || null
      if (edit.photoFile) {
        const ext = (edit.photoFile.name.split('.').pop() || 'jpg').toLowerCase()
        photoUrl = await uploadImage('rider-photos', `${rider?.id}/${Date.now()}.${ext}`, edit.photoFile)
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


  const mapsUrl = (o) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.customer_address || '')}&travelmode=driving`
  // WhatsApp targets the CUSTOMER number (the original linked the rider's own number).
  const toWa = (p) => String(p || '').replace(/\D/g, '').replace(/^0/, '92')
  const onDuty = rider?.duty_status === 'AVAILABLE'
  const selectedOrder = orders.find(o => o.id === selectedId) || null
  const openInfo = () => { setEdit({ ...rider }); setShowInfo(true) }

  const contactRow = (o) => (
    <div className="rdr-actions">
      {o.customer_phone && (
        <a href={`tel:${o.customer_phone}`} className="rdr-action rdr-action--call" aria-label="Call customer">
          <span className="rdr-action__icon" aria-hidden="true">📞</span>Call
        </a>
      )}
      <a href={mapsUrl(o)} target="_blank" rel="noreferrer" className="rdr-action rdr-action--map" aria-label="Open map directions">
        <span className="rdr-action__icon" aria-hidden="true">🗺️</span>Map
      </a>
      {toWa(o.customer_phone) && (
        <a href={`https://wa.me/${toWa(o.customer_phone)}`} target="_blank" rel="noreferrer" className="rdr-action rdr-action--wa" aria-label="WhatsApp customer">
          <span className="rdr-action__icon" aria-hidden="true">💬</span>WhatsApp
        </a>
      )}
    </div>
  )

  const renderDetail = (o) => {
    const items = itemsSummary(o.items)
    const st = o.assignment_status || 'ASSIGNED'
    return (
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div className="rdr-card__name">{o.customer_name || 'Customer'}</div>
          <StatusBadge status={st} />
        </div>
        {o.customer_phone && <div style={{ fontWeight: 700 }}>{o.customer_phone}</div>}
        <div>
          <div className="rdr-section-label">Address</div>
          <div className="rdr-card__addr">{o.customer_address || 'Address unavailable'}</div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 4 }}>{o.area_name || 'Area'} · {o.branch_name || 'Branch'}</div>
        </div>
        <div>
          <div className="rdr-section-label">Items</div>
          {items.length > 0
            ? <ul className="rdr-items">{items.map((it, i) => <li key={`${it.name}-${i}`}><span>{it.qty}× {it.name}</span></li>)}</ul>
            : <div className="rdr-card__addr">Items detail available nahi.</div>}
        </div>
        <div className="rdr-card__foot"><span>Total</span><span className="rdr-money">PKR {Number(o.total || 0).toFixed(0)}</span></div>
        {contactRow(o)}
        {st === 'ASSIGNED' && <RippleButton variant="primary" disabled={busy} onClick={() => acceptOrder(o.id)}>Accept delivery</RippleButton>}
        {['ACCEPTED', 'PICKING_UP', 'OUT_FOR_DELIVERY'].includes(st) && <RippleButton variant="success" disabled={busy} onClick={() => delivered(o.id)}>✓ Mark delivered</RippleButton>}
        {alertMessage && <div className="rdr-alert" role="status">{alertMessage}</div>}
      </div>
    )
  }

  if (phase === 'boot') {
    return (
      <div className="rdr-page" role="status" aria-label="Loading rider portal">
        <RiderSkeleton />
      </div>
    )
  }

  if (phase === 'login') {
    return (
      <motion.div
        className="rdr-page rdr-page--center"
        initial={reduceMotion ? false : { opacity: 0, x: 28 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
      >
        <form onSubmit={login} className="rdr-login" aria-labelledby="rider-login-title">
          <div className="rdr-login__logo">
            {restaurant?.logo_url
              ? <img src={restaurant.logo_url} alt={`${restaurant.restaurant_name || 'Restaurant'} logo`} />
              : <span aria-hidden="true">🚴</span>}
          </div>
          <h1 id="rider-login-title" className="rdr-login__title">Rider login</h1>
          <p className="rdr-login__lead">Sirf apna PIN enter karein</p>
          <Input
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="Rider PIN"
            aria-label="Rider PIN"
            disabled={busy}
          />
          {error && <div className="rdr-error" role="alert">{error}</div>}
          <RippleButton type="submit" variant="primary" disabled={busy}>{busy ? 'Logging in…' : 'Login'}</RippleButton>
          <p className="rdr-hint">Is link ko Counter ne aapko diya hai. Link permanent hai jab tak Counter se delete na kiya jaye.</p>
        </form>
      </motion.div>
    )
  }

  if (!rider) {
    return (
      <div className="rdr-page" role="status" aria-label="Loading rider data">
        <RiderSkeleton />
      </div>
    )
  }

  const emptyText = onDuty ? 'Naye orders yahan apne aap aayenge.' : 'Aap off duty hain. Duty on karein to naye orders aayenge.'

  return (
    <motion.div
      className="rdr-page"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
    >
      <header className="rdr-header">
        <div className="rdr-avatar" aria-hidden="true">
          {rider?.photo_url ? <img src={rider.photo_url} alt="" /> : (rider?.full_name || 'R')[0]}
        </div>
        <div className="rdr-header__text">
          <div className="rdr-header__name">{rider?.full_name}</div>
          <div className="rdr-header__sub">{restaurant?.restaurant_name}{rider?.bike_number ? ` · ${rider.bike_number}` : ''}</div>
        </div>
        <button type="button" className="rdr-btn rdr-btn--ghost rdr-btn--icon" onClick={openInfo}>👤 My info</button>
      </header>

      <main className="rdr-main" style={{ padding: 'var(--space-4)', paddingBottom: 'var(--space-10)', display: 'grid', gap: 'var(--space-4)' }}>
        <DutySwitch
          on={onDuty}
          disabled={busy}
          onToggle={(next) => setDuty(next ? 'AVAILABLE' : 'OFF_DUTY')}
          label={onDuty ? 'On duty' : 'Off duty'}
          meta={`Status: ${rider?.duty_status || '—'}${rider?.primary_area ? ` · ${rider.primary_area}` : ''}`}
        />

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button type="button" className="rdr-btn rdr-btn--ghost rdr-btn--icon" onClick={enableAlerts}>
            🔔 {alertReady ? 'Alerts enabled' : 'Enable alerts'}
          </button>
          <button type="button" className="rdr-btn rdr-btn--ghost rdr-btn--icon" onClick={() => loadOrders(false)}>
            ↻ Refresh
          </button>
        </div>
        {alertMessage && <div className="rdr-alert" role="status">{alertMessage}</div>}

        <section aria-labelledby="rdr-deliveries-title">
          <div className="rdr-section-head">
            <h2 id="rdr-deliveries-title" className="rdr-section-title">My deliveries</h2>
            {listReady && <span className="ui-badge ui-badge--neutral">{orders.length}</span>}
          </div>

          {!listReady && <RiderSkeleton />}

          {listReady && loadError && orders.length === 0 && (
            <div className="rdr-card" role="alert" style={{ textAlign: 'center', cursor: 'default', justifyItems: 'center' }}>
              <div className="rdr-card__name">Load nahi ho saka</div>
              <div className="rdr-card__addr">{loadError}</div>
              <RippleButton variant="primary" onClick={() => loadOrders(false)}>Retry</RippleButton>
            </div>
          )}

          {listReady && !loadError && orders.length === 0 && (
            <EmptyState
              icon="🛵"
              title="Abhi koi delivery nahi hai"
              description={emptyText}
              action={<RippleButton variant="ghost" className="rdr-btn--icon" onClick={() => loadOrders(false)}>↻ Refresh</RippleButton>}
            />
          )}

          {listReady && orders.length > 0 && (
            <motion.div className="rdr-list" variants={listVariants} initial="hidden" animate="show">
              {orders.map(o => (
                <DeliveryCard
                  key={o.id}
                  order={o}
                  mapsUrl={mapsUrl(o)}
                  waNumber={toWa(o.customer_phone)}
                  busy={busy}
                  reduceMotion={reduceMotion}
                  onOpen={(order) => setSelectedId(order.id)}
                  onAccept={acceptOrder}
                  onDelivered={delivered}
                />
              ))}
            </motion.div>
          )}
        </section>

        <button type="button" className="rdr-btn rdr-btn--ghost" onClick={logout}>Logout</button>
      </main>

      <Sheet open={!!selectedOrder} onClose={() => setSelectedId(null)} title="Delivery details">
        {selectedOrder && renderDetail(selectedOrder)}
      </Sheet>

      <Sheet open={showInfo && !!edit} onClose={() => setShowInfo(false)} title="My info" variant="bottom">
        {edit && (
          <form
            onSubmit={(e) => { e.preventDefault(); saveInfo() }}
            style={{ display: 'grid', gap: 'var(--space-3)' }}
          >
            <div className="ui-field">
              <label className="ui-field__label" htmlFor="rdr-info-photo">Photo</label>
              {edit.photo_url && <img src={edit.photo_url} alt="Current profile" style={{ width: 76, height: 76, borderRadius: 16, objectFit: 'cover' }} />}
              <input id="rdr-info-photo" type="file" accept="image/*" className="ui-input"
                onChange={e => setEdit(x => ({ ...x, photoFile: e.target.files?.[0] || null }))} />
            </div>
            <Input label="Full name" value={edit.full_name || ''} onChange={e => setEdit(x => ({ ...x, full_name: e.target.value }))} />
            <Input label="Phone" inputMode="tel" value={edit.phone || ''} onChange={e => setEdit(x => ({ ...x, phone: e.target.value }))} />
            <Input label="WhatsApp number" placeholder="03XXXXXXXXX" inputMode="tel" value={edit.whatsapp || ''} onChange={e => setEdit(x => ({ ...x, whatsapp: e.target.value }))} />
            <Input label="Bike number" placeholder="LEA-1234" value={edit.bike_number || ''} onChange={e => setEdit(x => ({ ...x, bike_number: e.target.value }))} />
            <Input label="Primary area" value={edit.primary_area || ''} onChange={e => setEdit(x => ({ ...x, primary_area: e.target.value }))} />
            <Input label="Email (optional)" type="email" value={edit.email || ''} onChange={e => setEdit(x => ({ ...x, email: e.target.value }))} />
            {alertMessage && <div className="rdr-alert" role="status">{alertMessage}</div>}
            <RippleButton type="submit" variant="primary" disabled={infoBusy}>{infoBusy ? 'Saving…' : 'Save info'}</RippleButton>
          </form>
        )}
      </Sheet>

      <SuccessBurst show={celebrate} title="Delivery complete" onDone={() => setCelebrate(false)} />
    </motion.div>
  )
}
