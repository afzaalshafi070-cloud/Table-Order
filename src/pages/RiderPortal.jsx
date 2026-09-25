import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { applyTheme } from '../utils/theme.js'
import NotFound from './NotFound.jsx'
import { ensureAnonymousAuth } from '../utils/auth.js'

/** Heavy repeating beep + vibrate until stop() called */
function startHeavyAlarm(existingCtx = null) {
  let stopped = false
  let ctx = null
  let beepTimer = null
  let vibTimer = null

  const stop = () => {
    stopped = true
    if (beepTimer) clearInterval(beepTimer)
    if (vibTimer) clearInterval(vibTimer)
    // Keep a user-unlocked AudioContext alive for later alarms.
  }

  try {
    ctx = existingCtx || new (window.AudioContext || window.webkitAudioContext)()
    const ensureRunning = () => {
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
    }
    ensureRunning()

    const beep = () => {
      if (stopped || !ctx) return
      try {
        ensureRunning()
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.value = 980
        gain.gain.value = 0.5
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start()
        setTimeout(() => { try { osc.stop() } catch {} }, 400)
      } catch {}
    }
    beep()
    beepTimer = setInterval(beep, 650)
    vibTimer = setInterval(() => {
      try {
        if (navigator.vibrate) navigator.vibrate([500, 120, 500, 120, 700])
      } catch {}
    }, 1100)
  } catch {}

  return stop
}

