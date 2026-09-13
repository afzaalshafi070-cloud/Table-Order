import { useState } from 'react'
import { JOKES, RIDDLES } from '../data/menu.js'

export default function JokeBox() {
  const [mode, setMode] = useState('joke')
  const [text, setText] = useState(JOKES[0])

  const roll = (which = mode) => {
    const pool = which === 'joke' ? JOKES : RIDDLES
    setText(pool[Math.floor(Math.random() * pool.length)])
    setMode(which)
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
      padding: 18, marginTop: 16
    }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => roll('joke')} style={tabStyle(mode === 'joke')}>Latifa</button>
        <button onClick={() => roll('riddle')} style={tabStyle(mode === 'riddle')}>Paheli</button>
      </div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, minHeight: 48 }}>{text}</p>
      <button onClick={() => roll()} style={{
        marginTop: 12, background: 'var(--paper-dim)', border: '1px solid var(--line)',
        borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600
      }}>Aur ek sunayen</button>
    </div>
  )
}

function tabStyle(active) {
  return {
    border: 'none', borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600,
    background: active ? 'var(--brand-primary)' : 'var(--paper-dim)',
    color: active ? 'var(--brand-primary-text)' : 'var(--ink)'
  }
}
