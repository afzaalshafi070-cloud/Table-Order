import { forwardRef, useId } from 'react'

/**
 * Input — labelled text field with optional hint and error.
 * Pass `label` for a visible label (also used as aria-label fallback).
 */
const Input = forwardRef(function Input({ label, hint, error, id, className = '', ...rest }, ref) {
  const autoId = useId()
  const inputId = id || autoId
  const hintId = `${inputId}-hint`
  const errId = `${inputId}-err`
  const describedBy = [hint && hintId, error && errId].filter(Boolean).join(' ') || undefined

  const field = (
    <input
      {...rest}
      ref={ref}
      id={inputId}
      className={`ui-input ${className}`.trim()}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={describedBy}
      aria-label={label ? undefined : rest['aria-label']}
    />
  )

  if (!label && !hint && !error) return field

  return (
    <div className="ui-field">
      {label && <label className="ui-field__label" htmlFor={inputId}>{label}</label>}
      {field}
      {hint && !error && <span id={hintId} className="ui-field__hint">{hint}</span>}
      {error && <span id={errId} className="ui-field__error" role="alert">{error}</span>}
    </div>
  )
})

export default Input
