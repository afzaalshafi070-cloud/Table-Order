import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { DEFAULT_THEME } from '../utils/theme.js'
import '../styles/brandbook.css'

/* ------------------------------------------------------------------
   Brand Book & Printables
   - Thank You card: 10 sizes, 10 layouts, 24 font pairs, 3 languages.
   - Printing: A4 PORTRAIT, cards upright at true size (no rotation, no zoom,
     no transform). Cards per page are calculated from the card size, and the
     page count follows from the Quantity you enter.
   - QR codes are drawn as SVG from the QR matrix, so they are always present
     in the print (no image loading race).
   - Table QR stickers: From–To range, own QR per table, 6 per A4 page (2 x 3).
   Printing renders only the chosen sheet into a portal, so the dashboard UI
   is never printed. Nothing here changes orders, sessions or the database.
   ------------------------------------------------------------------ */

const PX = 96                        // CSS pixels per inch (print scale)
const MM_PER_IN = 25.4
const PAGE_W_PX = (210 / MM_PER_IN) * PX   // A4 portrait width  (793.7 px)
const PAGE_H_PX = (297 / MM_PER_IN) * PX   // A4 portrait height (1122.5 px)
const STICKER = 360                  // sticker design size (95.25 mm), printed at true size
const PREVIEW_CARD_MAX_W = 280
const PREVIEW_CARD_MAX_H = 420
const PREVIEW_STICKER = 280
const MAX_TABLES = 100
const MAX_QTY = 500
const REF_W = 336                    // card design reference: 3.5 in wide
const REF_H = 480                    //                       5 in tall

// 10 premium card sizes (inches). Printed upright at true size.
const CARD_SIZES = [
  { id: 'std', name: 'Standard Tall · 3.5 × 5 in', w: 3.5, h: 5 },
  { id: 'slim', name: 'Slim Tall (rack) · 2 × 6 in', w: 2, h: 6 },
  { id: 'slim2', name: 'Slim Tall · 2.5 × 7 in', w: 2.5, h: 7 },
  { id: 'golden', name: 'Golden Portrait · 3.5 × 5.67 in', w: 3.5, h: 5.67 },
  { id: 'p34', name: 'Small Portrait · 3 × 4 in', w: 3, h: 4 },
  { id: 'p46', name: 'Portrait · 4 × 6 in', w: 4, h: 6 },
  { id: 'sq4', name: 'Square · 4 × 4 in', w: 4, h: 4 },
  { id: 'sq3', name: 'Mini Square · 3 × 3 in', w: 3, h: 3 },
  { id: 'l35', name: 'Landscape · 5 × 3.5 in', w: 5, h: 3.5 },
  { id: 'l64', name: 'Postcard · 6 × 4 in', w: 6, h: 4 },
]

// 24 font pairs: heading + body. [family, Google weights]
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
  { name: 'Cinzel + Raleway', h: ['Cinzel', '400;700'], b: ['Raleway', '400;700'] },
  { name: 'Playfair + Montserrat', h: ['Playfair Display', '400;700'], b: ['Montserrat', '400;700'] },
  { name: 'Crimson Pro + Karla', h: ['Crimson Pro', '400;700'], b: ['Karla', '400;700'] },
  { name: 'Fraunces + Inter', h: ['Fraunces', '400;700'], b: ['Inter', '400;700'] },
  { name: 'Josefin Slab + Josefin Sans', h: ['Josefin Slab', '400;700'], b: ['Josefin Sans', '400;700'] },
  { name: 'Marcellus + Jost', h: ['Marcellus', '400'], b: ['Jost', '400;700'] },
  { name: 'Bodoni Moda + Jost', h: ['Bodoni Moda', '400;700'], b: ['Jost', '400;700'] },
  { name: 'Italiana + Lato', h: ['Italiana', '400'], b: ['Lato', '400;700'] },
  { name: 'Yeseva One + Mulish', h: ['Yeseva One', '400'], b: ['Mulish', '400;700'] },
  { name: 'Prata + Karla', h: ['Prata', '400'], b: ['Karla', '400;700'] },
  { name: 'Alegreya + Alegreya Sans', h: ['Alegreya', '400;700'], b: ['Alegreya Sans', '400;700'] },
  { name: 'Gilda Display + Nunito Sans', h: ['Gilda Display', '400'], b: ['Nunito Sans', '400;700'] },
]

const URDU_FONT = ['Noto Nastaliq Urdu', '400;700']

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

