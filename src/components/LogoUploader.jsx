import { useRef, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import { extractThemeFromLogo, applyTheme } from '../utils/theme.js'

export default function LogoUploader({ sessionId, existingLogoUrl, onApplied, compact = false }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(existingLogoUrl || null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError(null)

    try {
      const ext = file.name.split('.').pop()
      const path = `${sessionId}/logo-${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('restaurant-logos')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('restaurant-logos')
        .getPublicUrl(path)

      const theme = await extractThemeFromLogo(publicUrl)
      applyTheme(theme)

      await supabase.from('sessions')
        .update({ logo_url: publicUrl, theme })
        .eq('id', sessionId)

      setPreview(publicUrl)
      onApplied?.(publicUrl, theme)
    } catch (err) {
      console.error(err)
      setError("Logo upload nahi ho saka. Dobara koshish karein.")
    } finally {
      setBusy(false)
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, color: 'inherit',
          background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 8, padding: '6px 10px', fontSize: 12
        }}>
        {preview && <img src={preview} alt="" style={{ width: 20, height: 20, borderRadius: 4, objectFit: 'cover' }} />}
        {busy ? 'Uploading…' : preview ? 'Change logo' : 'Add logo'}
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      </button>
    )
  }

  return (
    <div style={{
      border: '1px dashed var(--line)', borderRadius: 'var(--radius)',
      padding: 18, textAlign: 'center', background: '#fff'
    }}>
      {preview ? (
        <img src={preview} alt="Restaurant logo" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12, margin: '0 auto 10px' }} />
      ) : (
        <div style={{ fontSize: 28, marginBottom: 8 }}>🖼️</div>
      )}
      <div style={{ fontSize: 13, color: '#7a7264', marginBottom: 10 }}>
        Apna restaurant logo upload karein — menu aur counter dono ka color theme khud ba khud isi se match ho jayega.
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        style={{
          background: 'var(--brand-primary)', color: 'var(--brand-primary-text)',
          border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, fontSize: 13,
          opacity: busy ? 0.6 : 1
        }}>
        {busy ? 'Uploading…' : preview ? 'Logo badlein' : 'Logo upload karein'}
      </button>
      {error && <div style={{ color: 'var(--clay)', fontSize: 12, marginTop: 8 }}>{error}</div>}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
    </div>
  )
}
