// src/components/Analytics.jsx
// Copy this file into your project

import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient.js'

export default function Analytics({ sessionId }) {
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    averageOrderValue: 0,
    topItems: [],
    peakHours: {},
    loading: true,
    error: null
  })

  useEffect(() => {
    if (sessionId) {
      fetchAnalytics()
    }
  }, [sessionId])

  const fetchAnalytics = async () => {
    try {
      setStats(prev => ({ ...prev, loading: true, error: null }))

      // ============================================================
      // TOTAL ORDERS
      // ============================================================
      const { count: totalOrders } = await supabase
        .from('orders')
        .select('id', { count: 'exact' })
        .eq('session_id', sessionId)
        .not('status', 'in', '(cancelled)')

      // ============================================================
      // REVENUE & AVERAGE
      // ============================================================
      const { data: orderData } = await supabase
        .from('orders')
        .select('total')
        .eq('session_id', sessionId)
        .not('status', 'in', '(cancelled)')

      const totalRevenue = (orderData || [])
        .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0)
      const avgOrderValue = totalOrders ? totalRevenue / totalOrders : 0

      // ============================================================
      // TOP ITEMS
      // ============================================================
      const { data: orders } = await supabase
        .from('orders')
        .select('items')
        .eq('session_id', sessionId)
        .not('status', 'in', '(cancelled)')

      const itemCounts = {}
      ;(orders || []).forEach(order => {
        try {
          const items = typeof order.items === 'string'
            ? JSON.parse(order.items)
            : order.items || []
          
          items.forEach(item => {
            const itemName = item.name || 'Unknown'
            itemCounts[itemName] = (itemCounts[itemName] || 0) + (item.qty || 1)
          })
        } catch (e) {
          console.error('Error parsing items:', e)
        }
      })

      const topItems = Object.entries(itemCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }))

      // ============================================================
      // PEAK HOURS
      // ============================================================
      const { data: allOrders } = await supabase
        .from('orders')
        .select('created_at')
        .eq('session_id', sessionId)
        .not('status', 'in', '(cancelled)')

      const peakHours = {}
      ;(allOrders || []).forEach(order => {
        const hour = new Date(order.created_at).getHours()
        peakHours[`${hour}:00`] = (peakHours[`${hour}:00`] || 0) + 1
      })

      setStats({
        totalOrders: totalOrders || 0,
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        averageOrderValue: parseFloat(avgOrderValue.toFixed(2)),
        topItems,
        peakHours,
        loading: false,
        error: null
      })
    } catch (error) {
      console.error('Analytics error:', error)
      setStats(prev => ({
        ...prev,
        loading: false,
        error: error.message
      }))
    }
  }

  if (stats.loading) {
    return (
      <div style={{ padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 14, color: '#999' }}>📊 Analytics load हो रहे हैं...</div>
      </div>
    )
  }

  if (stats.error) {
    return (
      <div style={{ padding: 24, background: '#fee', border: '1px solid #fcc', borderRadius: 8, color: '#c00' }}>
        ❌ Error: {stats.error}
      </div>
    )
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>📊 Analytics Dashboard</h2>

      {/* ============================================================
          KEY METRICS
      ============================================================ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        marginBottom: 24
      }}>
        <MetricCard
          label="कुल Orders"
          value={stats.totalOrders}
          icon="📦"
        />
        <MetricCard
          label="कुल Revenue"
          value={`₹${stats.totalRevenue.toLocaleString('en-IN')}`}
          icon="💰"
        />
        <MetricCard
          label="Average Order"
          value={`₹${stats.averageOrderValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          icon="📈"
        />
        <MetricCard
          label="Top Item"
          value={stats.topItems[0]?.name || 'N/A'}
          icon="⭐"
        />
      </div>

      {/* ============================================================
          TOP ITEMS TABLE
      ============================================================ */}
      {stats.topItems.length > 0 && (
        <div style={{
          marginBottom: 24,
          background: '#fff',
          border: '1px solid #ddd',
          borderRadius: 8,
          overflow: 'hidden'
        }}>
          <div style={{
            padding: 12,
            background: 'var(--brand-primary)',
            color: 'white',
            fontWeight: 'bold'
          }}>
            🔥 Top 10 Most Ordered Items
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd', background: '#f9f9f9' }}>
                <th style={{ textAlign: 'left', padding: 12, fontWeight: 'bold' }}>Item Name</th>
                <th style={{ textAlign: 'right', padding: 12, fontWeight: 'bold' }}>Orders</th>
                <th style={{ textAlign: 'center', padding: 12, fontWeight: 'bold' }}>%</th>
              </tr>
            </thead>
            <tbody>
              {stats.topItems.map((item, idx) => {
                const percentage = ((item.count / stats.topItems[0].count) * 100).toFixed(0)
                return (
                  <tr key={item.name} style={{
                    borderBottom: '1px solid #eee',
                    background: idx % 2 === 0 ? '#fafafa' : '#fff'
                  }}>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontWeight: idx < 3 ? 'bold' : 'normal' }}>
                        {idx < 3 ? ['🥇', '🥈', '🥉'][idx] : '•'} {item.name}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', padding: 12, fontWeight: 'bold' }}>
                      {item.count}
                    </td>
                    <td style={{ textAlign: 'center', padding: 12 }}>
                      <div style={{
                        background: 'var(--brand-primary)',
                        color: 'white',
                        borderRadius: 4,
                        padding: '2px 6px',
                        fontSize: 12
                      }}>
                        {percentage}%
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ============================================================
          PEAK HOURS
      ============================================================ */}
      {Object.keys(stats.peakHours).length > 0 && (
        <div style={{
          background: '#fff',
          border: '1px solid #ddd',
          borderRadius: 8,
          overflow: 'hidden'
        }}>
          <div style={{
            padding: 12,
            background: 'var(--brand-primary)',
            color: 'white',
            fontWeight: 'bold'
          }}>
            ⏰ Peak Order Hours
          </div>
          <div style={{ padding: 16 }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
              gap: 12
            }}>
              {Object.entries(stats.peakHours)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 12)
                .map(([hour, count]) => (
                  <div key={hour} style={{
                    textAlign: 'center',
                    padding: 12,
                    background: '#f0f0f0',
                    borderRadius: 4,
                    border: '1px solid #ddd'
                  }}>
                    <div style={{ fontSize: 12, color: '#666' }}>{hour}</div>
                    <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--brand-primary)' }}>
                      {count}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================
          REFRESH BUTTON
      ============================================================ */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button
          onClick={fetchAnalytics}
          style={{
            padding: '10px 20px',
            background: 'var(--brand-primary)',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          🔄 Refresh Analytics
        </button>
      </div>
    </div>
  )
}

/**
 * ============================================================
 * METRIC CARD COMPONENT
 * ============================================================
 */
function MetricCard({ label, value, icon = '📊' }) {
  return (
    <div style={{
      padding: 16,
      background: '#fff',
      border: '1px solid #ddd',
      borderRadius: 8,
      textAlign: 'center'
    }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--brand-primary)' }}>
        {value}
      </div>
    </div>
  )
}
