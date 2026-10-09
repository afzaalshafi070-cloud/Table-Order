import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const card = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
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

const RANGE_OPTIONS = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'yesterday', label: 'Yesterday', days: 1 },
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
]

function rangeToDates(id) {
  const now = new Date()
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  if (id === 'today') {
    return { from: start.toISOString(), to: end.toISOString() }
  }
  if (id === 'yesterday') {
    start.setDate(start.getDate() - 1)
    const yEnd = new Date(start)
    yEnd.setHours(23, 59, 59, 999)
    return { from: start.toISOString(), to: yEnd.toISOString() }
  }
  const days = RANGE_OPTIONS.find(r => r.id === id)?.days || 7
  start.setDate(start.getDate() - days)
  return { from: start.toISOString(), to: end.toISOString() }
}

export default function WasteAlerts({ sessionId }) {
  const [range, setRange] = useState('7d')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setMsg(null)
    try {
      const { from, to } = rangeToDates(range)
      const { data, error } = await supabase.rpc('detect_waste', {
        p_session_id: sessionId,
        p_from: from,
        p_to: to,
      })
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      setMsg(e?.message || 'Detection failed')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [sessionId, range])

  useEffect(() => { load() }, [load])

  const redCount = rows.filter(r => r.status === 'RED').length
  const yellowCount = rows.filter(r => r.status === 'YELLOW').length
  const totalLeakValue = rows
    .filter(r => r.difference > 0)
    .reduce((s, r) => s + (Number(r.difference_value) || 0), 0)

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Waste / Theft Detector</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
          Theoretical usage (recipes × sales) vs actual stock deduction. Red = possible leakage.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {RANGE_OPTIONS.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRange(r.id)}
            style={{
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '8px 14px',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              background: range === r.id ? 'var(--brand-primary)' : 'var(--paper)',
              color: range === r.id ? 'var(--brand-primary-text)' : 'var(--ink)',
            }}
          >
            {r.label}
          </button>
        ))}
        <button type="button" style={btnPrimary} onClick={load} disabled={loading}>
          {loading ? 'Checking…' : 'Run Check'}
        </button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Red Alerts</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#dc2626' }}>{redCount}</div>
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Yellow</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ea580c' }}>{yellowCount}</div>
        </div>
        <div style={{ ...card, marginBottom: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Est. Leak Value</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: totalLeakValue > 0 ? '#dc2626' : '#16a34a' }}>
            Rs {totalLeakValue.toFixed(0)}
          </div>
        </div>
      </div>

      {msg && <div style={{ ...card, background: '#fef2f2', fontSize: 13 }}>{msg}</div>}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Analyzing…</p>
      ) : rows.length === 0 ? (
        <div style={card}>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            No data for this period. Ensure recipes are set and orders are marked Served/Completed
            (stock deducts automatically on status change).
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--line)' }}>
                <th style={{ padding: '8px 6px' }}>Material</th>
                <th style={{ padding: '8px 6px' }}>Theoretical</th>
                <th style={{ padding: '8px 6px' }}>Actual</th>
                <th style={{ padding: '8px 6px' }}>Diff</th>
                <th style={{ padding: '8px 6px' }}>Value</th>
                <th style={{ padding: '8px 6px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isRed = r.status === 'RED'
                const isYellow = r.status === 'YELLOW'
                return (
                  <tr
                    key={r.raw_material_id}
                    style={{
                      borderBottom: '1px solid var(--paper-dim)',
                      background: isRed ? '#fef2f2' : isYellow ? '#fff7ed' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 6px', fontWeight: 600 }}>
                      {r.material_name}
                      <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>{r.unit}</span>
                    </td>
                    <td style={{ padding: '10px 6px', fontFamily: 'var(--mono)' }}>
                      {Number(r.theoretical_usage).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 6px', fontFamily: 'var(--mono)' }}>
                      {Number(r.actual_usage).toFixed(2)}
                    </td>
                    <td style={{
                      padding: '10px 6px',
                      fontFamily: 'var(--mono)',
                      fontWeight: 700,
                      color: Number(r.difference) > 0 ? '#dc2626' : '#16a34a',
                    }}>
                      {Number(r.difference) > 0 ? '+' : ''}{Number(r.difference).toFixed(2)}
                    </td>
                    <td style={{ padding: '10px 6px', fontFamily: 'var(--mono)' }}>
                      Rs {Number(r.difference_value).toFixed(0)}
                    </td>
                    <td style={{ padding: '10px 6px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 800,
                        background: isRed ? '#fee2e2' : isYellow ? '#ffedd5' : '#dcfce7',
                        color: isRed ? '#dc2626' : isYellow ? '#ea580c' : '#16a34a',
                      }}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ ...card, marginTop: 16, fontSize: 12, color: 'var(--muted)' }}>
        <strong>How it works:</strong> When an order is marked Served/Completed, system deducts
        ingredients from stock using recipes. This report compares “should have used” (from sales)
        vs “actually deducted”. Big positive difference = possible waste or theft.
      </div>
    </div>
  )
}
