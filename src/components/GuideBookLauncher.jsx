import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n/useT.js'
import GuideBook from './GuideBook.jsx'

/**
 * Floating guidebook launcher: a small brand-outlined button expands into a
 * decorative scroll and opens the guide in a focused modal.
 */
export default function GuideBookLauncher() {
  const { t, rtl } = useT()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const previousOverflow = document.body.style.overflow
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    const timer = window.setTimeout(() => closeRef.current?.focus(), 0)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(timer)
    }
  }, [open])

  const closeGuide = () => { setOpen(false); window.setTimeout(() => triggerRef.current?.focus(), 0) }

  return (
    <>
      <style>{`
        @keyframes guide-stick-out { 0% { transform: scaleX(.05); opacity: .2; } 70% { transform: scaleX(1.04); opacity: 1; } 100% { transform: scaleX(1); opacity: 1; } }
        @keyframes guide-paper-unroll { from { transform: scaleY(.08); opacity: .25; transform-origin: top; } to { transform: scaleY(1); opacity: 1; transform-origin: top; } }
        @keyframes guide-fade-in { from { opacity: 0; } to { opacity: 1; } }
        .to-guide-fab { transition: transform .22s ease, box-shadow .22s ease; }
        .to-guide-fab:hover { transform: translateY(-3px); box-shadow: 0 10px 26px rgba(0,0,0,.2); }
        @media (prefers-reduced-motion: reduce) { .to-guide-fab, .to-guide-stick, .to-guide-paper { animation: none !important; transition: none !important; } }
      `}</style>
      <button
        ref={triggerRef}
        className="to-guide-fab"
        type="button"
        aria-label={t('guide_open')}
        title={t('guide_open')}
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', zIndex: 80, bottom: 'max(18px, env(safe-area-inset-bottom))',
          [rtl ? 'left' : 'right']: 16,
          width: 54, height: 54, borderRadius: '50%', padding: 0,
          display: 'grid', placeItems: 'center', cursor: 'pointer',
          border: '2px solid var(--brand-primary, #a77935)',
          background: 'var(--surface-elevated, #fff)', color: 'var(--brand-primary, #a77935)',
          boxShadow: '0 5px 18px rgba(0,0,0,.14)',
        }}
      >
        <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21z"/><path d="M4 5.5V21M8 7h8M8 11h8M8 15h5"/>
        </svg>
      </button>
      {open && (
        <div role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) closeGuide() }}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(18, 22, 28, .52)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '14px 12px max(12px, env(safe-area-inset-bottom))', animation: 'guide-fade-in .18s ease' }}>
          <div role="dialog" aria-modal="true" aria-label={t('guide_title')} aria-describedby="table-order-guide-hint"
            style={{ width: 'min(760px, 100%)', maxHeight: '88dvh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div className="to-guide-stick" style={{ height: 15, borderRadius: 10, margin: '0 5px', background: 'linear-gradient(90deg, #7c4b22, #d4a15b, #7c4b22)', boxShadow: '0 3px 8px #0003', animation: 'guide-stick-out .35s ease-out both' }} />
            <div className="to-guide-paper" style={{ marginTop: -2, overflow: 'hidden', borderRadius: '5px 5px 16px 16px', border: '1px solid #d7bd8b', background: 'linear-gradient(135deg, #fffdf5, #f7efd9)', boxShadow: '0 18px 55px rgba(0,0,0,.32)', animation: 'guide-paper-unroll .32s ease-out both', color: '#352b1e' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 16px', borderBottom: '1px solid #e3d3b0', background: 'linear-gradient(90deg, #f2e4c5, #fff8e8)' }}>
                <div>
                  <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', opacity: .7 }}>{t('guide_launcher')}</div>
                  <div style={{ fontSize: 19, fontWeight: 800 }}>{t('guide_title')}</div>
                  <div id="table-order-guide-hint" style={{ fontSize: 12, marginTop: 3, opacity: .8 }}>{t('guide_hint')}</div>
                </div>
                <button ref={closeRef} type="button" onClick={closeGuide} aria-label={t('guide_close')} style={{ border: '1px solid #c8ad7c', background: '#fff9ea', color: '#49351f', borderRadius: 999, padding: '8px 12px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>{t('guide_close')} ×</button>
              </div>
              <div style={{ overflowY: 'auto', padding: '16px clamp(14px, 3vw, 26px)', maxHeight: 'calc(88dvh - 100px)', lineHeight: 1.65 }}>
                <GuideBook />
              </div>
            </div>
            <div style={{ height: 13, borderRadius: 10, margin: '-2px 5px 0', background: 'linear-gradient(90deg, #7c4b22, #d4a15b, #7c4b22)', boxShadow: '0 3px 8px #0003' }} />
          </div>
        </div>
      )}
    </>
  )
}
