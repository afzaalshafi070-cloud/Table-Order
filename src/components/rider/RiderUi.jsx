// Phase 6 — shared rider + branded-delivery UI pieces.
// Motion: Framer Motion (spring for toggles, stagger for lists, slide for sheets).
// Every animated piece respects prefers-reduced-motion via useReducedMotion().
import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import '../../styles/rider.css'

export const EASE_OUT = [0.16, 1, 0.3, 1]
export const SPRING = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 }

/* ---------- Ripple button (tap feedback, pointer only) ---------- */
export function RippleButton({ variant = 'primary', className = '', onClick, disabled, children, type = 'button', ...rest }) {
  const [ripples, setRipples] = useState([])
  const reduce = useReducedMotion()

  const spawn = (e) => {
    if (reduce || disabled) return
    const rect = e.currentTarget.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height) * 2
    const id = `${Date.now()}-${Math.random()}`
    setRipples(list => [...list, { id, size, x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2 }])
    setTimeout(() => setRipples(list => list.filter(r => r.id !== id)), 650)
  }

  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      onPointerDown={spawn}
      onClick={onClick}
      className={`rdr-btn rdr-btn--${variant} ${className}`.trim()}
    >
      {ripples.map(r => (
        <span key={r.id} className="rdr-ripple" aria-hidden="true"
          style={{ width: r.size, height: r.size, left: r.x, top: r.y }} />
      ))}
      <span style={{ position: 'relative' }}>{children}</span>
    </button>
  )
}

/* ---------- Duty switch (spring knob) ---------- */
export function DutySwitch({ on, disabled, onToggle, label, meta }) {
  const reduce = useReducedMotion()
  return (
    <div className="rdr-duty">
      <div style={{ minWidth: 0 }}>
        <div className="rdr-duty__label" id="rdr-duty-label">{label}</div>
        <div className="rdr-duty__meta">{meta}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="rdr-duty-label"
        disabled={disabled}
        onClick={() => onToggle(!on)}
        className="rdr-switch"
      >
        <motion.span
          className="rdr-switch__knob"
          initial={false}
          animate={{ x: on ? 28 : 0 }}
          transition={reduce ? { duration: 0 } : SPRING}
        />
      </button>
    </div>
  )
}

/* ---------- Status mapping + badge ---------- */
const STATUS = {
  ASSIGNED: { label: 'New', tone: 'new' },
  ACCEPTED: { label: 'Accepted', tone: 'accepted' },
  PICKING_UP: { label: 'Picking up', tone: 'onway' },
  OUT_FOR_DELIVERY: { label: 'On the way', tone: 'onway' },
  DELIVERED: { label: 'Delivered', tone: 'done' },
}

export function statusInfo(assignmentStatus) {
  const key = assignmentStatus || 'ASSIGNED'
  return STATUS[key] || { label: key.replace(/_/g, ' ').toLowerCase(), tone: 'new' }
}

export function StatusBadge({ status }) {
  const info = statusInfo(status)
  return (
    <span className={`rdr-status rdr-status--${info.tone}`}>
      {info.label}
    </span>
  )
}

/* ---------- Items summary (tolerant of shape) ---------- */
export function itemsSummary(items) {
  let list = items
  if (typeof list === 'string') { try { list = JSON.parse(list) } catch { list = [] } }
  if (!Array.isArray(list)) return []
  return list.map(it => ({
    name: it?.name || it?.item_name || it?.title || 'Item',
    qty: Number(it?.qty ?? it?.quantity ?? 1) || 1,
  }))
}

/* ---------- Delivery card ---------- */
const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT } },
}
export const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
}

/* ---------- Status step buttons: Picking up -> On the way ---------- */
export function StatusButtons({ order, busy, onStatus }) {
  const st = order.assignment_status
  if (st !== 'ACCEPTED' && st !== 'PICKING_UP') return null
  const stop = (e) => e.stopPropagation()
  return (
    <div className="rdr-stack" role="group" aria-label="Update delivery status" onClick={stop} onKeyDown={stop}>
      {st === 'ACCEPTED' && (
        <RippleButton variant="ghost" disabled={busy} onClick={() => onStatus(order.id, 'PICKING_UP')}>
          Picking up
        </RippleButton>
      )}
      <RippleButton variant="ghost" disabled={busy} onClick={() => onStatus(order.id, 'OUT_FOR_DELIVERY')}>
        On the way
      </RippleButton>
    </div>
  )
}

