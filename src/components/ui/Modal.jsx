import { useEffect, useId, useRef } from 'react'

/**
 * Modal — accessible dialog.
 * Closes on Escape and backdrop click; locks page scroll while open;
 * returns focus to the element that opened it.
 */
export default function Modal({ open, onClose, title, footer, children, className = '' }) {
  const titleId = useId()
  const dialogRef = useRef(null)
  const lastFocused = useRef(null)
  // Keep the latest onClose without re-running the effect on every render,
  // so inline arrow functions don't reset focus handling.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    lastFocused.current = document.activeElement
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = e => { if (e.key === 'Escape') onCloseRef.current?.() }
    document.addEventListener('keydown', onKey)
    dialogRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      lastFocused.current?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="ui-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onCloseRef.current?.() }}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`ui-modal ${className}`.trim()}
      >
        {title && <h2 id={titleId} className="ui-modal__title">{title}</h2>}
        {children}
        {footer && <div className="ui-modal__footer">{footer}</div>}
      </div>
    </div>
  )
}
