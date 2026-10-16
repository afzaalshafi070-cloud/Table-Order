import TicTacToe from './TicTacToe.jsx'
import BallJump from './BallJump.jsx'
import JokeBox from './JokeBox.jsx'
import { locationLabel } from '../utils/locationLabel.js'

const STATUS_LABEL = {
  pending: { text: 'Order received — waiting for the kitchen', color: 'var(--mustard)' },
  cooking: { text: 'Cooking now', color: 'var(--sage)' },
  served: { text: 'Served — enjoy your meal!', color: 'var(--sky)' },
  cancelled: { text: 'Order cancelled', color: 'var(--clay)' },
}

export default function WaitingScreen({ orders, onOrderMore }) {
  return (
    <div style={{ padding: '20px 16px 60px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orders.map(order => {
          const status = STATUS_LABEL[order.status] || STATUS_LABEL.pending
          return (
            <div key={order.id} className="ticket-in" style={{
              background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
              padding: 14
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#7a7264' }}>
                  {locationLabel(order.table_id)}
                </span>
                <span style={{ fontWeight: 700, fontSize: 13, color: status.color }}>{status.text}</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 13 }}>
                {order.items.map((it, idx) => (
                  <div key={idx}>{it.qty} × {it.name}</div>
                ))}
              </div>
              {order.note && (
                <div style={{ marginTop: 6, fontSize: 12, fontStyle: 'italic', color: '#7a7264' }}>Note: {order.note}</div>
              )}
              <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>
                PKR {Number(order.total).toFixed(0)}
              </div>
            </div>
          )
        })}
      </div>

      <button
        onClick={onOrderMore}
        style={{
          width: '100%', marginTop: 14, background: 'var(--brand-primary)', color: 'var(--brand-primary-text)',
          border: 'none', borderRadius: 12, padding: '14px 0', fontWeight: 700, fontSize: 15
        }}>
        + Order More
      </button>

      <div style={{ marginTop: 10, fontSize: 13, color: '#7a7264', textAlign: 'center' }}>
        Sit back — while the kitchen works, here's something to pass the time.
      </div>

      <TicTacToe />
      <BallJump />
      <JokeBox />
    </div>
  )
}
