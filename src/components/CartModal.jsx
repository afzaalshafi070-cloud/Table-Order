import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { locationLabel, isTakeaway } from '../utils/locationLabel.js'
import { useT } from '../i18n/useT.js'
import { itemName } from '../utils/itemText.js'

export default function CartModal({
  cart, note, tableId, onAdd, onRemove, onClose, onSend, sending, areas = [],
  taxPercent = 0, taxLabel = 'Tax',
  paymentOnline = false, paymentCash = true,
  paymentQrUrl = '', paymentMethodName = 'Online payment',
  paymentAccountTitle = '', paymentInstructions = '', defaultAreaName = '',
}) {
  const { t, lang, rtl } = useT()
  const items = Object.values(cart)
  const subtotal = items.reduce((s, i) => s + i.qty * i.price, 0)
  const taxAmount = Math.round(subtotal * (Number(taxPercent) || 0)) / 100

  // Delivery charge state (set from the chosen area)
  const [deliveryCharge, setDeliveryCharge] = useState(0)
  const [selectedArea, setSelectedArea] = useState('')

  const grandTotal = subtotal + taxAmount + deliveryCharge

  const takeawayFlow = isTakeaway(tableId)

  // Bottom sheet on phones, right-hand side panel on desktop (left side for RTL languages).
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = e => setIsDesktop(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // counter | delivery — only for takeaway QR
  const [mode, setMode] = useState(defaultAreaName ? 'delivery' : null) // Brand Delivery starts directly in delivery mode
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [areaName, setAreaName] = useState(defaultAreaName || '')
  const [formError, setFormError] = useState(null)
  // Default: prefer cash when available, else online if enabled
  const [paymentMethod, setPaymentMethod] = useState(
    paymentCash ? 'cash' : (paymentOnline ? 'online' : 'cash')
  )

  const inputStyle = {
    width: '100%', border: '1px solid var(--line)', borderRadius: 8,
    padding: '10px 12px', fontSize: 14, background: 'var(--paper)', boxSizing: 'border-box',
    textAlign: 'start',
  }
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }

  // When the area changes, update the delivery charge
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
      onSend({ deliveryCharge: 0, paymentMethod })
      return
    }
    if (!mode) {
      setFormError(t('cart_pick_type'))
      return
    }
    if (mode === 'delivery') {
      if (!customerName.trim() || !phone.trim() || !address.trim() || !areaName) {
        setFormError(t('cart_need_delivery'))
        return
      }
      onSend({
        fulfillment: 'delivery',
        customerName: customerName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        areaName,
        deliveryCharge,
        paymentMethod,
      })
      return
    }
    // counter pickup
    onSend({
      fulfillment: 'takeaway',
      customerName: customerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      paymentMethod,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(32,29,26,0.5)',
        display: 'flex',
        alignItems: isDesktop ? 'stretch' : 'flex-end',
        justifyContent: isDesktop ? (rtl ? 'flex-start' : 'flex-end') : 'stretch',
      }} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={t('cart_view')}
        initial={isDesktop ? { x: rtl ? '-100%' : '100%' } : { y: '100%' }}
        animate={{ x: 0, y: 0 }}
        exit={isDesktop ? { x: rtl ? '-100%' : '100%' } : { y: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 36 }}
        onClick={e => e.stopPropagation()}
        style={isDesktop ? {
          background: 'var(--paper)', width: 'min(440px, 100%)', height: '100%',
          overflowY: 'auto', padding: '24px 22px',
          borderTopLeftRadius: rtl ? 0 : 20, borderBottomLeftRadius: rtl ? 0 : 20,
          borderTopRightRadius: rtl ? 20 : 0, borderBottomRightRadius: rtl ? 20 : 0,
        } : {
          background: 'var(--paper)', width: '100%', maxHeight: '90vh', overflowY: 'auto',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: '20px 18px calc(24px + env(safe-area-inset-bottom, 0px))',
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700 }}>
            {t('cart_title', { where: locationLabel(tableId) })}
          </div>
          <button onClick={onClose} aria-label={t('cart_close')} style={{
            width: 30, height: 30, borderRadius: '50%', border: 'none',
            background: 'var(--paper-dim)', fontSize: 16
          }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(item => {
            const name = itemName(item, lang)
            return (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, background: 'var(--paper)',
                border: '1px solid var(--line)', borderRadius: 12, padding: 10
              }}>
                {item.photo_url ? (
                  <img src={item.photo_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flex: '0 0 auto' }} />
                ) : (
                  <div style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--paper-dim)', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🍽️</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{name}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--brand-primary)', fontWeight: 700 }}>PKR {item.price}</div>
                </div>
                <button type="button" aria-label={t('cart_dec', { name })} onClick={() => onRemove(item)} style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid var(--line)', background: 'var(--paper)', fontSize: 15 }}>−</button>
                <span style={{ fontFamily: 'var(--mono)', minWidth: 16, textAlign: 'center' }}>{item.qty}</span>
                <button type="button" aria-label={t('cart_inc', { name })} onClick={() => onAdd(item)} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', fontSize: 15 }}>+</button>
              </div>
            )
          })}
        </div>

        {note && (
          <div style={{ marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>
            📝 {t('cart_note')}: <span style={{ color: 'var(--ink)' }}>{note}</span>
          </div>
        )}

        {takeawayFlow && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>{t('cart_type')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { setMode('counter'); setFormError(null); setDeliveryCharge(0) }} style={{
                flex: 1, padding: '12px 8px', borderRadius: 12, fontWeight: 700, fontSize: 14,
                border: mode === 'counter' ? '2px solid var(--sage)' : '1px solid var(--line)',
                background: mode === 'counter' ? 'color-mix(in srgb, var(--sage) 12%, var(--surface))' : 'var(--surface)', color: 'var(--ink)'
              }}>{t('cart_counter')}</button>
              <button type="button" onClick={() => { setMode('delivery'); setFormError(null) }} style={{
                flex: 1, padding: '12px 8px', borderRadius: 12, fontWeight: 700, fontSize: 14,
                border: mode === 'delivery' ? '2px solid var(--sky)' : '1px solid var(--line)',
                background: mode === 'delivery' ? 'color-mix(in srgb, var(--sky) 12%, var(--surface))' : 'var(--surface)', color: 'var(--ink)'
              }}>{t('cart_delivery')}</button>
            </div>
          </div>
        )}

        {takeawayFlow && mode === 'counter' && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)' }}>
            {t('cart_pickup_hint')}
            <div style={{ marginTop: 8 }}>
              <label style={labelStyle}>{t('cart_name_opt')}</label>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
              <label style={labelStyle}>{t('cart_phone_opt')}</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} inputMode="tel" />
            </div>
          </div>
        )}

        {takeawayFlow && mode === 'delivery' && (
          <div style={{
            marginTop: 12, padding: 14, background: 'color-mix(in srgb, var(--sky) 14%, var(--surface))',
            border: '1px solid #7dd3fc', borderRadius: 12
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10, color: 'var(--sky)' }}>
              {t('cart_delivery_req')}
            </div>
            <label style={labelStyle}>{t('cart_name_req')}</label>
            <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder={t('cart_full_name')} style={{ ...inputStyle, marginBottom: 8 }} />
            <label style={labelStyle}>{t('cart_phone_req')}</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="03xx-xxxxxxx" style={{ ...inputStyle, marginBottom: 8 }} inputMode="tel" />
            <label style={labelStyle}>{t('cart_address_req')}</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder={t('cart_house')} style={{ ...inputStyle, marginBottom: 8 }} />
            <label style={labelStyle}>{t('cart_area_req')}</label>
            {defaultAreaName ? (
              <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--sky)', fontWeight: 800 }}>
                {t('cart_routed', { area: defaultAreaName })}
              </div>
            ) : areas.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--clay)' }}>{t('cart_no_areas')}</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {areas.map(a => (
                  <button key={a.id} type="button" onClick={() => setAreaName(a.name)} style={{ border: areaName === a.name ? '2px solid var(--sky)' : '1px solid var(--line)', background: areaName === a.name ? 'var(--sky)' : 'var(--surface)', color: areaName === a.name ? '#fff' : 'var(--ink)', borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 600 }}>
                    {a.name}{a.charge > 0 && <span style={{ fontSize: 12, marginLeft: 4, opacity: .9 }}>(+{a.charge})</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {formError && (
          <div style={{ marginTop: 10, color: 'var(--clay)', fontSize: 13 }}>{formError}</div>
        )}

        {/* Pricing breakdown */}
        <div style={{ marginTop: 16, borderTop: '1px dashed var(--line)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
            <span>{t('cart_subtotal')}</span>
            <span style={{ fontFamily: 'var(--mono)' }}>PKR {subtotal}</span>
          </div>

          {taxPercent > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>{t('cart_tax', { label: taxLabel, pct: taxPercent })}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>PKR {taxAmount}</span>
            </div>
          )}

          {deliveryCharge > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>🚚 {t('cart_delivery_charge', { area: selectedArea })}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>PKR {deliveryCharge}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
            <span>{t('cart_total')}</span>
            <span style={{ fontFamily: 'var(--mono)' }}>PKR {grandTotal}</span>
          </div>
        </div>


        {(paymentCash || paymentOnline) && (
          <div style={{ marginTop: 14, borderTop: '1px dashed var(--line)', paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{t('cart_payment')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {paymentCash && (
                <button type="button" onClick={() => setPaymentMethod('cash')} style={{
                  border: paymentMethod === 'cash' ? '2px solid var(--brand-primary)' : '1px solid var(--line)',
                  background: paymentMethod === 'cash' ? 'var(--brand-soft)' : 'var(--paper)',
                  borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: 'var(--ink)',
                }}>💵 {t('cart_cash')}</button>
              )}
              {paymentOnline && (
                <button type="button" onClick={() => setPaymentMethod('online')} style={{
                  border: paymentMethod === 'online' ? '2px solid var(--brand-primary)' : '1px solid var(--line)',
                  background: paymentMethod === 'online' ? 'var(--brand-soft)' : 'var(--paper)',
                  borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: 'var(--ink)',
                }}>📱 {paymentMethodName || t('cart_online')}</button>
              )}
            </div>
            {paymentMethod === 'online' && paymentOnline && (
              <div style={{
                marginTop: 10, background: 'var(--paper-dim)', border: '1px solid var(--line)',
                borderRadius: 12, padding: 12, textAlign: 'center',
              }}>
                {paymentAccountTitle && (
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{paymentAccountTitle}</div>
                )}
                {paymentQrUrl ? (
                  <img src={paymentQrUrl} alt={t('cart_qr_alt')} style={{
                    width: 160, height: 160, objectFit: 'contain', borderRadius: 8,
                    background: 'var(--paper)', margin: '0 auto', display: 'block',
                  }} />
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('cart_qr_missing')}</div>
                )}
                {paymentInstructions && (
                  <div style={{ fontSize: 12, color: 'var(--ink)', marginTop: 8, opacity: 0.85 }}>{paymentInstructions}</div>
                )}
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  {t('cart_qr_hint')}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          onClick={placeOrder}
          disabled={sending || items.length === 0}
          style={{
            marginTop: 16, width: '100%', background: 'var(--brand-primary)',
            color: 'var(--brand-primary-text)', border: 'none', borderRadius: 999,
            padding: '14px 0', fontWeight: 700, fontSize: 15,
            opacity: sending ? 0.6 : 1
          }}>
          {sending ? t('cart_sending') : t('cart_place', { total: Math.round(grandTotal) })}
        </button>
      </motion.div>
    </motion.div>
  )
}
