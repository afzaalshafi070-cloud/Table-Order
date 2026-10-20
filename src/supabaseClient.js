import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Keep module initialization safe. main.jsx displays a clear configuration
// screen when these build-time variables are missing instead of a white page.
const safeUrl = supabaseUrl || 'https://missing-supabase-config.invalid'
const safeAnonKey = supabaseAnonKey || 'missing-supabase-anon-key'

export const supabase = createClient(safeUrl, safeAnonKey, {
  auth: {
    // Anonymous Auth gives each browser tab a separate authenticated identity.
    // We deliberately do not persist the auth session: the app keeps only its
    // own short-lived tab/session state in sessionStorage.
    persistSession: false,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 10 } }
})

export const supabaseConfig = {
  url: supabaseUrl,
  anonKey: supabaseAnonKey,
  isConfigured: Boolean(supabaseUrl && supabaseAnonKey)
}
