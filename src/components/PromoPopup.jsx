import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../supabaseClient.js'

// Shows the active promo once per promo version (remembered per browser).
// Storage is wrapped in try/catch: private mode or blocked storage must not break the page.
function promoKey(promo) {
  return `tableorder:promoSeen:${promo.updated_at || ''}:${promo.text || ''}`.slice(0, 180)
}

export default function PromoPopup({ sessionId }) {
  const [promo, setPromo] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!sessionId) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('customer_active_promo', { p_session_id: sessionId })
        if (cancelled || error || !data?.text && !data?.image_url) return
        setPromo(data)
        let seen = false
        try { seen = localStorage.getItem(promoKey(data)) === '1' } catch {}
        if (!seen) setOpen(true)
      } catch {}
    })()
    return () => { cancelled = true }
  }, [sessionId])

  const close = () => {
    setOpen(false)
    if (promo) {
      try { localStorage.setItem(promoKey(promo), '1') } catch {}
    }
  }

  return (
    <AnimatePresence>
      {open && promo && (
        <motion.div
          key="promo-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000,
            background: 'rgba(0,0,0,.6)', display: 'grid', placeItems: 'center', padding: 16,
          }}
        >
          <motion.div
            role="dialog"
            aria-label="Offer"
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.92, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            style={{
              width: 'min(92vw, 380px)', maxHeight: '86vh', overflow: 'auto',
              background: 'var(--surface-elevated, #fff)', color: 'var(--ink)',
              borderRadius: 20, border: '1px solid var(--border, var(--line))',
              boxShadow: '0 30px 80px -20px rgba(0,0,0,.6)', padding: 16,
            }}
          >
            {promo.image_url && (
              <img
                src={promo.image_url}
                alt=""
                style={{ width: '100%', height: 'auto', borderRadius: 14, display: 'block', marginBottom: promo.text ? 12 : 0 }}
              />
            )}
            {promo.text && (
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
                {promo.text}
              </p>
            )}
            <button
              type="button"
              onClick={close}
              style={{
                marginTop: 14, width: '100%', border: 'none', borderRadius: 12, padding: '12px 16px',
                background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', fontWeight: 800, fontSize: 14,
              }}
            >
              Theek hai
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
