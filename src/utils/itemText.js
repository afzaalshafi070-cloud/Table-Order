// Returns the item name in the chosen language when the owner added a
// translation (menu_items.translations). Falls back to the original name.
// Works for menu items, cart lines (they carry the item fields) and order lines.
export function itemName(item, lang) {
  if (!item) return ''
  const tr = item.translations
  if (lang && tr && typeof tr === 'object') {
    const v = tr[lang]?.name
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return item.name || ''
}
