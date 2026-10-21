import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/useT.js'

/**
 * InfoTip — small "i" button next to a complicated step.
 * Tapping it opens a short explanation of that step in the current language.
 *   <InfoTip helpKey="help_orders_accept" />
 * Closes on second tap, on the close button, or on a tap outside.
 */
export default function InfoTip({ helpKey }) {
  const { t, rtl } = useT()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', margin: '0 4px' }}>
      <button
        type="button"
        aria-label={t('info_open')}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          width: 18, height: 18, borderRadius: '50%', padding: 0, cursor: 'pointer',
          border: '1px solid var(--brand-primary, #888)', background: open ? 'var(--brand-primary, #888)' : 'transparent',
          color: open ? 'var(--brand-primary-text, #fff)' : 'var(--brand-primary, #555)',
          fontSize: 11, fontWeight: 800, fontStyle: 'italic', fontFamily: 'Georgia, serif', lineHeight: '16px',
        }}
      >i</button>
      {open && (
        <span
          role="note"
          style={{
            position: 'absolute', zIndex: 60, top: '135%',
            [rtl ? 'right' : 'left']: 0,
            width: 'min(300px, 82vw)', background: 'var(--surface-elevated, #fff)', color: 'var(--ink, #222)',
            border: '1px solid var(--line, #e7e5e4)', borderRadius: 12, padding: 12,
            fontSize: 12, lineHeight: 1.55, fontWeight: 400, textAlign: 'start', whiteSpace: 'normal',
            boxShadow: '0 12px 30px rgba(0,0,0,.18)', display: 'block',
          }}
        >
          <span style={{ display: 'block' }}>{t(helpKey)}</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={{
              marginTop: 8, border: 'none', borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
              background: 'var(--paper-dim, #f5f5f4)', color: 'var(--ink, #222)', fontSize: 11, fontWeight: 700,
            }}
          >{t('info_close')}</button>
        </span>
      )}
    </span>
  )
}
