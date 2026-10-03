import { useEffect, useRef, useState } from 'react'
import { drawBrandQRCode } from './BrandQRCode.jsx'

const DEFAULT_LOYALTY = {
  enabled: false,
  ordersPerReward: 10,
  rewardType: 'free_item',
  rewardValue: 0,
  rewardItemName: '1 free item',
}

function parseLoyalty(theme) {
  const value = theme?.loyalty
  return { ...DEFAULT_LOYALTY, ...(value || {}) }
}

function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return [40, 30, 20]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
function mix(a, b, amount) { return a.map((v, i) => Math.round(v + (b[i] - v) * amount)) }
function rgb(rgb) { return `rgb(${rgb.join(',')})` }
function rounded(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr); ctx.closePath()
}

async function loadImage(url) {
  if (!url) return null
  return new Promise((resolve) => {
    const img = new Image(); img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = url
  })
}

function drawLogo(ctx, logo, x, y, size) {
  if (!logo) return
  ctx.save(); rounded(ctx, x, y, size, size, size * 0.16); ctx.clip(); ctx.drawImage(logo, x, y, size, size); ctx.restore()
}

function drawCartoonCharacter(ctx, x, y, s, palette, logo) {
  const [r, g, b] = hexToRgb(palette.primary)
  const primary = rgb([r, g, b])
  const dark = rgb(mix([r, g, b], [20, 14, 10], 0.58))
  const light = rgb(mix([r, g, b], [255, 255, 255], 0.62))
  const skin = '#f3c9a8'

  // Legs
  ctx.fillStyle = dark; rounded(ctx, x + s * .36, y + s * .76, s * .10, s * .22, s * .035); ctx.fill()
  rounded(ctx, x + s * .55, y + s * .76, s * .10, s * .22, s * .035); ctx.fill()
  // Shoes
  ctx.fillStyle = '#17120e'; rounded(ctx, x + s * .31, y + s * .94, s * .17, s * .055, s * .025); ctx.fill(); rounded(ctx, x + s * .52, y + s * .94, s * .17, s * .055, s * .025); ctx.fill()

  // Body / uniform
  ctx.fillStyle = primary; rounded(ctx, x + s * .24, y + s * .43, s * .53, s * .37, s * .12); ctx.fill()
  ctx.fillStyle = light; rounded(ctx, x + s * .39, y + s * .44, s * .23, s * .32, s * .04); ctx.fill()

  // Arms
  ctx.fillStyle = skin
  rounded(ctx, x + s * .13, y + s * .48, s * .15, s * .27, s * .07); ctx.fill()
  rounded(ctx, x + s * .70, y + s * .48, s * .15, s * .27, s * .07); ctx.fill()

  // Head
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(x + s * .50, y + s * .31, s * .19, 0, Math.PI * 2); ctx.fill()
  // Hair
  ctx.fillStyle = '#231a14'; ctx.beginPath(); ctx.arc(x + s * .50, y + s * .25, s * .19, Math.PI, Math.PI * 2); ctx.fill()
  // Eyes
  ctx.fillStyle = '#201914'; ctx.beginPath(); ctx.arc(x + s * .44, y + s * .31, s * .018, 0, Math.PI * 2); ctx.arc(x + s * .56, y + s * .31, s * .018, 0, Math.PI * 2); ctx.fill()
  // Smile
  ctx.strokeStyle = '#201914'; ctx.lineWidth = s * .012; ctx.beginPath(); ctx.arc(x + s * .50, y + s * .34, s * .06, 0.15, Math.PI - 0.15); ctx.stroke()

  // Cap
  ctx.fillStyle = primary; rounded(ctx, x + s * .28, y + s * .10, s * .44, s * .12, s * .035); ctx.fill()
  ctx.beginPath(); ctx.ellipse(x + s * .50, y + s * .19, s * .27, s * .06, 0, 0, Math.PI * 2); ctx.fill()
  drawLogo(ctx, logo, x + s * .455, y + s * .112, s * .09)

  // Small shirt logo on left chest
  drawLogo(ctx, logo, x + s * .31, y + s * .50, s * .075)

  // Phone held forward
  const px = x + s * .61, py = y + s * .56, pw = s * .17, ph = s * .27
  ctx.fillStyle = '#15120f'; rounded(ctx, px, py, pw, ph, s * .025); ctx.fill()
  ctx.fillStyle = '#ffffff'; rounded(ctx, px + s * .012, py + s * .015, pw - s * .024, ph - s * .03, s * .018); ctx.fill()
}

