import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient.js'
import LogoUploader from './LogoUploader.jsx'
import TaxSettings from './TaxSettings.jsx'
import DeliveryAreas from './DeliveryAreas.jsx'
import RiderFoundationPanel from './RiderFoundationPanel.jsx'
import { applyTheme } from '../utils/theme.js'
import { getOrCreateTabSecret } from '../utils/auth.js'
import BillingPanel from './BillingPanel.jsx'
import PromoSettings from './PromoSettings.jsx'
import BillIdentitySettings from './BillIdentitySettings.jsx'
import { uploadImage } from '../utils/uploadImage.js'
import { useT } from '../i18n/useT.js'
import { setLang, isRtl } from '../i18n/index.js'
import { LANGUAGES } from '../i18n/languages.js'
import GuideBook, { findGuide } from './GuideBook.jsx'
import InfoTip from './InfoTip.jsx'
import { openGuidePdf } from '../utils/guidePdf.js'

const SECTIONS = [
  { id: 'language', labelKey: 'sec_language' },
  { id: 'general', labelKey: 'sec_general' },
  { id: 'branding', labelKey: 'sec_branding' },
  { id: 'branches', labelKey: 'sec_branches' },
  { id: 'payment', labelKey: 'sec_payment' },
  { id: 'subscription', labelKey: 'sec_subscription' },
  { id: 'security', labelKey: 'sec_security' },
  { id: 'tax', labelKey: 'sec_tax' },
  { id: 'delivery', labelKey: 'sec_delivery' },
  { id: 'notifications', labelKey: 'sec_notifications' },
  { id: 'printing', labelKey: 'sec_printing' },
  { id: 'whatsapp', labelKey: 'sec_whatsapp' },
  { id: 'shift', labelKey: 'sec_shift' },
  { id: 'promo', labelKey: 'sec_promo' },
  { id: 'bill', labelKey: 'sec_bill' },
  { id: 'guide', labelKey: 'set_guide_section' },
]

function parseTheme(theme) {
  if (!theme) return {}
  if (typeof theme === 'string') {
    try { return JSON.parse(theme) } catch { return {} }
  }
  return { ...theme }
}


