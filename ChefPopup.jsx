import { useEffect, useState } from 'react'

export default function ChefPopup({ show, onDone }) {
  const [visible, setVisible] = useState(show)

  useEffect(() => {
    if (!show) return
    setVisible(true)
    const t = setTimeout(() => { setVisible(false); onDone?.() }, 4000)
    return () => clearTimeout(t)
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
        Chef has started preparing your food!
      </div>
      <div style={{ fontFamily: 'var(--mono)', color: 'var(--mustard)', marginTop: 10, fontSize: 15 }}>
        Estimated wait: 15–20 mins
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  )
}
