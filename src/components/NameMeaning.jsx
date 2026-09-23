import { useMemo, useState } from 'react'

/** Common Pakistani / Muslim names — short meaning + vibe + origin */
const NAME_DB = {
  afzaal: {
    meaning: 'Fazal ki inteha — bohot zyada bakhshish wala',
    origin: 'Arabic',
    vibe: 'Afzaal naam wale log aksar soft-hearted, generous aur leadership wale hote hain. Doosron ki madad karna unka nature hai.',
  },
  ahmed: {
    meaning: 'Sabse zyada tareef kiya gaya',
    origin: 'Arabic',
    vibe: 'Ahmed naam wale log balanced, respectful aur reliable hote hain. Log un par bharosa karte hain.',
  },
  ahmad: {
    meaning: 'Sabse zyada tareef kiya gaya',
    origin: 'Arabic',
    vibe: 'Ahmad naam wale log balanced, respectful aur reliable hote hain. Log un par bharosa karte hain.',
  },
  ali: {
    meaning: 'Buland / Uncha / Sharif',
    origin: 'Arabic',
    vibe: 'Ali naam wale log bold, protective aur energetic hote hain. Challenge se nahi darte.',
  },
  bilal: {
    meaning: 'Paani se bheeja hua / Khushboo wala',
    origin: 'Arabic',
    vibe: 'Bilal naam wale log loyal, clear-voice aur strong character wale hote hain.',
  },
  fahad: {
    meaning: 'Cheetah — tezz aur hoshiyar',
    origin: 'Arabic',
    vibe: 'Fahad naam wale log quick thinker, ambitious aur competitive hote hain.',
  },
  hamza: {
    meaning: 'Sher / Mazboot',
    origin: 'Arabic',
    vibe: 'Hamza naam wale log brave, protective aur family-oriented hote hain.',
  },
  hassan: {
    meaning: 'Khoobsurat / Achha',
    origin: 'Arabic',
    vibe: 'Hassan naam wale log charming, calm aur aesthetic sense wale hote hain.',
  },
  hussein: {
    meaning: 'Chhota hassan — pyaara',
    origin: 'Arabic',
    vibe: 'Hussein naam wale log kind, emotional aur principled hote hain.',
  },
  imran: {
    meaning: 'Taraqi / Khushhali',
    origin: 'Arabic',
    vibe: 'Imran naam wale log progressive, family-focused aur responsible hote hain.',
  },
  omar: {
    meaning: 'Zindagi / Lambi umar',
    origin: 'Arabic',
    vibe: 'Omar / Umar naam wale log wise, just aur strong decision-makers hote hain.',
  },
  umar: {
    meaning: 'Zindagi / Lambi umar',
    origin: 'Arabic',
    vibe: 'Umar naam wale log wise, just aur strong decision-makers hote hain.',
  },
  usman: {
    meaning: 'Hoshyar / Baby bustard (classical)',
    origin: 'Arabic',
    vibe: 'Usman naam wale log generous, calm aur principled hote hain.',
  },
  yusuf: {
    meaning: 'Khuda barhaye',
    origin: 'Hebrew / Arabic',
    vibe: 'Yusuf naam wale log handsome personality, patient aur dreamer nature ke hote hain.',
  },
  zain: {
    meaning: 'Zeenat / Khoobsurati',
    origin: 'Arabic',
    vibe: 'Zain naam wale log stylish, friendly aur positive energy wale hote hain.',
  },
  zubair: {
    meaning: 'Mazboot / Hoshyar',
    origin: 'Arabic',
    vibe: 'Zubair naam wale log strong-willed, loyal aur hardworking hote hain.',
  },
  aisha: {
    meaning: 'Zinda dil / Prosperous',
    origin: 'Arabic',
    vibe: 'Aisha naam wali girls intelligent, lively aur confident hoti hain.',
  },
  fatima: {
    meaning: 'Rokne wali / Pure',
    origin: 'Arabic',
    vibe: 'Fatima naam wali girls pure-hearted, strong aur caring hoti hain.',
  },
  maryam: {
    meaning: 'Pious woman',
    origin: 'Hebrew / Arabic',
    vibe: 'Maryam naam wali girls gentle, spiritual aur graceful hoti hain.',
  },
  sana: {
    meaning: 'Tareef / Brilliance',
    origin: 'Arabic',
    vibe: 'Sana naam wali girls bright, soft-spoken aur creative hoti hain.',
  },
  zara: {
    meaning: 'Phool / Shining',
    origin: 'Arabic / Hebrew',
    vibe: 'Zara naam wali girls radiant, modern aur confident hoti hain.',
  },
  noor: {
    meaning: 'Roshni',
    origin: 'Arabic',
    vibe: 'Noor naam wale log positive, calming aur hope-filled energy rakhte hain.',
  },
  rayan: {
    meaning: 'Jannat ka darwaza (Rayyan)',
    origin: 'Arabic',
    vibe: 'Rayan naam wale log disciplined, spiritual aur ambitious hote hain.',
  },
  ayaan: {
    meaning: 'Gift of God / Path',
    origin: 'Arabic / Sanskrit',
    vibe: 'Ayaan naam wale log lucky, curious aur forward-looking hote hain.',
  },
  arham: {
    meaning: 'Meherban / Raham karne wala',
    origin: 'Arabic',
    vibe: 'Arham naam wale log kind, soft aur empathetic hote hain.',
  },
  haris: {
    meaning: 'Nigehbaan / Guardian',
    origin: 'Arabic',
    vibe: 'Haris naam wale log protective, responsible aur alert hote hain.',
  },
  saad: {
    meaning: 'Khushqismati',
    origin: 'Arabic',
    vibe: 'Saad naam wale log optimistic, lucky aur friendly hote hain.',
  },
  sameer: {
    meaning: 'Shaam ki hawa / Entertaining companion',
    origin: 'Arabic / Sanskrit',
    vibe: 'Sameer naam wale log talkative, fun aur social butterfly hote hain.',
  },
  talha: {
    meaning: 'Tree name (classical) / Fruitful',
    origin: 'Arabic',
    vibe: 'Talha naam wale log steadfast, loyal aur grounded hote hain.',
  },
  waseem: {
    meaning: 'Khoobsurat / Graceful',
    origin: 'Arabic',
    vibe: 'Waseem naam wale log charming, polite aur well-mannered hote hain.',
  },
  yasir: {
    meaning: 'Asaan / Wealthy',
    origin: 'Arabic',
    vibe: 'Yasir naam wale log easy-going, generous aur practical hote hain.',
  },
  danish: {
    meaning: 'Ilm / Wisdom',
    origin: 'Persian',
    vibe: 'Danish naam wale log thoughtful, intelligent aur calm hote hain.',
  },
  farhan: {
    meaning: 'Khush / Joyful',
    origin: 'Arabic',
    vibe: 'Farhan naam wale log cheerful, energetic aur people-person hote hain.',
  },
  kamran: {
    meaning: 'Kamyab / Successful',
    origin: 'Persian',
    vibe: 'Kamran naam wale log ambitious, focused aur success-driven hote hain.',
  },
  noman: {
    meaning: 'Blood / Blessing (classical)',
    origin: 'Arabic',
    vibe: 'Noman naam wale log sincere, creative aur warm-hearted hote hain.',
  },
  rabia: {
    meaning: 'Chaar / Spring',
    origin: 'Arabic',
    vibe: 'Rabia naam wali girls strong, spiritual aur inspiring hoti hain.',
  },
  hira: {
    meaning: 'Diamond cave (Hira)',
    origin: 'Arabic',
    vibe: 'Hira naam wali girls precious, thoughtful aur deep hoti hain.',
  },
  iqra: {
    meaning: 'Padho',
    origin: 'Arabic',
    vibe: 'Iqra naam wali girls knowledge-loving, focused aur bright hoti hain.',
  },
  laiba: {
    meaning: 'Angelic / Most beautiful',
    origin: 'Arabic',
    vibe: 'Laiba naam wali girls graceful, kind aur admired hoti hain.',
  },
  mahnoor: {
    meaning: 'Chandni ki roshni',
    origin: 'Persian / Urdu',
    vibe: 'Mahnoor naam wali girls gentle, glowing aur peaceful energy rakhti hain.',
  },
  areeba: {
    meaning: 'Wise / Intelligent',
    origin: 'Arabic',
    vibe: 'Areeba naam wali girls sharp, mature aur understanding hoti hain.',
  },
}

