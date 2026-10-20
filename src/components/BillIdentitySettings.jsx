import { useState } from 'react'
import { supabase } from '../supabaseClient.js'

// NTN / STRN are printed ONLY on the customer bill (PrintableTicket, type "bill").
// Saved inside sessions.theme so no new column is needed.
export default function BillIdentitySettings({ session, setSession }) {
  const theme = typeof session?.theme === 'string' ? safeParse(session.theme) : (session?.theme || {})
  const [ntn, setNtn] = useState(theme.ntn_number || '')
  const [strn, setStrn] = useState(theme.strn_number || '')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async () => {
    setBusy(true)
    setMsg('')
    try {
      const next = { ...theme, ntn_number: ntn.trim() || null, strn_number: strn.trim() || null }
      const { error } = await supabase.from('sessions').update({ theme: next }).eq('id', session.id)
      if (error) throw error
      setSession?.(prev => ({ ...prev, theme: next }))
      setMsg('Save ho gaya.')
    } catch (e) {
      setMsg(e?.message || 'Save nahi ho saka.')
    } finally {
      setBusy(false)
    }
  }

  const field = {
    width: '100%', boxSizing: 'border-box', minWidth: 0, padding: '10px 12px', borderRadius: 10,
    border: '1px solid var(--line, #e7e5e4)', background: 'var(--paper, #fff)', color: 'var(--ink)', fontSize: 14,
  }

  return (
    <section style={{ background: 'var(--surface-elevated, #fff)', border: '1px solid var(--line, #e7e5e4)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>NTN / STRN (customer bill)</div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
        Ye numbers sirf customer ke bill par print hongay. KOT par nahi.
      </p>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>NTN</label>
      <input value={ntn} onChange={e => setNtn(e.target.value)} placeholder="e.g. 1234567-8" style={field} />
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, margin: '12px 0 4px' }}>STRN</label>
      <input value={strn} onChange={e => setStrn(e.target.value)} placeholder="e.g. 12-34-5678-901-23" style={field} />
      <button type="button" disabled={busy} onClick={save} style={{
        marginTop: 14, border: 'none', borderRadius: 10, padding: '11px 16px', fontWeight: 800, fontSize: 14,
        background: 'var(--brand-primary)', color: 'var(--brand-primary-text)',
      }}>Save</button>
      {msg && <div role="status" style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>{msg}</div>}
    </section>
  )
}

function safeParse(s) {
  try { return JSON.parse(s) || {} } catch { return {} }
}
