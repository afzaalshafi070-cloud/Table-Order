import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { applyTheme } from '../utils/theme.js'
import NotFound from './NotFound.jsx'

/**
 * Rider opens /rider/:restaurantId/:secret/:areaName once at shift start.
 * Listens for new delivery orders in that area → big alert + Maps link.
 */
export default function RiderPortal() {
  const { restaurantId, secret, areaName: areaEnc } = useParams()
  const areaName = decodeURIComponent(areaEnc || '')

  const [state, setState] = useState('loading') // loading | ready | invalid
  const [restaurant, setRestaurant] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [alertOrder, setAlertOrder] = useState(null)
  const [recent, setRecent] = useState([])
  const seenRef = useRef(new Set())
  const audioRef = useRef(null)

  useEffect(() => {
    if (!restaurantId || !secret || !areaName) {
      setState('invalid')
      return
    }
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, is_active, restaurant_name, logo_url, theme')
        .eq('restaurant_id', restaurantId)
        .eq('qr_secret', secret)
        .eq('is_active', true)
        .maybeSingle()
      if (cancelled) return
      if (error || !data) {
        setState('invalid')
        return
      }
      setSessionId(data.id)
      setRestaurant(data)
      applyTheme(data.theme)
      setState('ready')
    })()
    return () => { cancelled = true }
  }, [restaurantId, secret, areaName])

  // Realtime + initial fetch for delivery orders in this area
  useEffect(() => {
    if (!sessionId) return

    const pull = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('session_id', sessionId)
        .eq('fulfillment', 'delivery')
        .eq('area_name', areaName)
        .in('status', ['pending', 'cooking'])
        .order('created_at', { ascending: false })
        .limit(20)
      const rows = data || []
      setRecent(rows)
      // First load: mark existing as seen (don't alert historical)
      rows.forEach(o => seenRef.current.add(o.id))
    }
    pull()

    const channel = supabase
      .channel(`rider-${sessionId}-${areaName}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          const o = payload.new
          if (!o || o.fulfillment !== 'delivery') return
          if (o.area_name !== areaName) return
          if (seenRef.current.has(o.id)) return
          seenRef.current.add(o.id)
          setRecent(prev => [o, ...prev.filter(x => x.id !== o.id)])
          setAlertOrder(o)
          try {
            if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400])
            // Loud-ish beep via Web Audio
            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.frequency.value = 880
            gain.gain.value = 0.3
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.start()
            setTimeout(() => { osc.stop(); ctx.close() }, 800)
          } catch { /* ignore */ }
          try {
            if (Notification.permission === 'granted') {
              new Notification(`${restaurant?.restaurant_name || 'Restaurant'} — New delivery`, {
                body: `${areaName}: ${o.customer_address || o.customer_name || 'New order'}`,
              })
            } else if (Notification.permission !== 'denied') {
              Notification.requestPermission()
            }
          } catch { /* ignore */ }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId, areaName, restaurant?.restaurant_name])

  // Auto-dismiss alert after 15s
  useEffect(() => {
    if (!alertOrder) return
    const t = setTimeout(() => setAlertOrder(null), 15000)
    return () => clearTimeout(t)
  }, [alertOrder])

  if (state === 'loading') {
    return <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>Connecting rider…</div>
  }
  if (state === 'invalid') {
    return <NotFound message="Rider link invalid or shift closed. Ask counter for a fresh Area QR." />
  }

  const mapsUrl = (order) => {
    const dest = order.customer_address || ''
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`
  }

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
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.8 }}>Rider · {areaName}</div>
        </div>
        <div style={{
          background: 'var(--sage)', color: '#fff', borderRadius: 999,
          padding: '4px 10px', fontSize: 11, fontWeight: 700
        }}>ONLINE</div>
      </header>

      <div style={{ padding: 16, fontSize: 13, color: '#7a7264' }}>
        Page open rakhein. Is area ki delivery yahan aayegi.
      </div>

      <div style={{ padding: '0 16px 80px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {recent.length === 0 && (
          <div style={{ textAlign: 'center', color: '#9a9284', padding: 40 }}>Waiting for deliveries…</div>
        )}
        {recent.map(o => (
          <div key={o.id} style={{
            background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 14
          }}>
            <div style={{ fontWeight: 700, color: 'var(--clay)' }}>DELIVERY</div>
            <div style={{ marginTop: 4, fontSize: 14 }}>{o.customer_name} · {o.customer_phone}</div>
            <div style={{ fontSize: 13, color: '#5a5346' }}>{o.customer_address}</div>
            <div style={{ fontFamily: 'var(--mono)', marginTop: 6 }}>PKR {Number(o.total).toFixed(0)} · {o.status}</div>
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
          }}>Area: {areaName}</div>
          <div style={{ marginTop: 16, fontSize: 15 }}>{alertOrder.customer_name}</div>
          <div style={{ fontSize: 14, opacity: 0.85 }}>{alertOrder.customer_phone}</div>
          <div style={{ fontSize: 14, marginTop: 6, maxWidth: 280 }}>{alertOrder.customer_address}</div>
          <div style={{ fontFamily: 'var(--mono)', marginTop: 12, fontSize: 18 }}>
            PKR {Number(alertOrder.total).toFixed(0)}
          </div>
          <p style={{ marginTop: 20, fontSize: 13, opacity: 0.7 }}>Counter se food + slip lein</p>
          <a
            href={mapsUrl(alertOrder)}
            target="_blank"
            rel="noreferrer"
            onClick={() => setAlertOrder(null)}
            style={{
              marginTop: 16, background: 'var(--sky)', color: '#fff', borderRadius: 999,
              padding: '14px 28px', fontWeight: 700, textDecoration: 'none'
            }}
          >
            Open Google Maps route
          </a>
          <button onClick={() => setAlertOrder(null)} style={{
            marginTop: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff', borderRadius: 999, padding: '10px 20px'
          }}>Dismiss</button>
        </div>
      )}
    </div>
  )
}
