import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANGUAGES } from '../src/i18n/languages.js'
import { LANG_FILES } from '../src/i18n/lang/index.js'
import { APP_STRINGS } from '../src/i18n/strings_app.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const master = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/master_en.json'), 'utf8'))
const appKeys = Object.keys(APP_STRINGS.en || {})
const coreKeys = Object.keys(master)
const guideDir = path.join(root, 'src/guide')
const rows = LANGUAGES.map(({ code, name, dir }) => {
  const core = LANG_FILES[code] || (code === 'en' ? master : {})
  const app = APP_STRINGS[code] || {}
  const guidePath = path.join(guideDir, `${code}.md`)
  const guide = fs.existsSync(guidePath) ? fs.readFileSync(guidePath, 'utf8') : ''
  const missingCore = coreKeys.filter(k => typeof core[k] !== 'string' || !core[k].trim())
  const missingApp = appKeys.filter(k => typeof app[k] !== 'string' || !app[k].trim())
  const placeholders = s => [...String(s).matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map(m => m[1]).sort().join('|')
  const placeholderErrors = appKeys.filter(k => app[k] && APP_STRINGS.en[k] && placeholders(app[k]) !== placeholders(APP_STRINGS.en[k]))
  return { code, name, dir, coreTotal: coreKeys.length, corePresent: coreKeys.length - missingCore.length,
    appTotal: appKeys.length, appPresent: appKeys.length - missingApp.length,
    appCoveragePercent: Math.round(100 * (appKeys.length - missingApp.length) / Math.max(1, appKeys.length)),
    guidePresent: !!guide.trim(), guideCharacters: guide.length, placeholderErrors: placeholderErrors.length,
    missingAppKeys: missingApp, missingCoreKeys: missingCore, placeholderErrorKeys: placeholderErrors }
})
const report = { generatedAt: new Date().toISOString(), languageCount: rows.length,
  note: 'This is structural coverage only. A present string is not proof of translation quality. Missing app strings fall back to English.', languages: rows }
const jsonPath = path.join(root, 'I18N_RELEASE_AUDIT.json')
const mdPath = path.join(root, 'I18N_RELEASE_AUDIT.md')
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + '\n')
const lines = ['# Internationalization release audit', '', `Generated: ${report.generatedAt}`, '', `Languages checked: ${rows.length}`, '', '> Coverage measures whether a language-specific value exists. It does not certify translation quality. Missing values fall back to English.', '', '| Code | Language | Core keys | App-specific keys | App coverage | Guide | Placeholder errors |', '|---|---|---:|---:|---:|---|---:|']
for (const r of rows) lines.push(`| ${r.code} | ${r.name} | ${r.corePresent}/${r.coreTotal} | ${r.appPresent}/${r.appTotal} | ${r.appCoveragePercent}% | ${r.guidePresent ? `${r.guideCharacters} chars` : 'MISSING'} | ${r.placeholderErrors} |`)
lines.push('', '## Missing app-specific keys', '')
for (const r of rows.filter(x => x.missingAppKeys.length)) lines.push(`- **${r.code}**: ${r.missingAppKeys.length} missing keys. First keys: ${r.missingAppKeys.slice(0, 30).join(', ')}${r.missingAppKeys.length > 30 ? ', …' : ''}`)
lines.push('', '## Release warning', '', 'Do not describe the application as fully translated until missing keys are translated and native-speaker review, production build, browser checks, and printer checks are complete.', '')
fs.writeFileSync(mdPath, lines.join('\n'))
console.log(`Languages checked: ${rows.length}`)
console.log(`Audit reports written: ${path.basename(jsonPath)}, ${path.basename(mdPath)}`)
for (const r of rows) console.log(`${r.code.padEnd(8)} ${String(r.appPresent).padStart(3)}/${r.appTotal} app keys (${r.appCoveragePercent}%) | guide ${r.guidePresent ? 'OK' : 'MISSING'} | placeholder errors ${r.placeholderErrors}`)
