import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import { DEFAULT_THEME } from '../utils/theme.js'
import '../styles/brandbook.css'

/* ------------------------------------------------------------------
   Brand Book & Printables
   - Thank You card: 10 sizes, 10 layouts, 24 font pairs, logo, 3 languages.
     A4 landscape, 4 per page (2 x 2), each fitted and centred in its quarter.
   - Table QR stickers: From–To range, own QR per table, 3 designs.
     A4 portrait, 6 per page (2 columns x 3 rows).
   Printing renders only the chosen sheet into a portal, so the dashboard UI
   is never printed. Nothing here changes orders, sessions or the database.
   ------------------------------------------------------------------ */

const PX = 96                        // CSS pixels per inch (print scale)
const STICKER = 360                  // sticker design size (95.25 mm)
const STICKER_PRINT_SCALE = 0.95     // printed sticker ~90 mm, leaves a gap
const PREVIEW_CARD_MAX_W = 280
const PREVIEW_CARD_MAX_H = 420
const PREVIEW_STICKER = 280

// Card sheet: A4 landscape, 2 x 2 quarters (148.5 x 104.5 mm each)
const CARD_CELL_W_MM = 148.5
const CARD_CELL_H_MM = 104.5
const CELL_W = (CARD_CELL_W_MM / 25.4) * PX
const CELL_H = (CARD_CELL_H_MM / 25.4) * PX
const CUT_SAFE = 0.96                // keep a little margin inside each cell

// Sticker sheet: A4 portrait, 2 columns x 3 rows (104.5 x 98.5 mm each)
const STICKERS_PER_PAGE = 6
const STICKER_CELL_W_MM = 104.5
const STICKER_CELL_H_MM = 98.5

const MAX_TABLES = 100
const REF_W = 336                    // design reference: 3.5 in wide
const REF_H = 480                    //                   5 in tall

// Page size for each sheet type. Injected just before printing.
const PAGE_CSS = {
  cards: '@page { size: A4 landscape; margin: 0; }',
  stickers: '@page { size: A4 portrait; margin: 0; }',
}

// 10 premium card sizes (inches). Each is fitted to a quarter automatically.
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

/* ---------- sizing ---------- */
function sizeFor(id) {
  return CARD_SIZES.find((s) => s.id === id) || CARD_SIZES[0]
}

