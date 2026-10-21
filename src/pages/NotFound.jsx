import { Button } from '../components/ui/index.js'
import { useT } from '../i18n/useT.js'

export default function NotFound({ message, onRetry }) {
  const { t } = useT()
  return (
    <div className="screen error-screen" role="alert">
      <h1>{t('nf_title')}</h1>
      <p>{message || t('nf_default')}</p>
      {onRetry && (
        <div style={{ marginTop: 16 }}>
          <Button variant="primary" onClick={onRetry}>{t('cp_retry')}</Button>
        </div>
      )}
    </div>
  )
}
