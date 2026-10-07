import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { ensureAnonymousAuth } from '../utils/auth.js'
import { applyTheme, applyBrandSurface, applyColorMode } from '../utils/theme.js'

const STORAGE_KEY = 'rider_pin_session_v1'

export default function RiderApp() {
  const { restaurantId } = useParams()
  const [phase, setPhase] = useState('boot') // boot | login | ready
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [rider, setRider] = useState(null)
  const [restaurant, setRestaurant] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [orders, setOrders] = useState([])

  const applyData = (data) => {
    setRider({
      id: data.rider_id,
      full_name: data.full_name,
      phone: data.phone,
      photo_url: data.photo_url,
      duty_status: data.duty_status,
      primary_area: data.primary_area,
    })
    setSessionId(data.session_id)
    setRestaurant({
      restaurant_id: data.restaurant_id,
      restaurant_name: data.restaurant_name,
      logo_url: data.logo_url,
      theme: data.theme,
    })
    applyTheme(data.theme || {})
    applyBrandSurface(data.theme || {})
    applyColorMode('light')
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        restaurant_id: data.restaurant_id,
        phone: data.phone,
        rider_id: data.rider_id,
      }))
    } catch {}
    setPhase('ready')
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await ensureAnonymousAuth()
        let saved = null
        try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') } catch {}
        if (saved?.phone && saved?.restaurant_id && restaurantId
            && saved.restaurant_id === restaurantId) {
          setPhone(saved.phone)
        }
        if (!cancelled) setPhase('login')
      } catch {
        if (!cancelled) setPhase('login')
      }
    })()
    return () => { cancelled = true }
  }, [restaurantId])

  useEffect(() => {
    if (phase !== 'ready' || !sessionId || !rider?.id) return
    const load = async () => {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .eq('session_id', sessionId)
        .eq('fulfillment', 'delivery')
        .in('status', ['pending', 'cooking'])
        .order('created_at', { ascending: false })
        .limit(30)
      const list = (data || []).filter(o =>
        !o.assigned_rider_id || o.assigned_rider_id === rider.id
      )
      setOrders(list)
    }
    load()
    const id = setInterval(load, 12000)
    return () => clearInterval(id)
  }, [phase, sessionId, rider?.id])

  const login = async () => {
    if (!restaurantId) {
      setError('Restaurant ID missing — Counter se sahi link use karein')
      return
    }
    if (!phone.trim() || pin.length < 4) {
      setError('Phone aur PIN (4+) zaroori')
      return
    }
    setBusy(true)
    setError('')
    try {
      await ensureAnonymousAuth()
      const { data, error: err } = await supabase.rpc('rider_login_pin', {
        p_restaurant_id: restaurantId,
        p_phone: phone.trim(),
        p_pin: pin.trim(),
      })
      if (err) throw err
      if (!data?.ok && !data?.rider_id) throw new Error('Login fail')
      applyData(data)
      setPin('')
    } catch (e) {
      setError(e?.message || 'Login fail')
    } finally {
      setBusy(false)
    }
  }

  const setDuty = async (status) => {
    if (!rider?.id) return
    try {
      const { error: err } = await supabase.rpc('rider_set_duty_status', {
        p_rider_id: rider.id,
        p_duty_status: status,
      })
      if (err) throw err
      setRider(prev => prev ? { ...prev, duty_status: status } : prev)
    } catch (e) {
      alert(e?.message || 'Duty update fail')
    }
  }

  const logout = () => {
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
    setRider(null)
    setSessionId(null)
    setOrders([])
    setPhase('login')
  }

  if (phase === 'boot') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading…
      </div>
    )
  }

  if (phase === 'login') {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, background: '#f5f5f4'
      }}>
        <div style={{
          width: '100%', maxWidth: 360, background: '#fff', borderRadius: 16,
          padding: 24, border: '1px solid #e7e5e4', boxShadow: '0 8px 24px rgba(0,0,0,0.06)'
        }}>
          <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 4 }}>Rider Login</div>
          <div style={{ fontSize: 13, color: '#78716c', marginBottom: 16 }}>
            Counter pe jo phone + PIN set hua tha, wahi yahan lagao.
          </div>
          {!restaurantId && (
            <div style={{ background: '#fef3c7', padding: 10, borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
              Link incomplete. Counter se app link copy karke open karein.
            </div>
          )}
          <label style={{ fontSize: 12, fontWeight: 600 }}>Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="03XXXXXXXXX"
            style={inputStyle}
          />
          <label style={{ fontSize: 12, fontWeight: 600 }}>PIN</label>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="••••"
            style={inputStyle}
            onKeyDown={e => e.key === 'Enter' && login()}
          />
          {error && (
            <div style={{ color: '#b45309', fontSize: 13, marginBottom: 10 }}>{error}</div>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={login}
            style={{
              width: '100%', padding: '14px 0', border: 'none', borderRadius: 999,
              background: '#1c1917', color: '#fff', fontWeight: 700, fontSize: 15,
              opacity: busy ? 0.6 : 1
            }}
          >
            {busy ? 'Logging in…' : 'Login'}
          </button>
          <div style={{ marginTop: 14, fontSize: 12, color: '#a8a29e', lineHeight: 1.4 }}>
            Shift band ho to Counter pe naya shift open hona zaroori hai.
          </div>
        </div>
      </div>
    )
  }

  const mapsUrl = (o) =>
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(o.customer_address || '')}&travelmode=driving`

  return (
    <div style={{ minHeight: '100vh', background: '#fafaf9' }}>
      <header style={{
        padding: '14px 16px', background: '#1c1917', color: '#fff',
        display: 'flex', alignItems: 'center', gap: 12
      }}>
        {rider.photo_url ? (
          <img src={rider.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: '#44403c',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700
          }}>{(rider.full_name || 'R')[0]}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{rider.full_name}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{restaurant?.restaurant_name} · {rider.phone}</div>
        </div>
        <button type="button" onClick={logout} style={{
          border: '1px solid rgba(255,255,255,0.3)', background: 'transparent',
          color: '#fff', borderRadius: 999, padding: '6px 12px', fontSize: 12
        }}>Logout</button>
      </header>

      <div style={{ padding: 16 }}>
        <div style={{
          display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap'
        }}>
          <button
            type="button"
            onClick={() => setDuty('AVAILABLE')}
            style={{
              flex: 1, minWidth: 120, padding: '12px 0', border: 'none', borderRadius: 12,
              fontWeight: 700, background: rider.duty_status === 'AVAILABLE' ? '#059669' : '#e7e5e4',
              color: rider.duty_status === 'AVAILABLE' ? '#fff' : '#44403c'
            }}
          >ON DUTY</button>
          <button
            type="button"
            onClick={() => setDuty('OFF_DUTY')}
            style={{
              flex: 1, minWidth: 120, padding: '12px 0', border: 'none', borderRadius: 12,
              fontWeight: 700, background: rider.duty_status === 'OFF_DUTY' ? '#78716c' : '#e7e5e4',
              color: rider.duty_status === 'OFF_DUTY' ? '#fff' : '#44403c'
            }}
          >OFF DUTY</button>
        </div>

        <div style={{ fontSize: 13, color: '#78716c', marginBottom: 12 }}>
          Status: <b>{rider.duty_status}</b>
          {rider.primary_area ? ` · Area: ${rider.primary_area}` : ''}
        </div>

        <div style={{ fontWeight: 700, marginBottom: 8 }}>Open deliveries</div>
        {orders.length === 0 && (
          <div style={{ textAlign: 'center', padding: 32, color: '#a8a29e' }}>
            {rider.duty_status === 'AVAILABLE'
              ? 'Waiting for orders…'
              : 'ON DUTY karein taake orders assign ho saken (Phase 2 auto-dispatch).'}
          </div>
        )}
        {orders.map(o => (
          <div key={o.id} style={{
            background: '#fff', border: '1px solid #e7e5e4', borderRadius: 12,
            padding: 14, marginBottom: 10
          }}>
            <div style={{ fontWeight: 700, color: '#b45309' }}>
              DELIVERY · {o.status}{o.area_name ? ` · ${o.area_name}` : ''}
            </div>
            <div style={{ marginTop: 4 }}>{o.customer_name} · {o.customer_phone}</div>
            <div style={{ fontSize: 13, color: '#57534e' }}>{o.customer_address}</div>
            <div style={{ fontFamily: 'monospace', marginTop: 6 }}>PKR {Number(o.total).toFixed(0)}</div>
            <a href={mapsUrl(o)} target="_blank" rel="noreferrer" style={{
              display: 'block', marginTop: 10, textAlign: 'center',
              background: '#0ea5e9', color: '#fff', borderRadius: 999,
              padding: '10px 0', fontWeight: 700, textDecoration: 'none', fontSize: 13
            }}>Open Maps</a>
            {o.customer_phone && (
              <a href={`tel:${o.customer_phone}`} style={{
                display: 'block', marginTop: 8, textAlign: 'center',
                background: '#059669', color: '#fff', borderRadius: 999,
                padding: '10px 0', fontWeight: 700, textDecoration: 'none', fontSize: 13
              }}>Call customer</a>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%', marginTop: 4, marginBottom: 12, padding: '12px 14px',
  borderRadius: 10, border: '1px solid #e7e5e4', fontSize: 16, boxSizing: 'border-box'
}
