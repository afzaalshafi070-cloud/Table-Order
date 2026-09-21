import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import QRCodes from '../components/QRCodes'
import DeliveryAreas from '../components/DeliveryAreas'
import Orders from '../components/Orders'
import Shifts from '../components/Shifts'
import '../styles/dashboard.css'

const STAFF_LOGIN_KEY = 'staff_login_session'

export default function CounterDashboard() {
  // ========================================================
  // State Management
  // ========================================================
  const { restaurantId: urlRestaurantId, pin: urlPin } = useParams()
  const navigate = useNavigate()

  const [session, setSession] = useState(null)
  const [resuming, setResuming] = useState(true)
  const [tab, setTab] = useState('orders')

  // Login form states
  const [loginName, setLoginName] = useState('')
  const [loginPin, setLoginPin] = useState('')
  const [activationCode, setActivationCode] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)

  // ========================================================
  // IMPORTANT: Ye function jab login hota hai
  // Restaurant check karta hai aur session set karta hai
  // ========================================================
  const login = async (name, pin, code = '', options = {}) => {
    const { silent = false } = options

    if (!name || !pin) {
      if (!silent) setLoginError('Restaurant name aur PIN zaroori hain')
      return false
    }

    try {
      // ================================================
      // Supabase se restaurant check karo
      // ================================================
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('restaurant_id', name)
        .eq('pin', pin)
        .eq('is_active', true)
        .maybeSingle()

      if (error || !data) {
        const msg = 'Restaurant ya PIN galat hai'
        if (!silent) setLoginError(msg)
        return false
      }

      // ================================================
      // Session successful - yeh data store karo
      // ================================================
      setSession(data)
      setLoginError('')
      setLoginName('')
      setLoginPin('')
      setActivationCode('')

      // ================================================
      // SessionStorage mein save karo (is tab ke liye)
      // ========================================================
      sessionStorage.setItem(
        STAFF_LOGIN_KEY,
        JSON.stringify({
          name: data.restaurant_id,
          pin: pin,
          timestamp: new Date().toISOString()
        })
      )

      // Apply theme agar saved hai
      if (data.theme) {
        document.documentElement.style.setProperty('--brand-primary', data.theme)
      }

      return true

    } catch (err) {
      console.error('Login error:', err)
      if (!silent) setLoginError('Koi error aaya. Dobara kosis karo.')
      return false
    }
  }

  // ========================================================
  // AUTO LOGIN / SESSION RESUME
  // Sirf page refresh par session resume hoga
  // Naya tab kholo tou login mangega
  // ========================================================
  useEffect(() => {
    async function resumeExistingLogin() {
      try {
        // =====================================================
        // 1. Check if this tab mein pehle se login tha
        // =====================================================
        const saved = sessionStorage.getItem(STAFF_LOGIN_KEY)

        if (!saved) {
          // Koi saved session nahi - login form show karo
          setResuming(false)
          return
        }

        // =====================================================
        // 2. Saved data ko parse karo
        // =====================================================
        let parsedData
        try {
          parsedData = JSON.parse(saved)
        } catch {
          sessionStorage.removeItem(STAFF_LOGIN_KEY)
          setResuming(false)
          return
        }

        const { name, pin } = parsedData

        if (!name || !pin) {
          sessionStorage.removeItem(STAFF_LOGIN_KEY)
          setResuming(false)
          return
        }

        // =====================================================
        // 3. Silent login - server par check karo
        // Agar session active nahi hai tou login fail hoga
        // =====================================================
        const success = await login(name, pin, '', { silent: true })

        if (!success) {
          // Session expire ho gaya ya server mein nahi hai
          sessionStorage.removeItem(STAFF_LOGIN_KEY)
        }

      } catch (err) {
        console.error('Resume login error:', err)
        sessionStorage.removeItem(STAFF_LOGIN_KEY)
      }

      setResuming(false)
    }

    resumeExistingLogin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ========================================================
  // LOGIN HANDLER - Jab user form se login kare
  // ========================================================
  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginBusy(true)
    setLoginError('')

    const success = await login(loginName, loginPin, activationCode)

    setLoginBusy(false)
  }

  // ========================================================
  // LOGOUT
  // ========================================================
  const handleLogout = () => {
    setSession(null)
    sessionStorage.removeItem(STAFF_LOGIN_KEY)
    setLoginName('')
    setLoginPin('')
    setActivationCode('')
    setLoginError('')
  }

  // ========================================================
  // LOADING STATE
  // ========================================================
  if (resuming) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--surface-0)',
        flexDirection: 'column',
        gap: 20
      }}>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          Loading...
        </div>
      </div>
    )
  }

  // ========================================================
  // AGAR LOGIN NAHI HAI - LOGIN FORM DIKHAO
  // ========================================================
  if (!session) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--surface-0)',
        padding: 20
      }}>
        <div style={{
          background: 'var(--surface-1)',
          borderRadius: 12,
          padding: 40,
          maxWidth: 400,
          width: '100%',
          border: '1px solid var(--line)'
        }}>
          <div style={{
            fontSize: 24,
            fontWeight: 700,
            marginBottom: 10,
            color: 'var(--ink)'
          }}>
            COUNTER PORTAL
          </div>

          <div style={{
            fontSize: 14,
            color: 'var(--text-secondary)',
            marginBottom: 30
          }}>
            Log in to the floor
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Restaurant Name Input */}
            <div>
              <label style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
                color: 'var(--ink)'
              }}>
                Restaurant name
              </label>
              <input
                type="text"
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="Abc restaurant"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  background: 'var(--surface-0)'
                }}
                disabled={loginBusy}
              />
            </div>

            {/* Secret Room PIN Input */}
            <div>
              <label style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
                color: 'var(--ink)'
              }}>
                Secret room PIN
              </label>
              <input
                type="text"
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value)}
                placeholder="12"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  background: 'var(--surface-0)'
                }}
                disabled={loginBusy}
              />
            </div>

            {/* Activation Code (Optional) */}
            <div>
              <label style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 8,
                color: 'var(--ink)'
              }}>
                Activation Code (sirf pehli baar)
              </label>
              <input
                type="text"
                value={activationCode}
                onChange={(e) => setActivationCode(e.target.value)}
                placeholder="e.g. TEST-1001"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  background: 'var(--surface-0)'
                }}
                disabled={loginBusy}
              />
            </div>

            {/* Error Message */}
            {loginError && (
              <div style={{
                background: '#fee',
                border: '1px solid #f88',
                borderRadius: 6,
                padding: 10,
                fontSize: 13,
                color: '#c33'
              }}>
                {loginError}
              </div>
            )}

            {/* Login Button */}
            <button
              type="submit"
              disabled={loginBusy}
              style={{
                background: 'var(--brand-primary)',
                color: 'var(--brand-primary-text)',
                border: 'none',
                borderRadius: 8,
                padding: '12px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: loginBusy ? 'not-allowed' : 'pointer',
                opacity: loginBusy ? 0.5 : 1
              }}
            >
              {loginBusy ? 'Connecting...' : 'Connect to stream'}
            </button>
          </form>

          <div style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginTop: 20,
            lineHeight: 1.6
          }}>
            Naya restaurant banate waqt Purana restaurant ho to khali chhor do.
          </div>
        </div>
      </div>
    )
  }

  // ========================================================
  // AGAR LOGIN HAI - DASHBOARD DIKHAO
  // ========================================================
  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--surface-0)' }}>
      {/* Left Sidebar */}
      <div style={{
        width: 240,
        background: 'var(--surface-1)',
        borderRight: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}>
        {/* Logo */}
        <div style={{
          padding: '20px 16px',
          borderBottom: '1px solid var(--line)'
        }}>
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: 0.5
          }}>
            {session.restaurant_name}
          </div>
        </div>

        {/* Navigation */}
        <nav style={{
          flex: 1,
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4
        }}>
          <NavButton
            label="Orders"
            isActive={tab === 'orders'}
            onClick={() => setTab('orders')}
          />
          <NavButton
            label="QR Codes"
            isActive={tab === 'qr'}
            onClick={() => setTab('qr')}
          />
          <NavButton
            label="Delivery Areas"
            isActive={tab === 'areas'}
            onClick={() => setTab('areas')}
          />
          <NavButton
            label="Shifts"
            isActive={tab === 'shifts'}
            onClick={() => setTab('shifts')}
          />
        </nav>

        {/* Logout Button */}
        <div style={{
          padding: '12px 8px',
          borderTop: '1px solid var(--line)'
        }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              background: '#fee',
              color: '#c33',
              border: 'none',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{
          background: 'var(--surface-1)',
          borderBottom: '1px solid var(--line)',
          padding: '16px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Shift ID
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>
              {session.id || 'Active'}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
          {tab === 'orders' && <Orders sessionId={session.id} />}
          {tab === 'qr' && <QRCodes sessionId={session.id} restaurantId={session.restaurant_id} />}
          {tab === 'areas' && <DeliveryAreas sessionId={session.id} restaurantId={session.restaurant_id} />}
          {tab === 'shifts' && <Shifts restaurantId={session.restaurant_id} />}
        </div>
      </div>
    </div>
  )
}

// ========================================================
// Helper Component - Navigation Button
// ========================================================
function NavButton({ label, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: isActive ? 'var(--brand-primary)' : 'transparent',
        color: isActive ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
        border: 'none',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 13,
        fontWeight: 600,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s'
      }}
    >
      {label}
    </button>
  )
}
