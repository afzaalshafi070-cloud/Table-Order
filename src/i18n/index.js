import { STRINGS as BASE_STRINGS } from './strings.js'
import { APP_STRINGS } from './strings_app.js'
import { LANG_FILES } from './lang/index.js'
import { EN_KEYS } from './keys/index.js'
import { LANGUAGES } from './languages.js'

const KEY = 'tableorder:lang'
const listeners = new Set()

// Merge order (later wins):
//   base (login/register) -> generated per-language file -> hand-written app strings.
// English also gets every key from keys/*.js. A key missing in a language falls back to English.
const STRINGS = {}
for (const { code } of LANGUAGES) {
  STRINGS[code] = {
    ...(BASE_STRINGS.en || {}),
    ...(BASE_STRINGS[code] || {}),
    ...(APP_STRINGS.en || {}),
    ...(code === 'en' ? EN_KEYS : (LANG_FILES[code] || {})),
    ...(APP_STRINGS[code] || {}),
  }
}

function isKnown(code) {
  return !!code && Object.prototype.hasOwnProperty.call(STRINGS, code)
}

export function hasChosenLang() {
  try { return isKnown(localStorage.getItem(KEY)) } catch { return false }
}

export function getLang() {
  try {
    const saved = localStorage.getItem(KEY)
    if (isKnown(saved)) return saved
  } catch {}
  const browser = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en').slice(0, 2).toLowerCase()
  return isKnown(browser) ? browser : 'en'
}


// Report the language-specific app-string coverage. This is structural coverage,
// not a guarantee that a translation is natural or professionally reviewed.
export function getTranslationCoverage(code = getLang()) {
  const base = APP_STRINGS.en || {}
  const own = APP_STRINGS[code] || {}
  const keys = Object.keys(base)
  const translated = keys.filter(key => typeof own[key] === 'string' && own[key].trim().length > 0).length
  return { language: code, translated, total: keys.length, percent: Math.round((translated / Math.max(1, keys.length)) * 100) }
}

export function isRtl(code = getLang()) {
  return LANGUAGES.find(l => l.code === code)?.dir === 'rtl'
}

export function applyLanguageToDocument(code = getLang()) {
  const meta = LANGUAGES.find(l => l.code === code)
  document.documentElement.lang = code
  document.documentElement.dir = meta?.dir || 'ltr'
}

// Changing the language saves it, flips the page direction and tells every
// mounted component (through useT) to re-render in the new language.
export function setLang(code) {
  if (!isKnown(code)) return
  try { localStorage.setItem(KEY, code) } catch {}
  applyLanguageToDocument(code)
  listeners.forEach(fn => { try { fn(code) } catch {} })
}

export function subscribeLang(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// t('key') or t('key', 'ar') or t('key', lang, { name: 'Biryani' }) — {name} is replaced.
export function t(key, lang = getLang(), vars) {
  const dict = STRINGS[lang] || {}
  let s = dict[key] || STRINGS.en[key] || key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  }
  return s
}

// Apply direction as soon as this module loads (RTL for Arabic, Urdu, Farsi, Pashto).
applyLanguageToDocument()
