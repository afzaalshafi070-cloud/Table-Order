import { supabase } from '../supabaseClient.js'

const AUTH_KEY = 'tableorder:anonAuth'
const TAB_KEY = 'tableorder:staffTabSecret'
let listenerInstalled = false

function installAuthPersistence() {
  if (listenerInstalled || typeof window === 'undefined') return
  listenerInstalled = true
  supabase.auth.onAuthStateChange((_event, session) => {
    try {
      if (session?.access_token && session?.refresh_token) {
        sessionStorage.setItem(AUTH_KEY, JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        }))
      }
    } catch {}
  })
}

/** Ensure this browser tab has a short-lived Supabase anonymous identity. */
export async function ensureAnonymousAuth() {
  installAuthPersistence()

  // 1. Already have a live session on this client?
  const { data: existing } = await supabase.auth.getSession()
  if (existing?.session?.user) return existing.session.user

  // 2. Restore from sessionStorage if possible
  try {
    const saved = JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null')
    if (saved?.access_token && saved?.refresh_token) {
      const { data, error } = await supabase.auth.setSession(saved)
      if (!error && data?.session?.user) return data.session.user
    }
  } catch {}

  // 3. Create new anonymous session (with retries)
  let lastError = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { data, error } = await supabase.auth.signInAnonymously()
      if (error) {
        lastError = error
        if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
        continue
      }
      if (!data?.user) throw new Error('Anonymous authentication failed.')

      // Critical: wait until the client actually has the session
      // (persistSession:false can leave a race before RPCs see auth.uid())
      for (let i = 0; i < 8; i++) {
        const { data: check } = await supabase.auth.getSession()
        if (check?.session?.user) return check.session.user
        await new Promise(r => setTimeout(r, 80))
      }
      // Fallback – still return the user we got
      return data.user
    } catch (e) {
      lastError = e
      if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
    }
  }

  throw lastError || new Error('Anonymous authentication failed after retries.')
}

export function getOrCreateTabSecret() {
  let value = sessionStorage.getItem(TAB_KEY)
  if (!value) {
    value = crypto.randomUUID()
    sessionStorage.setItem(TAB_KEY, value)
  }
  return value
}

export function clearAnonymousAuth() {
  try {
    sessionStorage.removeItem(AUTH_KEY)
    sessionStorage.removeItem(TAB_KEY)
  } catch {}
}
