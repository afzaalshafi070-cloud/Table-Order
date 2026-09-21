import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

export default function QRCodes({ restaurantId, qrSecret }) {
  const [tableCount, setTableCount] = useState(6)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const tableIds = Array.from({ length: Math.max(0, Math.min(tableCount, 60)) }, (_, i) => `T${i + 1}`)

  if (!qrSecret) {
    return (
      <div style={{ padding: 16 }}>
        <div style={{ padding: 14, background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 10, color: '#9a3412' }}>
          QR secret abhi available nahi hai. Page refresh karke dobara try karein.
        </div>
      </div>
    )
  }

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
            (T1 se T{tableCount} tak + Takeaway QR)
          </span>
        </div>
      </div>

      {/* Takeaway — same route, tableId = takeaway (no table number on UI) */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#7a7264', marginBottom: 8 }}>
          TAKEAWAY / COUNTER PICKUP
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
          <QRTile
            label="Takeaway"
            downloadName="takeaway-qr.png"
            url={`${baseUrl}/order/${restaurantId}/${qrSecret}/takeaway`}
            accent
          />
        </div>
      </div>

      <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#7a7264', marginBottom: 8 }}>
        TABLE QR CODES
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 14 }}>
        {tableIds.map(tableId => (
          <QRTile
            key={tableId}
            label={`Table ${tableId}`}
            downloadName={`table-${tableId}-qr.png`}
            url={`${baseUrl}/order/${restaurantId}/${qrSecret}/${tableId}`}
          />
        ))}
      </div>
    </div>
  )
}

function QRTile({ label, url, downloadName, accent }) {
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const [qrError, setQrError] = useState('')

  useEffect(() => {
    if (!canvasRef.current || !url) return
    setReady(false)
    setQrError('')
    QRCode.toCanvas(canvasRef.current, url, { width: 180, margin: 1 }, (err) => {
      if (!err) setReady(true)
      else setQrError('QR generate nahi ho saka. Copy Link use karein ya page refresh karein.')
    })
  }, [url])

  const download = () => {
    if (!canvasRef.current) return
    const link = document.createElement('a')
    link.download = downloadName || 'qr.png'
    link.href = canvasRef.current.toDataURL('image/png')
    link.click()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard API unavailable
    }
  }

  return (
    <div className="fade-slide-up card-lift" style={{
      background: accent ? '#f0fdf4' : '#fff',
      border: accent ? '2px solid var(--sage)' : '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      padding: 10, textAlign: 'center'
    }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, marginBottom: 6,
        color: accent ? 'var(--sage)' : 'var(--ink)'
      }}>
        {label}
      </div>
      {qrError && <div style={{ color: 'var(--clay)', fontSize: 11, marginBottom: 6 }}>{qrError}</div>}
      <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', borderRadius: 6 }} />
      <button
        onClick={download}
        disabled={!ready}
        style={{
          marginTop: 8, width: '100%',
          background: accent ? 'var(--sage)' : 'var(--brand-primary)',
          color: accent ? '#fff' : 'var(--brand-primary-text)',
          border: 'none', borderRadius: 8,
          padding: '7px 0', fontSize: 12, fontWeight: 700, opacity: ready ? 1 : 0.5
        }}>
        Download
      </button>
      <button
        onClick={copyLink}
        style={{
          marginTop: 6, width: '100%', background: 'var(--paper-dim)', border: '1px solid var(--line)',
          borderRadius: 8, padding: '6px 0', fontSize: 11, fontWeight: 600
        }}>
        {copied ? 'Copied ✓' : 'Copy Link'}
      </button>
    </div>
  )
}
