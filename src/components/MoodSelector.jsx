import { useT } from '../i18n/useT.js'

// id is stored in the DB / matched against deal mood_tags — never translate it.
// key is the translation key for the label.
const MOODS = [
  { id: 'hungry', emoji: '🤤', key: 'mood_hungry' },
  { id: 'celebrating', emoji: '🎉', key: 'mood_celebrating' },
  { id: 'chill', emoji: '😌', key: 'mood_chill' },
  { id: 'spicy', emoji: '🔥', key: 'mood_spicy' },
  { id: 'family', emoji: '👨‍👩‍👧‍👦', key: 'mood_family' },
  { id: 'quick', emoji: '⚡', key: 'mood_quick' },
]

export default function MoodSelector({ value, onChange }) {
  const { t } = useT()
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#78716c', marginBottom: 6 }}>
        {t('mood_title')}
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
              <span>{t(m.key)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { MOODS }
