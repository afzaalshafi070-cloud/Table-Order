// src/components/ErrorBoundary.jsx
// Copy this file into your project

import { Component } from 'react'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCount: 0
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error
    }
  }

  componentDidCatch(error, errorInfo) {
    console.error('❌ Error caught by boundary:', error, errorInfo)

    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }))

    // Send to error tracking service (Sentry if available)
    if (window.Sentry) {
      window.Sentry.captureException(error, {
        contexts: { errorBoundary: errorInfo }
      })
    }

    // Log to console for debugging
    console.error('Error Stack:', error?.stack)
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 24,
            margin: 16,
            background: '#fff3cd',
            border: '2px solid #ffc107',
            borderRadius: 8,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            maxWidth: 600,
            marginLeft: 'auto',
            marginRight: 'auto'
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12, color: '#856404' }}>
            ⚠️ कुछ गलत हुआ
          </div>

          <div style={{ fontSize: 14, color: '#856404', marginBottom: 16 }}>
            <p>App में एक error आ गई है। कृपया नीचे दिए गए बटन दबाएं।</p>
            {process.env.NODE_ENV === 'development' && (
              <div
                style={{
                  background: '#fff',
                  padding: 12,
                  borderRadius: 4,
                  marginTop: 12,
                  fontSize: 12,
                  fontFamily: 'monospace',
                  overflow: 'auto',
                  maxHeight: 200
                }}
              >
                <strong>Error:</strong> {this.state.error?.toString()}
                {this.state.errorInfo && (
                  <details style={{ marginTop: 12 }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                      Stack Trace
                    </summary>
                    <pre style={{ margin: '8px 0 0 0', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '10px 16px',
                background: '#ffc107',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 14
              }}
            >
              🔄 फिर से कोशिश करें
            </button>

            <button
              onClick={() => window.location.href = '/'}
              style={{
                padding: '10px 16px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 14
              }}
            >
              🏠 होम पर जाएं
            </button>

            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 16px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 14
              }}
            >
              ⟳ पेज refresh करें
            </button>
          </div>

          {this.state.errorCount > 3 && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: 4,
                fontSize: 12,
                color: '#721c24'
              }}
            >
              ⚠️ <strong>Note:</strong> कई errors आ रहे हैं। ब्राउज़र cache clear करने की कोशिश करें (Ctrl+Shift+Delete)
            </div>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
