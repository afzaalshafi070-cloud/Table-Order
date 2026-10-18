import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const EASE = [0.16, 1, 0.3, 1]
const TOAST_MS = 4500

/** Animated checkmark (stroke draws in once). Used for success states. */
export function SuccessCheck({ size = 44 }) {
  return (
    <motion.span
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 18 }}
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: '50%', display: 'inline-grid', placeItems: 'center',
        background: 'var(--color-success-subtle, #e3f1e8)', color: 'var(--color-success, #2f7a4f)', flex: '0 0 auto',
      }}
    >
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <motion.path
          d="M5 13l4 4L19 7"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.15, ease: 'easeOut' }}
        />
      </svg>
    </motion.span>
  )
}

/**
 * AdminToast — slides in from the top, shows a progress bar, auto-dismisses.
 * onDismiss is kept in a ref so re-renders don't restart the timer.
 */
export function AdminToast({ msg, onDismiss }) {
  const isSuccess = typeof msg === 'string' && msg.includes('success')
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => dismissRef.current?.(), TOAST_MS)
    return () => clearTimeout(t)
  }, [msg])

  return (
    <div className="adm-toast-host" aria-live="polite">
      <AnimatePresence>
        {msg && (
          <motion.div
            key={msg}
            role="status"
            className={`adm-toast${isSuccess ? '' : ' adm-toast--error'}`}
            initial={{ y: -40, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -20, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            {isSuccess ? <SuccessCheck size={28} /> : null}
            <div className="adm-toast__body">
              <strong>{isSuccess ? 'Done' : 'Something went wrong'}</strong>
              <div>{msg}</div>
            </div>
            <button type="button" className="adm-toast__close" onClick={() => onDismiss?.()} aria-label="Dismiss notification">×</button>
            <span className="adm-toast__progress" style={{ animationDuration: `${TOAST_MS}ms` }} aria-hidden="true" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Switch — accessible on/off toggle with a sliding knob. */
export function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <label className="adm-switch-row">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        className="adm-switch"
        onClick={() => onChange(!checked)}
      >
        <span className="adm-switch__knob" aria-hidden="true" />
      </button>
      <span>{label}</span>
    </label>
  )
}

/** Collapsible — smooth height expand/collapse with an accessible header button. */
export function Collapsible({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = `coll-${title.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <section className="adm-card-body">
      <button type="button" className="adm-collapse-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>
        <span className="adm-card-title" style={{ margin: 0 }}>{title}</span>
        <span className={`adm-collapse-chev${open ? ' is-open' : ''}`} aria-hidden="true">▾</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ paddingTop: 16 }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/** StepBar — progress track plus step labels for the onboarding wizard. */
export function StepBar({ step, labels }) {
  return (
    <div className="adm-steps" aria-label={`Step ${step + 1} of ${labels.length}`}>
      <div className="adm-steps__labels">
        {labels.map((l, i) => (
          <span key={l} className={i === step ? 'is-current' : ''} aria-current={i === step ? 'step' : undefined}>
            {i + 1}. {l}
          </span>
        ))}
      </div>
      <div className="adm-steps__track" aria-hidden="true">
        <motion.div
          className="adm-steps__fill"
          initial={false}
          animate={{ scaleX: (step + 1) / labels.length }}
          transition={{ duration: 0.35, ease: EASE }}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  )
}

/** PageHead — title, subtitle and optional actions for every section. */
export function PageHead({ title, subtitle, actions }) {
  return (
    <div className="adm-page-head">
      <div>
        <h1 className="adm-page-head__title">{title}</h1>
        {subtitle && <p className="adm-page-head__sub">{subtitle}</p>}
      </div>
      {actions && <div className="adm-btn-row">{actions}</div>}
    </div>
  )
}