const FALLBACK_VIBES = [
  'Aap positive energy rakhte hain aur log aapke around comfortable feel karte hain.',
  'Aap practical soch wale hain aur mushkil waqt mein calm rehte hain.',
  'Aap friendly aur warm nature ke hain — dosto mein popular.',
  'Aap creative touch rakhte hain aur nayi cheezein try karna pasand karte hain.',
]

function lookupName(raw) {
  const key = String(raw || '').trim().toLowerCase().replace(/[^a-z\u0600-\u06FF]/g, '')
  if (!key) return null
  if (NAME_DB[key]) return { key, ...NAME_DB[key] }

  // Simple phonetic fallbacks
  const meaning = `${raw.trim()} — ek khoobsurat aur unique naam`
  const vibe = FALLBACK_VIBES[key.length % FALLBACK_VIBES.length]
  return {
    key,
    meaning,
    origin: 'Mixed / Modern',
    vibe,
  }
}

export default function NameMeaning({ menuItems = [] }) {
  const [name, setName] = useState('')
  const [submitted, setSubmitted] = useState('')

  const result = useMemo(() => (submitted ? lookupName(submitted) : null), [submitted])

  const luckyDish = useMemo(() => {
    if (!result || !menuItems.length) return null
    const available = menuItems.filter(i => i.is_available !== false)
    if (!available.length) return null
    const idx = (result.key.charCodeAt(0) + result.key.length * 7) % available.length
    return available[idx]
  }, [result, menuItems])

  const onSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitted(name.trim())
  }

  return (
    <div style={{
      margin: '16px 16px 0',
      background: '#fff',
      border: '1px solid var(--line)',
      borderRadius: 14,
      padding: 14,
    }}>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 6 }}>
        Apna naam batao — matlab batata hoon
      </div>
      <div style={{ fontSize: 12, color: '#7a7264', marginBottom: 10 }}>
        Origin, personality vibe, aur aaj ka lucky dish
      </div>

      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Afzaal"
          style={{
            flex: 1, border: '1px solid var(--line)', borderRadius: 10,
            padding: '10px 12px', fontSize: 14, background: '#fff',
          }}
        />
        <button type="submit" style={{
          background: 'var(--brand-primary)', color: 'var(--brand-primary-text)',
          border: 'none', borderRadius: 10, padding: '10px 14px', fontWeight: 700, fontSize: 13,
        }}>
          Batao
        </button>
      </form>

      {result && (
        <div style={{
          marginTop: 12, padding: 12, borderRadius: 12,
          background: 'linear-gradient(135deg, #faf7f2, #fff)',
          border: '1px solid var(--line)',
        }}>
          <div style={{ fontSize: 18, fontWeight: 800, textTransform: 'capitalize' }}>
            {submitted}
          </div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: 'var(--brand-primary)' }}>
            {result.meaning}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#7a7264' }}>
            <b>Origin:</b> {result.origin}
          </div>
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>
            {result.vibe}
          </div>
          {luckyDish && (
            <div style={{
              marginTop: 10, padding: '8px 10px', borderRadius: 10,
              background: 'rgba(0,0,0,0.04)', fontSize: 13, fontWeight: 600,
            }}>
              🍽 Aaj ka lucky dish: {luckyDish.name}
              {luckyDish.price != null && (
                <span style={{ fontFamily: 'var(--mono)', marginLeft: 6 }}>
                  · PKR {Number(luckyDish.price).toFixed(0)}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
