export function locationLabel(tableId) {
  if (tableId == null || tableId === '') return ''
  if (String(tableId).trim().toLowerCase() === 'takeaway') return 'Takeaway'
  if (/^table\s/i.test(String(tableId))) return String(tableId)
  return `Table ${tableId}`
}

export function isTakeaway(tableId) {
  return String(tableId || '').trim().toLowerCase() === 'takeaway'
}
