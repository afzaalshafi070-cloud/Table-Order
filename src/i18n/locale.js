// BCP-47 locale mapping for dates and numbers in customer-facing printouts.
// These tags affect formatting only; they do not claim that every UI string is translated.
const LOCALE_BY_LANGUAGE = {
  en: 'en-PK', ur: 'ur-PK', 'ur-roman': 'ur-PK', ar: 'ar', zh: 'zh-CN', es: 'es',
  fr: 'fr-FR', tr: 'tr-TR', hi: 'hi-IN', bn: 'bn-BD', id: 'id-ID', ms: 'ms-MY',
  th: 'th-TH', vi: 'vi-VN', ja: 'ja-JP', ko: 'ko-KR', it: 'it-IT', de: 'de-DE',
  pt: 'pt-PT', ru: 'ru-RU', fa: 'fa-IR', sw: 'sw', pa: 'pa-IN', ps: 'ps-AF',
  tl: 'fil-PH', nl: 'nl-NL',
}

export function getLocaleForLanguage(code = 'en') {
  return LOCALE_BY_LANGUAGE[code] || 'en-PK'
}

export function formatLocalizedDate(value, code = 'en') {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const locale = getLocaleForLanguage(code)
  try {
    return new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: code !== 'ur' && code !== 'ur-roman' && code !== 'ar',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-PK', {
      year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(date)
  }
}
