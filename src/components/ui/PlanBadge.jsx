import Badge from './Badge.jsx'

/**
 * PlanBadge — maps the real restaurant_plans.plan_status values
 * (trial, active, overdue, suspended, sold_out, complimentary, archived)
 * to a labelled badge. Unknown values fall back to neutral.
 */
const PLAN_MAP = {
  trial: { label: 'Trial', variant: 'info' },
  active: { label: 'Active', variant: 'success' },
  overdue: { label: 'Overdue', variant: 'warning' },
  suspended: { label: 'Suspended', variant: 'error' },
  sold_out: { label: 'Sold out', variant: 'error' },
  complimentary: { label: 'Complimentary', variant: 'info' },
  archived: { label: 'Archived', variant: 'neutral' },
}

export default function PlanBadge({ status, className = '' }) {
  const key = String(status || '').toLowerCase()
  const meta = PLAN_MAP[key] || { label: status || 'Unknown', variant: 'neutral' }
  return <Badge variant={meta.variant} className={className}>{meta.label}</Badge>
}
