export default function CartModal({ cart, note, tableId, onAdd, onRemove, onClose, onSend, sending }) {
import { locationLabel } from '../utils/locationLabel.js'
  const items = Object.values(cart)
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(32,29,26,0.5)',
      display: 'flex', alignItems: 'flex-end'
    }} onClick={onClose}>
      <div
        className="fade-slide-up"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--paper)', width: '100%', maxHeight: '85vh', overflowY: 'auto',
          borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '20px 18px 24px'
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700 }}>
            Your Order · {locationLabel(tableId)}
          </div>
          <button onClick={onClose} aria-label="Close cart" style={{
            width: 30, height: 30, borderRadius: '50%', border: 'none',
            background: 'var(--paper-dim)', fontSize: 16
          }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, background: '#fff',
              border: '1px solid var(--line)', borderRadius: 12, padding: 10
            }}>
              {item.photo_url ? (
                <img src={item.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flex: '0 0 auto' }} />
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--paper-dim)', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🍽️</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{item.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--brand-primary)', fontWeight: 700 }}>PKR {item.price}</div>
              </div>
              <button onClick={() => onRemove(item)} aria-label={`Remove one ${item.name}`}
                style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--line)', background: '#fff', fontSize: 15 }}>−</button>
              <span style={{ fontFamily: 'var(--mono)', minWidth: 16, textAlign: 'center' }}>{item.qty}</span>
              <button onClick={() => onAdd(item)} aria-label={`Add one more ${item.name}`}
                style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', fontSize: 15 }}>+</button>
            </div>
          ))}
        </div>

        {note && (
          <div style={{ marginTop: 14, fontSize: 13, color: '#7a7264' }}>
            📝 Note: <span style={{ color: 'var(--ink)' }}>{note}</span>
          </div>
        )}

        <div style={{ marginTop: 16, borderTop: '1px dashed var(--line)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
            <span>Total</span>
            <span style={{ fontFamily: 'var(--mono)' }}>PKR {subtotal}</span>
          </div>
        </div>

        <button
          onClick={onSend}
          disabled={sending || items.length === 0}
          style={{
            marginTop: 16, width: '100%', background: 'var(--brand-primary)',
            color: 'var(--brand-primary-text)', border: 'none', borderRadius: 999,
            padding: '14px 0', fontWeight: 700, fontSize: 15,
            opacity: sending ? 0.6 : 1
          }}>
          {sending ? 'Sending…' : `Place Order · PKR ${subtotal}`}
        </button>
      </div>
    </div>
  )
}
