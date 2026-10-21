import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ticket = fs.readFileSync(path.join(root, 'src/components/PrintableTicket.jsx'), 'utf8')
const css = fs.readFileSync(path.join(root, 'src/styles/global.css'), 'utf8')
const required = [
  ['KOT title', /print_kot_title/], ['Bill title', /print_bill_title/],
  ['localized order timestamp', /formatLocalizedDate\(order\.created_at, lang\)/],
  ['Bill item prices', /it\.price \* it\.qty/], ['Bill total', /print_total/],
  ['tax label', /print_tax/], ['delivery charge', /print_delivery/],
  ['KOT hides prices', /!isBill/], ['thermal print media rule', /@media print/],
  ['thermal page margin', /@page \{ margin: 3mm/], ['avoid splitting ticket blocks', /break-inside: avoid/],
]
const failures = required.filter(([_, pattern]) => !pattern.test(ticket + '\n' + css))
for (const [name] of required) console.log(`${failures.some(([f]) => f === name) ? 'FAIL' : 'PASS'} ${name}`)
if (failures.length) process.exitCode = 1
console.log('\nNote: this is a source-level print regression check, not a physical thermal-printer test.')
