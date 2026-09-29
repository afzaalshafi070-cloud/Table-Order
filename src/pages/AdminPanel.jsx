import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { jsPDF } from 'jspdf';

const ADMIN_SESSION_KEY = 'tableorder:adminKey';

export default function AdminPanel() {
  const [adminKey, setAdminKey] = useState('');
  const [authenticated, setAuthenticated] = useState(false);
  const [tab, setTab] = useState('overview');

  // Restaurant update form
  const [restaurantId, setRestaurantId] = useState('');
  const [planAction, setPlanAction] = useState('mark_paid');
  const [days, setDays] = useState(30);
  const [billingCycle, setBillingCycle] = useState('month');

  // Activation code form
  const [newCodes, setNewCodes] = useState('');

  // Data
  const [restaurants, setRestaurants] = useState([]);
  const [activationCodes, setActivationCodes] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // ============================================================
  // RESTORE ADMIN SESSION
  // ============================================================
  useEffect(() => {
    const savedKey = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (savedKey) {
      setAdminKey(savedKey);
      verifyAndLoad(savedKey);
    }
  }, []);

  // ============================================================
  // VERIFY ADMIN KEY - Check if key is valid by attempting to load restaurants
  // ============================================================
  const verifyAndLoad = async (key) => {
    if (!key) return;

    setLoading(true);
    setMessage('');

    try {
      // Try to load restaurants - if this succeeds, the key is valid
      const { data, error } = await supabase.rpc('admin_list_restaurants', {
        p_admin_key: key
      });

      if (error) throw error;

      sessionStorage.setItem(ADMIN_SESSION_KEY, key);
      setAuthenticated(true);
      setRestaurants(data || []);

      // Load activation codes
      await loadActivationCodes(key);
    } catch (err) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      setAuthenticated(false);
      setMessage('Invalid Admin Security Key or error loading data: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // LOGIN HANDLER
  // ============================================================
  const handleLogin = async (e) => {
    e.preventDefault();
    const key = adminKey.trim();
    if (!key) {
      setMessage('Please enter Admin Security Key');
      return;
    }
    await verifyAndLoad(key);
  };

  // ============================================================
  // LOAD RESTAURANTS
  // ============================================================
  const loadRestaurants = async (key = adminKey) => {
    if (!key) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_list_restaurants', {
        p_admin_key: key
      });
      if (error) throw error;
      setRestaurants(data || []);
    } catch (err) {
      setMessage('Failed to load restaurants: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // LOAD ACTIVATION CODES
  // ============================================================
  const loadActivationCodes = async (key = adminKey) => {
    if (!key) return;
    try {
      const { data, error } = await supabase.rpc('admin_list_codes', {
        p_admin_key: key
      });
      if (error) throw error;
      setActivationCodes(data || []);
    } catch (err) {
      setMessage('Failed to load codes: ' + (err?.message || 'Unknown error'));
    }
  };

  // ============================================================
  // UPDATE RESTAURANT PLAN
  // ============================================================
  const handleUpdatePlan = async (e) => {
    e.preventDefault();
    const cleanRestaurantId = restaurantId.trim();

    if (!cleanRestaurantId) {
      setMessage('Please enter Restaurant ID');
      return;
    }

    const numericDays = parseInt(days, 10);
    if (planAction !== 'sold_out' && planAction !== 'complimentary' &&
      (!Number.isInteger(numericDays) || numericDays <= 0 || numericDays > 3650)) {
      setMessage('Days must be between 1 and 3650');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { data, error } = await supabase.rpc('admin_update_plan', {
        p_admin_key: adminKey,
        p_restaurant_id: cleanRestaurantId,
        p_action: planAction,
        p_days: (planAction !== 'sold_out' && planAction !== 'complimentary') ? numericDays : null,
        p_billing_cycle: billingCycle
      });

      if (error) throw error;

      setMessage('Plan updated successfully!');
      setRestaurantId('');
      await loadRestaurants(adminKey);
    } catch (err) {
      setMessage('Failed to update plan: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // CREATE ACTIVATION CODES
  // ============================================================
  const handleCreateCodes = async (e) => {
    e.preventDefault();

    if (!newCodes.trim()) {
      setMessage('Please enter at least one code');
      return;
    }

    const codes = newCodes.split('\n').map(c => c.trim()).filter(c => c.length > 0);

    if (codes.length === 0) {
      setMessage('No valid codes found');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { data, error } = await supabase.rpc('admin_create_codes', {
        p_admin_key: adminKey,
        p_codes: codes
      });

      if (error) throw error;

      setMessage(`Created ${data?.inserted || 0} activation codes`);
      setNewCodes('');
      await loadActivationCodes(adminKey);
    } catch (err) {
      setMessage('Failed to create codes: ' + (err?.message || 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // GENERATE PDF REPORT
  // ============================================================
  const generateRestaurantListPDF = () => {
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const left = 40;
      let y = 40;
      const pageHeight = doc.internal.pageSize.height;
      const pageWidth = doc.internal.pageSize.width;

      // Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Restaurant Management Report', left, y);
      y += 20;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated: ${new Date().toLocaleString()}`, left, y);
      y += 20;

      // Table headers
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      const colWidths = {
        name: 100,
        id: 80,
        status: 70,
        plan: 70,
        dueDate: 90
      };

      doc.text('Restaurant', left, y);
      doc.text('ID', left + colWidths.name, y);
      doc.text('Status', left + colWidths.name + colWidths.id, y);
      doc.text('Plan', left + colWidths.name + colWidths.id + colWidths.status, y);
      doc.text('Due Date', left + colWidths.name + colWidths.id + colWidths.status + colWidths.plan, y);

      y += 2;
      doc.line(left, y, pageWidth - left, y);
      y += 10;

      // Table rows
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      restaurants.forEach((r) => {
        if (y > pageHeight - 40) {
          doc.addPage();
          y = 40;
        }

        const dueDate = r.paid_until ? new Date(r.paid_until).toLocaleDateString() : '-';
        doc.text(r.restaurant_name || r.restaurant_id, left, y);
        doc.text(r.restaurant_id.substring(0, 20), left + colWidths.name, y);
        doc.text(r.plan_status, left + colWidths.name + colWidths.id, y);
        doc.text(r.plan_status === 'trial' ? 'Trial' : r.billing_cycle === 'year' ? 'Yearly' : 'Monthly', left + colWidths.name + colWidths.id + colWidths.status, y);
        doc.text(dueDate, left + colWidths.name + colWidths.id + colWidths.status + colWidths.plan, y);

        y += 12;
      });

      doc.save(`restaurant-list-${new Date().toISOString().split('T')[0]}.pdf`);
      setMessage('PDF downloaded successfully');
    } catch (err) {
      setMessage('Failed to generate PDF: ' + (err?.message || 'Unknown error'));
    }
  };

  // ============================================================
  // GENERATE DETAILED PDF FOR A RESTAURANT
  // ============================================================
  const generateRestaurantDetailPDF = (restaurant) => {
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const left = 40;
      let y = 40;

      // Header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text('Restaurant Detail Report', left, y);
      y += 20;

      // Restaurant Info
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);

      const info = [
        ['Restaurant Name', restaurant.restaurant_name || restaurant.restaurant_id],
        ['Restaurant ID', restaurant.restaurant_id],
        ['Status', restaurant.plan_status],
        ['Plan Type', restaurant.billing_cycle === 'year' ? 'Yearly' : 'Monthly'],
        ['Activated', new Date(restaurant.activated_at).toLocaleDateString()],
        ['Joined Date', new Date(restaurant.activated_at).toLocaleDateString()],
      ];

      if (restaurant.trial_ends_at) {
        info.push(['Trial Ends', new Date(restaurant.trial_ends_at).toLocaleDateString()]);
      }

      if (restaurant.paid_until) {
        info.push(['Paid Until', new Date(restaurant.paid_until).toLocaleDateString()]);
      }

      if (restaurant.grace_ends_at) {
        info.push(['Grace Period Ends', new Date(restaurant.grace_ends_at).toLocaleDateString()]);
      }

      info.push(['Sessions', String(restaurant.session_count || 0)]);
      info.push(['Orders', String(restaurant.order_count || 0)]);
      info.push(['Lifetime Revenue', `PKR ${(restaurant.lifetime_revenue || 0).toFixed(2)}`]);

      info.forEach(([key, value]) => {
        doc.setFont('helvetica', 'bold');
        doc.text(key + ':', left, y);
        doc.setFont('helvetica', 'normal');
        doc.text(String(value), left + 150, y);
        y += 12;
      });

      doc.save(`restaurant-detail-${restaurant.restaurant_id}-${new Date().toISOString().split('T')[0]}.pdf`);
      setMessage('PDF downloaded successfully');
    } catch (err) {
      setMessage('Failed to generate PDF: ' + (err?.message || 'Unknown error'));
    }
  };

  // ============================================================
  // LOGOUT
  // ============================================================
  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setAdminKey('');
    setAuthenticated(false);
    setRestaurants([]);
    setActivationCodes([]);
    setMessage('');
    setTab('overview');
  };

  // ============================================================
  // LOGIN SCREEN
  // ============================================================
  if (!authenticated) {
    return (
      <div
        style={{
          padding: '20px',
          maxWidth: '420px',
          margin: '40px auto',
          fontFamily: 'Arial, sans-serif',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center'
        }}
      >
        <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>Admin Login</h2>

        {message && (
          <div
            style={{
              color: '#c00',
              background: '#ffecec',
              padding: '12px',
              borderRadius: '6px',
              marginBottom: '20px',
              fontSize: '14px'
            }}
          >
            {message}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="Enter Admin Security Key"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            autoComplete="current-password"
            style={{
              width: '100%',
              padding: '12px',
              marginBottom: '15px',
              boxSizing: 'border-box',
              fontSize: '14px',
              border: '1px solid #ddd',
              borderRadius: '6px'
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? '#ccc' : '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 'bold'
            }}
          >
            {loading ? 'Checking...' : 'Login'}
          </button>
        </form>
      </div>
    );
  }

  // ============================================================
  // TAB BUTTON STYLE
  // ============================================================
  const tabButtonStyle = (active) => ({
    padding: '10px 16px',
    border: 'none',
    borderRadius: '6px',
    background: active ? '#007bff' : '#f0f0f0',
    color: active ? '#fff' : '#000',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '13px',
    marginRight: '8px',
    marginBottom: '8px'
  });

  // ============================================================
  // ADMIN PANEL MAIN SCREEN
  // ============================================================
  return (
    <div
      style={{
        padding: '15px',
        maxWidth: '1200px',
        margin: '0 auto',
        fontFamily: 'Arial, sans-serif',
        minHeight: '100vh',
        background: '#f9f9f9'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '15px',
          flexWrap: 'wrap',
          marginBottom: '20px'
        }}
      >
        <h1 style={{ margin: 0, fontSize: '24px' }}>Admin Management</h1>
        <button
          onClick={handleLogout}
          style={{
            padding: '10px 16px',
            background: '#dc3545',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Logout
        </button>
      </div>

      {message && (
        <div
          style={{
            padding: '12px',
            background: message.includes('successfully') ? '#e8f5e9' : '#ffecec',
            color: message.includes('successfully') ? '#2e7d32' : '#c00',
            borderRadius: '6px',
            marginBottom: '20px'
          }}
        >
          {message}
        </div>
      )}

      {/* Tabs */}
      <div style={{ marginBottom: '20px', borderBottom: '1px solid #ddd', paddingBottom: '10px' }}>
        <button style={tabButtonStyle(tab === 'overview')} onClick={() => setTab('overview')}>
          Overview
        </button>
        <button style={tabButtonStyle(tab === 'restaurants')} onClick={() => setTab('restaurants')}>
          Restaurants
        </button>
        <button style={tabButtonStyle(tab === 'codes')} onClick={() => setTab('codes')}>
          Activation Codes
        </button>
        <button style={tabButtonStyle(tab === 'reports')} onClick={() => setTab('reports')}>
          Reports
        </button>
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div>
          <h2>Dashboard</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
            <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>{restaurants.length}</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>Total Restaurants</div>
            </div>
            <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
                {restaurants.filter(r => r.plan_status === 'trial').length}
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>On Trial</div>
            </div>
            <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffc107' }}>
                {restaurants.filter(r => r.plan_status === 'overdue').length}
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>Overdue</div>
            </div>
            <div style={{ padding: '20px', background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc3545' }}>
                {restaurants.filter(r => r.plan_status === 'sold_out').length}
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>Sold Out</div>
            </div>
          </div>
        </div>
      )}

      {/* RESTAURANTS TAB */}
      {tab === 'restaurants' && (
        <div>
          <h2>Manage Plans</h2>

          {/* Update Plan Form */}
          <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3>Update Restaurant Plan</h3>
            <form onSubmit={handleUpdatePlan}>
              <input
                type="text"
                placeholder="Restaurant ID"
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginBottom: '10px',
                  boxSizing: 'border-box',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              />

              <select
                value={planAction}
                onChange={(e) => setPlanAction(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginBottom: '10px',
                  boxSizing: 'border-box',
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }}
              >
                <option value="mark_paid">Mark As Paid</option>
                <option value="extend_trial">Extend Trial</option>
                <option value="complimentary">Make Complimentary</option>
                <option value="sold_out">Mark Sold Out</option>
              </select>

              {planAction !== 'sold_out' && planAction !== 'complimentary' && (
                <>
                  <input
                    type="number"
                    min="1"
                    max="3650"
                    placeholder="Days"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      marginBottom: '10px',
                      boxSizing: 'border-box',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  />

                  <select
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      marginBottom: '10px',
                      boxSizing: 'border-box',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  >
                    <option value="month">Monthly</option>
                    <option value="year">Yearly</option>
                  </select>
                </>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: loading ? '#ccc' : '#007bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {loading ? 'Updating...' : 'Update Plan'}
              </button>
            </form>
          </div>

          {/* Restaurants List */}
          <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3>All Restaurants</h3>

            {restaurants.length === 0 ? (
              <p>No restaurants found.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>Restaurant</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>Plan</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>Due Date</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>Orders</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>Revenue</th>
                      <th style={{ textAlign: 'center', padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {restaurants.map((r) => (
                      <tr key={r.restaurant_id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '12px', fontSize: '13px' }}>{r.restaurant_name || r.restaurant_id}</td>
                        <td style={{ padding: '12px', fontSize: '13px' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            background:
                              r.plan_status === 'trial' ? '#e3f2fd' :
                                r.plan_status === 'active' ? '#e8f5e9' :
                                  r.plan_status === 'overdue' ? '#fff3e0' : '#ffebee',
                            color:
                              r.plan_status === 'trial' ? '#1976d2' :
                                r.plan_status === 'active' ? '#388e3c' :
                                  r.plan_status === 'overdue' ? '#f57c00' : '#d32f2f',
                            fontSize: '12px'
                          }}>
                            {r.plan_status}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px' }}>
                          {r.plan_status === 'trial' ? 'Trial' : (r.billing_cycle || 'month') === 'year' ? 'Yearly' : 'Monthly'}
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px' }}>
                          {r.paid_until ? new Date(r.paid_until).toLocaleDateString() : r.trial_ends_at ? new Date(r.trial_ends_at).toLocaleDateString() : '-'}
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px' }}>{r.order_count || 0}</td>
                        <td style={{ padding: '12px', fontSize: '13px' }}>PKR {(r.lifetime_revenue || 0).toFixed(0)}</td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <button
                            onClick={() => generateRestaurantDetailPDF(r)}
                            style={{
                              padding: '6px 12px',
                              background: '#28a745',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CODES TAB */}
      {tab === 'codes' && (
        <div>
          <h2>Activation Codes</h2>

          {/* Create Codes Form */}
          <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3>Generate New Codes</h3>
            <form onSubmit={handleCreateCodes}>
              <textarea
                placeholder="Enter codes (one per line)"
                value={newCodes}
                onChange={(e) => setNewCodes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px',
                  marginBottom: '10px',
                  boxSizing: 'border-box',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  minHeight: '100px',
                  fontFamily: 'monospace',
                  fontSize: '13px'
                }}
              />

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: loading ? '#ccc' : '#007bff',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {loading ? 'Creating...' : 'Create Codes'}
              </button>
            </form>
          </div>

          {/* Codes List */}
          <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3>All Codes</h3>

            {activationCodes.length === 0 ? (
              <p>No activation codes found.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #ddd' }}>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>Code</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>Status</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>Used By</th>
                      <th style={{ textAlign: 'left', padding: '12px', fontSize: '13px', fontWeight: 'bold' }}>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activationCodes.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                        <td style={{ padding: '12px', fontSize: '13px', fontFamily: 'monospace' }}>{c.code}</td>
                        <td style={{ padding: '12px', fontSize: '13px' }}>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            background: c.is_used ? '#ffebee' : '#e8f5e9',
                            color: c.is_used ? '#d32f2f' : '#388e3c',
                            fontSize: '12px'
                          }}>
                            {c.is_used ? 'Used' : 'Unused'}
                          </span>
                        </td>
                        <td style={{ padding: '12px', fontSize: '13px' }}>{c.used_by || '-'}</td>
                        <td style={{ padding: '12px', fontSize: '13px' }}>
                          {new Date(c.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REPORTS TAB */}
      {tab === 'reports' && (
        <div>
          <h2>Reports & PDFs</h2>

          <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3>Generate Reports</h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '15px' }}>
              <button
                onClick={generateRestaurantListPDF}
                style={{
                  padding: '20px',
                  background: '#28a745',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                📄 Download Restaurant List PDF
              </button>

              <button
                onClick={() => {
                  try {
                    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
                    const left = 40;
                    let y = 40;

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(16);
                    doc.text('Admin Summary Report', left, y);
                    y += 20;

                    doc.setFontSize(10);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`Generated: ${new Date().toLocaleString()}`, left, y);
                    y += 30;

                    doc.setFont('helvetica', 'bold');
                    doc.text('Summary Statistics', left, y);
                    y += 15;

                    doc.setFont('helvetica', 'normal');
                    const stats = [
                      ['Total Restaurants', restaurants.length],
                      ['Active Restaurants', restaurants.filter(r => r.plan_status === 'active').length],
                      ['Trial Restaurants', restaurants.filter(r => r.plan_status === 'trial').length],
                      ['Overdue Restaurants', restaurants.filter(r => r.plan_status === 'overdue').length],
                      ['Sold Out Restaurants', restaurants.filter(r => r.plan_status === 'sold_out').length],
                      ['Total Orders', restaurants.reduce((sum, r) => sum + (r.order_count || 0), 0)],
                      ['Total Revenue', `PKR ${restaurants.reduce((sum, r) => sum + (r.lifetime_revenue || 0), 0).toFixed(2)}`]
                    ];

                    stats.forEach(([label, value]) => {
                      doc.setFont('helvetica', 'bold');
                      doc.text(label + ':', left, y);
                      doc.setFont('helvetica', 'normal');
                      doc.text(String(value), left + 200, y);
                      y += 15;
                    });

                    doc.save(`admin-summary-${new Date().toISOString().split('T')[0]}.pdf`);
                    setMessage('Summary PDF downloaded successfully');
                  } catch (err) {
                    setMessage('Failed to generate summary: ' + err?.message);
                  }
                }}
                style={{
                  padding: '20px',
                  background: '#17a2b8',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                📊 Download Admin Summary
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
