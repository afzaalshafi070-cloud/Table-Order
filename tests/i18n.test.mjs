import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANGUAGES } from '../src/i18n/languages.js'
import { LANG_FILES } from '../src/i18n/lang/index.js'
import { APP_STRINGS } from '../src/i18n/strings_app.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
test('language codes are unique and every selected language has a guide', () => {
  const codes = LANGUAGES.map(x => x.code)
  assert.equal(new Set(codes).size, codes.length)
  for (const code of codes) assert.ok(fs.existsSync(path.join(root, 'src/guide', `${code}.md`)), `missing guide for ${code}`)
})
test('Roman Urdu has a core dictionary and key app-specific translations', () => {
  assert.ok(Object.keys(LANG_FILES['ur-roman'] || {}).length >= 300)
  for (const key of ['guide_title', 'guide_close', 'help_kot', 'help_bill', 'print_bill_title', 'print_kot_title']) {
    assert.equal(typeof APP_STRINGS['ur-roman']?.[key], 'string', `missing Roman Urdu key ${key}`)
  }
})
test('every language has core keys and RTL metadata is defined', () => {
  const master = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/master_en.json'), 'utf8'))
  for (const lang of LANGUAGES) {
    assert.ok(['ltr', 'rtl'].includes(lang.dir), `invalid direction for ${lang.code}`)
    if (lang.code !== 'en') {
      const dict = LANG_FILES[lang.code] || {}
      for (const key of Object.keys(master)) assert.equal(typeof dict[key], 'string', `${lang.code} missing ${key}`)
    }
  }
})

test('all guidebooks have meaningful content and app dictionaries preserve placeholders', () => {
  for (const lang of LANGUAGES) {
    const guide = fs.readFileSync(path.join(root, 'src/guide', `${lang.code}.md`), 'utf8')
    assert.ok(guide.trim().length > 100, `${lang.code} guidebook is too short`)
    const app = APP_STRINGS[lang.code] || {}
    for (const [key, value] of Object.entries(app)) {
      const base = APP_STRINGS.en?.[key]
      if (typeof base !== 'string' || typeof value !== 'string') continue
      const tokens = s => [...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m => m[1]).sort().join(',')
      assert.equal(tokens(value), tokens(base), `${lang.code} placeholder mismatch: ${key}`)
    }
  }
})

test('guide launcher supports keyboard close, focus return, and scroll lock', () => {
  const launcher = fs.readFileSync(path.join(root, 'src/components/GuideBookLauncher.jsx'), 'utf8')
  assert.match(launcher, /event\.key === 'Escape'/)
  assert.match(launcher, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(launcher, /triggerRef\.current\?\.focus\(\)/)
  assert.match(launcher, /aria-modal="true"/)
  assert.match(launcher, /aria-describedby="table-order-guide-hint"/)
})

test('release audit script reports coverage without claiming translation quality', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/audit-i18n-release.mjs'), 'utf8')
  assert.match(script, /appCoveragePercent/)
  assert.match(script, /placeholderErrors/)
  assert.match(script, /does not certify translation quality/i)
})
test('guidebook shows a warning when app-specific translation coverage is incomplete', () => {
  const guide = fs.readFileSync(path.join(root, 'src/components/GuideBook.jsx'), 'utf8')
  assert.match(guide, /getTranslationCoverage/)
  assert.match(guide, /coverage\.percent < 100/)
  assert.match(guide, /Some interface labels may appear in English/)
})

test('localized print date formatter supports every configured language', async () => {
  const { formatLocalizedDate, getLocaleForLanguage } = await import('../src/i18n/locale.js')
  const fixed = '2026-10-21T12:34:00.000Z'
  for (const lang of LANGUAGES) {
    assert.ok(getLocaleForLanguage(lang.code), `missing locale for ${lang.code}`)
    assert.ok(formatLocalizedDate(fixed, lang.code).length > 0, `date formatting failed for ${lang.code}`)
  }
  assert.equal(formatLocalizedDate('not-a-date', 'en'), '')
})

test('print ticket uses selected language for date and print CSS handles narrow thermal paper', () => {
  const ticket = fs.readFileSync(path.join(root, 'src/components/PrintableTicket.jsx'), 'utf8')
  const css = fs.readFileSync(path.join(root, 'src/styles/global.css'), 'utf8')
  assert.match(ticket, /formatLocalizedDate\(order\.created_at, lang\)/)
  assert.match(css, /@media print/)
  assert.match(css, /@page \{ margin: 3mm/)
  assert.match(css, /break-inside: avoid/)
})
