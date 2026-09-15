export default function NotFound({ message = "This page doesn't exist." }) {
  return (
    <div className="screen" style={{
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      textAlign: 'center',
      minHeight: '100dvh',
      background: 'var(--paper, #f7f4ef)'
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: 'var(--paper-dim, #ebe6de)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, marginBottom: 16
      }}>
        📋
      </div>
      <h1 style={{
        fontFamily: 'var(--serif, Fraunces, serif)',
        fontSize: 22, margin: '0 0 8px', color: 'var(--ink, #1c1917)'
      }}>
        Something’s not right
      </h1>
      <p style={{
        color: 'var(--ink-muted, #78716c)',
        fontSize: 14, lineHeight: 1.5, maxWidth: 280, margin: 0
      }}>
        {message}
      </p>
      <p style={{
        marginTop: 24, fontSize: 12, color: 'var(--ink-muted, #a8a29e)'
      }}>
        Ask staff for a fresh QR code if this keeps happening.
      </p>
    </div>
  )
}
