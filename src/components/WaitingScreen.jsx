import { locationLabel } from '../utils/locationLabel.js'
import TicTacToe from './TicTacToe.jsx'
import BallJump from './BallJump.jsx'
import JokeBox from './JokeBox.jsx'

const STATUS_LABEL = {
  pending: { text: 'Order received — waiting for the kitchen', color: 'var(--mustard)' },
  cooking: { text: 'Cooking now', color: 'var(--sage)' },
  served: { text: 'Served — enjoy your meal!', color: 'var(--sky)' },
  cancelled: { text: 'Order cancelled', color: 'var(--clay)' },
}

export default function WaitingScreen({ orders = [], onOrderMore }) {
  const list = Array.isArray(orders) ? orders : (orders ? [orders] : [])

  return (
    <div className="float-in" style={{ padding: '20px 16px 60px' }}>
      {list.map((order, idx) => {
        const status = STATUS_LABEL[order?.status] || STATUS_LABEL.pending
        const isActive = order?.status === 'pending' || order?.status === 'cooking'
        return (
          <div
            key={order?.id || idx}
            className={`ticket-edge ${isActive ? 'soft-pulse' : ''}`}
            style={{
              background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
              padding: 18, textAlign: 'center', marginBottom: 12,
              animationDelay: `${idx * 60}ms`
            }}
          >
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#7a7264', letterSpacing: '0.03em' }}>
              {locationLabel(order?.table_id)}
              {list.length > 1 && (
                <span style={{ marginLeft: 8, opacity: 0.7 }}>· Order {idx + 1}</span>
              )}
            </div>
            <div
              className={isActive ? 'status-glow' : 'success-pop'}
              style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 600, marginTop: 6, color: status.color }}
            >
              {status.text}
            </div>
            {order?.total != null && (
              <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 13, color: '#7a7264' }}>
                PKR {order.total}
              </div>
            )}
          </div>
        )
      })}

      <div style={{ textAlign: 'center', fontSize: 13, color: '#7a7264', margin: '8px 0 16px' }}>
        Sit back — while the kitchen works, here's something to pass the time.
      </div>

      {typeof onOrderMore === 'function' && (
        <button
          onClick={onOrderMore}
          style={{
            width: '100%', marginBottom: 16, background: 'var(--brand-primary)',
            color: 'var(--brand-primary-text)', border: 'none', borderRadius: 999,
            padding: '12px 0', fontWeight: 700, fontSize: 14
          }}
        >
          + Order more from menu
        </button>
      )}

      <TicTacToe />
      <BallJump />
      <JokeBox />
    </div>
  )
}
