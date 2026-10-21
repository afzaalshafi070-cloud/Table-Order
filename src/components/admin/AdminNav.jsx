import { useState } from 'react'
import { motion } from 'framer-motion'
import '../../styles/admin.css'

const EASE = [0.16, 1, 0.3, 1]
const COLLAPSE_KEY = 'tableorder:adminNavCollapsed'

// Section ids match the existing `tab` state in AdminPanel.
export const ADMIN_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'M4 13h6V4H4zM14 20h6v-9h-6zM14 4h6v5h-6zM4 20h6v-5H4z' },
  { id: 'restaurants', label: 'Restaurants', icon: 'M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1' },
  { id: 'branches', label: 'Branch Requests', icon: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z' },
  { id: 'add', label: 'Add Restaurant', icon: 'M12 5v14M5 12h14' },
  { id: 'codes', label: 'Activation Codes', icon: 'M4 4h16v6H4zM4 14h16v6H4z' },
  { id: 'payments', label: 'Payments', icon: 'M3 6h18v12H3zM3 10h18' },
  { id: 'reports', label: 'Reports', icon: 'M4 20V10M10 20V4M16 20v-6M22 20H2' },
  { id: 'audit', label: 'Audit Log', icon: 'M9 4h6l4 4v12H5V4h4M9 12h6M9 16h6' },
  { id: 'settings', label: 'Settings', icon: 'M4 7h16M4 17h16M9 4v6M15 14v6' },
]

/**
 * AdminNav — sidebar on desktop (collapsible, state remembered), horizontal
 * scrolling section bar on phones and tablets. Both render; CSS shows one.
 */
export default function AdminNav({ active, onSelect, title = 'Table Order', subtitle = 'Control Center' }) {
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
        className={`adm-sidebar${collapsed ? ' is-collapsed' : ''}`}
        aria-label="Admin navigation"
        initial={{ x: -24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        <div className="adm-brand">
          <span className="adm-brand__mark" aria-hidden="true">{title.charAt(0).toUpperCase()}</span>
          <div className="adm-brand__text">
            {title}
            <small>{subtitle}</small>
          </div>
        </div>
        <nav className="adm-nav" aria-label="Sections">
          {ADMIN_NAV.map(item => (
            <NavButton key={item.id} item={item} indicatorId="adm-ind-side" active={active === item.id} onSelect={onSelect} />
          ))}
        </nav>
        <button
          type="button"
          className="adm-sidebar__toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '»' : '«'}
        </button>
      </motion.aside>

      <nav className="adm-mobile-nav" aria-label="Sections">
        {ADMIN_NAV.map(item => (
          <NavButton key={item.id} item={item} indicatorId="adm-ind-mobile" active={active === item.id} onSelect={onSelect} />
        ))}
      </nav>
    </>
  )
}

function NavButton({ item, indicatorId, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-current={active ? 'page' : undefined}
      aria-label={item.label}
      title={item.label}
      className={`adm-nav-btn${active ? ' is-active' : ''}`}
    >
      {active && (
        <motion.span
          layoutId={indicatorId}
          className="adm-nav-btn__ind"
          aria-hidden="true"
          transition={{ type: 'spring', stiffness: 460, damping: 38 }}
        />
      )}
      <svg className="adm-nav-btn__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d={item.icon} />
      </svg>
      <span className="adm-nav-btn__label">{item.label}</span>
    </button>
  )
}
