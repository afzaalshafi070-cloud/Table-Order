import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { useRealtimeOrders } from '../hooks/useRealtimeOrders.js'
import { useMenuItems } from '../hooks/useMenuItems.js'
import { useDeals } from '../hooks/useDeals.js'
import MenuList from '../components/MenuList.jsx'
import PhotoCarousel from '../components/PhotoCarousel.jsx'
import NoteBar from '../components/NoteBar.jsx'
import CartBar from '../components/CartBar.jsx'
import CartModal from '../components/CartModal.jsx'
import FloatingActions from '../components/FloatingActions.jsx'
import WaitingScreen from '../components/WaitingScreen.jsx'
import TicTacToe from '../components/TicTacToe.jsx'
import BallJump from '../components/BallJump.jsx'
import JokeBox from '../components/JokeBox.jsx'
import MoodSelector from '../components/MoodSelector.jsx'
import NameMeaning from '../components/NameMeaning.jsx'
import ChefPopup from '../components/ChefPopup.jsx'
import NotFound from './NotFound.jsx'
import { applyTheme, applyColorMode, getSavedColorMode, applyBrandSurface } from '../utils/theme.js'
import { locationLabel, isTakeaway } from '../utils/locationLabel.js'
import { ensureAnonymousAuth } from '../utils/auth.js'

