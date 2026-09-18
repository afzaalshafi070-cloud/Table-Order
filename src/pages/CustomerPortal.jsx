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
  const [areas, setAreas] = useState([])
  const lastStatusRef = useRef({})

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

        // Always fresh menu on scan — do not restore old orders
        try {
          localStorage.removeItem(`tableorder:myOrders:${data.id}:${tableId}`)
        } catch { /* ignore */ }
        setMyOrderIds([])
        setView('menu')

        setSessionState('ready')

        const { data: areaRows } = await supabase
          .from('delivery_areas')
          .select('id, name')
          .eq('session_id', data.id)
          .order('name')
        if (!cancelled) setAreas(areaRows || [])
      }
    }
    resolveSession()
    return () => { cancelled = true }
  }, [restaurantId, secret, tableId])

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

    const fulfillment = contact.fulfillment || (isTakeaway(tableId) ? 'takeaway' : null)
    let finalNote = note || ''
    if (fulfillment === 'delivery') {
      const bits = [
        'DELIVERY',
        contact.areaName && `Area: ${contact.areaName}`,
        contact.customerName && `Name: ${contact.customerName}`,
        contact.phone && `Phone: ${contact.phone}`,
        contact.address && `Address: ${contact.address}`,
      ].filter(Boolean)
      finalNote = bits.join('\n') + (finalNote ? `\n${finalNote}` : '')
    } else if (fulfillment === 'takeaway') {
      const bits = ['TAKEAWAY']
      if (contact.customerName) bits.push(`Name: ${contact.customerName}`)
      if (contact.phone) bits.push(`Phone: ${contact.phone}`)
      finalNote = bits.join('\n') + (finalNote ? `\n${finalNote}` : '')
    }

    const row = {
      session_id: sessionId,
      table_id: tableId,
      items,
      note: finalNote,
      total,
      status: 'pending',
    }
    if (fulfillment) {
      row.fulfillment = fulfillment
      row.customer_name = contact.customerName || null
      row.customer_phone = contact.phone || null
      row.customer_address = contact.address || null
      row.area_name = contact.areaName || null
    }

    const { data, error } = await supabase.from('orders').insert(row).select().single()
    setSending(false)
    if (!error && data) {
      setMyOrderIds([data.id])  // this visit only — no localStorage
      setCart({})
      setNote('')
      setCartOpen(false)
      setView('orders')
    }
  }

  const markDelivered = async (orderId) => {
    await supabase.from('orders').update({ status: 'served' }).eq('id', orderId)
  }

  const rateOrder = async (orderId, stars) => {
    await supabase.from('orders').update({ rating: stars }).eq('id', orderId)
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
        <div style={{ padding: '16px 16px 80px' }}>
          {myOrders.map(order => {
            const isDelivery = order.fulfillment === 'delivery'
            const done = order.status === 'served'
            const hasGps = order.rider_lat != null && order.rider_lng != null
            const mapSrc = hasGps
              ? `https://maps.google.com/maps?q=${order.rider_lat},${order.rider_lng}&z=15&output=embed`
              : null
            return (
              <div key={order.id} style={{
                background: '#fff', border: '1px solid var(--line)', borderRadius: 12,
                padding: 14, marginBottom: 12
              }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {isDelivery ? 'DELIVERY' : order.fulfillment === 'takeaway' ? 'TAKEAWAY' : locationLabel(order.table_id)}
                  {' · '}{order.status}
                </div>
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  {(order.items || []).map((it, i) => (
                    <div key={i}>{it.qty} × {it.name}</div>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--mono)', marginTop: 6 }}>PKR {Number(order.total).toFixed(0)}</div>

                {isDelivery && !done && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, color: '#7a7264', marginBottom: 6 }}>
                      {hasGps ? 'Rider live location' : 'Rider location — jab rider page open karega yahan aayegi'}
                    </div>
                    {mapSrc && (
                      <iframe
                        title="rider-map"
                        src={mapSrc}
                        style={{ width: '100%', height: 180, border: 0, borderRadius: 10 }}
                        loading="lazy"
                      />
                    )}
                    {hasGps && (
                      <a
                        href={`https://www.google.com/maps?q=${order.rider_lat},${order.rider_lng}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ display: 'block', marginTop: 8, fontSize: 13, color: 'var(--sky)', fontWeight: 600 }}
                      >Open in Maps</a>
                    )}
                    <button
                      onClick={() => markDelivered(order.id)}
                      style={{
                        marginTop: 12, width: '100%', background: 'var(--sage)', color: '#fff',
                        border: 'none', borderRadius: 999, padding: '12px 0', fontWeight: 700
                      }}
                    >Order received — Complete</button>
                  </div>
                )}

                {done && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, color: 'var(--sage)', fontWeight: 700 }}>Completed ✓</div>
                    {isDelivery && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, marginBottom: 6 }}>Rider rating</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {[1, 2, 3, 4, 5].map(s => (
                            <button
                              key={s}
                              onClick={() => rateOrder(order.id, s)}
                              style={{
                                width: 40, height: 40, borderRadius: 8,
                                border: order.rating === s ? '2px solid var(--mustard)' : '1px solid var(--line)',
                                background: order.rating === s ? '#fef3c7' : '#fff',
                                fontSize: 18
                              }}
                            >{s}★</button>
                          ))}
                        </div>
                        {order.rating && (
                          <div style={{ marginTop: 6, fontSize: 12, color: '#7a7264' }}>Thanks — {order.rating}/5</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          <button
            onClick={() => setView('menu')}
            style={{
              width: '100%', marginTop: 8, background: 'var(--brand-primary)',
              color: 'var(--brand-primary-text)', border: 'none', borderRadius: 999,
              padding: '12px 0', fontWeight: 700
            }}
          >+ Order more from menu</button>
        </div>
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
              areas={areas}
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
