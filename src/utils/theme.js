import ColorThief from 'colorthief'

/**
 * Fallback palette used when a restaurant hasn't uploaded a logo yet.
 * Matches the app's default "kitchen ticket" look.
 */
export const DEFAULT_THEME = {
  primary: '#e2a13a',       // mustard
  primaryText: '#201d1a',   // ink (readable on mustard)
  accent: '#4f7a5c',        // sage
  secondary: '#4f7a5c',
  ink: '#201d1a',
  paperTint: '#faf7f0',
  brandSoft: '#f5f0e6',
  brandDeep: '#3d3428',
  primaryDark: '#b87d1f',
  primaryLight: '#f0c56a',
  surface: '#ffffff',
  surfaceElevated: '#ffffff',
  textMuted: '#7a7264',
  textSecondary: '#5a5346',
  border: '#d8d0bd',
}

function clamp(v, min = 0, max = 255) {
  return Math.max(min, Math.min(max, Math.round(v)))
}

function luminance([r, g, b]) {
  // Perceived brightness (ITU-R BT.601)
  return (r * 299 + g * 587 + b * 114) / 1000
}

function toHex([r, g, b]) {
  return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('')
}

function mix(rgbA, rgbB, amount) {
  // amount=0 -> rgbA, amount=1 -> rgbB
  return rgbA.map((v, i) => Math.round(v + (rgbB[i] - v) * amount))
}

