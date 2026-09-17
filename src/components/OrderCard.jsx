import { locationLabel } from '../utils/locationLabel.js'

const STATUS_META = {
  pending: { label: 'New', color: 'var(--mustard)' },
  cooking: { label: 'Cooking', color: 'var(--sage)' },
  served: { label: 'Served', color: '#9a9284' },
}

export default function OrderCard({ order, hasWaterAlert, hasWaiterAlert, onAccept, onServe, onResolveAlert, onPrint }) {
  const meta = STATUS_META[order.status] || STATUS_META.pending
  const flashing = hasWaterAlert

  return (
    <div className="ticket-in" style={{
      background: '#fff',
      border: flashing ? '2px solid var(--sky)' : '1px solid var(--line)',
      borderRadius: 'var(--radius)',
      padding: 14,
      display: 'flex', flexDirection: 'column', gap: 8,
      animation: flashing ? 'waterFlash 1s infinite' : 'none',
      position: 'relative'
    }}>
      {flashing && (
        <div style={{
          position: 'absolute', top: -10, right: 10, background: 'var(--sky)', color: '#fff',
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6
        }}>💧 WATER</div>
      )}
      {hasWaiterAlert && (
        <div style={{
          position: 'absolute', top: -10, left: 10, background: 'var(--clay)', color: '#fff',
          fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6
        }}>🔔 WAITER</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ fontFamily: 'var(--mono)', fontSize: 14 }}>{locationLabel(order.table_id)}</strong>
        <span style={{ fontSize: 11, fontWeight: 700, color: meta.color }}>{meta.label.toUpperCase()}</span>
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>
        {order.items.map((it, idx) => (
          <div key={idx}>{it.qty} × {it.name}</div>
        ))}
      </div>
      {order.note && (
        <div style={{ fontSize: 12, fontStyle: 'italic', color: '#7a7264' }}>Note: {order.note}</div>
      )}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>PKR {Number(order.total).toFixed(0)}</div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        {order.status === 'pending' && (
          <button onClick={() => onAccept(order)} style={{
            flex: 1, background: 'var(--sage)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 0', fontWeight: 700, fontSize: 13
          }}>Accept & Cook</button>
        )}
        {order.status === 'cooking' && (
          <button onClick={() => onServe(order)} style={{
            flex: 1, background: 'var(--ink)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 0', fontWeight: 700, fontSize: 13
          }}>Mark Served</button>
        )}
        <button onClick={() => onPrint(order)} aria-label="Print ticket" style={{
          background: 'var(--paper-dim)', border: '1px solid var(--line)',
          borderRadius: 8, padding: '8px 12px', fontSize: 13
        }}>🖨️ Print</button>
        {(hasWaterAlert || hasWaiterAlert) && (
          <button onClick={() => onResolveAlert(order.table_id)} style={{
            background: 'var(--paper-dim)', border: '1px solid var(--line)',
            borderRadius: 8, padding: '8px 12px', fontSize: 13
          }}>Clear flag</button>
        )}
      </div>
      <style>{`
        @keyframes waterFlash {
          0%, 100% { box-shadow: 0 0 0 0 rgba(63,159,214,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(63,159,214,0.15); }
        }
      `}</style>
    </div>
  )
}
