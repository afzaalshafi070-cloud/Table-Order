import { forwardRef, useId } from 'react'

/** Textarea — labelled multi-line field with optional hint and error. */
const Textarea = forwardRef(function Textarea({ label, hint, error, id, className = '', ...rest }, ref) {
  const autoId = useId()
  const taId = id || autoId
  const hintId = `${taId}-hint`
  const errId = `${taId}-err`
  const describedBy = [hint && hintId, error && errId].filter(Boolean).join(' ') || undefined

  const area = (
    <textarea
      {...rest}
      ref={ref}
      id={taId}
      className={`ui-textarea ${className}`.trim()}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={describedBy}
    />
  )

  if (!label && !hint && !error) return area

  return (
    <div className="ui-field">
      {label && <label className="ui-field__label" htmlFor={taId}>{label}</label>}
      {area}
      {hint && !error && <span id={hintId} className="ui-field__hint">{hint}</span>}
      {error && <span id={errId} className="ui-field__error" role="alert">{error}</span>}
    </div>
  )
})

export default Textarea
