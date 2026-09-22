import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { useRealtimeOrders } from '../hooks/useRealtimeOrders.js'
import { playDingDong } from '../utils/audio.js'
import LoginGate from '../components/LoginGate.jsx'
import OrderCard from '../components/OrderCard.jsx'
import EODReport from '../components/EODReport.jsx'
import LogoUploader from '../components/LogoUploader.jsx'
import MenuEditor from '../components/MenuEditor.jsx'
import QRCodes from '../components/QRCodes.jsx'
import DeliveryAreas from '../components/DeliveryAreas.jsx'
import TaxSettings from '../components/TaxSettings.jsx'
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

const STAFF_LOGIN_KEY = 'tableorder:staffLogin'
const SESSION_LEASE_MS = 45 * 1000
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

export default function CounterDashboard() {
  const [session, setSession] = useState(null)
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [showEOD, setShowEOD] = useState(false)
  const [tab, setTab] = useState('orders')
  const [resuming, setResuming] = useState(true)
  const [printOrder, setPrintOrder] = useState(null)

  // ============================================================
  // PRINT TICKET
  // ============================================================
  useEffect(() => {
    if (!printOrder) return

    const t = setTimeout(() => {
      window.print()
    }, 50)

    const clear = () => {
      setPrintOrder(null)
    }

    window.addEventListener('afterprint', clear)

    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', clear)
    }
  }, [printOrder])

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
  // 1. Active shift exists:
  //    - Normal login is blocked.
  //    - Silent refresh login is allowed.
  //
  // 2. No active shift but old closed shift exists:
  //    - Create a NEW session.
  //    - Never reactivate old session.
  //
  // 3. No previous session:
  //    - Activation code required.
  //    - Create first session.
  // ============================================================
  const login = async (
    name,
    pin,
    activationCode = '',
    { silent = false } = {}
  ) => {
    setLoginLoading(true)
    setLoginError(null)

    const restaurantId = slugify(name)

    // ------------------------------------------------------------
    // STEP 1: CHECK ACTIVE SHIFT ONLY
    // ------------------------------------------------------------
    const {
      data: activeSession,
      error: activeError
    } = await supabase
      .from('sessions')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('pin', pin)
      .eq('is_active', true)
      .maybeSingle()

    if (activeError) {
      setLoginError(
        'Supabase connection ka masla hai. Dobara try karein.'
      )
      setLoginLoading(false)
      return
    }

    // ------------------------------------------------------------
    // ACTIVE SHIFT ALREADY EXISTS
    // ------------------------------------------------------------
    if (activeSession) {

      // Browser refresh / same tab resume
      if (silent) {
        sessionStorage.setItem(
          STAFF_LOGIN_KEY,
          JSON.stringify({
            name: activeSession.restaurant_name,
            pin
          })
        )

        setSession(activeSession)
        applyTheme(activeSession.theme)
        setLoginLoading(false)
        return
      }

      // Normal login: an active shift belongs to another live tab/device.
      // If its heartbeat is stale, treat it as an abandoned browser session
      // and close it automatically so a new tab can recover the restaurant.
      const lastSeenMs = new Date(
        activeSession.last_seen_at || activeSession.created_at
      ).getTime()
      const stale = !Number.isFinite(lastSeenMs) ||
        (Date.now() - lastSeenMs) > SESSION_LEASE_MS

      if (!stale) {
        setLoginError(
          'Ye restaurant already kisi doosri device par active hai. Pehle us device se Shift Close karein.'
        )
        setLoginLoading(false)
        return
      }

      await supabase
        .from('sessions')
        .update({
          is_active: false,
          closed_at: new Date().toISOString()
        })
        .eq('id', activeSession.id)
        .eq('is_active', true)
    }

    // ------------------------------------------------------------
    // STEP 2: NO ACTIVE SHIFT
    // CHECK FOR PREVIOUS CLOSED SHIFT
    // ------------------------------------------------------------
    const {
      data: oldSession,
      error: oldError
    } = await supabase
      .from('sessions')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('pin', pin)
      .eq('is_active', false)
      .order('closed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (oldError) {
      setLoginError(
        'Purani shift check nahi ho saki. Dobara try karein.'
      )
      setLoginLoading(false)
      return
    }

    // ------------------------------------------------------------
    // STEP 3: EXISTING RESTAURANT
    // CREATE COMPLETELY NEW SHIFT
    // ------------------------------------------------------------
    if (oldSession) {

      // Silent refresh ke waqt NEW SHIFT create nahi karni.
      // Sirf active session resume ho sakti hai.
      if (silent) {
        sessionStorage.removeItem(STAFF_LOGIN_KEY)
        setLoginLoading(false)
        return
      }

      const newShiftData = {
        restaurant_id: restaurantId,
        restaurant_name: oldSession.restaurant_name,
        pin,
        is_active: true,
        shift_started_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),

        // Restaurant settings carry forward
        logo_url: oldSession.logo_url,
        theme: oldSession.theme,

        // Tax settings carry forward
        tax_percent: oldSession.tax_percent ?? 0,
        tax_label: oldSession.tax_label || 'Tax',

        // IMPORTANT: keep the restaurant's permanent QR secret.
        // Closing a shift must never invalidate already-printed QRs.
        qr_secret: oldSession.qr_secret
      }

      const {
        data: newShift,
        error: newShiftError
      } = await supabase
        .from('sessions')
        .insert(newShiftData)
        .select('*')
        .single()

      if (newShiftError) {

        // PostgreSQL unique violation.
        // This can happen if another device opened the
        // restaurant at almost exactly the same time.
        if (newShiftError.code === '23505') {
          setLoginError(
            'Ye restaurant abhi kisi doosri device par active ho gaya hai.'
          )
        } else {
          setLoginError(
            'Naya shift create nahi ho saka. Supabase database check karein.'
          )
        }

        setLoginLoading(false)
        return
      }

      // ------------------------------------------------------------
      // COPY MENU + DELIVERY AREAS from previous shift
      // so staff don't have to re-enter everything on every login
      // ------------------------------------------------------------
      try {
        const { data: oldMenu } = await supabase
          .from('menu_items')
          .select('category, name, price, photo_url, badge, is_available, sort_order')
          .eq('session_id', oldSession.id)
          .order('sort_order', { ascending: true })

        if (oldMenu && oldMenu.length > 0) {
          const menuCopy = oldMenu.map(item => ({
            session_id: newShift.id,
            category: item.category,
            name: item.name,
            price: item.price,
            photo_url: item.photo_url || null,
            badge: item.badge || null,
            is_available: item.is_available !== false,
            sort_order: item.sort_order ?? 0,
          }))
          await supabase.from('menu_items').insert(menuCopy)
        }

        const { data: oldAreas } = await supabase
          .from('delivery_areas')
          .select('name, charge')
          .eq('session_id', oldSession.id)

        if (oldAreas && oldAreas.length > 0) {
          const areasCopy = oldAreas.map(a => ({
            session_id: newShift.id,
            name: a.name,
            charge: a.charge ?? 0,
          }))
          await supabase.from('delivery_areas').insert(areasCopy)
        }
      } catch (copyErr) {
        console.error('Failed to copy menu/areas to new shift:', copyErr)
        // Non-fatal: shift still works, staff can re-add menu if needed
      }

      // Save this browser tab's login state
      sessionStorage.setItem(
        STAFF_LOGIN_KEY,
        JSON.stringify({
          name: newShift.restaurant_name,
          pin
        })
      )

      setSession(newShift)
      applyTheme(newShift.theme)
      setLoginLoading(false)
      return
    }

    // ------------------------------------------------------------
    // STEP 4: COMPLETELY NEW RESTAURANT
    // ACTIVATION CODE REQUIRED
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // CHECK ACTIVATION CODE
    // ------------------------------------------------------------
    const {
      data: codeRow,
      error: codeError
    } = await supabase
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

    // ------------------------------------------------------------
    // CREATE FIRST SESSION
    // ------------------------------------------------------------
    const {
      data: created,
      error: createError
    } = await supabase
      .from('sessions')
      .insert({
        restaurant_id: restaurantId,
        restaurant_name: name,
        pin,
        is_active: true,
        shift_started_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),

        // Default tax settings
        tax_percent: 0,
        tax_label: 'Tax'

        // qr_secret is generated automatically by Supabase
      })
      .select('*')
      .single()

    if (createError) {

      if (createError.code === '23505') {
        setLoginError(
          'Ye restaurant abhi kisi doosri device par active ho gaya hai.'
        )
      } else {
        setLoginError(
          'Session create nahi ho saka. Supabase connection check karein.'
        )
      }

      setLoginLoading(false)
      return
    }

    // ------------------------------------------------------------
    // MARK ACTIVATION CODE AS USED
    // ------------------------------------------------------------
    await supabase
      .from('activation_codes')
      .update({
        is_used: true,
        used_by: restaurantId
      })
      .eq('id', codeRow.id)

    // ------------------------------------------------------------
    // CREATE STARTER MENU
    // ------------------------------------------------------------
    const seedRows = STARTER_MENU.flatMap(
      (section, sIdx) =>
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

    // ------------------------------------------------------------
    // SAVE LOGIN
    // ------------------------------------------------------------
    sessionStorage.setItem(
      STAFF_LOGIN_KEY,
      JSON.stringify({
        name,
        pin
      })
    )

    setSession(created)
    applyTheme(created.theme)
    setLoginLoading(false)
  }

  // ============================================================
  // AUTO LOGIN / REFRESH
  //
  // sessionStorage is deliberately used here:
  // - same tab + browser refresh => resume
  // - new tab/device => must log in again
  // - active shift on another tab/device => normal login is blocked
  // ============================================================
  useEffect(() => {
    async function resumeExistingLogin() {
      const navigationEntry =
        window.performance?.getEntriesByType?.('navigation')?.[0]
      const navigationType = navigationEntry?.type

      // Never auto-login on a normal new visit/new tab.
      // Only a true browser reload may resume this tab's sessionStorage state.
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
        if (!name || !pin) throw new Error('Invalid saved login')
        await login(name, pin, '', { silent: true })
      } catch {
        sessionStorage.removeItem(STAFF_LOGIN_KEY)
      }

      setResuming(false)
    }

    resumeExistingLogin()
    // login is intentionally omitted because this effect should run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      await supabase
        .from('sessions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', session.id)
        .eq('is_active', true)
    }

    beat()
    const timer = window.setInterval(beat, HEARTBEAT_MS)

    return () => window.clearInterval(timer)
  }, [session?.id])

  // ============================================================
  // LOGO / THEME
  // ============================================================
  const handleLogoApplied = (logo_url, theme) => {
    setSession(prev => ({
      ...prev,
      logo_url,
      theme
    }))

    applyTheme(theme)
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

    const {
      error
    } = await supabase
      .from('sessions')
      .update({
        is_active: false,
        closed_at: new Date().toISOString()
      })
      .eq('id', session.id)

    if (error) {
      setLoginError(
        'Shift close nahi ho saki. Dobara try karein.'
      )
      return
    }

    // Remove current browser-tab login
    sessionStorage.removeItem(STAFF_LOGIN_KEY)

    setShowEOD(false)
    setSession(null)
  }

  // ============================================================
  // LOGOUT
  // ============================================================
  const logout = () => {
    sessionStorage.removeItem(STAFF_LOGIN_KEY)
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
    <div className="screen">

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
              border:
                '1px solid rgba(255,255,255,0.3)',
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

        <button
          onClick={() => setTab('qr')}
          style={tabStyle(tab === 'qr')}
        >
          QR Codes
        </button>

        <button
          onClick={() => setTab('areas')}
          style={tabStyle(tab === 'areas')}
        >
          Delivery Areas
        </button>

        <button
          onClick={() => setTab('tax')}
          style={tabStyle(tab === 'tax')}
        >
          Tax Settings
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
        />

      ) : tab === 'areas' ? (

        <DeliveryAreas
          sessionId={session.id}
          restaurantId={session.restaurant_id}
          qrSecret={session.qr_secret}
          restaurantName={session.restaurant_name}
          logoUrl={session.logo_url}
        />

      ) : tab === 'tax' ? (

        <TaxSettings
          sessionId={session.id}
          currentTaxPercent={
            session.tax_percent || 0
          }
          currentTaxLabel={
            session.tax_label || 'Tax'
          }
          onSave={updateTaxSettings}
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
                !!alertsByTable[
                  order.table_id
                ]?.water
              }
              hasWaiterAlert={
                !!alertsByTable[
                  order.table_id
                ]?.waiter
              }
              onAccept={acceptOrder}
              onServe={serveOrder}
              onResolveAlert={
                resolveTableAlerts
              }
              onPrint={setPrintOrder}
            />

          ))}

        </div>
      )}

      {/* ======================================================
          PRINTABLE TICKET
      ====================================================== */}
      <PrintableTicket
        order={printOrder}
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
