import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { DEFAULT_THEME } from '../utils/theme.js'
import '../styles/brandbook.css'

/* ------------------------------------------------------------------
   Brand Book & Printables
   - Thank You card (3.5 x 5 in, portrait) with 10 layouts and 12 font pairs
   - A4 landscape sheet: 4 cards in a 2x2 grid (cards turned 90 deg to fit)
   - Square table QR stickers, A4 landscape, 4 per sheet
   Printing renders only the chosen sheet into a portal, so the dashboard UI
   is never printed. Nothing here changes orders, sessions or the database.
   ------------------------------------------------------------------ */

// 96 px per inch: 3.5in x 5in card = 336 x 480 px
const CARD_W = 336
const CARD_H = 480
const STICKER = 360
const PREVIEW_CARD_W = 280
const PREVIEW_STICKER = 280

// 12 curated font pairs: [heading family, body family, Google weights]
const FONT_PAIRS = [
  { name: 'Playfair + Lato', h: ['Playfair Display', '400;700'], b: ['Lato', '400;700'] },
  { name: 'Cormorant + Montserrat', h: ['Cormorant Garamond', '400;700'], b: ['Montserrat', '400;700'] },
  { name: 'Oswald + Open Sans', h: ['Oswald', '400;700'], b: ['Open Sans', '400;700'] },
  { name: 'Abril + Roboto', h: ['Abril Fatface', '400'], b: ['Roboto', '400;700'] },
  { name: 'Lora + Source Sans', h: ['Lora', '400;700'], b: ['Source Sans 3', '400;700'] },
  { name: 'Bebas + Inter', h: ['Bebas Neue', '400'], b: ['Inter', '400;700'] },
  { name: 'Merriweather + Nunito', h: ['Merriweather', '400;700'], b: ['Nunito', '400;700'] },
  { name: 'Pacifico + Quicksand', h: ['Pacifico', '400'], b: ['Quicksand', '400;700'] },
  { name: 'Dancing Script + Poppins', h: ['Dancing Script', '400;700'], b: ['Poppins', '400;700'] },
  { name: 'DM Serif + DM Sans', h: ['DM Serif Display', '400'], b: ['DM Sans', '400;700'] },
  { name: 'Baskerville + Work Sans', h: ['Libre Baskerville', '400;700'], b: ['Work Sans', '400;700'] },
  { name: 'Anton + Roboto Condensed', h: ['Anton', '400'], b: ['Roboto Condensed', '400;700'] },
]

// 10 card layouts, each with its own default font pair
const LAYOUTS = [
  { id: 'classic', name: 'Classic', font: 0 },
  { id: 'band', name: 'Top Band', font: 1 },
  { id: 'split', name: 'Split', font: 2 },
  { id: 'framed', name: 'Framed', font: 4 },
  { id: 'bigtype', name: 'Big Type', font: 5 },
  { id: 'ribbon', name: 'Ribbon', font: 6 },
  { id: 'minimal', name: 'Minimal', font: 9 },
  { id: 'badge', name: 'Badge', font: 8 },
  { id: 'stripe', name: 'Side Stripe', font: 10 },
  { id: 'corner', name: 'Corner QR', font: 11 },
]

const DEFAULTS = {
  layout: 'classic',
  font: 0,
  heading: 'Thank You',
  message: 'Aap ka khana pasand aaya? Dobara zaroor tashreef laiye.',
  cta: 'Scan to Order',
  name: '',
  bg: '',        // empty = use restaurant brand colour
  tableCount: 6,
  table: 'T1',
}

/* ---------- colour helpers ---------- */
const HEX = /^#([0-9a-f]{6})$/i

function normHex(c, fallback = DEFAULT_THEME.primary) {
  const v = String(c || '').trim()
  return HEX.test(v) ? v.toLowerCase() : fallback
}

function channel(hex, i) {
  return parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
}

function luminance(hex) {
  const lin = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(channel(hex, 0)) + 0.7152 * lin(channel(hex, 1)) + 0.0722 * lin(channel(hex, 2))
}

// Auto contrast: dark text on light backgrounds, white text on dark ones
function contrastText(bg) {
  return luminance(bg) > 0.179 ? '#111111' : '#FFFFFF'
}

