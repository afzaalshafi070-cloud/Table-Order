export default function NotFound({ message }) {
  return (
    <div className="screen error-screen">
      <h1>TICKET VOID</h1>
      <p>{message || "This link is missing something it needs — check the QR code and scan again."}</p>
    </div>
  )
}
