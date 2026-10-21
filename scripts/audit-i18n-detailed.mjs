import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANGUAGES } from '../src/i18n/languages.js'
import { LANG_FILES } from '../src/i18n/lang/index.js'
import { APP_STRINGS } from '../src/i18n/strings_app.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const master = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/master_en.json'), 'utf8'))
const guides = path.join(root, 'src/guide')
const guideText = Object.fromEntries(fs.readdirSync(guides).filter(f => f.endsWith('.md')).map(f => [f.slice(0, -3), fs.readFileSync(path.join(guides, f), 'utf8')]))
const appKeys = Object.keys(APP_STRINGS.en || {})
const masterKeys = Object.keys(master)
const rows = []
const issues = []
const placeholders = s => [...String(s).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m => m[1]).sort().join(',')
for (const lang of LANGUAGES) {
  const core = lang.code === 'en' ? master : (LANG_FILES[lang.code] || {})
  const app = APP_STRINGS[lang.code] || {}
  const missingCore = masterKeys.filter(k => typeof core[k] !== 'string' || !core[k].trim())
  const missingApp = appKeys.filter(k => typeof app[k] !== 'string' || !app[k].trim())
  const placeholderMismatch = appKeys.filter(k => app[k] && APP_STRINGS.en[k] && placeholders(app[k]) !== placeholders(APP_STRINGS.en[k]))
  const guide = guideText[lang.code] || ''
  const guideHasContent = guide.trim().length > 100
  const row = { code: lang.code, name: lang.name, direction: lang.dir, coreTotal: masterKeys.length, corePresent: masterKeys.length - missingCore.length, appTotal: appKeys.length, appPresent: appKeys.length - missingApp.length, appCoveragePercent: Math.round(100 * (appKeys.length - missingApp.length) / Math.max(1, appKeys.length)), guidePresent: !!guide, guideHasContent, guideCharacters: guide.length, placeholderMismatch }
  rows.push(row)
  if (missingCore.length) issues.push(`${lang.code}: ${missingCore.length} missing core keys`)
  if (!guide) issues.push(`${lang.code}: missing guidebook file`)
  else if (!guideHasContent) issues.push(`${lang.code}: guidebook is too short to be useful`)
  if (placeholderMismatch.length) issues.push(`${lang.code}: placeholder mismatch in ${placeholderMismatch.slice(0, 8).join(', ')}`)
}
const report = { generatedAt: new Date().toISOString(), languageCount: LANGUAGES.length, coreKeyCount: masterKeys.length, appKeyCount: appKeys.length, note: 'Presence is not proof of translation quality. English fallback and machine transliteration must not be described as professionally translated.', languages: rows, issues }
fs.writeFileSync(path.join(root, 'I18N_PHASE3_DETAILED_REPORT.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`Languages: ${rows.length}; core keys: ${masterKeys.length}; app-specific keys: ${appKeys.length}`)
console.log('Code | app-specific coverage | guide chars | placeholder issues')
for (const r of rows) console.log(`${r.code.padEnd(8)} | ${String(r.appPresent).padStart(3)}/${r.appTotal} (${String(r.appCoveragePercent).padStart(3)}%) | ${String(r.guideCharacters).padStart(5)} | ${r.placeholderMismatch.length}`)
console.log(`\nReport written: I18N_PHASE3_DETAILED_REPORT.json`)
console.log(`Structural issues: ${issues.length}`)
if (issues.length) { for (const issue of issues) console.error(`- ${issue}`); process.exitCode = 1 }
