/**
 * EmptyState — icon, title, description and optional call to action.
 * `icon` can be any node (emoji, SVG, lucide icon).
 */
export default function EmptyState({ icon = '✦', title, description, action, className = '' }) {
  return (
    <div className={`ui-empty ${className}`.trim()} role="status">
      <div className="ui-empty__icon" aria-hidden="true">{icon}</div>
      {title && <h3 className="ui-empty__title">{title}</h3>}
      {description && <p className="ui-empty__desc">{description}</p>}
      {action && <div className="ui-empty__action">{action}</div>}
    </div>
  )
}
