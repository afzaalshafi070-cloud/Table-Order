import { useState } from 'react'

export default function TaxSettings({
  sessionId,
  currentTaxPercent = 0,
  currentTaxLabel = 'Tax',
  onSave
}) {
  const [taxPercent, setTaxPercent] = useState(currentTaxPercent)
  const [taxLabel, setTaxLabel] = useState(currentTaxLabel)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(taxPercent, taxLabel)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const isChanged = taxPercent !== currentTaxPercent || taxLabel !== currentTaxLabel

  return (
    <div style={{ padding: 16, maxWidth: 600 }}>
      <div style={{
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: 20,
        marginBottom: 18
      }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16, color: 'var(--ink)' }}>
          💰 Tax Settings
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{
            display: 'block',
            fontWeight: 600,
            fontSize: 13,
            color: '#5a5346',
            marginBottom: 8
          }}>
            Tax Percentage (%)
          </label>
          <input
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={taxPercent}
            onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
            style={{
              width: '100%',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 14,
              boxSizing: 'border-box',
              fontFamily: 'var(--mono)'
            }}
          />
          <div style={{ fontSize: 12, color: '#7a7264', marginTop: 6 }}>
            Example: 17% GST, 5% service tax, 0% = no tax
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{
            display: 'block',
            fontWeight: 600,
            fontSize: 13,
            color: '#5a5346',
            marginBottom: 8
          }}>
            Tax Label
          </label>
          <input
            type="text"
            value={taxLabel}
            onChange={(e) => setTaxLabel(e.target.value)}
            placeholder="e.g., GST, Service Tax, Tax"
            style={{
              width: '100%',
              border: '1px solid var(--line)',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 14,
              boxSizing: 'border-box'
            }}
          />
          <div style={{ fontSize: 12, color: '#7a7264', marginTop: 6 }}>
            Ye label customers ko bill mein dikhegi
          </div>
        </div>

        {/* Preview */}
        <div style={{
          background: 'var(--paper-dim)',
          border: '1px dashed var(--line)',
          borderRadius: 8,
          padding: 12,
          marginBottom: 20
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#5a5346', marginBottom: 8 }}>
            Preview (100 PKR example)
          </div>
          <div style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>Subtotal</span>
            <span style={{ fontFamily: 'var(--mono)' }}>PKR 100</span>
          </div>
          <div style={{ fontSize: 13, color: '#7a7264', display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span>{taxLabel} ({taxPercent}%)</span>
            <span style={{ fontFamily: 'var(--mono)' }}>PKR {(100 * taxPercent / 100).toFixed(2)}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--line)' }}>
            <span>Total</span>
            <span style={{ fontFamily: 'var(--mono)' }}>PKR {(100 + (100 * taxPercent / 100)).toFixed(2)}</span>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={!isChanged || saving}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: isChanged ? 'var(--sage)' : 'var(--paper-dim)',
            color: isChanged ? '#fff' : '#7a7264',
            border: 'none',
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 14,
            cursor: isChanged ? 'pointer' : 'default',
            opacity: saving ? 0.7 : 1
          }}
        >
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Tax Settings'}
        </button>

        {saved && (
          <div style={{ marginTop: 12, padding: 10, background: '#f0fdf4', border: '1px solid var(--sage)', borderRadius: 6, color: 'var(--sage)', fontSize: 13 }}>
            ✓ Tax settings update ho gayi! Ab se naye orders mein ye apply hogi.
          </div>
        )}
      </div>

      {/* Help Section */}
      <div style={{
        background: '#fff',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius)',
        padding: 16
      }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--ink)' }}>
          ❓ Help
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: '#5a5346' }}>
          <p>
            <strong>Tax percentage:</strong> Agar 17% GST hai to 17 likho. Customers ke bills mein automatically add ho jaega.
          </p>
          <p style={{ marginTop: 8 }}>
            <strong>Tax label:</strong> "GST", "Service Tax", ya "Tax" - jo chahiye likho. Customers ko bill mein isi naam se dikh aayega.
          </p>
          <p style={{ marginTop: 8 }}>
            <strong>Kaunsa orders affected honge?</strong> Naye orders (abhi se banenge wale) - purane orders nahi badlenge.
          </p>
          <p style={{ marginTop: 8 }}>
            <strong>0% set karni hai?</strong> Agar tax nahi chahiye to 0 likho. Phir tax add nahi hoga.
          </p>
        </div>
      </div>
    </div>
  )
}
