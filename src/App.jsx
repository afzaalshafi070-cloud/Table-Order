import { Routes, Route, Navigate } from 'react-router-dom'
import CustomerPortal from './pages/CustomerPortal.jsx'
import CounterDashboard from './pages/CounterDashboard.jsx'
import NotFound from './pages/NotFound.jsx'

export default function App() {
  return (
    <Routes>
      {/* Customer portal: QR code points here per-table. The link carries
          the restaurant's name and a customer-only QR secret — never the
          staff login PIN. */}
      <Route path="/order/:restaurantId/:secret/:tableId" element={<CustomerPortal />} />

      {/* Staff counter portal */}
      <Route path="/dashboard" element={<CounterDashboard />} />
      <Route path="/dashboard/:restaurantId/:pin" element={<CounterDashboard />} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound message="This page doesn't exist." />} />
    </Routes>
  )
}
