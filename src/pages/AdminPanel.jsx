import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { jsPDF } from 'jspdf'
import { supabase } from '../supabaseClient.js'
import { ensureAnonymousAuth } from '../utils/auth.js'
import { Button, Input, Select, Textarea, Card, Badge, Modal, Skeleton, EmptyState, PlanBadge } from '../components/ui/index.js'
import CountUp from '../components/dashboard/CountUp.jsx'
import AdminNav from '../components/admin/AdminNav.jsx'
import { AdminToast, SuccessCheck, Switch, Collapsible, StepBar, PageHead } from '../components/admin/AdminUi.jsx'
import '../styles/admin.css'

const SESSION_KEY = 'tableorder:adminKey'
const LAST_ACTIVE_KEY = 'tableorder:adminActive'
const IDLE_MS = 45 * 60 * 1000 // 45 min inactivity

const EASE = [0.16, 1, 0.3, 1]
const WIZARD_LABELS = ['Details', 'Plan', 'Activation', 'Confirm']
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
// Stat cell: skeleton until the first load finishes, then a count-up.
function numberCell(loaded, val) {
  if (!loaded) return <Skeleton width={56} height={22} />
  if (val === null || val === undefined) return '—'
  return <CountUp value={Number(val)} />
}

// Turns "function not found / schema cache" errors into an actionable hint
// instead of a raw database message.
function friendlyBranchError(e, fallback) {
  const m = e?.message || ''
  if (/schema cache|could not find the function|does not exist/i.test(m)) {
    return 'Branch database functions are missing. Run supabase/FIX_BRANCHES_AND_CASTING.sql in the Supabase SQL Editor, then refresh.'
  }
  return m || fallback
}