// Mix a colour toward black by `amount` (0..1) for band / stripe shades
function shade(hex, amount) {
  const mix = (i) => Math.round(channel(hex, i) * (1 - amount))
  const to = (v) => v.toString(16).padStart(2, '0')
  return `#${to(mix(0))}${to(mix(1))}${to(mix(2))}`
}

/* ---------- QR hook ---------- */
function useQr(text) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let alive = true
    if (!text) { setSrc(''); return undefined }
    QRCode.toDataURL(text, { margin: 1, width: 600, errorCorrectionLevel: 'M' })
      .then((u) => { if (alive) setSrc(u) })
      .catch(() => { if (alive) setSrc('') })
    return () => { alive = false }
  }, [text])
  return src
}

/* ---------- saved settings (per device) ---------- */
function storageKey(restaurantId) {
  return `tableorder:brandbook:${restaurantId || 'default'}`
}

function loadSettings(restaurantId) {
  try {
    const raw = window.localStorage.getItem(storageKey(restaurantId))
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS }
  } catch {
    return { ...DEFAULTS }
  }
}

function saveSettings(restaurantId, value) {
  try {
    window.localStorage.setItem(storageKey(restaurantId), JSON.stringify(value))
  } catch {
    /* storage blocked: settings just last for this visit */
  }
}

/* ---------- Google Fonts loader (CSP allows fonts.googleapis.com) ---------- */
function useFontLoader(pairIndex) {
  useEffect(() => {
    const pair = FONT_PAIRS[pairIndex] || FONT_PAIRS[0]
    const families = [pair.h, pair.b]
      .map(([fam, weights]) => `family=${fam.replace(/ /g, '+')}:wght@${weights}`)
      .join('&')
    const href = `https://fonts.googleapis.com/css2?${families}&display=swap`
    const id = 'bb-google-fonts'
    let link = document.getElementById(id)
    if (!link) {
      link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href)
  }, [pairIndex])
}

