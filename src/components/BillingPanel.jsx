import { useMemo } from 'react'

const MONTHLY_PRICE = 5000

/**
 * Billing / Payment panel for Counter Dashboard.
 * Uses existing restaurant_plans + payment_accounts from login/resume.
 * No fake JazzCash/Easypaisa gateway — manual payment workflow only.
 */
export default function BillingPanel({ planInfo, paymentAccounts = [], restaurantName }) {
  const status = (planInfo?.status || planInfo?.plan_status || 'unknown').toLowerCase()
  const cycle = (planInfo?.billing_cycle || 'month').toLowerCase()
  const paymentDue = !!planInfo?.payment_due
  const dueAt = planInfo?.due_at || planInfo?.paid_until || planInfo?.trial_ends_at
  const graceEnds = planInfo?.grace_ends_at

  const statusMeta = useMemo(() => {
    if (status === 'complimentary') {
      return { label: 'Complimentary', color: '#7c3aed', bg: '#f5f3ff' }
    }
    if (status === 'trial') {
      return { label: 'Trial', color: '#0369a1', bg: '#e0f2fe' }
    }
    if (status === 'active') {
      return { label: 'Active', color: '#15803d', bg: '#dcfce7' }
    }
    if (status === 'overdue' || paymentDue) {
      return { label: 'Due / Grace', color: '#b45309', bg: '#fef3c7' }
    }
    if (status === 'sold_out' || status === 'expired') {
      return { label: 'Sold Out', color: '#b91c1c', bg: '#fee2e2' }
    }
    return { label: status || 'Unknown', color: '#444', bg: '#f3f4f6' }
  }, [status, paymentDue])

  const amountDue = paymentDue || status === 'overdue' || status === 'sold_out'
    ? (cycle === 'year' ? MONTHLY_PRICE * 12 : MONTHLY_PRICE)
    : 0

  return (
    <div style={{ padding: 16, maxWidth: 560, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 16px', fontFamily: 'var(--display)', fontSize: 22 }}>
        💳 Billing / Payment
      </h2>

      <section style={cardStyle}>
        <h3 style={h3Style}>Current plan</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 700,
              color: statusMeta.color,
              background: statusMeta.bg,
            }}
          >
            {statusMeta.label}
          </span>
          <span style={{ fontSize: 13, color: '#666' }}>
            {cycle === 'year' ? 'Yearly' : cycle === 'month' ? 'Monthly' : cycle}
          </span>
        </div>

        <Row label="Restaurant" value={restaurantName || '—'} />
        <Row
          label="Due date"
          value={dueAt ? new Date(dueAt).toLocaleString() : '—'}
        />
        {graceEnds && (
          <Row
            label="Grace ends"
            value={new Date(graceEnds).toLocaleString()}
          />
        )}
        <Row
          label="Amount due"
          value={
            amountDue > 0
              ? `Rs. ${amountDue.toLocaleString()}`
              : 'Rs. 0'
          }
        />
      </section>

      <section style={cardStyle}>
        <h3 style={h3Style}>Plans</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          <PlanCard
            title="Monthly"
            price={`Rs. ${MONTHLY_PRICE.toLocaleString()} / month`}
            active={cycle === 'month' && status === 'active'}
          />
          <PlanCard
            title="Yearly"
            price={`Rs. ${(MONTHLY_PRICE * 12).toLocaleString()} / year`}
            active={cycle === 'year' && status === 'active'}
            note="Agar admin ne yearly activate kiya ho"
          />
          <PlanCard
            title="Complimentary"
            price="Free"
            active={status === 'complimentary'}
            note="Admin-granted"
          />
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={h3Style}>Payment instructions</h3>
        <p style={{ fontSize: 13, color: '#555', margin: '0 0 12px' }}>
          Automatic JazzCash / Easypaisa gateway is project mein integrated nahi.
          Neeche diye gaye account par manual payment karein, phir support ko
          reference / proof message karein.
        </p>

        {(paymentAccounts || []).length === 0 && (
          <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
            Koi payment account set nahi. Admin se rabta karein.
          </p>
        )}

        {(paymentAccounts || []).map((a, i) => (
          <div
            key={a.id || i}
            style={{
              border: '1px solid #e5e5e5',
              borderRadius: 10,
              padding: 12,
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 700 }}>{a.label || a.bank_name}</div>
            {a.bank_name && <div style={{ fontSize: 13 }}>{a.bank_name}</div>}
            {a.account_title && (
              <div style={{ fontSize: 13 }}>Title: {a.account_title}</div>
            )}
            {a.account_number && (
              <div style={{ fontSize: 13, fontFamily: 'var(--mono)' }}>
                A/C: {a.account_number}
              </div>
            )}
            {a.iban && (
              <div style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>
                IBAN: {a.iban}
              </div>
            )}
          </div>
        ))}

        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 10,
            background: '#f8fafc',
            fontSize: 13,
            color: '#444',
          }}
        >
          <strong>Payment proof / reference</strong>
          <p style={{ margin: '6px 0 0' }}>
            Payment ke baad transaction ID / screenshot support ko bhejein
            (WhatsApp / email). Admin panel se plan activate / extend hoga.
            Is client mein automatic proof-upload table maujood nahi — manual
            workflow use karein.
          </p>
        </div>
      </section>

      {paymentDue && (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: '#fef2f2',
            border: '2px solid #fca5a5',
            color: '#991b1b',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Payment overdue — grace period mein hain. Grace khatam hone par
          access sold out ho sakta hai (data safe rehta hai).
        </div>
      )}
    </div>
  )
}

function PlanCard({ title, price, active, note }) {
  return (
    <div
      style={{
        border: active ? '2px solid var(--sage)' : '1px solid var(--line)',
        borderRadius: 10,
        padding: 12,
        background: active ? '#f0fdf4' : '#fff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong style={{ fontSize: 14 }}>{title}</strong>
        {active && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>
            CURRENT
          </span>
        )}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{price}</div>
      {note && <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>{note}</div>}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '6px 0',
        borderBottom: '1px solid var(--line)',
        fontSize: 13,
      }}
    >
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

const cardStyle = {
  background: '#fff',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: 16,
  marginBottom: 14,
}

const h3Style = {
  margin: '0 0 12px',
  fontSize: 15,
  fontWeight: 700,
}
