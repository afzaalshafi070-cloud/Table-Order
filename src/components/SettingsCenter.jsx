import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import LogoUploader from './LogoUploader.jsx'
import TaxSettings from './TaxSettings.jsx'
import DeliveryAreas from './DeliveryAreas.jsx'
import { applyTheme } from '../utils/theme.js'
import { uploadImage } from '../utils/uploadImage.js'

const SECTIONS = [
  { id: 'general', label: 'Restaurant' },
  { id: 'branding', label: 'Branding' },
  { id: 'payment', label: 'Payment' },
  { id: 'tax', label: 'Tax' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'notifications', label: 'Alerts' },
  { id: 'printing', label: 'Printing' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'shift', label: 'Shift' },
]

function parseTheme(theme) {
  if (!theme) return {}
  if (typeof theme === 'string') {
    try { return JSON.parse(theme) } catch { return {} }
  }
  return { ...theme }
}

export default function SettingsCenter({
  session,
  setSession,
  onLogoApplied,
  updateTaxSettings,
  onCloseShift,
  onLogout,
}) {
  const [section, setSection] = useState('general')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const theme = parseTheme(session.theme)

  const [form, setForm] = useState({
    description: theme.description || '',
    address: theme.address || '',
    contact: theme.contact || '',
    hours: theme.hours || '',
    currency: theme.currency || 'PKR',
    whatsapp: session.whatsapp || theme.whatsapp || '',
    soundOn: theme.soundOn !== false,
    vibrateOn: theme.vibrateOn !== false,
    notifyOrders: theme.notifyOrders !== false,
    notifyWater: theme.notifyWater !== false,
    notifyWaiter: theme.notifyWaiter !== false,
    printFooter: theme.printFooter || '',
    printShowTax: theme.printShowTax !== false,
    printShowLogo: theme.printShowLogo !== false,
    paymentCash: theme.paymentCash !== false,
    paymentOnline: !!theme.paymentOnline,
    paymentMethodName: theme.paymentMethodName || 'JazzCash / Easypaisa',
    paymentAccountTitle: theme.paymentAccountTitle || '',
    paymentInstructions: theme.paymentInstructions || '',
    paymentQrUrl: theme.paymentQrUrl || '',
  })

  useEffect(() => {
    const t = parseTheme(session.theme)
    setForm({
      description: t.description || '',
      address: t.address || '',
      contact: t.contact || '',
      hours: t.hours || '',
      currency: t.currency || 'PKR',
      whatsapp: session.whatsapp || t.whatsapp || '',
      soundOn: t.soundOn !== false,
      vibrateOn: t.vibrateOn !== false,
      notifyOrders: t.notifyOrders !== false,
      notifyWater: t.notifyWater !== false,
      notifyWaiter: t.notifyWaiter !== false,
      printFooter: t.printFooter || '',
      printShowTax: t.printShowTax !== false,
      printShowLogo: t.printShowLogo !== false,
      paymentCash: t.paymentCash !== false,
      paymentOnline: !!t.paymentOnline,
      paymentMethodName: t.paymentMethodName || 'JazzCash / Easypaisa',
      paymentAccountTitle: t.paymentAccountTitle || '',
      paymentInstructions: t.paymentInstructions || '',
      paymentQrUrl: t.paymentQrUrl || '',
    })
  }, [session.id, session.theme, session.whatsapp])

  const saveThemePatch = async (patch) => {
    setBusy(true)
    setMsg('')
    try {
      const base = parseTheme(session.theme)
      const nextTheme = { ...base, ...patch }
      const { error } = await supabase
        .from('sessions')
        .update({ theme: nextTheme })
        .eq('id', session.id)
      if (error) throw error
      setSession(prev => ({
        ...prev,
        theme: nextTheme,
        whatsapp: nextTheme.whatsapp ?? prev.whatsapp,
      }))
      if (nextTheme.primary) applyTheme(nextTheme)
      setMsg('Settings saved successfully.')
    } catch (e) {
      setMsg(e?.message || 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const saveGeneral = () =>
    saveThemePatch({
      description: form.description.trim() || null,
      address: form.address.trim() || null,
      contact: form.contact.trim() || null,
      hours: form.hours.trim() || null,
      currency: form.currency.trim() || 'PKR',
    })

  const saveWhatsApp = () =>
    saveThemePatch({ whatsapp: form.whatsapp.trim() || null })

  const saveNotifications = () =>
    saveThemePatch({
      soundOn: !!form.soundOn,
      vibrateOn: !!form.vibrateOn,
      notifyOrders: !!form.notifyOrders,
      notifyWater: !!form.notifyWater,
      notifyWaiter: !!form.notifyWaiter,
    })

  const savePrinting = () =>
    saveThemePatch({
      printFooter: form.printFooter.trim() || null,
      printShowTax: !!form.printShowTax,
      printShowLogo: !!form.printShowLogo,
    })

  const savePayment = () =>
    saveThemePatch({
      paymentCash: !!form.paymentCash,
      paymentOnline: !!form.paymentOnline,
      paymentMethodName: form.paymentMethodName.trim() || 'Online payment',
      paymentAccountTitle: form.paymentAccountTitle.trim() || null,
      paymentInstructions: form.paymentInstructions.trim() || null,
      paymentQrUrl: form.paymentQrUrl || null,
    })

  const uploadPaymentQr = async (file) => {
    if (!file) return
    setBusy(true)
    setMsg('')
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${session.id}/payment-qr-${Date.now()}.${ext}`
      const url = await uploadImage('restaurant-logos', path, file)
      setForm(f => ({ ...f, paymentQrUrl: url }))
      await saveThemePatch({
        paymentCash: !!form.paymentCash,
        paymentOnline: true,
        paymentMethodName: form.paymentMethodName.trim() || 'Online payment',
        paymentAccountTitle: form.paymentAccountTitle.trim() || null,
        paymentInstructions: form.paymentInstructions.trim() || null,
        paymentQrUrl: url,
      })
      setForm(f => ({ ...f, paymentOnline: true, paymentQrUrl: url }))
      setMsg('Payment QR saved successfully.')
    } catch (e) {
      setMsg(e?.message || 'QR upload failed')
    } finally {
      setBusy(false)
    }
  }

  const field = (label, key, opts = {}) => (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#57534e', marginBottom: 6 }}>{label}</div>
      {opts.textarea ? (
        <textarea
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          rows={opts.rows || 3}
          placeholder={opts.placeholder}
          style={inputStyle}
        />
      ) : (
        <input
          type={opts.type || 'text'}
          value={form[key]}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={opts.placeholder}
          style={inputStyle}
        />
      )}
    </label>
  )

  const check = (label, key) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 14 }}>
      <input
        type="checkbox"
        checked={!!form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))}
      />
      {label}
    </label>
  )

  return (
    <div style={{ padding: 14, maxWidth: 720, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700 }}>Settings</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#78716c' }}>
          Restaurant, branding, tax, delivery, alerts aur shift — sab yahan.
        </p>
      </div>

      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14,
        padding: 6, background: 'var(--paper-dim, #f5f5f4)', borderRadius: 14,
      }}>
        {SECTIONS.map(s => (
          <button
            key={s.id}
            type="button"
            onClick={() => { setSection(s.id); setMsg('') }}
            style={{
              border: 'none', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
              background: section === s.id ? 'var(--brand-primary)' : 'var(--paper)',
              color: section === s.id ? 'var(--brand-primary-text)' : 'var(--ink)',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{
          marginBottom: 12, padding: 10, borderRadius: 10, fontSize: 13,
          background: msg.includes('success') ? '#ecfdf5' : '#fef2f2',
          color: msg.includes('success') ? '#047857' : '#b91c1c',
        }}>
          {msg}
        </div>
      )}

      {section === 'general' && (
        <Section title="Restaurant information">
          <div style={{ fontSize: 13, color: '#78716c', marginBottom: 12 }}>
            <b>{session.restaurant_name}</b>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, marginTop: 4 }}>{session.restaurant_id}</div>
          </div>
          {field('Description', 'description', { textarea: true, placeholder: 'Short intro for staff / branding' })}
          {field('Address', 'address', { placeholder: 'Street, city' })}
          {field('Contact phone', 'contact', { placeholder: '03xx…' })}
          {field('Business hours', 'hours', { placeholder: 'e.g. 12pm – 12am' })}
          {field('Currency label', 'currency', { placeholder: 'PKR' })}
          <SaveBtn busy={busy} onClick={saveGeneral} />
        </Section>
      )}

      {section === 'branding' && (
        <Section title="Logo & theme">
          <p style={{ fontSize: 13, color: '#78716c', marginTop: 0 }}>
            Logo se colors aur display font auto match hote hain (counter + customer).
          </p>
          <LogoUploader
            sessionId={session.id}
            existingLogoUrl={session.logo_url}
            onApplied={onLogoApplied}
          />
        </Section>
      )}

      {section === 'tax' && (
        <Section title="Tax settings">
          <TaxSettings
            sessionId={session.id}
            currentTaxPercent={session.tax_percent || 0}
            currentTaxLabel={session.tax_label || 'Tax'}
            onSave={updateTaxSettings}
          />
        </Section>
      )}

      {section === 'delivery' && (
        <Section title="Delivery areas">
          <p style={{ fontSize: 13, color: '#78716c', marginTop: 0 }}>
            Areas yahan manage karein. Area / Rider QR <b>QR Center</b> se print karein.
          </p>
          <DeliveryAreas
            sessionId={session.id}
            restaurantId={session.restaurant_id}
            riderSecret={session.rider_secret}
            restaurantName={session.restaurant_name}
            logoUrl={session.logo_url}
          />
        </Section>
      )}

      {section === 'notifications' && (
        <Section title="Alerts & feedback">
          <p style={{ fontSize: 13, color: '#78716c', marginTop: 0 }}>
            Preferences is device / restaurant theme mein save hoti hain. Order realtime flow same rehta hai.
          </p>
          {check('New order sound', 'soundOn')}
          {check('Vibration (supported devices)', 'vibrateOn')}
          {check('Order alerts', 'notifyOrders')}
          {check('Water request alerts', 'notifyWater')}
          {check('Waiter call alerts', 'notifyWaiter')}
          <SaveBtn busy={busy} onClick={saveNotifications} />
        </Section>
      )}

      {section === 'printing' && (
        <Section title="Receipt / print preferences">
          {check('Show tax on receipt', 'printShowTax')}
          {check('Show logo on receipt (where supported)', 'printShowLogo')}
          {field('Footer message', 'printFooter', { textarea: true, placeholder: 'Thank you! Visit again.' })}
          <SaveBtn busy={busy} onClick={savePrinting} />
        </Section>
      )}


      {section === 'payment' && (
        <Section title="Payment methods">
          <p style={{ fontSize: 13, color: '#78716c', marginTop: 0 }}>
            Manual online payment (JazzCash / Easypaisa / Bank QR). Gateway nahi — customer QR scan karke transfer karta hai.
          </p>
          {check('Cash payment', 'paymentCash')}
          {check('Online / QR payment', 'paymentOnline')}
          {field('Method name', 'paymentMethodName', { placeholder: 'JazzCash / Easypaisa' })}
          {field('Account title', 'paymentAccountTitle', { placeholder: 'Account title / name' })}
          {field('Instructions', 'paymentInstructions', { textarea: true, placeholder: 'e.g. Send and keep screenshot' })}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#57534e', marginBottom: 6 }}>Payment QR image</div>
            {form.paymentQrUrl && (
              <img src={form.paymentQrUrl} alt="Payment QR" style={{
                width: 140, height: 140, objectFit: 'contain', borderRadius: 10,
                border: '1px solid var(--line)', background: '#fff', display: 'block', marginBottom: 8,
              }} />
            )}
            <label style={{
              display: 'inline-block', padding: '10px 14px', borderRadius: 10,
              background: 'var(--brand-primary)', color: 'var(--brand-primary-text)',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
              {form.paymentQrUrl ? 'Replace QR' : 'Upload QR'}
              <input type="file" accept="image/*" hidden onChange={e => {
                const f = e.target.files?.[0]
                if (f) uploadPaymentQr(f)
                e.target.value = ''
              }} />
            </label>
            {form.paymentQrUrl && (
              <button type="button" disabled={busy} onClick={() => {
                setForm(f => ({ ...f, paymentQrUrl: '' }))
                saveThemePatch({ paymentQrUrl: null })
              }} style={{
                marginLeft: 8, border: '1px solid var(--line)', borderRadius: 10,
                padding: '10px 12px', background: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}>Remove QR</button>
            )}
          </div>
          <SaveBtn busy={busy} onClick={savePayment} label="Save payment settings" />
        </Section>
      )}

      {section === 'whatsapp' && (
        <Section title="WhatsApp (optional)">
          <p style={{ fontSize: 13, color: '#78716c', marginTop: 0 }}>
            Number save karo to customer menu pe professional WhatsApp button aayega.
          </p>
          {field('WhatsApp number', 'whatsapp', { placeholder: '03001234567 or +923001234567' })}
          <SaveBtn busy={busy} onClick={saveWhatsApp} label="Save WhatsApp" />
        </Section>
      )}

      {section === 'shift' && (
        <Section title="Shift controls">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" onClick={onCloseShift} style={dangerBtn}>
              Close Shift / EOD report
            </button>
            <button type="button" onClick={onLogout} style={outlineBtn}>
              Log out
            </button>
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section style={{
      background: '#fff', border: '1px solid var(--line, #e7e5e4)', borderRadius: 14, padding: 16, marginBottom: 12,
    }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{title}</div>
      {children}
    </section>
  )
}

function SaveBtn({ busy, onClick, label = 'Save settings' }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      style={{
        marginTop: 4, border: 'none', borderRadius: 10, padding: '12px 16px',
        background: 'var(--brand-primary)', color: 'var(--brand-primary-text)',
        fontWeight: 700, fontSize: 14, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
      }}
    >
      {busy ? 'Saving…' : label}
    </button>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', border: '1px solid var(--line, #e7e5e4)',
  borderRadius: 10, padding: '10px 12px', fontSize: 14, background: '#fff',
}

const dangerBtn = {
  background: 'var(--clay, #c2410c)', color: '#fff', border: 'none', borderRadius: 12,
  padding: '14px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
}

const outlineBtn = {
  background: '#fff', color: 'var(--ink)', border: '1px solid var(--line, #e7e5e4)',
  borderRadius: 12, padding: '14px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
}
