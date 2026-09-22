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

      // Logical size (what user sees)
      const logicalWidth = compact ? 300 : 360
      const logicalQrSize = compact ? 240 : 280
      const logicalTop = compact ? 52 : 64
      const logicalHeight = logicalTop + logicalQrSize + 28

      // 2x resolution for sharp print / retina
      const scale = 2
      const width = logicalWidth * scale
      const qrSize = logicalQrSize * scale
      const top = logicalTop * scale
      const height = logicalHeight * scale

      canvas.width = width
      canvas.height = height
      // Keep CSS display size the same
      canvas.style.width = logicalWidth + 'px'
      canvas.style.height = logicalHeight + 'px'

      // Better text rendering
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, width, height)

      // Sharp heading
      ctx.fillStyle = '#201d1a'
      ctx.font = `700 ${compact ? 32 : 36}px system-ui, -apple-system, sans-serif`
      ctx.fillText(label || 'QR CODE', width / 2, 30 * scale)

      try {
        // Generate high-res clean QR
        const qrCanvas = document.createElement('canvas')
        await QRCode.toCanvas(qrCanvas, url, {
          width: qrSize,
          margin: 4,
          errorCorrectionLevel: 'H',
          color: { dark: '#111111', light: '#ffffff' },
        })
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, top, width, qrSize)
        ctx.drawImage(qrCanvas, (width - qrSize) / 2, top)

        if (logoUrl) {
          try {
            const logo = await loadImage(logoUrl)
            // Keep logo small (≈13% of QR side) for maximum scanner reliability
            const logoBox = Math.round(qrSize * 0.13)
            const pad = 10
            const x = (width - logoBox) / 2
            const y = top + (qrSize - logoBox) / 2

            ctx.save()
            // Tight white rounded background
            ctx.fillStyle = '#ffffff'
            ctx.beginPath()
            ctx.roundRect(x - pad, y - pad, logoBox + pad * 2, logoBox + pad * 2, 16)
            ctx.fill()

            // Soft shadow
            ctx.shadowColor = 'rgba(0,0,0,0.10)'
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

        // Footer text
        ctx.fillStyle = '#6b6357'
        ctx.font = `600 ${22}px system-ui, -apple-system, sans-serif`
        ctx.fillText('Scan to order / open portal', width / 2, height - 24)

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
