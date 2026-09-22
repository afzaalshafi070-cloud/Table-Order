import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

function loadImage(url) {
  return new Promise((resolve, reject) => {
    if (!url) return reject(new Error('No logo'))
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

export default function BrandedQRCode({
  label,
  url,
  downloadName = 'qr.png',
  logoUrl,
  accent = false,
  compact = false,
}) {
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function draw() {
      if (!canvasRef.current || !url) return
      setReady(false)
      setError('')

      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      const width = compact ? 300 : 360
      const qrSize = compact ? 240 : 280
      const top = compact ? 52 : 64
      const height = top + qrSize + 28
      canvas.width = width
      canvas.height = height

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#201d1a'
      ctx.textAlign = 'center'
      ctx.font = compact ? '700 16px system-ui, sans-serif' : '700 18px system-ui, sans-serif'
      ctx.fillText(label || 'QR CODE', width / 2, 30)

      try {
        await QRCode.toCanvas(canvas, url, {
          width: qrSize,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: { dark: '#111111', light: '#ffffff' },
        })

        // qrcode draws from the canvas origin, so move it down by redrawing
        // into a temporary canvas first.
        const qrCanvas = document.createElement('canvas')
        await QRCode.toCanvas(qrCanvas, url, {
          width: qrSize,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: { dark: '#111111', light: '#ffffff' },
        })
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, top, width, qrSize)
        ctx.drawImage(qrCanvas, (width - qrSize) / 2, top)

        if (logoUrl) {
          try {
            const logo = await loadImage(logoUrl)
            const logoBox = compact ? 54 : 62
            const x = (width - logoBox) / 2
            const y = top + (qrSize - logoBox) / 2

            ctx.save()
            ctx.fillStyle = '#ffffff'
            ctx.beginPath()
            ctx.roundRect(x - 7, y - 7, logoBox + 14, logoBox + 14, 14)
            ctx.fill()
            ctx.shadowColor = 'rgba(0,0,0,0.14)'
            ctx.shadowBlur = 8
            ctx.beginPath()
            ctx.roundRect(x, y, logoBox, logoBox, 12)
            ctx.clip()
            ctx.drawImage(logo, x, y, logoBox, logoBox)
            ctx.restore()
          } catch {
            // QR remains valid even if the logo cannot be loaded.
          }
        }

        ctx.fillStyle = '#6b6357'
        ctx.font = '600 11px system-ui, sans-serif'
        ctx.fillText('Scan to order / open portal', width / 2, height - 12)

        if (!cancelled) setReady(true)
      } catch (err) {
        if (!cancelled) setError('QR generate nahi ho saka. Page refresh karke dobara try karein.')
      }
    }

    draw()
    return () => { cancelled = true }
  }, [url, label, logoUrl, compact])

  const download = () => {
    if (!canvasRef.current || !ready) return
    const a = document.createElement('a')
    a.download = downloadName
    a.href = canvasRef.current.toDataURL('image/png')
    a.click()
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <div className="fade-slide-up card-lift" style={{
      background: accent ? '#f0fdf4' : '#fff',
      border: accent ? '2px solid var(--sage)' : '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      padding: compact ? 8 : 10,
      textAlign: 'center'
    }}>
      {error && <div style={{ color: 'var(--clay)', fontSize: 11, marginBottom: 6 }}>{error}</div>}
      <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', borderRadius: 8 }} />
      <button onClick={download} disabled={!ready} style={{
        marginTop: 8, width: '100%', background: accent ? 'var(--sage)' : 'var(--brand-primary)',
        color: accent ? '#fff' : 'var(--brand-primary-text)', border: 'none', borderRadius: 8,
        padding: '8px 0', fontSize: 12, fontWeight: 700, opacity: ready ? 1 : 0.5
      }}>
        Download QR
      </button>
      <button onClick={copyLink} style={{
        marginTop: 6, width: '100%', background: 'var(--paper-dim)', border: '1px solid var(--line)',
        borderRadius: 8, padding: '6px 0', fontSize: 11, fontWeight: 600
      }}>
        {copied ? 'Copied ✓' : 'Copy Link'}
      </button>
    </div>
  )
}
