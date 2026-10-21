import { useState } from 'react'
import InfoTip from './InfoTip.jsx'
import RawMaterials from './RawMaterials.jsx'
import RecipeBuilder from './RecipeBuilder.jsx'
import OverheadsManager from './OverheadsManager.jsx'
import ProfitDashboard from './ProfitDashboard.jsx'
import WasteAlerts from './WasteAlerts.jsx'

const SUB_TABS = [
  { id: 'profit', label: 'Profit', help: 'help_tab_profit' },
  { id: 'materials', label: 'Raw Materials', help: 'help_tab_materials' },
  { id: 'recipes', label: 'Recipes', help: 'help_tab_recipes' },
  { id: 'overheads', label: 'Overheads', help: 'help_tab_overheads' },
  { id: 'waste', label: 'Waste / Theft', help: 'help_tab_waste' },
]

function subTabStyle(active) {
  return {
    border: 'none',
    borderRadius: 8,
    padding: '7px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    background: active ? 'var(--brand-primary)' : 'var(--paper-dim)',
    color: active ? 'var(--brand-primary-text)' : 'var(--ink)',
  }
}

/**
 * Costing Center — single entry point for all costing / inventory features.
 * Drop this into CounterDashboard as a new tab.
 */
export default function CostingCenter({ sessionId }) {
  const [sub, setSub] = useState('profit')

  if (!sessionId) {
    return <div style={{ padding: 16, color: 'var(--muted)' }}>No session</div>
  }

  return (
    <div>
      <div style={{
        display: 'flex',
        gap: 6,
        padding: '12px 16px 0',
        flexWrap: 'wrap',
        borderBottom: '1px solid var(--line)',
        paddingBottom: 10,
      }}>
        {SUB_TABS.map(t => (
          <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setSub(t.id)}
              style={subTabStyle(sub === t.id)}
            >
              {t.label}
            </button>
            <InfoTip helpKey={t.help} />
          </span>
        ))}
      </div>

      {sub === 'profit' && <ProfitDashboard sessionId={sessionId} />}
      {sub === 'materials' && <RawMaterials sessionId={sessionId} />}
      {sub === 'recipes' && <RecipeBuilder sessionId={sessionId} />}
      {sub === 'overheads' && <OverheadsManager sessionId={sessionId} />}
      {sub === 'waste' && <WasteAlerts sessionId={sessionId} />}
    </div>
  )
}
