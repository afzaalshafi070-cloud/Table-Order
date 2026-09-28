import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const ADMIN_SESSION_KEY = 'tableorder:adminKey';

export default function AdminPanel() {
  const [adminKey, setAdminKey] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  const [restaurantId, setRestaurantId] = useState('');
  const [planType, setPlanType] = useState('trial');
  const [days, setDays] = useState(30);

  const [plans, setPlans] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [plansLoading, setPlansLoading] = useState(false);

  // ------------------------------------------------------------
  // Restore admin session after page refresh
  // ------------------------------------------------------------
  useEffect(() => {
    const savedKey = sessionStorage.getItem(ADMIN_SESSION_KEY);

    if (savedKey) {
      setAdminKey(savedKey);
      verifyAndLoad(savedKey);
    }
  }, []);

  // ------------------------------------------------------------
  // Verify admin key + load plans
  // ------------------------------------------------------------
  const verifyAndLoad = async (key) => {
    if (!key) return;

    setLoading(true);
    setMessage('');

    try {
      const { data, error } = await supabase.rpc('verify_admin_key', {
        p_admin_key: key
      });

      if (error) throw error;

      if (data !== true) {
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
        setAuthenticated(false);
        setAdminKey('');
        setMessage('Invalid Admin Security Key');
        return;
      }

      sessionStorage.setItem(ADMIN_SESSION_KEY, key);
      setAuthenticated(true);

      await fetchPlans(key);
    } catch (err) {
      sessionStorage.removeItem(ADMIN_SESSION_KEY);
      setAuthenticated(false);

      setMessage(
        err?.message || 'Admin verification failed.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // Login
  // ------------------------------------------------------------
  const handleLogin = async (e) => {
    e.preventDefault();

    const key = adminKey.trim();

    if (!key) {
      setMessage('Admin Security Key enter karein.');
      return;
    }

    await verifyAndLoad(key);
  };

  // ------------------------------------------------------------
  // Fetch all plans through secure RPC
  // ------------------------------------------------------------
  const fetchPlans = async (key = adminKey) => {
    if (!key) return;

    setPlansLoading(true);

    try {
      const { data, error } = await supabase.rpc(
        'get_all_restaurant_plans',
        {
          p_admin_key: key
        }
      );

      if (error) throw error;

      setPlans(data || []);
    } catch (err) {
      setMessage(
        'Subscriptions load nahi ho sakin: ' +
          (err?.message || 'Unknown error')
      );
    } finally {
      setPlansLoading(false);
    }
  };

  // ------------------------------------------------------------
  // Assign / update restaurant plan
  // ------------------------------------------------------------
  const handleSetPlan = async (e) => {
    e.preventDefault();

    const cleanRestaurantId = restaurantId.trim();
    const numericDays = parseInt(days, 10);

    if (!cleanRestaurantId) {
      setMessage('Restaurant ID enter karein.');
      return;
    }

    if (
      planType !== 'sold_out' &&
      (!Number.isInteger(numericDays) ||
        numericDays <= 0 ||
        numericDays > 3650)
    ) {
      setMessage('Days 1 se 3650 ke darmiyan honay chahiye.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { data, error } = await supabase.rpc(
        'set_restaurant_plan_secure',
        {
          p_admin_key: adminKey,
          p_restaurant_id: cleanRestaurantId,
          p_plan_type: planType,
          p_days:
            planType === 'sold_out'
              ? null
              : numericDays
        }
      );

      if (error) throw error;

      setMessage(
        data?.success
          ? 'Plan updated successfully!'
          : 'Plan update ho gaya.'
      );

      setRestaurantId('');

      await fetchPlans(adminKey);
    } catch (err) {
      setMessage(
        'Failed to update plan: ' +
          (err?.message || 'Unknown error')
      );
    } finally {
      setLoading(false);
    }
  };

  // ------------------------------------------------------------
  // Logout
  // ------------------------------------------------------------
  const handleLogout = () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);

    setAdminKey('');
    setAuthenticated(false);
    setPlans([]);
    setMessage('');
  };

  // ------------------------------------------------------------
  // Login screen
  // ------------------------------------------------------------
  if (!authenticated) {
    return (
      <div
        style={{
          padding: '20px',
          maxWidth: '420px',
          margin: '40px auto',
          fontFamily: 'Arial, sans-serif'
        }}
      >
        <h2>Admin Login</h2>

        {message && (
          <p
            style={{
              color: 'red',
              background: '#ffecec',
              padding: '10px',
              borderRadius: '6px'
            }}
          >
            {message}
          </p>
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
              marginBottom: '10px',
              boxSizing: 'border-box'
            }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Checking...' : 'Login'}
          </button>
        </form>
      </div>
    );
  }

  // ------------------------------------------------------------
  // Admin panel
  // ------------------------------------------------------------
  return (
    <div
      style={{
        padding: '20px',
        maxWidth: '900px',
        margin: '0 auto',
        fontFamily: 'Arial, sans-serif'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap'
        }}
      >
        <h1>Admin Management</h1>

        <button
          onClick={handleLogout}
          style={{
            padding: '9px 14px',
            cursor: 'pointer'
          }}
        >
          Logout
        </button>
      </div>

      {message && (
        <p
          style={{
            padding: '10px',
            background: '#f2f2f2',
            borderRadius: '6px'
          }}
        >
          {message}
        </p>
      )}

      {/* --------------------------------------------------------
          Assign Plan
      --------------------------------------------------------- */}

      <form
        onSubmit={handleSetPlan}
        style={{
          marginTop: '20px',
          marginBottom: '30px',
          padding: '16px',
          border: '1px solid #ddd',
          borderRadius: '8px'
        }}
      >
        <h3>Assign / Update Plan</h3>

        <input
          type="text"
          placeholder="Restaurant ID"
          value={restaurantId}
          onChange={(e) => setRestaurantId(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            marginBottom: '10px',
            boxSizing: 'border-box'
          }}
        />

        <select
          value={planType}
          onChange={(e) => setPlanType(e.target.value)}
          style={{
            width: '100%',
            padding: '10px',
            marginBottom: '10px'
          }}
        >
          <option value="trial">Trial</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
          <option value="complimentary">
            Complimentary
          </option>
          <option value="sold_out">Sold Out</option>
        </select>

        {planType !== 'sold_out' && (
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
              boxSizing: 'border-box'
            }}
          />
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '12px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Updating...' : 'Update Plan'}
        </button>
      </form>

      {/* --------------------------------------------------------
          Subscriptions
      --------------------------------------------------------- */}

      <div>
        <h3>All Subscriptions</h3>

        {plansLoading ? (
          <p>Loading subscriptions...</p>
        ) : plans.length === 0 ? (
          <p>No restaurant plans found.</p>
        ) : (
          <div
            style={{
              overflowX: 'auto'
            }}
          >
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: '650px'
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '10px',
                      borderBottom: '1px solid #ddd'
                    }}
                  >
                    Restaurant
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '10px',
                      borderBottom: '1px solid #ddd'
                    }}
                  >
                    Plan
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '10px',
                      borderBottom: '1px solid #ddd'
                    }}
                  >
                    Status
                  </th>

                  <th
                    style={{
                      textAlign: 'left',
                      padding: '10px',
                      borderBottom: '1px solid #ddd'
                    }}
                  >
                    Due Date
                  </th>
                </tr>
              </thead>

              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td
                      style={{
                        padding: '10px',
                        borderBottom: '1px solid #eee'
                      }}
                    >
                      {p.restaurant_id}
                    </td>

                    <td
                      style={{
                        padding: '10px',
                        borderBottom: '1px solid #eee'
                      }}
                    >
                      {p.plan_type}
                    </td>

                    <td
                      style={{
                        padding: '10px',
                        borderBottom: '1px solid #eee'
                      }}
                    >
                      {p.status}
                    </td>

                    <td
                      style={{
                        padding: '10px',
                        borderBottom: '1px solid #eee'
                      }}
                    >
                      {p.due_date
                        ? new Date(
                            p.due_date
                          ).toLocaleString()
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
                    }
