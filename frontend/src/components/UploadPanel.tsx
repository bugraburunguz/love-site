import type { UploadEntry, UploadStatus } from '../upload/useUploadQueue'
import Clay from './Clay'
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
          <Clay size="sm" tone="cream" onClick={onClear}>
            Bitenleri temizle
          </Clay>
        )}
      </header>
      <ul className="upload-panel__list">
        {entries.map((e) => (
          <li key={e.id} className={`upload-item upload-item--${e.status}`}>
            <div className="upload-item__row">
              <span className="upload-item__name">{e.file.name}</span>
              <span className="upload-item__status">{LABELS[e.status]}</span>
            </div>
            {(e.status === 'hashing' || e.status === 'uploading') && (
              <progress className="upload-item__progress" value={e.progress} max={1} aria-label={e.file.name} />
            )}
            {e.status === 'error' && (
              <div className="upload-item__error" role="alert">
                <span>{e.error}</span>
                {!e.quota && (
                  <Clay size="sm" onClick={() => onRetry(e.id)}>
                    Tekrar dene
                  </Clay>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
