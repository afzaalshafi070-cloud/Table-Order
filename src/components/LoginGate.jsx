import { useState } from 'react'
import LanguageGate from './LanguageGate.jsx'
import { t, getLang, hasChosenLang } from '../i18n/index.js'

// Counter entry: language first, then Login (existing) or Register (new restaurant).
// Register still uses the Admin activation code for now; self-register comes next.
export default function LoginGate({ onSubmit, error, loading }) {
  const [stage, setStage] = useState(hasChosenLang() ? 'choose' : 'lang') // lang | choose | login | register
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [activationCode, setActivationCode] = useState('')

  if (stage === 'lang') {
    return <LanguageGate onDone={() => setStage('choose')} />
  }

  const isRegister = stage === 'register'

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim() || !pin.trim()) return
    onSubmit(name.trim(), pin.trim(), isRegister ? activationCode.trim() : '')
  }

  const langBtn = (
    <button
      type="button"
      onClick={() => setStage('lang')}
      style={{ background: 'transparent', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 10px', fontSize: 11, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer' }}
    >
      {getLang().toUpperCase()}
    </button>
  )

  if (stage === 'choose') {
    return (
      <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ width: '100%', maxWidth: 420, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)' }}>COUNTER PORTAL</div>
            {langBtn}
          </div>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(22px, 4vw, 28px)', margin: '4px 0 18px', letterSpacing: '-0.02em' }}>
            {t('choose_title')}
          </h1>
          <div style={{ display: 'grid', gap: 12 }}>
            <button type="button" onClick={() => setStage('login')} style={optionCard}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{t('choose_login')}</div>
              <div style={hintStyle}>{t('choose_login_hint')}</div>
            </button>
            <button type="button" onClick={() => setStage('register')} style={optionCard}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{t('choose_register')}</div>
              <div style={hintStyle}>{t('choose_register_hint')}</div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <form onSubmit={submit} style={{
        width: '100%', maxWidth: 380, minWidth: 0, boxSizing: 'border-box',
        background: 'var(--surface-elevated, #fff)', border: '1px solid var(--line)',
        borderRadius: 'var(--radius)', padding: 'clamp(20px, 5vw, 28px)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <button type="button" onClick={() => setStage('choose')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: 0 }}>
            ← {t('back')}
          </button>
          {langBtn}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          {t('counter_portal')}
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 24, margin: '4px 0 20px', letterSpacing: '-0.02em' }}>
          {isRegister ? t('choose_register') : t('login_title')}
        </h1>

        <label style={labelStyle}>{t('restaurant_name')}</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cafe Noor" style={inputStyle} autoComplete="organization" />

        <label style={{ ...labelStyle, marginTop: 14 }}>{t('pin')}</label>
        <input value={pin} onChange={e => setPin(e.target.value)} placeholder="4–6 digit PIN" style={inputStyle} autoComplete="current-password" inputMode="numeric" />

        {isRegister && (
          <>
            <label style={{ ...labelStyle, marginTop: 14 }}>
              {t('activation_code')}
              <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> {t('activation_hint')}</span>
            </label>
            <input
              value={activationCode}
              onChange={e => setActivationCode(e.target.value.toUpperCase())}
              placeholder="TO-XXXXXXXX"
              style={inputStyle}
              autoComplete="off"
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{t('activation_help')}</div>
          </>
        )}

        {error && <div style={{ color: 'var(--clay)', fontSize: 13, marginTop: 12, lineHeight: 1.4 }}>{error}</div>}

        <button type="submit" disabled={loading} style={{
          width: '100%', marginTop: 20, background: 'var(--ink)', color: '#fff', border: 'none',
          borderRadius: 10, padding: '12px 0', fontWeight: 700, fontSize: 15, opacity: loading ? 0.6 : 1, cursor: 'pointer',
        }}>
          {loading ? t('connecting') : t('connect')}
        </button>
      </form>
    </div>
  )
}

const optionCard = {
  width: '100%', textAlign: 'start', padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
  background: 'var(--surface-elevated, #fff)', color: 'var(--ink)', border: '1px solid var(--border, var(--line))',
}
const hintStyle = { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary, #5a5346)', marginBottom: 6 }
const inputStyle = {
  width: '100%', boxSizing: 'border-box', minWidth: 0, border: '1px solid var(--line)', borderRadius: 8,
  padding: '10px 12px', fontSize: 15, background: 'var(--paper-dim)', color: 'var(--ink)',
}
