import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

/**
 * Loads and live-syncs deals/combos for a session.
 * Filters out expired deals on the client for customer view.
 */
export function useDeals(sessionId, { activeOnly = false } = {}) {
  const [deals, setDeals] = useState([])

  const load = useCallback(async () => {
    if (!sessionId) return
    const { data } = await supabase
      .from('deals')
      .select('*')
      .eq('session_id', sessionId)
      .order('sort_order', { ascending: true })

    let list = data || []
    if (activeOnly) {
      const today = new Date().toISOString().slice(0, 10)
      list = list.filter(d => {
        if (d.is_active === false) return false
        if (d.valid_from && d.valid_from > today) return false
        if (d.valid_until && d.valid_until < today) return false
        return true
      })
    }
    setDeals(list)
  }, [sessionId, activeOnly])

  useEffect(() => {
    if (!sessionId) return
    load()

    const channel = supabase
      .channel(`deals-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deals', filter: `session_id=eq.${sessionId}` },
        () => load()
      )
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

  return { deals, refresh: load }
}
