import { useState } from 'react'
import BrandedQRCode from './BrandedQRCode.jsx'

export default function QRCodes({ restaurantId, qrSecret, restaurantName, logoUrl }) {
  const [tableCount, setTableCount] = useState(6)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const tableIds = Array.from({ length: Math.max(0, Math.min(tableCount, 60)) }, (_, i) => `T${i + 1}`)

  if (!qrSecret) {
    return <div style={{ padding: 16 }}><div style={{ padding: 14, background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 10, color: '#9a3412' }}>QR secret abhi available nahi hai. Page refresh karke dobara try karein.</div></div>
  }

  const title = (kind) => `${kind} — ${restaurantName || restaurantId.replace(/-/g, ' ')}`

  return (
    <div style={{ padding: 16 }}>
      <div style={{ background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))', color: '#fff', borderRadius: 14, padding: 16, marginBottom: 18, boxShadow: '0 10px 28px rgba(0,0,0,.10)' }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Permanent QR Codes</div>
        <div style={{ fontSize: 12, opacity: .92, marginTop: 5 }}>Ye QR links shift ke saath expire nahi honge. Shift close/open hone par bhi wahi QR dobara use hoga.</div>
      </div>

      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 18 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Kitni tables hain?</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="number" min={1} max={60} value={tableCount} onChange={e => setTableCount(Number(e.target.value) || 1)} style={{ width: 90, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 15 }} />
          <span style={{ fontSize: 13, color: '#7a7264' }}>(T1 se T{tableCount} tak + Takeaway QR)</span>
        </div>
      </div>

      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#7a7264', marginBottom: 8 }}>TAKEAWAY + DELIVERY</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
        <BrandedQRCode
          label="QR FOR TAKEAWAY + DELIVERY"
          downloadName="takeaway-delivery-qr.png"
          url={`${baseUrl}/order/${restaurantId}/${qrSecret}/takeaway`}
          logoUrl={logoUrl}
          accent
        />
      </div>

      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#7a7264', marginBottom: 8 }}>TABLE QR CODES</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 14 }}>
        {tableIds.map(tableId => (
          <BrandedQRCode
            key={tableId}
            label={`QR FOR TABLE ${tableId}`}
            downloadName={`table-${tableId}-qr.png`}
            url={`${baseUrl}/order/${restaurantId}/${qrSecret}/${tableId}`}
            logoUrl={logoUrl}
          />
        ))}
      </div>
    </div>
  )
}
