import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from './src/supabaseClient'
import Menu from './src/pages/Menu'
import './src/styles/customer-portal.css'

export default function CustomerPortal() {
  const { restaurantId, secret, tableId } = useParams()

  const [restaurant, setRestaurant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cart, setCart] = useState([])
  const [showCart, setShowCart] = useState(false)

  // ========================================================
  // Load Restaurant Data
  // ========================================================
  useEffect(() => {
    async function loadRestaurant() {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('qr_secret', secret)
          .eq('is_active', true)
          .maybeSingle()

        if (error || !data) {
          setError('Restaurant nahi mila')
          setLoading(false)
          return
        }

        setRestaurant(data)
        if (data.theme) {
          document.documentElement.style.setProperty('--brand-primary', data.theme)
        }

        setLoading(false)
      } catch (err) {
        console.error('Load restaurant error:', err)
        setError('Koi error aaya')
        setLoading(false)
      }
    }

    loadRestaurant()
  }, [restaurantId, secret])

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--surface-0)',
        fontSize: 14,
        color: 'var(--text-secondary)'
      }}>
        Loading...
      </div>
    )
  }

  if (error || !restaurant) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--surface-0)',
        fontSize: 14,
        color: 'var(--clay)'
      }}>
        {error || 'Restaurant nahi mila'}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--surface-0)' }}>
      {/* ================================================
          HEADER - Sirf Restaurant Name + Cart Button
          ================================================
          IMPORTANT: PIN NAHI DIKHE GAH!
      ================================================ */}
      <div style={{
        background: 'var(--surface-1)',
        borderBottom: '1px solid var(--line)',
        padding: '12px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{
            width: 32,
            height: 32,
            background: 'var(--brand-primary)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--brand-primary-text)',
            fontWeight: 700,
            fontSize: 14
          }}>
            {restaurant.restaurant_name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{
              fontSize: 12,
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: 0.5
            }}>
              Table {tableId || '?'}
            </div>
            <div style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--ink)'
            }}>
              {restaurant.restaurant_name}
            </div>
          </div>
        </div>

        {/* ================================================
            Cart Button
        ================================================ */}
        <button
          onClick={() => setShowCart(!showCart)}
          style={{
            background: cart.length > 0 ? 'var(--brand-primary)' : 'var(--line)',
            color: cart.length > 0 ? 'var(--brand-primary-text)' : 'var(--text-secondary)',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span>🛒</span>
          <span>{cart.length}</span>
        </button>
      </div>

      {/* ================================================
          Main Content
      ================================================ */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex' }}>
        {/* ================================================
            Menu (Main Content)
        ================================================ */}
        <div style={{ flex: showCart ? 0.6 : 1, overflowY: 'auto' }}>
          <Menu
            restaurantId={restaurantId}
            tableId={tableId}
            cart={cart}
            setCart={setCart}
          />
        </div>

        {/* ================================================
            Cart Sidebar (optional)
        ================================================ */}
        {showCart && (
          <div style={{
            flex: 0.4,
            background: 'var(--surface-1)',
            borderLeft: '1px solid var(--line)',
            padding: 16,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              fontSize: 14,
              fontWeight: 700,
              marginBottom: 16,
              color: 'var(--ink)'
            }}>
              Your Cart ({cart.length})
            </div>

            {cart.length === 0 ? (
              <div style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                textAlign: 'center',
                padding: 20
              }}>
                Cart khali hai
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {cart.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: 'var(--surface-0)',
                      borderRadius: 6,
                      padding: 10,
                      fontSize: 12
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>
                      {item.name} x {item.qty}
                    </div>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      {item.price * item.qty} PKR
                    </div>
                  </div>
                ))}

                <div style={{
                  marginTop: 'auto',
                  borderTop: '1px solid var(--line)',
                  paddingTop: 12
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontWeight: 700,
                    marginBottom: 12
                  }}>
                    <span>Total:</span>
                    <span>
                      {cart.reduce((sum, item) => sum + item.price * item.qty, 0)} PKR
                    </span>
                  </div>

                  <button
                    style={{
                      width: '100%',
                      background: 'var(--brand-primary)',
                      color: 'var(--brand-primary-text)',
                      border: 'none',
                      borderRadius: 8,
                      padding: '10px 0',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Order Confirm Karo
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