function BranchRequestsPanel({ adminKey }) {
  const [confirmReject, setConfirmReject] = useState(null)
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('pending')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    setMsg(null)
    try {
      await ensureAnonymousAuth()
      const { data, error } = await supabase.rpc('admin_list_branch_requests', {
        p_admin_key: adminKey,
        p_status: filter,
      })
      if (error) throw error
      setRows(Array.isArray(data) ? data : [])
    } catch (e) {
      setMsg(friendlyBranchError(e, 'Load failed'))
      setRows([])
    } finally {
      setBusy(false)
    }
  }, [adminKey, filter])

  useEffect(() => { load() }, [load])

  const review = async (id, action) => {
    setBusy(true)
    setMsg(null)
    try {
      const { data, error } = await supabase.rpc('admin_review_branch_request', {
        p_admin_key: adminKey,
        p_request_id: id,
        p_action: action,
        p_admin_note: '',
      })
      if (error) throw error
      setMsg(action === 'approve' ? 'Branch approved' : 'Request rejected')
      await load()
    } catch (e) {
      setMsg(friendlyBranchError(e, 'Action failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="adm-stack">
      <PageHead
        title="Branch requests"
        subtitle="Counter staff ki branch requests yahan review hoti hain. Approve karne par branch active ho jati hai."
      />
      <div className="adm-btn-row" role="group" aria-label="Filter requests by status">
        {['pending', 'approved', 'rejected', ''].map(f => (
          <Button
            key={f || 'all'}
            size="sm"
            variant={filter === f ? 'primary' : 'secondary'}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f || 'all'}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={load} disabled={busy}>Refresh</Button>
      </div>
      {msg && <div role="status" className="adm-card-lead" style={{ margin: 0 }}>{msg}</div>}
      {busy && rows.length === 0 && (
        <div className="adm-stack">
          {[0, 1].map(i => (
            <Card key={i}>
              <Skeleton width="45%" height={18} />
              <div style={{ height: 8 }} />
              <Skeleton width="70%" height={12} />
            </Card>
          ))}
        </div>
      )}
      {!busy && rows.length === 0 && (
        <EmptyState
          icon="📍"
          title="No branch requests"
          description={filter === 'pending' ? 'Naya request aane par yahan dikhegi.' : 'Is filter mein koi request nahi.'}
        />
      )}
      {rows.map((r, i) => (
        <motion.div
          key={r.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: Math.min(i, 10) * 0.04, duration: 0.3, ease: EASE }}
        >
          <Card>
            <div className="adm-row__head">
              <div>
                <div className="adm-row__name">{r.restaurant_name || r.restaurant_id}</div>
                <div className="adm-row__id">{r.restaurant_id}</div>
              </div>
              <Badge variant={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'error' : 'warning'}>
                {r.status}
              </Badge>
            </div>
            <div className="adm-row__meta" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
              <span><b>{r.branch_name}</b> · {r.area || '—'} · {r.address || '—'}</span>
              {r.phone && <span>Phone: {r.phone}</span>}
              <span>Requested: {r.requested_at ? new Date(r.requested_at).toLocaleString() : '—'}</span>
            </div>
            {r.status === 'pending' && (
              <div className="adm-row__actions">
                <Button size="sm" variant="success" disabled={busy} onClick={() => review(r.id, 'approve')}>
                  Approve
                </Button>
                {confirmReject === r.id ? (
                  <>
                    <Button size="sm" variant="danger" disabled={busy} onClick={() => { setConfirmReject(null); review(r.id, 'reject') }}>
                      Confirm reject
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setConfirmReject(null)}>Cancel</Button>
                  </>
                ) : (
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmReject(r.id)}>
                    Reject
                  </Button>
                )}
              </div>
            )}
          </Card>
        </motion.div>
      ))}
    </div>
  )
}

// Turns raw database errors into clear Roman Urdu messages for the admin.
function friendlyAdminError(err) {
  const raw = String(err?.message || err?.details || err || '')
  if (/does not exist|Could not find the function/i.test(raw)) {
    return 'Database update abhi run nahi hua. Supabase mein PHASE9 / PHASE12 SQL chalayein.'
  }
  const map = [
    ['ADMIN_UNAUTHORIZED', 'Admin key ghalat hai.'],
    ['ADMIN_NOT_CONFIGURED', 'Admin key database mein set nahi hai.'],
    ['RESTAURANT_EXISTS', 'Ye restaurant pehle se maujood hai. "Restaurant check" se dekhein.'],
    ['INVALID_NAME', 'Restaurant ka naam kam az kam 2 harf ka ho (harf ya numbers).'],
    ['INVALID_PIN', 'PIN 4 se 32 characters ka ho.'],
    ['FIELD_TOO_LONG', 'Kisi field ki length zyada hai (contact, address ya city).'],
    ['ACTIVATION_CODE_NOT_FOUND', 'Activation code database mein nahi mila.'],
    ['ACTIVATION_CODE_UNAVAILABLE', 'Ye activation code pehle use ho chuka hai ya revoke hai.'],
    ['ACTIVATION_CODE_ASSIGNED', 'Ye code kisi aur restaurant ko assign ho chuka hai.'],
    ['RESTAURANT_NOT_FOUND', 'Restaurant nahi mila. Naam dobara check karein.'],
    ['ALREADY_ACTIVATED', 'Ye restaurant pehle hi activate ho chuka hai, naya code nahi banega.'],
  ]
  for (const [key, text] of map) if (raw.includes(key)) return text
  return raw || 'Kuch masla hua. Dobara try karein.'
}

export default function AdminPanel() {
  // presentation-only state (wizard position and slide direction)
  const [wizStep, setWizStep] = useState(0)
  const [checkName, setCheckName] = useState('')
  const [checkResult, setCheckResult] = useState(null)
  const [wizDir, setWizDir] = useState(1)

  const [keyInput, setKeyInput] = useState('')
  const [adminKey, setAdminKey] = useState('')
  const [auth, setAuth] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState('dashboard')

  const [stats, setStats] = useState(null)
  const [restaurants, setRestaurants] = useState([])
  const [branchReqs, setBranchReqs] = useState([])
  const [branchFilter, setBranchFilter] = useState('pending')
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
  const [addContactName, setAddContactName] = useState('')
  const [addContactPhone, setAddContactPhone] = useState('')
  const [addContactEmail, setAddContactEmail] = useState('')
  const [addCity, setAddCity] = useState('')
  const [addAddress, setAddAddress] = useState('')
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
      setMsg(friendlyAdminError(err))
    } finally {
      setLoading(false)
    }
  }

  const confirm = (text, onYes) => setConfirmText({ text, onYes })

  const [delConfirm, setDelConfirm] = useState('')
  const [branches, setBranches] = useState([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [branchErr, setBranchErr] = useState('')
  const [branchForm, setBranchForm] = useState(null)

  const loadBranches = async (rid) => {
    if (!rid) return
    setBranchesLoading(true); setBranchErr('')
    try {
      const d = await rpc('admin_list_branches', { p_restaurant_id: rid })
      setBranches(Array.isArray(d) ? d : [])
    } catch (err) {
      setBranchErr(err?.message || 'Branches load nahi hui.')
    } finally { setBranchesLoading(false) }
  }

  useEffect(() => {
    setBranchForm(null); setDelConfirm(''); setBranches([]); setBranchErr('')
    if (selected?.restaurant_id) loadBranches(selected.restaurant_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.restaurant_id])

  const saveBranch = () => {
    if (!branchForm || !selected) return
    const f = branchForm
    act(f.id ? 'Branch updated' : 'Branch added', async () => {
      await rpc('admin_upsert_branch', {
        p_restaurant_id: selected.restaurant_id,
        p_branch_id: f.id || null,
        p_branch_name: f.branch_name.trim(),
        p_area: f.area.trim() || null,
        p_address: f.address.trim() || null,
        p_phone: f.phone.trim() || null,
        p_is_default: f.is_default,
        p_is_active: f.is_active,
      })
      setBranchForm(null)
      await loadBranches(selected.restaurant_id)
    })
  }

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
      <div className="adm-login">
        <motion.form
          onSubmit={login}
          className="adm-login__card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
        >
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
            style={{
              width: 44, height: 44, borderRadius: 12, marginBottom: 12,
              display: 'grid', placeItems: 'center', fontWeight: 700,
              background: 'var(--color-primary, #b87d1f)', color: 'var(--adm-on-primary)',
            }}
          >T</motion.div>
          <div className="adm-login__eyebrow">TABLE ORDER</div>
          <h1 className="adm-login__title">Admin Control Center</h1>
          <p className="adm-login__lead">Restaurant PIN se alag — sirf Admin Security Key.</p>
          {msg && (
            <div role="alert" style={{
              background: 'var(--color-error-subtle, #f8e1da)', color: 'var(--color-error, #b6472f)',
              padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13,
            }}>{msg}</div>
          )}
          <Input
            label="Admin Security Key"
            type="password"
            value={keyInput}
            onChange={e => setKeyInput(e.target.value)}
            autoComplete="current-password"
          />
          <div style={{ marginTop: 16 }}>
            <Button type="submit" size="lg" block loading={loading}>
              {loading ? 'Verifying…' : 'Unlock'}
            </Button>
          </div>
        </motion.form>
      </div>
    )
  }

  // ---------- SECTION HELPERS (presentation only) ----------
  const dataReady = stats !== null
  const go = (id) => { setTab(id); setSelected(null); touch() }
  const name = selected?.restaurant_name || selected?.restaurant_id || ''

  const renderDashboard = () => (
    <>
      <PageHead title="Dashboard" subtitle="Platform summary across all restaurants" />
      <div className="adm-stat-grid">
        {[
          ['Total', stats?.total], ['Active', stats?.active], ['Trial', stats?.trial], ['Monthly', stats?.monthly],
          ['Yearly', stats?.yearly], ['Complimentary', stats?.complimentary], ['Due soon', stats?.due_soon],
          ['Overdue', stats?.overdue], ['Suspended', stats?.suspended], ['Sold out', stats?.sold_out],
          ['Recent 7d', stats?.recent_7d],
        ].map(([label, val], i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 10) * 0.035, duration: 0.3, ease: EASE }}
          >
            <Card className="adm-stat">
              <div className="adm-stat__label">{label}</div>
              <div className="adm-stat__value">{numberCell(dataReady, val)}</div>
            </Card>
          </motion.div>
        ))}
      </div>
      <Card>
        <h2 className="adm-card-title">Alerts</h2>
        {alerts.length === 0 ? (
          <EmptyState icon="✓" title="All clear" description="No trial, overdue or suspended alerts right now." />
        ) : (
          <ul className="adm-stack" style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {alerts.map((a, i) => <li key={i}>{a.text}</li>)}
          </ul>
        )}
      </Card>
    </>
  )

  const renderRestaurants = () => (
    <>
      <PageHead
        title="Restaurants"
        subtitle={`${restaurants.length} total · ${filtered.length} shown`}
        actions={<>
          <Button variant="secondary" size="sm" onClick={() => exportCsv(filtered, 'restaurants.csv')}>CSV</Button>
          <Button variant="primary" size="sm" onClick={pdfList}>PDF</Button>
        </>}
      />
      <div className="adm-filters">
        <Input
          className="adm-filters__search"
          type="search"
          aria-label="Search name or ID"
          placeholder="Search name or ID"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <Select className="adm-filters__select" aria-label="Filter by status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All status</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select className="adm-filters__select" aria-label="Filter by billing cycle" value={filterPlan} onChange={e => setFilterPlan(e.target.value)}>
          <option value="all">All cycles</option>
          <option value="month">Monthly</option>
          <option value="six_months">6 Months</option>
          <option value="year">Yearly</option>
        </Select>
      </div>

      {!dataReady ? (
        <div className="adm-stack">
          {[0, 1, 2].map(i => (
            <Card key={i}>
              <Skeleton width="40%" height={18} />
              <div style={{ height: 10 }} />
              <Skeleton width="65%" height={12} />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="🏪"
          title={restaurants.length === 0 ? 'No restaurants yet' : 'No matches'}
          description={restaurants.length === 0
            ? 'Add your first restaurant to get started.'
            : 'Try a different search or clear the filters.'}
          action={restaurants.length === 0
            ? <Button onClick={() => go('add')}>Add restaurant</Button>
            : <Button variant="secondary" onClick={() => { setQ(''); setFilterStatus('all'); setFilterPlan('all') }}>Clear filters</Button>}
        />
      ) : (
        <div className="adm-stack">
          {filtered.map((r, i) => {
            const label = r.restaurant_name || r.restaurant_id
            return (
              <motion.div
                key={r.restaurant_id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.04, duration: 0.3, ease: EASE }}
              >
                <Card className="adm-row" onClick={() => setSelected(r)}>
                  <div className="adm-row__head">
                    <div>
                      <div className="adm-row__name">{label}</div>
                      <div className="adm-row__id">{r.restaurant_id}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {r.archived_at && <Badge variant="neutral">Archived</Badge>}
                      <PlanBadge status={r.plan_status} />
                    </div>
                  </div>
                  <div className="adm-row__meta">
                    <span>Cycle: {r.billing_cycle || 'month'}</span>
                    <span>Joined: {fmtDate(r.activated_at)}</span>
                    <span>Due: {fmtDate(r.paid_until || r.trial_ends_at)}</span>
                    <span>Grace: {fmtDate(r.grace_ends_at)}</span>
                    <span>Orders: {r.order_count ?? 0}</span>
                    <span>Rev: {fmtMoney(r.lifetime_revenue, settings.currency || 'PKR')}</span>
                  </div>
                  <div className="adm-row__actions">
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Edit ${label}`}
                      onClick={e => { e.stopPropagation(); setSelected(r) }}
                    >Edit</Button>
                    {r.plan_status !== 'suspended' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={loading}
                        aria-label={`Suspend ${label}`}
                        onClick={e => {
                          e.stopPropagation()
                          confirm(`${label} ko suspend karein?`, () => act('Suspended', () => rpc('admin_update_plan', { p_restaurant_id: r.restaurant_id, p_action: 'suspend' })))
                        }}
                      >Suspend</Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={loading}
                      aria-label={`${r.archived_at ? 'Restore' : 'Archive'} ${label}`}
                      onClick={e => {
                        e.stopPropagation()
                        const restore = !!r.archived_at
                        confirm(
                          restore ? `${label} ko restore karein?` : `${label} archive karein? Data safe rahega, ordering band ho jayegi.`,
                          () => act(restore ? 'Restored' : 'Archived', () => rpc(restore ? 'admin_restore_restaurant' : 'admin_archive_restaurant', { p_restaurant_id: r.restaurant_id })),
                        )
                      }}
                    >{r.archived_at ? 'Restore' : 'Archive'}</Button>
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}
    </>
  )

  const renderDetail = () => {
    const planActions = [
      ['Extend trial 30d', () => act('Trial extended', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'extend_trial', p_days: 30 }))],
      ['Mark paid (month)', () => act('Marked paid', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'mark_paid', p_days: 30, p_billing_cycle: 'month' }))],
      ['Mark paid (6 months)', () => act('Marked paid for 6 months', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'mark_paid', p_days: 180, p_billing_cycle: 'six_months' }))],
      ['Mark paid (year)', () => act('Marked paid yearly', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'mark_paid', p_days: 365, p_billing_cycle: 'year' }))],
      ['Complimentary', () => act('Complimentary', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'complimentary' }))],
      ['Reactivate', () => act('Reactivated', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'reactivate', p_days: 30 }))],
    ]
    const dangerActions = [
      ['Suspend', () => confirm('Suspend this restaurant?', () => act('Suspended', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'suspend' })))],
      ['Sold out', () => confirm('Mark sold out? Data keep rahega.', () => act('Sold out', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'sold_out' })))],
      selected.archived_at
        ? ['Restore', () => confirm('Restore this restaurant?', () => act('Restored', () => rpc('admin_restore_restaurant', { p_restaurant_id: selected.restaurant_id })))]
        : ['Archive (soft)', () => confirm('Archive restaurant? Data safe rahega, ordering band ho jayegi.', () => act('Archived', () => rpc('admin_archive_restaurant', { p_restaurant_id: selected.restaurant_id })))],
    ]
    return (
      <>
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>← Back to restaurants</Button>
        <Card>
          <div className="adm-row__head">
            <div>
              <h2 className="adm-page-head__title" style={{ fontSize: 'var(--text-md, 18px)' }}>{selected.restaurant_name}</h2>
              <div className="adm-row__id">{selected.restaurant_id}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {selected.archived_at && <Badge variant="neutral">Archived</Badge>}
              <PlanBadge status={selected.plan_status} />
            </div>
          </div>
          <div className="adm-metrics">
            {[
              ['Joined', fmtDate(selected.activated_at)],
              ['Trial end', fmtDate(selected.trial_ends_at)],
              ['Paid until', fmtDate(selected.paid_until)],
              ['Grace', fmtDate(selected.grace_ends_at)],
              ['Orders', selected.order_count ?? 0],
              ['Revenue', fmtMoney(selected.lifetime_revenue, settings.currency || 'PKR')],
              ['Last activity', fmtDate(selected.last_activity)],
            ].map(([l, v]) => (
              <div key={l} className="adm-metric">{l}<b>{v}</b></div>
            ))}
          </div>
          {selected.notes && (
            <div className="adm-card-lead" style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'var(--color-bg-subtle, #f3eee2)' }}>
              Notes: {selected.notes}
            </div>
          )}

          <div className="adm-group">
            <p className="adm-group__label">Plan</p>
            <div className="adm-btn-row">
              {planActions.map(([label, fn]) => (
                <Button key={label} size="sm" variant="secondary" disabled={loading} onClick={fn}>{label}</Button>
              ))}
            </div>
          </div>

          <div className="adm-group">
            <p className="adm-group__label">Status &amp; removal</p>
            <div className="adm-btn-row">
              {dangerActions.map(([label, fn]) => (
                <Button
                  key={label}
                  size="sm"
                  variant="ghost"
                  disabled={loading}
                  onClick={fn}
                >{label}</Button>
              ))}
              <Button size="sm" variant="ghost" onClick={() => pdfDetail(selected)}>PDF</Button>
            </div>
          </div>

          <div className="adm-group">
            <p className="adm-group__label">Delete permanently</p>
            <p className="adm-card-lead" style={{ margin: '0 0 8px' }}>
              Ye restaurant aur uska sara data hamesha ke liye hata dega. Confirm karne ke liye restaurant ID type karein: <code>{selected.restaurant_id}</code>
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                <Input
                  label="Restaurant ID"
                  autoComplete="off"
                  value={delConfirm}
                  onChange={e => setDelConfirm(e.target.value)}
                />
              </div>
              <Button
                variant="danger"
                disabled={loading || delConfirm.trim().toLowerCase() !== selected.restaurant_id}
                onClick={() => act('Deleted permanently', async () => {
                  await rpc('admin_permanent_delete_restaurant', { p_restaurant_id: selected.restaurant_id, p_confirm_id: delConfirm.trim() })
                  setSelected(null)
                })}
              >Delete Permanently</Button>
            </div>
          </div>

          <div className="adm-group">
            <p className="adm-group__label">Branches</p>
            {branchErr && <div className="adm-card-lead" role="alert" style={{ color: 'var(--color-error, #b6472f)' }}>{branchErr}</div>}
            {branchesLoading ? (
              <Skeleton height={44} />
            ) : branches.length === 0 ? (
              <p className="adm-card-lead" style={{ margin: 0 }}>Abhi koi branch nahi.</p>
            ) : (
              <div className="adm-stack">
                {branches.map(b => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>
                      <b>{b.branch_name}</b> · {b.area || '—'}
                      {b.is_default ? ' · Default' : ''}
                      {b.is_active === false ? ' · Inactive' : ''}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={loading}
                      aria-label={`Edit branch ${b.branch_name}`}
                      onClick={() => setBranchForm({
                        id: b.id,
                        branch_name: b.branch_name || '',
                        area: b.area || '',
                        address: b.address || '',
                        phone: b.phone || '',
                        is_default: !!b.is_default,
                        is_active: b.is_active !== false,
                      })}
                    >Edit</Button>
                  </div>
                ))}
              </div>
            )}

            {branchForm ? (
              <form
                className="adm-stack"
                style={{ marginTop: 12 }}
                onSubmit={e => { e.preventDefault(); if (branchForm.branch_name.trim().length >= 2) saveBranch() }}
              >
                <Input label="Branch name *" value={branchForm.branch_name} onChange={e => setBranchForm(f => ({ ...f, branch_name: e.target.value }))} />
                <Input label="Area" value={branchForm.area} onChange={e => setBranchForm(f => ({ ...f, area: e.target.value }))} />
                <Input label="Address" value={branchForm.address} onChange={e => setBranchForm(f => ({ ...f, address: e.target.value }))} />
                <Input label="Phone" inputMode="tel" value={branchForm.phone} onChange={e => setBranchForm(f => ({ ...f, phone: e.target.value }))} />
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={branchForm.is_default} onChange={e => setBranchForm(f => ({ ...f, is_default: e.target.checked }))} />
                  Default branch
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={branchForm.is_active} onChange={e => setBranchForm(f => ({ ...f, is_active: e.target.checked }))} />
                  Active
                </label>
                <div className="adm-btn-row">
                  <Button type="submit" size="sm" disabled={loading || branchForm.branch_name.trim().length < 2}>
                    {branchForm.id ? 'Save branch' : 'Add branch'}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setBranchForm(null)}>Cancel</Button>
                </div>
              </form>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                style={{ marginTop: 12 }}
                disabled={loading}
                onClick={() => setBranchForm({ id: null, branch_name: '', area: '', address: '', phone: '', is_default: false, is_active: true })}
              >Add branch</Button>
            )}
          </div>

          <div className="adm-group">
            <p className="adm-group__label">Reset staff PIN</p>
            <ResetPinForm onSubmit={(pin) => act('PIN reset', () => rpc('admin_reset_pin', { p_restaurant_id: selected.restaurant_id, p_new_pin: pin }))} />
          </div>

          <div className="adm-group">
            <p className="adm-group__label">Admin notes</p>
            <NotesForm initial={selected.notes || ''} onSave={(notes) => act('Notes saved', () => rpc('admin_update_plan', { p_restaurant_id: selected.restaurant_id, p_action: 'set_notes', p_notes: notes }))} />
          </div>
        </Card>
      </>
    )
  }

  const canCreate = !!(addName.trim() && addPin.trim())

  const createRestaurant = () => act('Restaurant created', async () => {
    const data = await rpc('admin_create_restaurant', {
      p_restaurant_name: addName.trim(),
      p_pin: addPin.trim(),
      p_plan_status: addStatus,
      p_days: addDays,
      p_billing_cycle: addCycle,
      p_notes: addNotes || null,
      p_activation_code: '',
      p_contact_name: addContactName.trim() || null,
      p_contact_phone: addContactPhone.trim() || null,
      p_contact_email: addContactEmail.trim() || null,
      p_address: addAddress.trim() || null,
      p_city: addCity.trim() || null,
    })
    setLastCreated(data || null)
    setAddName(''); setAddPin(''); setAddNotes('')
    setAddContactName(''); setAddContactPhone(''); setAddContactEmail(''); setAddCity(''); setAddAddress('')
  })

  const renderAdd = () => (
    <div className="adm-two-col">
      <Card>
        <h2 className="adm-card-title">Naya restaurant add karein</h2>
        {lastCreated ? (
          <div className="adm-success" role="status">
            <SuccessCheck size={56} />
            <div style={{ fontWeight: 700, fontSize: 'var(--text-md, 18px)' }}>Restaurant ban gaya</div>
            <dl className="adm-summary" style={{ width: '100%' }}>
              <div><dt>Name</dt><dd>{lastCreated.restaurant_name || '—'}</dd></div>
              <div><dt>ID</dt><dd>{lastCreated.restaurant_id || '—'}</dd></div>
              <div><dt>Activation code</dt><dd><code>{lastCreated.activation_code || '—'}</code></dd></div>
            </dl>
            <p className="adm-card-lead" style={{ margin: 0 }}>
              Counter pe pehli dafa login: Restaurant Name + PIN + ye Activation Code. Code use hone ke baad dubara zaroori nahi.
            </p>
            <Button variant="secondary" onClick={() => { try { navigator.clipboard?.writeText(lastCreated.activation_code || '') } catch {} }}>Code copy karein</Button>
            <Button onClick={() => setLastCreated(null)}>Aur restaurant add karein</Button>
          </div>
        ) : (
          <div className="adm-step-body">
            <Input
              label="Restaurant name *"
              placeholder="e.g. Karachi Kitchen"
              value={addName}
              onChange={e => setAddName(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <Input
                  label="Initial PIN (4–6 digits) *"
                  inputMode="numeric"
                  value={addPin}
                  onChange={e => setAddPin(e.target.value)}
                  hint="PIN secure hash ke sath store hota hai."
                />
              </div>
              <Button variant="secondary" onClick={() => setAddPin(String(Math.floor(100000 + Math.random() * 900000)))}>
                Generate PIN
              </Button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <Select label="Plan" value={addStatus} onChange={e => setAddStatus(e.target.value)}>
                  <option value="trial">Trial</option>
                  <option value="active">Active (paid)</option>
                  <option value="complimentary">Complimentary</option>
                </Select>
              </div>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <Select label="Billing cycle" value={addCycle} onChange={e => setAddCycle(e.target.value)}>
                  <option value="month">Monthly</option>
                  <option value="six_months">6 Months</option>
                  <option value="year">Yearly</option>
                </Select>
              </div>
            </div>
            <Input
              type="number"
              min={1}
              label="Trial / paid days"
              value={addDays}
              onChange={e => setAddDays(Number(e.target.value) || 30)}
            />
            <Input label="Contact person" value={addContactName} onChange={e => setAddContactName(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <Input label="Contact phone" inputMode="tel" value={addContactPhone} onChange={e => setAddContactPhone(e.target.value)} />
              </div>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <Input label="Contact email" type="email" value={addContactEmail} onChange={e => setAddContactEmail(e.target.value)} />
              </div>
            </div>
            <Input label="City" value={addCity} onChange={e => setAddCity(e.target.value)} />
            <Textarea label="Address" value={addAddress} onChange={e => setAddAddress(e.target.value)} />
            <Textarea label="Admin notes (optional)" value={addNotes} onChange={e => setAddNotes(e.target.value)} />
            <p className="adm-card-lead" style={{ margin: 0 }}>
              Activation code khud generate hoga. Create ke baad code screen par dikhega.
            </p>
            <Button block size="lg" disabled={loading || !canCreate} onClick={createRestaurant}>
              Restaurant banao
            </Button>
          </div>
        )}
      </Card>

      <Card className="adm-workflow">
        <h3 className="adm-card-title">Kaise kaam karta hai</h3>
        <ol>
          <li>Restaurant ka naam aur PIN bharein</li>
          <li>"Restaurant banao" dabayein</li>
          <li>Jo activation code dikhe wo restaurant ko dein</li>
          <li>Counter login: Name + PIN + Activation Code (pehli dafa)</li>
        </ol>
        <Button variant="secondary" onClick={() => go('codes')}>Activation Codes dekhein</Button>
      </Card>

      <Card>
        <h3 className="adm-card-title">Restaurant check</h3>
        <p className="adm-card-lead" style={{ margin: 0 }}>
          Naam likhein. System batayega restaurant hai ya nahi, aur uska activation code kya hai.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 180px', minWidth: 0 }}>
            <Input label="Restaurant name" value={checkName} onChange={e => setCheckName(e.target.value)} />
          </div>
          <Button variant="secondary" disabled={loading || !checkName.trim()} onClick={() => act('Check complete', async () => {
            const data = await rpc('admin_find_restaurant', { p_name: checkName.trim() })
            setCheckResult(data || null)
          })}>Check</Button>
        </div>
        {checkResult && checkResult.found && (
          <>
            <dl className="adm-summary">
              <div><dt>Name</dt><dd>{checkResult.restaurant_name}</dd></div>
              <div><dt>ID</dt><dd>{checkResult.restaurant_id}</dd></div>
              <div><dt>Plan</dt><dd>{checkResult.plan_status}</dd></div>
              <div><dt>Activation</dt><dd>{checkResult.activation_required ? 'Pending (pehli login baaqi)' : 'Done'}</dd></div>
              <div><dt>Code</dt><dd><code>{checkResult.activation_code || '—'}</code></dd></div>
            </dl>
            {checkResult.activation_required && (
              <Button variant="secondary" disabled={loading} onClick={() => act('Naya activation code ban gaya', async () => {
                const data = await rpc('admin_issue_activation_code', { p_restaurant_id: checkResult.restaurant_id })
                setCheckResult(prev => ({ ...prev, activation_code: data?.code || prev?.activation_code }))
              })}>Naya code banayein</Button>
            )}
          </>
        )}
        {checkResult && !checkResult.found && (
          <p className="adm-card-lead" style={{ margin: 0 }}>
            "{checkName}" naam ka restaurant nahi mila (ID: {checkResult.restaurant_id || '—'}). Upar "Naya restaurant" form se banayein.
          </p>
        )}
      </Card>
    </div>
  )

  const renderCodes = () => (
    <>
      <PageHead title="Activation codes" subtitle="Codes generate, save aur revoke karein" />
      <Card>
        <h2 className="adm-card-title">Generate codes</h2>
        <div className="adm-stack">
          <Textarea
            label="Codes (one per line)"
            value={newCodes}
            onChange={e => setNewCodes(e.target.value)}
            placeholder={'CODE-001\nCODE-002'}
          />
          <div className="adm-btn-row">
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => act('5 server activation codes generated', async () => {
                const generated = []
                for (let i = 0; i < 5; i += 1) {
                  const data = await rpc('admin_generate_activation_code')
                  const code = data?.code || data
                  if (!code) throw new Error('Activation code generate nahi ho saka.')
                  generated.push(code)
                }
                setNewCodes(v => (v ? v + '\n' : '') + generated.join('\n'))
              })}
            >Generate 5 server codes</Button>
            <Button
              disabled={loading}
              onClick={() => act('Codes created', async () => {
                const arr = newCodes.split('\n').map(s => s.trim()).filter(Boolean)
                await rpc('admin_create_codes', { p_codes: arr })
                setNewCodes('')
              })}
            >Save codes</Button>
          </div>
        </div>
      </Card>

      {codes.length === 0 ? (
        <EmptyState icon="🔑" title="No activation codes" description="Upar se server codes generate karein, phir restaurant ko dein." />
      ) : (
        <div className="adm-stack">
          {codes.map((c, i) => (
            <motion.div
              key={c.id || c.code}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.03, duration: 0.25, ease: EASE }}
            >
              <Card>
                <div className="adm-row__head" style={{ alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontFamily: 'var(--mono, monospace)', letterSpacing: '0.04em' }}>{c.code}</div>
                    <div className="adm-row__id" style={{ marginTop: 4 }}>
                      {c.used_by ? `used by ${c.used_by}` : 'not used'}{c.created_at ? ` · ${fmtDate(c.created_at)}` : ''}
                    </div>
                  </div>
                  <div className="adm-btn-row" style={{ alignItems: 'center' }}>
                    <Badge variant={c.is_used ? 'neutral' : 'success'}>{c.status || (c.is_used ? 'used' : 'unused')}</Badge>
                    <Button size="sm" variant="secondary" onClick={() => act('Revoked', () => rpc('admin_revoke_code', { p_code: c.code }))}>Revoke</Button>
                    {!c.is_used && (
                      <Button
                        size="sm"
                        variant="danger"
                        aria-label={`Delete code ${c.code}`}
                        onClick={() => confirm('Delete unused code permanently?', () => act('Deleted', () => rpc('admin_delete_code', { p_code: c.code })))}
                      >Delete</Button>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </>
  )

  const pendingPayments = paymentRequests.filter(r => r.status === 'pending')
  const reviewedPayments = paymentRequests.filter(r => r.status !== 'pending')

  const resetPaymentForm = () => {
    setPaEditId(null)
    setPaType('bank'); setPaLabel('Bank Transfer'); setPaBank(''); setPaTitle(''); setPaNumber('')
    setPaIban(''); setPaQr(''); setPaInstr(''); setPaActive(true)
  }

  const renderPayments = () => (
    <>
      <PageHead title="Payments" subtitle="Subscription payment methods, requests aur manual records" />

      <Card>
        <h2 className="adm-card-title">Central payment method</h2>
        <p className="adm-card-lead">
          Ye Admin ka subscription payment method hai. Har restaurant ke Counter → Subscription mein ye details show hongi.
        </p>
        <div className="adm-stack">
          <Select label="Method type" value={paType} onChange={e => setPaType(e.target.value)}>
            <option value="bank">Bank Transfer</option>
            <option value="jazzcash">JazzCash</option>
            <option value="easypaisa">Easypaisa</option>
            <option value="raast">Raast</option>
            <option value="other">Other</option>
          </Select>
          <Input label="Label" placeholder="e.g. Bank Transfer / JazzCash" value={paLabel} onChange={e => setPaLabel(e.target.value)} />
          <Input label="Bank / provider name (optional)" value={paBank} onChange={e => setPaBank(e.target.value)} />
          <Input label="Account title" value={paTitle} onChange={e => setPaTitle(e.target.value)} />
          <Input label="Account number" value={paNumber} onChange={e => setPaNumber(e.target.value)} />
          <Input label="IBAN (optional)" value={paIban} onChange={e => setPaIban(e.target.value)} />
          <Input label="QR image URL (optional)" value={paQr} onChange={e => setPaQr(e.target.value)} />
          <Textarea label="Payment instructions" value={paInstr} onChange={e => setPaInstr(e.target.value)} />
          <Switch checked={paActive} onChange={setPaActive} label="Active" />
          <div className="adm-btn-row">
            <Button
              disabled={loading}
              onClick={() => act(paEditId ? 'Payment method updated' : 'Payment method saved', async () => {
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
                resetPaymentForm()
              })}
            >{paEditId ? 'Update method' : 'Save payment method'}</Button>
            {paEditId && <Button variant="secondary" onClick={resetPaymentForm}>Cancel edit</Button>}
          </div>
        </div>

        <div className="adm-stack" style={{ marginTop: 16 }}>
          {paymentAccounts.map(a => (
            <Card key={a.id} style={{ boxShadow: 'none' }}>
              <div className="adm-row__head">
                <div style={{ fontWeight: 600 }}>{a.label}</div>
                <Badge variant={a.is_active ? 'success' : 'neutral'}>{a.is_active ? 'active' : 'inactive'}</Badge>
              </div>
              <div className="adm-row__id" style={{ textTransform: 'uppercase', marginTop: 2 }}>{a.method_type || 'bank'}</div>
              <div style={{ fontSize: 'var(--text-sm, 14px)', marginTop: 6 }}>
                {a.bank_name} · {a.account_title} · {a.account_number}{a.iban ? ` · ${a.iban}` : ''}
              </div>
              {a.instructions && <div className="adm-card-lead" style={{ margin: '6px 0 0' }}>{a.instructions}</div>}
              <div className="adm-row__actions">
                <Button size="sm" variant="secondary" onClick={() => {
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
                }}>Edit</Button>
                <Button size="sm" variant="danger" onClick={() => confirm('Delete this payment method?', () => act('Deleted', () => rpc('admin_delete_payment_account', { p_id: a.id })))}>Delete</Button>
              </div>
            </Card>
          ))}
          {paymentAccounts.length === 0 && (
            <EmptyState icon="💳" title="No payment methods yet" description="Upar form se pehla payment method add karein." />
          )}
        </div>
      </Card>

      <Card>
        <h2 className="adm-card-title">Restaurant payment requests</h2>
        <p className="adm-card-lead">Counter Dashboard se submit. Approve → subscription auto renew. Reject → status rejected.</p>
        <div className="adm-stack">
          {pendingPayments.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.25, ease: EASE }}
            >
              <Card style={{ borderColor: 'var(--color-warning, #b26a00)' }}>
                <div className="adm-row__name" style={{ fontSize: 'var(--text-base, 16px)' }}>{r.restaurant_name || r.restaurant_id}</div>
                <div className="adm-row__meta" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
                  <span>{fmtMoney(r.amount, r.currency)} · {r.billing_cycle || 'month'} · Txn: {r.transaction_id || '—'}</span>
                  <span>Method: {r.method || '—'} · {fmtDate(r.payment_date || r.created_at)}</span>
                  {r.proof_url && <a href={r.proof_url} target="_blank" rel="noreferrer">View proof</a>}
                </div>
                <div className="adm-row__actions">
                  <Button variant="success" disabled={loading} onClick={() => act('Payment approved — plan renewed', async () => {
                    await rpc('admin_review_payment_request', {
                      p_request_id: r.id,
                      p_action: 'approve',
                      p_admin_note: 'Approved',
                    })
                  })}>Approve payment</Button>
                  <Button variant="secondary" disabled={loading} onClick={() => confirm('Reject this payment request?', () => act('Payment rejected', async () => {
                    await rpc('admin_review_payment_request', {
                      p_request_id: r.id,
                      p_action: 'reject',
                      p_admin_note: 'Rejected',
                    })
                  }))}>Reject</Button>
                </div>
              </Card>
            </motion.div>
          ))}
          {pendingPayments.length === 0 && (
            <EmptyState icon="✓" title="No pending requests" description="Naye payment requests yahan aayenge." />
          )}
        </div>

        {reviewedPayments.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p className="adm-group__label">Recent reviewed</p>
            {reviewedPayments.slice(0, 12).map(r => (
              <div key={r.id} style={{ fontSize: 'var(--text-sm, 14px)', padding: '8px 0', borderBottom: '1px solid var(--color-border, #e6dfd0)' }}>
                <strong>{r.restaurant_name || r.restaurant_id}</strong> · {fmtMoney(r.amount, r.currency)} ·{' '}
                <span style={{ color: r.status === 'approved' ? 'var(--color-success, #2f7a4f)' : 'var(--color-error, #b6472f)', fontWeight: 700 }}>{r.status}</span>
                {' · '}{fmtDate(r.reviewed_at || r.created_at)}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="adm-card-title">Record payment (manual)</h2>
        <div className="adm-stack">
          <Select label="Restaurant" value={payRestaurant} onChange={e => setPayRestaurant(e.target.value)}>
            <option value="">Select restaurant</option>
            {restaurants.map(r => <option key={r.restaurant_id} value={r.restaurant_id}>{r.restaurant_name}</option>)}
          </Select>
          <Input label="Amount" inputMode="decimal" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
          <Input label="Method (bank / cash / …)" value={payMethod} onChange={e => setPayMethod(e.target.value)} />
          <Input label="Reference / txn id" value={payRef} onChange={e => setPayRef(e.target.value)} />
          <Input label="Admin note" value={payNote} onChange={e => setPayNote(e.target.value)} />
          <div className="adm-filters">
            <div style={{ flex: '1 1 140px' }}>
              <Input label="Days" type="number" min={1} value={payDays} onChange={e => setPayDays(Number(e.target.value) || 30)} />
            </div>
            <div style={{ flex: '1 1 140px' }}>
              <Select label="Cycle" value={payCycle} onChange={e => setPayCycle(e.target.value)}>
                <option value="month">Month</option>
                <option value="six_months">6 Months</option>
                <option value="year">Year</option>
              </Select>
            </div>
          </div>
          <div>
            <Button
              disabled={loading}
              onClick={() => act('Payment recorded', async () => {
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
              })}
            >Save payment + extend plan</Button>
          </div>
        </div>
      </Card>

      {payments.length === 0 ? (
        <EmptyState icon="🧾" title="No payments yet" description="Recorded payments yahan list hongi." />
      ) : (
        <div className="adm-stack">
          {payments.map(p => (
            <Card key={p.id}>
              <div style={{ fontWeight: 600 }}>{p.restaurant_id}</div>
              <div className="adm-row__id" style={{ marginTop: 4 }}>
                {fmtMoney(p.amount, p.currency)} · {fmtDate(p.payment_date)} · {p.method || '—'} · {p.reference_note || ''}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )

  const statusCounts = Object.keys(STATUS_COLORS).reduce((acc, s) => { acc[s] = 0; return acc }, {})
  restaurants.forEach(r => { if (r.plan_status in statusCounts) statusCounts[r.plan_status] += 1 })
  const totalForBars = Math.max(restaurants.length, 1)

  const renderReports = () => (
    <>
      <PageHead
        title="Reports"
        subtitle="Summary, status distribution aur exports. Sensitive credentials (PIN, admin key, QR secrets) reports mein nahi aate."
      />
      <div className="adm-stat-grid">
        {[
          ['Total', stats?.total], ['Active', stats?.active], ['Trial', stats?.trial],
          ['Overdue', stats?.overdue], ['Suspended', stats?.suspended], ['Sold out', stats?.sold_out],
        ].map(([label, val], i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.3, ease: EASE }}>
            <Card className="adm-stat">
              <div className="adm-stat__label">{label}</div>
              <div className="adm-stat__value">{numberCell(dataReady, val)}</div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card>
        <h2 className="adm-card-title">Status distribution</h2>
        {!dataReady ? (
          <div className="adm-stack">
            {[0, 1, 2].map(i => <Skeleton key={i} width="100%" height={12} />)}
          </div>
        ) : restaurants.length === 0 ? (
          <EmptyState icon="📊" title="No data yet" description="Restaurants add hone par distribution yahan dikhegi." />
        ) : (
          <div className="adm-bars">
            {Object.keys(STATUS_COLORS).map((s, i) => {
              const pct = statusCounts[s] / totalForBars
              return (
                <div key={s} className="adm-bar__row">
                  <span style={{ textTransform: 'capitalize' }}>{s.replace(/_/g, ' ')}</span>
                  <div className="adm-bar__track">
                    <motion.div
                      className="adm-bar__fill"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: pct }}
                      transition={{ duration: 0.6, ease: EASE, delay: i * 0.05 }}
                      style={{ width: '100%' }}
                    />
                  </div>
                  <span className="adm-bar__count">{statusCounts[s]}</span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="adm-card-title">Exports</h2>
        <div className="adm-btn-row">
          <Button variant="secondary" onClick={() => exportCsv(restaurants, 'all-restaurants.csv')}>CSV — all</Button>
          <Button variant="secondary" onClick={() => exportCsv(restaurants.filter(r => r.plan_status === 'trial'), 'trial.csv')}>CSV — trial</Button>
          <Button variant="secondary" onClick={() => exportCsv(restaurants.filter(r => r.plan_status === 'overdue'), 'overdue.csv')}>CSV — overdue</Button>
          <Button variant="secondary" onClick={() => exportCsv(restaurants.filter(r => r.plan_status === 'sold_out'), 'sold-out.csv')}>CSV — sold out</Button>
          <Button variant="primary" onClick={pdfList}>PDF list</Button>
        </div>
      </Card>
    </>
  )

  const renderAudit = () => (
    <>
      <PageHead title="Audit log" subtitle="Latest admin actions" />
      {audit.length === 0 ? (
        <EmptyState icon="🧾" title="No audit entries yet" description="Admin actions yahan record hongi." />
      ) : (
        <div className="adm-stack">
          {audit.map((a, i) => (
            <motion.div key={a.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.025, duration: 0.25, ease: EASE }}>
              <Card>
                <div style={{ fontWeight: 600, fontSize: 'var(--text-sm, 14px)' }}>{a.action_type}</div>
                <div className="adm-row__id" style={{ marginTop: 4 }}>
                  {fmtDate(a.created_at)} · {a.restaurant_id || '—'} · {a.result}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </>
  )

  const renderSettings = () => (
    <>
      <PageHead title="Settings" subtitle="Platform defaults aur admin security" />
      <div className="adm-stack">
        <Card>
          <Collapsible title="Business settings" defaultOpen>
            <SettingsForm settings={settings} onSave={(obj) => act('Settings saved', () => rpc('admin_update_settings', { p_settings: obj }))} />
          </Collapsible>
        </Card>
        <Card>
          <Collapsible title="Change admin key" defaultOpen={false}>
            <div className="adm-stack">
              <p className="adm-card-lead" style={{ margin: 0 }}>Old + new key required. Min 12 characters.</p>
              <Input type="password" label="Current key" autoComplete="current-password" value={oldKey} onChange={e => setOldKey(e.target.value)} />
              <Input type="password" label="New key" autoComplete="new-password" value={newKey} onChange={e => setNewKey(e.target.value)} />
              <div>
                <Button disabled={loading} onClick={() => act('Admin key changed', async () => {
                  await rpc('admin_change_key', { p_old_key: oldKey, p_new_key: newKey })
                  sessionStorage.setItem(SESSION_KEY, newKey.trim())
                  setAdminKey(newKey.trim())
                  setOldKey(''); setNewKey('')
                })}>Update key</Button>
              </div>
            </div>
          </Collapsible>
        </Card>
      </div>
    </>
  )

  const renderSection = () => {
    if (tab === 'restaurants' && selected) return renderDetail()
    switch (tab) {
      case 'dashboard': return renderDashboard()
      case 'restaurants': return renderRestaurants()
      case 'branches': return <BranchRequestsPanel adminKey={adminKey} />
      case 'add': return renderAdd()
      case 'codes': return renderCodes()
      case 'payments': return renderPayments()
      case 'reports': return renderReports()
      case 'audit': return renderAudit()
      case 'settings': return renderSettings()
      default: return null
    }
  }

  // ---------- MAIN SHELL ----------
  return (
    <div className="adm-root">
      <AdminNav
        active={tab}
        onSelect={go}
        title={settings.company_name || 'Table Order'}
        subtitle="Control Center"
      />

      <div className="adm-main">
        <header className="adm-topbar">
          <div>
            <div className="adm-topbar__title">{settings.company_name || 'Table Order'} · Control Center</div>
            <div className="adm-topbar__sub">SaaS Admin · /admin</div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => logout()}>Logout</Button>
        </header>

        <main className="adm-page" id="adm-main">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${tab}-${selected ? 'detail' : 'list'}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="adm-stack"
              style={{ gap: 20 }}
            >
              {renderSection()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AdminToast msg={msg} onDismiss={() => setMsg('')} />

      <Modal
        open={!!confirmText}
        onClose={() => setConfirmText(null)}
        title="Please confirm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmText(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => { const fn = confirmText?.onYes; setConfirmText(null); fn && fn() }}>
              Confirm
            </Button>
          </>
        }
      >
        <p className="adm-card-lead" style={{ margin: 0 }}>{confirmText?.text}</p>
      </Modal>
    </div>
  )
}

// ---------- FORM HELPERS (presentation only, same handlers as before) ----------
function ResetPinForm({ onSubmit }) {
  const [pin, setPin] = useState('')
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div style={{ flex: '0 1 200px', minWidth: 0 }}>
        <Input label="New PIN" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} />
      </div>
      <Button variant="secondary" onClick={() => { onSubmit(pin); setPin('') }}>Reset PIN</Button>
    </div>
  )
}

function NotesForm({ initial, onSave }) {
  const [v, setV] = useState(initial)
  useEffect(() => setV(initial), [initial])
  return (
    <div className="adm-stack">
      <Textarea label="Admin notes" value={v} onChange={e => setV(e.target.value)} />
      <div>
        <Button variant="secondary" onClick={() => onSave(v)}>Save notes</Button>
      </div>
    </div>
  )
}

function SettingsForm({ settings, onSave }) {
  const read = (s) => ({
    company_name: s.company_name || '',
    support_contact: s.support_contact || '',
    default_trial_days: s.default_trial_days || '30',
    default_grace_days: s.default_grace_days || '10',
    default_monthly_price: s.default_monthly_price || '5000',
    default_six_month_price: s.default_six_month_price || '30000',
    default_yearly_price: s.default_yearly_price || '60000',
    currency: s.currency || 'PKR',
  })
  const [s, setS] = useState(() => read(settings))
  useEffect(() => { setS(read(settings)) }, [settings])

  const field = (k, label) => (
    <Input key={k} label={label} value={s[k]} onChange={e => setS({ ...s, [k]: e.target.value })} />
  )
  return (
    <div className="adm-stack">
      {field('company_name', 'Company name')}
      {field('support_contact', 'Support contact')}
      {field('currency', 'Currency')}
      {field('default_trial_days', 'Default trial days')}
      {field('default_grace_days', 'Default grace days')}
      {field('default_monthly_price', 'Default monthly price')}
      {field('default_six_month_price', 'Default 6-month price')}
      {field('default_yearly_price', 'Default yearly price')}
      <div>
        <Button onClick={() => onSave(s)}>Save settings</Button>
      </div>
    </div>
  )
}
