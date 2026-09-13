import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'

/**
 * Subscribes to orders + alerts for a given session_id in real time.
 * onNewOrder(order) fires only for freshly INSERTed orders (used to
 * trigger the counter's audible chime without re-firing on updates).
 */
export function useRealtimeOrders(sessionId, { onNewOrder, onNewAlert } = {}) {
  const [orders, setOrders] = useState([])
  const [alerts, setAlerts] = useState([])
  const callbacksRef = useRef({ onNewOrder, onNewAlert })
  callbacksRef.current = { onNewOrder, onNewAlert }

  const loadInitial = useCallback(async () => {
    if (!sessionId) return
    const { data: ordersData } = await supabase
      .from('orders')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    setOrders(ordersData || [])

    const { data: alertsData } = await supabase
      .from('alerts')
      .select('*')
      .eq('session_id', sessionId)
      .eq('resolved', false)
    setAlerts(alertsData || [])
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return
    loadInitial()

    const channel = supabase
      .channel(`room-${sessionId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setOrders(prev => [...prev, payload.new])
          callbacksRef.current.onNewOrder?.(payload.new)
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o))
        })
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'alerts', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setAlerts(prev => [...prev, payload.new])
          callbacksRef.current.onNewAlert?.(payload.new)
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'alerts', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          setAlerts(prev => prev.map(a => a.id === payload.new.id ? payload.new : a).filter(a => !a.resolved))
        })
      .subscribe((status) => {
        // Covers the common mobile case: the tab was backgrounded (or the
        // phone locked), the socket dropped, and it just reconnected —
        // pull a fresh snapshot so nothing missed while offline is lost.
        if (status === 'SUBSCRIBED') loadInitial()
      })

    // Extra safety net: some mobile browsers pause JS timers/sockets in a
    // background tab without firing a clean reconnect event. Refetching
    // whenever the tab/app becomes visible again guarantees the screen is
    // never stuck showing stale tickets after a refresh-free lock/unlock.
    const onVisible = () => { if (document.visibilityState === 'visible') loadInitial() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [sessionId, loadInitial])

  return { orders, alerts, refresh: loadInitial }
}
