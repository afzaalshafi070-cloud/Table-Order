import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const SHOW_MS = 4000

/**
 * ArrivalToast — slides in from the top when a new order arrives, with a
 * shrinking progress bar. Auto-dismisses; the parent clears `arrival` via onDone.
 * onDone is kept in a ref so realtime re-renders don't restart the timer.
 */
export default function ArrivalToast({ arrival, onDone }) {
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    if (!arrival) return
    const t = setTimeout(() => onDoneRef.current?.(), SHOW_MS)
    return () => clearTimeout(t)
  }, [arrival])

  return (
    <div className="dash-toast-host" aria-live="polite">
      <AnimatePresence>
        {arrival && (
          <motion.div
            key={arrival.key}
            role="status"
            className="dash-toast"
            initial={{ y: -48, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <span className="dash-toast__dot" aria-hidden="true" />
            <div className="dash-toast__text">
              <strong>{arrival.title}</strong>
              <span>{arrival.detail}</span>
            </div>
            <motion.div
              className="dash-toast__progress"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: SHOW_MS / 1000, ease: 'linear' }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
