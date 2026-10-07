import { useState } from 'react'
import BrandedQRCode from './BrandedQRCode.jsx'
import BrandThankYouCard from './BrandThankYouCard.jsx'

const CATS = [
  { id: 'tables', label: 'Tables QR' },
  { id: 'takeaway', label: 'Takeaway QR' },
  { id: 'delivery', label: 'Delivery QR' },
  { id: 'brand', label: 'Thank-You Card' },
]

export default function QRCodes({ restaurantId, qrSecret, restaurantName, logoUrl, sessionId, theme = {} }) {
  const [cat, setCat] = useState('tables')
  const [tableCount, setTableCount] = useState(6)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const tableIds = Array.from({ length: Math.max(0, Math.min(tableCount, 60)) }, (_, i) => `T${i + 1}`)

  if (!qrSecret) return <Warn>QR secret available nahi. Page refresh karein.</Warn>
  return <div style={{ padding: 14, maxWidth: 920, margin: '0 auto' }}>
    <div style={{ background: 'linear-gradient(135deg, var(--brand-deep, #1c1917), var(--brand-primary, #a16207))', color: '#fff', borderRadius: 16, padding: '18px 16px', marginBottom: 14 }}>
      <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22 }}>QR Center</div>
      <div style={{ fontSize: 13, opacity: .92, marginTop: 6 }}>Customer QR permanent structure ke saath. Rider ke liye ab QR nahi, Rider App link use hota hai.</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8, marginBottom: 16 }}>
      {CATS.map(c => <button key={c.id} type="button" onClick={() => setCat(c.id)} style={{ border: cat === c.id ? '2px solid var(--brand-primary)' : '1px solid var(--line)', borderRadius: 14, padding: 13, background: cat === c.id ? 'var(--brand-soft)' : '#fff', fontWeight: 800 }}>{c.label}</button>)}
    </div>
    {cat === 'tables' && <Panel title="Table QR codes"><div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center' }}><b>Tables</b><input type="number" min="1" max="60" value={tableCount} onChange={e => setTableCount(Number(e.target.value) || 1)} style={{ width: 80, padding: 8, borderRadius: 8, border: '1px solid var(--line)' }} /><span style={{ fontSize: 12 }}>T1 – T{tableCount}</span></div><Grid>{tableIds.map(tid => <BrandedQRCode key={tid} label={`TABLE ${tid} • SCAN TO ORDER`} downloadName={`table-${tid}-qr.png`} url={`${baseUrl}/order/${restaurantId}/${qrSecret}/${tid}`} logoUrl={logoUrl} theme={theme} />)}</Grid></Panel>}
    {cat === 'takeaway' && <Panel title="Takeaway QR"><Grid><BrandedQRCode label="TAKEAWAY" downloadName="takeaway-qr.png" url={`${baseUrl}/order/${restaurantId}/${qrSecret}/takeaway`} logoUrl={logoUrl} theme={theme} /></Grid></Panel>}
    {cat === 'delivery' && <Panel title="Home Delivery QR" hint="Ye QR brand-level area routing use karta hai. Customer ko correct active branch par bhejne ke liye backend area match karta hai."><Grid><BrandedQRCode label="HOME DELIVERY" downloadName="home-delivery-qr.png" url={`${baseUrl}/delivery/${restaurantId}/${qrSecret}`} logoUrl={logoUrl} theme={theme} accent /></Grid></Panel>}
    {cat === 'brand' && <Panel title="Physical Thank-You + Home Delivery Card"><BrandThankYouCard sessionId={sessionId} restaurantName={restaurantName} logoUrl={logoUrl} theme={theme} qrUrl={`${baseUrl}/delivery/${restaurantId}/${qrSecret}`} /></Panel>}
  </div>
}
function Panel({ title, hint, children }) { return <div><div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{title}</div>{hint && <div style={{ fontSize: 12, color: '#78716c', marginBottom: 12 }}>{hint}</div>}{children}</div> }
function Grid({ children }) { return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>{children}</div> }
function Warn({ children }) { return <div style={{ padding: 14, background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 12, color: '#9a3412', fontSize: 13 }}>{children}</div> }
