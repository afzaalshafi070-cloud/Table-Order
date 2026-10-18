import { motion } from 'framer-motion'
import CountUp from './CountUp.jsx'

/**
 * ShiftStats — live summary above the orders grid.
 * Sales follow the same rule as the End-of-Day report: every order
 * except cancelled ones, summed by total.
 */
export default function ShiftStats({ orders = [] }) {
  const active = orders.filter(o => o.status !== 'served' && o.status !== 'cancelled').length
  const pending = orders.filter(o => o.status === 'pending').length
  const sales = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((sum, o) => sum + Number(o.total || 0), 0)

  const stats = [
    { label: 'Active tickets', value: active, format: n => Math.round(n).toLocaleString() },
    { label: 'New orders', value: pending, format: n => Math.round(n).toLocaleString() },
    { label: 'Shift sales', value: sales, format: n => `PKR ${Math.round(n).toLocaleString()}` },
  ]

  return (
    <div className="dash-stats" role="region" aria-label="Shift summary">
      {stats.map((s, i) => (
        <motion.div
          key={s.label}
          className="dash-stat"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06, duration: 0.3 }}
        >
          <div className="dash-stat__label">{s.label}</div>
          <div className="dash-stat__value">
            <CountUp value={s.value} format={s.format} />
          </div>
        </motion.div>
      ))}
    </div>
  )
}
