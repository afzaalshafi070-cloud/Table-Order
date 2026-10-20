/**
 * Button — variants: primary | secondary | ghost | danger | success
 * sizes: sm | md | lg. `loading` shows a spinner and disables the button.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  type = 'button',
  className = '',
  children,
  ...rest
}) {
  const cls = [
    'ui-btn',
    `ui-btn--${variant}`,
    `ui-btn--${size}`,
    block ? 'ui-btn--block' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      {...rest}
      type={type}
      className={cls}
      disabled={loading || rest.disabled}
      aria-busy={loading || undefined}
    >
      {loading && <span className="ui-btn__spinner" aria-hidden="true" />}
      {children}
    </button>
  )
}
