import { useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { getOrCreateTabSecret } from '../utils/auth.js'

/**
 * Counter Settings panel:
 * - Restaurant info
 * - Change PIN (current / new / confirm) — never shows plaintext PIN
 * - New Order Sound ON/OFF
 * - Session info
 * - Secure logout
 */
export default function CounterSettings({
  session,
  soundEnabled,
  onSoundChange,
  onLogout,
  onCloseShift,
}) {
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [pinMsg, setPinMsg] = useState(null)
  const [pinError, setPinError] = useState(null)
  const [pinLoading, setPinLoading] = useState(false)

  const changePin = async (e) => {
    e.preventDefault()
    setPinMsg(null)
    setPinError(null)

    if (!currentPin || !newPin || !confirmPin) {
      setPinError('Sab fields zaroori hain.')
      return
    }
    if (newPin.length < 4 || newPin.length > 32) {
      setPinError('New PIN 4 se 32 characters ka hona chahiye.')
      return
    }
    if (newPin !== confirmPin) {
      setPinError('New PIN aur Confirm PIN match nahi karte.')
      return
    }
    if (newPin === currentPin) {
      setPinError('Naya PIN purane PIN se different hona chahiye.')
      return
    }

    setPinLoading(true)
    try {
      const { data, error } = await supabase.rpc('staff_change_pin', {
        p_session_id: session.id,
        p_tab_secret: getOrCreateTabSecret(),
        p_current_pin: currentPin,
        p_new_pin: newPin,
      })
      if (error) throw error
      if (!data?.ok) {
        throw new Error(data?.code || 'PIN_CHANGE_FAILED')
      }
      setPinMsg('PIN successfully change ho gaya.')
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
    } catch (err) {
      const msg = err?.message || ''
      if (msg.includes('INVALID_CURRENT_PIN') || msg.includes('INVALID_PIN')) {
        setPinError('Current PIN ghalat hai.')
      } else if (msg.includes('NOT_AUTHORIZED') || msg.includes('SESSION')) {
        setPinError('Session expire ho gaya. Dobara login karein.')
      } else {
        setPinError('PIN change nahi ho saka. Dobara try karein.')
      }
    } finally {
      setPinLoading(false)
    }
  }

  const openedAt = session?.shift_started_at || session?.created_at
  const openedLabel = openedAt
    ? new Date(openedAt).toLocaleString()
    : '—'

  return (
    <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--display)', fontSize: 22 }}>
        ⚙️ Settings
      </h2>

      {/* Restaurant info */}
      <section style={cardStyle}>
        <h3 style={h3Style}>Restaurant information</h3>
        <Row label="Name" value={session?.restaurant_name || '—'} />
        <Row label="Restaurant ID" value={session?.restaurant_id || '—'} mono />
        <Row
          label="Tax"
          value={
            session?.tax_percent
              ? `${session.tax_label || 'Tax'} ${session.tax_percent}%`
              : 'None'
          }
        />
        {session?.logo_url && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <img
              src={session.logo_url}
              alt="Logo"
              style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }}
            />
            <span style={{ fontSize: 12, color: '#666' }}>Current logo</span>
          </div>
        )}
      </section>

      {/* Change PIN */}
      <section style={cardStyle}>
        <h3 style={h3Style}>Change PIN</h3>
        <p style={{ fontSize: 12, color: '#666', margin: '0 0 12px' }}>
          PIN kabhi screen par ya logs mein plaintext nahi dikhaya jata. Sirf hashed store hota hai.
        </p>
        <form onSubmit={changePin} style={{ display: 'grid', gap: 10 }}>
          <label style={labelStyle}>
            Current PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              style={inputStyle}
              placeholder="••••"
            />
          </label>
          <label style={labelStyle}>
            New PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              style={inputStyle}
              placeholder="4–32 characters"
            />
          </label>
          <label style={labelStyle}>
            Confirm New PIN
            <input
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              style={inputStyle}
              placeholder="Dobara likhein"
            />
          </label>
          {pinError && (
            <div style={{ color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>{pinError}</div>
          )}
          {pinMsg && (
            <div style={{ color: '#15803d', fontSize: 13, fontWeight: 600 }}>{pinMsg}</div>
          )}
          <button
            type="submit"
            disabled={pinLoading}
            style={{
              ...primaryBtn,
              opacity: pinLoading ? 0.7 : 1,
            }}
          >
            {pinLoading ? 'Saving…' : 'Update PIN'}
          </button>
        </form>
      </section>

      {/* Sound / notifications */}
      <section style={cardStyle}>
        <h3 style={h3Style}>Notifications</h3>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            cursor: 'pointer',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600 }}>New Order Sound</span>
          <button
            type="button"
            role="switch"
            aria-checked={soundEnabled}
            onClick={() => onSoundChange(!soundEnabled)}
            style={{
              width: 52,
              height: 30,
              borderRadius: 999,
              border: 'none',
              background: soundEnabled ? 'var(--sage)' : '#d1d5db',
              position: 'relative',
              transition: 'background 0.2s',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                position: 'absolute',
                top: 3,
                left: soundEnabled ? 26 : 3,
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                transition: 'left 0.2s',
              }}
            />
          </button>
        </label>
        <p style={{ fontSize: 12, color: '#666', margin: '8px 0 0' }}>
          {soundEnabled
            ? 'Ding-dong chime naye order par bajega.'
            : 'Sound band hai — notifications silent rahengi.'}
        </p>
      </section>

      {/* Session info */}
      <section style={cardStyle}>
        <h3 style={h3Style}>Current staff / session</h3>
        <Row label="Session ID" value={(session?.id || '').slice(0, 8) + '…'} mono />
        <Row label="Shift started" value={openedLabel} />
        <Row label="Status" value={session?.is_active ? 'Active' : 'Closed'} />
      </section>

      {/* Secure actions */}
      <section style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={h3Style}>Secure logout</h3>
        <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
          Log out is tab ko free karta hai bina shift close kiye. Close Shift EOD report ke baad naya shift banata hai.
        </p>
        <button type="button" onClick={onLogout} style={secondaryBtn}>
          Log out (this device)
        </button>
        <button type="button" onClick={onCloseShift} style={{ ...secondaryBtn, borderColor: '#fca5a5', color: '#991b1b' }}>
          Close Shift (EOD)
        </button>
      </section>
    </div>
  )
}

function Row({ label, value, mono }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '6px 0',
        borderBottom: '1px solid var(--line)',
        fontSize: 13,
      }}
    >
      <span style={{ color: '#666' }}>{label}</span>
      <span
        style={{
          fontWeight: 600,
          fontFamily: mono ? 'var(--mono)' : 'inherit',
          textAlign: 'right',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </span>
    </div>
  )
}

const cardStyle = {
  background: '#fff',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 16,
  marginBottom: 14,
}

const h3Style = {
  margin: '0 0 12px',
  fontSize: 15,
  fontWeight: 700,
}

const labelStyle = {
  display: 'grid',
  gap: 4,
  fontSize: 12,
  fontWeight: 600,
  color: '#444',
}

const inputStyle = {
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--line)',
  fontSize: 15,
  width: '100%',
  boxSizing: 'border-box',
}

const primaryBtn = {
  background: 'var(--brand-primary, var(--ink))',
  color: 'var(--brand-primary-text, #fff)',
  border: 'none',
  borderRadius: 8,
  padding: '12px 16px',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
}

const secondaryBtn = {
  background: '#fff',
  color: 'var(--ink)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '12px 16px',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
}