function BranchRequestForm({ session }) {
  const [branchName, setBranchName] = useState('')
  const [address, setAddress] = useState('')
  const [area, setArea] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [branches, setBranches] = useState([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await supabase.rpc('staff_list_branches', {
          p_session_id: session.id,
          p_tab_secret: getOrCreateTabSecret(),
        })
        if (!cancelled && Array.isArray(data)) setBranches(data)
      } catch {}
    }
    if (session?.id) load()
    return () => { cancelled = true }
  }, [session?.id])

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const { data, error } = await supabase.rpc('staff_request_branch', {
        p_session_id: session.id,
        p_tab_secret: getOrCreateTabSecret(),
        p_branch_name: branchName.trim(),
        p_address: address.trim(),
        p_area: area.trim(),
        p_phone: phone.trim(),
        p_notes: notes.trim(),
      })
      if (error) throw error
      if (!data?.ok) throw new Error('Request fail')
      setMsg('Request Admin ko bhej di gayi. Approve hone ke baad branch list mein dikhegi.')
      setBranchName(''); setAddress(''); setArea(''); setPhone(''); setNotes('')
    } catch (e) {
      setMsg(e?.message || 'Request nahi gayi')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      {branches.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Active branches</div>
          {branches.map(b => (
            <div key={b.id} style={{ padding: '8px 10px', border: '1px solid var(--border, var(--line))', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <div><b>{b.branch_name}</b>{b.is_default ? ' · default' : ''}<div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{[b.area, b.address].filter(Boolean).join(' · ')}</div></div>
                <button type="button" onClick={async () => {
                  try {
                    const { data, error } = await supabase.rpc('staff_set_current_branch', { p_session_id: session.id, p_tab_secret: getOrCreateTabSecret(), p_branch_id: b.id })
                    if (error) throw error
                    setMsg(`Current branch: ${data?.branch_name || b.branch_name}`)
                  } catch (e) { setMsg(e?.message || 'Branch switch nahi hua') }
                }} style={{ border: '1px solid var(--line)', background: 'var(--surface-elevated, #fff)', borderRadius: 8, padding: '6px 9px', fontSize: 11, fontWeight: 800 }}>Use this branch</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Request New Branch</div>
      <input placeholder="Branch / location name *" value={branchName} onChange={e => setBranchName(e.target.value)} style={inputStyle} />
      <div style={{ height: 8 }} />
      <input placeholder="Area (e.g. Bahria Town)" value={area} onChange={e => setArea(e.target.value)} style={inputStyle} />
      <div style={{ height: 8 }} />
      <input placeholder="Address" value={address} onChange={e => setAddress(e.target.value)} style={inputStyle} />
      <div style={{ height: 8 }} />
      <input placeholder="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} />
      <div style={{ height: 8 }} />
      <textarea placeholder="Notes for admin (optional)" value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      <div style={{ height: 10 }} />
      <button type="button" disabled={busy || branchName.trim().length < 2} onClick={submit} style={{
        background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', border: 'none',
        borderRadius: 8, padding: '10px 14px', fontWeight: 700, opacity: busy ? 0.6 : 1,
      }}>{busy ? 'Sending…' : 'Submit branch request'}</button>
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>{msg}</div>}
    </div>
  )
}


export default function SettingsCenter({
  session,
  setSession,
  onLogoApplied,
  updateTaxSettings,
  planInfo,
  paymentAccounts,
  onPlanRefresh,
  onCloseShift,
  onLogout,
}) {
  const { t, lang } = useT()
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
    const tt = parseTheme(session.theme)
    setForm({
      description: tt.description || '',
      address: tt.address || '',
      contact: tt.contact || '',
      hours: tt.hours || '',
      currency: tt.currency || 'PKR',
      whatsapp: session.whatsapp || tt.whatsapp || '',
      soundOn: tt.soundOn !== false,
      vibrateOn: tt.vibrateOn !== false,
      notifyOrders: tt.notifyOrders !== false,
      notifyWater: tt.notifyWater !== false,
      notifyWaiter: tt.notifyWaiter !== false,
      printFooter: tt.printFooter || '',
      printShowTax: tt.printShowTax !== false,
      printShowLogo: tt.printShowLogo !== false,
      paymentCash: tt.paymentCash !== false,
      paymentOnline: !!tt.paymentOnline,
      paymentMethodName: tt.paymentMethodName || 'JazzCash / Easypaisa',
      paymentAccountTitle: tt.paymentAccountTitle || '',
      paymentInstructions: tt.paymentInstructions || '',
      paymentQrUrl: tt.paymentQrUrl || '',
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
      setMsg(t('set_saved'))
    } catch (e) {
      setMsg(e?.message || t('set_failed'))
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
      setMsg(t('set_saved'))
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
    <div style={{ padding: 'var(--dash-pad)', maxWidth: 'var(--dash-content)', margin: '0 auto', minWidth: 0 }}>
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700 }}>{t('set_title')}</h2>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#78716c' }}>
          {t('set_sub')}
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
            {t(s.labelKey)}
          </button>
        ))}
      </div>

      {msg && (
        <div style={{
          marginBottom: 12, padding: 10, borderRadius: 10, fontSize: 13,
          background: msg === t('set_saved') || msg.includes('success') ? '#ecfdf5' : '#fef2f2',
          color: msg === t('set_saved') || msg.includes('success') ? '#047857' : '#b91c1c',
        }}>
          {msg}
        </div>
      )}

      {section === 'language' && (
        <Section title={t('set_lang_title')}>
          <p style={{ fontSize: 13, color: '#78716c', marginTop: 0 }}>{t('set_lang_sub')}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 140px), 1fr))', gap: 8 }}>
            {LANGUAGES.map(l => (
              <button
                key={l.code}
                type="button"
                dir={l.dir}
                aria-pressed={lang === l.code}
                onClick={() => setLang(l.code)}
                style={{
                  textAlign: 'start', padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                  color: 'var(--ink)', fontWeight: 700, fontSize: 14,
                  border: lang === l.code ? '2px solid var(--brand-primary)' : '1px solid var(--line, #e7e5e4)',
                  background: 'var(--surface-elevated, #fff)',
                }}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{l.code.toUpperCase()}</div>
              </button>
            ))}
          </div>
        </Section>
      )}

      {section === 'general' && (
        <Section title={t('set_gen_title')}>
          <div style={{ fontSize: 13, color: '#78716c', marginBottom: 12 }}>
            <b>{session.restaurant_name}</b>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, marginTop: 4 }}>{session.restaurant_id}</div>
          </div>
          {field(t('set_description'), 'description', { textarea: true, placeholder: 'Short intro for staff / branding' })}
          {field(t('set_address'), 'address', { placeholder: 'Street, city' })}
          {field(t('set_contact'), 'contact', { placeholder: '03xx…' })}
          {field(t('set_hours'), 'hours', { placeholder: 'e.g. 12pm – 12am' })}
          {field(t('set_currency'), 'currency', { placeholder: 'PKR' })}
          <SaveBtn busy={busy} onClick={saveGeneral} />
        </Section>
      )}

      {section === 'branding' && (
        <Section title={t('set_brand_title')}>
          <p style={{ fontSize: 13, color: '#78716c', marginTop: 0 }}>
            {t('set_brand_text')}
          </p>
          <LogoUploader
            sessionId={session.id}
            existingLogoUrl={session.logo_url}
            onApplied={onLogoApplied}
          />
        </Section>
      )}

      {section === 'branches' && (
        <Section title={t('set_branches_title')} help="help_branches">
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 0, lineHeight: 1.5 }}>
            {t('set_branches_text')}
          </p>
          <BranchRequestForm session={session} />
        </Section>
      )}

      {section === 'tax' && (
        <Section title={t('set_tax_title')}>
          <TaxSettings
            sessionId={session.id}
            currentTaxPercent={session.tax_percent || 0}
            currentTaxLabel={session.tax_label || 'Tax'}
            onSave={updateTaxSettings}
          />
        </Section>
      )}

      {section === 'delivery' && (
        <Section title={t('set_delivery_title')}>
          <p style={{ fontSize: 13, color: '#78716c', marginTop: 0 }}>
            {t('set_delivery_text')}
          </p>
          <DeliveryAreas
            sessionId={session.id}
          />
          <div style={{ marginTop: 24, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Riders (Phase 1 foundation)</div>
            <RiderFoundationPanel
              sessionId={session.id}
              restaurantId={session.restaurant_id}
            />
          </div>
        </Section>
      )}

      {section === 'notifications' && (
        <Section title={t('set_alerts_title')}>
          <p style={{ fontSize: 13, color: '#78716c', marginTop: 0 }}>
            {t('set_alerts_text')}
          </p>
          {check(t('set_sound'), 'soundOn')}
          {check(t('set_vibrate'), 'vibrateOn')}
          {check(t('set_notify_orders'), 'notifyOrders')}
          {check(t('set_notify_water'), 'notifyWater')}
          {check(t('set_notify_waiter'), 'notifyWaiter')}
          <SaveBtn busy={busy} onClick={saveNotifications} />
        </Section>
      )}

      {section === 'printing' && (
        <Section title={t('set_print_title')}>
          {check(t('set_print_tax'), 'printShowTax')}
          {check(t('set_print_logo'), 'printShowLogo')}
          {field(t('set_print_footer'), 'printFooter', { textarea: true, placeholder: 'Thank you! Visit again.' })}
          <SaveBtn busy={busy} onClick={savePrinting} />
        </Section>
      )}


      {section === 'payment' && (
        <Section title={t('set_pay_title')}>
          <p style={{ fontSize: 13, color: '#78716c', marginTop: 0 }}>
            {t('set_pay_text')}
          </p>
          {check(t('set_pay_cash'), 'paymentCash')}
          {check(t('set_pay_online'), 'paymentOnline')}
          {field(t('set_pay_method'), 'paymentMethodName', { placeholder: 'JazzCash / Easypaisa' })}
          {field(t('set_pay_account'), 'paymentAccountTitle', { placeholder: 'Account title / name' })}
          {field(t('set_pay_instr'), 'paymentInstructions', { textarea: true, placeholder: 'e.g. Send and keep screenshot' })}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#57534e', marginBottom: 6 }}>{t('set_pay_qr')}</div>
            {form.paymentQrUrl && (
              <img src={form.paymentQrUrl} alt={t('set_pay_qr')} style={{
                width: 140, height: 140, objectFit: 'contain', borderRadius: 10,
                border: '1px solid var(--line)', background: 'var(--surface-elevated, #fff)', display: 'block', marginBottom: 8,
              }} />
            )}
            <label style={{
              display: 'inline-block', padding: '10px 14px', borderRadius: 10,
              background: 'var(--brand-primary)', color: 'var(--brand-primary-text)',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
            }}>
              {form.paymentQrUrl ? t('set_qr_replace') : t('set_qr_upload')}
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
                padding: '10px 12px', background: 'var(--surface-elevated, #fff)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}>{t('set_qr_remove')}</button>
            )}
          </div>
          <SaveBtn busy={busy} onClick={savePayment} label={t('set_pay_save')} />
        </Section>
      )}

      {section === 'subscription' && (
        <Section title={t('set_sub_title')}>
          <BillingPanel
            planInfo={planInfo}
            paymentAccounts={paymentAccounts}
            restaurantName={session?.restaurant_name}
            session={session}
            onPlanRefresh={onPlanRefresh}
          />
        </Section>
      )}

      {section === 'security' && (
        <PinChangeSection session={session} />
      )}

      {section === 'whatsapp' && (
        <Section title={t('set_wa_title')}>
          <p style={{ fontSize: 13, color: '#78716c', marginTop: 0 }}>
            {t('set_wa_text')}
          </p>
          {field(t('set_wa_label'), 'whatsapp', { placeholder: '03001234567 or +923001234567' })}
          <SaveBtn busy={busy} onClick={saveWhatsApp} label={t('set_wa_save')} />
        </Section>
      )}

      {section === 'promo' && <PromoSettings session={session} />}

      {section === 'bill' && <BillIdentitySettings session={session} setSession={setSession} />}

      {section === 'guide' && (
        <Section title={t('guide_title')}>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: '#78716c' }}>{t('guide_sub')}</p>
          <button
            type="button"
            onClick={() => openGuidePdf({
              md: findGuide(lang) ?? findGuide('en') ?? '',
              lang,
              dir: isRtl(lang) ? 'rtl' : 'ltr',
              title: t('guide_title'),
            })}
            style={{ ...outlineBtn, marginBottom: 14 }}
          >
            {t('guide_pdf')}
          </button>
          <GuideBook />
        </Section>
      )}

      {section === 'shift' && (
        <Section title={t('set_shift_title')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button type="button" onClick={onCloseShift} style={dangerBtn}>
              {t('set_close_shift')}
            </button>
            <button type="button" onClick={onLogout} style={outlineBtn}>
              {t('set_logout')}
            </button>
          </div>
        </Section>
      )}
    </div>
  )
}

