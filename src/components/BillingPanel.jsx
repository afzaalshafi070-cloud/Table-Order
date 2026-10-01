import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { getOrCreateTabSecret } from '../utils/auth.js'

/**
 * Subscription / Billing panel for Counter Dashboard.
 * - Plan + status + dates from restaurant_plans (via planInfo)
 * - Payment methods from central Admin payment_accounts (paymentAccounts)
 * - Restaurant can submit payment request → Pending Verification
 * - Admin approves → automatic renewal (server-side)
 * Restaurant cannot edit plan price, bank details, or expiry.
 */
export default function BillingPanel({
  planInfo,
  paymentAccounts = [],
  restaurantName,
  session,
  onPlanRefresh,
}) {
  const [prices, setPrices] = useState({ monthly: 5000, yearly: 60000, currency: 'PKR' })
  const [myRequests, setMyRequests] = useState([])
  const [livePaymentAccounts, setLivePaymentAccounts] = useState([])
  const [showRenew, setShowRenew] = useState(false)
  const [txnId, setTxnId] = useState('')
  const [method, setMethod] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

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
        yearly: Number(data.yearly) || 60000,
        currency: data.currency || 'PKR',
      })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!session?.id) return
    loadMyRequests()
    loadPaymentAccounts()
  }, [session?.id])

  useEffect(() => {
    if (Array.isArray(paymentAccounts) && paymentAccounts.length > 0) {
      setLivePaymentAccounts(paymentAccounts)
    }
  }, [paymentAccounts])

  async function loadPaymentAccounts() {
    try {
      const { data, error } = await supabase.rpc('list_active_payment_accounts')
      if (!error && Array.isArray(data)) setLivePaymentAccounts(data)
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

  const amount = useMemo(() => {
    return cycle === 'year' ? prices.yearly : prices.monthly
  }, [cycle, prices])

  const daysRemaining = useMemo(() => {
    if (!dueAt) return null
    const end = new Date(dueAt).getTime()
    const now = Date.now()
    return Math.ceil((end - now) / (1000 * 60 * 60 * 24))
  }, [dueAt])

  const statusMeta = useMemo(() => {
    if (status === 'complimentary') return { label: 'Complimentary', color: '#7c3aed', bg: '#f5f3ff' }
    if (status === 'trial') return { label: 'Trial', color: '#0369a1', bg: '#e0f2fe' }
    if (status === 'active') return { label: 'Active', color: '#15803d', bg: '#dcfce7' }
    if (status === 'overdue' || paymentDue) return { label: 'Due / Grace Period', color: '#b45309', bg: '#fef3c7' }
    if (status === 'sold_out' || status === 'expired') return { label: 'Expired', color: '#b91c1c', bg: '#fee2e2' }
    return { label: status || 'Unknown', color: '#444', bg: '#f3f4f6' }
  }, [status, paymentDue])

  const pendingReq = myRequests.find(r => r.status === 'pending')

  async function submitPayment(e) {
    e?.preventDefault?.()
    if (!session?.id) return
    setBusy(true)
    setErr('')
    setMsg('')
    try {
      const secret = getOrCreateTabSecret()
      const selectedMethod = method || (livePaymentAccounts[0]?.label || livePaymentAccounts[0]?.bank_name || 'Bank Transfer')
      const { data, error } = await supabase.rpc('submit_subscription_payment', {
        p_session_id: session.id,
        p_tab_secret: secret,
        p_amount: amount,
        p_method: selectedMethod,
        p_transaction_id: txnId.trim() || null,
        p_payment_date: new Date().toISOString(),
        p_proof_url: null,
        p_billing_cycle: cycle === 'year' ? 'year' : 'month',
      })
      if (error) throw error
      setMsg('Payment submitted — Pending Verification')
      setTxnId('')
      setShowRenew(false)
      await loadMyRequests()
      onPlanRefresh?.()
    } catch (ex) {
      const m = String(ex?.message || ex)
      if (m.includes('PENDING_REQUEST_EXISTS')) {
        setErr('Aapka ek payment request already pending hai. Admin verification ka intezar karein.')
      } else {
        setErr(m || 'Submit failed')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--display)', fontSize: 22 }}>
        Subscription
      </h2>

      {/* Current subscription card */}
      <section style={cardStyle}>
        <h3 style={h3Style}>Current plan</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-block', padding: '4px 12px', borderRadius: 999,
            fontSize: 13, fontWeight: 700, color: statusMeta.color, background: statusMeta.bg,
          }}>
            {statusMeta.label}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-secondary, #666)' }}>
            {cycle === 'year' ? 'Yearly' : cycle === 'month' ? 'Monthly' : cycle}
          </span>
        </div>

        <Row label="Restaurant" value={restaurantName || '—'} />
        <Row label="Current Plan" value={cycle === 'year' ? 'Yearly' : 'Monthly'} />
        <Row
          label="Subscription Amount"
          value={`Rs. ${Number(amount).toLocaleString()}`}
        />
        <Row
          label="Start Date"
          value={startAt ? new Date(startAt).toLocaleDateString() : '—'}
        />
        <Row
          label="Expiry Date"
          value={dueAt ? new Date(dueAt).toLocaleDateString() : '—'}
        />
        {daysRemaining != null && (
          <Row
            label="Days Remaining"
            value={
              daysRemaining < 0
                ? `Overdue ${Math.abs(daysRemaining)} day(s)`
                : `${daysRemaining} day(s)`
            }
          />
        )}
        {graceEnds && (
          <Row label="Grace ends" value={new Date(graceEnds).toLocaleString()} />
        )}
      </section>

      {/* Pending verification banner */}
      {pendingReq && (
        <section style={{
          ...cardStyle,
          background: '#fffbeb',
          border: '1px solid #fbbf24',
        }}>
          <strong style={{ color: '#92400e' }}>Payment Status: Pending Verification</strong>
          <div style={{ fontSize: 13, marginTop: 8, color: '#78350f' }}>
            Amount: Rs. {Number(pendingReq.amount).toLocaleString()} · Txn: {pendingReq.transaction_id || '—'}
            <br />
            Submitted: {new Date(pendingReq.created_at).toLocaleString()}
          </div>
        </section>
      )}

      {/* Admin payment methods (read-only) */}
      <section style={cardStyle}>
        <h3 style={h3Style}>Pay Subscription</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary, #555)', margin: '0 0 12px' }}>
          Admin Panel se configured payment method. Restaurant owner sirf pay + submit kar sakta hai —
          bank details / amount change nahi ho sakte.
        </p>

        {(livePaymentAccounts || []).length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-muted, #888)', margin: 0 }}>
            Koi payment account set nahi. Admin se rabta karein.
          </p>
        )}

        {(livePaymentAccounts || []).map((a, i) => (
          <div
            key={a.id || i}
            style={{
              border: '1px solid var(--border, #e5e5e5)',
              borderRadius: 10,
              padding: 12,
              marginBottom: 8,
              background: 'var(--surface-elevated, #fafafa)',
            }}
          >
            <div style={{ fontWeight: 700 }}>
              {a.label || a.method_type || 'Payment'} · {a.bank_name || ''}
            </div>
            {a.account_title && (
              <div style={{ fontSize: 13 }}>Account Title: {a.account_title}</div>
            )}
            {a.account_number && (
              <div style={{ fontSize: 13, fontFamily: 'var(--mono, monospace)' }}>
                A/C: {a.account_number}
              </div>
            )}
            {a.iban && (
              <div style={{ fontSize: 12, fontFamily: 'var(--mono, monospace)' }}>
                IBAN: {a.iban}
              </div>
            )}
            {a.instructions && (
              <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-secondary, #555)' }}>
                {a.instructions}
              </div>
            )}
            {a.qr_url && (
              <div style={{ marginTop: 8 }}>
                <img
                  src={a.qr_url}
                  alt="Payment QR"
                  style={{ maxWidth: 160, borderRadius: 8, border: '1px solid var(--border, #ddd)' }}
                />
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Renew / Submit */}
      {(paymentDue || status === 'active' || status === 'trial' || status === 'overdue' || status === 'sold_out') && !pendingReq && (
        <section style={cardStyle}>
          {!showRenew ? (
            <button
              type="button"
              onClick={() => setShowRenew(true)}
              style={{
                width: '100%',
                padding: 14,
                borderRadius: 10,
                border: 'none',
                background: paymentDue ? '#dc2626' : 'var(--brand-primary, #0f172a)',
                color: paymentDue ? '#fff' : 'var(--brand-primary-text, #fff)',
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
              }}
            >
              {paymentDue ? 'Renew Subscription' : 'Pay / Renew Subscription'}
            </button>
          ) : (
            <form onSubmit={submitPayment}>
              <h3 style={h3Style}>
                Renew {cycle === 'year' ? 'Yearly' : 'Monthly'} Plan — Rs. {Number(amount).toLocaleString()}
              </h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary, #555)', marginTop: 0 }}>
                Amount Admin plan se automatic. Payment method upar dikhaya gaya hai.
              </p>

              <label style={labelStyle}>Payment Method</label>
              <select
                value={method}
                onChange={e => setMethod(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select (optional)</option>
                {(livePaymentAccounts || []).map((a, i) => (
                  <option key={a.id || i} value={a.label || a.bank_name || 'Bank'}>
                    {a.label || a.bank_name || 'Bank Transfer'}
                  </option>
                ))}
              </select>

              <label style={labelStyle}>Transaction ID / Reference *</label>
              <input
                required
                value={txnId}
                onChange={e => setTxnId(e.target.value)}
                placeholder="e.g. TXN123456 / bank ref"
                style={inputStyle}
              />

              <label style={labelStyle}>Payment Date</label>
              <input
                type="text"
                readOnly
                value={new Date().toLocaleString()}
                style={{ ...inputStyle, opacity: 0.85 }}
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowRenew(false)}
                  style={{
                    flex: 1, padding: 12, borderRadius: 8, border: '1px solid var(--border, #ddd)',
                    background: 'var(--surface, #fff)', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !txnId.trim()}
                  style={{
                    flex: 2, padding: 12, borderRadius: 8, border: 'none',
                    background: '#0f172a', color: '#fff', fontWeight: 700, cursor: busy ? 'wait' : 'pointer',
                    opacity: busy || !txnId.trim() ? 0.6 : 1,
                  }}
                >
                  {busy ? 'Submitting…' : 'Submit Payment'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {msg && (
        <div style={{ padding: 12, borderRadius: 10, background: '#dcfce7', color: '#166534', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          {msg}
        </div>
      )}
      {err && (
        <div style={{ padding: 12, borderRadius: 10, background: '#fee2e2', color: '#991b1b', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          {err}
        </div>
      )}

      {/* History */}
      {myRequests.length > 0 && (
        <section style={cardStyle}>
          <h3 style={h3Style}>Payment history</h3>
          {myRequests.slice(0, 8).map(r => (
            <div
              key={r.id}
              style={{
                borderBottom: '1px solid var(--border, #eee)',
                padding: '8px 0',
                fontSize: 13,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>Rs. {Number(r.amount).toLocaleString()}</span>
                <span style={{
                  fontWeight: 700,
                  color: r.status === 'approved' ? '#15803d' : r.status === 'rejected' ? '#b91c1c' : '#b45309',
                }}>
                  {r.status}
                </span>
              </div>
              <div style={{ color: 'var(--text-muted, #888)', fontSize: 12 }}>
                {new Date(r.created_at).toLocaleString()} · {r.transaction_id || '—'}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', gap: 12,
      padding: '6px 0', borderBottom: '1px solid var(--line, #eee)', fontSize: 13,
    }}>
      <span style={{ color: 'var(--text-secondary, #666)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

const cardStyle = {
  background: 'var(--surface, #fff)',
  border: '1px solid var(--line, #e5e5e5)',
  borderRadius: 12,
  padding: 16,
  marginBottom: 14,
}

const h3Style = {
  margin: '0 0 12px',
  fontSize: 15,
  fontWeight: 700,
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  marginTop: 10,
  color: 'var(--text-secondary, #555)',
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 8,
  border: '1px solid var(--border, #ddd)',
  fontSize: 14,
  background: 'var(--surface, #fff)',
  color: 'var(--ink, #111)',
  boxSizing: 'border-box',
}
