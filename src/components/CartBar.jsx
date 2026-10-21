import { motion, AnimatePresence } from 'framer-motion'
import { useT } from '../i18n/useT.js'

/**
 * CartBar — floating "View Cart" bar. Springs up from the bottom when the
 * cart gets its first item and drops away when it empties.
 */
export default function CartBar({ cart, onOpen }) {
  const { t } = useT()
  const items = Object.values(cart)
  const count = items.reduce((s, i) => s + i.qty, 0)
  const total = items.reduce((s, i) => s + i.qty * i.price, 0)

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          key="cart-bar"
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          style={{
            position: 'fixed', left: 16, right: 16, zIndex: 20,
            bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
            background: 'var(--ink)', color: 'var(--paper)', borderRadius: 999,
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px 8px 18px',
          }}
        >
          <motion.span
            key={count}
            initial={{ scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--brand-primary)', color: 'var(--brand-primary-text)',
              fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, flex: '0 0 auto',
            }}
          >{count}</motion.span>
          <div style={{ flex: 1, fontSize: 13 }}>
            <div style={{ fontFamily: 'var(--mono)' }}>PKR {total}</div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>{t('cart_tap')}</div>
          </div>
          <button
            type="button"
            onClick={onOpen}
            style={{
              background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', border: 'none',
              borderRadius: 999, padding: '12px 20px', minHeight: 44, fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {t('cart_view')}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
