// src/components/ErrorBoundary.jsx
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
    console.error('Error caught by boundary:', error, errorInfo)

    this.setState(prevState => ({
      errorInfo,
      errorCount: prevState.errorCount + 1
    }))

    if (window.Sentry) {
      window.Sentry.captureException(error, {
        contexts: { errorBoundary: errorInfo }
      })
    }

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
            borderRadius: 12,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            maxWidth: 600,
            marginLeft: 'auto',
            marginRight: 'auto'
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12, color: '#856404' }}>
            ⚠️ App mein error aa gayi
          </div>

          <div style={{ fontSize: 14, color: '#856404', marginBottom: 16 }}>
            <p style={{ margin: '0 0 8px' }}>App mein ek error aa gayi hai. Neeche se dobara try karein.</p>
            {import.meta.env.DEV && (
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

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '10px 16px',
                background: '#ffc107',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 14
              }}
            >
              🔄 Phir se koshish karein
            </button>

            <button
              onClick={() => { window.location.href = '/' }}
              style={{
                padding: '10px 16px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 14
              }}
            >
              🏠 Home par jayein
            </button>

            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 16px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 14
              }}
            >
              ⟳ Page refresh karein
            </button>
          </div>

          {this.state.errorCount > 3 && (
            <div
              style={{
                marginTop: 16,
                padding: 12,
                background: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: 8,
                fontSize: 12,
                color: '#721c24'
              }}
            >
              ⚠️ <strong>Note:</strong> Kai errors aa rahe hain. Browser cache clear karke try karein (Ctrl+Shift+Delete).
            </div>
          )}
        </div>
      )
    }

    return this.props.children
  }
}