async function drawCard(canvas, {
  side,
  restaurantName,
  logoUrl,
  theme,
  qrUrl,
  completedOrders = 0,
  cardWidth = 1800,
  cardHeight = 1080,
}) {
  const ctx = canvas.getContext('2d')
  canvas.width = cardWidth; canvas.height = cardHeight
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  const t = theme || {}
  const primary = t.primary || '#c48a25'
  const accent = t.accent || primary
  const soft = t.brandSoft || '#f5ead5'
  const ink = t.ink || '#2b2018'
  const paper = t.surface || '#fffaf2'
  const logo = await loadImage(logoUrl)

  ctx.fillStyle = paper; ctx.fillRect(0, 0, cardWidth, cardHeight)
  ctx.fillStyle = primary; rounded(ctx, 0, 0, cardWidth, cardHeight, 64); ctx.fill()

  // Inner card field
  ctx.fillStyle = paper; rounded(ctx, 22, 22, cardWidth - 44, cardHeight - 44, 48); ctx.fill()

  if (side === 'front') {
    // Shop banner
    ctx.fillStyle = primary; rounded(ctx, 48, 48, cardWidth - 96, 210, 42); ctx.fill()
    ctx.fillStyle = t.primaryText || '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
    ctx.font = '900 64px Inter, system-ui, sans-serif'
    ctx.fillText(restaurantName || 'Restaurant', 92, 132)
    ctx.font = '700 28px Inter, system-ui, sans-serif'
    ctx.fillText('HOME DELIVERY • ORDER ONLINE', 92, 190)
    if (logo) drawLogo(ctx, logo, cardWidth - 230, 78, 128)

    // Character on the left
    drawCartoonCharacter(ctx, 95, 270, 520, { primary }, logo)

    // Phone / QR panel on the right
    ctx.fillStyle = soft; rounded(ctx, 650, 315, 1030, 620, 50); ctx.fill()
    ctx.fillStyle = ink; ctx.textAlign = 'center'
    ctx.font = '900 48px Inter, system-ui, sans-serif'; ctx.fillText('Scan QR for home delivery', 1165, 390)
    ctx.font = '600 25px Inter, system-ui, sans-serif'; ctx.fillStyle = t.textMuted || '#6b6357'; ctx.fillText('Your phone opens the restaurant menu', 1165, 435)
    await drawBrandQRCode(ctx, qrUrl, 850, 470, 390, t, logoUrl)
    ctx.fillStyle = accent; rounded(ctx, 1290, 575, 300, 165, 28); ctx.fill()
    ctx.fillStyle = t.primaryText || '#fff'; ctx.font = '800 28px Inter, system-ui, sans-serif'; ctx.fillText('ORDER • EAT • ENJOY', 1440, 650)
    ctx.font = '600 21px Inter, system-ui, sans-serif'; ctx.fillText('Fast ordering, same great taste.', 1440, 700)

    // Loyalty strip
    ctx.fillStyle = primary; rounded(ctx, 700, 800, 880, 92, 30); ctx.fill()
    ctx.fillStyle = t.primaryText || '#fff'; ctx.font = '800 25px Inter, system-ui, sans-serif';
    ctx.fillText('Your digital reward card lives in the menu.', 1140, 846)
  } else {
    // Back side: clean thank-you card with brand pattern and stamps.
    ctx.fillStyle = soft; rounded(ctx, 72, 72, cardWidth - 144, cardHeight - 144, 48); ctx.fill()
    if (logo) drawLogo(ctx, logo, cardWidth / 2 - 80, 135, 160)
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.font = '900 86px Fraunces, Georgia, serif'; ctx.fillText('Thank you for coming!', cardWidth / 2, 380)
    ctx.font = '600 34px Inter, system-ui, sans-serif'; ctx.fillStyle = t.textSecondary || ink
    ctx.fillText('We hope to see you again soon.', cardWidth / 2, 455)

    const l = parseLoyalty(theme)
    const total = Math.max(1, Math.min(50, Number(l.ordersPerReward) || 10))
    const shown = Math.min(completedOrders, total)
    const startX = 360, startY = 600, gap = 120
    const rows = Math.ceil(total / 10)
    for (let i = 0; i < total; i++) {
      const row = Math.floor(i / 10), col = i % 10
      const cx = startX + col * gap, cy = startY + row * 92
      ctx.fillStyle = i < shown ? primary : paper
      ctx.strokeStyle = accent; ctx.lineWidth = 5
      ctx.beginPath(); ctx.arc(cx, cy, 28, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      if (i < shown) { ctx.fillStyle = t.primaryText || '#fff'; ctx.font = '700 26px Inter, sans-serif'; ctx.fillText('✓', cx, cy + 1) }
    }
    ctx.fillStyle = ink; ctx.font = '800 30px Inter, system-ui, sans-serif'
    ctx.fillText(`${shown}/${total} visits completed`, cardWidth / 2, Math.min(1030, startY + rows * 82 + 44))
  }
}

export default function BrandLoyaltyCard({
  restaurantName,
  logoUrl,
  theme = {},
  qrUrl,
  completedOrders = 0,
  compact = false,
}) {
  const frontRef = useRef(null)
  const backRef = useRef(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const loyalty = parseLoyalty(theme)

  useEffect(() => {
    let cancelled = false
    setBusy(true); setError('')
    Promise.all([
      drawCard(frontRef.current, { side: 'front', restaurantName, logoUrl, theme, qrUrl }),
      drawCard(backRef.current, { side: 'back', restaurantName, logoUrl, theme, qrUrl, completedOrders }),
    ]).catch(() => { if (!cancelled) setError('Card preview generate nahi ho saka.') })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [restaurantName, logoUrl, theme, qrUrl, completedOrders])

  const download = (ref, name) => {
    if (!ref.current || busy) return
    const a = document.createElement('a'); a.download = name; a.href = ref.current.toDataURL('image/png'); a.click()
  }
  const print = () => {
    if (!frontRef.current || !backRef.current || busy) return
    const w = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
    if (!w) return
    const front = frontRef.current.toDataURL('image/png'), back = backRef.current.toDataURL('image/png')
    w.document.write(`<html><head><title>${restaurantName || 'Brand Card'}</title><style>body{margin:0;padding:20px;font-family:Arial;background:#fff}.page{width:90mm;height:54mm;object-fit:contain;display:block;margin:10mm auto;page-break-after:always}@page{size:A4;margin:10mm}</style></head><body><img class="page" src="${front}"><img class="page" src="${back}"></body></html>`)
    w.document.close(); setTimeout(() => { w.focus(); w.print() }, 300)
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ padding: 12, borderRadius: 16, background: 'var(--brand-soft)', border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 900, fontSize: 15 }}>Branded Thank-You + Delivery Card</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
          Physical business-card size • landscape digital card • same logo colors • branded QR • custom uniform character
        </div>
      </div>
      {error && <div style={{ color: 'var(--clay)', fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        <CardCanvas label="Front — home delivery" canvasRef={frontRef} />
        <CardCanvas label="Back — thank you" canvasRef={backRef} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" disabled={busy} onClick={() => download(frontRef, 'brand-card-front.png')} style={btn()}>Download Front</button>
        <button type="button" disabled={busy} onClick={() => download(backRef, 'brand-card-back.png')} style={btn()}>Download Back</button>
        <button type="button" disabled={busy} onClick={print} style={btn(true)}>Print Physical Card</button>
      </div>
      {!loyalty.enabled && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loyalty/reward card abhi off hai. Settings → Loyalty Card se on kar sakte hain.</div>}
    </div>
  )
}

function CardCanvas({ label, canvasRef }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 5 }}>{label}</div>
      <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 12, boxShadow: '0 8px 25px rgba(0,0,0,.10)' }} />
    </div>
  )
}
function btn(primary = false) {
  return { border: primary ? 'none' : '1px solid var(--border)', borderRadius: 10, padding: '10px 13px', background: primary ? 'var(--brand-primary)' : 'var(--surface)', color: primary ? 'var(--brand-primary-text)' : 'var(--ink)', fontWeight: 800, fontSize: 12 }
}
