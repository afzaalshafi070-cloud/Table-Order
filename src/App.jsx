import { Routes, Route, Navigate } from 'react-router-dom'
import CustomerPortal from './CustomerPortal'
import CounterDashboard from './src/pages/CounterDashboard'
import RiderPortal from './src/pages/RiderPortal'
import NotFound from './src/pages/NotFound'

export default function App() {
  return (
    <Routes>
      {/* ================================================
          Customer Portal - Jab QR code scan karo
          URL Format: /order/:restaurantId/:secret/:tableId
      ================================================ */}
      <Route 
        path="/order/:restaurantId/:secret/:tableId" 
        element={<CustomerPortal />} 
      />

      {/* ================================================
          Rider Portal - Delivery walo ke liye
          URL Format: /rider/:restaurantId/:secret/:areaName
      ================================================ */}
      <Route 
        path="/rider/:restaurantId/:secret/:areaName" 
        element={<RiderPortal />} 
      />

      {/* ================================================
          Counter Dashboard - Staff ke liye
          URL Format: /dashboard (login mangega)
                      /dashboard/:restaurantId/:pin (login mangega)
      ================================================ */}
      <Route 
        path="/dashboard" 
        element={<CounterDashboard />} 
      />
      <Route 
        path="/dashboard/:restaurantId/:pin" 
        element={<CounterDashboard />} 
      />

      {/* ================================================
          Default Route
      ================================================ */}
      <Route 
        path="/" 
        element={<Navigate to="/dashboard" replace />} 
      />

      {/* ================================================
          404 Page
      ================================================ */}
      <Route 
        path="*" 
        element={<NotFound message="Yeh page exist nahi karta" />} 
      />
    </Routes>
  )
}
