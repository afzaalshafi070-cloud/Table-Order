import { STRINGS } from './strings.js'
import { LANGUAGES } from './languages.js'

const KEY = 'tableorder:lang'

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

export function applyLanguageToDocument(code = getLang()) {
  const meta = LANGUAGES.find(l => l.code === code)
  document.documentElement.lang = code
  document.documentElement.dir = meta?.dir || 'ltr'
}

export function setLang(code) {
  try { localStorage.setItem(KEY, code) } catch {}
  applyLanguageToDocument(code)
}

export function t(key, lang = getLang()) {
  return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key
}

// Apply direction as soon as this module loads (RTL for Arabic, Urdu, Farsi, Pashto).
applyLanguageToDocument()
