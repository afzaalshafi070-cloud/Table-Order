import { useMemo, useState } from 'react'

export default function MenuList({ items, deals = [], mood = null, cart, onAdd, onRemove }) {
  const [activeCategory, setActiveCategory] = useState('All')

  const categories = useMemo(() => {
    const cats = [...new Set((items || []).map(i => i.category))]
    if (deals.length > 0) return ['All', 'Deals', ...cats]
    return ['All', ...cats]
  }, [items, deals])

  const moodDeals = useMemo(() => {
    if (!mood) return deals
    const tagged = deals.filter(d =>
      String(d.mood_tags || '').toLowerCase().includes(mood)
    )
    // If mood has matching deals, show those first; still allow all via Deals tab
    return tagged.length > 0 ? tagged : deals
  }, [deals, mood])

  const showDeals = activeCategory === 'All' || activeCategory === 'Deals'
  const visibleItems = activeCategory === 'All' || activeCategory === 'Deals'
    ? (activeCategory === 'Deals' ? [] : items)
    : (items || []).filter(i => i.category === activeCategory)

  if ((!items || items.length === 0) && deals.length === 0) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: '#9a9284' }}>
        Menu abhi taiyaar ho raha hai — thodi der mein check karein.
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 140 }}>
      {/* Category pill filter */}
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 16px 14px',
        scrollbarWidth: 'none'
      }}>
        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            style={{
              flex: '0 0 auto', borderRadius: 999,
              padding: '8px 16px', fontSize: 13, fontWeight: 700,
              background: activeCategory === cat ? 'var(--brand-primary)' : '#fff',
              color: activeCategory === cat ? 'var(--brand-primary-text)' : 'var(--ink)',
              boxShadow: activeCategory === cat ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
              border: activeCategory === cat ? 'none' : '1px solid var(--line)',
              cursor: 'pointer',
            }}>
            {cat === 'Deals' ? '🔥 Deals' : cat}
          </button>
        ))}
      </div>

      {/* Deals section */}
      {showDeals && moodDeals.length > 0 && (
        <div style={{ padding: '0 16px 16px' }}>
          {activeCategory === 'All' && (
            <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 10 }}>
              {mood ? 'Aapke mood ki deals' : 'Special Deals'}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {moodDeals.map(deal => {
              const cartKey = `deal:${deal.id}`
              const qty = cart[cartKey]?.qty || 0
              return (
                <div key={deal.id} style={{
                  display: 'flex', gap: 12, background: '#fff',
                  border: qty > 0 ? '2px solid var(--brand-primary)' : '1px solid var(--line)',
                  borderRadius: 14, padding: 12, alignItems: 'center',
                }}>
                  <div style={{
                    width: 64, height: 64, borderRadius: 10, flexShrink: 0,
                    background: 'var(--paper-dim)', overflow: 'hidden',
                  }}>
                    {deal.photo_url
                      ? <img src={deal.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🔥</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{deal.name}</div>
                    <div style={{ fontSize: 12, color: '#7a7264', marginTop: 2, lineHeight: 1.35 }}>
                      {deal.description}
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 14 }}>
                        PKR {Number(deal.price).toFixed(0)}
                      </span>
                      {deal.original_price != null && Number(deal.original_price) > Number(deal.price) && (
                        <span style={{
                          fontFamily: 'var(--mono)', fontSize: 12, color: '#9a9284',
                          textDecoration: 'line-through',
                        }}>
                          {Number(deal.original_price).toFixed(0)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {qty > 0 && (
                      <button type="button" onClick={() => onRemove({ id: cartKey })}
                        style={qtyBtn}>−</button>
                    )}
                    {qty > 0 && <span style={{ fontWeight: 800, minWidth: 18, textAlign: 'center' }}>{qty}</span>}
                    <button
                      type="button"
                      onClick={() => onAdd({
                        id: cartKey,
                        name: deal.name,
                        price: Number(deal.price),
                        isDeal: true,
                      })}
                      style={{ ...qtyBtn, background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', border: 'none' }}
                    >+</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Photo-forward 2-column grid for regular items */}
      {visibleItems.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px'
        }}>
          {visibleItems.map((item, idx) => (
            <MenuCard
              key={item.id}
              item={item}
              qty={cart[item.id]?.qty || 0}
              onAdd={() => onAdd(item)}
              onRemove={() => onRemove(item)}
              delay={idx * 35}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MenuCard({ item, qty, onAdd, onRemove, delay }) {
  const available = item.is_available !== false

  return (
    <div className="fade-slide-up card-lift" style={{
      background: '#fff', borderRadius: 14, overflow: 'hidden',
      border: '1px solid var(--line)', opacity: available ? 1 : 0.55,
      animationDelay: `${delay}ms`,
      boxShadow: qty > 0 ? '0 0 0 2px var(--brand-primary)' : '0 1px 3px rgba(0,0,0,0.06)',
      transition: 'box-shadow 0.25s ease', display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--paper-dim)' }}>
        {item.photo_url ? (
          <img src={item.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c4bdb0', fontSize: 28 }}>🍽</div>
        )}
        {item.badge && (
          <span style={{
            position: 'absolute', top: 8, left: 8, background: 'var(--brand-primary)',
            color: 'var(--brand-primary-text)', fontSize: 10, fontWeight: 700,
            padding: '3px 8px', borderRadius: 999,
          }}>{item.badge}</span>
        )}
      </div>
      <div style={{ padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{item.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 13 }}>
            PKR {Number(item.price).toFixed(0)}
          </span>
          {available && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {qty > 0 && (
                <button type="button" onClick={onRemove} style={qtyBtn}>−</button>
              )}
              {qty > 0 && <span style={{ fontWeight: 800, fontSize: 13, minWidth: 16, textAlign: 'center' }}>{qty}</span>}
              <button type="button" onClick={onAdd} style={{
                ...qtyBtn, background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', border: 'none',
              }}>+</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const qtyBtn = {
  width: 28, height: 28, borderRadius: 8, border: '1px solid var(--line)',
  background: '#fff', fontWeight: 800, fontSize: 16, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
