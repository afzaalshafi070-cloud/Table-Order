import { locationLabel } from '../utils/locationLabel.js'
import { useT } from '../i18n/useT.js'
import { formatLocalizedDate } from '../i18n/locale.js'

/**
 * ticketType:
 *  - 'kot'  → Kitchen Order Ticket (items + note, no prices)
 *  - 'bill' → Customer bill (items + prices + total)
 */
export default function PrintableTicket({
  order,
  restaurantName,
  ntnNumber,
  strnNumber,
  printWidth = '80mm',
  ticketType = 'kot',
}) {
  const { t, lang } = useT()
  if (!order) return null

  const isBill = ticketType === 'bill'
  const title = isBill ? t('print_bill_title') : t('print_kot_title')
  const where =
    order.fulfillment === 'delivery'
      ? t('print_delivery')
      : order.fulfillment === 'takeaway'
        ? t('print_takeaway')
        : locationLabel(order.table_id)

  return (
    <div
      className="print-slip"
      style={{
        width: printWidth,
        fontFamily: 'var(--mono)',
        fontSize: 12,
        padding: 8,
        color: '#000',
      }}
    >
      <div style={{ textAlign: 'center', fontWeight: 700 }}>{restaurantName}</div>
      {isBill && (ntnNumber || strnNumber) && (
        <div style={{ textAlign: 'center', fontSize: 11 }}>
          {ntnNumber && <div>NTN: {ntnNumber}</div>}
          {strnNumber && <div>STRN: {strnNumber}</div>}
        </div>
      )}
      <div style={{ textAlign: 'center', fontWeight: 700 }}>{title}</div>
      <div>--------------------------------</div>
      <div style={{ fontWeight: 700, fontSize: 14 }}>{where}</div>
      {order.fulfillment === 'delivery' && (
        <>
          <div>{t('print_area')}: {order.area_name}</div>
          <div>
            {order.customer_name} {order.customer_phone}
          </div>
          <div>{order.customer_address}</div>
        </>
      )}
      {(order.fulfillment === 'takeaway' || isBill) &&
        (order.customer_name || order.customer_phone) && (
          <div>
            {order.customer_name} {order.customer_phone}
          </div>
        )}
      <div>{formatLocalizedDate(order.created_at, lang)}</div>
      <div>--------------------------------</div>
      {order.items.map((it, idx) => (
        <div
          key={idx}
          style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}
        >
          <span>
            {it.qty}x {it.name}
          </span>
          {isBill && (
            <span>
              PKR {Number(it.price != null ? it.price * it.qty : 0).toFixed(0)}
            </span>
          )}
        </div>
      ))}
      {order.note && (
        <>
          <div>--------------------------------</div>
          <div>{t('print_note')}: {order.note}</div>
        </>
      )}
      {isBill && (
        <>
          <div>--------------------------------</div>
          {order.delivery_charge > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('print_delivery')}</span>
              <span>PKR {Number(order.delivery_charge).toFixed(0)}</span>
            </div>
          )}
          {order.tax_amount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{order.tax_label || t('print_tax')}</span>
              <span>PKR {Number(order.tax_amount).toFixed(0)}</span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            <span>{t('print_total')}</span>
            <span>PKR {Number(order.total).toFixed(0)}</span>
          </div>
          <div style={{ textAlign: 'center', marginTop: 8 }}>{t('print_thanks')}</div>
        </>
      )}
      {!isBill && (
        <>
          <div>--------------------------------</div>
          <div style={{ textAlign: 'center' }}>*** KOT ***</div>
        </>
      )}
    </div>
  )
}
