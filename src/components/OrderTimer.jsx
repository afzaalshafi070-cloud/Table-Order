import { useEffect, useState } from 'react'
import { useT } from '../i18n/useT.js'

// Live countdown to prep_ready_at. Shows "Ready in mm:ss" or "Late by mm:ss".
export default function OrderTimer({ readyAt, compact = false }) {
  const { t } = useT()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!readyAt) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [readyAt])

  if (!readyAt) return null
  const diff = Math.round((new Date(readyAt).getTime() - now) / 1000)
  const late = diff < 0
  const abs = Math.abs(diff)
  const mm = String(Math.floor(abs / 60)).padStart(2, '0')
  const ss = String(abs % 60).padStart(2, '0')

  const label = late ? t('timer_late', { t: `${mm}:${ss}` }) : t('timer_ready', { t: `${mm}:${ss}` })
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: 'var(--mono)',
        fontWeight: 700,
        fontSize: compact ? 12 : 13,
        padding: compact ? '2px 8px' : '4px 10px',
        borderRadius: 999,
        color: late ? '#fff' : 'var(--ink)',
        background: late ? 'var(--clay, #b4533c)' : 'var(--brand-soft, rgba(127,127,127,.15))',
        border: '1px solid var(--border, var(--line))',
      }}
    >
      ⏱ {label}
    </span>
  )
}
