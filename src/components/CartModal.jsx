import { useEffect, useState } from 'react'
import { locationLabel, isTakeaway } from '../utils/locationLabel.js'

export default function CartModal({
  cart, note, tableId, onAdd, onRemove, onClose, onSend, sending, areas = [],
  taxPercent = 0, taxLabel = 'Tax',
}) {
  const items = Object.values(cart)
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0)
  const taxAmount = Math.round(subtotal * (Number(taxPercent) || 0)) / 100
  
  // FIX #3: Add delivery charge state
  const [deliveryCharge, setDeliveryCharge] = useState(0)
  const [selectedArea, setSelectedArea] = useState('')
  
  // FIX #3: Calculate total with delivery charge
  const grandTotal = subtotal + taxAmount + deliveryCharge

  const takeawayFlow = isTakeaway(tableId)

  // counter | delivery — only for takeaway QR
  const [mode, setMode] = useState(null) // null until user picks
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [areaName, setAreaName] = useState('')
  const [formError, setFormError] = useState(null)

  const inputStyle = {
    width: '100%', border: '1px solid var(--line)', borderRadius: 8,
    padding: '10px 12px', fontSize: 14, background: '#fff', boxSizing: 'border-box'
  }
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#5a5346', marginBottom: 4 }

  // FIX #3: When area changes, update delivery charge
  useEffect(() => {
    if (mode === 'delivery' && areaName) {
      const area = areas.find(a => a.name === areaName)
      setDeliveryCharge(area?.charge || 0)
      setSelectedArea(areaName)
    } else if (mode !== 'delivery') {
      setDeliveryCharge(0)
    }
  }, [areaName, mode, areas])

  const placeOrder = () => {
    if (!takeawayFlow) {
      // FIX #3: Pass delivery charge for regular table orders
      onSend({ deliveryCharge: 0 })
      return
    }
    if (!mode) {
      setFormError('Pehle Counter ya Delivery choose karein.')
      return
    }
    if (mode === 'delivery') {
      if (!customerName.trim() || !phone.trim() || !address.trim() || !areaName) {
        setFormError('Delivery ke liye Name, Phone, Address aur Area zaroori hain.')
        return
      }
      onSend({
        fulfillment: 'delivery',
        customerName: customerName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        areaName,
        deliveryCharge  // FIX #3: Include delivery charge
      })
      return
    }
    // counter pickup
    onSend({
      fulfillment: 'takeaway',
      customerName: customerName.trim(),
      phone: phone.trim(),
      address: address.trim()
    })
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
          background: 'var(--paper)', width: '100%', maxHeight: '90vh', overflowY: 'auto',
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
              <button onClick={() => onRemove(item)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--line)', background: '#fff', fontSize: 15 }}>−</button>
              <span style={{ fontFamily: 'var(--mono)', minWidth: 16, textAlign: 'center' }}>{item.qty}</span>
              <button onClick={() => onAdd(item)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', fontSize: 15 }}>+</button>
            </div>
          ))}
        </div>

        {note && (
          <div style={{ marginTop: 14, fontSize: 13, color: '#7a7264' }}>
            📝 Note: <span style={{ color: 'var(--ink)' }}>{note}</span>
          </div>
        )}

        {takeawayFlow && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#5a5346', marginBottom: 8 }}>Order type</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { setMode('counter'); setFormError(null); setDeliveryCharge(0) }} style={{
                flex: 1, padding: '12px 8px', borderRadius: 12, fontWeight: 700, fontSize: 14,
                border: mode === 'counter' ? '2px solid var(--sage)' : '1px solid var(--line)',
                background: mode === 'counter' ? '#f0fdf4' : '#fff', color: 'var(--ink)'
              }}>Counter</button>
              <button type="button" onClick={() => { setMode('delivery'); setFormError(null) }} style={{
                flex: 1, padding: '12px 8px', borderRadius: 12, fontWeight: 700, fontSize: 14,
                border: mode === 'delivery' ? '2px solid var(--sky)' : '1px solid var(--line)',
                background: mode === 'delivery' ? '#e0f2fe' : '#fff', color: 'var(--ink)'
              }}>Delivery</button>
            </div>
          </div>
        )}

        {takeawayFlow && mode === 'counter' && (
          <div style={{ marginTop: 12, fontSize: 12, color: '#7a7264' }}>
            Counter se pickup — optional name/phone neeche.
            <div style={{ marginTop: 8 }}>
              <label style={labelStyle}>Name (optional)</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
              <label style={labelStyle}>Phone (optional)</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} inputMode="tel" />
            </div>
          </div>
        )}

        {takeawayFlow && mode === 'delivery' && (
          <div style={{
            marginTop: 12, padding: 14, background: '#e0f2fe',
            border: '1px solid #7dd3fc', borderRadius: 12
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--sky)' }}>
              Delivery details (required)
            </div>
            <label style={labelStyle}>Name *</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Full name" style={{ ...inputStyle, marginBottom: 8 }} />
            <label style={labelStyle}>Phone *</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="03xx-xxxxxxx" style={{ ...inputStyle, marginBottom: 8 }} inputMode="tel" />
            <label style={labelStyle}>Address *</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="House / street" style={{ ...inputStyle, marginBottom: 8 }} />
            <label style={labelStyle}>Area *</label>
            {areas.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--clay)' }}>Abhi koi area set nahi — counter se Areas add karein.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {areas.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAreaName(a.name)}
                    style={{
                      border: areaName === a.name ? '2px solid var(--sky)' : '1px solid var(--line)',
                      background: areaName === a.name ? 'var(--sky)' : '#fff',
                      color: areaName === a.name ? '#fff' : 'var(--ink)',
                      borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 600
                    }}
                  >
                    {a.name}
                    {a.charge > 0 && (
                      <span style={{ fontSize: 12, marginLeft: 4, opacity: 0.9 }}>
                        (+{a.charge})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {formError && (
          <div style={{ marginTop: 10, color: 'var(--clay)', fontSize: 13 }}>{formError}</div>
        )}

        {/* FIX #3: Enhanced pricing breakdown with delivery charge */}
        <div style={{ marginTop: 16, borderTop: '1px dashed var(--line)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
            <span>Subtotal</span>
            <span style={{ fontFamily: 'var(--mono)' }}>PKR {subtotal}</span>
          </div>

          {taxPercent > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#7a7264', marginBottom: 4 }}>
              <span>{taxLabel} ({taxPercent}%)</span>
              <span style={{ fontFamily: 'var(--mono)' }}>PKR {taxAmount}</span>
            </div>
          )}

          {/* FIX #3: Show delivery charge if applicable */}
          {deliveryCharge > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#7a7264', marginBottom: 4 }}>
              <span>🚚 Delivery ({selectedArea})</span>
              <span style={{ fontFamily: 'var(--mono)' }}>PKR {deliveryCharge}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
            <span>Total</span>
            <span style={{ fontFamily: 'var(--mono)' }}>PKR {grandTotal}</span>
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
          {sending ? 'Sending…' : `Place Order · PKR ${Math.round(grandTotal)}`}
        </button>
      </div>
    </div>
  )
}
