// src/components/ToastNotifications.jsx
// Copy this file into your project

import { createContext, useContext, useState, useCallback } from 'react'

/**
 * ============================================================
 * TOAST CONTEXT & PROVIDER
 * ============================================================
 */
const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const showToast = useCallback((message, type = 'info', duration = 3000) => {
    const id = Date.now()
    const toast = { id, message, type }

    setToasts(prev => [...prev, toast])

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }

    return id
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

/**
 * ============================================================
 * USE TOAST HOOK
 * ============================================================
 */
export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

/**
 * ============================================================
 * TOAST CONTAINER
 * ============================================================
 */
function ToastContainer({ toasts, onDismiss }) {
  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 9999,
      pointerEvents: 'none'
    }}>
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          toast={toast}
          onDismiss={() => onDismiss(toast.id)}
        />
      ))}
    </div>
  )
}

/**
 * ============================================================
 * INDIVIDUAL TOAST COMPONENT
 * ============================================================
 */
function Toast({ toast, onDismiss }) {
  const getIcon = (type) => {
    switch (type) {
      case 'success': return '✅'
      case 'error': return '❌'
      case 'warning': return '⚠️'
      case 'info': return 'ℹ️'
      default: return '📢'
    }
  }

  const getColor = (type) => {
    switch (type) {
      case 'success': return '#d4edda'
      case 'error': return '#f8d7da'
      case 'warning': return '#fff3cd'
      case 'info': return '#d1ecf1'
      default: return '#e2e3e5'
    }
  }

  const getTextColor = (type) => {
    switch (type) {
      case 'success': return '#155724'
      case 'error': return '#721c24'
      case 'warning': return '#856404'
      case 'info': return '#0c5460'
      default: return '#383d41'
    }
  }

  const getBorderColor = (type) => {
    switch (type) {
      case 'success': return '#c3e6cb'
      case 'error': return '#f5c6cb'
      case 'warning': return '#ffeeba'
      case 'info': return '#bee5eb'
      default: return '#d6d8db'
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        marginBottom: 12,
        background: getColor(toast.type),
        border: `1px solid ${getBorderColor(toast.type)}`,
        borderRadius: 6,
        color: getTextColor(toast.type),
        fontSize: 14,
        maxWidth: 300,
        pointerEvents: 'auto',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        animation: 'slideIn 0.3s ease-out'
      }}
    >
      <span style={{ fontSize: 20 }}>{getIcon(toast.type)}</span>
      <span style={{ flex: 1, wordWrap: 'break-word' }}>
        {toast.message}
      </span>
      <button
        onClick={onDismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 16,
          padding: 0,
          lineHeight: 1,
          opacity: 0.7,
          transition: 'opacity 0.2s'
        }}
        onMouseEnter={e => e.target.style.opacity = 1}
        onMouseLeave={e => e.target.style.opacity = 0.7}
      >
        ×
      </button>

      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  )
}

/**
 * ============================================================
 * USAGE EXAMPLES
 * ============================================================
 * 
 * // In your component:
 * const { showToast } = useToast()
 * 
 * // Success toast (auto-dismisses after 3s)
 * showToast('Order accepted successfully!', 'success')
 * 
 * // Error toast
 * showToast('Payment failed. Try again.', 'error')
 * 
 * // Warning toast
 * showToast('This action cannot be undone', 'warning')
 * 
 * // Info toast
 * showToast('Order status updated', 'info')
 * 
 * // Keep showing (manual dismiss)
 * showToast('Important: Shift will close in 10 minutes', 'warning', 0)
 */
