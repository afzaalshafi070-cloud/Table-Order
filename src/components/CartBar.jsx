export default function CartBar({ cart, onOpen }) {
  const items = Object.values(cart)
  const count = items.reduce((s, i) => s + i.qty, 0)
  const total = items.reduce((s, i) => s + i.qty * i.price, 0)

  if (count === 0) return null

  return (
    <div className="ticket-in" style={{
      position: 'fixed', left: 16, right: 16, bottom: 16, zIndex: 20,
      background: 'var(--ink)', color: '#fff', borderRadius: 999,
      boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px 8px 18px'
    }}>
      <span key={count} className="bounce-badge" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: '50%',
        background: 'var(--brand-primary)', color: 'var(--brand-primary-text)',
        fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, flex: '0 0 auto'
      }}>{count}</span>
      <div style={{ flex: 1, fontSize: 13 }}>
        <div style={{ fontFamily: 'var(--mono)' }}>PKR {total}</div>
        <div style={{ fontSize: 11, opacity: 0.7 }}>Tap to view order</div>
      </div>
      <button onClick={onOpen} style={{
        background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', border: 'none',
        borderRadius: 999, padding: '12px 20px', fontWeight: 700, fontSize: 13
      }}>
        View Cart
      </button>
    </div>
  )
}
