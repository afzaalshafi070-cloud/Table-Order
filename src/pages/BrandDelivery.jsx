import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { supabase } from '../supabaseClient.js'
import { ensureAnonymousAuth } from '../utils/auth.js'
import { applyBrandSurface, applyColorMode, applyTheme } from '../utils/theme.js'
import { Button, Select, EmptyState, Skeleton } from '../components/ui/index.js'
import { EASE_OUT } from '../components/rider/RiderUi.jsx'

function parseTheme(t) {
  if (!t) return null
  if (typeof t === 'string') { try { return JSON.parse(t) || null } catch { return null } }
  return t
}

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT } },
}
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } }

/**
 * Brand-level Home Delivery entry (Thank You Card QR).
 * Route: /delivery/:restaurantId/:secret
 * Does NOT lock to the branch that printed the card.
 * Customer picks area → backend resolves eligible branch/session.
 */
export default function BrandDelivery() {
  const { restaurantId, secret } = useParams()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const [loading, setLoading] = useState(true)
  const [bootError, setBootError] = useState(null)
  const [error, setError] = useState(null)
  const [areas, setAreas] = useState([])
  const [meta, setMeta] = useState(null)
  const [brand, setBrand] = useState(null)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function boot() {
      setLoading(true)
      setBootError(null)
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
        if (!cancelled) setBootError(e?.message || 'Invalid delivery QR')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    boot()
    return () => { cancelled = true }
  }, [restaurantId, secret, reloadKey])

  // Branding is optional: if the function is missing or fails, the page keeps the neutral look.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await ensureAnonymousAuth()
        const { data, error: err } = await supabase.rpc('brand_delivery_brand', {
          p_restaurant_id: restaurantId,
          p_brand_secret: secret,
        })
        if (cancelled || err || !data || data.error) return
        const theme = parseTheme(data.theme)
        setBrand({ restaurant_name: data.restaurant_name || '', logo_url: data.logo_url || '' })
        if (theme && Object.keys(theme).length) {
          applyTheme(theme)
          applyBrandSurface(theme)
        }
        applyColorMode('light')
      } catch {
        // keep neutral look
      }
    })()
    return () => { cancelled = true }
  }, [restaurantId, secret, reloadKey])

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

  const title = brand?.restaurant_name || meta?.restaurant_name || 'Order for delivery'
  const brandColor = 'var(--brand-primary, var(--color-primary))'
  const brandText = 'var(--brand-primary-text, #fff)'

  if (loading) {
    return (
      <div className="bd-page" role="status" aria-label="Loading delivery">
        <div className="bd-card" aria-busy="true">
          <Skeleton width={56} height={56} radius={16} />
          <Skeleton width="40%" height={12} />
          <Skeleton width="75%" height={24} />
          <Skeleton width="100%" height={44} />
          <Skeleton width="100%" height={52} />
        </div>
      </div>
    )
  }

  if (bootError) {
    return (
      <motion.div
        className="bd-page"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, ease: EASE_OUT }}
      >
        <div className="bd-card">
          <EmptyState
            icon="⚠️"
            title="Delivery link abhi kaam nahi kar raha"
            description="Thodi der baad dobara try karein ya restaurant se rabta karein."
            action={<Button variant="primary" onClick={() => setReloadKey(k => k + 1)}>Retry</Button>}
          />
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="bd-page"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      <motion.main
        className="bd-card"
        variants={stagger}
        initial={reduceMotion ? 'show' : 'hidden'}
        animate="show"
      >
        <motion.div variants={itemVariants} className="bd-brand">
          <div className="bd-logo" style={{ background: brandColor, color: brandText }}>
            {brand?.logo_url
              ? <img src={brand.logo_url} alt={`${title} logo`} />
              : <span aria-hidden="true">{(title || 'T')[0]}</span>}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="bd-eyebrow">HOME DELIVERY</div>
            <h1 className="bd-title">{title}</h1>
          </div>
        </motion.div>

        <motion.div variants={itemVariants} className="bd-accent" aria-hidden="true" />

        <motion.p variants={itemVariants} className="bd-lead">
          Apna delivery area select karein. Order us branch ko jayega jo aapke area ko cover karti hai —
          card jis branch se mila us se lock nahi.
        </motion.p>

        <motion.div variants={itemVariants}>
          <Select
            label="Delivery area"
            value={selected}
            onChange={e => setSelected(e.target.value)}
            disabled={areas.length === 0}
          >
            <option value="">Select area…</option>
            {areas.map(a => (
              <option key={a.area_name} value={a.area_name}>
                {a.area_name}{a.charge != null ? ` · PKR ${Number(a.charge).toFixed(0)}` : ''}
              </option>
            ))}
          </Select>
          {areas.length === 0 && (
            <div className="rdr-error" role="status" style={{ marginTop: 'var(--space-3)' }}>
              Abhi koi delivery area configure nahi.
            </div>
          )}
        </motion.div>

        {error && <div className="rdr-error" role="alert">{error}</div>}

        <motion.div variants={itemVariants}>
          <Button
            type="button"
            size="lg"
            block
            loading={busy}
            disabled={busy || !selected}
            onClick={continueOrder}
            style={{ background: brandColor, color: brandText }}
          >
            {busy ? 'Routing…' : 'Continue to menu'}
          </Button>
        </motion.div>
      </motion.main>
    </motion.div>
  )
}
