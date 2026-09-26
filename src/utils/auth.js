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

  const { data: existing } = await supabase.auth.getSession()
  if (existing?.session?.user) return existing.session.user

  try {
    const saved = JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null')
    if (saved?.access_token && saved?.refresh_token) {
      const { data, error } = await supabase.auth.setSession(saved)
      if (!error && data?.user) return data.user
    }
  } catch {}

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  if (!data?.user) throw new Error('Anonymous authentication failed.')
  return data.user
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
  try { sessionStorage.removeItem(AUTH_KEY) } catch {}
}
