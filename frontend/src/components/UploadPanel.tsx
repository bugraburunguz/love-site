import type { UploadEntry, UploadStatus } from '../upload/useUploadQueue'
import { Button } from './ui'
import './upload.css'

const LABELS: Record<UploadStatus, string> = {
  queued: 'Sırada',
  hashing: 'Hazırlanıyor',
  uploading: 'Yükleniyor',
  verifying: 'Doğrulanıyor',
  done: 'Tamamlandı',
  duplicate: 'Zaten var',
  error: 'Hata',
}

interface Props {
  entries: UploadEntry[]
  onRetry: (id: string) => void
  onClear: () => void
}

export default function UploadPanel({ entries, onRetry, onClear }: Props) {
  if (entries.length === 0) return null
  const finished = entries.some((e) => e.status === 'done' || e.status === 'duplicate' || e.status === 'error')
  return (
    <section className="upload-panel" aria-label="Yüklemeler">
      <header className="upload-panel__head">
        <h2>Yüklemeler ({entries.length})</h2>
        {finished && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Bitenleri temizle
          </Button>
        )}
      </header>
      <ul className="upload-panel__list">
        {entries.map((e) => (
          <li key={e.id} className={`upload-item upload-item--${e.status}`}>
            <div className="upload-item__row">
              <span className="upload-item__name">{e.file.name}{e.featured ? ' · tek sayfa' : ''}</span>
              <span className="upload-item__status">{LABELS[e.status]}</span>
            </div>
            {(e.status === 'hashing' || e.status === 'uploading') && (
              <progress className="upload-item__progress" value={e.progress} max={1} aria-label={e.file.name} />
            )}
            {e.status === 'error' && (
              <div className="upload-item__error" role="alert">
                <span>{e.error}</span>
                {!e.quota && (
                  <Button size="sm" variant="secondary" onClick={() => onRetry(e.id)}>
                    Tekrar dene
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
