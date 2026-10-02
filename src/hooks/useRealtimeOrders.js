import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'

export function useRealtimeOrders(sessionId, options = {}) {
  const includeAlerts = options.includeAlerts !== false
  const [orders, setOrders] = useState([])
  const [alerts, setAlerts] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  const callbackRef = useRef(options.onNewOrder)
  const channelsRef = useRef([])
  const retryRef = useRef(0)
  const retryTimerRef = useRef(null)

  useEffect(() => {
    callbackRef.current = options.onNewOrder
  }, [options.onNewOrder])

  useEffect(() => {
    if (!sessionId) {
      setOrders([])
      setAlerts([])
      setIsConnected(false)
      return undefined
    }

    let cancelled = false
    const cleanup = () => {
      channelsRef.current.forEach(channel => supabase.removeChannel(channel))
      channelsRef.current = []
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }

    const fetchInitial = async () => {
      const orderPromise = supabase.from('orders').select('*').eq('session_id', sessionId).order('created_at', { ascending: false }).limit(100)
      const alertPromise = includeAlerts
        ? supabase.from('alerts').select('*').eq('session_id', sessionId).eq('resolved', false).order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null })
      const [{ data: orderRows, error: orderError }, { data: alertRows, error: alertError }] = await Promise.all([orderPromise, alertPromise])
      if (cancelled) return
      if (orderError || alertError) {
        setError(orderError?.message || alertError?.message || 'Realtime data load failed.')
      } else {
        setOrders(orderRows || [])
        setAlerts(alertRows || [])
      }
    }

    const subscribe = () => {
      if (cancelled) return
      cleanup()
      setIsConnected(false)

      const orderChannel = supabase
        .channel(`orders:${sessionId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'orders', filter: `session_id=eq.${sessionId}`
        }, payload => {
          if (payload.eventType === 'INSERT') {
            setOrders(prev => [payload.new, ...prev.filter(o => o.id !== payload.new.id)])
            callbackRef.current?.(payload.new)
          } else if (payload.eventType === 'UPDATE') {
            setOrders(prev => prev.map(o => o.id === payload.new.id ? payload.new : o))
          } else if (payload.eventType === 'DELETE') {
            setOrders(prev => prev.filter(o => o.id !== payload.old.id))
          }
        })
        .subscribe(status => {
          if (cancelled) return
          if (status === 'SUBSCRIBED') {
            setIsConnected(true)
            setError(null)
            retryRef.current = 0
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setIsConnected(false)
            if (retryRef.current < 5) {
              retryRef.current += 1
              const delay = Math.min(1000 * (2 ** retryRef.current), 30000)
              retryTimerRef.current = setTimeout(subscribe, delay)
            } else {
              setError('Realtime connection failed. Refresh the page to retry.')
            }
          }
        })

      let alertChannel = null
      if (includeAlerts) {
        alertChannel = supabase
          .channel(`alerts:${sessionId}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'alerts', filter: `session_id=eq.${sessionId}`
          }, payload => {
            if (payload.eventType === 'INSERT') {
              setAlerts(prev => [payload.new, ...prev.filter(a => a.id !== payload.new.id)])
            } else if (payload.eventType === 'UPDATE') {
              setAlerts(prev => payload.new.resolved
                ? prev.filter(a => a.id !== payload.new.id)
                : prev.map(a => a.id === payload.new.id ? payload.new : a))
            } else if (payload.eventType === 'DELETE') {
              setAlerts(prev => prev.filter(a => a.id !== payload.old.id))
            }
          })
          .subscribe()
      }

      channelsRef.current = [orderChannel, ...(alertChannel ? [alertChannel] : [])]
    }

    fetchInitial()
    subscribe()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [sessionId, includeAlerts])

  return { orders, alerts, isConnected, error }
}