/* ---------- card design (336 x 480 px = 3.5 x 5 in) ---------- */
function CardFace({ d }) {
  const { layout, bg, fg, hf, bf, name, heading, message, cta, qr } = d
  const band = shade(bg, 0.18)
  const h = (extra) => ({ fontFamily: hf, color: fg, fontWeight: 700, lineHeight: 1.05, margin: 0, ...extra })
  const b = (extra) => ({ fontFamily: bf, color: fg, margin: 0, ...extra })
  const caps = { fontFamily: bf, fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700, color: fg, margin: 0 }

  const QrBox = ({ size }) => (
    <div className="bb-qr-box" style={{ width: size + 20, height: size + 20 }}>
      {qr ? <img src={qr} alt="" style={{ width: size, height: size }} /> : <div style={{ width: size, height: size }} />}
    </div>
  )
  const Cta = ({ size = 18 }) => <p style={b({ fontSize: size, fontWeight: 700, textAlign: 'center', margin: '12px 0 0' })}>{cta}</p>
  const Msg = ({ align = 'center', size = 15 }) => <p style={b({ fontSize: size, lineHeight: 1.45, textAlign: align, margin: '14px 0 0' })}>{message}</p>

  const base = { width: CARD_W, height: CARD_H, background: bg, color: fg, position: 'relative', overflow: 'hidden', boxSizing: 'border-box' }

  switch (layout) {
    case 'band':
      return (
        <div style={{ ...base, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: band, padding: '34px 24px 26px', textAlign: 'center' }}>
            <p style={caps}>{name}</p>
            <h1 style={h({ fontSize: 52, marginTop: 10 })}>{heading}</h1>
          </div>
          <div style={{ flex: 1, padding: '22px 30px 26px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Msg />
            <div style={{ marginTop: 20 }}><QrBox size={170} /></div>
            <Cta />
          </div>
        </div>
      )

    case 'split':
      return (
        <div style={{ ...base, padding: 34, display: 'flex', flexDirection: 'column' }}>
          <p style={caps}>{name}</p>
          <h1 style={h({ fontSize: 58, marginTop: 14, textAlign: 'left' })}>{heading}</h1>
          <p style={b({ fontSize: 15, lineHeight: 1.45, marginTop: 14, maxWidth: 260 })}>{message}</p>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <p style={b({ fontSize: 16, fontWeight: 700, margin: 0, maxWidth: 130 })}>{cta}</p>
              <div style={{ width: 36, height: 3, background: fg, marginTop: 10 }} />
            </div>
            <QrBox size={150} />
          </div>
        </div>
      )

    case 'framed':
      return (
        <div style={{ ...base, padding: 14 }}>
          <div style={{ border: `2px solid ${fg}`, height: '100%', boxSizing: 'border-box', padding: 8 }}>
            <div style={{ border: `1px solid ${fg}`, height: '100%', boxSizing: 'border-box', padding: '28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <p style={caps}>{name}</p>
              <h1 style={h({ fontSize: 54, marginTop: 14 })}>{heading}</h1>
              <Msg />
              <div style={{ marginTop: 'auto' }}><QrBox size={160} /></div>
              <Cta size={16} />
            </div>
          </div>
        </div>
      )

    case 'bigtype':
      return (
        <div style={{ ...base, padding: 30, display: 'flex', flexDirection: 'column' }}>
          <p style={caps}>{name}</p>
          <h1 style={h({ fontSize: 88, marginTop: 10 })}>{heading.split(' ')[0] || heading}</h1>
          <h1 style={h({ fontSize: 88, marginTop: -6 })}>{heading.split(' ').slice(1).join(' ')}</h1>
          <Msg align="left" size={15} />
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <QrBox size={130} />
            <p style={b({ fontSize: 17, fontWeight: 700, margin: 0 })}>{cta}</p>
          </div>
        </div>
      )

    case 'ribbon':
      return (
        <div style={{ ...base, padding: '36px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ background: fg, color: bg, padding: '7px 18px', borderRadius: 999 }}>
            <p style={{ ...caps, color: bg, margin: 0 }}>{name}</p>
          </div>
          <h1 style={h({ fontSize: 50, marginTop: 22 })}>{heading}</h1>
          <Msg />
          <div style={{ marginTop: 'auto' }}><QrBox size={165} /></div>
          <Cta />
        </div>
      )

    case 'minimal':
      return (
        <div style={{ ...base, padding: '54px 36px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <p style={caps}>{name}</p>
          <h1 style={h({ fontSize: 40, marginTop: 18, textTransform: 'uppercase', letterSpacing: '0.12em' })}>{heading}</h1>
          <div style={{ width: 48, height: 1, background: fg, margin: '20px 0' }} />
          <Msg size={14} />
          <div style={{ marginTop: 'auto' }}><QrBox size={150} /></div>
          <Cta size={16} />
        </div>
      )

    case 'badge':
      return (
        <div style={{ ...base, padding: '36px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <p style={caps}>{name}</p>
          <h1 style={h({ fontSize: 50, marginTop: 12 })}>{heading}</h1>
          <div style={{ marginTop: 22, width: 220, height: 220, borderRadius: '50%', border: `3px dashed ${fg}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <QrBox size={170} />
          </div>
          <Cta size={17} />
          <Msg size={14} />
        </div>
      )

    case 'stripe':
      return (
        <div style={{ ...base, display: 'flex' }}>
          <div style={{ width: 74, background: band, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ ...caps, transform: 'rotate(-90deg)', whiteSpace: 'nowrap', fontSize: 13 }}>{name}</p>
          </div>
          <div style={{ flex: 1, padding: '34px 26px', display: 'flex', flexDirection: 'column' }}>
            <h1 style={h({ fontSize: 52 })}>{heading}</h1>
            <Msg align="left" />
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <QrBox size={150} />
              <p style={b({ fontSize: 16, fontWeight: 700, margin: '10px 0 0' })}>{cta}</p>
            </div>
          </div>
        </div>
      )

    case 'corner':
      return (
        <div style={{ ...base, padding: 30, display: 'flex', flexDirection: 'column' }}>
          <div style={{ alignSelf: 'flex-end' }}><QrBox size={120} /></div>
          <div style={{ marginTop: 'auto' }}>
            <p style={caps}>{name}</p>
            <h1 style={h({ fontSize: 66, marginTop: 10 })}>{heading}</h1>
            <Msg align="left" />
            <p style={b({ fontSize: 17, fontWeight: 700, margin: '16px 0 0' })}>{cta}</p>
          </div>
        </div>
      )

    case 'classic':
    default:
      return (
        <div style={{ ...base, padding: '40px 32px 34px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <p style={caps}>{name}</p>
          <h1 style={h({ fontSize: 56, marginTop: 16 })}>{heading}</h1>
          <Msg />
          <div style={{ marginTop: 'auto' }}><QrBox size={170} /></div>
          <Cta />
        </div>
      )
  }
}

/* A card that owns its QR image */
function Card({ url, ...rest }) {
  const qr = useQr(url)
  return <CardFace d={{ ...rest, qr }} />
}

/* ---------- table sticker (square 360 px = 95 mm) ---------- */
function Sticker({ url, name, table, cta, bg, fg, hf, bf }) {
  const qr = useQr(url)
  return (
    <div style={{
      width: STICKER, height: STICKER, boxSizing: 'border-box', background: bg, color: fg,
      padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', textAlign: 'center',
    }}>
      <p style={{ fontFamily: hf, fontWeight: 700, fontSize: 24, margin: 0, lineHeight: 1.1 }}>{name}</p>
      <div style={{ background: fg, color: bg, borderRadius: 999, padding: '6px 22px' }}>
        <p style={{ fontFamily: bf, fontWeight: 700, fontSize: 20, letterSpacing: '0.06em', margin: 0 }}>{table}</p>
      </div>
      <div className="bb-qr-box" style={{ width: 220, height: 220 }}>
        {qr ? <img src={qr} alt="" style={{ width: 200, height: 200 }} /> : <div style={{ width: 200, height: 200 }} />}
      </div>
      <p style={{ fontFamily: bf, fontWeight: 700, fontSize: 17, margin: 0 }}>{cta}</p>
    </div>
  )
}

/* ---------- print sheets (A4 landscape, 297 x 210 mm) ---------- */
function CardSheet({ cards }) {
  return (
    <div className="bb-sheet">
      {cards.map((c, i) => (
        <div className="bb-cell" key={i}>
          <div className="bb-turn">
            <div className="bb-card-abs"><Card {...c} /></div>
          </div>
        </div>
      ))}
    </div>
  )
}

function StickerSheet({ stickers }) {
  return (
    <div className="bb-sheet">
      {stickers.map((s, i) => (
        <div className="bb-cell bb-center" key={i}>
          <Sticker {...s} />
        </div>
      ))}
    </div>
  )
}

/* Waits for fonts and QR images, then opens the print dialog */
function PrintPortal({ printing, onDone, children }) {
  useEffect(() => {
    if (!printing) return undefined
    let cancelled = false
    const finish = () => { if (!cancelled) onDone() }
    window.addEventListener('afterprint', finish)

    const waitReady = async () => {
      const start = Date.now()
      while (Date.now() - start < 4000) {
        const imgs = [...document.querySelectorAll('.bb-print-root img')]
        if (imgs.length && imgs.every((i) => i.complete && i.naturalWidth > 0)) break
        await new Promise((r) => setTimeout(r, 100))
      }
      try { if (document.fonts && document.fonts.ready) await document.fonts.ready } catch { /* ignore */ }
      if (!cancelled) window.print()
    }
    waitReady()

    return () => {
      cancelled = true
      window.removeEventListener('afterprint', finish)
    }
  }, [printing, onDone])

  if (!printing) return null
  // Portal into body so the dashboard layout is never part of the print
  return createPortal(<div className="bb-print-root">{children}</div>, document.body)
}

/* ---------- main component ---------- */
export default function BrandBook({ session }) {
  const restaurantId = session?.restaurant_id
  const qrSecret = session?.qr_secret
  const brand = normHex(session?.theme?.primary)

  const [tab, setTab] = useState('card')
  const [s, setS] = useState(() => loadSettings(restaurantId))
  const [printing, setPrinting] = useState(null)

  const update = (patch) => {
    setS((prev) => {
      const next = { ...prev, ...patch }
      saveSettings(restaurantId, next)
      return next
    })
  }

  const layoutIndex = Math.max(0, LAYOUTS.findIndex((l) => l.id === s.layout))
  const fontIndex = Math.min(Math.max(0, Number(s.font) || 0), FONT_PAIRS.length - 1)
  useFontLoader(fontIndex)

  const pair = FONT_PAIRS[fontIndex]
  const hf = `'${pair.h[0]}', Georgia, serif`
  const bf = `'${pair.b[0]}', Arial, Helvetica, sans-serif`

  const bg = normHex(s.bg, brand)
  const fg = contrastText(bg)
  const name = s.name || session?.restaurant_name || 'Restaurant'
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const deliveryUrl = restaurantId && qrSecret ? `${origin}/delivery/${restaurantId}/${qrSecret}` : ''
  const tableCount = Math.min(Math.max(1, Number(s.tableCount) || 1), 60)
  const tableIds = Array.from({ length: tableCount }, (_, i) => `T${i + 1}`)
  const table = tableIds.includes(s.table) ? s.table : 'T1'
  const tableUrl = restaurantId && qrSecret ? `${origin}/order/${restaurantId}/${qrSecret}/${table}` : ''

  const cardProps = useMemo(() => ({
    layout: LAYOUTS[layoutIndex].id, bg, fg, hf, bf, name,
    heading: s.heading || 'Thank You', message: s.message || '', cta: s.cta || 'Scan to Order',
  }), [layoutIndex, bg, fg, hf, bf, name, s.heading, s.message, s.cta])

  const onDone = useMemo(() => () => setPrinting(null), [])

  const printCards = () => setPrinting('cards')
  const printStickers = () => setPrinting('stickers')

  const cardsForSheet = [0, 1, 2, 3].map(() => ({ ...cardProps, url: deliveryUrl }))
  const stickersForSheet = [0, 1, 2, 3].map(() => ({ url: tableUrl, name, table, cta: s.cta || 'Scan to Order', bg, fg, hf, bf }))

  const cardScale = PREVIEW_CARD_W / CARD_W
  const stickerScale = PREVIEW_STICKER / STICKER

  const missingLink = !restaurantId || !qrSecret

  return (
    <div className="bb-root">
      <div className="bb-head">
        <h2 className="bb-title">Brand Book &amp; Printables</h2>
        <p className="bb-sub">Thank You card aur table QR stickers. Preview live dekhein, phir A4 par print karein.</p>
      </div>

      <div className="bb-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'card'} className={tab === 'card' ? 'on' : ''} onClick={() => setTab('card')}>Thank You Card</button>
        <button type="button" role="tab" aria-selected={tab === 'sticker'} className={tab === 'sticker' ? 'on' : ''} onClick={() => setTab('sticker')}>Table QR Stickers</button>
      </div>

      {missingLink && (
        <div className="bb-warn">Restaurant link data load nahi hua. Page refresh karke dobara koshish karein.</div>
      )}

      {tab === 'card' && (
        <div className="bb-grid">
          <div className="bb-preview-col">
            <div className="bb-preview" style={{ width: PREVIEW_CARD_W, height: CARD_H * cardScale }}>
              <div style={{ transform: `scale(${cardScale})`, transformOrigin: 'top left', width: CARD_W, height: CARD_H }}>
                <Card url={deliveryUrl} {...cardProps} />
              </div>
            </div>
            <p className="bb-note">Card size: 3.5 x 5 in (88.9 x 127 mm). Text colour brand rang ke hisaab se auto set hota hai.</p>
            <button type="button" className="bb-print" onClick={printCards} disabled={missingLink}>
              A4 par 4 cards print karein
            </button>
          </div>

          <div className="bb-controls">
            <label className="bb-field">
              <span>Restaurant naam</span>
              <input value={s.name} placeholder={session?.restaurant_name || ''} onChange={(e) => update({ name: e.target.value })} />
            </label>
            <label className="bb-field">
              <span>Heading</span>
              <input value={s.heading} maxLength={24} onChange={(e) => update({ heading: e.target.value })} />
            </label>
            <label className="bb-field">
              <span>Message</span>
              <textarea rows={2} value={s.message} maxLength={120} onChange={(e) => update({ message: e.target.value })} />
            </label>
            <label className="bb-field">
              <span>QR ke neeche text</span>
              <input value={s.cta} maxLength={32} onChange={(e) => update({ cta: e.target.value })} />
            </label>

            <div className="bb-field">
              <span>Background rang</span>
              <div className="bb-row">
                <input type="color" value={bg} onChange={(e) => update({ bg: e.target.value })} aria-label="Background colour" />
                <span className="bb-muted">{s.bg ? 'Custom' : 'Brand colour'}</span>
                {s.bg && <button type="button" className="bb-link" onClick={() => update({ bg: '' })}>Brand rang use karein</button>}
              </div>
            </div>

            <div className="bb-field">
              <span>Layout (10)</span>
              <div className="bb-layouts">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`bb-layout ${s.layout === l.id ? 'on' : ''}`}
                    onClick={() => update({ layout: l.id, font: l.font })}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </div>

            <label className="bb-field">
              <span>Font pair (12)</span>
              <select value={fontIndex} onChange={(e) => update({ font: Number(e.target.value) })}>
                {FONT_PAIRS.map((p, i) => <option key={p.name} value={i}>{i + 1}. {p.name}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}

      {tab === 'sticker' && (
        <div className="bb-grid">
          <div className="bb-preview-col">
            <div className="bb-preview" style={{ width: PREVIEW_STICKER, height: PREVIEW_STICKER }}>
              <div style={{ transform: `scale(${stickerScale})`, transformOrigin: 'top left', width: STICKER, height: STICKER }}>
                <Sticker url={tableUrl} name={name} table={table} cta={s.cta || 'Scan to Order'} bg={bg} fg={fg} hf={hf} bf={bf} />
              </div>
            </div>
            <p className="bb-note">Square sticker 95 x 95 mm. Ek A4 par 4 stickers aate hain, ek hi table ke.</p>
            <button type="button" className="bb-print" onClick={printStickers} disabled={missingLink}>
              {table} ke 4 stickers print karein
            </button>
          </div>

          <div className="bb-controls">
            <label className="bb-field">
              <span>Tables ki tadaad (1–60)</span>
              <input
                type="number" min={1} max={60} value={s.tableCount}
                onChange={(e) => {
                  const n = Math.min(60, Math.max(1, Number(e.target.value) || 1))
                  const cur = Number(String(s.table).slice(1)) || 1
                  update({ tableCount: n, table: `T${Math.min(n, cur)}` })
                }}
              />
            </label>
            <label className="bb-field">
              <span>Table select karein</span>
              <select value={table} onChange={(e) => update({ table: e.target.value })}>
                {tableIds.map((t) => <option key={t} value={t}>Table {t.slice(1)}</option>)}
              </select>
            </label>
            <label className="bb-field">
              <span>QR ke neeche text</span>
              <input value={s.cta} maxLength={32} onChange={(e) => update({ cta: e.target.value })} />
            </label>
            <div className="bb-field">
              <span>Background rang</span>
              <div className="bb-row">
                <input type="color" value={bg} onChange={(e) => update({ bg: e.target.value })} aria-label="Background colour" />
                <span className="bb-muted">{s.bg ? 'Custom' : 'Brand colour'}</span>
                {s.bg && <button type="button" className="bb-link" onClick={() => update({ bg: '' })}>Brand rang use karein</button>}
              </div>
            </div>
            <label className="bb-field">
              <span>Font pair (12)</span>
              <select value={fontIndex} onChange={(e) => update({ font: Number(e.target.value) })}>
                {FONT_PAIRS.map((p, i) => <option key={p.name} value={i}>{i + 1}. {p.name}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}

      <PrintPortal printing={printing} onDone={onDone}>
        {printing === 'cards' && <CardSheet cards={cardsForSheet} />}
        {printing === 'stickers' && <StickerSheet stickers={stickersForSheet} />}
      </PrintPortal>
    </div>
  )
}
