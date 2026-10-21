import { useState } from 'react'
import { locationLabel } from '../utils/locationLabel.js'
import OrderTimer from './OrderTimer.jsx'
import InfoTip from './InfoTip.jsx'
import { useT } from '../i18n/useT.js'

// Status colour per order status; label is a translation key.
const STATUS_META = {
  pending: { labelKey: 'oc_status_new', color: 'var(--mustard)' },
  cooking: { labelKey: 'oc_status_cooking', color: 'var(--sage)' },
  served: { labelKey: 'oc_status_served', color: 'var(--text-muted)' },
}

export default function OrderCard({
  order,
  hasWaterAlert,
  hasWaiterAlert,
  hasBillAlert,
  onAccept,
  onServe,
  onMarkPaid,
  onResolveAlert,
  onPrint,
}) {
  const { t, rtl } = useT()
  const meta = STATUS_META[order.status] || STATUS_META.pending
  const flashing = hasWaterAlert || hasBillAlert
  const isNew = order.status === 'pending'
  const [prepMinutes, setPrepMinutes] = useState('')

  return (
    <div
      className={`ticket-in${isNew ? ' order-new' : ''}`}
      style={{
        background: 'var(--surface)',
        border: flashing
          ? '2px solid var(--sky)'
          : isNew
            ? '2px solid var(--brand-primary)'
            : '1px solid var(--border, var(--line))',
        borderRadius: 'var(--radius)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        animation: flashing ? 'waterFlash 1s infinite' : undefined,
        position: 'relative',
        // Smooth colour change when status moves New -> Cooking -> Served
        transition: 'border-color .35s var(--ease-out, ease), background-color .35s var(--ease-out, ease)',
      }}
    >
      {flashing && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            right: rtl ? undefined : 10,
            left: rtl ? 10 : undefined,
            background: 'var(--sky)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 6,
          }}
        >
          {t('alert_water')}
        </div>
      )}
      {hasWaiterAlert && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            left: rtl ? undefined : 10,
            right: rtl ? 10 : undefined,
            background: 'var(--clay)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 6,
          }}
        >
          {t('alert_waiter')}
        </div>
      )}
      {hasBillAlert && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            left: rtl ? undefined : (hasWaiterAlert ? 90 : 10),
            right: rtl ? (hasWaiterAlert ? 90 : 10) : undefined,
            background: '#0f172a',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 6,
          }}
        >
          {t('alert_bill')}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        <strong style={{ fontFamily: 'var(--mono)', fontSize: 14 }}>
          {order.fulfillment === 'delivery'
            ? 'DELIVERY'
            : order.fulfillment === 'takeaway'
              ? 'TAKEAWAY'
              : locationLabel(order.table_id)}
        </strong>
        <span style={{ fontSize: 11, fontWeight: 700, color: meta.color, transition: 'color .35s var(--ease-out, ease)' }}>
          {t(meta.labelKey).toUpperCase()}
        </span>
      </div>
      {order.fulfillment === 'delivery' && (
        <div
          style={{
            fontSize: 12,
            background: '#e0f2fe',
            borderRadius: 8,
            padding: '6px 8px',
          }}
        >
          {order.area_name && (
            <div>
              <b>{t('oc_area')}</b> {order.area_name}
            </div>
          )}
          {order.customer_name && (
            <div>
              {order.customer_name} · {order.customer_phone}
            </div>
          )}
          {order.customer_address && <div>{order.customer_address}</div>}
        </div>
      )}
      {order.fulfillment === 'takeaway' &&
        (order.customer_name || order.customer_phone) && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {order.customer_name} {order.customer_phone}
          </div>
        )}

      <div style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>
        {order.items.map((it, idx) => (
          <div key={idx}>
            {it.qty} × {it.name}
          </div>
        ))}
      </div>
      {order.note && (
        <div style={{ fontSize: 12, fontStyle: 'italic', color: 'var(--text-muted)' }}>
          {t('oc_note')} {order.note}
        </div>
      )}
      <div style={{ fontFamily: 'var(--mono)', fontSize: 13 }}>
        PKR {Number(order.total).toFixed(0)}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        {order.status === 'pending' && (
          <input
            type="number"
            min={1}
            inputMode="numeric"
            placeholder={t('oc_prep_min')}
            aria-label={t('oc_prep_label')}
            value={prepMinutes}
            onChange={e => setPrepMinutes(e.target.value)}
            style={{ width: 64, borderRadius: 8, border: '1px solid var(--line)', padding: '8px', fontSize: 13, background: 'var(--paper, #fff)', color: 'var(--ink)' }}
          />
        )}
        {order.status === 'pending' && (
          <button
            onClick={() => onAccept(order, prepMinutes)}
            style={{
              flex: 1,
              background: 'var(--sage)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 0',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {t('oc_accept')}
          </button>
        )}
        {order.status === 'cooking' && (
          <button
            onClick={() => onServe(order)}
            style={{
              flex: 1,
              background: 'var(--ink)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 0',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {t('oc_serve')}
          </button>
        )}
        {order.status === 'cooking' && order.prep_ready_at && (
          <OrderTimer readyAt={order.prep_ready_at} compact />
        )}
        {order.status === 'served' && !order.paid_at && (
          <>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mustard)', alignSelf: 'center' }}>{t('oc_billing_pending')}</span>
            <button
              onClick={() => onMarkPaid && onMarkPaid(order)}
              style={{ flex: 1, background: 'var(--sage)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 0', fontWeight: 700, fontSize: 13 }}
            >
              {t('oc_mark_paid')}
            </button>
          </>
        )}
        {order.status === 'served' && order.paid_at && (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--sage)', alignSelf: 'center' }}>{t('oc_paid')}</span>
        )}
        <button
          onClick={() => onPrint(order, 'kot')}
          aria-label={t('oc_kot')}
          style={{
            background: 'var(--paper-dim)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {t('oc_kot')}
        </button>
        <InfoTip helpKey="help_kot" />
        <button
          onClick={() => onPrint(order, 'bill')}
          aria-label={t('oc_bill')}
          style={{
            background: 'var(--paper-dim)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {t('oc_bill')}
        </button>
        <InfoTip helpKey="help_bill" />
        {(hasWaterAlert || hasWaiterAlert) && (
          <button
            onClick={() => onResolveAlert(order.table_id)}
            style={{
              background: 'var(--paper-dim)',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '8px 12px',
              fontSize: 13,
            }}
          >
            {t('oc_clear_flag')}
          </button>
        )}
      </div>
      <style>{`
        @keyframes waterFlash {
          0%, 100% { box-shadow: 0 0 0 0 rgba(63,159,214,0.5); }
          50% { box-shadow: 0 0 0 6px rgba(63,159,214,0.15); }
        }
      `}</style>
    </div>
  )
}
