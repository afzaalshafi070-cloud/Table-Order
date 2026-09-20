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
import DeliveryAreas from '../components/DeliveryAreas.jsx'
import TaxSettings from '../components/TaxSettings.jsx'  // NEW COMPONENT
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
  const {
    restaurantId: urlRestaurantId,
    pin: urlPin
  } = useParams()

  const [session, setSession] = useState(null)
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [showEOD, setShowEOD] = useState(false)
  const [tab, setTab] = useState('orders')
  const [resuming, setResuming] = useState(true)
  const [printOrder, setPrintOrder] = useState(null)

  useEffect(() => {
    if (!printOrder) return
    const t = setTimeout(() => { window.print() }, 50)
    const clear = () => { setPrintOrder(null) }
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
    {
      onNewOrder: handleNewOrder,
      shiftStartedAt: session?.shift_started_at || session?.created_at
    }
  )

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
  // 1. PEHLE SIRF ACTIVE SHIFT CHECK KARO
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
    setLoginError('Supabase connection ka masla hai. Dobara try karein.')
    setLoginLoading(false)
    return
  }

  // ------------------------------------------------------------
  // 2. ACTIVE SHIFT MIL GAYI
  // ------------------------------------------------------------
  if (activeSession) {

    // Refresh / same browser tab ke liye saved login allow
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

    // Agar normal login hai aur active shift already chal rahi hai,
    // doosri device ko login nahi karne dena.
    const saved = sessionStorage.getItem(STAFF_LOGIN_KEY)

    if (saved) {
      try {
        const savedLogin = JSON.parse(saved)

        if (
          savedLogin?.name &&
          savedLogin?.pin === pin &&
          slugify(savedLogin.name) === restaurantId
        ) {
          setSession(activeSession)
          applyTheme(activeSession.theme)
          setLoginLoading(false)
          return
        }
      } catch {
        sessionStorage.removeItem(STAFF_LOGIN_KEY)
      }
    }

    setLoginError(
      'Ye restaurant already kisi doosri device par active hai. Pehle us device se Shift Close karein.'
    )
    setLoginLoading(false)
    return
  }

  // ------------------------------------------------------------
  // 3. ACTIVE SHIFT NAHI HAI
  // Ab purani CLOSED shift dhoondo.
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
    setLoginError('Purani shift check nahi ho saki. Dobara try karein.')
    setLoginLoading(false)
    return
  }

  // ------------------------------------------------------------
  // 4. PURANA RESTAURANT
  // New session create hogi.
  // Purani orders purani session mein rahengi.
  // ------------------------------------------------------------
  if (oldSession) {

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
      logo_url: oldSession.logo_url,
      theme: oldSession.theme,
      tax_percent: oldSession.tax_percent ?? 0,
      tax_label: oldSession.tax_label || 'Tax'
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

      // Agar isi waqt kisi doosri device ne shift open kar di
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
  // 5. BILKUL NAYA RESTAURANT
  // Activation code required.
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
      tax_percent: 0,
      tax_label: 'Tax'
    })
    .select('*')
    .single()

  if (createError) {
    setLoginError(
      'Session create nahi ho saka. Supabase database check karein.'
    )
    setLoginLoading(false)
    return
  }

  await supabase
    .from('activation_codes')
    .update({
      is_used: true,
      used_by: restaurantId
    })
    .eq('id', codeRow.id)

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
  const login = async (
    name,
    pin,
    activationCode = '',
    { silent = false } = {}
  ) => {
    setLoginLoading(true)
    setLoginError(null)

    const restaurantId = slugify(name)

    let {
      data: existing,
      error: lookupError
    } = await supabase
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

    // ============================================================
    // FIX #1: SHIFT ISOLATION
    // Instead of reactivating closed shift, CREATE A NEW SESSION
    // ============================================================
    if (existing && !existing.is_active) {
      if (silent) {
        sessionStorage.removeItem(STAFF_LOGIN_KEY)
        setLoginLoading(false)
        return
      }

      // Create a NEW session for this shift instead of reactivating
      // This ensures old orders don't appear in new shift
      const newShiftData = {
        restaurant_id: restaurantId,
        restaurant_name: existing.restaurant_name,  // Keep restaurant name
        pin,
        is_active: true,
        shift_started_at: new Date().toISOString(),
        logo_url: existing.logo_url,  // Carry over logo
        theme: existing.theme,         // Carry over theme
        tax_percent: existing.tax_percent,  // Carry over tax settings
        tax_label: existing.tax_label,
        // qr_secret will be auto-generated as different
      }

      const {
        data: reopened,
        error: reopenError
      } = await supabase
        .from('sessions')
        .insert(newShiftData)
        .select()
        .single()

      if (reopenError) {
        setLoginError('Naya shift create nahi ho saka. Supabase connection check karein.')
        setLoginLoading(false)
        return
      }

      existing = reopened
    }

    if (!existing) {
      if (silent) {
        sessionStorage.removeItem(STAFF_LOGIN_KEY)
        setLoginLoading(false)
        return
      }

      if (!activationCode) {
        setLoginError('Naya restaurant banane ke liye activation code chahiye.')
        setLoginLoading(false)
        return
      }

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
        setLoginError('Ye activation code ghalat hai ya pehle istemal ho chuka hai.')
        setLoginLoading(false)
        return
      }

      const {
        data: created,
        error
      } = await supabase
        .from('sessions')
        .insert({
          restaurant_id: restaurantId,
          restaurant_name: name,
          pin,
          is_active: true,
          shift_started_at: new Date().toISOString(),
          tax_percent: 0,           // Default: no tax
          tax_label: 'Tax'          // Default: label
        })
        .select()
        .single()

      if (error) {
        setLoginError('Session create nahi ho saka. Supabase connection check karein.')
        setLoginLoading(false)
        return
      }

      existing = created

      await supabase
        .from('activation_codes')
        .update({
          is_used: true,

  }

  useEffect(() => {
    async function tryUrlLogin() {
      if (!urlRestaurantId || !urlPin) return false

      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('restaurant_id', urlRestaurantId)
        .eq('pin', urlPin)
        .eq('is_active', true)
        .maybeSingle()

      if (error || !data) return false

      sessionStorage.setItem(
        STAFF_LOGIN_KEY,
        JSON.stringify({
          name: data.restaurant_name,
          pin: urlPin
        })
      )

      setSession(data)
      applyTheme(data.theme)
      return true
    }

    async function resumeExistingLogin() {
      if (await tryUrlLogin()) {
        setResuming(false)
        return
      }

      const navigationEntry =
        window.performance?.getEntriesByType?.('navigation')?.[0]
      const navigationType = navigationEntry?.type

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogoApplied = (logo_url, theme) => {
    setSession(prev => ({ ...prev, logo_url, theme }))
    applyTheme(theme)
  }

  // ============================================================
  // FIX #2: UPDATE SHIFT CLOSING (no longer reactivates)
  // ============================================================
  const closeShift = async () => {
    if (!session?.id) return
    // Mark current session as closed
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
    // Next login will create a NEW session, not reactivate this one
  }

  const logout = () => {
    sessionStorage.removeItem(STAFF_LOGIN_KEY)
    setSession(null)
  }

  const acceptOrder = async order => {
    await supabase
      .from('orders')
      .update({ status: 'cooking' })
      .eq('id', order.id)
  }

  const serveOrder = async order => {
    await supabase
      .from('orders')
      .update({ status: 'served' })
      .eq('id', order.id)
  }

  const resolveTableAlerts = async tableId => {
    if (!session?.id) return
    await supabase
      .from('alerts')
      .update({ resolved: true })
      .eq('session_id', session.id)
      .eq('table_id', tableId)
  }

  // ============================================================
  // FIX #3: Update session tax settings
  // ============================================================
  const updateTaxSettings = async (taxPercent, taxLabel) => {
    if (!session?.id) return
    await supabase
      .from('sessions')
      .update({
        tax_percent: taxPercent,
        tax_label: taxLabel
      })
      .eq('id', session.id)
    
    setSession(prev => ({
      ...prev,
      tax_percent: taxPercent,
      tax_label: taxLabel
    }))
  }

  if (resuming) {
    return (
      <div
        className="screen"
        style={{ alignItems: 'center', justifyContent: 'center' }}
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
    order => order.status !== 'served' && order.status !== 'cancelled'
  )

  const alertsByTable = alerts.reduce((map, alert) => {
    map[alert.table_id] = map[alert.table_id] || {}
    map[alert.table_id][alert.type] = true
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {session.logo_url && (
            <img
              src={session.logo_url}
              alt=""
              style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }}
            />
          )}
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.7 }}>
              COUNTER
            </div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 19, fontWeight: 600 }}>
              {session.restaurant_name}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
          <LogoUploader sessionId={session.id} onApplied={handleLogoApplied} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0', flexWrap: 'wrap' }}>
        <button onClick={() => setTab('orders')} style={tabStyle(tab === 'orders')}>Orders</button>
        <button onClick={() => setTab('menu')} style={tabStyle(tab === 'menu')}>Menu Editor</button>
        <button onClick={() => setTab('qr')} style={tabStyle(tab === 'qr')}>QR Codes</button>
        <button onClick={() => setTab('areas')} style={tabStyle(tab === 'areas')}>Delivery Areas</button>
        <button onClick={() => setTab('tax')} style={tabStyle(tab === 'tax')}>Tax Settings</button>
      </div>

      {tab === 'menu' ? (
        <MenuEditor sessionId={session.id} />
      ) : tab === 'qr' ? (
        <QRCodes restaurantId={session.restaurant_id} qrSecret={session.qr_secret} />
      ) : tab === 'areas' ? (
        <DeliveryAreas
          sessionId={session.id}
          restaurantId={session.restaurant_id}
          qrSecret={session.qr_secret}
        />
      ) : tab === 'tax' ? (
        <TaxSettings
          sessionId={session.id}
          currentTaxPercent={session.tax_percent || 0}
          currentTaxLabel={session.tax_label || 'Tax'}
          onSave={updateTaxSettings}
        />
      ) : (
        <div className="order-grid" style={{ padding: 16, overflowY: 'auto' }}>
          {activeOrders.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#9a9284', padding: '40px 0' }}>
              No active tickets — the floor is quiet.
            </div>
          )}
          {activeOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              hasWaterAlert={!!alertsByTable[order.table_id]?.water}
              hasWaiterAlert={!!alertsByTable[order.table_id]?.waiter}
              onAccept={acceptOrder}
              onServe={serveOrder}
              onResolveAlert={resolveTableAlerts}
              onPrint={setPrintOrder}
            />
          ))}
        </div>
      )}

      <PrintableTicket order={printOrder} restaurantName={session.restaurant_name} />

      {showEOD && (
        <EODReport
          restaurantName={session.restaurant_name}
          orders={orders}
          sessionOpenedAt={session.shift_started_at || session.created_at}
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
          .order-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 600px) {
          .order-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  )
}
