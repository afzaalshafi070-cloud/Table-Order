import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import { supabase } from '../supabaseClient.js'
import { ensureAnonymousAuth } from '../utils/auth.js'

const SESSION_KEY = 'tableorder:adminKey'
const LAST_ACTIVE_KEY = 'tableorder:adminActive'
const IDLE_MS = 45 * 60 * 1000 // 45 min inactivity

const NAV = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'restaurants', label: 'Restaurants' },
  { id: 'add', label: 'Add Restaurant' },
  { id: 'codes', label: 'Activation Codes' },
  { id: 'payments', label: 'Payments' },
  { id: 'reports', label: 'Reports' },
  { id: 'audit', label: 'Audit Log' },
  { id: 'settings', label: 'Settings' },
]

const STATUS_COLORS = {
  trial: '#2563eb',
  active: '#16a34a',
  overdue: '#ea580c',
  suspended: '#9333ea',
  sold_out: '#dc2626',
  complimentary: '#0891b2',
  archived: '#6b7280',
}

function fmtDate(v) {
  if (!v) return '—'
  try { return new Date(v).toLocaleDateString() } catch { return '—' }
}
function fmtMoney(n, cur = 'PKR') {
  const x = Number(n) || 0
  return `${cur} ${x.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
function badge(status) {
  const c = STATUS_COLORS[status] || '#64748b'
  return {
    display: 'inline-block', padding: '3px 10px', borderRadius: 999,
    background: c + '22', color: c, fontSize: 12, fontWeight: 700, textTransform: 'uppercase'
  }
}
function card() {
  return {
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14,
    padding: 16, boxShadow: '0 1px 2px rgba(0,0,0,.04)'
  }
}

export default function AdminPanel() {
  const [keyInput, setKeyInput] = useState('')
  const [adminKey, setAdminKey] = useState('')
  const [auth, setAuth] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState('dashboard')

  const [stats, setStats] = useState(null)
  const [restaurants, setRestaurants] = useState([])
  const [codes, setCodes] = useState([])
  const [payments, setPayments] = useState([])
  const [paymentAccounts, setPaymentAccounts] = useState([])
  const [paymentRequests, setPaymentRequests] = useState([])
  const [audit, setAudit] = useState([])
  const [settings, setSettings] = useState({})
  const [selected, setSelected] = useState(null)
  // payment account form
  const [paLabel, setPaLabel] = useState('Bank Transfer')
  const [paType, setPaType] = useState('bank')
  const [paBank, setPaBank] = useState('')
  const [paTitle, setPaTitle] = useState('')
  const [paNumber, setPaNumber] = useState('')
  const [paIban, setPaIban] = useState('')
  const [paQr, setPaQr] = useState('')
  const [paInstr, setPaInstr] = useState('')
  const [paActive, setPaActive] = useState(true)
  const [paEditId, setPaEditId] = useState(null)

  // filters
  const [q, setQ] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPlan, setFilterPlan] = useState('all')

  // forms
  const [addName, setAddName] = useState('')
  const [addPin, setAddPin] = useState('')
  const [addStatus, setAddStatus] = useState('trial')
  const [addDays, setAddDays] = useState(30)
  const [addCycle, setAddCycle] = useState('month')
  const [addNotes, setAddNotes] = useState('')
  const [addActivationCode, setAddActivationCode] = useState('')
  const [lastCreated, setLastCreated] = useState(null)
  const [newCodes, setNewCodes] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('')
  const [payRef, setPayRef] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payDays, setPayDays] = useState(30)
  const [payCycle, setPayCycle] = useState('month')
  const [payRestaurant, setPayRestaurant] = useState('')
  const [oldKey, setOldKey] = useState('')
  const [newKey, setNewKey] = useState('')
  const [confirmText, setConfirmText] = useState(null)

  const idleTimer = useRef(null)

  const touch = useCallback(() => {
    sessionStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()))
  }, [])

  const logout = useCallback((reason) => {
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(LAST_ACTIVE_KEY)
    setAdminKey('')
    setAuth(false)
    setRestaurants([])
    setCodes([])
    setPayments([])
    setAudit([])
    setStats(null)
    setSelected(null)
    if (reason) setMsg(reason)
  }, [])

  // inactivity watchdog
  useEffect(() => {
    if (!auth) return
    const tick = () => {
      const last = Number(sessionStorage.getItem(LAST_ACTIVE_KEY) || 0)
      if (last && Date.now() - last > IDLE_MS) logout('Session timed out due to inactivity. Login again.')
    }
    const id = setInterval(tick, 30000)
    const onAct = () => touch()
    window.addEventListener('click', onAct)
    window.addEventListener('keydown', onAct)
    return () => {
      clearInterval(id)
      window.removeEventListener('click', onAct)
      window.removeEventListener('keydown', onAct)
    }
  }, [auth, logout, touch])

  const rpc = async (name, args = {}) => {
    await ensureAnonymousAuth()
    const { data, error } = await supabase.rpc(name, { p_admin_key: adminKey, ...args })
    if (error) throw error
    return data
  }

  const refreshAll = async (key = adminKey) => {
    await ensureAnonymousAuth()
    const [st, list, cd, au, set] = await Promise.all([
      supabase.rpc('admin_dashboard_stats', { p_admin_key: key }),
      supabase.rpc('admin_list_restaurants', { p_admin_key: key }),
      supabase.rpc('admin_list_codes', { p_admin_key: key }),
      supabase.rpc('admin_list_audit', { p_admin_key: key, p_limit: 150 }),
      supabase.rpc('admin_get_settings', { p_admin_key: key }),
    ])
    if (st.error) throw st.error
    if (list.error) throw list.error
    setStats(st.data || {})
    setRestaurants(Array.isArray(list.data) ? list.data : [])
    if (!cd.error) setCodes(Array.isArray(cd.data) ? cd.data : [])
    if (!au.error) setAudit(Array.isArray(au.data) ? au.data : [])
    if (!set.error) setSettings(set.data || {})
    try {
      const py = await supabase.rpc('admin_list_payments', { p_admin_key: key, p_restaurant_id: null })
      if (!py.error) setPayments(Array.isArray(py.data) ? py.data : [])
    } catch { /* optional */ }
    try {
      const acc = await supabase.rpc('admin_list_payment_accounts', { p_admin_key: key })
      if (!acc.error) setPaymentAccounts(Array.isArray(acc.data) ? acc.data : [])
    } catch { /* optional until migration */ }
    try {
      const req = await supabase.rpc('admin_list_payment_requests', { p_admin_key: key, p_status: null })
      if (!req.error) setPaymentRequests(Array.isArray(req.data) ? req.data : [])
    } catch { /* optional until migration */ }
  }

  const login = async (e) => {
    e?.preventDefault()
    const k = keyInput.trim()
    if (!k) { setMsg('Admin Security Key enter karein.'); return }
    setLoading(true)
    setMsg('')
    try {
      await ensureAnonymousAuth()
      const { error } = await supabase.rpc('admin_dashboard_stats', { p_admin_key: k })
      if (error) throw error
      sessionStorage.setItem(SESSION_KEY, k)
      touch()
      setAdminKey(k)
      setAuth(true)
      await refreshAll(k)
    } catch (err) {
      const m = err?.message || String(err)
      if (m.includes('ADMIN_UNAUTHORIZED')) setMsg('Galat Admin Security Key.')
      else if (m.includes('ADMIN_NOT_CONFIGURED')) setMsg('Admin key configure nahi. Supabase mein admin_key set karein.')
      else if (m.includes('Could not find the function')) setMsg('Admin SQL migration run nahi hui. ADMIN_SAAS_CONTROL_CENTER.sql chalaein.')
      else setMsg('Login fail: ' + m)
      logout()
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved) {
      setKeyInput(saved)
      setAdminKey(saved)
      setAuth(true)
      touch()
      refreshAll(saved).catch(() => logout('Session invalid. Login again.'))
    }
  }, [])

  const filtered = useMemo(() => {
    let rows = [...restaurants]
    if (q.trim()) {
      const s = q.trim().toLowerCase()
      rows = rows.filter(r =>
        (r.restaurant_name || '').toLowerCase().includes(s) ||
        (r.restaurant_id || '').toLowerCase().includes(s)
      )
    }
    if (filterStatus !== 'all') rows = rows.filter(r => r.plan_status === filterStatus)
    if (filterPlan !== 'all') rows = rows.filter(r => (r.billing_cycle || 'month') === filterPlan)
    return rows
  }, [restaurants, q, filterStatus, filterPlan])

  const alerts = useMemo(() => {
    const list = []
    restaurants.forEach(r => {
      if (r.plan_status === 'trial' && r.trial_ends_at) {
        const d = (new Date(r.trial_ends_at) - Date.now()) / 86400000
        if (d >= 0 && d <= 7) list.push({ type: 'trial', text: `${r.restaurant_name}: trial ${Math.ceil(d)} din mein khatam` })
      }
      if (r.plan_status === 'overdue') list.push({ type: 'overdue', text: `${r.restaurant_name}: payment overdue / grace` })
      if (r.plan_status === 'suspended') list.push({ type: 'suspended', text: `${r.restaurant_name}: suspended` })
      if (r.plan_status === 'sold_out') list.push({ type: 'sold', text: `${r.restaurant_name}: sold out` })
    })
    return list.slice(0, 12)
  }, [restaurants])

  const act = async (label, fn) => {
    setLoading(true)
    setMsg('')
    try {
      touch()
      await fn()
      setMsg(label + ' — success')
      await refreshAll()
    } catch (err) {
      setMsg((err?.message || String(err)))
    } finally {
      setLoading(false)
    }
  }

  const confirm = (text, onYes) => setConfirmText({ text, onYes })

  const exportCsv = (rows, filename) => {
    const headers = ['restaurant_id', 'restaurant_name', 'plan_status', 'billing_cycle', 'trial_ends_at', 'paid_until', 'grace_ends_at', 'order_count', 'lifetime_revenue']
    const lines = [headers.join(',')]
    rows.forEach(r => {
      lines.push(headers.map(h => {
        const v = r[h] == null ? '' : String(r[h]).replace(/"/g, '""')
        return `"${v}"`
      }).join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
  }

  const pdfList = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    let y = 48
    doc.setFontSize(16)
    doc.text((settings.company_name || 'Table Order') + ' — Restaurants', 40, y)
    y += 24
    doc.setFontSize(10)
    filtered.forEach((r, i) => {
      if (y > 780) { doc.addPage(); y = 48 }
      doc.text(`${i + 1}. ${r.restaurant_name || r.restaurant_id} | ${r.plan_status} | due ${fmtDate(r.paid_until || r.trial_ends_at)}`, 40, y)
      y += 14
    })
    doc.save('restaurants-report.pdf')
  }

  const pdfDetail = (r) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    let y = 48
    const line = (t) => { doc.text(String(t), 40, y); y += 16 }
    doc.setFontSize(16)
    line(r.restaurant_name || r.restaurant_id)
    doc.setFontSize(11)
    line(`ID: ${r.restaurant_id}`)
    line(`Status: ${r.plan_status}`)
    line(`Plan cycle: ${r.billing_cycle || 'month'}`)
    line(`Joined: ${fmtDate(r.activated_at)}`)
    line(`Trial end: ${fmtDate(r.trial_ends_at)}`)
    line(`Paid until: ${fmtDate(r.paid_until)}`)
    line(`Grace ends: ${fmtDate(r.grace_ends_at)}`)
    line(`Orders: ${r.order_count ?? 0}`)
    line(`Revenue: ${fmtMoney(r.lifetime_revenue, settings.currency || 'PKR')}`)
    line(`Payments total: ${fmtMoney(r.payments_total, settings.currency || 'PKR')}`)
    line(`Last activity: ${fmtDate(r.last_activity)}`)
    if (r.notes) line(`Notes: ${r.notes}`)
    doc.save(`restaurant-${r.restaurant_id}.pdf`)
  }

  // ---------- LOGIN UI ----------
  if (!auth) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0f172a,#1e293b)', display: 'grid', placeItems: 'center', padding: 16 }}>
        <form onSubmit={login} style={{ ...card(), width: '100%', maxWidth: 400, background: '#fff' }}>
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, letterSpacing: '.08em' }}>TABLE ORDER</div>
          <h1 style={{ margin: '8px 0 4px', fontSize: 22 }}>Admin Control Center</h1>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>Restaurant PIN se alag — sirf Admin Security Key.</p>
          {msg && <div style={{ background: '#fef2f2', color: '#b91c1c', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{msg}</div>}
          <label style={{ fontSize: 12, fontWeight: 600 }}>Admin Security Key</label>
          <input
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            autoComplete="current-password"
            style={{ width: '100%', marginTop: 6, marginBottom: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 15, boxSizing: 'border-box' }}
          />
          <button type="submit" disabled={loading} style={{ width: '100%', padding: 12, border: 'none', borderRadius: 10, background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            {loading ? 'Verifying…' : 'Unlock'}
          </button>
        </form>
      </div>
    )
  }

  // ---------- MAIN SHELL ----------
  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header style={{ background: '#0f172a', color: '#fff', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>{settings.company_name || 'Table Order'} · Control Center</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>SaaS Admin · /admin</div>
        </div>
        <button type="button" onClick={() => logout()} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', borderRadius: 8, padding: '8px 12px', fontWeight: 600, cursor: 'pointer' }}>Logout</button>
      </header>

      <nav style={{ display: 'flex', gap: 6, padding: '10px 12px', overflowX: 'auto', background: '#fff', borderBottom: '1px solid #e2e8f0' }}>
        {NAV.map(n => (
          <button key={n.id} type="button" onClick={() => { setTab(n.id); setSelected(null); touch() }}
            style={{
              flex: '0 0 auto', border: 'none', borderRadius: 999, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: tab === n.id ? '#0f172a' : '#f1f5f9', color: tab === n.id ? '#fff' : '#334155'
            }}>{n.label}</button>
        ))}
      </nav>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: 14 }}>
        {msg && (
          <div style={{ marginBottom: 12, padding: 12, borderRadius: 10, background: msg.includes('success') ? '#ecfdf5' : '#fef2f2', color: msg.includes('success') ? '#047857' : '#b91c1c', fontSize: 13 }}>
            {msg}
          </div>
        )}

        {/* DASHBOARD */}
        {tab === 'dashboard' && (
          <div>
            <h2 style={{ marginTop: 0 }}>Dashboard</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
              {[
                ['Total', stats?.total],
                ['Active', stats?.active],
                ['Trial', stats?.trial],
                ['Monthly', stats?.monthly],
                ['Yearly', stats?.yearly],
                ['Complimentary', stats?.complimentary],
                ['Due soon', stats?.due_soon],
                ['Overdue', stats?.overdue],
                ['Suspended', stats?.suspended],
                ['Sold out', stats?.sold_out],
                ['Recent 7d', stats?.recent_7d],
              ].map(([label, val]) => (
                <div key={label} style={card()}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{val ?? '—'}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
                </div>
              ))}
            </div>
            <div style={card()}>
              <div style={{ fontWeight: 700, marginBottom: 10 }}>Alerts</div>
              {alerts.length === 0 ? <div style={{ color: '#64748b', fontSize: 13 }}>No urgent alerts.</div> : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {alerts.map((a, i) => <li key={i} style={{ marginBottom: 6 }}>{a.text}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* RESTAURANTS */}
        {tab === 'restaurants' && !selected && (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or ID" style={{ flex: 1, minWidth: 160, padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' }} />
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <option value="all">All status</option>
                {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filterPlan} onChange={e => setFilterPlan(e.target.value)} style={{ padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                <option value="all">All cycles</option>
                <option value="month">Monthly</option>
                <option value="six_months">6 Months</option>
                <option value="year">Yearly</option>
              </select>
              <button type="button" onClick={() => exportCsv(filtered, 'restaurants.csv')} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600 }}>CSV</button>
              <button type="button" onClick={pdfList} style={{ padding: '10px 12px', borderRadius: 10, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 600 }}>PDF</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtered.map(r => (
                <div key={r.restaurant_id} style={{ ...card(), cursor: 'pointer' }} onClick={() => setSelected(r)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{r.restaurant_name || r.restaurant_id}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>{r.restaurant_id}</div>
                    </div>
                    <span style={badge(r.plan_status)}>{r.plan_status}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 8, marginTop: 10, fontSize: 12, color: '#475569' }}>
                    <div>Cycle: {r.billing_cycle || 'month'}</div>
                    <div>Joined: {fmtDate(r.activated_at)}</div>
                    <div>Due: {fmtDate(r.paid_until || r.trial_ends_at)}</div>
                    <div>Grace: {fmtDate(r.grace_ends_at)}</div>
                    <div>Orders: {r.order_count ?? 0}</div>
                    <div>Rev: {fmtMoney(r.lifetime_revenue, settings.currency || 'PKR')}</div>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div style={{ color: '#64748b', padding: 20 }}>No restaurants match.</div>}
            </div>
          </div>
        )}

        {/* DETAIL */}
        {tab === 'restaurants' && selected && (
          <div>
            <button type="button" onClick={() => setSelected(null)} style={{ marginBottom: 12, border: 'none', background: 'transparent', color: '#2563eb', fontWeight: 700, cursor: 'pointer' }}>← Back</button>
            <div style={card()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <h2 style={{ margin: 0 }}>{selected.restaurant_name}</h2>
                  <div style={{ color: '#64748b', fontSize: 13 }}>{selected.restaurant_id}</div>
                </div>
                <span style={badge(selected.plan_status)}>{selected.plan_status}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10, marginTop: 14, fontSize: 13 }}>
                <div>Joined<br /><b>{fmtDate(selected.activated_at)}</b></div>
                <div>Trial end<br /><b>{fmtDate(selected.trial_ends_at)}</b></div>
                <div>Paid until<br /><b>{fmtDate(selected.paid_until)}</b></div>
                <div>Grace<br /><b>{fmtDate(selected.grace_ends_at)}</b></div>
                <div>Orders<br /><b>{selected.order_count ?? 0}</b></div>
                <div>Revenue<br /><b>{fmtMoney(selected.lifetime_revenue, settings.currency || 'PKR')}</b></div>
                <div>Last activity<br /><b>{fmtDate(selected.last_activity)}</b></div>
              </div>
              {selected.notes && <div style={{ marginTop: 12, fontSize: 13, background: '#f8fafc', padding: 10, borderRadius: 8 }}>Notes: {selected.notes}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
                {[
                  ['Extend trial 30d', () => act('Trial extended', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'extend_trial', p_days: 30 }))],
                  ['Mark paid (month)', () => act('Marked paid', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'mark_paid', p_days: 30, p_billing_cycle: 'month' }))],
                  ['Mark paid (6 months)', () => act('Marked paid for 6 months', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'mark_paid', p_days: 180, p_billing_cycle: 'six_months' }))],
                  ['Mark paid (year)', () => act('Marked paid yearly', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'mark_paid', p_days: 365, p_billing_cycle: 'year' }))],
                  ['Complimentary', () => act('Complimentary', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'complimentary' }))],
                  ['Suspend', () => confirm('Suspend this restaurant?', () => act('Suspended', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'suspend' })))],
                  ['Reactivate', () => act('Reactivated', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'reactivate', p_days: 30 }))],
                  ['Sold out', () => confirm('Mark sold out? Data keep rahega.', () => act('Sold out', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'sold_out' })))],
                  ['Archive (soft)', () => confirm('Archive restaurant? Data soft-delete hoga.', () => act('Archived', () => rpc('admin_delete_restaurant', { p_restaurant_id: selected.restaurant_id })))],
                  ['Delete Permanently', () => confirm('PERMANENT DELETE? Ye restaurant aur related data hata dega. Undo nahi hoga.', () => act('Deleted permanently', () => rpc('admin_delete_restaurant', { p_restaurant_id: selected.restaurant_id })).then(() => setSelected(null)))],
                  ['PDF', () => pdfDetail(selected)],
                ].map(([label, fn]) => (
                  <button key={label} type="button" disabled={loading} onClick={fn}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>{label}</button>
                ))}
              </div>
              <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Reset staff PIN</div>
                <ResetPinForm onSubmit={(pin) => act('PIN reset', () => rpc('admin_reset_pin', { p_restaurant_id: selected.restaurant_id, p_new_pin: pin }))} />
              </div>
              <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 8 }}>Admin notes</div>
                <NotesForm initial={selected.notes || ''} onSave={(notes) => act('Notes saved', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'set_notes', p_notes: notes }))} />
              </div>
            </div>
          </div>
        )}

        {/* ADD */}
        {tab === 'add' && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={card()}>
              <h2 style={{ marginTop: 0 }}>Add Restaurant</h2>
              <p style={{ fontSize: 13, color: '#64748b' }}>
                Restaurant Name + Initial PIN required. Activation Code optional — blank chhorne par system auto-generate karega.
                PIN bcrypt hash ke sath store hota hai (plaintext nahi).
              </p>
              <div style={{ display: 'grid', gap: 10 }}>
                <input placeholder="Restaurant name *" value={addName} onChange={e => setAddName(e.target.value)} style={inp()} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Initial PIN (4–6 digits) *" value={addPin} onChange={e => setAddPin(e.target.value)} style={{ ...inp(), flex: 1 }} />
                  <button type="button" onClick={() => setAddPin(String(Math.floor(100000 + Math.random() * 900000)))} style={btnSecondary()}>Generate PIN</button>
                </div>
                <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, padding: 12, background: '#f8fafc' }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#334155', marginBottom: 7 }}>Activation Code (server-generated)</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input readOnly placeholder="Generate a new activation code" value={addActivationCode} style={{ ...inp(), flex: 1, minWidth: 180, background: '#fff', fontFamily: 'monospace', fontWeight: 800 }} />
                    <button type="button" disabled={loading} onClick={() => act('Activation code generated', async () => {
                      const data = await rpc('admin_generate_activation_code')
                      setAddActivationCode(data?.code || data || '')
                    })} style={btnSecondary()}>Generate New Activation Code</button>
                  </div>
                  {addActivationCode && <div style={{ marginTop: 7, fontSize: 12, color: '#166534', fontWeight: 700 }}>✓ Code ready: {addActivationCode}</div>}
                </div>
                <select value={addStatus} onChange={e => setAddStatus(e.target.value)} style={inp()}>
                  <option value="trial">Trial</option>
                  <option value="active">Active (paid)</option>
                  <option value="complimentary">Complimentary</option>
                </select>
                <select value={addCycle} onChange={e => setAddCycle(e.target.value)} style={inp()}>
                  <option value="month">Monthly</option>
                  <option value="six_months">6 Months</option>
                  <option value="year">Yearly</option>
                </select>
                <input type="number" placeholder="Trial / paid days" value={addDays} onChange={e => setAddDays(Number(e.target.value) || 30)} style={inp()} />
                <textarea placeholder="Admin notes (optional)" value={addNotes} onChange={e => setAddNotes(e.target.value)} style={{ ...inp(), minHeight: 70 }} />
                <button type="button" disabled={loading || !addName.trim() || !addPin.trim() || !addActivationCode.trim()} onClick={() => act('Restaurant created', async () => {
                  const data = await rpc('admin_create_restaurant', {
                    p_restaurant_name: addName.trim(),
                    p_pin: addPin.trim(),
                    p_plan_status: addStatus,
                    p_days: addDays,
                    p_billing_cycle: addCycle,
                    p_notes: addNotes || null,
                    p_activation_code: addActivationCode.trim() || ''
                  })
                  setLastCreated(data || null)
                  setAddName(''); setAddPin(''); setAddNotes(''); setAddActivationCode('')
                })} style={btnPrimary()}>Create Restaurant</button>
              </div>
              {lastCreated && (
                <div style={{ marginTop: 14, padding: 12, background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: 10, fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, color: '#065f46' }}>✓ Restaurant ban gaya</div>
                  <div><strong>Name:</strong> {lastCreated.restaurant_name || '—'}</div>
                  <div><strong>ID:</strong> {lastCreated.restaurant_id || '—'}</div>
                  <div style={{ marginTop: 6 }}>
                    <strong>Activation Code:</strong>{' '}
                    <code style={{ background: '#fff', padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                      {lastCreated.activation_code || '—'}
                    </code>
                  </div>
                  <p style={{ margin: '8px 0 0', color: '#047857', fontSize: 12 }}>
                    Counter pe pehli dafa login: <strong>Restaurant Name + PIN + ye Activation Code</strong>.
                    Code use hone ke baad dubara zaroori nahi.
                  </p>
                </div>
              )}
            </div>
            <div style={card()}>
              <h3 style={{ marginTop: 0 }}>Activation code workflow</h3>
              <ol style={{ fontSize: 13, color: '#475569', paddingLeft: 18 }}>
                <li>Activation Codes tab se code generate karein</li>
                <li>Code restaurant ko dein</li>
                <li>Counter login: Name + PIN + Activation Code (pehli dafa)</li>
                <li>Restaurant auto activate + plan record</li>
              </ol>
              <button type="button" onClick={() => setTab('codes')} style={btnSecondary()}>Go to Activation Codes</button>
            </div>
          </div>
        )}

        {/* CODES */}
        {tab === 'codes' && (
          <div>
            <div style={{ ...card(), marginBottom: 14 }}>
              <h3 style={{ marginTop: 0 }}>Generate codes</h3>
              <textarea value={newCodes} onChange={e => setNewCodes(e.target.value)} placeholder={"CODE-001\nCODE-002"} style={{ ...inp(), minHeight: 90 }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button type="button" disabled={loading} onClick={() => act('5 server activation codes generated', async () => {
                  const generated = []
                  for (let i = 0; i < 5; i += 1) {
                    const data = await rpc('admin_generate_activation_code')
                    const code = data?.code || data
                    if (!code) throw new Error('Activation code generate nahi ho saka.')
                    generated.push(code)
                  }
                  setNewCodes(v => (v ? v + '\n' : '') + generated.join('\n'))
                })} style={btnSecondary()}>Generate 5 Server Codes</button>
                <button type="button" disabled={loading} onClick={() => act('Codes created', async () => {
                  const arr = newCodes.split('\n').map(s => s.trim()).filter(Boolean)
                  await rpc('admin_create_codes', { p_codes: arr })
                  setNewCodes('')
                })} style={btnPrimary()}>Save codes</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {codes.map(c => (
                <div key={c.id || c.code} style={{ ...card(), display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800, fontFamily: 'monospace' }}>{c.code}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                      {(c.status || (c.is_used ? 'used' : 'unused'))}
                      {c.used_by ? ` · ${c.used_by}` : ''}
                      {c.created_at ? ` · ${fmtDate(c.created_at)}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => act('Revoked', () => rpc('admin_revoke_code', { p_code: c.code }))} style={btnSecondary()}>Revoke</button>
                    {!c.is_used && (
                      <button type="button" onClick={() => confirm('Delete unused code permanently?', () => act('Deleted', () => rpc('admin_delete_code', { p_code: c.code })))} style={{ ...btnSecondary(), color: '#b91c1c' }}>Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PAYMENTS */}
        {tab === 'payments' && (
          <div>
            {/* Central payment methods */}
            <div style={{ ...card(), marginBottom: 14 }}>
              <h3 style={{ marginTop: 0 }}>Central Payment Method (Subscription)</h3>
              <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
                Ye Admin ka subscription payment method hai. Har restaurant ke Counter → Subscription
                mein automatically ye details show hongi.
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                <select value={paType} onChange={e => setPaType(e.target.value)} style={inp()}>
                  <option value="bank">Bank Transfer</option>
                  <option value="jazzcash">JazzCash</option>
                  <option value="easypaisa">Easypaisa</option>
                  <option value="raast">Raast</option>
                  <option value="other">Other</option>
                </select>
                <input placeholder="Label (e.g. Bank Transfer / JazzCash)" value={paLabel} onChange={e => setPaLabel(e.target.value)} style={inp()} />
                <input placeholder="Bank / Provider name (optional)" value={paBank} onChange={e => setPaBank(e.target.value)} style={inp()} />
                <input placeholder="Account Title" value={paTitle} onChange={e => setPaTitle(e.target.value)} style={inp()} />
                <input placeholder="Account Number" value={paNumber} onChange={e => setPaNumber(e.target.value)} style={inp()} />
                <input placeholder="IBAN (optional)" value={paIban} onChange={e => setPaIban(e.target.value)} style={inp()} />
                <input placeholder="QR image URL (optional)" value={paQr} onChange={e => setPaQr(e.target.value)} style={inp()} />
                <textarea placeholder="Payment instructions" value={paInstr} onChange={e => setPaInstr(e.target.value)} style={{ ...inp(), minHeight: 64 }} />
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={paActive} onChange={e => setPaActive(e.target.checked)} /> Active
                </label>
                <button type="button" disabled={loading} onClick={() => act(paEditId ? 'Payment method updated' : 'Payment method saved', async () => {
                  await rpc('admin_upsert_payment_account', {
                    p_id: paEditId || null,
                    p_label: paLabel,
                    p_bank_name: paBank,
                    p_account_title: paTitle,
                    p_account_number: paNumber,
                    p_iban: paIban || null,
                    p_country: 'PK',
                    p_is_active: paActive,
                    p_sort_order: 0,
                    p_method_type: paType,
                    p_qr_url: paQr || null,
                    p_instructions: paInstr || null,
                  })
                  setPaEditId(null)
                  setPaType('bank'); setPaLabel('Bank Transfer'); setPaBank(''); setPaTitle(''); setPaNumber(''); setPaIban(''); setPaQr(''); setPaInstr(''); setPaActive(true)
                })} style={btnPrimary()}>{paEditId ? 'Update method' : 'Save payment method'}</button>
                {paEditId && (
                  <button type="button" onClick={() => {
                    setPaEditId(null)
                    setPaType('bank'); setPaLabel('Bank Transfer'); setPaBank(''); setPaTitle(''); setPaNumber(''); setPaIban(''); setPaQr(''); setPaInstr(''); setPaActive(true)
                  }} style={btnSecondary()}>Cancel edit</button>
                )}
              </div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {paymentAccounts.map(a => (
                  <div key={a.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12 }}>
                    <div style={{ fontWeight: 700 }}>{a.label} {a.is_active ? '' : '(inactive)'}</div>
                    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', marginTop: 2 }}>{a.method_type || 'bank'}</div>
                    <div style={{ fontSize: 13, color: '#475569' }}>
                      {a.bank_name} · {a.account_title} · {a.account_number}
                      {a.iban ? ` · ${a.iban}` : ''}
                    </div>
                    {a.instructions && <div style={{ fontSize: 12, marginTop: 4 }}>{a.instructions}</div>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="button" style={btnSecondary()} onClick={() => {
                        setPaEditId(a.id)
                        setPaType(a.method_type || 'bank')
                        setPaLabel(a.label || '')
                        setPaBank(a.bank_name || '')
                        setPaTitle(a.account_title || '')
                        setPaNumber(a.account_number || '')
                        setPaIban(a.iban || '')
                        setPaQr(a.qr_url || '')
                        setPaInstr(a.instructions || '')
                        setPaActive(!!a.is_active)
                      }}>Edit</button>
                      <button type="button" style={btnSecondary()} onClick={() => confirm('Delete this payment method?', () => act('Deleted', () => rpc('admin_delete_payment_account', { p_id: a.id })))}>Delete</button>
                    </div>
                  </div>
                ))}
                {paymentAccounts.length === 0 && <div style={{ color: '#64748b', fontSize: 13 }}>No payment methods yet. Upar form se add karein.</div>}
              </div>
            </div>

            {/* Pending restaurant payment requests */}
            <div style={{ ...card(), marginBottom: 14 }}>
              <h3 style={{ marginTop: 0 }}>Restaurant payment requests</h3>
              <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
                Counter Dashboard se submit. Approve → subscription auto renew. Reject → status rejected.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {paymentRequests.filter(r => r.status === 'pending').map(r => (
                  <div key={r.id} style={{ border: '2px solid #fbbf24', borderRadius: 10, padding: 12, background: '#fffbeb' }}>
                    <div style={{ fontWeight: 700 }}>{r.restaurant_name || r.restaurant_id}</div>
                    <div style={{ fontSize: 13, color: '#475569' }}>
                      {fmtMoney(r.amount, r.currency)} · {r.billing_cycle || 'month'} · Txn: {r.transaction_id || '—'}
                      <br />
                      Method: {r.method || '—'} · {fmtDate(r.payment_date || r.created_at)}
                    </div>
                    {r.proof_url && (
                      <a href={r.proof_url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>View proof</a>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button type="button" style={btnPrimary()} disabled={loading} onClick={() => act('Payment approved — plan renewed', async () => {
                        await rpc('admin_review_payment_request', {
                          p_request_id: r.id,
                          p_action: 'approve',
                          p_admin_note: 'Approved',
                        })
                      })}>Approve Payment</button>
                      <button type="button" style={btnSecondary()} disabled={loading} onClick={() => confirm('Reject this payment request?', () => act('Payment rejected', async () => {
                        await rpc('admin_review_payment_request', {
                          p_request_id: r.id,
                          p_action: 'reject',
                          p_admin_note: 'Rejected',
                        })
                      }))}>Reject</button>
                    </div>
                  </div>
                ))}
                {paymentRequests.filter(r => r.status === 'pending').length === 0 && (
                  <div style={{ color: '#64748b', fontSize: 13 }}>No pending requests.</div>
                )}
              </div>
              {paymentRequests.filter(r => r.status !== 'pending').length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Recent reviewed</h4>
                  {paymentRequests.filter(r => r.status !== 'pending').slice(0, 12).map(r => (
                    <div key={r.id} style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px solid #e2e8f0' }}>
                      <strong>{r.restaurant_name || r.restaurant_id}</strong> · {fmtMoney(r.amount, r.currency)} ·{' '}
                      <span style={{ color: r.status === 'approved' ? '#15803d' : '#b91c1c', fontWeight: 700 }}>{r.status}</span>
                      {' · '}{fmtDate(r.reviewed_at || r.created_at)}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Manual record (existing) */}
            <div style={{ ...card(), marginBottom: 14 }}>
              <h3 style={{ marginTop: 0 }}>Record payment (manual)</h3>
              <div style={{ display: 'grid', gap: 8 }}>
                <select value={payRestaurant} onChange={e => setPayRestaurant(e.target.value)} style={inp()}>
                  <option value="">Select restaurant</option>
                  {restaurants.map(r => <option key={r.restaurant_id} value={r.restaurant_id}>{r.restaurant_name}</option>)}
                </select>
                <input placeholder="Amount" value={payAmount} onChange={e => setPayAmount(e.target.value)} style={inp()} />
                <input placeholder="Method (bank/cash/…)" value={payMethod} onChange={e => setPayMethod(e.target.value)} style={inp()} />
                <input placeholder="Reference / txn id" value={payRef} onChange={e => setPayRef(e.target.value)} style={inp()} />
                <input placeholder="Admin note" value={payNote} onChange={e => setPayNote(e.target.value)} style={inp()} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="number" value={payDays} onChange={e => setPayDays(Number(e.target.value) || 30)} style={inp()} />
                  <select value={payCycle} onChange={e => setPayCycle(e.target.value)} style={inp()}>
                    <option value="month">Month</option>
                    <option value="six_months">6 Months</option>
                    <option value="year">Year</option>
                  </select>
                </div>
                <button type="button" disabled={loading} onClick={() => act('Payment recorded', async () => {
                  await rpc('admin_record_payment', {
                    p_restaurant_id: payRestaurant,
                    p_amount: Number(payAmount) || 0,
                    p_method: payMethod || null,
                    p_reference: payRef || null,
                    p_admin_note: payNote || null,
                    p_days: payDays,
                    p_billing_cycle: payCycle,
                  })
                  setPayAmount(''); setPayMethod(''); setPayRef(''); setPayNote('')
                })} style={btnPrimary()}>Save payment + extend plan</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {payments.map(p => (
                <div key={p.id} style={card()}>
                  <div style={{ fontWeight: 700 }}>{p.restaurant_id}</div>
                  <div style={{ fontSize: 13, color: '#475569' }}>
                    {fmtMoney(p.amount, p.currency)} · {fmtDate(p.payment_date)} · {p.method || '—'} · {p.reference_note || ''}
                  </div>
                </div>
              ))}
              {payments.length === 0 && <div style={{ color: '#64748b' }}>No payments yet.</div>}
            </div>
          </div>
        )}

        {/* REPORTS */}
        {tab === 'reports' && (
          <div style={card()}>
            <h2 style={{ marginTop: 0 }}>Reports</h2>
            <p style={{ fontSize: 13, color: '#64748b' }}>Sensitive credentials (PIN, admin key, QR secrets) reports mein nahi aate.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" onClick={() => exportCsv(restaurants, 'all-restaurants.csv')} style={btnSecondary()}>CSV all</button>
              <button type="button" onClick={() => exportCsv(restaurants.filter(r => r.plan_status === 'trial'), 'trial.csv')} style={btnSecondary()}>CSV trial</button>
              <button type="button" onClick={() => exportCsv(restaurants.filter(r => r.plan_status === 'overdue'), 'overdue.csv')} style={btnSecondary()}>CSV overdue</button>
              <button type="button" onClick={() => exportCsv(restaurants.filter(r => r.plan_status === 'sold_out'), 'sold-out.csv')} style={btnSecondary()}>CSV sold out</button>
              <button type="button" onClick={pdfList} style={btnPrimary()}>PDF list</button>
            </div>
          </div>
        )}

        {/* AUDIT */}
        {tab === 'audit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {audit.map(a => (
              <div key={a.id} style={card()}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.action_type}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  {fmtDate(a.created_at)} · {a.restaurant_id || '—'} · {a.result}
                </div>
              </div>
            ))}
            {audit.length === 0 && <div style={{ color: '#64748b' }}>No audit entries yet.</div>}
          </div>
        )}

        {/* SETTINGS */}
        {tab === 'settings' && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={card()}>
              <h3 style={{ marginTop: 0 }}>Business settings</h3>
              <SettingsForm settings={settings} onSave={(obj) => act('Settings saved', () => rpc('admin_update_settings', { p_settings: obj }))} />
            </div>
            <div style={card()}>
              <h3 style={{ marginTop: 0 }}>Change Admin Key</h3>
              <p style={{ fontSize: 12, color: '#64748b' }}>Old + new key required. Min 12 characters.</p>
              <input type="password" placeholder="Current key" value={oldKey} onChange={e => setOldKey(e.target.value)} style={inp()} />
              <input type="password" placeholder="New key" value={newKey} onChange={e => setNewKey(e.target.value)} style={{ ...inp(), marginTop: 8 }} />
              <button type="button" style={{ ...btnPrimary(), marginTop: 8 }} onClick={() => act('Admin key changed', async () => {
                await rpc('admin_change_key', { p_old_key: oldKey, p_new_key: newKey })
                sessionStorage.setItem(SESSION_KEY, newKey.trim())
                setAdminKey(newKey.trim())
                setOldKey(''); setNewKey('')
              })}>Update key</button>
            </div>
          </div>
        )}
      </main>

      {confirmText && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', display: 'grid', placeItems: 'center', padding: 16, zIndex: 50 }}>
          <div style={{ ...card(), maxWidth: 360 }}>
            <div style={{ fontWeight: 700, marginBottom: 10 }}>{confirmText.text}</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setConfirmText(null)} style={btnSecondary()}>Cancel</button>
              <button type="button" onClick={() => { const fn = confirmText.onYes; setConfirmText(null); fn && fn() }} style={{ ...btnPrimary(), background: '#b91c1c' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function inp() {
  return { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }
}
function btnPrimary() {
  return { border: 'none', borderRadius: 10, padding: '10px 14px', background: '#0f172a', color: '#fff', fontWeight: 700, cursor: 'pointer' }
}
function btnSecondary() {
  return { border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px', background: '#fff', fontWeight: 600, cursor: 'pointer' }
}

function ResetPinForm({ onSubmit }) {
  const [pin, setPin] = useState('')
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <input value={pin} onChange={e => setPin(e.target.value)} placeholder="New PIN" style={{ ...inp(), maxWidth: 160 }} />
      <button type="button" onClick={() => { onSubmit(pin); setPin('') }} style={btnSecondary()}>Reset PIN</button>
    </div>
  )
}

function NotesForm({ initial, onSave }) {
  const [v, setV] = useState(initial)
  useEffect(() => setV(initial), [initial])
  return (
    <div>
      <textarea value={v} onChange={e => setV(e.target.value)} style={{ ...inp(), minHeight: 70 }} />
      <button type="button" onClick={() => onSave(v)} style={{ ...btnSecondary(), marginTop: 8 }}>Save notes</button>
    </div>
  )
}

function SettingsForm({ settings, onSave }) {
  const [s, setS] = useState({
    company_name: settings.company_name || '',
    support_contact: settings.support_contact || '',
    default_trial_days: settings.default_trial_days || '30',
    default_grace_days: settings.default_grace_days || '10',
    default_monthly_price: settings.default_monthly_price || '5000',
    default_six_month_price: settings.default_six_month_price || '30000',
    default_yearly_price: settings.default_yearly_price || '60000',
    currency: settings.currency || 'PKR',
  })
  useEffect(() => {
    setS({
      company_name: settings.company_name || '',
      support_contact: settings.support_contact || '',
      default_trial_days: settings.default_trial_days || '30',
      default_grace_days: settings.default_grace_days || '10',
      default_monthly_price: settings.default_monthly_price || '5000',
      default_six_month_price: settings.default_six_month_price || '30000',
      default_yearly_price: settings.default_yearly_price || '60000',
      currency: settings.currency || 'PKR',
    })
  }, [settings])
  const field = (k, label) => (
    <label key={k} style={{ display: 'block', marginBottom: 8, fontSize: 13 }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <input value={s[k]} onChange={e => setS({ ...s, [k]: e.target.value })} style={{ ...inp(), marginTop: 4 }} />
    </label>
  )
  return (
    <div>
      {field('company_name', 'Company name')}
      {field('support_contact', 'Support contact')}
      {field('currency', 'Currency')}
      {field('default_trial_days', 'Default trial days')}
      {field('default_grace_days', 'Default grace days')}
      {field('default_monthly_price', 'Default monthly price')}
      {field('default_six_month_price', 'Default 6-month price')}
      {field('default_yearly_price', 'Default yearly price')}
      <button type="button" onClick={() => onSave(s)} style={btnPrimary()}>Save settings</button>
    </div>
  )
}
