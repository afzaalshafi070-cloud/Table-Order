import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const UNITS = ['kg', 'g', 'ltr', 'ml', 'pc', 'dozen', 'pack']

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

export default function RawMaterials({ sessionId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [purchaseFor, setPurchaseFor] = useState(null)

  const [form, setForm] = useState({
    name: '',
    unit: 'kg',
    current_stock: '',
    avg_cost_per_unit: '',
    min_stock_alert: '',
    notes: '',
  })

  const [purchase, setPurchase] = useState({ quantity: '', unit_cost: '', notes: '' })

  const load = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setMsg(null)
    try {
      const { data, error } = await supabase
        .from('raw_materials')
        .select('*')
        .eq('session_id', sessionId)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      setItems(data || [])
    } catch (e) {
      setMsg(e?.message || 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  const resetForm = () => {
    setForm({ name: '', unit: 'kg', current_stock: '', avg_cost_per_unit: '', min_stock_alert: '', notes: '' })
    setEditing(null)
    setShowForm(false)
  }

  const startEdit = (row) => {
    setEditing(row.id)
    setForm({
      name: row.name || '',
      unit: row.unit || 'kg',
      current_stock: String(row.current_stock ?? ''),
      avg_cost_per_unit: String(row.avg_cost_per_unit ?? ''),
      min_stock_alert: String(row.min_stock_alert ?? ''),
      notes: row.notes || '',
    })
    setShowForm(true)
  }

  const save = async (e) => {
    e.preventDefault()
    setMsg(null)
    if (!form.name.trim()) {
      setMsg('Name required')
      return
    }
    try {
      const payload = {
        session_id: sessionId,
        name: form.name.trim(),
        unit: form.unit,
        current_stock: parseFloat(form.current_stock) || 0,
        avg_cost_per_unit: parseFloat(form.avg_cost_per_unit) || 0,
        last_purchase_price: parseFloat(form.avg_cost_per_unit) || 0,
        min_stock_alert: parseFloat(form.min_stock_alert) || 0,
        notes: form.notes || null,
        is_active: true,
      }

      if (editing) {
        const { error } = await supabase
          .from('raw_materials')
          .update({
            name: payload.name,
            unit: payload.unit,
            min_stock_alert: payload.min_stock_alert,
            notes: payload.notes,
          })
          .eq('id', editing)
          .eq('session_id', sessionId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('raw_materials').insert(payload)
        if (error) throw error
      }
      resetForm()
      await load()
      setMsg(editing ? 'Updated' : 'Added')
    } catch (e) {
      setMsg(e?.message || 'Save failed')
    }
  }

  const softDelete = async (id) => {
    if (!confirm('Remove this raw material? (Recipes using it will break)')) return
    try {
      const { error } = await supabase
        .from('raw_materials')
        .update({ is_active: false })
        .eq('id', id)
        .eq('session_id', sessionId)
      if (error) throw error
      await load()
    } catch (e) {
      setMsg(e?.message || 'Delete failed')
    }
  }

  const submitPurchase = async (e) => {
    e.preventDefault()
    if (!purchaseFor) return
    const qty = parseFloat(purchase.quantity)
    const cost = parseFloat(purchase.unit_cost)
    if (!qty || qty <= 0 || cost < 0) {
      setMsg('Enter valid quantity and cost')
      return
    }
    try {
      const { error } = await supabase.rpc('record_purchase', {
        p_session_id: sessionId,
        p_raw_material_id: purchaseFor.id,
        p_quantity: qty,
        p_unit_cost: cost,
        p_notes: purchase.notes || null,
      })
      if (error) throw error
      setPurchaseFor(null)
      setPurchase({ quantity: '', unit_cost: '', notes: '' })
      await load()
      setMsg('Purchase recorded — stock & avg cost updated')
    } catch (e) {
      setMsg(e?.message || 'Purchase failed')
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Raw Materials</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Stock + average cost. Purchases auto-update weighted average.
          </p>
        </div>
        <button type="button" style={btnPrimary} onClick={() => { resetForm(); setShowForm(true) }}>
          + Add Material
        </button>
      </div>

      {msg && (
        <div style={{ ...card, background: msg.includes('fail') || msg.includes('Error') ? '#fef2f2' : '#f0fdf4', marginBottom: 12, fontSize: 13 }}>
          {msg}
        </div>
      )}

      {showForm && (
        <form onSubmit={save} style={{ ...card, marginBottom: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{editing ? 'Edit Material' : 'New Material'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 10, marginBottom: 10 }}>
            <input style={inputStyle} placeholder="Name (e.g. Basmati Rice)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            <select style={inputStyle} value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          {!editing && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input style={inputStyle} type="number" step="any" placeholder="Opening stock" value={form.current_stock} onChange={e => setForm(f => ({ ...f, current_stock: e.target.value }))} />
              <input style={inputStyle} type="number" step="any" placeholder="Cost per unit (PKR)" value={form.avg_cost_per_unit} onChange={e => setForm(f => ({ ...f, avg_cost_per_unit: e.target.value }))} />
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input style={inputStyle} type="number" step="any" placeholder="Min stock alert" value={form.min_stock_alert} onChange={e => setForm(f => ({ ...f, min_stock_alert: e.target.value }))} />
            <input style={inputStyle} placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={btnPrimary}>{editing ? 'Update' : 'Save'}</button>
            <button type="button" style={btnGhost} onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      {purchaseFor && (
        <form onSubmit={submitPurchase} style={{ ...card, marginBottom: 16, borderColor: 'var(--brand-primary)' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Record Purchase — {purchaseFor.name}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input style={inputStyle} type="number" step="any" placeholder={`Quantity (${purchaseFor.unit})`} value={purchase.quantity} onChange={e => setPurchase(p => ({ ...p, quantity: e.target.value }))} required />
            <input style={inputStyle} type="number" step="any" placeholder="Cost per unit (PKR)" value={purchase.unit_cost} onChange={e => setPurchase(p => ({ ...p, unit_cost: e.target.value }))} required />
          </div>
          <input style={{ ...inputStyle, marginBottom: 10 }} placeholder="Notes (optional)" value={purchase.notes} onChange={e => setPurchase(p => ({ ...p, notes: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={btnPrimary}>Save Purchase</button>
            <button type="button" style={btnGhost} onClick={() => setPurchaseFor(null)}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div style={card}>
          <p style={{ margin: 0, color: 'var(--muted)' }}>No raw materials yet. Add Rice, Ghee, Chicken, Spices etc.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(row => {
            const low = row.min_stock_alert > 0 && row.current_stock <= row.min_stock_alert
            return (
              <div key={row.id} style={{ ...card, borderColor: low ? '#ef4444' : 'var(--line)', marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {row.name}
                      {low && <span style={{ marginLeft: 8, fontSize: 11, color: '#ef4444', fontWeight: 800 }}>LOW STOCK</span>}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                      Stock: <strong>{Number(row.current_stock).toFixed(2)} {row.unit}</strong>
                      {' · '}Avg cost: <strong>Rs {Number(row.avg_cost_per_unit).toFixed(2)}/{row.unit}</strong>
                      {row.min_stock_alert > 0 && <> {' · '}Alert below: {row.min_stock_alert}</>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" style={btnGhost} onClick={() => setPurchaseFor(row)}>+ Purchase</button>
                    <button type="button" style={btnGhost} onClick={() => startEdit(row)}>Edit</button>
                    <button type="button" style={{ ...btnGhost, color: '#dc2626' }} onClick={() => softDelete(row.id)}>Remove</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
