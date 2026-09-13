import { useMemo, useState } from 'react'

export default function MenuList({ items, cart, onAdd, onRemove }) {
  const [activeCategory, setActiveCategory] = useState('All')

  const categories = useMemo(
    () => ['All', ...new Set((items || []).map(i => i.category))],
    [items]
  )

  const visible = activeCategory === 'All'
    ? items
    : (items || []).filter(i => i.category === activeCategory)

  if (!items || items.length === 0) {
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
            onClick={() => setActiveCategory(cat)}
            style={{
              flex: '0 0 auto', border: 'none', borderRadius: 999,
              padding: '8px 16px', fontSize: 13, fontWeight: 700,
              background: activeCategory === cat ? 'var(--brand-primary)' : '#fff',
              color: activeCategory === cat ? 'var(--brand-primary-text)' : 'var(--ink)',
              boxShadow: activeCategory === cat ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
              border: activeCategory === cat ? 'none' : '1px solid var(--line)'
            }}>
            {cat}
          </button>
        ))}
      </div>

      {/* Photo-forward 2-column grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px'
      }}>
        {visible.map((item, idx) => (
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
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 30
          }}>🍽️</div>
        )}
        {item.badge && (
          <span style={{
            position: 'absolute', top: 8, left: 8,
            background: 'var(--clay)', color: '#fff', fontSize: 10, fontWeight: 700,
            padding: '4px 8px', borderRadius: 6, letterSpacing: '0.02em'
          }}>{item.badge}</span>
        )}
        {!available && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <span style={{
              background: '#fff', color: 'var(--clay)', fontSize: 11, fontWeight: 700,
              padding: '4px 10px', borderRadius: 6
            }}>Sold out</span>
          </div>
        )}
      </div>

      <div style={{ padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{item.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: 'var(--brand-primary)' }}>
            PKR {item.price}
          </span>
          {available && (qty === 0 ? (
            <PressToGreenButton onAdd={onAdd} label={`Add ${item.name}`}>+</PressToGreenButton>
          ) : (
            <div key={qty} className="pop-in" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button onClick={onRemove} aria-label={`Remove one ${item.name}`}
                style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--line)', background: '#fff', fontSize: 14 }}>−</button>
              <span style={{ fontFamily: 'var(--mono)', minWidth: 14, textAlign: 'center', fontSize: 13 }}>{qty}</span>
              <PressToGreenButton onAdd={onAdd} label={`Add one more ${item.name}`}>+</PressToGreenButton>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Add button that turns green (the platform's universal "go" color) for as
 * long as the customer's thumb is actually pressing it, then eases back to
 * the restaurant's own brand color the instant they lift off.
 */
function PressToGreenButton({ onAdd, label, children }) {
  const [pressed, setPressed] = useState(false)
  const release = () => setPressed(false)

  return (
    <button
      onClick={onAdd}
      onPointerDown={() => setPressed(true)}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      aria-label={label}
      style={{
        width: 26, height: 26, borderRadius: '50%', border: 'none',
        background: pressed ? 'var(--sage)' : 'var(--brand-primary)',
        color: pressed ? '#fff' : 'var(--brand-primary-text)',
        fontSize: 15, fontWeight: 700, lineHeight: 1,
        transition: 'background 0.15s ease, color 0.15s ease'
      }}>
      {children}
    </button>
  )
}
