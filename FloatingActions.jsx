import { useState } from 'react'

export default function FloatingActions({ onWater, onWaiter }) {
  const [flash, setFlash] = useState(null)

  const trigger = async (type, fn) => {
    setFlash(type)
    await fn()
    setTimeout(() => setFlash(f => (f === type ? null : f)), 1200)
  }

  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 100, zIndex: 30,
      display: 'flex', flexDirection: 'column', gap: 10
    }}>
      <button
        onClick={() => trigger('water', onWater)}
        aria-label="Bring water"
        style={{
          width: 56, height: 56, borderRadius: '50%', border: 'none',
          background: flash === 'water' ? 'var(--sky)' : '#fff',
          color: flash === 'water' ? '#fff' : 'var(--ink)',
          fontSize: 22, boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          border: '1px solid var(--line)', transition: 'background 0.2s, color 0.2s'
        }}>💧</button>
      <button
        onClick={() => trigger('waiter', onWaiter)}
        aria-label="Call waiter"
        style={{
          width: 56, height: 56, borderRadius: '50%', border: 'none',
          background: flash === 'waiter' ? 'var(--clay)' : '#fff',
          color: flash === 'waiter' ? '#fff' : 'var(--ink)',
          fontSize: 22, boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          border: '1px solid var(--line)', transition: 'background 0.2s, color 0.2s'
        }}>🔔</button>
    </div>
  )
}
