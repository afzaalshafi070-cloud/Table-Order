import { useState } from 'react'

function normalizeWhatsApp(raw) {
  if (!raw) return null
  let d = String(raw).trim()
  d = d.replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  d = d.replace(/\D/g, '')
  if (d.length < 10) return null
  if (d.startsWith('0') && d.length >= 10) d = '92' + d.slice(1)
  if (d.length < 11) return null
  return d
}

export default function FloatingActions({
  onWater,
  onWaiter,
  onBill,
  whatsapp,
  showServiceButtons = true,
}) {
  const [flash, setFlash] = useState(null)
  const [toast, setToast] = useState(null)
  const wa = normalizeWhatsApp(whatsapp)

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

  if (!wa && !showServiceButtons) return null

  const btn = (active, bg) => ({
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: '1px solid var(--line)',
    background: active ? bg : '#fff',
    color: active ? '#fff' : 'var(--ink)',
    fontSize: 18,
    boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
    display: 'grid',
    placeItems: 'center',
    cursor: 'pointer',
    padding: 0,
  })

  return (
    <div style={{
      position: 'fixed', right: 12, bottom: 96, zIndex: 30,
      display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end',
    }}>
      {toast && (
        <div style={{
          background: '#0f172a', color: '#fff', fontSize: 11, fontWeight: 600,
          padding: '6px 10px', borderRadius: 8, marginBottom: 2,
        }}>
          {toast}
        </div>
      )}

      {wa && (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: '#25D366', color: '#fff',
            borderRadius: 999, padding: '8px 12px',
            fontSize: 12, fontWeight: 700, textDecoration: 'none',
            boxShadow: '0 2px 10px rgba(37,211,102,0.35)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          WhatsApp
        </a>
      )}

      {showServiceButtons && onBill && (
        <button type="button" onClick={() => trigger('bill', onBill, 'Bill request bhej di')}
          aria-label="Request bill" style={btn(flash === 'bill', '#0f172a')}>🧾</button>
      )}
      {showServiceButtons && onWater && (
        <button type="button" onClick={() => trigger('water', onWater, 'Water request bhej di')}
          aria-label="Bring water" style={btn(flash === 'water', 'var(--sky)')}>💧</button>
      )}
      {showServiceButtons && onWaiter && (
        <button type="button" onClick={() => trigger('waiter', onWaiter, 'Waiter ko notify kar diya')}
          aria-label="Call waiter" style={btn(flash === 'waiter', 'var(--clay)')}>🔔</button>
      )}
    </div>
  )
}