export function DeliveryCard({ order, mapsUrl, waNumber, busy, onOpen, onAccept, onDelivered, onStatus, reduceMotion }) {
  const items = itemsSummary(order.items)
  const status = order.assignment_status || 'ASSIGNED'
  const stop = (e) => e.stopPropagation()

  return (
    <motion.article
      variants={reduceMotion ? undefined : cardVariants}
      className="rdr-card"
      aria-label={`Delivery for ${order.customer_name || 'customer'}, status ${statusInfo(status).label}`}
    >
      <div className="rdr-card__top">
        <div className="rdr-card__name">{order.customer_name || 'Customer'}</div>
        <StatusBadge status={status} />
      </div>

      <div className="rdr-card__addr">{order.customer_address || 'Address unavailable'}</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
        {order.area_name || 'Area'} · {order.branch_name || 'Branch'}
        {order.customer_phone ? ` · ${order.customer_phone}` : ''}
      </div>

      {items.length > 0 && (
        <ul className="rdr-items" aria-label="Order items">
          {items.slice(0, 4).map((it, i) => (
            <li key={`${it.name}-${i}`}><span>{it.qty}× {it.name}</span></li>
          ))}
          {items.length > 4 && <li style={{ color: 'var(--color-text-muted)' }}>+{items.length - 4} more · details</li>}
        </ul>
      )}

      <div className="rdr-card__foot">
        <span className="rdr-money">PKR {Number(order.total || 0).toFixed(0)}</span>
        <button type="button" className="rdr-btn rdr-btn--ghost rdr-btn--icon" onClick={() => onOpen(order)}
          aria-label={`View details for ${order.customer_name || 'customer'}`}>
          Details ›
        </button>
      </div>

      <div className="rdr-actions" onClick={stop} onKeyDown={stop}>
        {order.customer_phone && (
          <a href={`tel:${order.customer_phone}`} className="rdr-action rdr-action--call" aria-label="Call customer">
            <span className="rdr-action__icon" aria-hidden="true">📞</span>Call
          </a>
        )}
        <a href={mapsUrl} target="_blank" rel="noreferrer" className="rdr-action rdr-action--map" aria-label="Open map directions">
          <span className="rdr-action__icon" aria-hidden="true">🗺️</span>Map
        </a>
        {waNumber && (
          <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" className="rdr-action rdr-action--wa" aria-label="WhatsApp customer">
            <span className="rdr-action__icon" aria-hidden="true">💬</span>WhatsApp
          </a>
        )}
      </div>

      {status === 'ASSIGNED' && (
        <div onClick={stop} onKeyDown={stop}>
          <RippleButton variant="primary" disabled={busy} onClick={() => onAccept(order.id)}>
            Accept delivery
          </RippleButton>
        </div>
      )}
      <StatusButtons order={order} busy={busy} onStatus={onStatus} />
      {['ACCEPTED', 'PICKING_UP', 'OUT_FOR_DELIVERY'].includes(status) && (
        <div onClick={stop} onKeyDown={stop}>
          <RippleButton variant="success" disabled={busy} onClick={() => onDelivered(order.id)}>
            ✓ Mark delivered
          </RippleButton>
        </div>
      )}
    </motion.article>
  )
}

/* ---------- Slide-in sheet (right for details, bottom for forms) ---------- */
export function Sheet({ open, onClose, title, children, variant = 'right' }) {
  const reduce = useReducedMotion()
  const fromX = variant === 'right' ? '100%' : 0
  const fromY = variant === 'bottom' ? '100%' : 0
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet-layer"
          className="rdr-layer"
          initial={{ opacity: 1 }}
          exit={{ opacity: 1 }}
        >
          <motion.div
            className="rdr-scrim"
            onClick={onClose}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`rdr-sheet ${variant === 'bottom' ? 'rdr-sheet--bottom' : ''}`}
            initial={{ x: fromX, y: fromY }}
            animate={{ x: 0, y: 0 }}
            exit={{ x: fromX, y: fromY }}
            transition={reduce ? { duration: 0 } : { duration: 0.3, ease: EASE_OUT }}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
          >
            <div className="rdr-sheet__head">
              <h2 className="rdr-sheet__title">{title}</h2>
              <button type="button" className="rdr-close" onClick={onClose} aria-label="Close" autoFocus>×</button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- Delivered success: checkmark draw + subtle confetti ---------- */
const CONFETTI_COLORS = ['var(--color-primary)', 'var(--color-success)', 'var(--color-info)', 'var(--color-warning)']

export function SuccessBurst({ show, title = 'Delivery complete', onDone }) {
  const reduce = useReducedMotion()
  const pieces = Array.from({ length: 22 }, (_, i) => {
    const angle = (i / 22) * Math.PI * 2
    const dist = 90 + ((i * 37) % 60)
    return {
      i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist - 30,
      rot: (i * 53) % 360,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + (i % 3) * 2,
    }
  })

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="success"
          className="rdr-success"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onDone}
        >
          <motion.div
            className="rdr-success__card"
            initial={reduce ? false : { scale: 0.92, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            transition={reduce ? { duration: 0 } : SPRING}
          >
            {!reduce && pieces.map(p => (
              <motion.span
                key={p.i}
                aria-hidden="true"
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rot }}
                transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.25 }}
                style={{
                  position: 'absolute', left: '50%', top: 58,
                  width: p.size, height: p.size * 0.45, borderRadius: 2,
                  background: p.color,
                }}
              />
            ))}
            <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true" style={{ display: 'block', margin: '0 auto' }}>
              <motion.circle
                cx="36" cy="36" r="32" fill="none" strokeWidth="4"
                stroke="var(--color-success)"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.45, ease: EASE_OUT }}
              />
              <motion.path
                d="M22 37 L32 47 L50 27"
                fill="none" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
                stroke="var(--color-success)"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.35 }}
              />
            </svg>
            <div className="rdr-success__title">{title}</div>
            <div className="rdr-hint">Tap anywhere to continue</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ---------- Skeleton list (loading) ---------- */
export function RiderSkeleton() {
  return (
    <div className="rdr-skel" aria-busy="true" aria-label="Loading deliveries">
      {[0, 1, 2].map(i => (
        <div key={i} className="rdr-card" style={{ cursor: 'default' }}>
          <div className="ui-skeleton" style={{ height: 18, width: '55%' }} />
          <div className="ui-skeleton" style={{ height: 14, width: '90%' }} />
          <div className="ui-skeleton" style={{ height: 14, width: '70%' }} />
          <div className="ui-skeleton" style={{ height: 44, width: '100%' }} />
        </div>
      ))}
    </div>
  )
}
