/**
 * Toast — presentational notification. Parent controls when it is
 * rendered and dismissed. Announced politely to screen readers.
 */
export default function Toast({ variant = 'info', title, children, onClose, className = '' }) {
  return (
    <div
      className={`ui-toast ui-toast--${variant} ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <div className="ui-toast__body">
        {title && <strong>{title}</strong>}
        {title && children ? <br /> : null}
        {children}
      </div>
      {onClose && (
        <button type="button" className="ui-toast__close" onClick={onClose} aria-label="Dismiss notification">
          ×
        </button>
      )}
    </div>
  )
}
