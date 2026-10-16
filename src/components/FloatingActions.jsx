import { useState } from 'react'

export default function FloatingActions({
  onWater,
  onWaiter,
  onBill,
  showServiceButtons = true,
}) {
  const [flash, setFlash] = useState(null)
  const [toast, setToast] = useState(null)

  const trigger = async (type, fn, okMsg) => {
    if (!fn) return
    setFlash(type)
    try {
      await fn()
      if (okMsg) {
        setToast(okMsg)
        setTimeout(() => setToast(null), 2000)
      }
    } catch (err) {
      const m = String(err?.message || err || '')
      setToast(m.includes('RATE_LIMIT') ? 'Thori der baad try karein' : 'Request send nahi hui')
      setTimeout(() => setToast(null), 2000)
    } finally {
      setTimeout(() => setFlash(f => (f === type ? null : f)), 700)
    }
  }

  if (!showServiceButtons) return null
  if (!onWater && !onWaiter && !onBill) return null

  const btn = (active, bg) => ({
    width: 44, height: 44, borderRadius: '50%',
    border: '1px solid var(--line)',
    background: active ? bg : 'var(--paper)',
    color: active ? '#fff' : 'var(--ink)',
    fontSize: 18, boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
    display: 'grid', placeItems: 'center', cursor: 'pointer', padding: 0,
  })

  return (
    <div style={{
      position: 'fixed', right: 12, bottom: 96, zIndex: 30,
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
    }}>
      {toast && (
        <div style={{
          background: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 600,
          padding: '6px 10px', borderRadius: 8,
        }}>{toast}</div>
      )}
      {onBill && (
        <button type="button" onClick={() => trigger('bill', onBill, 'Bill request bhej di')}
          aria-label="Request bill" style={btn(flash === 'bill', '#0f172a')}>🧾</button>
      )}
      {onWater && (
        <button type="button" onClick={() => trigger('water', onWater, 'Water request bhej di')}
          aria-label="Bring water" style={btn(flash === 'water', 'var(--sky)')}>💧</button>
      )}
      {onWaiter && (
        <button type="button" onClick={() => trigger('waiter', onWaiter, 'Waiter notify') }
          aria-label="Call waiter" style={btn(flash === 'waiter', 'var(--clay)')}>🔔</button>
      )}
    </div>
  )
}
