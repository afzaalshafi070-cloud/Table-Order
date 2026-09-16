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
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

const STAFF_LOGIN_KEY = 'tableorder:staffLogin'

function tabStyle(active) {
  return {
    border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700,
    background: active ? 'var(--brand-primary)' : 'var(--paper-dim)',
    color: active ? 'var(--brand-primary-text)' : 'var(--ink)'
  }
}

export default function CounterDashboard() {
  const { restaurantId: urlRestaurantId, pin: urlPin } = useParams()
  const [session, setSession] = useState(null) // { id, restaurant_name, created_at }
  const [loginError, setLoginError] = useState(null)
  const [loginLoading, setLoginLoading] = useState(false)
  const [showEOD, setShowEOD] = useState(false)
  const [tab, setTab] = useState('orders') // 'orders' | 'menu'
  const [resuming, setResuming] = useState(true) // true while we check for a saved login
  const [printOrder, setPrintOrder] = useState(null)

  useEffect(() => {
    if (!printOrder) return
    const t = setTimeout(() => window.print(), 50) // let the hidden ticket render first
    const clear = () => setPrintOrder(null)
    window.addEventListener('afterprint', clear)
    return () => { clearTimeout(t); window.removeEventListener('afterprint', clear) }
  }, [printOrder])

  const handleNewOrder = useCallback(() => { playDingDong() }, [])

  const { orders, alerts } = useRealtimeOrders(session?.id, { onNewOrder: handleNewOrder })

  // On page load/refresh, silently reconnect — either via a QR/direct-login
  // link (/dashboard/:restaurantId/:pin, so staff never has to type
  // name+PIN at all) or via the last saved staff login, so a phone
  // refresh, lock/unlock, or accidental tab close doesn't log staff out.
  useEffect(() => {
    async function tryUrlLogin() {
      if (!urlRestaurantId || !urlPin) return false
      const { data } = await supabase
        .from('sessions')
        .select('*')
        .eq('restaurant_id', urlRestaurantId)
        .eq('pin', urlPin)
        .eq('is_active', true)
        .maybeSingle()
      if (!data) return false
      localStorage.setItem(STAFF_LOGIN_KEY, JSON.stringify({ name: data.restaurant_name, pin: urlPin }))
      setSession(data)
      applyTheme(data.theme)
      return true
    }

    async function resume() {
      if (await tryUrlLogin()) { setResuming(false); return }
      const saved = localStorage.getItem(STAFF_LOGIN_KEY)
      if (!saved) { setResuming(false); return }
      try {
        const { name, pin } = JSON.parse(saved)
        await login(name, pin, '', { silent: true })
      } catch { /* fall through to the login screen */ }
      setResuming(false)
    }
    resume()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = async (name, pin, activationCode = '', { silent = false } = {}) => {
    setLoginLoading(true)
    setLoginError(null)
    const restaurantId = slugify(name)

    // A (restaurant_id, pin) pair is unique in the schema, so there is at
    // most one row ever for this restaurant+PIN — whether it's currently
    // an open shift or one that was closed earlier today.
    let { data: existing } = await supabase
      .from('sessions')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('pin', pin)
      .maybeSingle()

    if (existing && !existing.is_active) {
      // Same restaurant, same PIN, just re-opening after a previous
      // "Close Shift" — reopen the existing row. No activation code
      // needed here; that gate is only for a restaurant that has never
      // existed before.
      if (silent) {
        // A silent auto-resume shouldn't reopen a shift on its own —
        // only an explicit login should decide to start a new shift.
        localStorage.removeItem(STAFF_LOGIN_KEY)
        setLoginLoading(false)
        return
      }
      const { data: reopened, error: reopenError } = await supabase
        .from('sessions')
        .update({ is_active: true, closed_at: null })
        .eq('id', existing.id)
        .select().single()
      if (reopenError) {
        setLoginError('Could not reopen this restaurant. Check your Supabase connection.')
        setLoginLoading(false)
        return
      }
      existing = reopened
    }

    if (!existing) {
      // A silent auto-resume should never create a brand-new session by
      // itself — just fall back to asking the user to log in again.
      if (silent) {
        localStorage.removeItem(STAFF_LOGIN_KEY)
        setLoginLoading(false)
        return
      }

      // Brand-new restaurant: an unused activation code is required so a
      // stranger can't spin up a free restaurant just by guessing a name
      // and PIN. Existing restaurants logging back in never hit this path.
      if (!activationCode) {
        setLoginError('Naya restaurant banane ke liye activation code chahiye.')
        setLoginLoading(false)
        return
      }
      const { data: codeRow } = await supabase
        .from('activation_codes')
        .select('*')
        .eq('code', activationCode)
        .eq('is_used', false)
        .maybeSingle()
      if (!codeRow) {
        setLoginError('Ye activation code ghalat hai ya pehle istemal ho chuka hai.')
        setLoginLoading(false)
        return
      }

      const { data: created, error } = await supabase
        .from('sessions')
        .insert({ restaurant_id: restaurantId, restaurant_name: name, pin, is_active: true })
        .select().single()
      if (error) {
        setLoginError('Could not open a session. Check your Supabase connection.')
        setLoginLoading(false)
        return
      }
      existing = created

      // Mark the code spent and record who used it, so it can never be
      // reused for a second restaurant.
      await supabase.from('activation_codes')
        .update({ is_used: true, used_by: restaurantId })
        .eq('id', codeRow.id)

      // First login ever for this restaurant — give them a starter menu
      // they can immediately edit, rather than a blank Menu Editor.
      const seedRows = STARTER_MENU.flatMap((section, sIdx) =>
        section.items.map((item, iIdx) => ({
          session_id: created.id,
          category: section.category,
          name: item.name,
          price: item.price,
          sort_order: sIdx * 100 + iIdx,
        }))
      )
      await supabase.from('menu_items').insert(seedRows)
    }

    localStorage.setItem(STAFF_LOGIN_KEY, JSON.stringify({ name, pin }))
    setSession(existing)
    applyTheme(existing.theme) // no-op if empty — falls back to default palette
    setLoginLoading(false)
  }

  const handleLogoApplied = (logo_url, theme) => {
    setSession(prev => ({ ...prev, logo_url, theme }))
  }

  const closeShift = async (report) => {
    await supabase.from('sessions').update({ is_active: false, closed_at: new Date().toISOString() }).eq('id', session.id)
    localStorage.removeItem(STAFF_LOGIN_KEY)
    setShowEOD(false)
    setSession(null)
  }

  const logout = () => {
    localStorage.removeItem(STAFF_LOGIN_KEY)
    setSession(null)
  }

  const acceptOrder = async (order) => {
    await supabase.from('orders').update({ status: 'cooking' }).eq('id', order.id)
  }
  const serveOrder = async (order) => {
    await supabase.from('orders').update({ status: 'served' }).eq('id', order.id)
  }
  const resolveTableAlerts = async (tableId) => {
    await supabase.from('alerts').update({ resolved: true }).eq('session_id', session.id).eq('table_id', tableId)
  }

  if (resuming) {
    return <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }} />
  }
  if (!session) {
    return <LoginGate onSubmit={login} error={loginError} loading={loginLoading} />
  }

  const activeOrders = orders.filter(o => o.status !== 'served' && o.status !== 'cancelled')
  const alertsByTable = alerts.reduce((map, a) => {
    map[a.table_id] = map[a.table_id] || {}
    map[a.table_id][a.type] = true
    return map
  }, {})

  return (
    <div className="screen">
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 18px', borderBottom: '1px solid var(--line)', background: 'var(--brand-ink)', color: '#fff'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {session.logo_url && (
            <img src={session.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
          )}
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.7 }}>COUNTER</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 19, fontWeight: 600 }}>{session.restaurant_name}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <LogoUploader sessionId={session.id} existingLogoUrl={session.logo_url} onApplied={handleLogoApplied} compact />
          <button onClick={logout} style={{
            background: 'transparent', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: 8, padding: '10px 12px', fontSize: 12
          }}>Log out</button>
          <button onClick={() => setShowEOD(true)} style={{
            background: 'var(--clay)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 16px', fontWeight: 700, fontSize: 13
          }}>Close Shift</button>
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
      </div>

      {tab === 'menu' ? (
        <MenuEditor sessionId={session.id} />
      ) : tab === 'qr' ? (
        <QRCodes restaurantId={session.restaurant_id} pin={session.pin} />
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
          sessionOpenedAt={session.created_at}
          onClose={() => setShowEOD(false)}
          onCloseShift={closeShift}
        />
      )}

      <style>{`
        /* Mobile: strict 2-column grid, endless vertical scroll */
        .order-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          align-content: start;
        }
        /* Desktop: 3x2 matrix showing 6 tickets at a glance */
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
