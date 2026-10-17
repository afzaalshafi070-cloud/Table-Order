import { motion } from 'framer-motion'

const EASE = [0.16, 1, 0.3, 1]
// Ten dots radiating outward once, behind the checkmark.
const DOTS = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2)

/**
 * OrderSuccess — shown after an order is placed.
 * Spring-scaled badge, animated checkmark stroke, one-shot particle burst.
 * Animations are skipped automatically for reduced-motion users via MotionConfig.
 */
export default function OrderSuccess({ onDismiss }) {
  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      style={{
        position: 'relative', overflow: 'hidden', textAlign: 'center',
        background: 'linear-gradient(135deg, var(--brand-primary), var(--brand-accent))',
        color: '#fff', borderRadius: 16, padding: 20, marginBottom: 14,
        boxShadow: '0 12px 30px rgba(0,0,0,.12)',
      }}
    >
      <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto' }}>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 420, damping: 16, delay: 0.1 }}
          style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(255,255,255,0.22)', display: 'grid', placeItems: 'center',
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff"
            strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <motion.path
              d="M5 13l4 4L19 7"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, delay: 0.3, ease: 'easeOut' }}
            />
          </svg>
        </motion.div>
        {DOTS.map((angle, i) => (
          <motion.span
            key={i}
            aria-hidden="true"
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{ x: Math.cos(angle) * 48, y: Math.sin(angle) * 48, opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.7, delay: 0.35, ease: 'easeOut' }}
            style={{
              position: 'absolute', left: '50%', top: '50%',
              width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5, borderRadius: '50%',
              background: i % 2 ? '#fff' : 'rgba(255,255,255,0.7)',
            }}
          />
        ))}
      </div>

      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 12 }}>Order placed</div>
      <div style={{ fontSize: 13, opacity: 0.95, marginTop: 6 }}>Kitchen ne receive kar liya</div>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          marginTop: 12, minHeight: 44, border: 'none', cursor: 'pointer',
          background: 'rgba(255,255,255,.2)', color: '#fff',
          borderRadius: 999, padding: '10px 20px', fontWeight: 700,
        }}
      >
        OK
      </button>
    </motion.div>
  )
}
