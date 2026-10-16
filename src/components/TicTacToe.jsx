import { useState } from 'react'

const LINES = [
  [0,1,2],[3,4,5],[6,7,8],
  [0,3,6],[1,4,7],[2,5,8],
  [0,4,8],[2,4,6]
]

function winner(board) {
  for (const [a,b,c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]
  }
  return board.every(Boolean) ? 'draw' : null
}

/** Simple bot: win if possible, else block, else take center, else random. */
function botMove(board) {
  const empty = board.map((v, i) => v ? null : i).filter(v => v !== null)
  for (const i of empty) {
    const copy = [...board]; copy[i] = 'O'
    if (winner(copy) === 'O') return i
  }
  for (const i of empty) {
    const copy = [...board]; copy[i] = 'X'
    if (winner(copy) === 'X') return i
  }
  if (!board[4]) return 4
  return empty[Math.floor(Math.random() * empty.length)]
}

export default function TicTacToe() {
  const [board, setBoard] = useState(Array(9).fill(null))
  const result = winner(board)

  const play = (i) => {
    if (board[i] || result) return
    const next = [...board]; next[i] = 'X'
    const afterPlayer = winner(next)
    if (!afterPlayer) {
      const bi = botMove(next)
      if (bi !== undefined) next[bi] = 'O'
    }
    setBoard(next)
  }

  const reset = () => setBoard(Array(9).fill(null))

  return (
    <div style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
      padding: 18, marginTop: 16
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ fontFamily: 'var(--display)', fontSize: 17 }}>Tic-Tac-Toe</strong>
        {result && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--sage)' }}>
            {result === 'draw' ? "It's a draw" : result === 'X' ? 'You win! 🎉' : 'Kitchen bot wins'}
          </span>
        )}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
        maxWidth: 210, margin: '0 auto'
      }}>
        {board.map((cell, i) => (
          <button key={i} onClick={() => play(i)} style={{
            aspectRatio: '1', fontSize: 26, fontWeight: 700,
            background: 'var(--paper-dim)', border: '1px solid var(--line)', borderRadius: 8,
            color: cell === 'X' ? 'var(--sky)' : 'var(--clay)'
          }}>{cell}</button>
        ))}
      </div>
      <button onClick={reset} style={{
        marginTop: 12, background: 'var(--paper-dim)', border: '1px solid var(--line)',
        borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600
      }}>New game</button>
    </div>
  )
}
