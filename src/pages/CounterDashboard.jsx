import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { useRealtimeOrders } from '../hooks/useRealtimeOrders.js'
import { playDingDong, unlockAudio } from '../utils/audio.js'
import LoginGate from '../components/LoginGate.jsx'
import OrderCard from '../components/OrderCard.jsx'
import EODReport from '../components/EODReport.jsx'
import LogoUploader from '../components/LogoUploader.jsx'
import MenuEditor from '../components/MenuEditor.jsx'
import QRCodes from '../components/QRCodes.jsx'
import DeliveryAreas from '../components/DeliveryAreas.jsx'
import TaxSettings from '../components/TaxSettings.jsx'
import SettingsCenter from '../components/SettingsCenter.jsx'
import PrintableTicket from '../components/PrintableTicket.jsx'
import { applyTheme, applyBrandSurface, applyColorMode, getSavedColorMode } from '../utils/theme.js'
import { MENU as STARTER_MENU } from '../data/menu.js'
import { ensureAnonymousAuth, getOrCreateTabSecret, clearAnonymousAuth } from '../utils/auth.js'

const HEARTBEAT_MS = 15 * 1000

function tabStyle(active) {
  return {
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 700,
    background: active
      ? 'var(--brand-primary)'
      : 'var(--paper-dim)',
    color: active
      ? 'var(--brand-primary-text)'
      : 'var(--ink)'
  }
}


function WhatsAppForm({ initial, onSave }) {
  const [val, setVal] = useState(initial || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  useEffect(() => { setVal(initial || '') }, [initial])
  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    await onSave(val)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }
  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        value={val}
        onChange={e => setVal(e.target.value)}
        placeholder="e.g. 03001234567 or +923001234567"
        style={{
          border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', fontSize: 15
        }}
      />
      <button type="submit" disabled={saving} style={{
        background: 'var(--brand-primary)', color: 'var(--brand-primary-text)',
        border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 700, fontSize: 13,
        opacity: saving ? 0.6 : 1, cursor: 'pointer'
      }}>{saving ? 'Saving…' : saved ? '✓ Saved' : 'Save WhatsApp'}</button>
    </form>
  )
}

