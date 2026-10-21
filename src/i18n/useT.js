import { useCallback, useSyncExternalStore } from 'react'
import { getLang, subscribeLang, t as translate, isRtl } from './index.js'

/**
 * useT() — use inside any component that shows text.
 * Re-renders the component when the language changes (Settings or the
 * language button), so the whole page switches without a reload.
 *
 *   const { t, lang, rtl } = useT()
 *   t('cart_total')                 -> "Total" / "کل" / "الإجمالي"
 *   t('cp_thanks', { n: 5 })        -> "Thanks — 5/5" (placeholders are replaced)
 */
export function useT() {
  const lang = useSyncExternalStore(subscribeLang, getLang, () => 'en')
  const t = useCallback((key, vars) => translate(key, lang, vars), [lang])
  return { t, lang, rtl: isRtl(lang) }
}
