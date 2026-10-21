import { useState } from 'react'
import LanguageGate from './LanguageGate.jsx'
import { t, getLang, hasChosenLang } from '../i18n/index.js'
import { supabase } from '../supabaseClient.js'
import { ensureAnonymousAuth } from '../utils/auth.js'
import { getOrCreateDeviceToken } from '../utils/device.js'

// Counter entry: language -> Login (existing) | Register (new restaurant).
// Register: name + PIN + phone + plan -> server returns the auto activation code and a
// recovery code (shown once). Then we log in automatically with the activation code.
export default function LoginGate({ onSubmit, error, loading }) {
  const [stage, setStage] = useState(hasChosenLang() ? 'choose' : 'lang') // lang | choose | login | register | recovery
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [code, setCode] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [plan, setPlan] = useState('trial')
  const [regBusy, setRegBusy] = useState(false)
  const [regError, setRegError] = useState('')
  const [created, setCreated] = useState(null) // { name, pin, activation_code, recovery_code }
  const [copied, setCopied] = useState(false)

  if (stage === 'lang') {
    return <LanguageGate onDone={() => setStage('choose')} />
  }

  const langBtn = (
    <button type="button" onClick={() => setStage('lang')} style={pillBtn}>
      {getLang().toUpperCase()}
    </button>
  )

  const submitLogin = (e) => {
    e.preventDefault()
    if (!name.trim() || !pin.trim()) return
    onSubmit(name.trim(), pin.trim(), code.trim())
  }

  const submitRegister = async (e) => {
    e.preventDefault()
    setRegError('')
    if (!name.trim() || !pin.trim() || !phone.trim()) {
      setRegError(t('reg_required'))
      return
    }
    setRegBusy(true)
    try {
      await ensureAnonymousAuth()
      const { data, error: rpcError } = await supabase.rpc('self_register_restaurant', {
        p_name: name.trim(),
        p_pin: pin.trim(),
        p_phone: phone.trim(),
        p_plan: plan,
        p_city: city.trim() || null,
        p_device_token: getOrCreateDeviceToken(),
      })
      if (rpcError) throw rpcError
      if (!data?.ok) throw new Error(data?.code || 'REGISTER_FAILED')
      setCreated({
        name: data.restaurant_name || name.trim(),
        pin: pin.trim(),
        activation_code: data.activation_code,
        recovery_code: data.recovery_code,
      })
      setStage('recovery')
    } catch (err) {
      setRegError(friendlyRegisterError(err))
    } finally {
      setRegBusy(false)
    }
  }

  // ---------- Choose ----------
  if (stage === 'choose') {
    return (
      <div className="screen" style={centerWrap}>
        <div style={{ width: '100%', maxWidth: 420, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)' }}>{t('counter_portal')}</div>
            {langBtn}
          </div>
          <h1 style={titleStyle}>{t('choose_title')}</h1>
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

  // ---------- Recovery code (shown once) ----------
  if (stage === 'recovery' && created) {
    return (
      <div className="screen" style={centerWrap}>
        <div style={{ ...cardStyle, maxWidth: 420 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)' }}>{t('counter_portal')}</div>
          <h1 style={{ ...titleStyle, marginTop: 4 }}>{created.name}</h1>
          <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-secondary, #5a5346)', lineHeight: 1.5 }}>
            {t('recovery_intro')}
          </p>
          <div style={recoveryBox}>
            <code style={{ fontFamily: 'var(--mono)', fontSize: 'clamp(15px, 3.6vw, 18px)', fontWeight: 700, wordBreak: 'break-all' }}>
              {created.recovery_code}
            </code>
            <button
              type="button"
              onClick={() => { try { navigator.clipboard?.writeText(created.recovery_code); setCopied(true) } catch {} }}
              style={pillBtn}
            >
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{t('recovery_warning')}</p>
          <button
            type="button"
            disabled={loading}
            onClick={() => onSubmit(created.name, created.pin, created.activation_code)}
            style={{ ...primaryBtn, opacity: loading ? 0.6 : 1 }}
          >
            {loading ? t('connecting') : t('recovery_saved_continue')}
          </button>
          {error && <div style={{ color: 'var(--clay)', fontSize: 13, marginTop: 12 }}>{error}</div>}
        </div>
      </div>
    )
  }

  // ---------- Register ----------
  if (stage === 'register') {
    return (
      <div className="screen" style={centerWrap}>
        <form onSubmit={submitRegister} style={{ ...cardStyle, maxWidth: 420 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" onClick={() => setStage('choose')} style={backBtn}>← {t('back')}</button>
            {langBtn}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{t('counter_portal')}</div>
          <h1 style={{ ...titleStyle, marginTop: 4 }}>{t('choose_register')}</h1>

          <label style={labelStyle}>{t('restaurant_name')} *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cafe Noor" style={inputStyle} autoComplete="organization" />

          <label style={{ ...labelStyle, marginTop: 14 }}>{t('pin')} *</label>
          <input value={pin} onChange={e => setPin(e.target.value)} placeholder="4–6 digit PIN" style={inputStyle} inputMode="numeric" autoComplete="off" />

          <label style={{ ...labelStyle, marginTop: 14 }}>{t('reg_phone')} *</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="03001234567" style={inputStyle} inputMode="tel" autoComplete="tel" />

          <label style={{ ...labelStyle, marginTop: 14 }}>{t('reg_city')}</label>
          <input value={city} onChange={e => setCity(e.target.value)} style={inputStyle} autoComplete="address-level2" />

          <label style={{ ...labelStyle, marginTop: 14 }}>{t('reg_plan')}</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" onClick={() => setPlan('trial')} style={planBtn(plan === 'trial')}>
              <div style={{ fontWeight: 800 }}>{t('plan_trial')}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('plan_trial_hint')}</div>
            </button>
            <button type="button" onClick={() => setPlan('paid')} style={planBtn(plan === 'paid')}>
              <div style={{ fontWeight: 800 }}>{t('plan_paid')}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('plan_paid_hint')}</div>
            </button>
          </div>

          {regError && <div style={{ color: 'var(--clay)', fontSize: 13, marginTop: 12, lineHeight: 1.4 }}>{regError}</div>}

          <button type="submit" disabled={regBusy} style={{ ...primaryBtn, opacity: regBusy ? 0.6 : 1 }}>
            {regBusy ? t('connecting') : t('reg_submit')}
          </button>
        </form>
      </div>
    )
  }

  // ---------- Login ----------
  return (
    <div className="screen" style={centerWrap}>
      <form onSubmit={submitLogin} style={{ ...cardStyle, maxWidth: 380 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button type="button" onClick={() => setStage('choose')} style={backBtn}>← {t('back')}</button>
          {langBtn}
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{t('counter_portal')}</div>
        <h1 style={{ ...titleStyle, marginTop: 4 }}>{t('login_title')}</h1>

        <label style={labelStyle}>{t('restaurant_name')}</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cafe Noor" style={inputStyle} autoComplete="organization" />

        <label style={{ ...labelStyle, marginTop: 14 }}>{t('pin')}</label>
        <input value={pin} onChange={e => setPin(e.target.value)} placeholder="4–6 digit PIN" style={inputStyle} inputMode="numeric" autoComplete="current-password" />

        <label style={{ ...labelStyle, marginTop: 14 }}>
          {t('recovery_or_activation')}
          <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> {t('optional')}</span>
        </label>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="RC-XXXXXXXXXXXX" style={inputStyle} autoComplete="off" />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{t('login_code_help')}</div>

        {error && <div style={{ color: 'var(--clay)', fontSize: 13, marginTop: 12, lineHeight: 1.4 }}>{error}</div>}

        <button type="submit" disabled={loading} style={{ ...primaryBtn, opacity: loading ? 0.6 : 1 }}>
          {loading ? t('connecting') : t('connect')}
        </button>
      </form>
    </div>
  )
}

function friendlyRegisterError(err) {
  const raw = String(err?.message || err || '')
  const map = [
    ['RESTAURANT_EXISTS', 'Is naam ka restaurant pehle se register hai. Login karein.'],
    ['NAME_TOO_SIMILAR', 'Ye naam kisi maujood restaurant se bahut milta hai. Apna asli naam likhein, ya Login karein.'],
    ['PHONE_ALREADY_REGISTERED', 'Is phone number par pehle se restaurant hai. Login karein, ya support se rabta karein.'],
    ['DEVICE_LIMIT', 'Is device se register karne ki hadd poori ho gayi hai.'],
    ['INVALID_PHONE', 'Phone number sahi likhein (kam az kam 10 digits).'],
    ['INVALID_PIN', 'PIN 4 se 6 digits ka hona chahiye.'],
    ['INVALID_NAME', 'Restaurant ka naam 2 se 80 characters ka ho.'],
  ]
  for (const [key, text] of map) if (raw.includes(key)) return text
  return 'Register nahi ho saka: ' + (raw.slice(0, 120) || 'dobara try karein.')
}

const centerWrap = { alignItems: 'center', justifyContent: 'center', padding: 20 }
const cardStyle = {
  width: '100%', minWidth: 0, boxSizing: 'border-box', background: 'var(--surface-elevated, #fff)',
  border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 'clamp(20px, 5vw, 28px)',
}
const titleStyle = { fontFamily: 'var(--display)', fontSize: 'clamp(22px, 4vw, 28px)', margin: '4px 0 18px', letterSpacing: '-0.02em' }
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
const pillBtn = {
  background: 'transparent', border: '1px solid var(--line)', borderRadius: 999, padding: '6px 12px',
  fontSize: 12, fontWeight: 700, color: 'var(--ink)', cursor: 'pointer',
}
const backBtn = { background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: 0 }
const primaryBtn = {
  width: '100%', marginTop: 20, background: 'var(--ink)', color: '#fff', border: 'none',
  borderRadius: 10, padding: '12px 0', fontWeight: 700, fontSize: 15, cursor: 'pointer',
}
const recoveryBox = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
  border: '1px dashed var(--brand-primary)', borderRadius: 12, padding: '14px 14px',
}
const planBtn = (active) => ({
  textAlign: 'start', padding: '12px', borderRadius: 12, cursor: 'pointer', minWidth: 0,
  border: active ? '2px solid var(--brand-primary)' : '1px solid var(--line)',
  background: 'var(--surface-elevated, #fff)', color: 'var(--ink)',
})
