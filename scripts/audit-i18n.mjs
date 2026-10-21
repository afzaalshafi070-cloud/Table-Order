import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LANGUAGES } from '../src/i18n/languages.js'
import { LANG_FILES } from '../src/i18n/lang/index.js'
import { APP_STRINGS } from '../src/i18n/strings_app.js'
import { STRINGS } from '../src/i18n/strings.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const master = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/master_en.json'), 'utf8'))
const masterKeys = Object.keys(master)
const appKeys = Object.keys(APP_STRINGS.en || {})
const guidesDir = path.join(root, 'src/guide')
const guideCodes = new Set(fs.readdirSync(guidesDir).filter(x => x.endsWith('.md')).map(x => x.replace(/\.md$/, '')))
const failures = []
console.log(`Languages: ${LANGUAGES.length}`)
console.log(`Guide books: ${guideCodes.size}`)
console.log(`Core keys: ${masterKeys.length}; app-specific keys: ${appKeys.length}`)
console.log('\nCode | core dictionary | app-specific translation | guide')
for (const { code, name } of LANGUAGES) {
  const dict = code === 'en' ? master : (LANG_FILES[code] || {})
  const appDict = APP_STRINGS[code] || {}
  const missingCore = masterKeys.filter(k => typeof dict[k] !== 'string' || !dict[k].trim())
  const missingApp = appKeys.filter(k => typeof appDict[k] !== 'string' || !appDict[k].trim())
  const guide = guideCodes.has(code)
  console.log(`${code.padEnd(8)} | ${String(masterKeys.length - missingCore.length).padStart(3)}/${masterKeys.length} | ${String(appKeys.length - missingApp.length).padStart(3)}/${appKeys.length} | ${guide ? 'yes' : 'NO'}`)
  if (!guide) failures.push(`${code}: missing guide`)
  if (missingCore.length) failures.push(`${code}: ${missingCore.length} missing core translations (e.g. ${missingCore.slice(0, 5).join(', ')})`)
}
const englishAppKeysNotInMaster = appKeys.filter(k => !masterKeys.includes(k))
console.log(`\nApp keys not in core master: ${englishAppKeysNotInMaster.length}`)
if (failures.length) {
  console.error('\nCoverage gaps (reported, not hidden by English fallback):')
  for (const f of failures) console.error(`- ${f}`)
  process.exitCode = 1
}
