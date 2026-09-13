export default function MenuList({ items, cart, onAdd, onRemove }) {
  const grouped = (items || []).reduce((map, item) => {
    map[item.category] = map[item.category] || []
    map[item.category].push(item)
    return map
  }, {})

  const categories = Object.keys(grouped)

  if (categories.length === 0) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: '#9a9284' }}>
        Menu abhi taiyaar ho raha hai — thodi der mein check karein.
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 16px 140px' }}>
      {categories.map((category, catIdx) => (
        <div key={category} className="fade-slide-up" style={{ marginBottom: 28, animationDelay: `${catIdx * 40}ms` }}>
          <h2 style={{
            fontFamily: 'var(--display)', fontSize: 21, fontWeight: 600,
            margin: '0 0 10px', color: 'var(--ink)'
          }}>{category}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {grouped[category].map((item, idx) => {
              const qty = cart[item.id]?.qty || 0
              const available = item.is_available !== false
              return (
                <div key={item.id} className="fade-slide-up card-lift" style={{
                  display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between',
                  background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
                  padding: '12px 14px', opacity: available ? 1 : 0.55,
                  animationDelay: `${catIdx * 40 + idx * 35}ms`,
                  boxShadow: qty > 0 ? '0 0 0 2px var(--brand-primary)' : 'none',
                  transition: 'box-shadow 0.25s ease'
                }}>
                  {item.photo_url ? (
                    <img src={item.photo_url} alt="" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flex: '0 0 auto' }} />
                  ) : (
                    <div style={{
                      width: 48, height: 48, borderRadius: 8, background: 'var(--paper-dim)', flex: '0 0 auto',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
                    }}>🍽️</div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: '#7a7264' }}>
                      PKR {item.price}{!available && ' · Sold out'}
                    </div>
                  </div>

                  {!available ? (
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: 'var(--clay)', border: '1px solid var(--clay)',
                      borderRadius: 6, padding: '4px 8px', flex: '0 0 auto'
                    }}>Sold out</span>
                  ) : qty === 0 ? (
                    <button
                      onClick={() => onAdd(item)}
                      aria-label={`Add ${item.name}`}
                      style={{
                        background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', border: 'none',
                        borderRadius: 8, padding: '8px 16px', fontWeight: 600, fontSize: 14, flex: '0 0 auto'
                      }}>Add</button>
                  ) : (
                    <div key={qty} className="pop-in" style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '0 0 auto' }}>
                      <button onClick={() => onRemove(item)} aria-label={`Remove one ${item.name}`}
                        style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--line)', background: '#fff', fontSize: 16 }}>−</button>
                      <span style={{ fontFamily: 'var(--mono)', minWidth: 16, textAlign: 'center' }}>{qty}</span>
                      <button onClick={() => onAdd(item)} aria-label={`Add one more ${item.name}`}
                        style={{ width: 30, height: 30, borderRadius: '50%', border: 'none', background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', fontSize: 16 }}>+</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
