import { useEffect, useState } from 'react'
import BrandedQRCode from './BrandedQRCode.jsx'
import BrandLoyaltyCard from './BrandLoyaltyCard.jsx'
import { supabase } from '../supabaseClient.js'

const CATS = [
  { id: 'tables', label: 'Tables QR' },
  { id: 'takeaway', label: 'Takeaway QR' },
  { id: 'delivery', label: 'Delivery QR' },
  { id: 'riders', label: 'Rider / Areas' },
  { id: 'brand', label: 'Brand Card' },
]

/**
 * QR Center — permanent links. Existing URL shapes preserved:
 * /order/:restaurantId/:qrSecret/:tableId
 * /order/.../takeaway
 * /rider/:restaurantId/:riderSecret/:areaName
 */
export default function QRCodes({
  restaurantId,
  qrSecret,
  restaurantName,
  logoUrl,
  riderSecret,
  sessionId,
  theme = {},
}) {
  const [cat, setCat] = useState('tables')
  const [tableCount, setTableCount] = useState(6)
  const [areas, setAreas] = useState([])
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const tableIds = Array.from(
    { length: Math.max(0, Math.min(tableCount, 60)) },
    (_, i) => `T${i + 1}`
  )

  useEffect(() => {
    if (!sessionId) return
    supabase
      .from('delivery_areas')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setAreas(data || []))
  }, [sessionId, cat])

  if (!qrSecret) {
    return (
      <div style={{ padding: 16 }}>
        <Warn>QR secret available nahi. Page refresh karein — permanent secret regenerate nahi hota is screen se.</Warn>
      </div>
    )
  }

  return (
    <div style={{ padding: 14, maxWidth: 920, margin: '0 auto' }}>
      <div style={{
        background: 'linear-gradient(135deg, var(--brand-deep, #1c1917), var(--brand-primary, #a16207))',
        color: '#fff', borderRadius: 16, padding: '18px 16px', marginBottom: 14,
        boxShadow: '0 12px 28px rgba(0,0,0,.12)',
      }}>
        <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22 }}>QR Center</div>
        <div style={{ fontSize: 13, opacity: 0.92, marginTop: 6, lineHeight: 1.45 }}>
          Permanent QR links — shift close/open ke baad bhi same URLs. PIN / admin key QR mein nahi hote.
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 16,
      }}>
        {CATS.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCat(c.id)}
            style={{
              border: cat === c.id ? '2px solid var(--brand-primary)' : '1px solid var(--line, #e7e5e4)',
              borderRadius: 14, padding: '14px 12px', cursor: 'pointer', textAlign: 'left',
              background: cat === c.id ? 'var(--brand-soft, #fef3c7)' : '#fff',
              fontWeight: 800, fontSize: 13,
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {cat === 'tables' && (
        <Panel title="Table QR codes" hint="Existing links: /order/{id}/{secret}/T1 … — structure same rehti hai.">
          <div style={{
            background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: 12, marginBottom: 12,
            display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
          }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Tables count</span>
            <input
              type="number" min={1} max={60} value={tableCount}
              onChange={e => setTableCount(Number(e.target.value) || 1)}
              style={{ width: 80, border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px' }}
            />
            <span style={{ fontSize: 12, color: '#78716c' }}>T1 – T{tableCount}</span>
          </div>
          <Grid>
            {tableIds.map(tid => (
              <BrandedQRCode
                key={tid}
                label={`TABLE ${tid} • SCAN TO ORDER`}
                downloadName={`table-${tid}-qr.png`}
                url={`${baseUrl}/order/${restaurantId}/${qrSecret}/${tid}`}
                logoUrl={logoUrl}
                theme={theme}
              />
            ))}
          </Grid>
        </Panel>
      )}

      {cat === 'takeaway' && (
        <Panel title="Takeaway QR" hint="Customers takeaway order ke liye scan karte hain.">
          <Grid>
            <BrandedQRCode
              label="TAKEAWAY"
              downloadName="takeaway-qr.png"
              url={`${baseUrl}/order/${restaurantId}/${qrSecret}/takeaway`}
              logoUrl={logoUrl}
              theme={theme}
            />
          </Grid>
        </Panel>
      )}

      {cat === 'delivery' && (
        <Panel title="Delivery QR" hint="Same takeaway+delivery entry — customers delivery select kar sakte hain.">
          <Grid>
            <BrandedQRCode
              label="DELIVERY / TAKEAWAY"
              downloadName="delivery-takeaway-qr.png"
              url={`${baseUrl}/order/${restaurantId}/${qrSecret}/takeaway`}
              logoUrl={logoUrl}
              accent
            />
          </Grid>
          <p style={{ fontSize: 12, color: '#78716c', marginTop: 10 }}>
            Delivery areas Settings → Delivery mein manage hon. Rider ke liye alag category use karein.
          </p>
        </Panel>
      )}

      {cat === 'riders' && (
        <Panel title="Rider / Area QR" hint="Areas Settings → Delivery se add karein. Secret URL mein PIN nahi.">
          {!riderSecret ? (
            <Warn>Rider secret missing. Page refresh karein.</Warn>
          ) : areas.length === 0 ? (
            <Warn>
              Koi delivery area nahi. Settings → Delivery se area add karein, phir yahan QR dikhega.
            </Warn>
          ) : (
            <Grid>
              {areas.map(a => (
                <BrandedQRCode
                  key={a.id}
                  label={`RIDER · ${a.name}`}
                  downloadName={`rider-${String(a.name).replace(/\s+/g, '-')}.png`}
                  url={`${baseUrl}/rider/${restaurantId}/${riderSecret}/${encodeURIComponent(a.name)}`}
                  logoUrl={logoUrl}
                  theme={theme}
                  accent
                />
              ))}
            </Grid>
          )}
        </Panel>
      )}

      {cat === 'brand' && (
        <Panel title="Branded delivery + thank-you card" hint="Landscape digital card aur business-card size physical front/back. Restaurant logo, colors, QR aur custom uniform character automatically same brand mein.">
          <BrandLoyaltyCard
            restaurantName={restaurantName}
            logoUrl={logoUrl}
            theme={theme}
            qrUrl={`${baseUrl}/order/${restaurantId}/${qrSecret}/takeaway`}
          />
        </Panel>
      )}

      <div style={{ marginTop: 8, fontSize: 11, color: '#a8a29e', fontFamily: 'var(--mono)' }}>
        {restaurantName || restaurantId}
      </div>
    </div>
  )
}

function Panel({ title, hint, children }) {
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 4 }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: '#78716c', marginBottom: 12 }}>{hint}</div>}
      {children}
    </div>
  )
}

function Grid({ children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
      gap: 12,
    }}>
      {children}
    </div>
  )
}

function Warn({ children }) {
  return (
    <div style={{
      padding: 14, background: '#fff7ed', border: '1px solid #fdba74',
      borderRadius: 12, color: '#9a3412', fontSize: 13,
    }}>
      {children}
    </div>
  )
}
