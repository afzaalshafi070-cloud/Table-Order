import { LANGUAGES } from '../i18n/languages.js'
import { setLang, getLang } from '../i18n/index.js'

// First screen: pick a language. Shown once per browser (choice is saved).
export default function LanguageGate({ onDone }) {
  const current = getLang()

  const pick = code => {
    setLang(code)
    onDone?.(code)
  }

  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 560, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
          LANGUAGE · ЯЗЫК · 语言 · اللغة
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(22px, 4vw, 30px)', margin: '8px 0 18px', letterSpacing: '-0.02em' }}>
          Choose your language
        </h1>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 150px), 1fr))',
          gap: 10,
        }}>
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              type="button"
              onClick={() => pick(l.code)}
              dir={l.dir}
              style={{
                minWidth: 0,
                textAlign: 'start',
                padding: '14px 14px',
                borderRadius: 14,
                border: current === l.code ? '2px solid var(--brand-primary)' : '1px solid var(--border, var(--line))',
                background: 'var(--surface-elevated, #fff)',
                color: 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{l.code.toUpperCase()}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
