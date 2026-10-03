import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import './styles/global.css'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

function ConfigurationError() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 24,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      background: '#f7f7f7',
      color: '#222'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 560,
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 14,
        padding: 22,
        boxSizing: 'border-box'
      }}>
        <h2 style={{ marginTop: 0 }}>Supabase configuration missing</h2>
        <p style={{ lineHeight: 1.55 }}>
          Vercel build ko Supabase configuration nahi mili. Vercel → Settings →
          Environment Variables mein <b>VITE_SUPABASE_URL</b> aur
          <b> VITE_SUPABASE_ANON_KEY</b> ko Production ke liye enable karein,
          phir fresh redeploy karein.
        </p>
      </div>
    </div>
  )
}

function AppRoot() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return <ConfigurationError />
  }

  return (
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(<AppRoot />)
