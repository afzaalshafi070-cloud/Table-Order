import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const inputStyle = {
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
  background: 'var(--paper)',
  color: 'var(--ink)',
}

const btnPrimary = {
  background: 'var(--brand-primary)',
  color: 'var(--brand-primary-text)',
  border: 'none',
  borderRadius: 8,
  padding: '10px 16px',
  fontWeight: 700,
  fontSize: 13,
  cursor: 'pointer',
}

const btnGhost = {
  background: 'transparent',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '8px 12px',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  color: 'var(--ink)',
}

const card = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
}

export default function RecipeBuilder({ sessionId }) {
  const [menuItems, setMenuItems] = useState([])
  const [materials, setMaterials] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [recipes, setRecipes] = useState([])
  const [cogs, setCogs] = useState(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [addMatId, setAddMatId] = useState('')
  const [addQty, setAddQty] = useState('')

  const loadBase = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      const [miRes, rmRes] = await Promise.all([
        supabase.from('menu_items').select('id, name, category, price').eq('session_id', sessionId).order('category').order('name'),
        supabase.from('raw_materials').select('id, name, unit, avg_cost_per_unit').eq('session_id', sessionId).eq('is_active', true).order('name'),
      ])
      if (miRes.error) throw miRes.error
      if (rmRes.error) throw rmRes.error
      setMenuItems(miRes.data || [])
      setMaterials(rmRes.data || [])
    } catch (e) {
      setMsg(e?.message || 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { loadBase() }, [loadBase])

  const loadRecipes = useCallback(async (menuItemId) => {
    if (!menuItemId) {
      setRecipes([])
      setCogs(null)
      return
    }
    setMsg(null)
    try {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, quantity, raw_material_id, raw_materials(id, name, unit, avg_cost_per_unit)')
        .eq('menu_item_id', menuItemId)
      if (error) throw error
      setRecipes(data || [])

      const { data: cogsData, error: cogsErr } = await supabase.rpc('calculate_recipe_cogs', {
        p_menu_item_id: menuItemId,
      })
      if (!cogsErr) setCogs(cogsData)
      else setCogs(null)
    } catch (e) {
      setMsg(e?.message || 'Recipe load failed')
      setRecipes([])
    }
  }, [])

  useEffect(() => {
    if (selectedId) loadRecipes(selectedId)
  }, [selectedId, loadRecipes])

  const selectedItem = menuItems.find(m => m.id === selectedId)

  const addIngredient = async (e) => {
    e.preventDefault()
    if (!selectedId || !addMatId || !addQty) return
    const qty = parseFloat(addQty)
    if (qty <= 0) {
      setMsg('Quantity must be > 0')
      return
    }
    try {
      const { error } = await supabase.from('recipes').insert({
        menu_item_id: selectedId,
        raw_material_id: addMatId,
        quantity: qty,
      })
      if (error) throw error
      setAddMatId('')
      setAddQty('')
      await loadRecipes(selectedId)
      setMsg('Ingredient added')
    } catch (e) {
      setMsg(e?.message || 'Add failed (maybe already exists)')
    }
  }

  const removeIngredient = async (recipeId) => {
    try {
      const { error } = await supabase.from('recipes').delete().eq('id', recipeId)
      if (error) throw error
      await loadRecipes(selectedId)
    } catch (e) {
      setMsg(e?.message || 'Remove failed')
    }
  }

  const updateQty = async (recipeId, newQty) => {
    const q = parseFloat(newQty)
    if (!q || q <= 0) return
    try {
      const { error } = await supabase.from('recipes').update({ quantity: q }).eq('id', recipeId)
      if (error) throw error
      await loadRecipes(selectedId)
    } catch (e) {
      setMsg(e?.message || 'Update failed')
    }
  }

  const usedMaterialIds = new Set(recipes.map(r => r.raw_material_id))
  const availableMaterials = materials.filter(m => !usedMaterialIds.has(m.id))

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Recipe Builder</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
          Har dish ke ingredients + quantity set karo. System auto COGS nikalega.
        </p>
      </div>

      {msg && (
        <div style={{ ...card, background: '#f0fdf4', fontSize: 13 }}>{msg}</div>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : (
        <>
          <div style={{ ...card }}>
            <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>Select Menu Item</label>
            <select
              style={inputStyle}
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            >
              <option value="">— Choose dish —</option>
              {menuItems.map(m => (
                <option key={m.id} value={m.id}>
                  {m.category} · {m.name} (Rs {Number(m.price).toFixed(0)})
                </option>
              ))}
            </select>
          </div>

          {selectedItem && (
            <>
              <div style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{selectedItem.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                    Selling: Rs {Number(selectedItem.price).toFixed(0)}
                    {cogs != null && (
                      <> · COGS: <strong style={{ color: cogs > selectedItem.price * 0.6 ? '#dc2626' : '#16a34a' }}>
                        Rs {Number(cogs).toFixed(2)}
                      </strong></>
                    )}
                  </div>
                </div>
                {cogs != null && selectedItem.price > 0 && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>Gross after COGS</div>
                    <div style={{ fontWeight: 800, fontSize: 18, color: (selectedItem.price - cogs) >= 0 ? '#16a34a' : '#dc2626' }}>
                      Rs {(selectedItem.price - cogs).toFixed(0)}
                    </div>
                  </div>
                )}
              </div>

              <div style={card}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14 }}>Ingredients</h3>
                {recipes.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>No ingredients yet. Add below.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {recipes.map(r => {
                      const mat = r.raw_materials
                      const lineCost = (r.quantity || 0) * (mat?.avg_cost_per_unit || 0)
                      return (
                        <div key={r.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                          padding: '8px 0', borderBottom: '1px solid var(--paper-dim)',
                        }}>
                          <div style={{ flex: 1, minWidth: 120, fontWeight: 600, fontSize: 14 }}>
                            {mat?.name || '—'}
                          </div>
                          <input
                            type="number"
                            step="any"
                            style={{ ...inputStyle, width: 90 }}
                            defaultValue={r.quantity}
                            onBlur={e => {
                              if (parseFloat(e.target.value) !== r.quantity) {
                                updateQty(r.id, e.target.value)
                              }
                            }}
                          />
                          <span style={{ fontSize: 12, color: 'var(--muted)', minWidth: 36 }}>{mat?.unit}</span>
                          <span style={{ fontSize: 12, fontFamily: 'var(--mono)', minWidth: 70 }}>
                            Rs {lineCost.toFixed(2)}
                          </span>
                          <button type="button" style={{ ...btnGhost, color: '#dc2626', padding: '6px 10px' }} onClick={() => removeIngredient(r.id)}>
                            ✕
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}

                {availableMaterials.length > 0 && (
                  <form onSubmit={addIngredient} style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 100px auto', gap: 8 }}>
                    <select style={inputStyle} value={addMatId} onChange={e => setAddMatId(e.target.value)} required>
                      <option value="">+ Add ingredient</option>
                      {availableMaterials.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>
                      ))}
                    </select>
                    <input style={inputStyle} type="number" step="any" placeholder="Qty" value={addQty} onChange={e => setAddQty(e.target.value)} required />
                    <button type="submit" style={btnPrimary}>Add</button>
                  </form>
                )}

                {materials.length === 0 && (
                  <p style={{ marginTop: 12, fontSize: 13, color: '#ea580c' }}>
                    Pehle Raw Materials tab me ingredients add karo.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
