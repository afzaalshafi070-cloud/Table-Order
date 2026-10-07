import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'

export default function DeliveryAreas({ sessionId }) {
  const [areas, setAreas] = useState([])
  const [name, setName] = useState('')
  const [charge, setCharge] = useState(0)  // FIX #3: Add delivery charge field
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)  // For editing charges
  const [editCharge, setEditCharge] = useState(0)
  const [error, setError] = useState('')

  const load = async () => {
    const { data } = await supabase
      .from('delivery_areas')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    setAreas(data || [])
  }

  useEffect(() => {
    load()
  }, [sessionId])

  // FIX #3: Add delivery charge when creating area
  const add = async () => {
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    setError('')
    const { error: insertError } = await supabase.from('delivery_areas').insert({
      session_id: sessionId,
      name: n,
      charge: parseFloat(charge) || 0  // Store delivery charge
    })
    if (insertError) {
      setError(insertError.message || 'Area save nahi ho saka.')
      setBusy(false)
      return
    }
    setName('')
    setCharge(0)
    setBusy(false)
    load()
  }

  // FIX #3: Update delivery charge for an area
  const updateCharge = async (id, newCharge) => {
    setError('')
    const { error: updateError } = await supabase
      .from('delivery_areas')
      .update({ charge: parseFloat(newCharge) || 0 })
      .eq('id', id)
    if (updateError) {
      setError(updateError.message || 'Charge update nahi ho saka.')
      return
    }
    setEditingId(null)
    load()
  }

  const remove = async (id) => {
    if (!confirm('Is area ko delete karein?')) return
    await supabase.from('delivery_areas').delete().eq('id', id)
    load()
  }

  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      {/* Add Area Section */}
      <div style={{
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: 16,
        marginBottom: 18
      }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Delivery Areas</div>
        {error && <div style={{ marginBottom: 10, padding: 9, background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, color: 'var(--clay)', fontSize: 12 }}>{error}</div>}
        <div style={{ fontSize: 13, color: '#7a7264', marginBottom: 12 }}>
          Area add karein aur uske liye delivery charge set karein (e.g., Gulshan = 100 PKR).
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Gulshan, Johar, DHA"
            onKeyDown={e => e.key === 'Enter' && add()}
            style={{
              flex: 1,
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 14
            }}
          />
        </div>

        {/* FIX #3: Add delivery charge input */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            min="0"
            step="10"
            value={charge}
            onChange={e => setCharge(e.target.value)}
            placeholder="Delivery charge (PKR)"
            onKeyDown={e => e.key === 'Enter' && add()}
            style={{
              flex: 1,
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '10px 12px',
              fontSize: 14,
              fontFamily: 'var(--mono)'
            }}
          />
          <button
            onClick={add}
            disabled={busy || !name.trim()}
            style={{
              background: 'var(--sage)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 16px',
              fontWeight: 700,
              opacity: busy || !name.trim() ? 0.5 : 1,
              minWidth: 100
            }}
          >
            Add Area
          </button>
        </div>
      </div>

      {/* Help Info */}
      {areas.length === 0 && (
        <div style={{
          marginTop: 20,
          padding: 14,
          background: '#f0fdf4',
          border: '1px solid var(--sage)',
          borderRadius: 8,
          fontSize: 13,
          color: 'var(--sage)',
          lineHeight: 1.5
        }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>📍 How to use:</div>
          <div>Pehle areas add karein (Gulshan, DHA, etc.) aur har area ke liye delivery charge set karein. Phir QR codes download karke riders ko dein.</div>
        </div>
      )}
    </div>
  )
}

function AreaCard({ label, url, downloadName, hideLabel, accent, logoUrl }) {
  return (
    <BrandedQRCode
      label={label ? `QR FOR RIDER — ${label}` : 'QR FOR RIDER'}
      url={url}
      downloadName={downloadName}
      logoUrl={logoUrl}
      accent={accent}
      compact
    />
  )
}
