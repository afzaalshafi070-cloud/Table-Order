import { Button } from '../components/ui/index.js'

export default function NotFound({ message, onRetry }) {
  return (
    <div className="screen error-screen" role="alert">
      <h1>TICKET VOID</h1>
      <p>{message || "This link is missing something it needs — check the QR code and scan again."}</p>
      {onRetry && (
        <div style={{ marginTop: 16 }}>
          <Button variant="primary" onClick={onRetry}>Try again</Button>
        </div>
      )}
    </div>
  )
}
