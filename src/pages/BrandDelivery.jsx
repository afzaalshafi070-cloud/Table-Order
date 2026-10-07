import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient.js'
import { ensureAnonymousAuth } from '../utils/auth.js'
import { applyBrandSurface, applyColorMode, applyTheme } from '../utils/theme.js'

/**
 * Brand-level Home Delivery entry (Thank You Card QR).
 * Route: /delivery/:restaurantId/:secret
 * Does NOT lock to the branch that printed the card.
 * Customer picks area → backend resolves eligible branch/session.
 */
export default function BrandDelivery() {
  const { restaurantId, secret } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [areas, setAreas] = useState([])
  const [meta, setMeta] = useState(null)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setLoading(true)
      setError(null)
      try {
        await ensureAnonymousAuth()
        const { data, error: err } = await supabase.rpc('brand_delivery_areas', {
          p_restaurant_id: restaurantId,
          p_brand_secret: secret,
        })
        if (err) throw err
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        setAreas(list)
        if (list.length === 1) setSelected(list[0].area_name || '')
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Invalid delivery QR')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    boot()
    return () => { cancelled = true }
  }, [restaurantId, secret])

  const continueOrder = async () => {
    if (!selected) {
      setError('Delivery area select karein.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await ensureAnonymousAuth()
      const { data, error: err } = await supabase.rpc('brand_delivery_resolve', {
        p_restaurant_id: restaurantId,
        p_brand_secret: secret,
        p_area_name: selected,
      })
      if (err) throw err
      if (!data?.ok) {
        if (data?.code === 'AREA_NOT_COVERED') throw new Error('Is area mein delivery available nahi.')
        if (data?.code === 'NO_ACTIVE_SHIFT') throw new Error('Restaurant abhi shift open nahi. Thodi der baad try karein.')
        throw new Error(data?.code || 'Route nahi mil saka')
      }

      setMeta(data)
      if (data.theme) {
        applyTheme(data.theme)
        applyBrandSurface(data.theme)
      }
      applyColorMode('light')

      // Reuse Customer Portal delivery table id convention
      const tableId = 'takeaway'
      navigate(`/order/${data.restaurant_id}/${data.qr_secret}/${tableId}`, {
        replace: true,
        state: {
          brandDelivery: true,
          branchName: data.branch_name || null,
          deliveryCharge: data.delivery_charge,
          areaName: selected,
        },
      })
    } catch (e) {
      setError(e?.message || 'Continue nahi ho saka')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        Loading delivery…
      </div>
    )
  }

  return (
    <div className="screen brand-surface" style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{
        width: '100%', maxWidth: 420, background: 'var(--surface-elevated, #fff)',
        border: '1px solid var(--border, var(--line))', borderRadius: 16, padding: 24,
        boxShadow: '0 12px 40px rgba(0,0,0,.08)',
      }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
          HOME DELIVERY
        </div>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, color: 'var(--ink)' }}>
          {meta?.restaurant_name || 'Order for delivery'}
        </h1>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          Apna delivery area select karein. Order us branch ko jayega jo aapke area ko cover karti hai —
          card jis branch se mila us se lock nahi.
        </p>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--ink)' }}>
          Delivery area
        </label>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{
            width: '100%', padding: '12px 14px', borderRadius: 10, fontSize: 15,
            border: '1px solid var(--border, var(--line))', background: 'var(--surface, #fff)',
            color: 'var(--ink)', marginBottom: 12, boxSizing: 'border-box',
          }}
        >
          <option value="">Select area…</option>
          {areas.map(a => (
            <option key={a.area_name} value={a.area_name}>
              {a.area_name}{a.charge != null ? ` · PKR ${Number(a.charge).toFixed(0)}` : ''}
            </option>
          ))}
        </select>

        {areas.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--clay, #b44)', marginBottom: 12 }}>
            Abhi koi delivery area configure nahi.
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--clay, #b44)', fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <button
          type="button"
          disabled={busy || !selected}
          onClick={continueOrder}
          style={{
            width: '100%', padding: '12px 0', border: 'none', borderRadius: 10,
            background: 'var(--ink)', color: '#fff', fontWeight: 700, fontSize: 15,
            opacity: busy || !selected ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer',
          }}
        >
          {busy ? 'Routing…' : 'Continue to menu'}
        </button>
      </div>
    </div>
  )
}