// Language packs for card and sticker text
const LANGS = {
  en: {
    label: 'English',
    heading: 'Thank You',
    message: 'Thank you for dining with us. We hope to see you again soon.',
    cta: 'Scan to Order',
    table: 'Table',
  },
  ro: {
    label: 'Roman Urdu',
    heading: 'Shukriya',
    message: 'Aap ka khana pasand aaya? Dobara zaroor tashreef laiye.',
    cta: 'Order karne ke liye scan karein',
    table: 'Table',
  },
  ur: {
    label: 'اردو (Urdu)',
    heading: 'شکریہ',
    message: 'آپ کا کھانا پسند آیا؟ دوبارہ ضرور تشریف لائیں۔',
    cta: 'آرڈر کے لیے اسکین کریں',
    table: 'میز',
  },
}

const STICKER_DESIGNS = [
  { id: 'border', name: 'Border frame' },
  { id: 'circle', name: 'Brand circle' },
  { id: 'minimal', name: 'Minimal' },
]

const DEFAULTS = {
  sizeId: 'std',
  lang: 'en',
  layout: 'classic',
  font: 0,
  qty: 4,
  design: 'border',
  name: '',
  heading: '',   // empty = language default
  message: '',
  cta: '',
  bg: '',        // empty = restaurant brand colour
  from: 1,
  to: 6,
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

// Mix a colour toward black by `amount` (0..1)
function shade(hex, amount) {
  const mix = (i) => Math.round(channel(hex, i) * (1 - amount))
  const to = (v) => v.toString(16).padStart(2, '0')
  return `#${to(mix(0))}${to(mix(1))}${to(mix(2))}`
}

/* ---------- sizing & grid ---------- */
function sizeFor(id) {
  return CARD_SIZES.find((s) => s.id === id) || CARD_SIZES[0]
}

// How many upright cards fit on one A4 portrait page, as a grid.
function gridFor(cw, ch) {
  const cols = Math.max(1, Math.floor(PAGE_W_PX / cw))
  const rows = Math.max(1, Math.floor(PAGE_H_PX / ch))
  return { cols, rows, perPage: cols * rows }
}

/* ---------- QR as SVG (synchronous, always present in print) ---------- */
function QrSvg({ text, size }) {
  const d = useMemo(() => {
    if (!text) return null
    try {
      const qr = QRCode.create(text, { errorCorrectionLevel: 'M' })
      const count = qr.modules.size
      const data = qr.modules.data
      let path = ''
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (data[r * count + c]) path += `M${c} ${r}h1v1h-1z`
        }
      }
      return { count, path }
    } catch {
      return null
    }
  }, [text])

  if (!d) return <div style={{ width: size, height: size }} />
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${d.count} ${d.count}`}
      shapeRendering="crispEdges"
      style={{ display: 'block' }}
      role="img"
      aria-label="QR code"
    >
      <rect width={d.count} height={d.count} fill="#FFFFFF" />
      <path d={d.path} fill="#000000" />
    </svg>
  )
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
    /* storage blocked: settings last only for this visit */
  }
}

/* ---------- Google Fonts loader (CSP allows fonts.googleapis.com) ---------- */
function useFontLoader(pairIndex, rtl) {
  useEffect(() => {
    const pair = FONT_PAIRS[pairIndex] || FONT_PAIRS[0]
    const list = rtl ? [URDU_FONT] : [pair.h, pair.b]
    const families = list
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
  }, [pairIndex, rtl])
}

/* ---------- thank you card ----------
   Designed on a 336 x 480 px reference and scaled by k, so every size keeps
   the same proportions. Text colour is set automatically for contrast. */
function CardFace({ d }) {
  const { layout, bg, fg, hf, bf, name, heading, message, cta, url, W, H, rtl } = d
  const k = Math.min(W / REF_W, H / REF_H)
  const z = (v) => Math.round(v * k)
  const band = shade(bg, 0.18)
  const lh = rtl ? 1.8 : 1.05
  const h = (extra) => ({ fontFamily: hf, color: fg, fontWeight: 700, lineHeight: lh, margin: 0, ...extra })
  const b = (extra) => ({ fontFamily: bf, color: fg, margin: 0, lineHeight: rtl ? 1.8 : 1.45, ...extra })
  const caps = {
    fontFamily: bf, fontSize: z(12), letterSpacing: rtl ? '0' : '0.2em',
    textTransform: rtl ? 'none' : 'uppercase', fontWeight: 700, color: fg, margin: 0,
  }
  const base = {
    width: W, height: H, background: bg, color: fg, position: 'relative', overflow: 'hidden',
    boxSizing: 'border-box', direction: rtl ? 'rtl' : 'ltr',
  }

  const QrBox = ({ size }) => {
    const s = z(size)
    const p = z(10)
    return (
      <div className="bb-qr-box" style={{ width: s + p * 2, height: s + p * 2, padding: p, borderRadius: z(12) }}>
        <QrSvg text={url} size={s} />
      </div>
    )
  }
  const Cta = ({ size = 18 }) => (
    <p style={b({ fontSize: z(size), fontWeight: 700, textAlign: 'center', margin: z(12) + 'px 0 0' })}>{cta}</p>
  )
  const Msg = ({ align = 'center', size = 15 }) => (
    <p style={b({ fontSize: z(size), textAlign: align, margin: z(14) + 'px 0 0' })}>{message}</p>
  )

  const words = String(heading).split(' ')
  const pad = z(34)
  const textAlign = rtl ? 'right' : 'left'
  const startSide = rtl ? 'flex-end' : 'flex-start'

  switch (layout) {
    case 'band':
      return (
        <div style={{ ...base, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: band, padding: `${z(34)}px ${z(24)}px ${z(26)}px`, textAlign: 'center' }}>
            <p style={caps}>{name}</p>
            <h1 style={h({ fontSize: z(52), marginTop: z(10) })}>{heading}</h1>
          </div>
          <div style={{ flex: 1, padding: `${z(22)}px ${z(30)}px ${z(26)}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Msg />
            <div style={{ marginTop: z(20) }}><QrBox size={170} /></div>
            <Cta />
          </div>
        </div>
      )

    case 'split':
      return (
        <div style={{ ...base, padding: pad, display: 'flex', flexDirection: 'column' }}>
          <p style={caps}>{name}</p>
          <h1 style={h({ fontSize: z(58), marginTop: z(14), textAlign })}>{heading}</h1>
          <p style={b({ fontSize: z(15), marginTop: z(14), maxWidth: z(260), textAlign })}>{message}</p>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: z(12) }}>
            <div>
              <p style={b({ fontSize: z(16), fontWeight: 700, maxWidth: z(130) })}>{cta}</p>
              <div style={{ width: z(36), height: Math.max(2, z(3)), background: fg, marginTop: z(10) }} />
            </div>
            <QrBox size={150} />
          </div>
        </div>
      )

    case 'framed':
      return (
        <div style={{ ...base, padding: z(14) }}>
          <div style={{ border: `${Math.max(1, z(2))}px solid ${fg}`, height: '100%', boxSizing: 'border-box', padding: z(8) }}>
            <div style={{ border: `1px solid ${fg}`, height: '100%', boxSizing: 'border-box', padding: `${z(28)}px ${z(24)}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <p style={caps}>{name}</p>
              <h1 style={h({ fontSize: z(54), marginTop: z(14) })}>{heading}</h1>
              <Msg />
              <div style={{ marginTop: 'auto' }}><QrBox size={160} /></div>
              <Cta size={16} />
            </div>
          </div>
        </div>
      )

    case 'bigtype':
      return (
        <div style={{ ...base, padding: z(30), display: 'flex', flexDirection: 'column' }}>
          <p style={caps}>{name}</p>
          <h1 style={h({ fontSize: z(88), marginTop: z(10) })}>{words[0] || heading}</h1>
          {words.length > 1 && <h1 style={h({ fontSize: z(88), marginTop: -z(6) })}>{words.slice(1).join(' ')}</h1>}
          <Msg align={textAlign} size={15} />
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: z(16) }}>
            <QrBox size={130} />
            <p style={b({ fontSize: z(17), fontWeight: 700 })}>{cta}</p>
          </div>
        </div>
      )

    case 'ribbon':
      return (
        <div style={{ ...base, padding: `${z(36)}px ${z(28)}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ background: fg, color: bg, padding: `${z(7)}px ${z(18)}px`, borderRadius: 999 }}>
            <p style={{ ...caps, color: bg }}>{name}</p>
          </div>
          <h1 style={h({ fontSize: z(50), marginTop: z(22) })}>{heading}</h1>
          <Msg />
          <div style={{ marginTop: 'auto' }}><QrBox size={165} /></div>
          <Cta />
        </div>
      )

    case 'minimal':
      return (
        <div style={{ ...base, padding: `${z(54)}px ${z(36)}px ${z(40)}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <p style={caps}>{name}</p>
          <h1 style={h({ fontSize: z(40), marginTop: z(18), textTransform: rtl ? 'none' : 'uppercase', letterSpacing: rtl ? '0' : '0.12em' })}>{heading}</h1>
          <div style={{ width: z(48), height: 1, background: fg, margin: `${z(20)}px 0` }} />
          <Msg size={14} />
          <div style={{ marginTop: 'auto' }}><QrBox size={150} /></div>
          <Cta size={16} />
        </div>
      )

    case 'badge':
      return (
        <div style={{ ...base, padding: `${z(36)}px ${z(28)}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <p style={caps}>{name}</p>
          <h1 style={h({ fontSize: z(50), marginTop: z(12) })}>{heading}</h1>
          <div style={{ marginTop: z(22), width: z(220), height: z(220), borderRadius: '50%', border: `${Math.max(1, z(3))}px dashed ${fg}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <QrBox size={170} />
          </div>
          <Cta size={17} />
          <Msg size={14} />
        </div>
      )

    case 'stripe':
      return (
        <div style={{ ...base, display: 'flex', flexDirection: rtl ? 'row-reverse' : 'row' }}>
          <div style={{ width: z(74), background: band, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <p style={{ ...caps, transform: 'rotate(-90deg)', whiteSpace: 'nowrap', fontSize: z(13) }}>{name}</p>
          </div>
          <div style={{ flex: 1, padding: `${z(34)}px ${z(26)}px`, display: 'flex', flexDirection: 'column' }}>
            <h1 style={h({ fontSize: z(52) })}>{heading}</h1>
            <Msg align={textAlign} />
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: startSide }}>
              <QrBox size={150} />
              <p style={b({ fontSize: z(16), fontWeight: 700, margin: `${z(10)}px 0 0` })}>{cta}</p>
            </div>
          </div>
        </div>
      )

    case 'corner':
      return (
        <div style={{ ...base, padding: z(30), display: 'flex', flexDirection: 'column' }}>
          <div style={{ alignSelf: rtl ? 'flex-start' : 'flex-end' }}><QrBox size={120} /></div>
          <div style={{ marginTop: 'auto' }}>
            <p style={caps}>{name}</p>
            <h1 style={h({ fontSize: z(66), marginTop: z(10) })}>{heading}</h1>
            <Msg align={textAlign} />
            <p style={b({ fontSize: z(17), fontWeight: 700, margin: `${z(16)}px 0 0` })}>{cta}</p>
          </div>
        </div>
      )

    case 'classic':
    default:
      return (
        <div style={{ ...base, padding: `${z(40)}px ${z(32)}px ${z(34)}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <p style={caps}>{name}</p>
          <h1 style={h({ fontSize: z(56), marginTop: z(16) })}>{heading}</h1>
          <Msg />
          <div style={{ marginTop: 'auto' }}><QrBox size={170} /></div>
          <Cta />
        </div>
      )
  }
}

/* ---------- table stickers (design 360 px, printed at true size) ---------- */
function StickerFace({ design, name, table, cta, bg, hf, bf, rtl, url }) {
  const onBrand = contrastText(bg)
  const ink = '#111111'
  const box = (size) => (
    <div className="bb-qr-box" style={{ width: size + 20, height: size + 20 }}>
      <QrSvg text={url} size={size} />
    </div>
  )
  const pill = (
    <div style={{ background: bg, color: onBrand, borderRadius: 999, padding: '6px 22px' }}>
      <p style={{ fontFamily: bf, fontWeight: 700, fontSize: 20, letterSpacing: rtl ? '0' : '0.06em', margin: 0 }}>{table}</p>
    </div>
  )
  const root = {
    width: STICKER, height: STICKER, boxSizing: 'border-box', background: '#FFFFFF', color: ink,
    position: 'relative', overflow: 'hidden', direction: rtl ? 'rtl' : 'ltr',
  }

  if (design === 'circle') {
    return (
      <div style={{ ...root, padding: 18, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', textAlign: 'center' }}>
        <p style={{ fontFamily: hf, fontWeight: 700, fontSize: 22, margin: 0, lineHeight: 1.15 }}>{name}</p>
        <div style={{ width: 236, height: 236, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {box(176)}
        </div>
        {pill}
        <p style={{ fontFamily: bf, fontWeight: 700, fontSize: 16, margin: 0, color: ink }}>{cta}</p>
      </div>
    )
  }

  if (design === 'minimal') {
    return (
      <div style={{ ...root, padding: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', textAlign: 'center' }}>
        <p style={{ fontFamily: bf, fontWeight: 700, fontSize: 15, letterSpacing: rtl ? '0' : '0.18em', textTransform: rtl ? 'none' : 'uppercase', margin: 0 }}>{name}</p>
        <p style={{ fontFamily: hf, fontWeight: 700, fontSize: 40, margin: 0, lineHeight: 1 }}>{table}</p>
        {box(190)}
        <p style={{ fontFamily: bf, fontWeight: 700, fontSize: 17, margin: 0 }}>{cta}</p>
      </div>
    )
  }

  // border frame (default)
  return (
    <div style={root}>
      <div style={{ position: 'absolute', inset: 12, border: `10px solid ${bg}`, borderRadius: 22, boxSizing: 'border-box' }} />
      <div style={{ position: 'absolute', inset: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', textAlign: 'center' }}>
        <p style={{ fontFamily: hf, fontWeight: 700, fontSize: 24, margin: 0, lineHeight: 1.1 }}>{name}</p>
        {pill}
        {box(190)}
        <p style={{ fontFamily: bf, fontWeight: 700, fontSize: 17, margin: 0 }}>{cta}</p>
      </div>
    </div>
  )
}

/* ---------- print pages (A4 portrait, 210 x 297 mm, no transform, no zoom) ---------- */
// Card page: CSS grid of exact card size tracks. Empty slots keep the grid intact.
function CardPage({ cfg, count }) {
  const { cols, rows } = gridFor(cfg.cw, cfg.ch)
  const slots = cols * rows
  return (
    <div className="bb-page">
      <div
        className="bb-sheet bb-sheet-cards"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${cfg.cw}px)`,
          gridTemplateRows: `repeat(${rows}, ${cfg.ch}px)`,
        }}
      >
        {Array.from({ length: slots }, (_, i) => (
          <div className="bb-card-cell" key={i} style={{ width: cfg.cw, height: cfg.ch }}>
            {i < count ? <CardFace d={{ ...cfg, url: cfg.url }} /> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

// Sticker page: 2 columns x 3 rows, each cell 105 x 99 mm, sticker centred at true size
function StickerPage({ items }) {
  return (
    <div className="bb-page">
      <div className="bb-sheet bb-sheet-stickers">
        {Array.from({ length: 6 }, (_, i) => (
          <div className="bb-cell-stickers bb-center" key={i}>
            {items[i] ? <StickerFace {...items[i]} /> : null}
          </div>
        ))}
      </div>
    </div>
  )
}

/* Waits for fonts, then opens the print dialog. QR is SVG, so no image wait is needed. */
function PrintPortal({ printing, onDone, children }) {
  useEffect(() => {
    if (!printing) return undefined
    let cancelled = false
    const finish = () => { if (!cancelled) onDone() }
    window.addEventListener('afterprint', finish)

    const go = async () => {
      try { if (document.fonts && document.fonts.ready) await document.fonts.ready } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, 60))
      if (!cancelled) window.print()
    }
    go()

    return () => {
      cancelled = true
      window.removeEventListener('afterprint', finish)
    }
  }, [printing, onDone])

  if (!printing) return null
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

  const lang = LANGS[s.lang] ? s.lang : 'en'
  const L = LANGS[lang]
  const rtl = lang === 'ur'

  const size = sizeFor(s.sizeId)
  const cw = Math.round(size.w * PX)
  const ch = Math.round(size.h * PX)
  const grid = gridFor(cw, ch)

  const qty = Math.min(MAX_QTY, Math.max(1, Math.round(Number(s.qty)) || 1))
  const cardPages = Math.ceil(qty / grid.perPage)

  const layoutIndex = Math.max(0, LAYOUTS.findIndex((l) => l.id === s.layout))
  const fontIndex = Math.min(Math.max(0, Number(s.font) || 0), FONT_PAIRS.length - 1)
  useFontLoader(fontIndex, rtl)

  const pair = FONT_PAIRS[fontIndex]
  const hf = rtl ? `'${URDU_FONT[0]}', serif` : `'${pair.h[0]}', Georgia, serif`
  const bf = rtl ? `'${URDU_FONT[0]}', serif` : `'${pair.b[0]}', Arial, Helvetica, sans-serif`

  const bg = normHex(s.bg, brand)
  const fg = contrastText(bg)
  const name = (s.name || '').trim() || session?.restaurant_name || 'Restaurant'
  const heading = (s.heading || '').trim() || L.heading
  const message = (s.message || '').trim() || L.message
  const cta = (s.cta || '').trim() || L.cta
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const ready = Boolean(restaurantId && qrSecret)

  const deliveryUrl = ready ? `${origin}/delivery/${restaurantId}/${qrSecret}` : ''

  // Table range: From–To, capped at MAX_TABLES
  const from = Math.min(MAX_TABLES, Math.max(1, Math.round(Number(s.from)) || 1))
  const rawTo = Math.round(Number(s.to)) || from
  const to = Math.min(Math.max(rawTo, from), Math.min(MAX_TABLES, from + MAX_TABLES - 1))
  const rangeError = rawTo < from ? '"To" number "From" se chhota nahi ho sakta.' : rawTo > MAX_TABLES ? `Ek baar mein maximum ${MAX_TABLES} tables.` : ''
  const tableNums = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const stickerPageCount = Math.ceil(tableNums.length / 6)

  const tableUrl = (n) => (ready ? `${origin}/order/${restaurantId}/${qrSecret}/T${n}` : '')

  const cardCfg = {
    cw, ch, W: cw, H: ch, url: deliveryUrl,
    layout: LAYOUTS[layoutIndex].id, bg, fg, hf, bf, name, heading, message, cta, rtl,
  }

  const stickerItem = (n) => ({
    url: tableUrl(n), design: s.design, name, table: `${L.table} ${n}`, cta, bg, hf, bf, rtl,
  })

  const stickerPages = []
  for (let i = 0; i < tableNums.length; i += 6) {
    stickerPages.push(tableNums.slice(i, i + 6).map(stickerItem))
  }

  // Card pages: qty cards, grid.perPage per A4 page, last page partially filled
  const cardPageCounts = []
  let remaining = qty
  while (remaining > 0) {
    const take = Math.min(grid.perPage, remaining)
    cardPageCounts.push(take)
    remaining -= take
  }

  const onDone = () => setPrinting(null)

  const cardScale = Math.min(PREVIEW_CARD_MAX_W / cw, PREVIEW_CARD_MAX_H / ch)
  const stickerScale = PREVIEW_STICKER / STICKER
  const previewBoxW = Math.round(cw * cardScale)
  const previewBoxH = Math.round(ch * cardScale)
  const previewTable = from

  const langSelect = (
    <label className="bb-field">
      <span>Language</span>
      <select value={lang} onChange={(e) => update({ lang: e.target.value })}>
        {Object.entries(LANGS).map(([id, l]) => <option key={id} value={id}>{l.label}</option>)}
      </select>
    </label>
  )

  const fontSelect = (
    <label className="bb-field">
      <span>Font pair (24)</span>
      <select value={fontIndex} disabled={rtl} onChange={(e) => update({ font: Number(e.target.value) })}>
        {FONT_PAIRS.map((p, i) => <option key={p.name} value={i}>{i + 1}. {p.name}</option>)}
      </select>
      {rtl && <small className="bb-muted">Urdu ke liye Nastaliq font khud lagta hai.</small>}
    </label>
  )

  const bgField = (
    <div className="bb-field">
      <span>Background rang</span>
      <div className="bb-row">
        <input type="color" value={bg} onChange={(e) => update({ bg: e.target.value })} aria-label="Background colour" />
        <span className="bb-muted">{s.bg ? 'Custom' : 'Brand colour'}</span>
        {s.bg && <button type="button" className="bb-link" onClick={() => update({ bg: '' })}>Brand rang use karein</button>}
      </div>
    </div>
  )

  const printCards = () => setPrinting('cards')
  const printStickers = () => setPrinting('stickers')

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

      {!ready && (
        <div className="bb-warn">Restaurant link data load nahi hua. Page refresh karke dobara koshish karein.</div>
      )}

      {tab === 'card' && (
        <div className="bb-grid">
          <div className="bb-preview-col">
            <div className="bb-preview" style={{ width: previewBoxW, height: previewBoxH }}>
              <div style={{ transform: `scale(${cardScale})`, transformOrigin: 'top left', width: cw, height: ch }}>
                <CardFace d={{ ...cardCfg, url: deliveryUrl }} />
              </div>
            </div>
            <p className="bb-note">
              {size.name}. A4 portrait par {grid.cols} x {grid.rows} = <b>{grid.perPage} cards per page</b>, true size par, upright.
            </p>
            <p className="bb-note">
              {qty} cards = <b>{cardPages} page</b>{cardPages > 1 ? ' (auto-pagination)' : ''}.
            </p>
            <button type="button" className="bb-print" onClick={printCards} disabled={!ready}>
              {qty} cards print karein
            </button>
          </div>

          <div className="bb-controls">
            <label className="bb-field">
              <span>Quantity (kitne cards)</span>
              <input type="number" min={1} max={MAX_QTY} value={s.qty} onChange={(e) => update({ qty: e.target.value })} />
            </label>
            <label className="bb-field">
              <span>Card size (10)</span>
              <select value={size.id} onChange={(e) => update({ sizeId: e.target.value })}>
                {CARD_SIZES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            {langSelect}
            <label className="bb-field">
              <span>Restaurant naam</span>
              <input value={s.name} placeholder={session?.restaurant_name || ''} onChange={(e) => update({ name: e.target.value })} />
            </label>
            <label className="bb-field">
              <span>Heading</span>
              <input value={s.heading} placeholder={L.heading} maxLength={24} onChange={(e) => update({ heading: e.target.value })} />
            </label>
            <label className="bb-field">
              <span>Message</span>
              <textarea rows={2} value={s.message} placeholder={L.message} maxLength={120} onChange={(e) => update({ message: e.target.value })} />
            </label>
            <label className="bb-field">
              <span>QR ke neeche text</span>
              <input value={s.cta} placeholder={L.cta} maxLength={40} onChange={(e) => update({ cta: e.target.value })} />
            </label>
            {bgField}
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
            {fontSelect}
          </div>
        </div>
      )}

      {tab === 'sticker' && (
        <div className="bb-grid">
          <div className="bb-preview-col">
            <div className="bb-preview" style={{ width: PREVIEW_STICKER, height: PREVIEW_STICKER }}>
              <div style={{ transform: `scale(${stickerScale})`, transformOrigin: 'top left', width: STICKER, height: STICKER }}>
                <StickerFace {...stickerItem(previewTable)} />
              </div>
            </div>
            <p className="bb-note">Preview: {L.table} {previewTable}. A4 portrait par 6 stickers (2 x 3), true size par.</p>
            <p className="bb-note">
              {rangeError
                ? <span className="bb-error">{rangeError}</span>
                : <>T{from}–T{to}: {tableNums.length} sticker, {stickerPageCount} A4 page.</>}
            </p>
            <button type="button" className="bb-print" onClick={printStickers} disabled={!ready || Boolean(rangeError)}>
              T{from}–T{to} ke stickers print karein
            </button>
          </div>

          <div className="bb-controls">
            <div className="bb-row-2">
              <label className="bb-field">
                <span>From (table)</span>
                <input type="number" min={1} max={MAX_TABLES} value={s.from} onChange={(e) => update({ from: e.target.value })} />
              </label>
              <label className="bb-field">
                <span>To (table)</span>
                <input type="number" min={1} max={MAX_TABLES} value={s.to} onChange={(e) => update({ to: e.target.value })} />
              </label>
            </div>
            <label className="bb-field">
              <span>Sticker design (3)</span>
              <select value={s.design} onChange={(e) => update({ design: e.target.value })}>
                {STICKER_DESIGNS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            {langSelect}
            <label className="bb-field">
              <span>Restaurant naam</span>
              <input value={s.name} placeholder={session?.restaurant_name || ''} onChange={(e) => update({ name: e.target.value })} />
            </label>
            <label className="bb-field">
              <span>QR ke neeche text</span>
              <input value={s.cta} placeholder={L.cta} maxLength={40} onChange={(e) => update({ cta: e.target.value })} />
            </label>
            {bgField}
            {fontSelect}
          </div>
        </div>
      )}

      <PrintPortal printing={printing} onDone={onDone}>
        {printing === 'cards' && cardPageCounts.map((count, i) => <CardPage key={i} cfg={cardCfg} count={count} />)}
        {printing === 'stickers' && stickerPages.map((items, i) => <StickerPage key={i} items={items} />)}
      </PrintPortal>
    </div>
  )
}
