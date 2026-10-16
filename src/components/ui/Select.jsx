import { forwardRef, useId } from 'react'

/**
 * Select — labelled native select. `options` is an array of
 * { value, label } or plain strings.
 */
const Select = forwardRef(function Select({ label, hint, error, id, options = [], className = '', children, ...rest }, ref) {
  const autoId = useId()
  const selectId = id || autoId
  const hintId = `${selectId}-hint`
  const errId = `${selectId}-err`
  const describedBy = [hint && hintId, error && errId].filter(Boolean).join(' ') || undefined

  const select = (
    <select
      {...rest}
      ref={ref}
      id={selectId}
      className={`ui-select ui-input ${className}`.trim()}
      aria-invalid={error ? 'true' : undefined}
      aria-describedby={describedBy}
    >
      {options.map(o => {
        const v = typeof o === 'string' ? o : o.value
        const l = typeof o === 'string' ? o : o.label
        return <option key={v} value={v}>{l}</option>
      })}
      {children}
    </select>
  )

  if (!label && !hint && !error) return select

  return (
    <div className="ui-field">
      {label && <label className="ui-field__label" htmlFor={selectId}>{label}</label>}
      {select}
      {hint && !error && <span id={hintId} className="ui-field__hint">{hint}</span>}
      {error && <span id={errId} className="ui-field__error" role="alert">{error}</span>}
    </div>
  )
})

export default Select
