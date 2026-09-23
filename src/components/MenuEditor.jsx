import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { useMenuItems } from '../hooks/useMenuItems.js'
import { useDeals } from '../hooks/useDeals.js'
import { uploadImage } from '../utils/uploadImage.js'

const MOOD_OPTIONS = ['hungry', 'celebrating', 'chill', 'spicy', 'family', 'quick']

export default function MenuEditor({ sessionId }) {
  const { items, refresh } = useMenuItems(sessionId)
  const { deals, refresh: refreshDeals } = useDeals(sessionId)
  const [draft, setDraft] = useState({ name: '', category: '', price: '' })
  const [dealDraft, setDealDraft] = useState({
    name: '', description: '', price: '', original_price: '',
    valid_from: '', valid_until: '', mood_tags: '',
  })
  const [saving, setSaving] = useState(false)
  const [dealSaving, setDealSaving] = useState(false)
  const [section, setSection] = useState('menu') // menu | deals

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
    setDraft(d => ({ name: '', category: d.category, price: '' }))
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

  const addDeal = async (e) => {
    e.preventDefault()
    if (!dealDraft.name.trim() || !dealDraft.description.trim() || dealDraft.price === '') return
    setDealSaving(true)
    const { error } = await supabase.from('deals').insert({
      session_id: sessionId,
      name: dealDraft.name.trim(),
      description: dealDraft.description.trim(),
      price: Number(dealDraft.price),
      original_price: dealDraft.original_price !== '' ? Number(dealDraft.original_price) : null,
      valid_from: dealDraft.valid_from || null,
      valid_until: dealDraft.valid_until || null,
      mood_tags: dealDraft.mood_tags || '',
      sort_order: deals.length,
      is_active: true,
    })
    setDealSaving(false)
    if (error) {
      console.error(error)
      alert('Deal save nahi hui. Pehle Supabase mein deals table banaein (SQL diya gaya hai).')
      return
    }
    setDealDraft({
      name: '', description: '', price: '', original_price: '',
      valid_from: '', valid_until: '', mood_tags: '',
    })
    refreshDeals()
  }

  const updateDeal = async (id, patch) => {
    await supabase.from('deals').update(patch).eq('id', id)
    refreshDeals()
  }

  const deleteDeal = async (id) => {
    await supabase.from('deals').delete().eq('id', id)
    refreshDeals()
  }

  const uploadDealPhoto = async (deal, file) => {
    const ext = file.name.split('.').pop()
    const path = `${sessionId}/deal-${deal.id}-${Date.now()}.${ext}`
    try {
      const url = await uploadImage('menu-photos', path, file)
      await updateDeal(deal.id, { photo_url: url })
    } catch (err) {
      console.error(err)
      alert('Photo upload nahi ho saka.')
    }
  }

  const grouped = items.reduce((map, item) => {
    map[item.category] = map[item.category] || []
    map[item.category].push(item)
    return map
  }, {})

  return (
    <div style={{ padding: 16 }}>
      {/* Sub-tabs: Menu | Deals */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" onClick={() => setSection('menu')} style={subTabStyle(section === 'menu')}>
          Menu Items
        </button>
        <button type="button" onClick={() => setSection('deals')} style={subTabStyle(section === 'deals')}>
          Deals / Combos
        </button>
      </div>

      {section === 'deals' ? (
        <>
          <form onSubmit={addDeal} style={formBox}>
            <input
              placeholder="Deal name (e.g. Family Deal)"
              value={dealDraft.name}
              onChange={e => setDealDraft(d => ({ ...d, name: e.target.value }))}
              style={{ ...inputStyle, flex: '2 1 160px' }}
            />
            <input
              placeholder="Items (e.g. 1.5L Drink + Small Biryani + Raita + Salad)"
              value={dealDraft.description}
              onChange={e => setDealDraft(d => ({ ...d, description: e.target.value }))}
              style={{ ...inputStyle, flex: '3 1 220px' }}
            />
            <input
              placeholder="Price"
              type="number"
              value={dealDraft.price}
              onChange={e => setDealDraft(d => ({ ...d, price: e.target.value }))}
              style={{ ...inputStyle, width: 90 }}
            />
            <input
              placeholder="Old price (optional)"
              type="number"
              value={dealDraft.original_price}
              onChange={e => setDealDraft(d => ({ ...d, original_price: e.target.value }))}
              style={{ ...inputStyle, width: 110 }}
            />
            <input
              type="date"
              title="Valid from"
              value={dealDraft.valid_from}
              onChange={e => setDealDraft(d => ({ ...d, valid_from: e.target.value }))}
              style={{ ...inputStyle, width: 140 }}
            />
            <input
              type="date"
              title="Valid until"
              value={dealDraft.valid_until}
              onChange={e => setDealDraft(d => ({ ...d, valid_until: e.target.value }))}
              style={{ ...inputStyle, width: 140 }}
            />
            <select
              value={dealDraft.mood_tags}
              onChange={e => setDealDraft(d => ({ ...d, mood_tags: e.target.value }))}
              style={{ ...inputStyle, width: 140 }}
            >
              <option value="">Any mood</option>
              {MOOD_OPTIONS.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <button type="submit" disabled={dealSaving} style={primaryBtn}>
              {dealSaving ? 'Saving…' : '+ Add Deal'}
            </button>
          </form>

          {deals.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9a9284', padding: '24px 0' }}>
              Abhi koi deal nahi. Upar se Family Deal / Combo add karein.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {deals.map(deal => (
              <div key={deal.id} style={rowBox}>
                <label style={{ cursor: 'pointer', flex: '0 0 auto' }}>
                  {deal.photo_url
                    ? <img src={deal.photo_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                    : <div style={photoPlaceholder}>📷</div>}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={e => e.target.files?.[0] && uploadDealPhoto(deal, e.target.files[0])} />
                </label>

                <div style={{ flex: 1, minWidth: 160 }}>
                  <input
                    defaultValue={deal.name}
                    onBlur={e => e.target.value.trim() && e.target.value !== deal.name && updateDeal(deal.id, { name: e.target.value.trim() })}
                    style={{ ...inputStyle, width: '100%', marginBottom: 4, fontWeight: 700 }}
                  />
                  <input
                    defaultValue={deal.description}
                    onBlur={e => e.target.value !== (deal.description || '') && updateDeal(deal.id, { description: e.target.value.trim() })}
                    style={{ ...inputStyle, width: '100%', fontSize: 12 }}
                  />
                </div>

                <input
                  defaultValue={deal.price}
                  type="number"
                  onBlur={e => Number(e.target.value) !== Number(deal.price) && updateDeal(deal.id, { price: Number(e.target.value) })}
                  style={{ ...inputStyle, width: 85 }}
                />

                <button
                  type="button"
                  onClick={() => updateDeal(deal.id, { is_active: !deal.is_active })}
                  style={{
                    border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700,
                    background: deal.is_active ? 'var(--sage)' : 'var(--clay)', color: '#fff',
                  }}
                >
                  {deal.is_active ? 'Active' : 'Off'}
                </button>

                <button
                  type="button"
                  onClick={() => { if (confirm(`"${deal.name}" delete?`)) deleteDeal(deal.id) }}
                  style={{ border: 'none', background: 'transparent', color: 'var(--clay)', fontSize: 18 }}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <form onSubmit={addItem} style={formBox}>
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
            <button type="submit" disabled={saving} style={primaryBtn}>
              {saving ? 'Adding…' : '+ Add item'}
            </button>
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
                  <div key={item.id} style={rowBox}>
                    <label style={{ cursor: 'pointer', flex: '0 0 auto' }}>
                      {item.photo_url
                        ? <img src={item.photo_url} alt="" style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover' }} />
                        : <div style={photoPlaceholder}>📷</div>}
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
                      type="button"
                      onClick={() => updateItem(item.id, { is_available: !item.is_available })}
                      style={{
                        border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 12, fontWeight: 700,
                        background: item.is_available ? 'var(--sage)' : 'var(--clay)', color: '#fff',
                      }}
                    >
                      {item.is_available ? 'Available' : 'Sold out'}
                    </button>

                    <button
                      type="button"
                      onClick={() => { if (confirm(`"${item.name}" delete karein?`)) deleteItem(item.id) }}
                      aria-label={`Delete ${item.name}`}
                      style={{ border: 'none', background: 'transparent', color: 'var(--clay)', fontSize: 18 }}
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  )
}

const inputStyle = { border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 14 }
const formBox = {
  display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
  background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
  padding: 14, marginBottom: 20,
}
const rowBox = {
  display: 'flex', alignItems: 'center', gap: 10, background: '#fff',
  border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 10, flexWrap: 'wrap',
}
const photoPlaceholder = {
  width: 42, height: 42, borderRadius: 8, background: 'var(--paper-dim)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
}
const primaryBtn = {
  background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', border: 'none',
  borderRadius: 8, padding: '10px 18px', fontWeight: 700, fontSize: 13,
}
function subTabStyle(active) {
  return {
    border: 'none', borderRadius: 999, padding: '8px 16px', fontWeight: 700, fontSize: 13,
    background: active ? 'var(--brand-primary)' : '#fff',
    color: active ? 'var(--brand-primary-text)' : 'var(--ink)',
    border: active ? 'none' : '1px solid var(--line)',
    cursor: 'pointer',
  }
}
