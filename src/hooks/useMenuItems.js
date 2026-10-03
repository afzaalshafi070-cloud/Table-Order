import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

/**
 * Loads and live-syncs a restaurant's menu_items. Any add/edit/delete made
 * from the counter's Menu Editor reflects on the customer's phone within
 * moments — no app redeploy, no new QR code needed.
 */
export function useMenuItems(sessionId) {
  const [items, setItems] = useState([])

  const load = useCallback(async () => {
    if (!sessionId) return
    const { data } = await supabase
      .from('menu_items')
      .select('*')
      .eq('session_id', sessionId)
      .order('sort_order', { ascending: true })
    setItems(data || [])
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    load()

    const channel = supabase
      .channel(`menu-${sessionId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items', filter: `session_id=eq.${sessionId}` },
        () => load())
      .subscribe((status) => { if (status === 'SUBSCRIBED') load() })

    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [sessionId, load])

  return { items, refresh: load }
}
