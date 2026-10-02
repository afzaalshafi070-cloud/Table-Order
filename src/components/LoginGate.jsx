import { useState } from 'react'

export default function LoginGate({ onSubmit, error, loading }) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [activationCode, setActivationCode] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim() || !pin.trim()) return
    onSubmit(name.trim(), pin.trim(), activationCode.trim())
  }

  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={submit} style={{
        width: '100%', maxWidth: 360, background: '#fff', border: '1px solid var(--line)',
        borderRadius: 'var(--radius)', padding: 28
      }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#7a7264', marginBottom: 4 }}>
          COUNTER PORTAL
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 24, margin: '0 0 20px' }}>
          Log in to the floor
        </h1>

        <label style={labelStyle}>Restaurant name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Cafe Noor"
          style={inputStyle}
          autoComplete="organization"
        />

        <label style={{ ...labelStyle, marginTop: 14 }}>Secret room PIN</label>
        <input
          value={pin}
          onChange={e => setPin(e.target.value)}
          placeholder="4–6 digit PIN"
          style={inputStyle}
          autoComplete="current-password"
        />

        <label style={{ ...labelStyle, marginTop: 14 }}>
          Activation Code
          <span style={{ fontWeight: 400, color: '#9a9284' }}> (sirf pehli dafa)</span>
        </label>
        <input
          value={activationCode}
          onChange={e => setActivationCode(e.target.value.toUpperCase())}
          placeholder="e.g. TEST-1001"
          style={inputStyle}
          autoComplete="off"
        />
        <div style={{ fontSize: 11, color: '#9a9284', marginTop: 4 }}>
          Naya restaurant banate waqt zaroori. Purana restaurant ho to khali chhor do.
        </div>

        {error && <div style={{ color: 'var(--clay)', fontSize: 13, marginTop: 12 }}>{error}</div>}

        <button type="submit" disabled={loading} style={{
          width: '100%', marginTop: 20, background: 'var(--ink)', color: '#fff', border: 'none',
          borderRadius: 8, padding: '12px 0', fontWeight: 700, fontSize: 15,
          opacity: loading ? 0.6 : 1
        }}>
          {loading ? 'Connecting…' : 'Connect to stream'}
        </button>
      </form>
    </div>
  )
}

const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: '#5a5346', marginBottom: 6 }
const inputStyle = {
  width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px',
  fontSize: 15, background: 'var(--paper-dim)', boxSizing: 'border-box'
}
