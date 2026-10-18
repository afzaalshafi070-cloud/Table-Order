/**
 * Card — surface wrapper. `interactive` adds hover lift.
 * `flush` removes inner padding (for images / tables).
 */
export default function Card({ interactive = false, flush = false, as: Tag = 'div', className = '', children, ...rest }) {
  const cls = [
    'ui-card',
    interactive ? 'ui-card--interactive' : '',
    flush ? 'ui-card--flush' : '',
    className,
  ].filter(Boolean).join(' ')
  return <Tag {...rest} className={cls}>{children}</Tag>
}
