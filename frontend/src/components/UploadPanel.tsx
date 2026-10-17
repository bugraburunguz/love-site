import type { UploadEntry, UploadStatus } from '../upload/useUploadQueue'

const LABELS: Record<UploadStatus, string> = {
  queued: 'Sırada',
  hashing: 'Hash\'leniyor',
  uploading: 'Yükleniyor',
  verifying: 'Doğrulanıyor',
  done: 'Tamamlandı',
  duplicate: 'Duplicate',
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
    <section
      style={{
        position: 'fixed', left: 16, right: 16, bottom: 90, maxWidth: 420, maxHeight: '45vh', overflow: 'auto',
        background: '#fff', border: '1px solid #ccc', borderRadius: 8, padding: 12,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Yüklemeler ({entries.length})</strong>
        {finished && <button onClick={onClear}>Bitenleri temizle</button>}
      </header>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
        {entries.map((e) => (
          <li key={e.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.file.name}</span>
              <span>{LABELS[e.status]}</span>
            </div>
            {(e.status === 'hashing' || e.status === 'uploading') && (
              <progress value={e.progress} max={1} style={{ width: '100%' }} />
            )}
            {e.status === 'error' && (
              <div role="alert">
                {e.error} <button onClick={() => onRetry(e.id)}>Tekrar dene</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
