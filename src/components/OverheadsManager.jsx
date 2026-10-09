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

const PRESETS = [
  'Staff Salaries',
  'Rent',
  'Gas / Fuel',
  'Electricity',
  'Water',
  'Packaging',
  'Marketing',
  'Other',
]

export default function OverheadsManager({ sessionId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [perPlate, setPerPlate] = useState(0)

  const [form, setForm] = useState({
    name: '',
    monthly_amount: '',
    allocation_method: 'per_plate',
    expected_monthly_plates: '1000',
  })

  const load = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setMsg(null)
    try {
      const { data, error } = await supabase
        .from('overheads')
        .select('*')
        .eq('session_id', sessionId)
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      setItems(data || [])

      const { data: oh } = await supabase.rpc('calculate_overhead_per_plate', {
        p_session_id: sessionId,
      })
      setPerPlate(Number(oh) || 0)
    } catch (e) {
      setMsg(e?.message || 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  const resetForm = () => {
    setForm({ name: '', monthly_amount: '', allocation_method: 'per_plate', expected_monthly_plates: '1000' })
    setEditing(null)
    setShowForm(false)
  }

  const startEdit = (row) => {
    setEditing(row.id)
    setForm({
      name: row.name,
      monthly_amount: String(row.monthly_amount ?? ''),
      allocation_method: row.allocation_method || 'per_plate',
      expected_monthly_plates: String(row.expected_monthly_plates ?? 1000),
    })
    setShowForm(true)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    try {
      const payload = {
        session_id: sessionId,
        name: form.name.trim(),
        monthly_amount: parseFloat(form.monthly_amount) || 0,
        allocation_method: form.allocation_method,
        expected_monthly_plates: parseInt(form.expected_monthly_plates, 10) || 1000,
        is_active: true,
      }
      if (editing) {
        const { error } = await supabase
          .from('overheads')
          .update({
            name: payload.name,
            monthly_amount: payload.monthly_amount,
            allocation_method: payload.allocation_method,
            expected_monthly_plates: payload.expected_monthly_plates,
          })
          .eq('id', editing)
          .eq('session_id', sessionId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('overheads').insert(payload)
        if (error) throw error
      }
      resetForm()
      await load()
      setMsg('Saved')
    } catch (e) {
      setMsg(e?.message || 'Save failed')
    }
  }

  const softDelete = async (id) => {
    if (!confirm('Remove this overhead?')) return
    try {
      await supabase.from('overheads').update({ is_active: false }).eq('id', id).eq('session_id', sessionId)
      await load()
    } catch (e) {
      setMsg(e?.message || 'Delete failed')
    }
  }

  const totalMonthly = items.reduce((s, r) => s + (Number(r.monthly_amount) || 0), 0)

  return (
    <div style={{ padding: 16, maxWidth: 900, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Overheads</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Monthly fixed costs → per-plate share auto calculate hota hai.
          </p>
        </div>
        <button type="button" style={btnPrimary} onClick={() => { resetForm(); setShowForm(true) }}>+ Add Overhead</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Total Monthly Overheads</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Rs {totalMonthly.toLocaleString()}</div>
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Overhead Share / Plate</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand-primary)' }}>Rs {perPlate.toFixed(2)}</div>
        </div>
      </div>

      {msg && <div style={{ ...card, background: '#f0fdf4', fontSize: 13 }}>{msg}</div>}

      {showForm && (
        <form onSubmit={save} style={card}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>{editing ? 'Edit' : 'New'} Overhead</h3>
          <div style={{ marginBottom: 10 }}>
            <input
              style={inputStyle}
              list="overhead-presets"
              placeholder="Name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
            <datalist id="overhead-presets">
              {PRESETS.map(p => <option key={p} value={p} />)}
            </datalist>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <input style={inputStyle} type="number" step="any" placeholder="Monthly amount (PKR)" value={form.monthly_amount} onChange={e => setForm(f => ({ ...f, monthly_amount: e.target.value }))} required />
            <select style={inputStyle} value={form.allocation_method} onChange={e => setForm(f => ({ ...f, allocation_method: e.target.value }))}>
              <option value="per_plate">Per Plate</option>
              <option value="percentage_of_sales">% of Sales (report only)</option>
            </select>
          </div>
          {form.allocation_method === 'per_plate' && (
            <input
              style={{ ...inputStyle, marginBottom: 10 }}
              type="number"
              placeholder="Expected monthly plates (for share calc)"
              value={form.expected_monthly_plates}
              onChange={e => setForm(f => ({ ...f, expected_monthly_plates: e.target.value }))}
            />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={btnPrimary}>Save</button>
            <button type="button" style={btnGhost} onClick={resetForm}>Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : items.length === 0 ? (
        <div style={card}><p style={{ margin: 0, color: 'var(--muted)' }}>No overheads yet. Add Staff, Rent, Gas etc.</p></div>
      ) : (
        items.map(row => (
          <div key={row.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{row.name}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                  Rs {Number(row.monthly_amount).toLocaleString()}/month
                  {' · '}{row.allocation_method === 'per_plate' ? `÷ ${row.expected_monthly_plates} plates` : '% of sales'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" style={btnGhost} onClick={() => startEdit(row)}>Edit</button>
                <button type="button" style={{ ...btnGhost, color: '#dc2626' }} onClick={() => softDelete(row.id)}>Remove</button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
