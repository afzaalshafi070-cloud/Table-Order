import { useState } from 'react'

export default function NoteBar({ note, onNoteChange }) {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ padding: '0 16px 4px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: note ? 'var(--brand-primary)' : '#fff',
          color: note ? 'var(--brand-primary-text)' : 'var(--ink)',
          border: '1px solid var(--line)', borderRadius: 999,
          padding: '8px 14px', fontSize: 13, fontWeight: 600
        }}>
        📝 {note ? 'Note added — tap to edit' : 'Add a special instruction'}
      </button>

      {open && (
        <div className="fade-slide-up" style={{ marginTop: 8 }}>
          <textarea
            autoFocus
            value={note}
            onChange={e => onNoteChange(e.target.value)}
            placeholder="e.g. no onions, extra spicy, sauce on the side…"
            rows={2}
            style={{
              width: '100%', background: '#fff', border: '1px solid var(--line)',
              borderRadius: 10, padding: 10, fontSize: 14, resize: 'none', color: 'var(--ink)'
            }}
          />
        </div>
      )}
    </div>
  )
}