// Pick the orientation (upright or turned 90°) that fits a card-sheet quarter
// at the largest scale, never enlarging beyond true size.
function fitCell(cw, ch) {
  const options = [
    { rot: false, dw: cw, dh: ch },
    { rot: true, dw: ch, dh: cw },
  ]
  let best = { rot: false, scale: 0 }
  for (const o of options) {
    const sc = Math.min(CELL_W * CUT_SAFE / o.dw, CELL_H * CUT_SAFE / o.dh)
    if (sc > best.scale) best = { rot: o.rot, scale: sc }
  }
  return { rot: best.rot, scale: Math.min(best.scale, 1) }
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
   the same proportions. Text colour is set automatically for contrast.
   The restaurant logo sits at the top of every layout; transparent PNGs work best. */
function CardFace({ d }) {
  const { layout, bg, fg, hf, bf, name, heading, message, cta, qr, logo, W, H, rtl } = d
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
        {qr ? <img src={qr} alt="" style={{ width: s, height: s }} /> : <div style={{ width: s, height: s }} />}
      </div>
    )
  }
  const Cta = ({ size = 18 }) => (
    <p style={b({ fontSize: z(size), fontWeight: 700, textAlign: 'center', margin: z(12) + 'px 0 0' })}>{cta}</p>
  )
  const Msg = ({ align = 'center', size = 15 }) => (
    <p style={b({ fontSize: z(size), textAlign: align, margin: z(14) + 'px 0 0' })}>{message}</p>
  )
  // Logo: align 'center' | 'start' | 'end'. Keeps transparent PNG as is (no box).
  const Logo = ({ align = 'center', size = 150, mb = 12 }) => {
    if (!logo) return null
    const side = align === 'start' ? 'flex-start' : align === 'end' ? 'flex-end' : 'center'
    return (
      <img
        src={logo}
        alt=""
        style={{
          display: 'block', alignSelf: side,
          marginLeft: align === 'center' ? 'auto' : undefined,
          marginRight: align === 'center' ? 'auto' : undefined,
          maxWidth: z(size), maxHeight: z(size * 0.45), width: 'auto', height: 'auto',
          objectFit: 'contain', marginBottom: z(mb),
        }}
      />
    )
  }

  const words = String(heading).split(' ')
  const pad = z(34)
  const start = rtl ? 'end' : 'start'
  const textAlign = rtl ? 'right' : 'left'

  switch (layout) {
    case 'band':
      return (
        <div style={{ ...base, display: 'flex', flexDirection: 'column' }}>
          <div style={{ background: band, padding: `${z(26)}px ${z(24)}px ${z(26)}px`, textAlign: 'center' }}>
            <Logo size={130} mb={10} />
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
          <Logo align={start} size={120} mb={12} />
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
            <div style={{ border: `1px solid ${fg}`, height: '100%', boxSizing: 'border-box', padding: `${z(24)}px ${z(24)}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <Logo size={120} mb={10} />
              <p style={caps}>{name}</p>
              <h1 style={h({ fontSize: z(54), marginTop: z(12) })}>{heading}</h1>
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
          <Logo align={start} size={110} mb={10} />
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
        <div style={{ ...base, padding: `${z(30)}px ${z(28)}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Logo size={130} mb={12} />
          <div style={{ background: fg, color: bg, padding: `${z(7)}px ${z(18)}px`, borderRadius: 999 }}>
            <p style={{ ...caps, color: bg }}>{name}</p>
          </div>
          <h1 style={h({ fontSize: z(50), marginTop: z(20) })}>{heading}</h1>
          <Msg />
          <div style={{ marginTop: 'auto' }}><QrBox size={165} /></div>
          <Cta />
        </div>
      )

    case 'minimal':
      return (
        <div style={{ ...base, padding: `${z(44)}px ${z(36)}px ${z(40)}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Logo size={120} mb={12} />
          <p style={caps}>{name}</p>
          <h1 style={h({ fontSize: z(40), marginTop: z(16), textTransform: rtl ? 'none' : 'uppercase', letterSpacing: rtl ? '0' : '0.12em' })}>{heading}</h1>
          <div style={{ width: z(48), height: 1, background: fg, margin: `${z(18)}px 0` }} />
          <Msg size={14} />
          <div style={{ marginTop: 'auto' }}><QrBox size={150} /></div>
          <Cta size={16} />
        </div>
      )

    case 'badge':
      return (
        <div style={{ ...base, padding: `${z(30)}px ${z(28)}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Logo size={120} mb={8} />
          <p style={caps}>{name}</p>
          <h1 style={h({ fontSize: z(50), marginTop: z(10) })}>{heading}</h1>
          <div style={{ marginTop: z(18), width: z(220), height: z(220), borderRadius: '50%', border: `${Math.max(1, z(3))}px dashed ${fg}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          <div style={{ flex: 1, padding: `${z(30)}px ${z(26)}px`, display: 'flex', flexDirection: 'column' }}>
            <Logo align={start} size={110} mb={10} />
            <h1 style={h({ fontSize: z(52) })}>{heading}</h1>
            <Msg align={textAlign} />
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: rtl ? 'flex-end' : 'flex-start' }}>
              <QrBox size={150} />
              <p style={b({ fontSize: z(16), fontWeight: 700, margin: `${z(10)}px 0 0` })}>{cta}</p>
            </div>
          </div>
        </div>
      )

    case 'corner':
      return (
        <div style={{ ...base, padding: z(30), display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Logo align={start} size={110} mb={0} />
            <QrBox size={120} />
          </div>
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
        <div style={{ ...base, padding: `${z(36)}px ${z(32)}px ${z(34)}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <Logo size={140} mb={12} />
          <p style={caps}>{name}</p>
          <h1 style={h({ fontSize: z(56), marginTop: z(14) })}>{heading}</h1>
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

/* ---------- table stickers (design 360 px) ---------- */
function StickerFace({ design, name, table, cta, bg, hf, bf, rtl, qr }) {
  const onBrand = contrastText(bg)
  const ink = '#111111'
  const box = (size) => (
    <div className="bb-qr-box" style={{ width: size + 20, height: size + 20 }}>
      {qr ? <img src={qr} alt="" style={{ width: size, height: size }} /> : <div style={{ width: size, height: size }} />}
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

function Sticker({ url, ...rest }) {
  const qr = useQr(url)
  return <StickerFace {...rest} qr={qr} />
}

/* ---------- print sheets ---------- */
// A4 landscape card sheet: 4 cards, 2 x 2
function CardSheet({ cfg }) {
  const slot = {
    position: 'absolute', left: '50%', top: '50%', width: cfg.cw, height: cfg.ch,
    transform: `translate(-50%, -50%)${cfg.rot ? ' rotate(90deg)' : ''} scale(${cfg.scale})`,
    transformOrigin: '50% 50%',
  }
  return (
    <div className="bb-sheet bb-sheet-cards">
      {[0, 1, 2, 3].map((i) => (
        <div className="bb-cell bb-cell-cards" key={i}>
          <div style={slot}><Card {...cfg} /></div>
        </div>
      ))}
    </div>
  )
}

// A4 portrait sticker sheet: up to 6 stickers, 2 x 3
function StickerPage({ items }) {
  return (
    <div className="bb-sheet bb-sheet-stickers">
      {Array.from({ length: STICKERS_PER_PAGE }, (_, i) => (
        <div className="bb-cell bb-cell-stickers bb-center" key={i}>
          {items[i] ? (
            <div style={{ width: STICKER, height: STICKER, transform: `scale(${STICKER_PRINT_SCALE})`, transformOrigin: '50% 50%', flexShrink: 0 }}>
              <Sticker {...items[i]} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function setPageSize(css) {
  let el = document.getElementById('bb-page-size')
  if (!el) {
    el = document.createElement('style')
    el.id = 'bb-page-size'
    document.head.appendChild(el)
  }
  el.textContent = css
}

function clearPageSize() {
  const el = document.getElementById('bb-page-size')
  if (el) el.remove()
}

/* Sets the right A4 orientation, waits for fonts and images, then prints */
function PrintPortal({ printing, onDone, children }) {
  useEffect(() => {
    if (!printing) return undefined
    let cancelled = false
    const finish = () => { if (!cancelled) onDone() }
    window.addEventListener('afterprint', finish)
    setPageSize(PAGE_CSS[printing] || PAGE_CSS.cards)

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
      clearPageSize()
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
  const logo = session?.logo_url || ''

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
  const fit = fitCell(cw, ch)

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
  const pageCount = Math.ceil(tableNums.length / STICKERS_PER_PAGE)

  const tableUrl = (n) => (ready ? `${origin}/order/${restaurantId}/${qrSecret}/T${n}` : '')

  const cardCfg = {
    cw, ch, W: cw, H: ch, rot: fit.rot, scale: fit.scale, url: deliveryUrl, logo,
    layout: LAYOUTS[layoutIndex].id, bg, fg, hf, bf, name, heading, message, cta, rtl,
  }

  const stickerItem = (n) => ({
    url: tableUrl(n), design: s.design, name, table: `${L.table} ${n}`, cta, bg, hf, bf, rtl,
  })

  const stickerPages = []
  for (let i = 0; i < tableNums.length; i += STICKERS_PER_PAGE) {
    stickerPages.push(tableNums.slice(i, i + STICKERS_PER_PAGE).map(stickerItem))
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
                <Card {...cardCfg} />
              </div>
            </div>
            <p className="bb-note">
              {size.name}. A4 landscape par 4 cards (2 x 2), har card apne quarter mein center mein.
              {!logo && ' Logo ke liye Settings > Branding mein logo upload karein.'}
            </p>
            <button type="button" className="bb-print" onClick={printCards} disabled={!ready}>
              A4 par 4 cards print karein
            </button>
          </div>

          <div className="bb-controls">
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
                <Sticker {...stickerItem(previewTable)} />
              </div>
            </div>
            <p className="bb-note">Preview: {L.table} {previewTable}. A4 portrait par 6 stickers (2 x 3), har sticker ~90 mm.</p>
            <p className="bb-note">
              {rangeError
                ? <span className="bb-error">{rangeError}</span>
                : <>T{from}–T{to}: {tableNums.length} sticker, {pageCount} A4 page.</>}
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
        {printing === 'cards' && <CardSheet cfg={cardCfg} />}
        {printing === 'stickers' && stickerPages.map((items, i) => <StickerPage key={i} items={items} />)}
      </PrintPortal>
    </div>
  )
}
