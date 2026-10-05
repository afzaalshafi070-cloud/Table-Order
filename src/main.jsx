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
      minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24,
      fontFamily: 'system-ui, sans-serif', background: '#f7f7f7', color: '#222'
    }}>
      <div style={{ maxWidth: 560, background: '#fff', border: '1px solid #ddd', borderRadius: 14, padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>Supabase configuration missing</h2>
        <p>
          Vercel → Settings → Environment Variables mein
          <b> VITE_SUPABASE_URL</b> aur <b>VITE_SUPABASE_ANON_KEY</b> set karein (Production).
        </p>
      </div>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {!supabaseUrl || !supabaseAnonKey ? (
      <ConfigurationError />
    ) : (
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    )}
  </React.StrictMode>
)