function saturation([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

/** Relative luminance for WCAG contrast (sRGB) */
function relLum([r, g, b]) {
  const s = [r, g, b].map(c => {
    c = c / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
}

function contrastRatio(rgb1, rgb2) {
  const L1 = relLum(rgb1)
  const L2 = relLum(rgb2)
  const light = Math.max(L1, L2)
  const dark = Math.min(L1, L2)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * Strengthen a color that is too light / washed-out / low-contrast
 * while preserving brand identity (hue family).
 * Returns a usable primary that can sit under white or dark text.
 */
function strengthenPrimary(rgb) {
  let [r, g, b] = rgb
  let lum = luminance([r, g, b])
  let sat = saturation([r, g, b])

  // Too light / washed → darken + boost saturation slightly
  if (lum > 180) {
    const factor = 0.55 + (200 - Math.min(lum, 220)) / 400
    r = mix([r, g, b], [0, 0, 0], 1 - factor)[0]
    g = mix([r, g, b], [0, 0, 0], 1 - factor)[1]
    b = mix([r, g, b], [0, 0, 0], 1 - factor)[2]
    // re-read after mix
    ;[r, g, b] = mix(rgb, [0, 0, 0], 0.35)
    lum = luminance([r, g, b])
  }

  // Very dull → nudge saturation by pulling away from gray
  if (sat < 0.22 && lum > 40 && lum < 200) {
    const avg = (r + g + b) / 3
    r = clamp(avg + (r - avg) * 1.55)
    g = clamp(avg + (g - avg) * 1.55)
    b = clamp(avg + (b - avg) * 1.55)
  }

  // Still too light for text-on-primary? darken further
  if (luminance([r, g, b]) > 165) {
    ;[r, g, b] = mix([r, g, b], [20, 18, 15], 0.28)
  }

  return [r, g, b]
}

/**
 * Pick readable text color for a given background RGB.
 * Prefer white or near-ink for strong contrast (target ~4.5:1+).
 */
function readableOn(bgRgb) {
  const white = [255, 255, 255]
  const ink = [32, 29, 26]
  const cWhite = contrastRatio(bgRgb, white)
  const cInk = contrastRatio(bgRgb, ink)
  if (cWhite >= 4.5 && cWhite >= cInk) return '#ffffff'
  if (cInk >= 4.5) return '#201d1a'
  // Fallback: whichever is stronger
  return cWhite > cInk ? '#ffffff' : '#201d1a'
}

/**
 * Loads an image (with CORS enabled so canvas pixel sampling is allowed)
 * and derives a strong, readable brand palette from its dominant colors.
 * Falls back to DEFAULT_THEME if extraction fails.
 */
export async function extractThemeFromLogo(logoUrl) {
  try {
    const img = await loadImage(logoUrl)
    const colorThief = new ColorThief()
    const palette = colorThief.getPalette(img, 8) // [[r,g,b], ...]
    if (!palette || palette.length === 0) return DEFAULT_THEME

    // Dominant → primary, then strengthen if needed
    let primary = strengthenPrimary(palette[0])

    // Most saturated other color as accent
    const accentCandidate = palette
      .slice(1)
      .sort((a, b) => saturation(b) - saturation(a))[0] || primary

    let accent = strengthenPrimary(accentCandidate)
    // Avoid accent collapsing into primary
    if (Math.abs(luminance(accent) - luminance(primary)) < 25 && saturation(accent) < 0.4) {
      accent = mix(accent, [79, 122, 92], 0.35) // gentle sage bias
    }

    const secondary =
      palette.find(c => c !== palette[0] && luminance(c) < 140) || accent

    const primaryText = readableOn(primary)
    const ink =
      luminance(primary) < 70
        ? toHex(primary)
        : toHex(mix(primary, [32, 29, 26], 0.78))

    // Soft paper tint keeps brand presence without washing UI
    const paperTint = toHex(mix(primary, [255, 255, 255], 0.9))
    const brandSoft = toHex(mix(primary, [255, 255, 255], 0.78))
    const brandDeep = toHex(mix(primary, [18, 16, 14], 0.62))
    const primaryDark = toHex(mix(primary, [0, 0, 0], 0.32))
    const primaryLight = toHex(mix(primary, [255, 255, 255], 0.42))

    const sat = saturation(primary)
    const lum = luminance(primary)
    let fontDisplay = 'Fraunces, Georgia, serif'
    let fontBody = 'Inter, system-ui, sans-serif'
    if (lum < 60 && sat < 0.35) {
      fontDisplay = 'Fraunces, "Times New Roman", serif'
    } else if (sat > 0.55 && lum > 100) {
      fontDisplay = 'Inter, "Segoe UI", sans-serif'
    } else if (lum > 180) {
      fontDisplay = 'Inter, system-ui, sans-serif'
    }

    // Dark-mode accessible text variants (used when data-color-mode=dark)
    const darkTextMuted = toHex(mix(primary, [180, 175, 165], 0.55))
    const darkTextSecondary = toHex(mix(primary, [210, 205, 195], 0.4))

    return {
      primary: toHex(primary),
      primaryText,
      accent: toHex(accent),
      secondary: toHex(secondary),
      ink,
      paperTint,
      brandSoft,
      brandDeep,
      primaryDark,
      primaryLight,
      surface: '#ffffff',
      surfaceElevated: '#ffffff',
      textMuted: '#7a7264',
      textSecondary: '#5a5346',
      darkTextMuted,
      darkTextSecondary,
      border: toHex(mix(primary, [216, 208, 189], 0.55)),
      fontDisplay,
      fontBody,
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
  root.setProperty('--brand-primary-dark', t.primaryDark || t.primary)
  root.setProperty('--brand-primary-light', t.primaryLight || t.primary)
  root.setProperty('--surface', t.surface || '#ffffff')
  root.setProperty('--surface-elevated', t.surfaceElevated || '#ffffff')
  root.setProperty('--text-muted', t.textMuted || '#7a7264')
  root.setProperty('--text-secondary', t.textSecondary || '#5a5346')
  root.setProperty('--dark-text-muted', t.darkTextMuted || '#a39e93')
  root.setProperty('--dark-text-secondary', t.darkTextSecondary || '#c4bfb4')
  root.setProperty('--border', t.border || 'var(--line)')
  if (t.fontDisplay) root.setProperty('--display', t.fontDisplay)
  if (t.fontBody) root.setProperty('--sans', t.fontBody)
}

/** Customer / portal light/dark surface. Brand colors stay; paper/ink adapt. */
export function applyColorMode(mode = 'light', scope = 'customer') {
  const root = document.documentElement
  const normalized = mode === 'dark' ? 'dark' : 'light'
  root.setAttribute('data-color-mode', normalized)
  try {
    localStorage.setItem(scope === 'customer' ? 'tableorder:customerColorMode' : 'tableorder:staffColorMode', normalized)
  } catch {}
}

export function getSavedColorMode(scope = 'customer') {
  try {
    const key = scope === 'customer' ? 'tableorder:customerColorMode' : 'tableorder:staffColorMode'
    const v = localStorage.getItem(key)
    return v === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

/**
 * Subtle logo-driven animated background CSS vars from theme palette.
 * Used by .brand-surface layers across Customer / Counter / Rider.
 */
export function applyBrandSurface(theme) {
  const t = { ...DEFAULT_THEME, ...(theme || {}) }
  const root = document.documentElement.style
  const a = t.primary || DEFAULT_THEME.primary
  const b = t.accent || DEFAULT_THEME.accent
  const c = t.brandSoft || t.paperTint || DEFAULT_THEME.paperTint
  const d = t.primaryDark || t.primary || DEFAULT_THEME.primary
  root.setProperty('--bg-a', a)
  root.setProperty('--bg-b', b)
  root.setProperty('--bg-c', c)
  root.setProperty('--bg-d', d)
}
