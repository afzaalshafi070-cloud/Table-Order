import TicTacToe from './TicTacToe.jsx'
import BallJump from './BallJump.jsx'
import JokeBox from './JokeBox.jsx'

const STATUS_LABEL = {
  pending: { text: 'Order received — waiting for the kitchen', color: 'var(--mustard)' },
  cooking: { text: 'Cooking now', color: 'var(--sage)' },
  served: { text: 'Served — enjoy your meal!', color: 'var(--sky)' },
  cancelled: { text: 'Order cancelled', color: 'var(--clay)' },
}

export default function WaitingScreen({ order }) {
  const status = STATUS_LABEL[order?.status] || STATUS_LABEL.pending
  const isActive = order?.status === 'pending' || order?.status === 'cooking'

  return (
    <div className="float-in" style={{ padding: '20px 16px 60px' }}>
      <div
        className={`ticket-edge ${isActive ? 'soft-pulse' : ''}`}
        style={{
          background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
          padding: 18, textAlign: 'center'
        }}
      >
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#7a7264', letterSpacing: '0.03em' }}>
          Table {order?.table_id}
        </div>
        <div
          className={isActive ? 'status-glow' : 'success-pop'}
          style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 600, marginTop: 6, color: status.color }}
        >
          {status.text}
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: '#7a7264' }}>
          Sit back — while the kitchen works, here's something to pass the time.
        </div>
      </div>

      <TicTacToe />
      <BallJump />
      <JokeBox />
    </div>
  )
}
