import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { useRealtimeOrders } from '../hooks/useRealtimeOrders.js'
import { useMenuItems } from '../hooks/useMenuItems.js'
import MenuList from '../components/MenuList.jsx'
import CartBar from '../components/CartBar.jsx'
import FloatingActions from '../components/FloatingActions.jsx'
import WaitingScreen from '../components/WaitingScreen.jsx'
import ChefPopup from '../components/ChefPopup.jsx'
import NotFound from './NotFound.jsx'
import { applyTheme } from '../utils/theme.js'

export default function CustomerPortal() {
  const { restaurantId, pin, tableId } = useParams()

  // ---- Required URL params: clean error screen if anything is missing ----
  if (!restaurantId || !pin || !tableId) {
    return <NotFound message="This QR code is missing a restaurant, PIN, or table number." />
  }

  const [sessionState, setSessionState] = useState('loading') // loading | ready | invalid
  const [sessionId, setSessionId] = useState(null)
  const [restaurant, setRestaurant] = useState(null) // { restaurant_name, logo_url, theme }
  const [cart, setCart] = useState({})
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [activeOrderId, setActiveOrderId] = useState(null)
  const [showChefPopup, setShowChefPopup] = useState(false)
  const lastStatusRef = useRef(null)

  // Resolve the room: restaurant_id + pin must match an active session
  useEffect(() => {
    let cancelled = false
    async function resolveSession() {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, is_active, restaurant_name, logo_url, theme')
        .eq('restaurant_id', restaurantId)
        .eq('pin', pin)
        .eq('is_active', true)
        .maybeSingle()

      if (cancelled) return
      if (error || !data) {
        setSessionState('invalid')
      } else {
        setSessionId(data.id)
        setRestaurant(data)
        applyTheme(data.theme) // no-op if theme is empty — falls back to defaults
        setSessionState('ready')
      }
    }
    resolveSession()
    return () => { cancelled = true }
  }, [restaurantId, pin])

  const { orders } = useRealtimeOrders(sessionId)
  const { items: menuItems } = useMenuItems(sessionId)
  const activeOrder = useMemo(
    () => orders.find(o => o.id === activeOrderId),
    [orders, activeOrderId]
  )

  // Fire the chef popup exactly once when status transitions into "cooking"
  useEffect(() => {
    if (!activeOrder) return
    if (activeOrder.status === 'cooking' && lastStatusRef.current !== 'cooking') {
      setShowChefPopup(true)
    }
    lastStatusRef.current = activeOrder.status
  }, [activeOrder])

  if (sessionState === 'loading') {
    return <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>Loading table…</div>
  }
  if (sessionState === 'invalid') {
    return <NotFound message="This table session isn't active. Please ask staff for a fresh QR code." />
  }

  const addItem = (item) => {
    setCart(prev => ({
      ...prev,
      [item.id]: { ...item, qty: (prev[item.id]?.qty || 0) + 1 }
    }))
  }
  const removeItem = (item) => {
    setCart(prev => {
      const existing = prev[item.id]
      if (!existing) return prev
      if (existing.qty <= 1) {
        const { [item.id]: _drop, ...rest } = prev
        return rest
      }
      return { ...prev, [item.id]: { ...existing, qty: existing.qty - 1 } }
    })
  }

  const sendOrder = async () => {
    const items = Object.values(cart).map(({ id, name, price, qty }) => ({ id, name, price, qty }))
    if (items.length === 0) return
    setSending(true)
    const total = items.reduce((s, i) => s + i.qty * i.price, 0)
    const { data, error } = await supabase.from('orders').insert({
      session_id: sessionId,
      table_id: tableId,
      items,
      note,
      total,
      status: 'pending',
    }).select().single()
    setSending(false)
    if (!error && data) {
      setActiveOrderId(data.id)
      setCart({})
      setNote('')
    }
  }

  const raiseAlert = async (type) => {
    await supabase.from('alerts').insert({ session_id: sessionId, table_id: tableId, type })
  }

  return (
    <div className="screen">
      <ChefPopup show={showChefPopup} onDone={() => setShowChefPopup(false)} />

      <header style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--brand-ink)', color: '#fff'
      }}>
        {restaurant?.logo_url && (
          <img src={restaurant.logo_url} alt="" style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
        )}
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {restaurant?.restaurant_name || restaurantId.replace(/-/g, ' ')}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.75 }}>Table {tableId}</div>
        </div>
      </header>

      {activeOrder ? (
        <WaitingScreen order={activeOrder} />
      ) : (
        <>
          <MenuList items={menuItems} cart={cart} onAdd={addItem} onRemove={removeItem} />
          <CartBar
            cart={cart}
            note={note}
            onNoteChange={setNote}
            onSend={sendOrder}
            sending={sending}
          />
        </>
      )}

      <FloatingActions
        onWater={() => raiseAlert('water')}
        onWaiter={() => raiseAlert('waiter')}
      />
    </div>
  )
}
