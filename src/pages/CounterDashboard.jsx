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

  // On page load/refresh, silently reconnect using the last saved staff
  // login instead of forcing a fresh name+PIN entry every time — a phone
  // refresh, lock/unlock, or accidental tab close shouldn't log staff out.
  useEffect(() => {
    const saved = localStorage.getItem(STAFF_LOGIN_KEY)
    if (!saved) { setResuming(false); return }
    try {
      const { name, pin } = JSON.parse(saved)
      login(name, pin, { silent: true }).finally(() => setResuming(false))
    } catch {
      setResuming(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = async (name, pin, { silent = false } = {}) => {
    setLoginLoading(true)
    setLoginError(null)
    const restaurantId = slugify(name)

    // 1. Prefer an already-active session for this restaurant + PIN
    let { data: existing } = await supabase
      .from('sessions')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('pin', pin)
      .eq('is_active', true)
      .maybeSingle()

    // 2. If none is active, try to re-open the most recent closed session
    //    (same restaurant + PIN). This avoids the unique(restaurant_id, pin)
    //    constraint error that blocked login after "Close Shift".
    if (!existing) {
      const { data: closed } = await supabase
        .from('sessions')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('pin', pin)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (closed) {
        if (silent) {
          // Auto-resume should not reopen a closed shift by itself
          localStorage.removeItem(STAFF_LOGIN_KEY)
          setLoginLoading(false)
          return
        }
        const { data: reopened, error: reopenErr } = await supabase
          .from('sessions')
          .update({ is_active: true, closed_at: null })
          .eq('id', closed.id)
          .select()
          .single()
        if (reopenErr) {
          setLoginError('Could not reopen the previous shift. Please try again.')
          setLoginLoading(false)
          return
        }
        existing = reopened
      }
    }

    // 3. Still nothing → create a brand-new session (first time ever)
    if (!existing) {
      if (silent) {
        localStorage.removeItem(STAFF_LOGIN_KEY)
        setLoginLoading(false)
        return
      }
      const { data: created, error } = await supabase
        .from('sessions')
        .insert({ restaurant_id: restaurantId, restaurant_name: name, pin, is_active: true })
        .select()
        .single()
      if (error) {
        console.error('Session create error:', error)
        setLoginError('Could not open a session. Check your Supabase connection.')
        setLoginLoading(false)
        return
      }
      existing = created

      // First login ever for this restaurant — seed a starter menu
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
    applyTheme(existing.theme)
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
