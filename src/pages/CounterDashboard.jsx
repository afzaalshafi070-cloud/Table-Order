import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { useRealtimeOrders } from '../hooks/useRealtimeOrders.js'
import { playDingDong } from '../utils/audio.js'
import LoginGate from '../components/LoginGate.jsx'
import OrderCard from '../components/OrderCard.jsx'
import EODReport from '../components/EODReport.jsx'
import LogoUploader from '../components/LogoUploader.jsx'
import MenuEditor from '../components/MenuEditor.jsx'
import QRCodes from '../components/QRCodes.jsx'
import PrintableTicket from '../components/PrintableTicket.jsx'
import { applyTheme } from '../utils/theme.js'
import { MENU as STARTER_MENU } from '../data/menu.js'

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// IMPORTANT:
// sessionStorage survives page refresh in the same Chrome tab,
// but is cleared when the tab is closed.
const STAFF_LOGIN_KEY = 'tableorder:staffLogin'

function tabStyle(active) {
  return {
    border: 'none',
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 700,
    background: active ? 'var(--brand-primary)' : 'var(--paper-dim)',
    color: active ? 'var(--brand-primary-text)' : 'var(--ink)'
  }
}

export default function CounterDashboard() {
  const { restaurantId: urlRestaurantId, pin: urlPin } = useParams()

  const [session, setSession] = useState(null)
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [showEOD, setShowEOD] = useState(false)
  const [tab, setTab] = useState('orders')
  const [resuming, setResuming] = useState(true)
  const [printOrder, setPrintOrder] = useState(null)

  useEffect(() => {
    if (!printOrder) return

    const t = setTimeout(() => window.print(), 50)

    const clear = () => setPrintOrder(null)

    window.addEventListener('afterprint', clear)

    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', clear)
    }
  }, [printOrder])

  const handleNewOrder = useCallback(() => {
    playDingDong()
  }, [])

  const { orders, alerts } = useRealtimeOrders(
    session?.id,
    { onNewOrder: handleNewOrder }
  )

  /*
   * DASHBOARD LOGIN BEHAVIOUR
   *
   * First opening /dashboard:
   *   -> Login required
   *
   * Pull-down/browser refresh:
   *   -> Existing login resumes
   *
   * Same tab navigating to /dashboard again:
   *   -> Login required
   *
   * Closing the tab:
   *   -> sessionStorage disappears
   *   -> Login required next time
   */
  useEffect(() => {
    async function resumeExistingLogin() {
      const navigationEntry =
        window.performance?.getEntriesByType?.('navigation')?.[0]

      const navigationType = navigationEntry?.type

      // "reload" means Chrome/browser page refresh.
      // Only allow automatic login restoration on refresh.
      if (navigationType !== 'reload') {
        sessionStorage.removeItem(STAFF_LOGIN_KEY)
        setResuming(false)
        return
      }

      const saved = sessionStorage.getItem(STAFF_LOGIN_KEY)

      if (!saved) {
        setResuming(false)
        return
      }

      try {
        const { name, pin } = JSON.parse(saved)

        if (!name || !pin) {
          sessionStorage.removeItem(STAFF_LOGIN_KEY)
          setResuming(false)
          return
        }

        await login(name, pin, '', { silent: true })
      } catch {
        sessionStorage.removeItem(STAFF_LOGIN_KEY)
      }

      setResuming(false)
    }

    resumeExistingLogin()

    // login is intentionally excluded because this effect should
    // only run once when the dashboard page loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = async (
    name,
    pin,
    activationCode = '',
    { silent = false } = {}
  ) => {
    setLoginLoading(true)
    setLoginError(null)

    const restaurantId = slugify(name)

    let { data: existing, error: lookupError } = await supabase
      .from('sessions')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('pin', pin)
      .maybeSingle()

    if (lookupError) {
      setLoginError('Supabase connection ka masla hai. Dobara try karein.')
      setLoginLoading(false)
      return
    }

    if (existing && !existing.is_active) {
      // Silent resume must NEVER reopen a closed shift.
      if (silent) {
        sessionStorage.removeItem(STAFF_LOGIN_KEY)
        setLoginLoading(false)
        return
      }

      const { data: reopened, error: reopenError } = await supabase
        .from('sessions')
        .update({
          is_active: true,
          closed_at: null
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (reopenError) {
        setLoginError(
          'Restaurant reopen nahi ho saka. Supabase connection check karein.'
        )
        setLoginLoading(false)
        return
      }

      existing = reopened
    }

    if (!existing) {
      // Silent resume must never create a new restaurant.
      if (silent) {
        sessionStorage.removeItem(STAFF_LOGIN_KEY)
        setLoginLoading(false)
        return
      }

      if (!activationCode) {
        setLoginError(
          'Naya restaurant banane ke liye activation code chahiye.'
        )
        setLoginLoading(false)
        return
      }

      const { data: codeRow, error: codeError } = await supabase
        .from('activation_codes')
        .select('*')
        .eq('code', activationCode)
        .eq('is_used', false)
        .maybeSingle()

      if (codeError || !codeRow) {
        setLoginError(
          'Ye activation code ghalat hai ya pehle istemal ho chuka hai.'
        )
        setLoginLoading(false)
        return
      }

      const { data: created, error } = await supabase
        .from('sessions')
        .insert({
          restaurant_id: restaurantId,
          restaurant_name: name,
          pin,
          is_active: true
        })
        .select()
        .single()

      if (error) {
        setLoginError(
          'Session create nahi ho saka. Supabase connection check karein.'
        )
        setLoginLoading(false)
        return
      }

      existing = created

      await supabase
        .from('activation_codes')
        .update({
          is_used: true,
          used_by: restaurantId
        })
        .eq('id', codeRow.id)

      // First login: create starter menu.
      const seedRows = STARTER_MENU.flatMap((section, sIdx) =>
        section.items.map((item, iIdx) => ({
          session_id: created.id,
          category: section.category,
          name: item.name,
          price: item.price,
          sort_order: sIdx * 100 + iIdx
        }))
      )

      await supabase
        .from('menu_items')
        .insert(seedRows)
    }

    // IMPORTANT:
    // sessionStorage instead of localStorage.
    // This survives refresh but disappears when the tab is closed.
    sessionStorage.setItem(
      STAFF_LOGIN_KEY,
      JSON.stringify({
        name,
        pin
      })
    )

    setSession(existing)

    applyTheme(existing.theme)

    setLoginLoading(false)
  }

  const handleLogoApplied = (logo_url, theme) => {
    setSession(prev => ({
      ...prev,
      logo_url,
      theme
    }))
  }

  const closeShift = async () => {
    await supabase
      .from('sessions')
      .update({
        is_active: false,
        closed_at: new Date().toISOString()
      })
      .eq('id', session.id)

    sessionStorage.removeItem(STAFF_LOGIN_KEY)

    setShowEOD(false)
    setSession(null)
  }

  const logout = () => {
    sessionStorage.removeItem(STAFF_LOGIN_KEY)
    setSession(null)
  }

  const acceptOrder = async order => {
    await supabase
      .from('orders')
      .update({
        status: 'cooking'
      })
      .eq('id', order.id)
  }

  const serveOrder = async order => {
    await supabase
      .from('orders')
      .update({
        status: 'served'
      })
      .eq('id', order.id)
  }

  const resolveTableAlerts = async tableId => {
    await supabase
      .from('alerts')
      .update({
        resolved: true
      })
      .eq('session_id', session.id)
      .eq('table_id', tableId)
  }

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

  if (!session) {
    return (
      <LoginGate
        onSubmit={login}
        error={loginError}
        loading={loginLoading}
      />
    )
  }

  const activeOrders = orders.filter(
    o =>
      o.status !== 'served' &&
      o.status !== 'cancelled'
  )

  const alertsByTable = alerts.reduce((map, a) => {
    map[a.table_id] = map[a.table_id] || {}
    map[a.table_id][a.type] = true
    return map
  }, {})

  return (
    <div className="screen">

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
                fontFamily: 'var(--mono)',
                fontSize: 11,
                opacity: 0.7
              }}
            >
              COUNTER
            </div>

            <div
              style={{
                fontFamily: 'var(--display)',
                fontSize: 19,
                fontWeight: 600
              }}
            >
              {session.restaurant_name}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}
        >
          <LogoUploader
            sessionId={session.id}
            existingLogoUrl={session.logo_url}
            onApplied={handleLogoApplied}
            compact
          />

          <button
            onClick={logout}
            style={{
              background: 'transparent',
              color: 'rgba(255,255,255,0.8)',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 12
            }}
          >
            Log out
          </button>

          <button
            onClick={() => setShowEOD(true)}
            style={{
              background: 'var(--clay)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              fontWeight: 700,
              fontSize: 13
            }}
          >
            Close Shift
          </button>
        </div>
      </header>

      {!session.logo_url && (
        <div style={{ padding: 16 }}>
          <LogoUploader
            sessionId={session.id}
            onApplied={handleLogoApplied}
          />
        </div>
      )}

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

        <button
          onClick={() => setTab('qr')}
          style={tabStyle(tab === 'qr')}
        >
          QR Codes
        </button>
      </div>

      {tab === 'menu' ? (
        <MenuEditor sessionId={session.id} />

      ) : tab === 'qr' ? (
        <QRCodes
          restaurantId={session.restaurant_id}
          pin={session.pin}
        />

      ) : (
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
                color: '#9a9284',
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
                !!alertsByTable[order.table_id]?.water
              }
              hasWaiterAlert={
                !!alertsByTable[order.table_id]?.waiter
              }
              onAccept={acceptOrder}
              onServe={serveOrder}
              onResolveAlert={resolveTableAlerts}
              onPrint={setPrintOrder}
            />
          ))}
        </div>
      )}

      <PrintableTicket
        order={printOrder}
        restaurantName={session.restaurant_name}
      />

      {showEOD && (
        <EODReport
          restaurantName={session.restaurant_name}
          orders={orders}
          sessionOpenedAt={session.created_at}
          onClose={() => setShowEOD(false)}
          onCloseShift={closeShift}
        />
      )}

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
            grid-auto-rows: minmax(220px, auto);
          }
        }
      `}</style>

    </div>
  )
  }
