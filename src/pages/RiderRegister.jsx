import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import NotFound from './NotFound.jsx'
import { ensureAnonymousAuth } from '../utils/auth.js'

/**
 * Phase 2: Rider self-registration via invite link
 * Rider enters PIN to complete setup and get a permanent rider secret
 */
export default function RiderRegister() {
  const { restaurantId, inviteToken } = useParams()
  const navigate = useNavigate()

  const [state, setState] = useState('loading') // loading, ready, success, error, invalid
  const [error, setError] = useState('')
  const [invitation, setInvitation] = useState(null)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const loadInvite = async () => {
      try {
        await ensureAnonymousAuth()
        
        // Validate the invite token and get rider details
        const { data, error: err } = await supabase.rpc('rider_validate_invite', {
          p_invite_token: inviteToken,
          p_restaurant_id: restaurantId,
        })

        if (err || !data) {
          setError('Invite invalid ya expired ho gaya')
          setState('invalid')
          return
        }

        setInvitation(data)
        setState('ready')
      } catch (e) {
        console.error('Load invite:', e)
        setError(e?.message || 'Failed to load invitation')
        setState('error')
      }
    }

    if (restaurantId && inviteToken) {
      loadInvite()
    } else {
      setState('invalid')
    }
  }, [restaurantId, inviteToken])

  const handleRegister = async (e) => {
    e.preventDefault()
    
    if (pin.length < 4) {
      setError('PIN 4 digits ya zyada hona chahiye')
      return
    }
    
    if (pin !== confirmPin) {
      setError('PIN match nahi ho rahe')
      return
    }

    setBusy(true)
    setError('')

    try {
      const { data, error: err } = await supabase.rpc('rider_complete_registration', {
        p_invite_token: inviteToken,
        p_restaurant_id: restaurantId,
        p_pin: pin.trim(),
      })

      if (err || !data) {
        setError(err?.message || 'Registration failed')
        return
      }

      // Registration successful! Redirect to rider portal
      setState('success')
      setTimeout(() => {
        // Redirect to the rider portal with the new secret
        const areaName = data.primary_area || 'all'
        navigate(`/rider/${restaurantId}/${data.rider_secret}/${encodeURIComponent(areaName)}`)
      }, 2000)
    } catch (e) {
      console.error('Register:', e)
      setError(e?.message || 'Registration error')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'loading') {
    return (
      <div className="screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Loading invitation…</div>
        </div>
      </div>
    )
  }

  if (state === 'invalid' || state === 'error') {
    return <NotFound message={error || 'This rider invite is invalid or expired.'} />
  }

  if (state === 'success') {
    return (
      <div className="screen" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: '#10b981', color: '#fff', gap: 16
      }}>
        <div style={{ fontSize: 48 }}>✓</div>
        <div style={{ fontSize: 18, fontWeight: 700, textAlign: 'center' }}>Registration successful!</div>
        <div style={{ fontSize: 14, opacity: 0.9 }}>Redirecting to rider portal…</div>
      </div>
    )
  }

  // state === 'ready'
  return (
    <div className="screen" style={{ padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{
        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12,
        padding: 16, marginBottom: 20, fontSize: 14, color: '#1e3a8a', lineHeight: 1.5
      }}>
        <div style={{ fontWeight: 700 }}>Rider Setup</div>
        <div style={{ marginTop: 4 }}>
          {invitation?.full_name && `${invitation.full_name} · `}
          {invitation?.phone}
        </div>
      </div>

      <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>
            PIN (4+ digits)
          </label>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="4000"
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 10,
              border: '1px solid var(--line, #e7e5e4)', fontSize: 16, boxSizing: 'border-box'
            }}
            disabled={busy}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 6 }}>
            Confirm PIN
          </label>
          <input
            type="password"
            inputMode="numeric"
            value={confirmPin}
            onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
            placeholder="4000"
            style={{
              width: '100%', padding: '12px 14px', borderRadius: 10,
              border: '1px solid var(--line, #e7e5e4)', fontSize: 16, boxSizing: 'border-box'
            }}
            disabled={busy}
          />
        </div>

        {error && (
          <div style={{ color: '#b45309', fontSize: 13, fontWeight: 600, background: '#fef3c7', padding: 10, borderRadius: 8 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            border: 'none', borderRadius: 999, padding: '12px 20px',
            background: busy ? '#9ca3af' : 'var(--brand-primary, #1c1917)',
            color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer',
            opacity: busy ? 0.7 : 1
          }}
        >
          {busy ? 'Setting up…' : 'Complete Registration'}
        </button>
      </form>
    </div>
  )
}
