/** Badge — status pill. variant: neutral | success | warning | error | info | primary */
export default function Badge({ variant = 'neutral', className = '', children, ...rest }) {
  return (
    <span {...rest} className={`ui-badge ui-badge--${variant} ${className}`.trim()}>
      {children}
    </span>
  )
}
