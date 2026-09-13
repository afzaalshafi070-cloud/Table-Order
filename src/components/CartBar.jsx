import { useState } from 'react'

export default function CartBar({ cart, onSend, sending }) {
  const [open, setOpen] = useState(false)
  const items = Object.values(cart)
  const count = items.reduce((s, i) => s + i.qty, 0)
  const total = items.reduce((s, i) => s + i.qty * i.price, 0)

  if (count === 0) return null

  return (
    <div className="ticket-in" style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20,
      background: 'var(--ink)', color: '#fff',
      borderTopLeftRadius: 18, borderTopRightRadius: 18,
      boxShadow: '0 -6px 24px rgba(0,0,0,0.25)'
    }}>
      {open && (
        <div className="fade-slide-up" style={{ padding: '14px 18px 0', maxHeight: '40vh', overflowY: 'auto' }}>
          {items.map(i => (
            <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
              <span>{i.qty} × {i.name}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>PKR {i.qty * i.price}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px' }}>
        <button onClick={() => setOpen(o => !o)} style={{
          background: 'transparent', border: 'none', color: '#fff', fontSize: 13,
          fontFamily: 'var(--mono)', flex: '0 0 auto'
        }}>
          <span key={count} className="bounce-badge" style={{ display: 'inline-block' }}>
            {count} item{count > 1 ? 's' : ''}
          </span> {open ? '▾' : '▴'}
        </button>
        <div style={{ flex: 1, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 15 }}>
          PKR {total}
        </div>
        <button
          onClick={onSend}
          disabled={sending}
          style={{
            background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', border: 'none',
            borderRadius: 10, padding: '12px 20px', fontWeight: 700, fontSize: 14,
            opacity: sending ? 0.6 : 1
          }}>
          {sending ? 'Sending…' : 'Send to kitchen'}
        </button>
      </div>
    </div>
  )
}
