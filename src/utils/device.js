// Per-browser device token. Used so a known device can be recognised later.
// It is NOT a security secret. Storage is wrapped so blocked storage never breaks login.
const KEY = 'tableorder:deviceToken'

export function getOrCreateDeviceToken() {
  try {
    let t = localStorage.getItem(KEY)
    if (!t || t.length < 16) {
      const bytes = new Uint8Array(24)
      crypto.getRandomValues(bytes)
      t = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
      localStorage.setItem(KEY, t)
    }
    return t
  } catch {
    return ''
  }
}
