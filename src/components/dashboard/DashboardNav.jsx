import { useState } from 'react'
import { motion } from 'framer-motion'
import '../../styles/dashboard.css'

const EASE = [0.16, 1, 0.3, 1]
const COLLAPSE_KEY = 'tableorder:navCollapsed'

// Tab ids match the existing `tab` state in CounterDashboard.
export const NAV_ITEMS = [
  { id: 'orders', label: 'Orders', short: 'Orders', icon: 'M4 6h16M4 12h16M4 18h10' },
  { id: 'menu', label: 'Menu Editor', short: 'Menu', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  { id: 'costing', label: 'Costing', short: 'Costing', icon: 'M4 20V10M10 20V4M16 20v-6M22 20H2' },
  { id: 'qr', label: 'QR Center', short: 'QR', icon: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM14 14h3v3h-3zM19 19h2v2h-2z' },
  { id: 'subscription', label: 'Subscription', short: 'Billing', icon: 'M3 6h18v12H3zM3 10h18' },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: 'M4 7h16M4 17h16M9 4v6M15 14v6' },
]

/**
 * DashboardNav — sidebar on desktop (collapsible), bottom tab bar on phones.
 * Both are rendered; CSS shows one of them. Each has its own layoutId so the
 * active indicator slides within its own bar.
 */
export default function DashboardNav({ active, onSelect, restaurantName, logoUrl }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1' } catch { return false }
  })

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  return (
    <>
      <motion.aside
        className={`dash-sidebar${collapsed ? ' is-collapsed' : ''}`}
        aria-label="Dashboard navigation"
        initial={{ x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <div className="dash-sidebar__brand">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="dash-sidebar__logo" />
          ) : (
            <span className="dash-sidebar__logo dash-sidebar__logo--fallback" aria-hidden="true">
              {(restaurantName || 'T').charAt(0).toUpperCase()}
            </span>
          )}
          <div className="dash-sidebar__name">
            {restaurantName}
            <small>COUNTER</small>
          </div>
        </div>

        <nav className="dash-sidebar__nav" aria-label="Sections">
          {NAV_ITEMS.map(item => (
            <NavButton key={item.id} item={item} variant="side" active={active === item.id} onSelect={onSelect} />
          ))}
        </nav>

        <button
          type="button"
          className="dash-sidebar__toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </motion.aside>

      <nav className="dash-bottombar" aria-label="Sections">
        {NAV_ITEMS.map(item => (
          <NavButton key={item.id} item={item} variant="bottom" active={active === item.id} onSelect={onSelect} />
        ))}
      </nav>
    </>
  )
}

function NavButton({ item, variant, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      title={item.label}
      className={`dash-nav-btn${active ? ' is-active' : ''}`}
    >
      {active && (
        <motion.span
          layoutId={`dash-nav-indicator-${variant}`}
          className="dash-nav-btn__indicator"
          aria-hidden="true"
          transition={{ type: 'spring', stiffness: 460, damping: 38 }}
        />
      )}
      <svg className="dash-nav-btn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={item.icon} />
      </svg>
      <span className="dash-nav-btn__label">{variant === 'bottom' ? item.short : item.label}</span>
    </button>
  )
}
