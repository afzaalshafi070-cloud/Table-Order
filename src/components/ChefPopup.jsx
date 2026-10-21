import { useEffect, useState } from 'react'
import { useT } from '../i18n/useT.js'

export default function ChefPopup({ show, onDone }) {
  const { t } = useT()
  const [visible, setVisible] = useState(show)

  useEffect(() => {
    if (!show) return
    setVisible(true)
    const tm = setTimeout(() => { setVisible(false); onDone?.() }, 4000)
    return () => clearTimeout(tm)
  }, [show, onDone])

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'var(--ink)', color: '#fff',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', padding: 32,
      animation: 'fadeIn 0.3s ease'
    }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>🧑‍🍳</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 600, maxWidth: '32ch' }}>
        {t('chef_preparing')}
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  )
}