export default function CustomerPortal() {
  const { restaurantId, secret, tableId } = useParams()

  const [sessionState, setSessionState] = useState('loading') // loading | ready | invalid
  const [sessionId, setSessionId] = useState(null)
  const [restaurant, setRestaurant] = useState(null) // { restaurant_name, logo_url, theme }
  const [cart, setCart] = useState({})
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [myOrderIds, setMyOrderIds] = useState([])
  const [pinnedOrders, setPinnedOrders] = useState([]) // full rows for refresh before realtime
  const [view, setView] = useState('menu') // 'menu' | 'orders'
  const [showChefPopup, setShowChefPopup] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [justPlaced, setJustPlaced] = useState(false)
  const [areas, setAreas] = useState([])
  const [mood, setMood] = useState(null)
  const [colorMode, setColorMode] = useState(() => getSavedColorMode())
  const lastStatusRef = useRef({})

  // Resolve the room through a SECURITY DEFINER RPC. The QR secret is never
  // used as a normal table query, and staff PINs are never part of the URL.
  useEffect(() => {
    let cancelled = false
    async function resolveSession() {
      try {
        await ensureAnonymousAuth()
        const { data, error } = await supabase.rpc('customer_bootstrap', {
          p_restaurant_id: restaurantId,
          p_qr_secret: secret,
          p_table_id: tableId,
        })
        if (cancelled) return
        if (error || !data?.id) {
          setSessionState('invalid')
          return
        }

        setSessionId(data.id)
        let theme = data.theme || {}
        if (typeof theme === 'string') {
          try { theme = JSON.parse(theme) } catch { theme = {} }
        }
        const taxPercent = Number(data.tax_percent ?? theme.tax_percent) || 0
        const taxLabel = data.tax_label || theme.tax_label || 'Tax'
        const whatsapp = data.whatsapp || theme.whatsapp || null
        setRestaurant({ ...data, theme, tax_percent: taxPercent, tax_label: taxLabel, whatsapp })
        applyTheme(theme)
        applyBrandSurface(theme)
        applyColorMode(getSavedColorMode())

        const key = `tableorder:activeOrders:${data.id}:${tableId}`
        try {
          let saved = []
          try { saved = JSON.parse(localStorage.getItem(key) || '[]') } catch { saved = [] }
          const byId = {}

          if (!isTakeaway(tableId)) {
            const { data: openRows } = await supabase
              .from('orders')
              .select('*')
              .eq('session_id', data.id)
              .eq('table_id', tableId)
              .not('status', 'in', '(served,cancelled)')
              .order('created_at', { ascending: false })
              .limit(10)
            ;(openRows || []).forEach(o => { byId[o.id] = o })
          }

          if (Array.isArray(saved) && saved.length > 0) {
            const { data: savedRows } = await supabase.from('orders').select('*').in('id', saved)
            ;(savedRows || []).forEach(o => {
              if (o.status !== 'served' && o.status !== 'cancelled') byId[o.id] = o
            })
          }

          const activeList = Object.values(byId)
          const activeIds = activeList.map(o => o.id)
          localStorage.setItem(key, JSON.stringify(activeIds))
          if (activeIds.length > 0) {
            setMyOrderIds(activeIds)
            setPinnedOrders(activeList)
            setView('orders')
          } else {
            setMyOrderIds([])
            setPinnedOrders([])
            setView('menu')
          }
        } catch (e) {
          console.error('restore orders', e)
          setMyOrderIds([])
          setPinnedOrders([])
          setView('menu')
        }

        const { data: areaRows } = await supabase
          .from('delivery_areas')
          .select('id, name, charge')
          .eq('session_id', data.id)
          .order('name')
        if (!cancelled) {
          setAreas(areaRows || [])
          setSessionState('ready')
        }
      } catch (e) {
        console.error('customer bootstrap', e)
        if (!cancelled) setSessionState('invalid')
      }
    }
    if (restaurantId && secret && tableId) resolveSession()
    return () => { cancelled = true }
  }, [restaurantId, secret, tableId])

  const { orders } = useRealtimeOrders(sessionId, { includeAlerts: false })
  const { items: menuItems } = useMenuItems(sessionId)
  const { deals } = useDeals(sessionId, { activeOnly: true })

  // Required URL params: all hooks above stay in a stable order on every render.
  if (!restaurantId || !secret || !tableId) {
    return <NotFound message="This QR code is missing a restaurant, secret, or table number." />
  }

  const myOrders = useMemo(() => {
    const map = {}
    pinnedOrders.forEach(o => { if (myOrderIds.includes(o.id)) map[o.id] = o })
    orders.forEach(o => { if (myOrderIds.includes(o.id)) map[o.id] = o }) // realtime wins
    return Object.values(map).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }, [orders, myOrderIds, pinnedOrders])

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
    // Send only stable IDs + quantities. The database re-reads current prices,
    // names, availability, tax and delivery charge; the browser cannot forge totals.
    const items = Object.values(cart).map(({ id, qty, isDeal }) => {
      const raw = String(id)
      return raw.startsWith('deal:') || isDeal
        ? { id: raw.replace(/^deal:/, ''), qty, type: 'deal' }
        : { id: raw, qty, type: 'item' }
    })
    if (items.length === 0) return
    setSending(true)

    const fulfillment = contact.fulfillment || (isTakeaway(tableId) ? 'takeaway' : null)
    let finalNote = note || ''
    if (fulfillment === 'delivery') {
      const bits = ['DELIVERY', contact.areaName && `Area: ${contact.areaName}`, contact.customerName && `Name: ${contact.customerName}`, contact.phone && `Phone: ${contact.phone}`, contact.address && `Address: ${contact.address}`].filter(Boolean)
      finalNote = bits.join('\n') + (finalNote ? `\n${finalNote}` : '')
    } else if (fulfillment === 'takeaway') {
      const bits = ['TAKEAWAY']
      if (contact.customerName) bits.push(`Name: ${contact.customerName}`)
      if (contact.phone) bits.push(`Phone: ${contact.phone}`)
      finalNote = bits.join('\n') + (finalNote ? `\n${finalNote}` : '')
    }
    if (contact.paymentMethod === 'online') {
      finalNote = (finalNote ? finalNote + '\n' : '') + 'PAYMENT: Online / QR'
    } else if (contact.paymentMethod === 'cash') {
      finalNote = (finalNote ? finalNote + '\n' : '') + 'PAYMENT: Cash'
    }

    try {
      const { data, error } = await supabase.rpc('place_customer_order', {
        p_session_id: sessionId,
        p_table_id: tableId,
        p_items: items,
        p_note: finalNote,
        p_fulfillment: fulfillment,
        p_customer_name: contact.customerName || null,
        p_customer_phone: contact.phone || null,
        p_customer_address: contact.address || null,
        p_area_name: contact.areaName || null,
      })
      if (error) {
        console.error('Order insert failed:', error)
        const msg = error.message || ''
        alert(msg.includes('RATE_LIMIT') ? 'Thori der ruk kar dobara order karein.' : 'Order place nahi ho saka. Dobara try karein.')
        return
      }
      if (data) {
        const nextIds = [...new Set([...myOrderIds, data.id])]
        setMyOrderIds(nextIds)
        setPinnedOrders(prev => [...prev.filter(o => o.id !== data.id), data])
        try { localStorage.setItem(`tableorder:activeOrders:${sessionId}:${tableId}`, JSON.stringify(nextIds)) } catch {}
        setCart({})
        setNote('')
        setCartOpen(false)
        setJustPlaced(true)
        setView('orders')
      }
    } catch (err) {
      console.error('Order send error:', err)
      alert('Order place nahi ho saka. Network check karein.')
    } finally {
      setSending(false)
    }
  }

  const markDelivered = async (orderId) => {
    const { error } = await supabase.rpc('customer_mark_served', { p_order_id: orderId })
    if (error) console.warn('Complete order failed:', error)
  }

  const rateOrder = async (orderId, stars) => {
    const { error } = await supabase.rpc('customer_rate_order', { p_order_id: orderId, p_rating: stars })
    if (error) {
      console.warn('Rating failed:', error)
      return
    }
    const next = myOrderIds.filter(id => id !== orderId)
    setMyOrderIds(next)
    setPinnedOrders(prev => prev.filter(o => o.id !== orderId))
    try {
      localStorage.setItem(`tableorder:activeOrders:${sessionId}:${tableId}`, JSON.stringify(next))
    } catch { /* ignore */ }
    if (next.length === 0) setView('menu')
  }

  const clearCompletedOrder = (orderId) => {
    const next = myOrderIds.filter(id => id !== orderId)
    setMyOrderIds(next)
    setPinnedOrders(prev => prev.filter(o => o.id !== orderId))
    try {
      localStorage.setItem(`tableorder:activeOrders:${sessionId}:${tableId}`, JSON.stringify(next))
    } catch { /* ignore */ }
    if (next.length === 0) setView('menu')
  }

  const toggleColorMode = () => {
    const next = colorMode === 'dark' ? 'light' : 'dark'
    setColorMode(next)
    applyColorMode(next)
  }

  const waNumber = (() => {
    const raw = restaurant?.whatsapp || restaurant?.theme?.whatsapp
    if (!raw) return null
    let d = String(raw).trim().replace(/[^\d+]/g, '')
    if (d.startsWith('+')) d = d.slice(1)
    d = d.replace(/\D/g, '')
    if (d.startsWith('0') && d.length >= 10) d = '92' + d.slice(1)
    return d.length >= 11 ? d : null
  })()

  const raiseAlert = async (type) => {
    const { error } = await supabase.rpc('customer_raise_alert', {
      p_session_id: sessionId,
      p_table_id: tableId,
      p_type: type,
    })
    if (error) {
      const m = error.message || ''
      if (m.includes('RATE_LIMIT')) throw new Error('RATE_LIMIT')
      throw new Error(m || 'Request failed')
    }
  }

  return (
    <div className="screen brand-surface">
      <ChefPopup show={showChefPopup} onDone={() => setShowChefPopup(false)} />

      <header style={{
        padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--brand-ink)', color: '#fff',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {restaurant?.logo_url ? (
          <img src={restaurant.logo_url} alt="" style={{
            width: 40, height: 40, borderRadius: 11, objectFit: 'cover',
            boxShadow: '0 2px 8px rgba(0,0,0,.2)', background: '#fff', flex: '0 0 auto',
          }} />
        ) : (
          <div style={{
            width: 40, height: 40, borderRadius: 11, background: 'rgba(255,255,255,.12)',
            display: 'grid', placeItems: 'center', fontSize: 16, flex: '0 0 auto',
          }}>🍽️</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16,
            letterSpacing: '-0.02em', lineHeight: 1.2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {restaurant?.restaurant_name || restaurantId.replace(/-/g, ' ')}
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.8, marginTop: 2 }}>
            {locationLabel(tableId)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '0 0 auto' }}>
          {waNumber && (
            <a
              href={`https://wa.me/${waNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#25D366', color: '#fff', textDecoration: 'none',
                borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 700,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Chat
            </a>
          )}
          <button
            type="button"
            onClick={toggleColorMode}
            aria-label="Toggle light/dark"
            title={colorMode === 'dark' ? 'Light mode' : 'Dark mode'}
            style={{
              width: 34, height: 34, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.25)',
              background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 14, cursor: 'pointer',
            }}
          >{colorMode === 'dark' ? '☀️' : '🌙'}</button>
          {myOrderIds.length > 0 && (
            <button
              onClick={() => setView(v => (v === 'menu' ? 'orders' : 'menu'))}
              style={{
                background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 999, padding: '7px 10px', fontSize: 11, fontWeight: 600
              }}>
              {view === 'menu' ? `🧾 ${myOrderIds.length}` : '📋'}
            </button>
          )}
        </div>
      </header>

      {view === 'orders' && myOrders.length > 0 ? (
        <div style={{ padding: '16px 16px 80px' }}>
          {justPlaced && (
            <div className="success-pop" style={{ background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))', color: '#fff', borderRadius: 16, padding: 20, marginBottom: 14, textAlign: 'center', boxShadow: '0 12px 30px rgba(0,0,0,.12)' }}>
              <div style={{ fontSize: 38, lineHeight: 1, marginBottom: 8 }}>✓</div>
              <div style={{ fontSize: 19, fontWeight: 800 }}>Order received!</div>
              <div style={{ fontSize: 12, opacity: .9, marginTop: 5 }}>Aapka order counter/kitchen ko bhej diya gaya hai.</div>
              <button onClick={() => setJustPlaced(false)} style={{ marginTop: 12, background: 'rgba(255,255,255,.16)', color: '#fff', border: '1px solid rgba(255,255,255,.35)', borderRadius: 999, padding: '7px 14px', fontSize: 11, fontWeight: 700 }}>Continue</button>
            </div>
          )}
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
                    {isDelivery ? (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 12, marginBottom: 6 }}>Rider rating (phir history clear)</div>
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
                    ) : (
                      <button
                        onClick={() => clearCompletedOrder(order.id)}
                        style={{
                          marginTop: 10, width: '100%', background: 'var(--paper-dim)',
                          border: '1px solid var(--line)', borderRadius: 999, padding: '10px 0', fontWeight: 600
                        }}
                      >Done — back to menu</button>
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

          <div style={{ marginTop: 16, fontSize: 13, color: '#7a7264', textAlign: 'center' }}>
            Kitchen ka wait karte hue thoda time pass karein 👇
          </div>
          <NameMeaning menuItems={menuItems} />
          <TicTacToe />
          <BallJump />
        </div>
      ) : (
        <>
          <PhotoCarousel photos={menuItems.map(i => i.photo_url)} />
          <div style={{
            margin: '10px 14px 6px',
            background: '#fff',
            border: '1px solid var(--line)',
            borderRadius: 14,
            padding: '10px 12px',
          }}>
            <MoodSelector value={mood} onChange={setMood} />
            <NoteBar note={note} onNoteChange={setNote} />
          </div>
          <MenuList
            items={menuItems}
            deals={deals}
            mood={mood}
            cart={cart}
            onAdd={addItem}
            onRemove={removeItem}
          />
          <NameMeaning menuItems={menuItems} />
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
              taxPercent={Number(restaurant?.tax_percent) || 0}
              taxLabel={restaurant?.tax_label || 'Tax'}
              paymentOnline={!!(restaurant?.theme?.paymentOnline)}
              paymentCash={restaurant?.theme?.paymentCash !== false}
              paymentQrUrl={restaurant?.theme?.paymentQrUrl || ''}
              paymentMethodName={restaurant?.theme?.paymentMethodName || 'Online payment'}
              paymentAccountTitle={restaurant?.theme?.paymentAccountTitle || ''}
              paymentInstructions={restaurant?.theme?.paymentInstructions || ''}
            />
          )}
        </>
      )}

      <FloatingActions
        onWater={isTakeaway(tableId) ? null : () => raiseAlert('water')}
        onWaiter={isTakeaway(tableId) ? null : () => raiseAlert('waiter')}
        onBill={isTakeaway(tableId) ? null : () => raiseAlert('bill')}
        showServiceButtons={!isTakeaway(tableId)}
      />
    </div>
  )
}
