import { useState } from 'react'

export default function NoteBar({ note, onNoteChange }) {
  const [open, setOpen] = useState(false)

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
        📝 {note ? 'Note added' : 'Special instruction'}
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          <textarea
            autoFocus
            value={note}
            onChange={e => onNoteChange(e.target.value)}
            placeholder="e.g. no onions, extra spicy…"
            rows={2}
            style={{
              width: '100%', boxSizing: 'border-box', background: '#fff',
              border: '1px solid var(--line)', borderRadius: 10, padding: 10,
              fontSize: 13, resize: 'none', color: 'var(--ink)',
            }}
          />
        </div>
      )}
    </div>
  )
}
