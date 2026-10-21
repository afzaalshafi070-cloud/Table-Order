import { useState } from 'react'
import { useT } from '../i18n/useT.js'

export default function NoteBar({ note, onNoteChange }) {
  const [open, setOpen] = useState(false)
  const { t } = useT()

  return (
    <div style={{ marginTop: 10 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: note ? 'var(--brand-primary)' : 'transparent',
          color: note ? 'var(--brand-primary-text)' : '#57534e',
          border: note ? 'none' : '1px dashed var(--line)',
          borderRadius: 999,
          padding: '6px 12px', fontSize: 12, fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {note ? t('note_added') : t('note_special')}
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          <textarea
            autoFocus
            value={note}
            onChange={e => onNoteChange(e.target.value)}
            placeholder={t('note_placeholder')}
            rows={2}
            style={{
              width: '100%', boxSizing: 'border-box', background: 'var(--surface-elevated, #fff)',
              border: '1px solid var(--line)', borderRadius: 10, padding: 10,
              fontSize: 13, resize: 'none', color: 'var(--ink)',
            }}
          />
        </div>
      )}
    </div>
  )
}
