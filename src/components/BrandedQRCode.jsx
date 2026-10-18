import { useEffect, useRef, useState } from 'react'
import { drawBrandQRCode } from './BrandQRCode.jsx'

export default function BrandedQRCode({
  label,
  subtitle = 'SCAN TO ORDER',
  url,
  downloadName = 'qr.png',
  logoUrl,
  theme = {},
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
      setReady(false); setError('')
      const canvas = canvasRef.current
      const logicalWidth = compact ? 320 : 390
      const logicalHeight = compact ? 350 : 440
      const scale = 4
      // Only the backing-store size is set here. Display size stays responsive via CSS
      // (width:100%, height:auto) so the card never overflows its grid cell.
      canvas.width = logicalWidth * scale
      canvas.height = logicalHeight * scale
      const ctx = canvas.getContext('2d')
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'

      const primary = theme.primary || '#111111'
      const surface = theme.surface || '#ffffff'
      ctx.fillStyle = surface
      rounded(ctx, 0, 0, logicalWidth, logicalHeight, 20)
      ctx.fill()

      // Header band: table name (big) + short subtitle. Heights are fixed so the QR never overlaps it.
      const headH = compact ? 72 : 88
      ctx.fillStyle = primary
      rounded(ctx, 0, 0, logicalWidth, headH, 20)
      ctx.fill()
      ctx.fillRect(0, headH - 36, logicalWidth, 36)

      ctx.fillStyle = theme.primaryText || '#ffffff'
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.font = `800 ${compact ? 20 : 26}px Inter, system-ui, sans-serif`
      ctx.fillText(label || 'SCAN', logicalWidth / 2, compact ? 28 : 34)
      ctx.font = `700 ${compact ? 10 : 12}px Inter, system-ui, sans-serif`
      ctx.globalAlpha = 0.85
      ctx.fillText(subtitle || 'SCAN TO ORDER', logicalWidth / 2, compact ? 56 : 66)
      ctx.globalAlpha = 1

      // QR sits fully inside the card, below the header with a clear gap at the bottom
      const qrSize = compact ? 236 : 300
      const qrY = compact ? 88 : 106
      await drawBrandQRCode(ctx, url, (logicalWidth - qrSize) / 2, qrY, qrSize, theme, logoUrl)

      if (!cancelled) setReady(true)
    }
    draw().catch(() => !cancelled && setError('QR generate nahi ho saka. Refresh karke dobara try karein.'))
    return () => { cancelled = true }
  }, [url, label, subtitle, logoUrl, theme, compact])

  const download = () => {
    if (!canvasRef.current || !ready) return
    const a = document.createElement('a')
    a.download = downloadName
    a.href = canvasRef.current.toDataURL('image/png')
    a.click()
  }
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch {}
  }
  const print = () => {
    if (!canvasRef.current || !ready) return
    const w = window.open('', '_blank', 'noopener,noreferrer,width=600,height=700')
    if (!w) return
    const image = canvasRef.current.toDataURL('image/png')
    const ratio = canvasRef.current.height / canvasRef.current.width
    const hMm = (90 * ratio).toFixed(2)
    w.document.write(`<html><head><title>${label || 'Table QR'}</title><style>@page{size:90mm ${hMm}mm;margin:0}html,body{margin:0;width:90mm;height:${hMm}mm;background:#fff}.card{width:90mm;height:${hMm}mm;display:block}</style></head><body><img class="card" src="${image}"></body></html>`)
    w.document.close(); setTimeout(() => { w.focus(); w.print() }, 250)
  }

  return (
    <div className="fade-slide-up card-lift" style={{
      background: 'var(--surface)', border: '1px solid var(--border, var(--line))',
      borderRadius: 18, padding: 10, textAlign: 'center', overflow: 'hidden'
    }}>
      {error && <div style={{ color: 'var(--clay)', fontSize: 11, marginBottom: 6 }}>{error}</div>}
      <canvas ref={canvasRef} style={{ width: '100%', maxWidth: '100%', height: 'auto', aspectRatio: compact ? '320 / 350' : '390 / 440', display: 'block', borderRadius: 12 }} />
      <button onClick={download} disabled={!ready} style={{
        marginTop: 8, width: '100%', background: 'var(--brand-primary)',
        color: 'var(--brand-primary-text)', border: 'none', borderRadius: 10,
        padding: '10px 0', fontSize: 12, fontWeight: 800, opacity: ready ? 1 : 0.5
      }}>Download Print QR</button>
      <button onClick={copyLink} style={{
        marginTop: 6, width: '100%', background: 'var(--brand-soft)', color: 'var(--brand-ink)',
        border: '1px solid var(--border)', borderRadius: 10, padding: '8px 0', fontSize: 11, fontWeight: 700
      }}>{copied ? 'Copied ✓' : 'Copy Link'}</button>
      <button onClick={print} disabled={!ready} style={{
        marginTop: 6, width: '100%', background: 'var(--surface)', color: 'var(--ink)',
        border: '1px solid var(--border)', borderRadius: 10, padding: '8px 0', fontSize: 11, fontWeight: 800
      }}>Print Table Card</button>
    </div>
  )
}

function rounded(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr); ctx.closePath()
}
