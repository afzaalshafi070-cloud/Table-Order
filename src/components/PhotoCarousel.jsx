import { useEffect, useState } from 'react'

export default function PhotoCarousel({ photos }) {
  const [index, setIndex] = useState(0)
  const unique = [...new Set((photos || []).filter(Boolean))]

  useEffect(() => {
    if (unique.length < 2) return
    const t = setInterval(() => setIndex(i => (i + 1) % unique.length), 3000)
    return () => clearInterval(t)
  }, [unique.length])

  if (unique.length === 0) return null

  return (
    <div style={{
      position: 'relative', height: 160, margin: '12px 16px 4px',
      borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--paper-dim)'
    }}>
      {unique.map((url, i) => (
        <img
          key={url}
          src={url}
          alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover',
            opacity: i === index ? 1 : 0, transition: 'opacity 0.7s ease'
          }}
        />
      ))}
      {unique.length > 1 && (
        <div style={{
          position: 'absolute', bottom: 8, left: 0, right: 0,
          display: 'flex', justifyContent: 'center', gap: 6
        }}>
          {unique.map((_, i) => (
            <span key={i} style={{
              width: 6, height: 6, borderRadius: '50%',
              background: i === index ? '#fff' : 'rgba(255,255,255,0.5)',
              boxShadow: '0 0 2px rgba(0,0,0,0.4)'
            }} />
          ))}
        </div>
      )}
    </div>
  )
}
