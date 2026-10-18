import ColorThief from 'colorthief'

export const DEFAULT_THEME = {
  primary: '#e2a13a',
  primaryText: '#201d1a',
  accent: '#4f7a5c',
  secondary: '#4f7a5c',
  ink: '#4a3825',
  paperTint: '#fbf6ec',
  brandSoft: '#f4ead6',
  brandDeep: '#6b421f',
  primaryDark: '#a86218',
  primaryLight: '#f0c56a',
  surface: '#fffaf2',
  surfaceElevated: '#fffdf8',
  textMuted: '#766b5d',
  textSecondary: '#4f463b',
  darkInk: '#fff8ed',
  darkSurface: '#211812',
  darkSurfaceElevated: '#2b2018',
  darkPaper: '#17120e',
  darkBorder: '#4c392c',
  border: '#ddcfb8',
}

function clamp(v, min = 0, max = 255) { return Math.max(min, Math.min(max, Math.round(v))) }
function luminance([r, g, b]) { return (r * 299 + g * 587 + b * 114) / 1000 }
function toHex([r, g, b]) { return '#' + [r, g, b].map(v => clamp(v).toString(16).padStart(2, '0')).join('') }
function mix(a, b, amount) { return a.map((v, i) => Math.round(v + (b[i] - v) * amount)) }
function saturation([r, g, b]) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}
function relLum([r, g, b]) {
  const s = [r, g, b].map(c => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]
}
function contrastRatio(a, b) {
  const l1 = relLum(a), l2 = relLum(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}
function readableOn(bg) {
  const white = [255, 255, 255]
  const dark = [32, 25, 20]
  const cw = contrastRatio(bg, white)
  const cd = contrastRatio(bg, dark)
  if (cw >= 4.5 && cw >= cd) return '#ffffff'
  return '#201914'
}
function darken(rgb, amount) { return mix(rgb, [16, 11, 8], amount) }
function lighten(rgb, amount) { return mix(rgb, [255, 255, 255], amount) }
function isUsefulBrandColor(c) {
  const lum = luminance(c)
  return lum > 35 && lum < 225 && saturation(c) > 0.18
}

export async function extractThemeFromLogo(logoUrl) {
  try {
    const img = await loadImage(logoUrl)
    const colorThief = new ColorThief()
    const palette = colorThief.getPalette(img, 10) || []
    if (!palette.length) return DEFAULT_THEME

    // Do not let pure white/black pixels dominate the whole application.
    // Prefer a meaningful brand color, then a second contrasting brand color.
    const useful = palette.filter(isUsefulBrandColor)
    const primary = (useful.sort((a, b) => {
      const scoreA = saturation(a) * 1.4 + (1 - Math.abs(luminance(a) - 125) / 125)
      const scoreB = saturation(b) * 1.4 + (1 - Math.abs(luminance(b) - 125) / 125)
      return scoreB - scoreA
    })[0] || palette[0]).slice()

    const other = palette
      .filter(c => c !== primary)
      .sort((a, b) => saturation(b) - saturation(a))
    const accent = (other.find(c => Math.abs(luminance(c) - luminance(primary)) > 25 && saturation(c) > 0.18) || primary).slice()

    // Keep the restaurant identity visible instead of forcing a generic black theme.
    const primaryStrong = luminance(primary) > 205 ? darken(primary, 0.34) : primary
    const accentStrong = luminance(accent) > 210 ? darken(accent, 0.30) : accent
    const darkCandidate = palette
      .filter(c => luminance(c) < 150 && saturation(c) > 0.12)
      .sort((a, b) => luminance(a) - luminance(b))[0]
    const brandDeep = darkCandidate ? darken(darkCandidate, 0.08) : darken(primaryStrong, 0.48)
    const ink = darken(primaryStrong, 0.68)

    const paperTint = lighten(primaryStrong, 0.91)
    const brandSoft = lighten(primaryStrong, 0.78)
    const primaryDark = darken(primaryStrong, 0.30)
    const primaryLight = lighten(primaryStrong, 0.42)

    const darkInk = lighten(primaryStrong, 0.78)
    const darkSurface = mix([23, 18, 14], primaryStrong, 0.14)
    const darkSurfaceElevated = mix([35, 27, 21], primaryStrong, 0.16)
    const darkPaper = mix([15, 12, 10], primaryStrong, 0.10)
    const darkBorder = lighten(primaryStrong, 0.30)

    return {
      primary: toHex(primaryStrong),
      primaryText: readableOn(primaryStrong),
      accent: toHex(accentStrong),
      secondary: toHex(accentStrong),
      ink: toHex(ink),
      paperTint: toHex(paperTint),
      brandSoft: toHex(brandSoft),
      brandDeep: toHex(brandDeep),
      primaryDark: toHex(primaryDark),
      primaryLight: toHex(primaryLight),
      surface: toHex(lighten(primaryStrong, 0.965)),
      surfaceElevated: toHex(lighten(primaryStrong, 0.985)),
      textMuted: toHex(mix(ink, [115, 105, 94], 0.50)),
      textSecondary: toHex(mix(ink, [75, 66, 56], 0.28)),
      darkInk: toHex(darkInk),
      darkSurface: toHex(darkSurface),
      darkSurfaceElevated: toHex(darkSurfaceElevated),
      darkPaper: toHex(darkPaper),
      darkBorder: toHex(darkBorder),
      border: toHex(mix(primaryStrong, [216, 208, 189], 0.56)),
      darkTextMuted: toHex(mix(darkInk, [185, 175, 162], 0.45)),
      darkTextSecondary: toHex(mix(darkInk, [220, 210, 198], 0.35)),
      fontDisplay: saturation(primaryStrong) > 0.50 ? 'Inter, "Segoe UI", sans-serif' : 'Fraunces, Georgia, serif',
      fontBody: 'Inter, system-ui, sans-serif',
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

// Light-mode values that applyTheme may push inline. Inline styles beat the
// stylesheet's dark rules, so they must be removed/skipped in dark mode.
const DARK_SENSITIVE_VARS = [
  '--surface', '--surface-elevated', '--text-muted', '--text-secondary', '--border',
  '--brand-paper-tint', '--brand-ink', '--brand-soft', '--brand-deep',
]
let lastAppliedTheme = null
const isDarkMode = () => document.documentElement.getAttribute('data-color-mode') === 'dark'

export function applyTheme(theme) {
  lastAppliedTheme = theme || null
  const t = { ...DEFAULT_THEME, ...(theme || {}) }
  const root = document.documentElement.style
  const dark = isDarkMode()
  // In dark mode, light brand values must not be written inline (inline beats the stylesheet's dark rules)
  const setVar = (k, v) => { if (dark && DARK_SENSITIVE_VARS.includes(k)) return; root.setProperty(k, v) }
  setVar('--brand-primary', t.primary)
  setVar('--brand-primary-text', t.primaryText)
  setVar('--brand-accent', t.accent)
  setVar('--brand-secondary', t.secondary || t.accent)
  setVar('--brand-soft', t.brandSoft || t.paperTint)
  setVar('--brand-deep', t.brandDeep || t.ink)
  setVar('--brand-ink', t.ink)
  setVar('--brand-paper-tint', t.paperTint)
  setVar('--brand-primary-dark', t.primaryDark || t.primary)
  setVar('--brand-primary-light', t.primaryLight || t.primary)
  if (!isDarkMode()) {
    setVar('--surface', t.surface || '#ffffff')
    setVar('--surface-elevated', t.surfaceElevated || '#ffffff')
    setVar('--text-muted', t.textMuted || '#7a7264')
    setVar('--text-secondary', t.textSecondary || '#5a5346')
  }
  setVar('--dark-text-muted', t.darkTextMuted || '#a39e93')
  setVar('--dark-text-secondary', t.darkTextSecondary || '#c4bfb4')
  setVar('--dark-ink', t.darkInk || '#fff8ed')
  setVar('--dark-surface', t.darkSurface || '#211812')
  setVar('--dark-surface-elevated', t.darkSurfaceElevated || '#2b2018')
  setVar('--dark-paper', t.darkPaper || '#17120e')
  setVar('--dark-border', t.darkBorder || '#4c392c')
  if (!isDarkMode()) setVar('--border', t.border || 'var(--line)')
  if (t.fontDisplay) setVar('--display', t.fontDisplay)
  if (t.fontBody) setVar('--sans', t.fontBody)
}

export function applyColorMode(mode = 'light') {
  const root = document.documentElement
  root.setAttribute('data-color-mode', mode === 'dark' ? 'dark' : 'light')
  if (mode === 'dark') DARK_SENSITIVE_VARS.forEach(v => root.style.removeProperty(v))
  else if (lastAppliedTheme) applyTheme(lastAppliedTheme) // restore brand surfaces when switching back to light
  try { localStorage.setItem('tableorder:colorMode', mode === 'dark' ? 'dark' : 'light') } catch {}
}

export function getSavedColorMode(storageKey = 'tableorder:colorMode') {
  try { return localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

export const CUSTOMER_COLOR_MODE_KEY = 'tableorder:customerColorMode'
export function getSavedCustomerColorMode() { return getSavedColorMode(CUSTOMER_COLOR_MODE_KEY) }
export function applyCustomerColorMode(mode = 'light') {
  applyColorMode(mode)
  try { localStorage.setItem(CUSTOMER_COLOR_MODE_KEY, mode === 'dark' ? 'dark' : 'light') } catch {}
}

export function applyBrandSurface(theme) {
  const t = { ...DEFAULT_THEME, ...(theme || {}) }
  const root = document.documentElement.style
  root.setProperty('--bg-a', t.primary || DEFAULT_THEME.primary)
  root.setProperty('--bg-b', t.accent || DEFAULT_THEME.accent)
  root.setProperty('--bg-c', t.brandSoft || t.paperTint || DEFAULT_THEME.paperTint)
  root.setProperty('--bg-d', t.primaryDark || t.primary || DEFAULT_THEME.primary)
}