export default function CounterDashboard() {
  const [session, setSession] = useState(null)
  const [loginError, setLoginError] = useState(null)
  const [planInfo, setPlanInfo] = useState(null)
  const [paymentAccounts, setPaymentAccounts] = useState([])
  const [showPayPopup, setShowPayPopup] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [showEOD, setShowEOD] = useState(false)
  const [tab, setTab] = useState('orders')
  const [resuming, setResuming] = useState(true)
  // { order, type: 'kot' | 'bill' }
  const [printJob, setPrintJob] = useState(null)

  // ============================================================
  // PRINT KOT / BILL
  // ============================================================
  useEffect(() => {
    if (!printJob?.order) return

    const t = setTimeout(() => {
      window.print()
    }, 50)

    const clear = () => {
      setPrintJob(null)
    }

    window.addEventListener('afterprint', clear)

    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', clear)
    }
  }, [printJob])

  // ============================================================
  // NEW ORDER SOUND
  // ============================================================
  const handleNewOrder = useCallback(() => {
    playDingDong()
  }, [])

  const { orders, alerts } = useRealtimeOrders(
    session?.id,
    {
      onNewOrder: handleNewOrder,
      shiftStartedAt:
        session?.shift_started_at || session?.created_at
    }
  )

  // ============================================================
  // LOGIN / NEW SHIFT SYSTEM
  //
  // RULES:
  // 1. Active shift + live heartbeat (another tab/device open):
  //    - Normal login BLOCKED ("already active on another device")
  //    - Silent refresh (same tab reload) ALLOWED
  //
  // 2. Active shift + stale heartbeat (browser closed a while ago):
  //    - Resume SAME session (orders stay intact)
  //    - Do NOT create a new shift
  //
  // 3. No active shift but old closed shift exists:
  //    - Create a NEW session
  //
  // 4. No previous session:
  //    - Activation code required
  // ============================================================
  const login = async (name, pin, activationCode = '') => {
    setLoginLoading(true)
    setLoginError(null)
    try {
      await ensureAnonymousAuth()
      const tabSecret = getOrCreateTabSecret()
      const { data, error } = await supabase.rpc('staff_login', {
        p_restaurant_name: name,
        p_pin: pin,
        p_activation_code: activationCode,
        p_tab_secret: tabSecret,
        p_silent: false,
      })
      if (error) throw error
      if (!data?.ok || !data.session) {
        throw new Error(data?.code || 'LOGIN_FAILED')
      }

      const created = data.session

      // First restaurant gets the familiar starter menu; all later shifts
      // are copied server-side by staff_login.
      if (data.new_restaurant) {
        const seedRows = STARTER_MENU.flatMap((section, sIdx) =>
          section.items.map((item, iIdx) => ({
            session_id: created.id,
            category: section.category,
            name: item.name,
            price: item.price,
            sort_order: sIdx * 100 + iIdx,
          }))
        )
        const { error: seedError } = await supabase.from('menu_items').insert(seedRows)
        if (seedError) throw seedError
      }

      setSession(created)
      applyTheme(created.theme || {})
      applyBrandSurface(created.theme || {})
      applyColorMode(getSavedColorMode())
      unlockAudio()
      setPlanInfo(data.plan || null)
      setPaymentAccounts(Array.isArray(data.payment_accounts) ? data.payment_accounts : [])
      if (data.plan?.payment_due) setShowPayPopup(true)
    } catch (err) {
      console.error('Staff login failed:', err)
      const msg = err?.message || ''
      if (msg.includes('RESTAURANT_ALREADY_ACTIVE')) {
        setLoginError('Ye restaurant abhi kisi doosri device/tab par active hai. Pehle wahan Shift Close karein ya 45 second baad dobara try karein.')
      } else if (msg.includes('INVALID_PIN')) {
        setLoginError('Restaurant Name ya PIN ghalat hai.')
      } else if (msg.includes('INVALID_ACTIVATION_CODE')) {
        setLoginError('Ye activation code ghalat hai ya pehle istemal ho chuka hai.')
      } else if (msg.includes('PLAN_SOLD_OUT') || msg.includes('PLAN_EXPIRED')) {
        setLoginError('Is restaurant ki muddat khatam / sold out hai. Data safe hai — renew ke liye support se rabta karein.')
      } else if (msg.includes('Anonymous')) {
        setLoginError('Supabase Anonymous Sign-Ins enable nahi hain. Supabase Dashboard → Authentication → Providers mein Anonymous enable karein.')
      } else {
        setLoginError('Login nahi ho saka. Supabase connection/settings check karein.')
      }
    } finally {
      setLoginLoading(false)
    }
  }

  // ============================================================
  // AUTO LOGIN / REFRESH
  // Same tab keeps a tab secret + anonymous auth in sessionStorage.
  // A new tab gets a different anonymous identity and cannot resume.
  // ============================================================
  useEffect(() => {
    async function resumeExistingLogin() {
      const navigationEntry = window.performance?.getEntriesByType?.('navigation')?.[0]
      if (navigationEntry?.type !== 'reload') {
        setResuming(false)
        return
      }
      try {
        await ensureAnonymousAuth()
        const tabSecret = getOrCreateTabSecret()
        const { data, error } = await supabase.rpc('staff_resume', { p_tab_secret: tabSecret })
        if (!error && data?.ok && data.session) {
          setSession(data.session)
          applyTheme(data.session.theme || {})
          applyBrandSurface(data.session.theme || {})
          applyColorMode(getSavedColorMode())
          unlockAudio()
          setPlanInfo(data.plan || null)
          setPaymentAccounts(Array.isArray(data.payment_accounts) ? data.payment_accounts : [])
          if (data.plan?.payment_due) setShowPayPopup(true)
        }
      } catch (err) {
        console.warn('Silent staff resume failed:', err)
      } finally {
        setResuming(false)
      }
    }
    resumeExistingLogin()
  }, [])

  // ============================================================
  // LIVE SHIFT HEARTBEAT
  //
  // A Chrome tab closing cannot be trusted to complete an async
  // Supabase update. Instead the active tab renews a short lease.
  // If the browser is closed/crashes, the lease stops and another
  // login can reclaim the stale shift after SESSION_LEASE_MS.
  // ============================================================
  useEffect(() => {
    if (!session?.id) return undefined

    const beat = async () => {
      const { data } = await supabase.rpc('staff_heartbeat', {
        p_session_id: session.id,
        p_tab_secret: getOrCreateTabSecret(),
      })
      if (data !== true) {
        setSession(null)
      }
    }

    beat()
    const timer = window.setInterval(beat, HEARTBEAT_MS)

    return () => window.clearInterval(timer)
  }, [session?.id])

  // ============================================================
  // LOGO / THEME
  // ============================================================
  const saveWhatsApp = async (raw) => {
    const cleaned = String(raw || '').trim()
    let base = session.theme || {}
    if (typeof base === 'string') {
      try { base = JSON.parse(base) } catch { base = {} }
    }
    const nextTheme = { ...base, whatsapp: cleaned || null }
    const { error } = await supabase.from('sessions').update({ theme: nextTheme }).eq('id', session.id)
    if (error) {
      alert('WhatsApp save nahi ho saka: ' + (error.message || ''))
      return
    }
    setSession(prev => ({ ...prev, theme: nextTheme, whatsapp: cleaned || null }))
  }

  const handleLogoApplied = (logo_url, theme) => {
    setSession(prev => ({
      ...prev,
      logo_url,
      theme
    }))

    applyTheme(theme)
    applyBrandSurface(theme)
  }

  // ============================================================
  // CLOSE CURRENT SHIFT
  //
  // IMPORTANT:
  // Current session becomes CLOSED.
  // It is NOT deleted.
  // Next login creates a NEW session.
  // ============================================================
  const closeShift = async () => {
    if (!session?.id) return

    const { error } = await supabase
      .from('sessions')
      .update({ is_active: false, closed_at: new Date().toISOString() })
      .eq('id', session.id)

    if (error) {
      setLoginError(
        'Shift close nahi ho saki. Dobara try karein.'
      )
      return
    }

    // Remove this tab's staff lease and anonymous identity.
    await supabase.rpc('staff_logout', { p_session_id: session.id, p_tab_secret: getOrCreateTabSecret() })
    clearAnonymousAuth()
    await supabase.auth.signOut()

    setShowEOD(false)
    setSession(null)
  }

  // ============================================================
  // LOGOUT
  // ============================================================
  const logout = async () => {
    if (session?.id) {
      await supabase.rpc('staff_logout', { p_session_id: session.id, p_tab_secret: getOrCreateTabSecret() })
    }
    clearAnonymousAuth()
    await supabase.auth.signOut()
    setSession(null)
  }

  // ============================================================
  // ACCEPT ORDER
  // ============================================================
  const acceptOrder = async order => {
    await supabase
      .from('orders')
      .update({
        status: 'cooking'
      })
      .eq('id', order.id)
  }

  // ============================================================
  // SERVE ORDER
  // ============================================================
  const serveOrder = async order => {
    await supabase
      .from('orders')
      .update({
        status: 'served'
      })
      .eq('id', order.id)
  }

  // ============================================================
  // RESOLVE TABLE ALERT
  // ============================================================
  const resolveTableAlerts = async tableId => {
    if (!session?.id) return

    await supabase
      .from('alerts')
      .update({
        resolved: true
      })
      .eq('session_id', session.id)
      .eq('table_id', tableId)
  }

  // ============================================================
  // TAX SETTINGS
  // ============================================================
  const updateTaxSettings = async (
    taxPercent,
    taxLabel
  ) => {
    if (!session?.id) return

    const {
      error
    } = await supabase
      .from('sessions')
      .update({
        tax_percent: taxPercent,
        tax_label: taxLabel
      })
      .eq('id', session.id)

    if (error) {
      setLoginError(
        'Tax settings save nahi ho sakin.'
      )
      return
    }

    setSession(prev => ({
      ...prev,
      tax_percent: taxPercent,
      tax_label: taxLabel
    }))
  }

  // ============================================================
  // LOADING SCREEN
  // ============================================================
  if (resuming) {
    return (
      <div
        className="screen"
        style={{
          alignItems: 'center',
          justifyContent: 'center'
        }}
      />
    )
  }

  // ============================================================
  // LOGIN SCREEN
  // ============================================================
  if (!session) {
    return (
      <LoginGate
        onSubmit={login}
        error={loginError}
        loading={loginLoading}
      />
    )
  }

  // ============================================================
  // ACTIVE ORDERS
  // ============================================================
  const activeOrders = orders.filter(
    order =>
      order.status !== 'served' &&
      order.status !== 'cancelled'
  )

  // ============================================================
  // ALERTS BY TABLE
  // ============================================================
  const alertsByTable = alerts.reduce(
    (map, alert) => {
      map[alert.table_id] =
        map[alert.table_id] || {}

      map[alert.table_id][alert.type] = true

      return map
    },
    {}
  )

  // ============================================================
  // MAIN DASHBOARD
  // ============================================================
  return (
    <div className="screen brand-surface" onPointerDown={unlockAudio}>

      {planInfo?.payment_due && (
        <div style={{
          margin: '10px 12px', padding: '12px 14px', borderRadius: 12,
          background: '#fef2f2', border: '2px solid #fca5a5', color: '#991b1b'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong>Payment overdue — grace period</strong>
            <button type="button" onClick={() => setShowPayPopup(true)} style={{
              background: '#dc2626', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontWeight: 700
            }}>Payment details</button>
          </div>
          {planInfo.grace_ends_at && (
            <div style={{ fontSize: 12, marginTop: 6 }}>
              Grace ends: {new Date(planInfo.grace_ends_at).toLocaleString()} — baad mein sold out (data safe).
            </div>
          )}
        </div>
      )}

      {showPayPopup && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999,
          display: 'grid', placeItems: 'center', padding: 16
        }} onClick={() => setShowPayPopup(false)}>
          <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 20, maxWidth: 420, width: '100%' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Payment required</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Renew ke liye neeche account par payment karein, phir support ko message karein.
            </p>
            {(paymentAccounts || []).length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Koi payment account set nahi. Admin se rabta karein.</p>
            )}
            {(paymentAccounts || []).map((a, i) => (
              <div key={a.id || i} style={{ border: '1px solid var(--border, var(--line))', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>{a.label || a.bank_name}</div>
                <div style={{ fontSize: 13 }}>{a.bank_name}</div>
                <div style={{ fontSize: 13 }}>Title: {a.account_title}</div>
                <div style={{ fontSize: 13, fontFamily: 'monospace' }}>A/C: {a.account_number}</div>
                {a.iban && <div style={{ fontSize: 12, fontFamily: 'monospace' }}>IBAN: {a.iban}</div>}
              </div>
            ))}
            <button type="button" onClick={() => setShowPayPopup(false)} style={{
              width: '100%', marginTop: 8, padding: 12, borderRadius: 8, border: 'none', background: '#111', color: '#fff', fontWeight: 700
            }}>Close</button>
          </div>
        </div>
      )}

      {/* ======================================================
          HEADER
      ====================================================== */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 18px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--brand-ink)',
          color: '#fff'
        }}
      >

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >

          {session.logo_url && (
            <img
              src={session.logo_url}
              alt=""
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                objectFit: 'cover'
              }}
            />
          )}

          <div>

            <div
              style={{
                fontFamily: 'var(--display)',
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '-0.03em',
                lineHeight: 1.15
              }}
            >
              {session.restaurant_name}
            </div>
            <div
              style={{
                fontFamily: 'var(--mono)',
                fontSize: 10,
                opacity: 0.65,
                marginTop: 2,
                letterSpacing: '0.06em'
              }}
            >
              COUNTER
            </div>

          </div>

        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => setTab('qr')}
            aria-label="QR Codes"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: tab === 'qr' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.28)',
              borderRadius: 10, padding: '10px 12px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: 15 }}>▣</span>
            QR Center
          </button>
          <button
            type="button"
            onClick={() => setTab('settings')}
            aria-label="Settings"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: tab === 'settings' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.28)',
              borderRadius: 10, padding: '10px 12px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}
          >
            <span style={{ fontSize: 15 }}>⚙</span>
            Settings
          </button>
        </div>
      </header>

      {/* ======================================================
          LOGO UPLOAD
      ====================================================== */}
      {!session.logo_url && (
        <div style={{ padding: 16 }}>
          <LogoUploader
            sessionId={session.id}
            onApplied={handleLogoApplied}
          />
        </div>
      )}

      {/* ======================================================
          TABS
      ====================================================== */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '12px 16px 0',
          flexWrap: 'wrap'
        }}
      >
        <button
          onClick={() => setTab('orders')}
          style={tabStyle(tab === 'orders')}
        >
          Orders
        </button>
        <button
          onClick={() => setTab('menu')}
          style={tabStyle(tab === 'menu')}
        >
          Menu Editor
        </button>
      </div>

      {/* ======================================================
          MENU
      ====================================================== */}
      {tab === 'menu' ? (

        <MenuEditor
          sessionId={session.id}
        />

      ) : tab === 'qr' ? (

        <QRCodes
          restaurantId={session.restaurant_id}
          qrSecret={session.qr_secret}
          restaurantName={session.restaurant_name}
          logoUrl={session.logo_url}
          riderSecret={session.rider_secret}
          sessionId={session.id}
        />


      ) : tab === 'settings' ? (

        <SettingsCenter
          session={session}
          setSession={setSession}
          onLogoApplied={handleLogoApplied}
          updateTaxSettings={updateTaxSettings}
          onCloseShift={() => setShowEOD(true)}
          onLogout={logout}
        />

      ) : (

        // ====================================================
        // ORDERS
        // ====================================================
        <div
          className="order-grid"
          style={{
            padding: 16,
            overflowY: 'auto'
          }}
        >

          {activeOrders.length === 0 && (
            <div
              style={{
                gridColumn: '1 / -1',
                textAlign: 'center',
                color: 'var(--text-muted)',
                padding: '40px 0'
              }}
            >
              No active tickets — the floor is quiet.
            </div>
          )}

          {activeOrders.map(order => (

            <OrderCard
              key={order.id}
              order={order}
              hasWaterAlert={
                !!alertsByTable[
                  order.table_id
                ]?.water
              }
              hasWaiterAlert={
                !!alertsByTable[
                  order.table_id
                ]?.waiter
              }
              hasBillAlert={
                !!alertsByTable[
                  order.table_id
                ]?.bill
              }
              onAccept={acceptOrder}
              onServe={serveOrder}
              onResolveAlert={
                resolveTableAlerts
              }
              onPrint={(order, type = 'kot') => setPrintJob({ order, type })}
            />

          ))}

        </div>
      )}

      {/* ======================================================
          PRINTABLE KOT / BILL
      ====================================================== */}
      <PrintableTicket
        order={printJob?.order}
        ticketType={printJob?.type || 'kot'}
        restaurantName={
          session.restaurant_name
        }
      />

      {/* ======================================================
          END OF DAY / CLOSE SHIFT
      ====================================================== */}
      {showEOD && (
        <EODReport
          restaurantName={
            session.restaurant_name
          }
          orders={orders}
          sessionOpenedAt={
            session.shift_started_at ||
            session.created_at
          }
          onClose={() =>
            setShowEOD(false)
          }
          onCloseShift={closeShift}
        />
      )}

      {/* ======================================================
          RESPONSIVE ORDER GRID
      ====================================================== */}
      <style>{`
        .order-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          align-content: start;
        }

        @media (min-width: 900px) {
          .order-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 600px) {
          .order-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

    </div>
  )
}