function PinChangeSection({ session }) {
  const { t } = useT()
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setMessage(''); setError('')
    if (!currentPin || !newPin || !confirmPin) return setError('Sab fields zaroori hain.')
    if (!/^\d{4,6}$/.test(newPin)) return setError('New PIN 4 se 6 digits ka hona chahiye.')
    if (newPin !== confirmPin) return setError('New PIN aur Confirm PIN match nahi karte.')
    if (newPin === currentPin) return setError('Naya PIN purane PIN se different hona chahiye.')
    setBusy(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('staff_change_pin', {
        p_session_id: session.id,
        p_tab_secret: getOrCreateTabSecret(),
        p_current_pin: currentPin,
        p_new_pin: newPin,
      })
      if (rpcError) throw rpcError
      if (!data?.ok) throw new Error('PIN_CHANGE_FAILED')
      setCurrentPin(''); setNewPin(''); setConfirmPin('')
      setMessage('PIN successfully change ho gaya.')
    } catch (e) {
      const m = String(e?.message || '')
      setError(m.includes('INVALID_CURRENT_PIN') ? 'Current PIN ghalat hai.' : 'PIN change nahi ho saka. Dobara try karein.')
    } finally { setBusy(false) }
  }

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{t('set_pin_title')}</div>
      <p style={{ fontSize: 13, color: '#78716c', marginTop: 0 }}>{t('set_pin_text')}</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
        <input type="password" inputMode="numeric" autoComplete="current-password" value={currentPin} onChange={e => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('set_pin_current')} style={inputStyle} />
        <input type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('set_pin_new')} style={inputStyle} />
        <input type="password" inputMode="numeric" autoComplete="new-password" value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('set_pin_confirm')} style={inputStyle} />
        {error && <div style={{ color: '#b91c1c', fontSize: 13, fontWeight: 600 }}>{error}</div>}
        {message && <div style={{ color: '#15803d', fontSize: 13, fontWeight: 600 }}>{message}</div>}
        <button type="submit" disabled={busy} style={{ marginTop: 4, border: 'none', borderRadius: 10, padding: '12px 16px', background: 'var(--brand-primary)', color: 'var(--brand-primary-text)', fontWeight: 700, fontSize: 14, opacity: busy ? .7 : 1 }}>{busy ? t('set_saving') : t('set_pin_update')}</button>
      </form>
    </div>
  )
}

function Section({ title, help, children }) {
  return (
    <section style={{
      background: 'var(--surface-elevated, #fff)', border: '1px solid var(--line, #e7e5e4)', borderRadius: 14, padding: 16, marginBottom: 12,
    }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 12 }}>{title}{help && <InfoTip helpKey={help} />}</div>
      {children}
    </section>
  )
}

function SaveBtn({ busy, onClick, label }) {
  const { t } = useT()
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
      {busy ? t('set_saving') : (label || t('set_save'))}
    </button>
  )
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', border: '1px solid var(--line, #e7e5e4)',
  borderRadius: 10, padding: '10px 12px', fontSize: 14, background: 'var(--surface-elevated, #fff)',
  textAlign: 'start',
}

const dangerBtn = {
  background: 'var(--clay, #c2410c)', color: '#fff', border: 'none', borderRadius: 12,
  padding: '14px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
}

const outlineBtn = {
  background: 'var(--surface-elevated, #fff)', color: 'var(--ink)', border: '1px solid var(--line, #e7e5e4)',
  borderRadius: 12, padding: '14px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
}
