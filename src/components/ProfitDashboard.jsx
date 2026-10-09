import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

const card = {
  background: 'var(--paper)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 16,
  marginBottom: 12,
}

const STATUS_STYLE = {
  HEALTHY: { bg: '#f0fdf4', color: '#16a34a', label: 'Healthy' },
  LOW: { bg: '#fff7ed', color: '#ea580c', label: 'Low Margin' },
  LOSS: { bg: '#fef2f2', color: '#dc2626', label: 'LOSS' },
  NO_RECIPE: { bg: '#f8fafc', color: '#64748b', label: 'No Recipe' },
}

export default function ProfitDashboard({ sessionId }) {
  const [rows, setRows] = useState([])
  const [lowStock, setLowStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setMsg(null)
    try {
      const [profitRes, stockRes] = await Promise.all([
        supabase.rpc('get_menu_profit_overview', { p_session_id: sessionId }),
        supabase.rpc('get_low_stock_alerts', { p_session_id: sessionId }),
      ])
      if (profitRes.error) throw profitRes.error
      setRows(profitRes.data || [])
      setLowStock(stockRes.data || [])
    } catch (e) {
      setMsg(e?.message || 'Load failed')
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    if (filter === 'all') return true
    return r.profit_status === filter
  })

  const summary = {
    healthy: rows.filter(r => r.profit_status === 'HEALTHY').length,
    low: rows.filter(r => r.profit_status === 'LOW').length,
    loss: rows.filter(r => r.profit_status === 'LOSS').length,
    noRecipe: rows.filter(r => r.profit_status === 'NO_RECIPE').length,
  }

  return (
    <div style={{ padding: 16, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Profit Dashboard</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
          Har dish ka Net Profit = Selling − Recipe COGS − Overhead Share
        </p>
      </div>

      {msg && <div style={{ ...card, background: '#fef2f2', fontSize: 13 }}>{msg}</div>}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { key: 'all', label: 'All', count: rows.length, color: '#334155' },
          { key: 'HEALTHY', label: 'Healthy', count: summary.healthy, color: '#16a34a' },
          { key: 'LOW', label: 'Low', count: summary.low, color: '#ea580c' },
          { key: 'LOSS', label: 'Loss', count: summary.loss, color: '#dc2626' },
          { key: 'NO_RECIPE', label: 'No Recipe', count: summary.noRecipe, color: '#64748b' },
        ].map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => setFilter(s.key === 'all' ? 'all' : s.key)}
            style={{
              ...card,
              marginBottom: 0,
              cursor: 'pointer',
              borderColor: filter === (s.key === 'all' ? 'all' : s.key) ? s.color : 'var(--line)',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.count}</div>
          </button>
        ))}
      </div>

      {/* Low stock alerts */}
      {lowStock.length > 0 && (
        <div style={{ ...card, borderColor: '#ef4444', background: '#fef2f2' }}>
          <div style={{ fontWeight: 800, color: '#dc2626', marginBottom: 8 }}>⚠ Low Stock Alerts</div>
          {lowStock.map(s => (
            <div key={s.raw_material_id} style={{ fontSize: 13, marginBottom: 4 }}>
              <strong>{s.name}</strong> — {Number(s.current_stock).toFixed(2)} {s.unit} left (alert at {s.min_stock_alert})
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      ) : filtered.length === 0 ? (
        <div style={card}>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            {rows.length === 0
              ? 'No menu items. Pehle Menu Editor me dishes add karo, phir Recipe Builder me recipes set karo.'
              : 'No items match this filter.'}
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--line)' }}>
                <th style={{ padding: '8px 6px' }}>Dish</th>
                <th style={{ padding: '8px 6px' }}>Price</th>
                <th style={{ padding: '8px 6px' }}>COGS</th>
                <th style={{ padding: '8px 6px' }}>Overhead</th>
                <th style={{ padding: '8px 6px' }}>Net Profit</th>
                <th style={{ padding: '8px 6px' }}>Margin</th>
                <th style={{ padding: '8px 6px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const st = STATUS_STYLE[r.profit_status] || STATUS_STYLE.NO_RECIPE
                return (
                  <tr key={r.menu_item_id} style={{ borderBottom: '1px solid var(--paper-dim)' }}>
                    <td style={{ padding: '10px 6px' }}>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.category}</div>
                    </td>
                    <td style={{ padding: '10px 6px', fontFamily: 'var(--mono)' }}>
                      {Number(r.selling_price).toFixed(0)}
                    </td>
                    <td style={{ padding: '10px 6px', fontFamily: 'var(--mono)' }}>
                      {r.has_recipe ? Number(r.cogs).toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: '10px 6px', fontFamily: 'var(--mono)' }}>
                      {Number(r.overhead_share).toFixed(1)}
                    </td>
                    <td style={{
                      padding: '10px 6px',
                      fontFamily: 'var(--mono)',
                      fontWeight: 700,
                      color: Number(r.net_profit) < 0 ? '#dc2626' : '#16a34a',
                    }}>
                      {Number(r.net_profit).toFixed(1)}
                    </td>
                    <td style={{ padding: '10px 6px', fontFamily: 'var(--mono)' }}>
                      {r.has_recipe ? `${Number(r.margin_percent).toFixed(0)}%` : '—'}
                    </td>
                    <td style={{ padding: '10px 6px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: st.bg,
                        color: st.color,
                        fontSize: 11,
                        fontWeight: 700,
                      }}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <button
          type="button"
          onClick={load}
          style={{
            background: 'transparent',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '8px 14px',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
