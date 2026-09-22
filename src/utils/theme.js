import ColorThief from 'colorthief'

/**
 * Fallback palette used when a restaurant hasn't uploaded a logo yet.
 * Matches the app's default "kitchen ticket" look.
 */
export const DEFAULT_THEME = {
  primary: '#e2a13a',       // mustard
  primaryText: '#201d1a',   // ink (readable on mustard)
  accent: '#4f7a5c',        // sage
  ink: '#201d1a',
  paperTint: '#faf7f0',
}

function luminance([r, g, b]) {
  // Perceived brightness (ITU-R BT.601)
  return (r * 299 + g * 587 + b * 114) / 1000
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
}

function mix(rgbA, rgbB, amount) {
  // amount=0 -> rgbA, amount=1 -> rgbB
  return rgbA.map((v, i) => Math.round(v + (rgbB[i] - v) * amount))
}

function saturation([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

/**
 * Loads an image (with CORS enabled so canvas pixel sampling is allowed)
 * and derives a small brand palette from its dominant colors.
 * Falls back to DEFAULT_THEME if extraction fails for any reason
 * (CORS-blocked image, load error, etc.) so branding never breaks the app.
 */
export async function extractThemeFromLogo(logoUrl) {
  try {
    const img = await loadImage(logoUrl)
    const colorThief = new ColorThief()
    const palette = colorThief.getPalette(img, 6) // [[r,g,b], ...]
    if (!palette || palette.length === 0) return DEFAULT_THEME

    // Dominant color = primary brand color.
    const primary = palette[0]

    // Pick the most saturated *other* color as the accent, so the
    // accent doesn't just end up a shade of the same primary color.
    const accentCandidate = palette
      .slice(1)
      .sort((a, b) => saturation(b) - saturation(a))[0] || primary

    const secondary = palette.find(c => c !== primary && luminance(c) < 125) || accentCandidate
    const primaryText = luminance(primary) > 150 ? '#201d1a' : '#ffffff'
    const ink = luminance(primary) < 70 ? toHex(primary) : toHex(mix(primary, [32, 29, 26], 0.72))
    // Stronger brand tint so the restaurant identity is visible across the UI.
    const paperTint = toHex(mix(primary, [255, 255, 255], 0.88))
    const brandSoft = toHex(mix(primary, [255, 255, 255], 0.72))
    const brandDeep = toHex(mix(primary, [20, 20, 20], 0.58))

    return {
      primary: toHex(primary),
      primaryText,
      accent: toHex(accentCandidate),
      secondary: toHex(secondary),
      ink,
      paperTint,
      brandSoft,
      brandDeep,
    }
  } catch (err) {
    console.warn('[theme] Could not extract palette from logo, using default theme:', err)
    return DEFAULT_THEME
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

/**
 * Applies a theme object as CSS custom properties on the document root.
 * Semantic/functional colors (accept=sage, water=sky, urgent=clay) are
 * intentionally left untouched — staff learn "blue = water" once and it
 * should mean the same thing at every restaurant using the platform.
 */
export function applyTheme(theme) {
  const t = { ...DEFAULT_THEME, ...(theme || {}) }
  const root = document.documentElement.style
  root.setProperty('--brand-primary', t.primary)
  root.setProperty('--brand-primary-text', t.primaryText)
  root.setProperty('--brand-accent', t.accent)
  root.setProperty('--brand-secondary', t.secondary || t.accent)
  root.setProperty('--brand-soft', t.brandSoft || t.paperTint)
  root.setProperty('--brand-deep', t.brandDeep || t.ink)
  root.setProperty('--brand-ink', t.ink)
  root.setProperty('--brand-paper-tint', t.paperTint)
}
