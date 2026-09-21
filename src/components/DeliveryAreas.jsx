import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../supabaseClient.js'

export default function DeliveryAreas({ sessionId, restaurantId, qrSecret }) {
  const [areas, setAreas] = useState([])
  const [name, setName] = useState('')
  const [charge, setCharge] = useState(0)  // FIX #3: Add delivery charge field
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)  // For editing charges
  const [editCharge, setEditCharge] = useState(0)
  const [error, setError] = useState('')
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

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

      {/* All Areas QR */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#7a7264', marginBottom: 8 }}>
          ALL AREAS — single rider (koi fixed charge nahi)
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 14
        }}>
          <AreaCard
            label="All Areas"
            downloadName="rider-all-areas.png"
            url={baseUrl + '/rider/' + restaurantId + '/' + qrSecret + '/__all__'}
            accent
          />
        </div>
      </div>

      {/* Per-Area Rider QRs with Charges */}
      {areas.length > 0 && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: '#7a7264', marginBottom: 8 }}>
          PER-AREA RIDER QR (har area ka delivery charge alag)
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 14
      }}>
        {areas.map(a => (
          <div key={a.id} style={{
            background: '#fff',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius)',
            padding: 12,
            textAlign: 'center'
          }}>
            {/* Area Name */}
            <div style={{
              fontWeight: 700,
              fontSize: 13,
              marginBottom: 8,
              color: 'var(--ink)'
            }}>
              {a.name}
            </div>

            {/* FIX #3: Display and Edit Delivery Charge */}
            {editingId === a.id ? (
              <div style={{ marginBottom: 10 }}>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={editCharge}
                  onChange={e => setEditCharge(e.target.value)}
                  autoFocus
                  style={{
                    width: '100%',
                    border: '1px solid var(--sky)',
                    borderRadius: 6,
                    padding: '6px 8px',
                    fontSize: 12,
                    fontFamily: 'var(--mono)',
                    boxSizing: 'border-box',
                    marginBottom: 6
                  }}
                />
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => updateCharge(a.id, editCharge)}
                    style={{
                      flex: 1,
                      background: 'var(--sky)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 4,
                      padding: '4px 0',
                      fontSize: 11,
                      fontWeight: 600
                    }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    style={{
                      flex: 1,
                      background: 'var(--paper-dim)',
                      color: 'var(--ink)',
                      border: 'none',
                      borderRadius: 4,
                      padding: '4px 0',
                      fontSize: 11,
                      fontWeight: 600
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => {
                  setEditingId(a.id)
                  setEditCharge(a.charge || 0)
                }}
                style={{
                  background: 'var(--paper-dim)',
                  border: '1px dashed var(--line)',
                  borderRadius: 6,
                  padding: '6px 8px',
                  marginBottom: 10,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: 11, color: '#7a7264' }}>Delivery charge</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
                  PKR {(a.charge || 0).toFixed(0)}
                </div>
                <div style={{ fontSize: 10, color: '#9a9284' }}>Click to edit</div>
              </div>
            )}

            {/* QR Code */}
            <AreaCard
              label={a.name}
              downloadName={'rider-' + a.name + '.png'}
              url={baseUrl + '/rider/' + restaurantId + '/' + qrSecret + '/' + encodeURIComponent(a.name)}
              hideLabel
            />

            {/* Delete Button */}
            <button
              onClick={() => remove(a.id)}
              style={{
                marginTop: 8,
                width: '100%',
                background: 'transparent',
                color: 'var(--clay)',
                border: 'none',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Delete Area
            </button>
          </div>
        ))}
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

function AreaCard({ label, url, downloadName, hideLabel, accent }) {
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)

  const [error, setError] = useState('')

  useEffect(() => {
    if (!canvasRef.current || !url) return
    setReady(false)
    setError('')
    QRCode.toCanvas(canvasRef.current, url, { width: 160, margin: 1 }, function (err) {
      if (!err) setReady(true)
      else setError('QR generate nahi ho saka. Link copy karke use karein.')
    })
  }, [url])

  const download = () => {
    if (!canvasRef.current) return
    const a = document.createElement('a')
    a.download = downloadName || 'rider-qr.png'
    a.href = canvasRef.current.toDataURL('image/png')
    a.click()
  }

  return (
    <div>
      {!hideLabel && (
        <div style={{
          fontWeight: 700,
          fontSize: 13,
          marginBottom: 6,
          color: accent ? 'var(--sage)' : 'var(--ink)'
        }}>
          {label}
        </div>
      )}
      {error && <div style={{ color: 'var(--clay)', fontSize: 11, marginBottom: 6 }}>{error}</div>}
      <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', borderRadius: 6, marginBottom: 8 }} />
      <button
        onClick={download}
        disabled={!ready}
        style={{
          width: '100%',
          background: accent ? 'var(--sage)' : 'var(--brand-primary)',
          color: accent ? '#fff' : 'var(--brand-primary-text)',
          border: 'none',
          borderRadius: 8,
          padding: '8px 0',
          fontSize: 12,
          fontWeight: 700,
          opacity: ready ? 1 : 0.5
        }}
      >
        Download QR
      </button>
    </div>
  )
}
