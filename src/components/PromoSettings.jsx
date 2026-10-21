import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'

// One active promo at a time. Saving a new text/image replaces the old one
// and makes it show again to customers (version = updated timestamp).
export default function PromoSettings({ session }) {
  const [text, setText] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    setText(session?.active_promo_text || '')
    setImageUrl(session?.active_promo_image_url || '')
  }, [session?.id, session?.active_promo_text, session?.active_promo_image_url])

  const save = async (nextText, nextImage) => {
    if (!session?.id) return
    setBusy(true)
    setMsg('')
    try {
      const { error } = await supabase
        .from('sessions')
        .update({
          active_promo_text: nextText.trim() || null,
          active_promo_image_url: nextImage.trim() || null,
          active_promo_updated_at: new Date().toISOString(),
        })
        .eq('id', session.id)
      if (error) throw error
      setMsg(nextText.trim() || nextImage.trim() ? 'Promo save ho gaya.' : 'Promo band kar diya.')
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
  const btn = {
    border: 'none', borderRadius: 10, padding: '11px 16px', fontWeight: 800, fontSize: 14,
    background: 'var(--brand-primary)', color: 'var(--brand-primary-text)',
  }
  const ghost = { ...btn, background: 'transparent', color: 'var(--ink)', border: '1px solid var(--line, #e7e5e4)' }

  return (
    <section style={{ background: 'var(--surface-elevated, #fff)', border: '1px solid var(--line, #e7e5e4)', borderRadius: 14, padding: 16, marginBottom: 12 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Promo / offer popup</div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-muted)' }}>
        Ek waqt mein ek hi promo active hota hai. Customer menu kholne par ye popup dikhega.
      </p>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Promo text</label>
      <textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="e.g. Aaj Burger + Drink sirf PKR 499" style={{ ...field, resize: 'vertical' }} />
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, margin: '12px 0 4px' }}>Promo image URL (optional)</label>
      <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." style={field} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" disabled={busy} onClick={() => save(text, imageUrl)} style={btn}>Promo save karein</button>
        <button type="button" disabled={busy} onClick={() => { setText(''); setImageUrl(''); save('', '') }} style={ghost}>Promo band karein</button>
      </div>
      {msg && <div role="status" style={{ marginTop: 10, fontSize: 13, color: 'var(--text-muted)' }}>{msg}</div>}
    </section>
  )
}
