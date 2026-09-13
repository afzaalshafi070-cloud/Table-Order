import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

export default function QRCodes({ restaurantId, pin }) {
  const [tableCount, setTableCount] = useState(6)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const tableIds = Array.from({ length: Math.max(0, Math.min(tableCount, 60)) }, (_, i) => `T${i + 1}`)

  return (
    <div style={{ padding: 16 }}>
      <div style={{
        background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
        padding: 16, marginBottom: 18
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Kitni tables hain?</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="number"
            min={1}
            max={60}
            value={tableCount}
            onChange={e => setTableCount(Number(e.target.value) || 1)}
            style={{
              width: 90, border: '1px solid var(--line)', borderRadius: 8,
              padding: '8px 10px', fontSize: 15
            }}
          />
          <span style={{ fontSize: 13, color: '#7a7264' }}>
            (T1 se T{tableCount} tak QR codes ban jayenge)
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
        {tableIds.map(tableId => (
          <QRTile key={tableId} tableId={tableId} url={`${baseUrl}/order/${restaurantId}/${pin}/${tableId}`} />
        ))}
      </div>
    </div>
  )
}

function QRTile({ tableId, url }) {
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, url, { width: 180, margin: 1 }, (err) => {
      if (!err) setReady(true)
    })
  }, [url])

  const download = () => {
    if (!canvasRef.current) return
    const link = document.createElement('a')
    link.download = `table-${tableId}-qr.png`
    link.href = canvasRef.current.toDataURL('image/png')
    link.click()
  }

  return (
    <div className="fade-slide-up card-lift" style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
      padding: 10, textAlign: 'center'
    }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
        Table {tableId}
      </div>
      <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', borderRadius: 6 }} />
      <button
        onClick={download}
        disabled={!ready}
        style={{
          marginTop: 8, width: '100%', background: 'var(--brand-primary)',
          color: 'var(--brand-primary-text)', border: 'none', borderRadius: 8,
          padding: '7px 0', fontSize: 12, fontWeight: 700, opacity: ready ? 1 : 0.5
        }}>
        Download
      </button>
    </div>
  )
}
