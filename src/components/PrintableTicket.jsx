import { locationLabel } from '../utils/locationLabel.js'
export default function PrintableTicket({ order, restaurantName, printWidth = '80mm' }) {
  if (!order) return null

  return (
    <div className="print-slip" style={{
      width: printWidth, fontFamily: 'var(--mono)', fontSize: 12, padding: 8, color: '#000'
    }}>
      <div style={{ textAlign: 'center', fontWeight: 700 }}>{restaurantName}</div>
      <div style={{ textAlign: 'center' }}>KITCHEN TICKET</div>
      <div>--------------------------------</div>
      <div>{locationLabel(order.table_id)}</div>
      <div>{new Date(order.created_at).toLocaleString()}</div>
      <div>--------------------------------</div>
      {order.items.map((it, idx) => (
        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{it.qty}x {it.name}</span>
        </div>
      ))}
      {order.note && (
        <>
          <div>--------------------------------</div>
          <div>Note: {order.note}</div>
        </>
      )}
      <div>--------------------------------</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
        <span>TOTAL</span><span>PKR {Number(order.total).toFixed(0)}</span>
      </div>
    </div>
  )
}
