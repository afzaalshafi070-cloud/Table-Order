import { useEffect, useState } from 'react'

/**
 * Shows a clear, non-blocking banner when the device loses internet.
 * The app keeps running (the shell is cached by the service worker); live
 * orders and status refresh again as soon as the connection returns.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [justBack, setJustBack] = useState(false)

  useEffect(() => {
    let t
    const up = () => { setOnline(true); setJustBack(true); t = setTimeout(() => setJustBack(false), 2200) }
    const down = () => { setOnline(false); setJustBack(false) }
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); clearTimeout(t) }
  }, [])

  if (online && !justBack) return null
  return (
    <div role="status" aria-live="polite" className={`to-offline ${online ? 'to-offline--ok' : ''}`}>
      <span className="to-offline__dot" aria-hidden="true" />
      {online
        ? 'Connection wapas aa gaya. Data refresh ho raha hai.'
        : 'Internet band hai. App khuli rahegi; orders aur status connection aate hi refresh honge.'}
    </div>
  )
}
