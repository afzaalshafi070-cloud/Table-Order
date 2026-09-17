import { useState } from 'react'
import { locationLabel, isTakeaway } from '../utils/locationLabel.js'

export default function CartModal({ cart, note, tableId, onAdd, onRemove, onClose, onSend, sending }) {
  const items = Object.values(cart)
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0)
  const takeaway = isTakeaway(tableId)

  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  const placeOrder = () => {
    onSend({
      customerName: customerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
    })
  }

  const inputStyle = {
    width: '100%', border: '1px solid var(--line)', borderRadius: 8,
    padding: '10px 12px', fontSize: 14, background: '#fff', boxSizing: 'border-box'
  }
  const labelStyle = {
    display: 'block', fontSize: 12, fontWeight: 600, color: '#5a5346', marginBottom: 4
  }

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

        {/* Optional contact — only for takeaway */}
        {takeaway && (
          <div style={{
            marginTop: 16, padding: 14, background: '#f0fdf4',
            border: '1px solid #bbf7d0', borderRadius: 12
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, color: 'var(--sage)' }}>
              Contact (optional)
            </div>
            <div style={{ fontSize: 11, color: '#7a7264', marginBottom: 12 }}>
              Name / phone / address — taake counter aasani se pehchan le
            </div>

            <label style={labelStyle}>Name</label>
            <input
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="e.g. Ali"
              style={{ ...inputStyle, marginBottom: 10 }}
              autoComplete="name"
            />

            <label style={labelStyle}>Phone</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="03xx-xxxxxxx"
              style={{ ...inputStyle, marginBottom: 10 }}
              inputMode="tel"
              autoComplete="tel"
            />

            <label style={labelStyle}>Address</label>
            <input
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Optional — pickup note / area"
              style={inputStyle}
              autoComplete="street-address"
            />
          </div>
        )}

        <div style={{ marginTop: 16, borderTop: '1px dashed var(--line)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16 }}>
            <span>Total</span>
            <span style={{ fontFamily: 'var(--mono)' }}>PKR {subtotal}</span>
          </div>
        </div>

        <button
          onClick={placeOrder}
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
