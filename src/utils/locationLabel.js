/** Human label for order location (table or takeaway). */
export function locationLabel(tableId) {
  if (tableId == null || tableId === '') return ''
  const t = String(tableId).trim().toLowerCase()
  if (t === 'takeaway') return 'Takeaway'
  // Already looks like "Table T1" or just "T1" / "5"
  if (/^table\s/i.test(String(tableId))) return String(tableId)
  return `Table ${tableId}`
}

export function isTakeaway(tableId) {
  return String(tableId || '').trim().toLowerCase() === 'takeaway'
}
