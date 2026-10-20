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
          aria-label="Request bill" style={btn(flash === 'bill', '#0f172a')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg></button>
      )}
      {onWater && (
        <button type="button" onClick={() => trigger('water', onWater, 'Water request bhej di')}
          aria-label="Bring water" style={btn(flash === 'water', 'var(--sky)')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2s6 7 6 12a6 6 0 0 1-12 0c0-5 6-12 6-12z"/></svg></button>
      )}
      {onWaiter && (
        <button type="button" onClick={() => trigger('waiter', onWaiter, 'Waiter notify') }
          aria-label="Call waiter" style={btn(flash === 'waiter', 'var(--clay)')}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg></button>
      )}
    </div>
  )
}
