import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { useRealtimeOrders } from '../hooks/useRealtimeOrders.js'
import { useMenuItems } from '../hooks/useMenuItems.js'
import MenuList from '../components/MenuList.jsx'
import PhotoCarousel from '../components/PhotoCarousel.jsx'
import NoteBar from '../components/NoteBar.jsx'
import CartBar from '../components/CartBar.jsx'
import CartModal from '../components/CartModal.jsx'
import FloatingActions from '../components/FloatingActions.jsx'
import WaitingScreen from '../components/WaitingScreen.jsx'
import ChefPopup from '../components/ChefPopup.jsx'
import NotFound from './NotFound.jsx'
import { applyTheme } from '../utils/theme.js'
import { locationLabel, isTakeaway } from '../utils/locationLabel.js'

export default function CustomerPortal() {
  const { restaurantId, secret, tableId } = useParams()

  // ---- Required URL params: clean error screen if anything is missing ----
  if (!restaurantId || !secret || !tableId) {
    return <NotFound message="This QR code is missing a restaurant, secret, or table number." />
  }

  const [sessionState, setSessionState] = useState('loading') // loading | ready | invalid
  const [sessionId, setSessionId] = useState(null)
  const [restaurant, setRestaurant] = useState(null) // { restaurant_name, logo_url, theme }
  const [cart, setCart] = useState({})
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [myOrderIds, setMyOrderIds] = useState([]) // every order *this* customer has placed this visit
  const [view, setView] = useState('menu') // 'menu' | 'orders'
  const [showChefPopup, setShowChefPopup] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const lastStatusRef = useRef({})

  const storageKey = sessionId ? `tableorder:myOrders:${sessionId}:${tableId}` : null

  // Resolve the room: restaurant_id + qr_secret must match an active session
  useEffect(() => {
    let cancelled = false
    async function resolveSession() {
      const { data, error } = await supabase
        .from('sessions')
        .select('id, is_active, restaurant_name, logo_url, theme')
        .eq('restaurant_id', restaurantId)
        .eq('qr_secret', secret)
        .eq('is_active', true)
        .maybeSingle()

      if (cancelled) return
      if (error || !data) {
        setSessionState('invalid')
      } else {
        setSessionId(data.id)
        setRestaurant(data)
        applyTheme(data.theme) // no-op if theme is empty — falls back to defaults

        // Restore this customer's own orders (e.g. after a page refresh)
        // so they land back on "my orders" instead of a blank menu.
        try {
          const saved = JSON.parse(localStorage.getItem(`tableorder:myOrders:${data.id}:${tableId}`)) || []
          if (saved.length > 0) {
            setMyOrderIds(saved)
            setView('orders')
          }
        } catch { /* ignore malformed storage */ }

        setSessionState('ready')
      }
    }
    resolveSession()
    return () => { cancelled = true }
  }, [restaurantId, secret])

  const { orders } = useRealtimeOrders(sessionId)
  const { items: menuItems } = useMenuItems(sessionId)

  const myOrders = useMemo(
    () => orders.filter(o => myOrderIds.includes(o.id)).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [orders, myOrderIds]
  )

  // Fire the chef popup once per order the first time it flips to "cooking"
  useEffect(() => {
    myOrders.forEach(o => {
      if (o.status === 'cooking' && lastStatusRef.current[o.id] !== 'cooking') {
        setShowChefPopup(true)
      }
      lastStatusRef.current[o.id] = o.status
    })
  }, [myOrders])

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

  const sendOrder = async (contact = {}) => {
    const items = Object.values(cart).map(({ id, name, price, qty }) => ({ id, name, price, qty }))
    if (items.length === 0) return
    setSending(true)
    const total = items.reduce((s, i) => s + i.qty * i.price, 0)

    // Takeaway optional contact → store in note (no DB schema change)
    let finalNote = note || ''
    if (isTakeaway(tableId)) {
      const bits = []
      if (contact.customerName) bits.push(`Name: ${contact.customerName}`)
      if (contact.phone) bits.push(`Phone: ${contact.phone}`)
      if (contact.address) bits.push(`Address: ${contact.address}`)
      if (bits.length) {
        const block = bits.join('\n')
        finalNote = finalNote ? `${block}\n${finalNote}` : block
      }
    }

    const { data, error } = await supabase.from('orders').insert({
      session_id: sessionId,
      table_id: tableId,
      items,
      note: finalNote,
      total,
      status: 'pending',
    }).select().single()
    setSending(false)
    if (!error && data) {
      const nextIds = [...myOrderIds, data.id]
      setMyOrderIds(nextIds)
      if (storageKey) localStorage.setItem(storageKey, JSON.stringify(nextIds))
      setCart({})
      setNote('')
      setCartOpen(false)
      setView('orders')
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
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {restaurant?.restaurant_name || restaurantId.replace(/-/g, ' ')}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.75 }}>{locationLabel(tableId)}</div>
        </div>
        {myOrderIds.length > 0 && (
          <button
            onClick={() => setView(v => (v === 'menu' ? 'orders' : 'menu'))}
            style={{
              background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 600
            }}>
            {view === 'menu' ? `🧾 My Orders (${myOrderIds.length})` : '📋 Menu'}
          </button>
        )}
      </header>

      {view === 'orders' && myOrders.length > 0 ? (
        <WaitingScreen orders={myOrders} onOrderMore={() => setView('menu')} />
      ) : (
        <>
          <PhotoCarousel photos={menuItems.map(i => i.photo_url)} />
          <NoteBar note={note} onNoteChange={setNote} />
          <MenuList items={menuItems} cart={cart} onAdd={addItem} onRemove={removeItem} />
          <CartBar cart={cart} onOpen={() => setCartOpen(true)} />
          {cartOpen && (
            <CartModal
              cart={cart}
              note={note}
              tableId={tableId}
              onAdd={addItem}
              onRemove={removeItem}
              onClose={() => setCartOpen(false)}
              onSend={sendOrder}
              sending={sending}
            />
          )}
        </>
      )}

      {!isTakeaway(tableId) && (
        <FloatingActions
          onWater={() => raiseAlert('water')}
          onWaiter={() => raiseAlert('waiter')}
        />
      )}
    </div>
  )
}
