const MOODS = [
  { id: 'hungry', emoji: '🤤', label: 'Hungry' },
  { id: 'celebrating', emoji: '🎉', label: 'Celebrating' },
  { id: 'chill', emoji: '😌', label: 'Chill' },
  { id: 'spicy', emoji: '🔥', label: 'Spicy' },
  { id: 'family', emoji: '👨‍👩‍👧‍👦', label: 'Family' },
  { id: 'quick', emoji: '⚡', label: 'Quick' },
]

export default function MoodSelector({ value, onChange }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#78716c', marginBottom: 6 }}>
        Mood
      </div>
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2,
        scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
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
                display: 'flex', alignItems: 'center', gap: 4,
                border: active ? 'none' : '1px solid var(--line)',
                borderRadius: 999,
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 700,
                background: active ? 'var(--brand-primary)' : '#fff',
                color: active ? 'var(--brand-primary-text)' : 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 13 }}>{m.emoji}</span>
              <span>{m.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { MOODS }
