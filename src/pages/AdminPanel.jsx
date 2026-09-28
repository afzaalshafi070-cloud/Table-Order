import { useCallback, useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import { supabase } from '../supabaseClient.js'
import { ensureAnonymousAuth } from '../utils/auth.js'

const KEY_STORAGE = 'table_order_admin_key'

function daysLeft(iso) {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

function statusColor(s) {
  if (s === 'active' || s === 'complimentary') return '#16a34a'
  if (s === 'trial') return '#ca8a04'
  if (s === 'overdue') return '#ea580c'
  return '#dc2626'
}

function rangeForPeriod(period) {
  const to = new Date()
  const from = new Date()
  if (period === 'day') from.setDate(from.getDate() - 1)
  else if (period === 'year') from.setFullYear(from.getFullYear() - 1)
  else from.setMonth(from.getMonth() - 1)
  return { from: from.toISOString(), to: to.toISOString() }
}

function downloadAdminPdf({ title, periodLabel, rows, restaurantsMeta }) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const left = 40
  let y = 48
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(title, left, y); y += 18
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Period: ${periodLabel}`, left, y); y += 14
  doc.text(`Generated: ${new Date().toLocaleString()}`, left, y); y += 20
  const totalOrders = rows.reduce((s, r) => s + (r.order_count || 0), 0)
  const totalRev = rows.reduce((s, r) => s + Number(r.revenue || 0), 0)
  doc.setFont('helvetica', 'bold')
  doc.text(`Restaurants: ${rows.length} | Orders: ${totalOrders} | Revenue: PKR ${totalRev.toFixed(0)}`, left, y); y += 22
  doc.setFontSize(10)
  doc.text('Restaurant', left, y)
  doc.text('Orders', left + 260, y)
  doc.text('Revenue', left + 330, y)
  doc.text('Plan', left + 420, y)
  y += 6; doc.line(left, y, 555, y); y += 14
  doc.setFont('helvetica', 'normal')
  rows.forEach((r) => {
    if (y > 780) { doc.addPage(); y = 48 }
    const meta = restaurantsMeta?.[r.restaurant_id]
    doc.text(String(r.restaurant_name || r.restaurant_id || '').slice(0, 36), left, y)
    doc.text(String(r.order_count ?? 0), left + 260, y)
    doc.text(`PKR ${Number(r.revenue || 0).toFixed(0)}`, left + 330, y)
    doc.text(meta?.plan_status || '—', left + 420, y)
    y += 16
  })
  doc.save(`admin-report-${Date.now()}.pdf`)
}

export default function AdminPanel() {
  const [adminKey, setAdminKey] = useState(() => sessionStorage.getItem(KEY_STORAGE) || '')
  const [keyInput, setKeyInput] = useState('')
  const [unlocked, setUnlocked] = useState(false)
  const [tab, setTab] = useState('dashboard')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [msg, setMsg] = useState(null)
  const [restaurants, setRestaurants] = useState([])
  const [codes, setCodes] = useState([])
  const [accounts, setAccounts] = useState([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [newName, setNewName] = useState('')
  const [newDays, setNewDays] = useState(30)
  const [newCycle, setNewCycle] = useState('month')
  const [newCodesText, setNewCodesText] = useState('')
  const [pdfScope, setPdfScope] = useState('all')
  const [pdfOneId, setPdfOneId] = useState('')
  const [pdfPeriod, setPdfPeriod] = useState('month')
  const [accForm, setAccForm] = useState({ label: '', bank_name: '', account_title: '', account_number: '', iban: '', country: 'PK' })

  const stats = useMemo(() => {
    const total = restaurants.length
    const active = restaurants.filter((r) => r.plan_status === 'active').length
    const trial = restaurants.filter((r) => r.plan_status === 'trial').length
    const overdue = restaurants.filter((r) => r.plan_status === 'overdue').length
    const sold = restaurants.filter((r) => r.plan_status === 'sold_out' || r.plan_status === 'expired').length
    const comp = restaurants.filter((r) => r.plan_status === 'complimentary').length
    return { total, active, trial, overdue, sold, comp, monthly: active * 500 }
  }, [restaurants])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return restaurants
    return restaurants.filter((r) =>
      (r.restaurant_name || '').toLowerCase().includes(q) || (r.restaurant_id || '').toLowerCase().includes(q)
    )
  }, [restaurants, search])

  const call = useCallback(async (fn, args = {}) => {
    await ensureAnonymousAuth()
    const { data, error: err } = await supabase.rpc(fn, { p_admin_key: adminKey, ...args })
    if (err) throw err
    return data
  }, [adminKey])

  const refresh = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [list, codeList, accList] = await Promise.all([
        call('admin_list_restaurants'),
        call('admin_list_codes'),
        call('admin_list_payment_accounts'),
      ])
      setRestaurants(Array.isArray(list) ? list : [])
      setCodes(Array.isArray(codeList) ? codeList : [])
      setAccounts(Array.isArray(accList) ? accList : [])
      setUnlocked(true)
      sessionStorage.setItem(KEY_STORAGE, adminKey)
    } catch (e) {
      setUnlocked(false)
      setError(e?.message || 'Admin load failed')
    } finally { setLoading(false) }
  }, [adminKey, call])

  useEffect(() => { if (adminKey && adminKey.length >= 8) refresh() }, []) // eslint-disable-line

  const unlock = async (e) => {
    e.preventDefault()
    setAdminKey(keyInput.trim())
    setLoading(true); setError(null)
    try {
      await ensureAnonymousAuth()
      const key = keyInput.trim()
      const { data, error: err } = await supabase.rpc('admin_list_restaurants', { p_admin_key: key })
      if (err) throw err
      setRestaurants(Array.isArray(data) ? data : [])
      const { data: codeList } = await supabase.rpc('admin_list_codes', { p_admin_key: key })
      setCodes(Array.isArray(codeList) ? codeList : [])
      const { data: accList } = await supabase.rpc('admin_list_payment_accounts', { p_admin_key: key })
      setAccounts(Array.isArray(accList) ? accList : [])
      setUnlocked(true)
      sessionStorage.setItem(KEY_STORAGE, key)
      setAdminKey(key)
    } catch (err) {
      setError(err?.message?.includes('ADMIN_UNAUTHORIZED') ? 'Admin key ghalat hai.' : (err?.message || 'Unlock failed'))
      setUnlocked(false)
    } finally { setLoading(false) }
  }

  const lock = () => {
    sessionStorage.removeItem(KEY_STORAGE)
    setAdminKey(''); setUnlocked(false); setRestaurants([]); setCodes([]); setAccounts([])
  }

  const runAction = async (restaurantId, action, days = 30, cycle = 'month') => {
    setMsg(null); setError(null)
    try {
      await call('admin_update_plan', { p_restaurant_id: restaurantId, p_action: action, p_days: days, p_billing_cycle: cycle })
      setMsg(`${action} OK — ${restaurantId}`)
      await refresh()
    } catch (e) { setError(e?.message || 'Action failed') }
  }

  const deleteRestaurant = async (r) => {
    const name = r.restaurant_name || r.restaurant_id
    if (!confirm(`DELETE "${name}"?\n\nSaara data (orders, menu, sessions) permanently delete ho jayega.`)) return
    if (!confirm('Last confirm: delete nahi to Cancel.')) return
    setError(null)
    try {
      await call('admin_delete_restaurant', { p_restaurant_id: r.restaurant_id })
      setMsg(`Deleted: ${name}`)
      await refresh()
    } catch (e) { setError(e?.message || 'Delete failed') }
  }

  const addRestaurant = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    setError(null)
    try {
      const days = newCycle === 'year' ? 365 : (Number(newDays) || 30)
      await call('admin_upsert_restaurant', {
        p_restaurant_name: newName.trim(),
        p_plan_status: 'trial',
        p_days: days,
        p_billing_cycle: newCycle,
      })
      setNewName('')
      setMsg('Restaurant plan added')
      await refresh()
    } catch (err) { setError(err?.message || 'Add failed') }
  }

  const createCodes = async (e) => {
    e.preventDefault()
    const list = newCodesText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
    if (!list.length) return
    try {
      const res = await call('admin_create_codes', { p_codes: list })
      setMsg(`Codes inserted: ${res?.inserted ?? 0}`)
      setNewCodesText('')
      await refresh()
    } catch (err) { setError(err?.message || 'Create codes failed') }
  }

  const deleteCode = async (code) => {
    if (!confirm(`Delete code ${code}?`)) return
    try { await call('admin_delete_code', { p_code: code }); await refresh() }
    catch (err) { setError(err?.message || 'Delete failed') }
  }

  const saveAccount = async (e) => {
    e.preventDefault()
    setError(null)
    try {
      await call('admin_upsert_payment_account', {
        p_id: null,
        p_label: accForm.label,
        p_bank_name: accForm.bank_name,
        p_account_title: accForm.account_title,
        p_account_number: accForm.account_number,
        p_iban: accForm.iban || null,
        p_country: accForm.country || 'PK',
        p_is_active: true,
        p_sort_order: accounts.length,
      })
      setAccForm({ label: '', bank_name: '', account_title: '', account_number: '', iban: '', country: 'PK' })
      setMsg('Payment account saved')
      await refresh()
    } catch (err) { setError(err?.message || 'Save account failed') }
  }

  const deleteAccount = async (id) => {
    if (!confirm('Delete this payment account?')) return
    try { await call('admin_delete_payment_account', { p_id: id }); await refresh() }
    catch (err) { setError(err?.message || 'Delete failed') }
  }

  const exportPdf = async () => {
    setError(null)
    try {
      const { from, to } = rangeForPeriod(pdfPeriod)
      let ids = null
      if (pdfScope === 'selected') {
        ids = [...selected]
        if (!ids.length) { setError('Pehle restaurants select karo.'); return }
      } else if (pdfScope === 'one') {
        if (!pdfOneId) { setError('Restaurant select karo.'); return }
        ids = [pdfOneId]
      }
      const rows = await call('admin_sales_report', { p_restaurant_ids: ids, p_from: from, p_to: to })
      const meta = Object.fromEntries(restaurants.map((r) => [r.restaurant_id, r]))
      const periodLabel = pdfPeriod === 'day' ? 'Last 24h' : pdfPeriod === 'year' ? 'Last year' : 'Last 30 days'
      downloadAdminPdf({ title: 'Table Order — Admin Report', periodLabel, rows: Array.isArray(rows) ? rows : [], restaurantsMeta: meta })
      setMsg('PDF download started')
    } catch (err) { setError(err?.message || 'PDF failed') }
  }

  if (!unlocked) {
    return (
      <div style={S.page}>
        <form onSubmit={unlock} style={S.card}>
          <div style={S.badge}>ADMIN ONLY</div>
          <h1 style={{ margin: '8px 0 4px', fontSize: 22 }}>Creator control</h1>
          <p style={{ color: '#666', fontSize: 14 }}>Sirf aapki admin key se open hota hai.</p>
          <label style={S.label}>Admin key</label>
          <input type="password" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} style={S.input} autoFocus />
          {error && <div style={S.err}>{error}</div>}
          <button type="submit" disabled={loading || keyInput.trim().length < 8} style={S.btnPrimary}>
            {loading ? 'Checking…' : 'Unlock'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div style={S.pageWide}>
      <header style={S.header}>
        <div>
          <div style={S.badge}>ADMIN</div>
          <h1 style={{ margin: '6px 0 0', fontSize: 20 }}>Table Order — Control Center</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={refresh} style={S.btnGhost} disabled={loading}>Refresh</button>
          <button type="button" onClick={lock} style={S.btnGhost}>Lock</button>
        </div>
      </header>

      <div style={S.statsRow}>
        {[
          ['Total', stats.total, '#334155'],
          ['Paying', stats.active, '#16a34a'],
          ['Trial', stats.trial, '#ca8a04'],
          ['Overdue', stats.overdue, '#ea580c'],
          ['Sold out', stats.sold, '#dc2626'],
          ['Free', stats.comp, '#7c3aed'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ ...S.statCard, borderTop: `3px solid ${color}` }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={S.tabs}>
        {[['dashboard','Restaurants'],['add','Add'],['codes','Codes'],['payments','Payment accounts'],['pdf','PDF']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={tab === id ? S.tabOn : S.tabOff}>{label}</button>
        ))}
      </div>

      {error && <div style={S.err}>{error}</div>}
      {msg && <div style={S.ok}>{msg}</div>}

      {tab === 'dashboard' && (
        <div style={S.cardWide}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" style={{ ...S.input, marginBottom: 0, flex: 1 }} />
            <button type="button" onClick={() => setSelected(new Set(filtered.map((r) => r.restaurant_id)))} style={S.btnGhost}>Select all</button>
            <button type="button" onClick={() => setSelected(new Set())} style={S.btnGhost}>Clear</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th></th><th>Restaurant</th><th>Status</th><th>Cycle</th><th>Days</th><th>Orders</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const left = r.plan_status === 'trial' ? daysLeft(r.trial_ends_at)
                    : r.plan_status === 'active' ? daysLeft(r.paid_until)
                    : r.plan_status === 'overdue' ? daysLeft(r.grace_ends_at) : null
                  return (
                    <tr key={r.restaurant_id}>
                      <td><input type="checkbox" checked={selected.has(r.restaurant_id)} onChange={() => {
                        setSelected((prev) => { const n = new Set(prev); n.has(r.restaurant_id) ? n.delete(r.restaurant_id) : n.add(r.restaurant_id); return n })
                      }} /></td>
                      <td>
                        <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {(r.plan_status === 'overdue' || r.plan_status === 'sold_out') && (
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#dc2626', display: 'inline-block' }} />
                          )}
                          {r.restaurant_name || r.restaurant_id}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.restaurant_id}</div>
                      </td>
                      <td><span style={{ color: statusColor(r.plan_status), fontWeight: 700 }}>{r.plan_status}</span></td>
                      <td>{r.billing_cycle || '—'}</td>
                      <td>{left == null ? '—' : left < 0 ? 'ended' : left}</td>
                      <td>{r.order_count ?? 0}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          <button type="button" style={S.btnTiny} onClick={() => runAction(r.restaurant_id, 'mark_paid', 30, 'month')}>+1 mo paid</button>
                          <button type="button" style={S.btnTiny} onClick={() => runAction(r.restaurant_id, 'mark_paid', 365, 'year')}>+1 yr paid</button>
                          <button type="button" style={S.btnTiny} onClick={() => runAction(r.restaurant_id, 'extend_trial', 30)}>+30 trial</button>
                          <button type="button" style={S.btnTiny} onClick={() => runAction(r.restaurant_id, 'complimentary')}>Free forever</button>
                          <button type="button" style={S.btnTinyDanger} onClick={() => runAction(r.restaurant_id, 'sold_out')}>Sold out</button>
                          <button type="button" style={S.btnTinyDanger} onClick={() => deleteRestaurant(r)}>Delete data</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'add' && (
        <form onSubmit={addRestaurant} style={S.cardWide}>
          <h3 style={{ marginTop: 0 }}>Add restaurant plan</h3>
          <label style={S.label}>Name</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} style={S.input} required />
          <label style={S.label}>Billing cycle (default trial length)</label>
          <select value={newCycle} onChange={(e) => setNewCycle(e.target.value)} style={S.input}>
            <option value="month">Monthly (30 days trial)</option>
            <option value="year">Yearly (365 days trial)</option>
          </select>
          {newCycle === 'month' && (
            <>
              <label style={S.label}>Trial days</label>
              <input type="number" min={1} max={365} value={newDays} onChange={(e) => setNewDays(e.target.value)} style={S.input} />
            </>
          )}
          <button type="submit" style={S.btnPrimary}>Add</button>
        </form>
      )}

      {tab === 'codes' && (
        <div style={S.cardWide}>
          <form onSubmit={createCodes}>
            <h3 style={{ marginTop: 0 }}>Activation codes</h3>
            <textarea value={newCodesText} onChange={(e) => setNewCodesText(e.target.value)} rows={4}
              placeholder={'SALE-1001\nSALE-1002'} style={{ ...S.input, fontFamily: 'monospace' }} />
            <button type="submit" style={S.btnPrimary}>Create</button>
          </form>
          <table style={S.table}>
            <thead><tr><th>Code</th><th>Used</th><th>By</th><th></th></tr></thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id || c.code}>
                  <td style={{ fontFamily: 'monospace' }}>{c.code}</td>
                  <td>{c.is_used ? 'Yes' : 'No'}</td>
                  <td>{c.used_by || '—'}</td>
                  <td>{!c.is_used && <button type="button" style={S.btnTinyDanger} onClick={() => deleteCode(c.code)}>Delete</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'payments' && (
        <div style={S.cardWide}>
          <h3 style={{ marginTop: 0 }}>Your payment accounts</h3>
          <p style={{ fontSize: 13, color: '#64748b' }}>
            Ye accounts overdue restaurants ke dashboard pe dikhenge (payment popup).
          </p>
          <form onSubmit={saveAccount}>
            <label style={S.label}>Label (e.g. HBL PK / Wise USD)</label>
            <input value={accForm.label} onChange={(e) => setAccForm({ ...accForm, label: e.target.value })} style={S.input} />
            <label style={S.label}>Bank name</label>
            <input value={accForm.bank_name} onChange={(e) => setAccForm({ ...accForm, bank_name: e.target.value })} style={S.input} required />
            <label style={S.label}>Account title (holder)</label>
            <input value={accForm.account_title} onChange={(e) => setAccForm({ ...accForm, account_title: e.target.value })} style={S.input} required />
            <label style={S.label}>Account number</label>
            <input value={accForm.account_number} onChange={(e) => setAccForm({ ...accForm, account_number: e.target.value })} style={S.input} required />
            <label style={S.label}>IBAN (optional)</label>
            <input value={accForm.iban} onChange={(e) => setAccForm({ ...accForm, iban: e.target.value })} style={S.input} />
            <label style={S.label}>Country</label>
            <input value={accForm.country} onChange={(e) => setAccForm({ ...accForm, country: e.target.value })} style={S.input} />
            <button type="submit" style={S.btnPrimary}>Save account</button>
          </form>
          <h4>Saved</h4>
          {accounts.map((a) => (
            <div key={a.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, marginBottom: 8 }}>
              <strong>{a.label}</strong> — {a.bank_name}<br />
              <span style={{ fontSize: 13 }}>Title: {a.account_title}</span><br />
              <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{a.account_number}</span>
              {a.iban && <div style={{ fontFamily: 'monospace', fontSize: 12 }}>{a.iban}</div>}
              <button type="button" style={{ ...S.btnTinyDanger, marginTop: 6 }} onClick={() => deleteAccount(a.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'pdf' && (
        <div style={S.cardWide}>
          <h3 style={{ marginTop: 0 }}>PDF reports</h3>
          <label style={S.label}>Scope</label>
          <select value={pdfScope} onChange={(e) => setPdfScope(e.target.value)} style={S.input}>
            <option value="all">All</option>
            <option value="selected">Selected ({selected.size})</option>
            <option value="one">One restaurant</option>
          </select>
          {pdfScope === 'one' && (
            <select value={pdfOneId} onChange={(e) => setPdfOneId(e.target.value)} style={S.input}>
              <option value="">Select…</option>
              {restaurants.map((r) => <option key={r.restaurant_id} value={r.restaurant_id}>{r.restaurant_name || r.restaurant_id}</option>)}
            </select>
          )}
          <label style={S.label}>Period</label>
          <select value={pdfPeriod} onChange={(e) => setPdfPeriod(e.target.value)} style={S.input}>
            <option value="day">Last day</option>
            <option value="month">Last month</option>
            <option value="year">Last year</option>
          </select>
          <button type="button" onClick={exportPdf} style={S.btnPrimary}>Download PDF</button>
        </div>
      )}
    </div>
  )
}

const S = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, background: '#0f172a', fontFamily: 'system-ui,sans-serif' },
  pageWide: { minHeight: '100vh', padding: '16px 16px 40px', background: '#f1f5f9', fontFamily: 'system-ui,sans-serif', maxWidth: 1100, margin: '0 auto' },
  card: { width: '100%', maxWidth: 400, background: '#fff', borderRadius: 14, padding: 22 },
  cardWide: { background: '#fff', borderRadius: 12, padding: 16, border: '1px solid #e2e8f0' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  badge: { display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: 1, color: '#7c3aed', background: '#ede9fe', padding: '3px 8px', borderRadius: 6 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10, marginBottom: 14 },
  statCard: { background: '#fff', borderRadius: 10, padding: '12px 14px', border: '1px solid #e2e8f0' },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  tabOn: { background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontWeight: 600, cursor: 'pointer' },
  tabOff: { background: '#fff', color: '#334155', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 14px', cursor: 'pointer' },
  label: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#475569' },
  input: { width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 8, padding: '10px 12px', fontSize: 14, marginBottom: 12 },
  btnPrimary: { width: '100%', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 16px', fontWeight: 700, cursor: 'pointer' },
  btnGhost: { background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', fontSize: 13 },
  btnTiny: { background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' },
  btnTinyDanger: { background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  err: { background: '#fef2f2', color: '#b91c1c', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 },
  ok: { background: '#f0fdf4', color: '#15803d', padding: '10px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 },
}

if (typeof document !== 'undefined' && !document.getElementById('admin-table-css')) {
  const s = document.createElement('style')
  s.id = 'admin-table-css'
  s.textContent = 'table th,table td{text-align:left;padding:8px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}table th{font-size:11px;text-transform:uppercase;color:#64748b}'
  document.head.appendChild(s)
}
