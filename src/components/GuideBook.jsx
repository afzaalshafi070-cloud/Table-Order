import { useMemo } from 'react'
import { useT } from '../i18n/useT.js'
import { getTranslationCoverage } from '../i18n/index.js'

// Every guide book file in src/guide/ (one per language, e.g. ur.md, ar.md).
// Loaded as text at build time, so the book is in the same language as the app.
const GUIDES = import.meta.glob('../guide/*.md', { query: '?raw', import: 'default', eager: true })

export function findGuide(lang) {
  return GUIDES[`../guide/${lang}.md`] ?? null
}

function renderInline(text, keyPrefix) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    const k = `${keyPrefix}-${i}`
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={k}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={k} style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{part.slice(1, -1)}</code>
    return <span key={k}>{part}</span>
  })
}

// Small Markdown renderer: headings, paragraphs, lists, tables, rules, bold, code.
function renderMarkdown(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n')
  const out = []
  let i = 0
  let n = 0
  while (i < lines.length) {
    const line = lines[i].trimEnd()
    const key = `b${n++}`
    if (!line.trim()) { i++; continue }
    if (/^---+$/.test(line.trim())) {
      out.push(<hr key={key} style={{ border: 0, borderTop: '1px solid var(--line)', margin: '18px 0' }} />)
      i++; continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) {
      const size = h[1].length === 1 ? 22 : h[1].length === 2 ? 17 : 15
      out.push(<div key={key} style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: size, margin: h[1].length === 1 ? '4px 0 12px' : '18px 0 8px' }}>{renderInline(h[2], key)}</div>)
      i++; continue
    }
    if (line.trim().startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim())
        i++
      }
      const cells = r => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
      const data = rows.filter(r => !/^\|?\s*:?-{2,}/.test(r))
      const [head, ...body] = data.map(cells)
      out.push(
        <div key={key} style={{ overflowX: 'auto', margin: '10px 0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>{head.map((c, j) => <th key={j} style={{ textAlign: 'start', borderBottom: '2px solid var(--line)', padding: '6px 8px' }}>{renderInline(c, `${key}h${j}`)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>{r.map((c, j) => <td key={j} style={{ borderBottom: '1px solid var(--line)', padding: '6px 8px', verticalAlign: 'top' }}>{renderInline(c, `${key}r${ri}c${j}`)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      continue
    }
    if (/^[-*]\s+/.test(line.trim())) {
      const items = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i++
      }
      out.push(
        <ul key={key} style={{ margin: '6px 0 10px', paddingInlineStart: 20 }}>
          {items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{renderInline(it, `${key}l${j}`)}</li>)}
        </ul>
      )
      continue
    }
    if (/^\d+\.\s+/.test(line.trim())) {
      const items = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i++
      }
      out.push(
        <ol key={key} style={{ margin: '6px 0 10px', paddingInlineStart: 22 }}>
          {items.map((it, j) => <li key={j} style={{ marginBottom: 4 }}>{renderInline(it, `${key}o${j}`)}</li>)}
        </ol>
      )
      continue
    }
    // paragraph: consecutive plain lines
    const para = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|---|\||[-*]\s|\d+\.\s)/.test(lines[i].trim())) {
      para.push(lines[i].trim())
      i++
    }
    out.push(<p key={key} style={{ margin: '6px 0 10px' }}>{renderInline(para.join(' '), key)}</p>)
  }
  return out
}

/**
 * GuideBook — the full user guide, shown in the language chosen for the app.
 * Falls back to English (with a note) when that language has no guide yet.
 */
export default function GuideBook() {
  const { t, lang } = useT()
  const own = findGuide(lang)
  const md = own ?? findGuide('en') ?? ''
  const coverage = getTranslationCoverage(lang)
  const content = useMemo(() => renderMarkdown(md), [md])
  return (
    <div style={{ fontSize: 14, color: 'var(--ink)' }}>
      {coverage.percent < 100 && (
        <div role="status" style={{
          marginBottom: 12, padding: 10, borderRadius: 10, fontSize: 13,
          background: 'var(--paper-dim, #f5f5f4)', color: 'var(--text-secondary)',
        }}>
          Translation coverage notice: {coverage.translated} of {coverage.total} app-specific labels have a value for this language ({coverage.percent}%). Some interface labels may appear in English. This is a key-coverage estimate, not a translation-quality score.
        </div>
      )}
      {!own && (
        <div role="status" style={{
          marginBottom: 12, padding: 10, borderRadius: 10, fontSize: 13,
          background: 'var(--paper-dim, #f5f5f4)', color: 'var(--text-secondary)',
        }}>{t('guide_empty')}</div>
      )}
      {content}
    </div>
  )
}
