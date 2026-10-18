import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const EASE = [0.16, 1, 0.3, 1]
const SPRING_PRESS = { type: 'spring', stiffness: 600, damping: 28 }
const RING = '0 0 0 2px var(--brand-primary)'
const SOFT = '0 1px 3px rgba(0,0,0,0.06)'
const SOFT_HOVER = '0 14px 26px -10px rgba(32,29,26,0.22)'
const RING_SHADOW = `${RING}, ${SOFT}`
const RING_HOVER = `${RING}, ${SOFT_HOVER}`

// Card: staggered entrance, lift on hover. Image zoom is a child variant that
// inherits the parent's 'hover' state.
const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: ({ index, ring }) => ({
    opacity: 1,
    y: 0,
    boxShadow: ring ? RING_SHADOW : SOFT,
    transition: { delay: Math.min(index, 11) * 0.05, duration: 0.35, ease: EASE },
  }),
  hover: ({ ring }) => ({
    y: -4,
    boxShadow: ring ? RING_HOVER : SOFT_HOVER,
    transition: { type: 'spring', stiffness: 380, damping: 30 },
  }),
}
const imageVariants = {
  hover: { scale: 1.05, transition: { duration: 0.45, ease: EASE } },
}

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
      <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Menu abhi taiyaar ho raha hai — thodi der mein check karein.
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 140 }}>
      {/* Category pills — the active highlight slides between them (shared layoutId) */}
      <div role="group" aria-label="Menu categories" style={{
        display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 16px 14px',
        scrollbarWidth: 'none',
      }}>
        {categories.map(cat => {
          const active = activeCategory === cat
          return (
            <button
              key={cat}
              type="button"
              aria-pressed={active}
              onClick={() => setActiveCategory(cat)}
              style={{
                position: 'relative', flex: '0 0 auto', borderRadius: 999, minHeight: 36,
                padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                color: active ? 'var(--brand-primary-text)' : 'var(--ink)',
                background: active ? 'transparent' : 'var(--surface)',
                border: active ? 'none' : '1px solid var(--line)',
                boxShadow: active ? 'none' : '0 1px 3px rgba(0,0,0,0.08)',
              }}
            >
              {active && (
                <motion.span
                  layoutId="menu-category-pill"
                  aria-hidden="true"
                  transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                  style={{
                    position: 'absolute', inset: 0, borderRadius: 999,
                    background: 'var(--brand-primary)',
                  }}
                />
              )}
              <span style={{ position: 'relative' }}>{cat === 'Deals' ? '🔥 Deals' : cat}</span>
            </button>
          )
        })}
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
            {moodDeals.map((deal, i) => {
              const cartKey = `deal:${deal.id}`
              const qty = cart[cartKey]?.qty || 0
              return (
                <motion.div
                  key={deal.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.05, duration: 0.3, ease: EASE }}
                  style={{
                    display: 'flex', gap: 12, background: 'var(--surface)',
                    border: qty > 0 ? '2px solid var(--brand-primary)' : '1px solid var(--line)',
                    borderRadius: 14, padding: 12, alignItems: 'center',
                  }}
                >
                  <div style={{
                    width: 64, height: 64, borderRadius: 10, flexShrink: 0,
                    background: 'var(--paper-dim)', overflow: 'hidden',
                  }}>
                    {deal.photo_url
                      ? <img src={deal.photo_url} alt={deal.name || ''} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🔥</div>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--ink)' }}>{deal.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.35 }}>
                      {deal.description}
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 14 }}>
                        PKR {Number(deal.price).toFixed(0)}
                      </span>
                      {deal.original_price != null && Number(deal.original_price) > Number(deal.price) && (
                        <span style={{
                          fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)',
                          textDecoration: 'line-through',
                        }}>
                          {Number(deal.original_price).toFixed(0)}
                        </span>
                      )}
                    </div>
                  </div>
                  <Stepper
                    qty={qty}
                    label={deal.name}
                    onAdd={() => onAdd({
                      id: cartKey,
                      name: deal.name,
                      price: Number(deal.price),
                      isDeal: true,
                    })}
                    onRemove={() => onRemove({ id: cartKey })}
                  />
                </motion.div>
              )
            })}
          </div>
        </div>
      )}

      {/* Photo-forward 2-column grid for regular items */}
      {visibleItems.length > 0 && (
        <div className="menu-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 16px' }}>
          {visibleItems.map((item, idx) => (
            <MenuCard
              key={item.id}
              item={item}
              index={idx}
              qty={cart[item.id]?.qty || 0}
              onAdd={() => onAdd(item)}
              onRemove={() => onRemove(item)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MenuCard({ item, qty, index, onAdd, onRemove }) {
  const soldOut = item.stock_quantity != null && Number(item.stock_quantity) <= 0
  const available = item.is_available !== false && !soldOut
  const ring = qty > 0

  return (
    <motion.div
      variants={cardVariants}
      custom={{ index, ring }}
      initial="hidden"
      animate="show"
      whileHover={available ? 'hover' : undefined}
      style={{
        background: 'var(--surface)', borderRadius: 14, overflow: 'hidden',
        border: '1px solid var(--border, var(--line))',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{
        display: 'flex', flexDirection: 'column', flex: 1,
        opacity: available ? 1 : 0.55,
      }}>
        <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--paper-dim)', overflow: 'hidden' }}>
          {item.photo_url ? (
            <motion.img
              variants={imageVariants}
              src={item.photo_url}
              alt={item.name || ''}
              loading="lazy"
              decoding="async"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 28 }}>🍽</div>
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
          <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, color: 'var(--ink)' }}>{item.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginTop: 'auto' }}>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>
              PKR {Number(item.price).toFixed(0)}
            </span>
            {available && (
              <Stepper qty={qty} label={item.name} onAdd={onAdd} onRemove={onRemove} />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/**
 * Stepper — − qty + control. The + button flashes a checkmark on add,
 * and the quantity pops with a spring each time it changes.
 */
function Stepper({ qty, label, onAdd, onRemove }) {
  const [justAdded, setJustAdded] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const handleAdd = () => {
    onAdd()
    setJustAdded(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setJustAdded(false), 650)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
      {qty > 0 && (
        <motion.button
          type="button"
          aria-label={`Remove one ${label || 'item'}`}
          whileTap={{ scale: 0.85 }}
          transition={SPRING_PRESS}
          onClick={onRemove}
          style={qtyBtn}
        >−</motion.button>
      )}
      {qty > 0 && (
        <motion.span
          key={qty}
          initial={{ scale: 0.6, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22 }}
          aria-live="polite"
          style={{ fontWeight: 800, fontSize: 13, minWidth: 16, textAlign: 'center' }}
        >{qty}</motion.span>
      )}
      <motion.button
        type="button"
        aria-label={`Add one ${label || 'item'}`}
        whileTap={{ scale: 0.85 }}
        transition={SPRING_PRESS}
        onClick={handleAdd}
        style={{ ...qtyBtn, background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', border: 'none' }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {justAdded ? (
            <motion.svg
              key="check"
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              initial={{ scale: 0, rotate: -40 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 18 }}
            >
              <path d="M5 13l4 4L19 7" />
            </motion.svg>
          ) : (
            <motion.span
              key="plus"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              aria-hidden="true"
            >+</motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
}

const qtyBtn = {
  width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border, var(--line))',
  background: 'var(--surface)', fontWeight: 800, fontSize: 16, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink)',
}
