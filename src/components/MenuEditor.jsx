import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { useMenuItems } from '../hooks/useMenuItems.js'
import { uploadImage } from '../utils/uploadImage.js'

export default function MenuEditor({ sessionId }) {
  const { items, refresh } = useMenuItems(sessionId)
  const [draft, setDraft] = useState({ name: '', category: '', price: '' })
  const [saving, setSaving] = useState(false)

  const categories = [...new Set(items.map(i => i.category))]

  const addItem = async (e) => {
    e.preventDefault()
    if (!draft.name.trim() || !draft.category.trim() || draft.price === '') return
    setSaving(true)
    await supabase.from('menu_items').insert({
      session_id: sessionId,
      category: draft.category.trim(),
      name: draft.name.trim(),
      price: Number(draft.price),
      sort_order: items.length,
    })
    setSaving(false)
    setDraft(d => ({ name: '', category: d.category, price: '' })) // keep category for fast bulk-add
    refresh()
  }

  const updateItem = async (id, patch) => {
    await supabase.from('menu_items').update(patch).eq('id', id)
    refresh()
  }

  const deleteItem = async (id) => {
    await supabase.from('menu_items').delete().eq('id', id)
    refresh()
  }

  const uploadPhoto = async (item, file) => {
    const ext = file.name.split('.').pop()
    const path = `${sessionId}/${item.id}-${Date.now()}.${ext}`
    try {
      const url = await uploadImage('menu-photos', path, file)
      await updateItem(item.id, { photo_url: url })
    } catch (err) {
      console.error(err)
      alert('Photo upload nahi ho saka. Dobara koshish karein.')
    }
  }

  const grouped = items.reduce((map, item) => {
    map[item.category] = map[item.category] || []
    map[item.category].push(item)
    return map
  }, {})

  return (
    <div style={{ padding: 16 }}>
      <form onSubmit={addItem} style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
        background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
        padding: 14, marginBottom: 20
      }}>
        <input
          placeholder="Category (e.g. Mains)"
          value={draft.category}
          onChange={e => setDraft(d => ({ ...d, category: e.target.value }))}
          list="category-list"
          style={{ ...inputStyle, flex: '1 1 140px' }}
        />
        <datalist id="category-list">
          {categories.map(c => <option key={c} value={c} />)}
        </datalist>
        <input
          placeholder="Item name"
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          style={{ ...inputStyle, flex: '2 1 160px' }}
        />
        <input
          placeholder="Price"
          type="number"
          value={draft.price}
          onChange={e => setDraft(d => ({ ...d, price: e.target.value }))}
          style={{ ...inputStyle, width: 90 }}
        />
        <button type="submit" disabled={saving} style={{
          background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', border: 'none',
          borderRadius: 8, padding: '10px 18px', fontWeight: 700, fontSize: 13
        }}>{saving ? 'Adding…' : '+ Add item'}</button>
      </form>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', color: '#9a9284', padding: '30px 0' }}>
          Abhi koi menu item nahi — upar se pehla item add karein.
        </div>
      )}

      {Object.entries(grouped).map(([category, catItems]) => (
        <div key={category} style={{ marginBottom: 22 }}>
          <h3 style={{ fontFamily: 'var(--display)', fontSize: 17, margin: '0 0 10px' }}>{category}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {catItems.map(item => (
              <div key={item.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, background: '#fff',
                border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 10, flexWrap: 'wrap'
              }}>
                <label style={{ cursor: 'pointer', flex: '0 0 auto' }}>
                  {item.photo_url
                    ? <img src={item.photo_url} alt="" style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover' }} />
                    : <div style={{
                        width: 42, height: 42, borderRadius: 8, background: 'var(--paper-dim)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
                      }}>📷</div>}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => e.target.files?.[0] && uploadPhoto(item, e.target.files[0])} />
                </label>

                <input
                  defaultValue={item.name}
                  onBlur={e => e.target.value.trim() && e.target.value !== item.name && updateItem(item.id, { name: e.target.value.trim() })}
                  style={{ ...inputStyle, flex: '1 1 140px' }}
                />
                <input
                  defaultValue={item.price}
                  type="number"
                  onBlur={e => Number(e.target.value) !== Number(item.price) && updateItem(item.id, { price: Number(e.target.value) })}
                  style={{ ...inputStyle, width: 85 }}
                />
                <input
                  defaultValue={item.badge || ''}
                  placeholder="Badge (e.g. Chef Special)"
                  onBlur={e => e.target.value !== (item.badge || '') && updateItem(item.id, { badge: e.target.value.trim() || null })}
                  style={{ ...inputStyle, width: 150 }}
                />

                <button
                  onClick={() => updateItem(item.id, { is_available: !item.is_available })}
                  style={{
                    border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700,
                    background: item.is_available ? 'var(--sage)' : 'var(--clay)', color: '#fff'
                  }}>
                  {item.is_available ? 'Available' : 'Sold out'}
                </button>

                <button
                  onClick={() => { if (confirm(`"${item.name}" delete karein?`)) deleteItem(item.id) }}
                  aria-label={`Delete ${item.name}`}
                  style={{ border: 'none', background: 'transparent', color: 'var(--clay)', fontSize: 18 }}>
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const inputStyle = { border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 14 }
