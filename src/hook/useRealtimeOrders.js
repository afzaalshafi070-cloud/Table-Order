// src/hooks/useRealtimeOrdersV2.js
// Copy this file into your project

import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../supabaseClient.js'

export function useRealtimeOrders(sessionId, options = {}) {
  const [orders, setOrders] = useState([])
  const [alerts, setAlerts] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState(null)
  
  const subscriptionRef = useRef(null)
  const alertSubscriptionRef = useRef(null)
  const retryCountRef = useRef(0)
  const MAX_RETRIES = 5
  const BASE_BACKOFF = 1000

  // Fetch initial data
  const fetchInitialData = useCallback(async () => {
    try {
      // Fetch orders
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(100)

      if (!ordersError && ordersData) {
        setOrders(ordersData)
      }

      // Fetch alerts
      const { data: alertsData, error: alertsError } = await supabase
        .from('alerts')
        .select('*')
        .eq('session_id', sessionId)
        .eq('resolved', false)

      if (!alertsError && alertsData) {
        setAlerts(alertsData)
      }
    } catch (error) {
      console.error('Error fetching initial data:', error)
      setError(error.message)
    }
  }, [sessionId])

  // Subscribe to order changes
  const subscribeToOrders = useCallback(() => {
    try {
      const subscription = supabase
        .channel(`orders:${sessionId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `session_id=eq.${sessionId}`
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setOrders(prev => [payload.new, ...prev])
              
              // Trigger callback for new orders
              if (options.onNewOrder) {
                options.onNewOrder(payload.new)
              }
            } else if (payload.eventType === 'UPDATE') {
              setOrders(prev =>
                prev.map(o => o.id === payload.new.id ? payload.new : o)
              )
            } else if (payload.eventType === 'DELETE') {
              setOrders(prev => prev.filter(o => o.id !== payload.old.id))
            }
          }
        )
        .on('system', ({ event, status }) => {
          if (status === 'SUBSCRIBED') {
            setIsConnected(true)
            setError(null)
            retryCountRef.current = 0
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            setIsConnected(false)
            handleReconnect()
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Orders realtime connected')
          }
        })

      subscriptionRef.current = subscription
    } catch (error) {
      console.error('Subscribe error:', error)
      setError(error.message)
      handleReconnect()
    }
  }, [sessionId, options])

  // Subscribe to alerts
  const subscribeToAlerts = useCallback(() => {
    try {
      const subscription = supabase
        .channel(`alerts:${sessionId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'alerts',
            filter: `session_id=eq.${sessionId}`
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setAlerts(prev => [payload.new, ...prev])
            } else if (payload.eventType === 'UPDATE') {
              setAlerts(prev =>
                prev.map(a => a.id === payload.new.id ? payload.new : a)
              )
            } else if (payload.eventType === 'DELETE') {
              setAlerts(prev => prev.filter(a => a.id !== payload.old.id))
            }
          }
        )
        .subscribe()

      alertSubscriptionRef.current = subscription
    } catch (error) {
      console.error('Alert subscribe error:', error)
    }
  }, [sessionId])

  const handleReconnect = useCallback(() => {
    if (retryCountRef.current < MAX_RETRIES) {
      retryCountRef.current++
      const backoff = Math.min(
        BASE_BACKOFF * Math.pow(2, retryCountRef.current),
        30000 // Max 30 seconds
      )
      console.log(`🔄 Reconnecting in ${backoff}ms (attempt ${retryCountRef.current}/${MAX_RETRIES})`)
      
      setTimeout(() => {
        subscribeToOrders()
      }, backoff)
    } else {
      console.error('❌ Max reconnection attempts reached')
      setError('Connection failed. Please refresh the page.')
    }
  }, [subscribeToOrders])

  // Main effect
  useEffect(() => {
    if (!sessionId) return

    setIsConnected(false)
    setError(null)
    retryCountRef.current = 0

    // Fetch initial data first
    fetchInitialData()

    // Then subscribe
    subscribeToOrders()
    subscribeToAlerts()

    return () => {
      subscriptionRef.current?.unsubscribe()
      alertSubscriptionRef.current?.unsubscribe()
    }
  }, [sessionId, fetchInitialData, subscribeToOrders, subscribeToAlerts])

  return {
    orders,
    alerts,
    isConnected,
    error
  }
}
