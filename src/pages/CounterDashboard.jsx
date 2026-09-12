import { useCallback, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { useRealtimeOrders } from '../hooks/useRealtimeOrders.js'
import { playDingDong } from '../utils/audio.js'
import LoginGate from '../components/LoginGate.jsx'
import OrderCard from '../components/OrderCard.jsx'
import EODReport from '../components/EODReport.jsx'
import LogoUploader from '../components/LogoUploader.jsx'
import MenuEditor from '../components/MenuEditor.jsx'
import { applyTheme } from '../utils/theme.js'
import { MENU as STARTER_MENU } from '../data/menu.js'

function slugify(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

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

  const handleNewOrder = useCallback(() => { playDingDong() }, [])

  const { orders, alerts } = useRealtimeOrders(session?.id, { onNewOrder: handleNewOrder })

  const login = async (name, pin) => {
    setLoginLoading(true)
    setLoginError(null)
    const restaurantId = slugify(name)

    // Try to find an existing active session for this restaurant + PIN,
    // otherwise open a new one (first login of the day acts as "open shift").
    let { data: existing } = await supabase
      .from('sessions')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('pin', pin)
      .eq('is_active', true)
      .maybeSingle()

    if (!existing) {
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

    setSession(existing)
    applyTheme(existing.theme) // no-op if empty — falls back to default palette
    setLoginLoading(false)
  }

  const handleLogoApplied = (logo_url, theme) => {
    setSession(prev => ({ ...prev, logo_url, theme }))
  }

  const closeShift = async (report) => {
    await supabase.from('sessions').update({ is_active: false, closed_at: new Date().toISOString() }).eq('id', session.id)
    setShowEOD(false)
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

      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0' }}>
        <button onClick={() => setTab('orders')} style={tabStyle(tab === 'orders')}>Orders</button>
        <button onClick={() => setTab('menu')} style={tabStyle(tab === 'menu')}>Menu Editor</button>
      </div>

      {tab === 'menu' ? (
        <MenuEditor sessionId={session.id} />
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
          />
        ))}
      </div>
      )}

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
