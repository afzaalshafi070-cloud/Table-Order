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

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/**
 * Draws a high-resolution, logo-centered QR inspired by premium custom QR
 * cards. Finder eyes remain conventional enough for phone scanners while the
 * data modules use the restaurant's own brand colors.
 */
export async function drawBrandQRCode(ctx, url, x, y, size, theme = {}, logoUrl = '') {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' })
  const count = qr.modules.size
  const data = qr.modules.data
  const quiet = Math.max(4, Math.round(size * 0.045))
  const inner = size - quiet * 2
  const cell = inner / count
  const dark = theme.qrDark || theme.brandDeep || theme.primaryDark || '#111111'
  const light = theme.qrLight || '#ffffff'

  ctx.save()
  ctx.fillStyle = light
  ctx.fillRect(x, y, size, size)

  const isFinder = (row, col) => (
    (row < 7 && col < 7) ||
    (row < 7 && col >= count - 7) ||
    (row >= count - 7 && col < 7)
  )

  ctx.fillStyle = dark
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!data[row * count + col] || isFinder(row, col)) continue
      const px = x + quiet + col * cell
      const py = y + quiet + row * cell
      const gap = Math.max(0.8, cell * 0.16)
      roundedRect(ctx, px + gap / 2, py + gap / 2, cell - gap, cell - gap, cell * 0.20)
      ctx.fill()
    }
  }

  const drawFinder = (fx, fy) => {
    const unit = cell
    ctx.fillStyle = dark
    roundedRect(ctx, x + quiet + fx * unit, y + quiet + fy * unit, 7 * unit, 7 * unit, 1.5 * unit)
    ctx.fill()
    ctx.fillStyle = light
    roundedRect(ctx, x + quiet + (fx + 1) * unit, y + quiet + (fy + 1) * unit, 5 * unit, 5 * unit, 1.15 * unit)
    ctx.fill()
    ctx.fillStyle = dark
    roundedRect(ctx, x + quiet + (fx + 2) * unit, y + quiet + (fy + 2) * unit, 3 * unit, 3 * unit, 0.75 * unit)
    ctx.fill()
  }
  drawFinder(0, 0)
  drawFinder(count - 7, 0)
  drawFinder(0, count - 7)

  if (logoUrl) {
    try {
      const logo = await loadImage(logoUrl)
      const logoBox = size * 0.18
      const pad = size * 0.025
      const lx = x + (size - logoBox) / 2
      const ly = y + (size - logoBox) / 2
      ctx.fillStyle = light
      roundedRect(ctx, lx - pad, ly - pad, logoBox + pad * 2, logoBox + pad * 2, size * 0.025)
      ctx.fill()
      ctx.save()
      roundedRect(ctx, lx, ly, logoBox, logoBox, size * 0.022)
      ctx.clip()
      ctx.drawImage(logo, lx, ly, logoBox, logoBox)
      ctx.restore()
    } catch {
      // QR stays valid if the logo cannot be loaded.
    }
  }
  ctx.restore()
}

export async function createBrandQRCanvas(url, size = 1200, theme = {}, logoUrl = '') {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  await drawBrandQRCode(ctx, url, 0, 0, size, theme, logoUrl)
  return canvas
}
