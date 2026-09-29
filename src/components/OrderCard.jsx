import { locationLabel } from '../utils/locationLabel.js'

const STATUS_META = {
  pending: { label: 'New', color: 'var(--mustard)' },
  cooking: { label: 'Cooking', color: 'var(--sage)' },
  served: { label: 'Served', color: '#9a9284' },
}

export default function OrderCard({
  order,
  hasWaterAlert,
  hasWaiterAlert,
  hasBillAlert,
  onAccept,
  onServe,
  onResolveAlert,
  onPrint,
}) {
  const meta = STATUS_META[order.status] || STATUS_META.pending
  const waterFlash = hasWaterAlert
  const billFlash = hasBillAlert

  let border = '1px solid var(--line)'
  let animation = 'none'
  if (billFlash) {
    border = '2px solid #eab308'
    animation = 'billFlash 0.9s infinite'
  } else if (waterFlash) {
    border = '2px solid var(--sky)'
    animation = 'waterFlash 1s infinite'
  } else if (hasWaiterAlert) {
    border = '2px solid var(--clay)'
  }

  return (
    <div
      className="ticket-in"
      style={{
        background: '#fff',
        border,
        borderRadius: 'var(--radius)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        animation,
        position: 'relative',
      }}
    >
      {/* Alerts — clearly separate */}
      {hasBillAlert && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            right: 10,
            background: 'linear-gradient(90deg, #eab308, #facc15)',
            color: '#422006',
            fontSize: 11,
            fontWeight: 800,
            padding: '3px 10px',
            borderRadius: 6,
            boxShadow: '0 0 0 2px #fef08a',
            letterSpacing: 0.3,
          }}
        >
          🧾 ASK FOR BILL
        </div>
      )}
      {hasWaterAlert && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            right: hasBillAlert ? 120 : 10,
            background: 'var(--sky)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 6,
          }}
        >
          💧 WATER
        </div>
      )}
      {hasWaiterAlert && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            left: 10,
            background: 'var(--clay)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 6,
          }}
        >
          🔔 WAITER
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        <strong style={{ fontFamily: 'var(--mono)', fontSize: 14 }}>
          {order.fulfillment === 'delivery'
            ? 'DELIVERY'
            : order.fulfillment === 'takeaway'
              ? 'TAKEAWAY'
              : locationLabel(order.table_id)}
        </strong>
        <span style={{ fontSize: 11, fontWeight: 700, color: meta.color }}>
          {meta.label.toUpperCase()}
        </span>
      </div>
      {order.fulfillment === 'delivery' && (
        <div
          style={{
            fontSize: 12,
            background: '#e0f2fe',
            borderRadius: 8,
            padding: '6px 8px',
          }}
        >
          {order.area_name && (
            <div>
              <b>Area:</b> {order.area_name}
            </div>
          )}
          {order.customer_name && (
            <div>
              {order.customer_name} · {order.customer_phone}
            </div>
          )}
          {order.customer_address && <div>{order.customer_address}</div>}
        </div>
      )}
      {order.fulfillment === 'takeaway' &&
        (order.customer_name || order.customer_phone) && (
          <div style={{ fontSize: 12, color: '#5a5346' }}>
            {order.customer_name} {order.customer_phone}
          </div>
        )}

      <div style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>
        {order.items.map((it, idx) => (
          <div key={idx}>
            {it.qty} × {it.name}
          </div>
        ))}
      </div>
      {order.note && (
        <div style={{ fontSize: 12, fontStyle: 'italic', color: '#7a7264' }}>
          Note: {order.note}
        </div>
      )}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
        PKR {Number(order.total).toFixed(0)}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        {order.status === 'pending' && (
          <button
            onClick={() => onAccept(order)}
            style={{
              flex: 1,
              background: 'var(--sage)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 0',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            Accept & Cook
          </button>
        )}
        {order.status === 'cooking' && (
          <button
            onClick={() => onServe(order)}
            style={{
              flex: 1,
              background: 'var(--ink)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 0',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            Mark Served
          </button>
        )}
        <button
          onClick={() => onPrint(order, 'kot')}
          aria-label="Print KOT"
          style={{
            background: 'var(--paper-dim)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          🍳 KOT
        </button>
        <button
          onClick={() => onPrint(order, 'bill')}
          aria-label="Print Bill"
          style={{
            background: 'var(--paper-dim)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          🧾 Bill
        </button>
        {(hasWaterAlert || hasWaiterAlert || hasBillAlert) && (
          <button
            onClick={() => onResolveAlert(order.table_id)}
            style={{
              background: 'var(--paper-dim)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
            }}
          >
            Clear flag
          </button>
        )}
      </div>
      <style>{`
        @keyframes waterFlash {
          0%, 100% { box-shadow: 0 0 0 0 rgba(63,159,214,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(63,159,214,0.15); }
        }
        @keyframes billFlash {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(234,179,8,0.55);
            background: #fffbeb;
          }
          50% {
            box-shadow: 0 0 0 8px rgba(234,179,8,0.2);
            background: #fef9c3;
          }
        }
      `}</style>
    </div>
  )
}
