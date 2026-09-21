import { Routes, Route, Navigate } from 'react-router-dom'
import CustomerPortal from './pages/CustomerPortal.jsx'
import CounterDashboard from './pages/CounterDashboard.jsx'
import RiderPortal from './pages/RiderPortal.jsx'
import NotFound from './pages/NotFound.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/order/:restaurantId/:secret/:tableId" element={<CustomerPortal />} />
      <Route path="/rider/:restaurantId/:secret/:areaName" element={<RiderPortal />} />
      <Route path="/dashboard" element={<CounterDashboard />} />
      <Route path="/dashboard/:restaurantId/:pin" element={<CounterDashboard />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound message="This page doesn't exist." />} />
    </Routes>
  )
}
