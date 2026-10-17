import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { getOrCreateTabSecret } from '../utils/auth.js'

const PLAN_OPTIONS = [
  { value: 'month', label: '1 Month', key: 'monthly' },
  { value: 'six_months', label: '6 Months', key: 'sixMonths' },
  { value: 'year', label: '1 Year', key: 'yearly' },
]

export default function BillingPanel({
  planInfo,
  paymentAccounts = [],
  restaurantName,
  session,
  onPlanRefresh,
}) {
  const [prices, setPrices] = useState({ monthly: 5000, sixMonths: 30000, yearly: 60000, currency: 'PKR' })
  const [accounts, setAccounts] = useState(paymentAccounts || [])
  const [myRequests, setMyRequests] = useState([])
  const [showRenew, setShowRenew] = useState(false)
  const [planChoice, setPlanChoice] = useState('month')
  const [paymentAccountId, setPaymentAccountId] = useState('')
  const [txnId, setTxnId] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState('')
  const refreshRef = useRef(onPlanRefresh)

  const status = (planInfo?.status || planInfo?.plan_status || 'unknown').toLowerCase()
  const cycle = (planInfo?.billing_cycle || 'month').toLowerCase()
  const paymentDue = !!planInfo?.payment_due || status === 'overdue' || status === 'sold_out' || status === 'expired'
  const dueAt = planInfo?.due_at || planInfo?.paid_until || planInfo?.trial_ends_at
  const graceEnds = planInfo?.grace_ends_at
  const startAt = planInfo?.activated_at || planInfo?.trial_started_at || planInfo?.created_at

  useEffect(() => {
    supabase.rpc('get_subscription_price_info').then(({ data, error }) => {
      if (!error && data) setPrices({
        monthly: Number(data.monthly) || 5000,
        sixMonths: Number(data.six_months) || 30000,
        yearly: Number(data.yearly) || 60000,
        currency: data.currency || 'PKR',
      })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    setAccounts(Array.isArray(paymentAccounts) ? paymentAccounts : [])
  }, [paymentAccounts])

  useEffect(() => {
    if (!session?.id) return
    loadMyRequests()
    if (!paymentAccounts?.length) loadAccounts()
  }, [session?.id])

  useEffect(() => {
    if (!paymentAccountId && accounts.length) setPaymentAccountId(accounts.find(a => a.is_active !== false)?.id || accounts[0].id)
  }, [accounts, paymentAccountId])

  useEffect(() => { refreshRef.current = onPlanRefresh }, [onPlanRefresh])

  // Keep the Counter subscription status fresh while Admin verifies the payment.
  useEffect(() => {
    if (!session?.id) return undefined
    const id = setInterval(() => {
      refreshRef.current?.()
      loadMyRequests()
    }, 10000)
    return () => clearInterval(id)
  }, [session?.id])

  async function loadAccounts() {
    try {
      const { data, error } = await supabase.rpc('list_active_payment_accounts')
      if (!error && Array.isArray(data)) setAccounts(data)
    } catch {}
  }

  async function loadMyRequests() {
    if (!session?.id) return
    try {
      const secret = getOrCreateTabSecret()
      const { data, error } = await supabase.rpc('list_my_subscription_payments', {
        p_session_id: session.id,
        p_tab_secret: secret,
      })
      if (!error && Array.isArray(data)) setMyRequests(data)
    } catch {}
  }

  const selectedPlan = PLAN_OPTIONS.find(p => p.value === planChoice) || PLAN_OPTIONS[0]
  const amount = Number(prices[selectedPlan.key]) || 0
  const selectedAccount = accounts.find(a => String(a.id) === String(paymentAccountId))
  const pendingReq = myRequests.find(r => r.status === 'pending')

  const daysRemaining = useMemo(() => {
    if (!dueAt) return null
    const end = new Date(dueAt).getTime()
    return Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24))
  }, [dueAt])

  const statusMeta = useMemo(() => {
    if (status === 'complimentary') return { label: 'Complimentary', color: '#7c3aed', bg: '#f5f3ff' }
    if (status === 'trial') return { label: 'Trial', color: '#0369a1', bg: '#e0f2fe' }
    if (status === 'active') return { label: 'Active', color: '#15803d', bg: '#dcfce7' }
    if (status === 'overdue' || paymentDue) return { label: 'Due / Grace Period', color: '#b45309', bg: '#fef3c7' }
    if (status === 'sold_out' || status === 'expired') return { label: 'Expired', color: '#b91c1c', bg: '#fee2e2' }
    return { label: status || 'Unknown', color: '#444', bg: '#f3f4f6' }
  }, [status, paymentDue])

  async function copyText(value, label) {
    try {
      await navigator.clipboard.writeText(String(value || ''))
      setCopied(label)
      setTimeout(() => setCopied(''), 1800)
    } catch {
      setErr('Copy nahi ho saka. Number manually copy karein.')
    }
  }

  function openRenew() {
    setErr('')
    setMsg('')
    setPlanChoice('month')
    setConfirmed(false)
    setTxnId('')
    setProofUrl('')
    setShowRenew(true)
  }

  async function submitPayment(e) {
    e?.preventDefault?.()
    if (!session?.id) return
    if (!selectedAccount?.id) {
      setErr('Admin ka active payment method select karein.')
      return
    }
    if (!txnId.trim()) {
      setErr('Payment ka Transaction ID / Reference zaroor enter karein.')
      return
    }
    if (!confirmed) {
      setErr('Pehle confirm karein ke aap ne bank transfer waqai complete kar diya hai.')
      return
    }
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const secret = getOrCreateTabSecret()
      const { error } = await supabase.rpc('submit_subscription_payment', {
        p_session_id: session.id,
        p_tab_secret: secret,
        p_amount: amount,
        p_method: selectedAccount.label || selectedAccount.bank_name || 'Bank Transfer',
        p_transaction_id: txnId.trim(),
        p_payment_date: new Date().toISOString(),
        p_proof_url: proofUrl.trim() || null,
        p_billing_cycle: planChoice,
        p_payment_account_id: selectedAccount.id,
        p_confirmed: true,
      })
      if (error) throw error
      setMsg('Payment request received. Status: Pending Verification. Subscription will change only after Admin verifies the bank payment.')
      setTxnId('')
      setProofUrl('')
      setConfirmed(false)
      setShowRenew(false)
      await loadMyRequests()
      onPlanRefresh?.()
    } catch (ex) {
      const m = String(ex?.message || ex)
      if (m.includes('PENDING_REQUEST_EXISTS')) setErr('Aapka ek payment request already pending hai. Admin verification ka intezar karein.')
      else if (m.includes('PAYMENT_ACCOUNT_NOT_FOUND')) setErr('Selected bank account ab active nahi hai. Dobara account select karein.')
      else if (m.includes('INVALID_TRANSACTION_REFERENCE')) setErr('Transaction ID / bank reference valid nahi hai.')
      else if (m.includes('PAYMENT_CONFIRMATION_REQUIRED')) setErr('Payment complete hone ke baad hi request submit ho sakti hai.')
      else if (m.includes('DUPLICATE_TRANSACTION_REFERENCE')) setErr('Ye transaction/reference pehle use ho chuka hai. Naya reference enter karein.')
      else setErr(m || 'Payment request submit nahi ho saki.')
    } finally {
      setBusy(false)
    }
  }

  const currentCycleLabel = cycle === 'year' ? '1 Year' : cycle === 'six_months' ? '6 Months' : '1 Month'

  return (
    <div style={{ padding: 16, maxWidth: 620, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 6px', fontFamily: 'var(--display)', fontSize: 22 }}>Subscription</h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
        Real bank-transfer workflow. Payment request sirf record hoti hai; <strong>success tab hota hai jab Admin actual bank payment verify kare.</strong>
      </p>

      <section style={cardStyle}>
        <h3 style={h3Style}>Current subscription</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ padding: '4px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, color: statusMeta.color, background: statusMeta.bg }}>{statusMeta.label}</span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{currentCycleLabel}</span>
        </div>
        <Row label="Restaurant" value={restaurantName || '—'} />
        <Row label="Current Plan" value={currentCycleLabel} />
        <Row label="Expiry Date" value={dueAt ? new Date(dueAt).toLocaleDateString() : '—'} />
        {startAt && <Row label="Start Date" value={new Date(startAt).toLocaleDateString()} />}
        {daysRemaining != null && <Row label="Days Remaining" value={daysRemaining < 0 ? `Overdue ${Math.abs(daysRemaining)} day(s)` : `${daysRemaining} day(s)`}/>} 
        {graceEnds && <Row label="Grace ends" value={new Date(graceEnds).toLocaleString()} />}
      </section>

      {pendingReq && (
        <section style={{ ...cardStyle, background: '#fffbeb', border: '1px solid #fbbf24' }}>
          <div style={{ fontWeight: 800, color: '#92400e' }}>🕐 Payment Pending Verification</div>
          <div style={{ fontSize: 13, marginTop: 7, color: '#78350f' }}>
            {pendingReq.billing_cycle === 'year' ? '1 Year' : pendingReq.billing_cycle === 'six_months' ? '6 Months' : '1 Month'} · Rs. {Number(pendingReq.amount).toLocaleString()}<br/>
            Reference: <strong>{pendingReq.transaction_id || '—'}</strong><br/>
            Submitted: {new Date(pendingReq.created_at).toLocaleString()}
          </div>
        </section>
      )}

      <section style={cardStyle}>
        <h3 style={h3Style}>Payment methods</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0 }}>
          Neeche diye gaye active payment method par payment karein. Payment ke baad transaction/reference number yahan submit karein.
        </p>
        {accounts.filter(a => a.is_active !== false).map((a, i) => (
          <div key={a.id || i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 8, background: 'var(--surface-elevated)' }}>
            <div style={{ fontWeight: 800 }}>{a.label || 'Payment Method'}{a.bank_name ? ` · ${a.bank_name}` : ''}</div>
            {a.method_type && <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: 2 }}>{a.method_type}</div>}
            {a.account_title && <div style={{ fontSize: 13, marginTop: 4 }}>Account Title: <strong>{a.account_title}</strong></div>}
            {a.account_number && <CopyRow label="A/C / No." value={a.account_number} onCopy={() => copyText(a.account_number, `account-${a.id}`)} copied={copied === `account-${a.id}`} />}
            {a.iban && <CopyRow label="IBAN" value={a.iban} onCopy={() => copyText(a.iban, `iban-${a.id}`)} copied={copied === `iban-${a.id}`} />}
            {a.qr_url && <div style={{ marginTop: 8 }}><img src={a.qr_url} alt={`${a.label || 'Payment'} QR`} style={{ width: 150, height: 150, objectFit: 'contain', border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }} /></div>}
            {a.instructions && <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-secondary)' }}>{a.instructions}</div>}
          </div>
        ))}
        {accounts.filter(a => a.is_active !== false).length === 0 && <div style={{ color: '#b91c1c', fontSize: 13 }}>Admin ne abhi koi active payment method add nahi kiya.</div>}
      </section>

      {(paymentDue || status === 'active' || status === 'trial' || status === 'overdue' || status === 'sold_out') && !pendingReq && (
        <section style={cardStyle}>
          {!showRenew ? (
            <button type="button" onClick={openRenew} style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', background: paymentDue ? '#dc2626' : 'var(--brand-primary, #0f172a)', color: paymentDue ? '#fff' : 'var(--brand-primary-text, #fff)', fontWeight: 800, fontSize: 15 }}>
              {paymentDue ? 'Renew Subscription' : 'Upgrade / Renew Subscription'}
            </button>
          ) : (
            <form onSubmit={submitPayment}>
              <h3 style={h3Style}>Choose your subscription period</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {PLAN_OPTIONS.map(p => (
                  <button key={p.value} type="button" onClick={() => setPlanChoice(p.value)} style={{ padding: '11px 7px', borderRadius: 9, border: planChoice === p.value ? '2px solid var(--brand-primary)' : '1px solid var(--border)', background: planChoice === p.value ? 'var(--brand-soft)' : 'var(--surface)', fontWeight: 800, fontSize: 12 }}>
                    <div>{p.label}</div>
                    <div style={{ marginTop: 4, fontFamily: 'var(--mono)' }}>Rs. {Number(prices[p.key]).toLocaleString()}</div>
                  </button>
                ))}
              </div>

              <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: 'var(--brand-soft)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Amount to transfer</div>
                <div style={{ fontSize: 24, fontWeight: 900, marginTop: 2 }}>{prices.currency} {amount.toLocaleString()}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>Period: {selectedPlan.label}</div>
              </div>

              <label style={labelStyle}>Payment method *</label>
              <select value={paymentAccountId} onChange={e => setPaymentAccountId(e.target.value)} style={inputStyle} required>
                <option value="">Select payment method</option>
                {accounts.filter(a => a.is_active !== false).map(a => <option key={a.id} value={a.id}>{a.label || a.bank_name || 'Bank Transfer'}</option>)}
              </select>

              <label style={labelStyle}>Transaction ID / Reference *</label>
              <input required value={txnId} onChange={e => setTxnId(e.target.value)} placeholder="e.g. TXN123456789" style={inputStyle} />

              <label style={labelStyle}>Payment proof URL (optional)</label>
              <input value={proofUrl} onChange={e => setProofUrl(e.target.value)} placeholder="Optional screenshot/file link" style={inputStyle} />

              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, fontSize: 13, lineHeight: 1.4 }}>
                <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: 3 }} />
                <span>I have completed the payment of <strong>Rs. {amount.toLocaleString()}</strong> using the payment method shown above.</span>
              </label>

              <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontSize: 12 }}>
                Important: Submit karne se subscription immediately paid nahi hogi. Admin payment/reference verify karega. Verification ke baad green Approved status aur new expiry date apply hogi.
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="button" onClick={() => setShowRenew(false)} style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 700 }}>Cancel</button>
                <button type="submit" disabled={busy || !confirmed || !txnId.trim() || !paymentAccountId} style={{ flex: 2, padding: 12, borderRadius: 8, border: 'none', background: '#0f172a', color: '#fff', fontWeight: 800, opacity: busy || !confirmed || !txnId.trim() || !paymentAccountId ? 0.55 : 1 }}>
                  {busy ? 'Sending…' : 'I Have Paid — Submit for Verification'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {copied && <div style={noticeStyle('#ecfdf5', '#166534')}>✓ Copied</div>}
      {msg && <div style={noticeStyle('#ecfdf5', '#166534')}>✓ {msg}</div>}
      {err && <div style={noticeStyle('#fee2e2', '#991b1b')}>⚠ {err}</div>}

      {myRequests.length > 0 && (
        <section style={cardStyle}>
          <h3 style={h3Style}>Payment history</h3>
          {myRequests.slice(0, 8).map(r => (
            <div key={r.id} style={{ borderBottom: '1px solid var(--border)', padding: '9px 0', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{r.billing_cycle === 'year' ? '1 Year' : r.billing_cycle === 'six_months' ? '6 Months' : '1 Month'} · Rs. {Number(r.amount).toLocaleString()}</span>
                <span style={{ fontWeight: 800, color: r.status === 'approved' ? '#15803d' : r.status === 'rejected' ? '#b91c1c' : '#b45309' }}>
                  {r.status === 'approved' ? '✓ Approved' : r.status === 'rejected' ? 'Rejected' : 'Pending'}
                </span>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>{new Date(r.created_at).toLocaleString()} · {r.transaction_id || '—'}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function CopyRow({ label, value, onCopy, copied }) {
  return <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4, minWidth: 0 }}>
    <span style={{ fontSize: 13, minWidth: 42 }}>{label}:</span>
    <span style={{ fontSize: 13, fontFamily: 'var(--mono)', overflowWrap: 'anywhere', flex: 1 }}>{value}</span>
    <button type="button" onClick={onCopy} style={{ border: '1px solid var(--border)', borderRadius: 7, padding: '4px 7px', background: 'var(--surface)', fontSize: 11, fontWeight: 700 }}>{copied ? '✓' : 'Copy'}</button>
  </div>
}

function noticeStyle(background, color) {
  return { padding: 12, borderRadius: 10, background, color, fontSize: 13, fontWeight: 600, marginBottom: 12 }
}

function Row({ label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--line)', fontSize: 13 }}>
    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
    <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
  </div>
}

const cardStyle = { background: 'var(--surface, #fff)', border: '1px solid var(--line, #e5e5e5)', borderRadius: 12, padding: 16, marginBottom: 14 }
const h3Style = { margin: '0 0 12px', fontSize: 15, fontWeight: 700 }
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 10, color: 'var(--text-secondary)' }
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 14, background: 'var(--surface)', color: 'var(--ink)' }
