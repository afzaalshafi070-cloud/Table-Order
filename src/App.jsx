import { Routes, Route, Navigate } from 'react-router-dom'
import CustomerPortal from './pages/CustomerPortal.jsx'
import CounterDashboard from './pages/CounterDashboard.jsx'
import RiderApp from './pages/RiderApp.jsx'
import AdminPanel from './pages/AdminPanel.jsx'
import BrandDelivery from './pages/BrandDelivery.jsx'
import NotFound from './pages/NotFound.jsx'
import OfflineBanner from './components/OfflineBanner.jsx'
import GuideBookLauncher from './components/GuideBookLauncher.jsx'

export default function App() {
  return (
    <>
    <OfflineBanner />
    <GuideBookLauncher />
    <Routes>
      <Route path="/order/:restaurantId/:secret/:tableId" element={<CustomerPortal />} />
      <Route path="/delivery/:restaurantId/:secret" element={<BrandDelivery />} />
      <Route path="/rider/:restaurantId/:linkToken" element={<RiderApp />} />
      <Route path="/dashboard" element={<CounterDashboard />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<NotFound message="This page doesn't exist." />} />
    </Routes>
    </>
  )
}
