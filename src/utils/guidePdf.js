// Turns the guide-book Markdown into a printable page. The browser's
// "Save as PDF" option then creates the file, so every script (Urdu, Arabic,
// Chinese, Persian, Pashto, ...) renders with the fonts the device already has.

const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function inline(text) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

export function markdownToHtml(md) {
  const lines = String(md || '').replace(/\r/g, '').split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i].trim()
    if (!line) { i++; continue }
    if (/^---+$/.test(line)) { out.push('<hr>'); i++; continue }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue }
    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].trim()); i++ }
      const cells = r => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())
      const data = rows.filter(r => !/^\|?\s*:?-{2,}/.test(r)).map(cells)
      const [head, ...body] = data
      out.push('<table><thead><tr>' + head.map(c => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>'
        + body.map(r => '<tr>' + r.map(c => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table>')
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].trim().replace(/^[-*]\s+/, '')); i++ }
      out.push('<ul>' + items.map(t => `<li>${inline(t)}</li>`).join('') + '</ul>')
      continue
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].trim().replace(/^\d+\.\s+/, '')); i++ }
      out.push('<ol>' + items.map(t => `<li>${inline(t)}</li>`).join('') + '</ol>')
      continue
    }
    const para = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|---|\||[-*]\s|\d+\.\s)/.test(lines[i].trim())) {
      para.push(lines[i].trim()); i++
    }
    out.push(`<p>${inline(para.join(' '))}</p>`)
  }
  return out.join('\n')
}

/**
 * Opens the guide in a new window in the chosen language and starts the
 * print dialog, where the user picks "Save as PDF".
 * Returns false if the browser blocked the window.
 */
export function openGuidePdf({ md, lang, dir, title }) {
  const w = window.open('', '_blank')
  if (!w) return false
  const style = `
    @page { size: A4; margin: 18mm; }
    body { font-family: system-ui, "Segoe UI", "Noto Sans", "Noto Sans Arabic", "Noto Sans CJK SC", sans-serif;
      color: #1c1917; line-height: 1.6; font-size: 12pt; margin: 0; }
    h1 { font-size: 22pt; margin: 0 0 12px; }
    h2 { font-size: 16pt; margin: 22px 0 8px; border-bottom: 1px solid #e7e5e4; padding-bottom: 4px; }
    h3 { font-size: 13pt; margin: 14px 0 6px; }
    p { margin: 6px 0 10px; }
    ul, ol { margin: 6px 0 10px; padding-inline-start: 22px; }
    li { margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10.5pt; }
    th, td { border-bottom: 1px solid #d6d3d1; padding: 5px 7px; text-align: start; vertical-align: top; }
    code { font-family: ui-monospace, monospace; font-size: 10pt; }
    hr { border: 0; border-top: 1px solid #e7e5e4; margin: 16px 0; }
  `
  w.document.open()
  w.document.write(`<!doctype html><html lang="${esc(lang)}" dir="${dir}"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>`
    + `<style>${style}</style></head><body>${markdownToHtml(md)}</body></html>`)
  w.document.close()
  setTimeout(() => { try { w.focus(); w.print() } catch {} }, 600)
  return true
}
