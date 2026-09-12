import { useMemo, useState } from 'react'
import { saveEODPdf } from '../utils/pdf.js'

export default function EODReport({ restaurantName, orders, sessionOpenedAt, onClose, onCloseShift }) {
  const [printWidth, setPrintWidth] = useState('80mm')

  const report = useMemo(() => {
    const served = orders.filter(o => o.status !== 'cancelled')
    const itemMap = {}
    let grossRevenue = 0
    served.forEach(o => {
      grossRevenue += Number(o.total)
      o.items.forEach(it => {
        if (!itemMap[it.name]) itemMap[it.name] = { name: it.name, qty: 0, revenue: 0 }
        itemMap[it.name].qty += it.qty
        itemMap[it.name].revenue += it.qty * it.price
      })
    })
    return {
      restaurantName,
      from: new Date(sessionOpenedAt).toLocaleString(),
      to: new Date().toLocaleString(),
      orderCount: served.length,
      grossRevenue,
      itemTotals: Object.values(itemMap),
    }
  }, [orders, restaurantName, sessionOpenedAt])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(32,29,26,0.55)', zIndex: 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480,
        maxHeight: '90vh', overflowY: 'auto', padding: 24
      }}>
        <h2 style={{ fontFamily: 'var(--display)', margin: '0 0 4px' }}>Shift Report</h2>
        <p style={{ fontSize: 13, color: '#7a7264', margin: '0 0 16px' }}>
          {report.from} — {report.to}
        </p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <Stat label="Orders" value={report.orderCount} />
          <Stat label="Gross revenue" value={`PKR ${report.grossRevenue.toFixed(0)}`} />
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--line)' }}>
              <th style={{ padding: '6px 0' }}>Item</th>
              <th style={{ padding: '6px 0' }}>Qty</th>
              <th style={{ padding: '6px 0' }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {report.itemTotals.sort((a,b) => b.revenue - a.revenue).map(row => (
              <tr key={row.name} style={{ borderBottom: '1px solid var(--paper-dim)' }}>
                <td style={{ padding: '6px 0' }}>{row.name}</td>
                <td style={{ padding: '6px 0' }}>{row.qty}</td>
                <td style={{ padding: '6px 0', fontFamily: 'var(--mono)' }}>PKR {row.revenue.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: 8, marginTop: 20, flexWrap: 'wrap' }}>
          <button onClick={() => saveEODPdf(report)} style={btnPrimary}>Save PDF</button>
          <select value={printWidth} onChange={e => setPrintWidth(e.target.value)} style={selectStyle}>
            <option value="58mm">58mm printer</option>
            <option value="80mm">80mm printer</option>
          </select>
          <button onClick={() => window.print()} style={btnSecondary}>Print Slip</button>
          <button onClick={onClose} style={btnGhost}>Close</button>
        </div>

        <div style={{ marginTop: 12 }}>
          <button onClick={() => onCloseShift(report)} style={{
            width: '100%', background: 'var(--clay)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '10px 0', fontWeight: 700
          }}>Confirm: Close Shift</button>
        </div>
      </div>

      {/* Hidden print-only thermal slip, rendered at receipt width */}
      <div className="print-slip" style={{
        width: printWidth, fontFamily: 'var(--mono)', fontSize: 11, padding: 8
      }}>
        <div style={{ textAlign: 'center', fontWeight: 700 }}>{report.restaurantName}</div>
        <div style={{ textAlign: 'center' }}>SHIFT REPORT</div>
        <div>--------------------------------</div>
        <div>{report.to}</div>
        <div>--------------------------------</div>
        {report.itemTotals.map(row => (
          <div key={row.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{row.qty}x {row.name}</span>
            <span>{row.revenue.toFixed(0)}</span>
          </div>
        ))}
        <div>--------------------------------</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>TOTAL</span><span>PKR {report.grossRevenue.toFixed(0)}</span>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ flex: 1, background: 'var(--paper-dim)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: '#7a7264' }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

const btnPrimary = { background: 'var(--ink)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, fontSize: 13 }
const btnSecondary = { background: 'var(--mustard)', color: 'var(--ink)', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 600, fontSize: 13 }
const btnGhost = { background: 'transparent', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 16px', fontSize: 13 }
const selectStyle = { border: '1px solid var(--line)', borderRadius: 8, padding: '10px 8px', fontSize: 13 }
