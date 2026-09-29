import { useEffect, useState } from 'react'
import BrandedQRCode from './BrandedQRCode.jsx'
import { supabase } from '../supabaseClient.js'

const CAT = {
  takeaway: 'takeaway',
  tables: 'tables',
  riders: 'riders',
}

export default function QRCodes({
  restaurantId,
  qrSecret,
  restaurantName,
  logoUrl,
  riderSecret,
  sessionId,
}) {
  const [tableCount, setTableCount] = useState(6)
  const [cat, setCat] = useState(CAT.takeaway)
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
  }, [sessionId])

  if (!qrSecret) {
    return (
      <div style={{ padding: 16 }}>
        <div
          style={{
            padding: 14,
            background: '#fff7ed',
            border: '1px solid #fdba74',
            borderRadius: 10,
            color: '#9a3412',
          }}
        >
          QR secret abhi available nahi hai. Page refresh karke dobara try karein.
        </div>
      </div>
    )
  }

  const pill = (id, label) => (
    <button
      key={id}
      type="button"
      onClick={() => setCat(id)}
      style={{
        border: 'none',
        borderRadius: 999,
        padding: '10px 16px',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        background: cat === id ? 'var(--brand-primary)' : '#fff',
        color: cat === id ? 'var(--brand-primary-text)' : 'var(--ink)',
        boxShadow: cat === id ? '0 4px 14px rgba(0,0,0,.12)' : 'none',
        borderBottom: cat === id ? 'none' : '1px solid var(--line)',
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ padding: 16, maxWidth: 900 }}>
      <div
        style={{
          background: 'linear-gradient(135deg, var(--brand-deep, #201d1a), var(--brand-primary))',
          color: '#fff',
          borderRadius: 16,
          padding: '18px 16px',
          marginBottom: 16,
          boxShadow: '0 12px 32px rgba(0,0,0,.12)',
        }}
      >
        <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20 }}>
          QR Codes
        </div>
        <div style={{ fontSize: 13, opacity: 0.92, marginTop: 6, lineHeight: 1.4 }}>
          Permanent links — shift close/open ke baad bhi same QR chalenge. Print karke tables /
          counter pe laga dein.
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 16,
          padding: 6,
          background: 'var(--paper-dim)',
          borderRadius: 14,
        }}
      >
        {pill(CAT.takeaway, 'Takeaway + Delivery')}
        {pill(CAT.tables, 'Table QR')}
        {pill(CAT.riders, 'Rider / Area QR')}
      </div>

      {cat === CAT.takeaway && (
        <div>
          <div style={{ fontSize: 13, color: '#7a7264', marginBottom: 12 }}>
            Customers is QR se takeaway / delivery order kar sakte hain.
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 14,
            }}
          >
            <BrandedQRCode
              label="TAKEAWAY + DELIVERY"
              downloadName="takeaway-delivery-qr.png"
              url={`${baseUrl}/order/${restaurantId}/${qrSecret}/takeaway`}
              logoUrl={logoUrl}
              accent
            />
          </div>
        </div>
      )}

      {cat === CAT.tables && (
        <div>
          <div
            style={{
              background: '#fff',
              border: '1px solid var(--line)',
              borderRadius: 14,
              padding: 14,
              marginBottom: 14,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Kitni tables?</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="number"
                min={1}
                max={60}
                value={tableCount}
                onChange={(e) => setTableCount(Number(e.target.value) || 1)}
                style={{
                  width: 90,
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: 15,
                }}
              />
              <span style={{ fontSize: 13, color: '#7a7264' }}>
                T1 se T{tableCount} tak generate
              </span>
            </div>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: 14,
            }}
          >
            {tableIds.map((tableId) => (
              <BrandedQRCode
                key={tableId}
                label={`TABLE ${tableId}`}
                downloadName={`table-${tableId}-qr.png`}
                url={`${baseUrl}/order/${restaurantId}/${qrSecret}/${tableId}`}
                logoUrl={logoUrl}
              />
            ))}
          </div>
        </div>
      )}

      {cat === CAT.riders && (
        <div>
          {!riderSecret ? (
            <div
              style={{
                padding: 14,
                background: '#fff7ed',
                borderRadius: 10,
                color: '#9a3412',
                fontSize: 13,
              }}
            >
              Rider secret missing. Settings → page refresh karke try karein.
            </div>
          ) : areas.length === 0 ? (
            <div
              style={{
                padding: 16,
                background: '#fff',
                border: '1px solid var(--line)',
                borderRadius: 14,
                fontSize: 13,
                color: '#7a7264',
              }}
            >
              Abhi koi delivery area nahi. <b>Settings → Delivery areas</b> se area add karein,
              phir yahan rider QR generate hoga.
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                gap: 14,
              }}
            >
              {areas.map((a) => (
                <BrandedQRCode
                  key={a.id}
                  label={`RIDER · ${a.name}`}
                  downloadName={`rider-${a.name}.png`}
                  url={`${baseUrl}/rider/${restaurantId}/${riderSecret}/${encodeURIComponent(a.name)}`}
                  logoUrl={logoUrl}
                  accent
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
