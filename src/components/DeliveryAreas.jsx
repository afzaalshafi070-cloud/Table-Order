import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../supabaseClient.js'

export default function DeliveryAreas({ sessionId, restaurantId, qrSecret }) {
  const [areas, setAreas] = useState([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''

  const load = async () => {
    const { data } = await supabase
      .from('delivery_areas')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    setAreas(data || [])
  }

  useEffect(() => { load() }, [sessionId])

  const add = async () => {
    const n = name.trim()
    if (!n || busy) return
    setBusy(true)
    await supabase.from('delivery_areas').insert({ session_id: sessionId, name: n })
    setName('')
    setBusy(false)
    load()
  }

  const remove = async (id) => {
    if (!confirm('Is area ko delete karein?')) return
    await supabase.from('delivery_areas').delete().eq('id', id)
    load()
  }

  return (
    <div style={{ padding: 16, maxWidth: 720 }}>
      <div style={{
        background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
        padding: 16, marginBottom: 18
      }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Delivery areas</div>
        <div style={{ fontSize: 13, color: '#7a7264', marginBottom: 12 }}>
          Area add karein → Rider QR banega. Shift start pe rider ye QR scan kare.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Gulshan, Johar, DHA"
            onKeyDown={e => e.key === 'Enter' && add()}
            style={{
              flex: 1, border: '1px solid var(--line)', borderRadius: 8,
              padding: '10px 12px', fontSize: 14
            }}
          />
          <button onClick={add} disabled={busy || !name.trim()} style={{
            background: 'var(--sage)', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 16px', fontWeight: 700, opacity: busy || !name.trim() ? 0.5 : 1
          }}>Add</button>
        </div>
      </div>

      {areas.length === 0 && (
        <div style={{ textAlign: 'center', color: '#9a9284', padding: 24 }}>
          Abhi koi area nahi — pehle ek add karein.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }}>
        {areas.map(a => (
          <AreaCard
            key={a.id}
            area={a}
            url={`${baseUrl}/rider/${restaurantId}/${qrSecret}/${encodeURIComponent(a.name)}`}
            onDelete={() => remove(a.id)}
          />
        ))}
      </div>
    </div>
  )
}

function AreaCard({ area, url, onDelete }) {
  const canvasRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    QRCode.toCanvas(canvasRef.current, url, { width: 160, margin: 1 }, err => {
      if (!err) setReady(true)
    })
  }, [url])

  const download = () => {
    if (!canvasRef.current) return
    const a = document.createElement('a')
    a.download = `rider-${area.name}.png`
    a.href = canvasRef.current.toDataURL('image/png')
    a.click()
  }

  return (
    <div style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
      padding: 10, textAlign: 'center'
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{area.name}</div>
      <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', borderRadius: 6 }} />
      <div style={{ fontSize: 10, color: '#9a9284', marginTop: 4 }}>Rider QR</div>
      <button onClick={download} disabled={!ready} style={{
        marginTop: 6, width: '100%', background: 'var(--brand-primary)',
        color: 'var(--brand-primary-text)', border: 'none', borderRadius: 8,
        padding: '6px 0', fontSize: 12, fontWeight: 700, opacity: ready ? 1 : 0.5
      }}>Download</button>
      <button onClick={onDelete} style={{
        marginTop: 4, width: '100%', background: 'transparent', color: 'var(--clay)',
        border: 'none', fontSize: 11, fontWeight: 600
      }}>Delete</button>
    </div>
  )
}
