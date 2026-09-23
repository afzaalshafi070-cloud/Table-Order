const MOODS = [
  { id: 'hungry', emoji: '🤤', label: 'Hungry' },
  { id: 'celebrating', emoji: '🎉', label: 'Celebrating' },
  { id: 'chill', emoji: '😌', label: 'Chill' },
  { id: 'spicy', emoji: '🔥', label: 'Spicy' },
  { id: 'family', emoji: '👨‍👩‍👧‍👦', label: 'Family' },
  { id: 'quick', emoji: '⚡', label: 'Quick Bite' },
]

export default function MoodSelector({ value, onChange }) {
  return (
    <div style={{ padding: '12px 16px 4px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#5a5346', marginBottom: 8 }}>
        Aaj ka mood kya hai?
      </div>
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6,
        scrollbarWidth: 'none'
      }}>
        {MOODS.map(m => {
          const active = value === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(active ? null : m.id)}
              style={{
                flex: '0 0 auto',
                display: 'flex', alignItems: 'center', gap: 6,
                border: active ? 'none' : '1px solid var(--line)',
                borderRadius: 999,
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 700,
                background: active ? 'var(--brand-primary)' : '#fff',
                color: active ? 'var(--brand-primary-text)' : 'var(--ink)',
                boxShadow: active ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
                cursor: 'pointer',
              }}
            >
              <span>{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { MOODS }