export default function RiderPortal() {
  const { restaurantId, secret, areaName: areaEnc } = useParams()
  const areaName = decodeURIComponent(areaEnc || '')
  const isAllAreas = areaName === '__all__' || areaName.toLowerCase() === 'all'
  const areaLabel = isAllAreas ? 'All Areas' : areaName

  const [state, setState] = useState('loading')
  const [restaurant, setRestaurant] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [alertOrder, setAlertOrder] = useState(null)
  const [rideList, setRideList] = useState([])
  const [gpsOk, setGpsOk] = useState(false)
  const [wakeOk, setWakeOk] = useState(false)
  const [alarmReady, setAlarmReady] = useState(false)
  const audioCtxRef = useRef(null)
  const seenRef = useRef(new Set())
  const stopAlarmRef = useRef(null)
  const restaurantRef = useRef(null)
  const wakeLockRef = useRef(null)

  useEffect(() => {
    restaurantRef.current = restaurant
  }, [restaurant])

  const stopAlarm = () => {
    if (stopAlarmRef.current) {
      stopAlarmRef.current()
      stopAlarmRef.current = null
    }
  }

  const enableAlarm = async () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext
      if (!Ctx) throw new Error('Audio API unavailable')
      if (!audioCtxRef.current) audioCtxRef.current = new Ctx()
      if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume()
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      gain.gain.value = 0.18
      osc.frequency.value = 880
      osc.connect(gain).connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.18)
      if (navigator.vibrate) navigator.vibrate([120, 80, 120])
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      setAlarmReady(true)
    } catch (e) {
      console.warn('Alarm enable failed:', e)
      setAlarmReady(false)
    }
  }

  const fireAlarm = (order) => {
    stopAlarm()
    stopAlarmRef.current = startHeavyAlarm(audioCtxRef.current)
    setAlertOrder(order)

    // Auto-stop alarm after 15 seconds
    setTimeout(() => {
      stopAlarm()
    }, 15000)

    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        const name = restaurantRef.current?.restaurant_name || 'Order'
        new Notification(`${name} — NEW DELIVERY`, {
          body: `${isAllAreas ? (order.area_name || 'All') : areaName}: ${order.customer_address || order.customer_name || ''}`,
          requireInteraction: true,
          tag: `delivery-${order.id}`,
        })
      }
    } catch {}
  }

  useEffect(() => {
    let released = false
    const requestWake = async () => {
      try {
        if (!('wakeLock' in navigator)) return
        const lock = await navigator.wakeLock.request('screen')
        if (released) {
          try { await lock.release() } catch {}
          return
        }
        wakeLockRef.current = lock
        setWakeOk(true)
        lock.addEventListener('release', () => {
          if (!released) setWakeOk(false)
        })
      } catch {
        setWakeOk(false)
      }
    }
    requestWake()

    const onVis = () => {
      if (document.visibilityState === 'visible') requestWake()
    }
    document.addEventListener('visibilitychange', onVis)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVis)
      try {
        if (wakeLockRef.current) wakeLockRef.current.release()
      } catch {}
      wakeLockRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!restaurantId || !secret || !areaName) { setState('invalid'); return }
    let cancelled = false
    ;(async () => {
      try {
        await ensureAnonymousAuth()
        const { data, error } = await supabase.rpc('rider_bootstrap', {
          p_restaurant_id: restaurantId,
          p_rider_secret: secret,
          p_area_name: areaName,
        })
        if (cancelled) return
        if (error || !data?.id) { setState('invalid'); return }
        setSessionId(data.id)
        setRestaurant(data)
        applyTheme(data.theme || {})
        setState('ready')
      } catch (e) {
        console.error('rider bootstrap', e)
        if (!cancelled) setState('invalid')
        return
      }
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
          Notification.requestPermission()
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [restaurantId, secret, areaName])

  useEffect(() => {
    if (!sessionId) return

    const matchesArea = (o) => {
      if (!o || o.fulfillment !== 'delivery') return false
      if (isAllAreas) return true
      return String(o.area_name) === String(areaName)
    }

    const pull = async (alarmOnNew = false) => {
      let q = supabase
        .from('orders')
        .select('*')
        .eq('session_id', sessionId)
        .eq('fulfillment', 'delivery')
        .in('status', ['pending', 'cooking'])
        .order('created_at', { ascending: false })
        .limit(30)
      if (!isAllAreas) q = q.eq('area_name', areaName)
      const { data } = await q
      const rows = data || []
      setRideList(rows)

      if (alarmOnNew) {
        for (const o of rows) {
          if (!seenRef.current.has(o.id)) {
            seenRef.current.add(o.id)
            fireAlarm(o)
            break
          }
        }
      } else {
        rows.forEach(o => seenRef.current.add(o.id))
      }
    }

    pull(false)

    const pollId = setInterval(() => {
      if (document.visibilityState === 'visible') pull(true)
    }, 12000)

    const onVisible = () => {
      if (document.visibilityState === 'visible') pull(true)
    }
    document.addEventListener('visibilitychange', onVisible)

    const channel = supabase
      .channel(`rider-${sessionId}-${areaName}-${Date.now()}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'orders',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const o = payload.new
        if (!matchesArea(o)) return
        if (seenRef.current.has(o.id)) return
        seenRef.current.add(o.id)
        setRideList(prev => [o, ...prev.filter(x => x.id !== o.id)])
        fireAlarm(o)
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const o = payload.new
        if (!matchesArea(o)) return
        if (o.status === 'served' || o.status === 'cancelled') {
          setRideList(prev => prev.filter(x => x.id !== o.id))
        } else {
          setRideList(prev => {
            const rest = prev.filter(x => x.id !== o.id)
            return [o, ...rest]
          })
        }
      })
      .subscribe()

    return () => {
      clearInterval(pollId)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(channel)
    }
  }, [sessionId, areaName, isAllAreas])

  useEffect(() => () => stopAlarm(), [])

  useEffect(() => {
    if (!sessionId || !navigator.geolocation) return
    const push = async (lat, lng) => {
      setGpsOk(true)
      await Promise.all(rideList.map(o =>
        supabase.rpc('rider_update_location', {
          p_order_id: o.id,
          p_lat: lat,
          p_lng: lng,
        })
      ))
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => push(pos.coords.latitude, pos.coords.longitude),
      () => setGpsOk(false),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [sessionId, areaName, isAllAreas, rideList])

  const dismissAlert = () => {
    stopAlarm()
    setAlertOrder(null)
  }

  if (state === 'loading') {
    return <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>Connecting rider…</div>
  }
  if (state === 'invalid') {
    return <NotFound message="Rider link invalid or shift closed. Ask counter for a fresh Area QR." />
  }

  const mapsUrl = (order) =>
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(order.customer_address || '')}&travelmode=driving`

  return (
    <div className="screen" style={{ background: 'var(--brand-paper-tint, var(--paper))' }}>
      <header style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--brand-ink)', color: '#fff'
      }}>
        {restaurant?.logo_url && (
          <img src={restaurant.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{restaurant?.restaurant_name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.8 }}>Rider · {areaLabel}</div>
        </div>
        <button onClick={enableAlarm} style={{
          background: alarmReady ? 'var(--sage)' : 'var(--clay)', color: '#fff', border: 'none',
          borderRadius: 999, padding: '6px 9px', fontSize: 10, fontWeight: 700
        }}>{alarmReady ? 'ALARM ON' : 'ENABLE ALARM'}</button>
        <div style={{ display: 'flex', gap: 6 }} >
          <div style={{
            background: wakeOk ? 'var(--sage)' : '#6b7280', color: '#fff', borderRadius: 999,
            padding: '4px 8px', fontSize: 10, fontWeight: 700
          }}>{wakeOk ? 'SCREEN ON' : 'LOCK?'}</div>
          <div style={{
            background: gpsOk ? 'var(--sage)' : 'var(--mustard)', color: '#fff', borderRadius: 999,
            padding: '4px 8px', fontSize: 10, fontWeight: 700
          }}>{gpsOk ? 'GPS ON' : 'GPS?'}</div>
        </div>
      </header>

      <div style={{ padding: 16, fontSize: 13, color: '#7a7264' }}>
        Page <b>open</b> rakhein (screen off na hone dein). Pehli dafa <b>ENABLE ALARM</b> zaroor press karein. Naya order → ring + vibrate + popup (alarm 15 second baad auto band).
        Background se wapas aate hi naye orders check ho jate hain.
      </div>

      <div style={{ padding: '0 16px 8px', fontWeight: 700, fontSize: 14 }}>Ride list</div>
      <div style={{ padding: '0 16px 80px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rideList.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9a9284', padding: 40 }}>Waiting for deliveries…</div>
        )}
        {rideList.map(o => (
          <div key={o.id} style={{
            background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 14
          }}>
            <div style={{ fontWeight: 700, color: 'var(--clay)' }}>DELIVERY · {o.status}{isAllAreas && o.area_name ? ` · ${o.area_name}` : ''}</div>
            <div style={{ marginTop: 4, fontSize: 14 }}>{o.customer_name} · {o.customer_phone}</div>
            <div style={{ fontSize: 13, color: '#5a5346' }}>{o.customer_address}</div>
            <div style={{ fontFamily: 'var(--mono)', marginTop: 6 }}>PKR {Number(o.total).toFixed(0)}</div>
            <a href={mapsUrl(o)} target="_blank" rel="noreferrer" style={{
              display: 'block', marginTop: 10, textAlign: 'center',
              background: 'var(--sky)', color: '#fff', borderRadius: 999,
              padding: '10px 0', fontWeight: 700, fontSize: 13, textDecoration: 'none'
            }}>Open route in Maps</a>
          </div>
        ))}
      </div>

      {alertOrder && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'var(--brand-ink)', color: '#fff',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 24, textAlign: 'center'
        }}>
          {restaurant?.logo_url && (
            <img src={restaurant.logo_url} alt="" style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'cover', marginBottom: 16 }} />
          )}
          <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 700 }}>NEW ORDER</div>
          <div style={{ fontSize: 18, marginTop: 8, opacity: 0.9 }}>{restaurant?.restaurant_name}</div>
          <div style={{
            marginTop: 20, background: 'var(--clay)', borderRadius: 12,
            padding: '12px 20px', fontWeight: 700, fontSize: 16
          }}>Area: {areaLabel}</div>
          <div style={{ marginTop: 16, fontSize: 15 }}>{alertOrder.customer_name}</div>
          <div style={{ fontSize: 14, opacity: 0.85 }}>{alertOrder.customer_phone}</div>
          <div style={{ fontSize: 14, marginTop: 6, maxWidth: 280 }}>{alertOrder.customer_address}</div>
          <div style={{ fontFamily: 'var(--mono)', marginTop: 12, fontSize: 18 }}>
            PKR {Number(alertOrder.total).toFixed(0)}
          </div>
          <p style={{ marginTop: 20, fontSize: 13, opacity: 0.7 }}>Counter se food + slip lein</p>
          <a href={mapsUrl(alertOrder)} target="_blank" rel="noreferrer" onClick={dismissAlert} style={{
            marginTop: 16, background: 'var(--sky)', color: '#fff', borderRadius: 999,
            padding: '14px 28px', fontWeight: 700, textDecoration: 'none'
          }}>Open Google Maps route</a>
          <button onClick={dismissAlert} style={{
            marginTop: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff', borderRadius: 999, padding: '10px 20px'
          }}>Dismiss (stop alarm)</button>
        </div>
      )}
    </div>
  )
}
