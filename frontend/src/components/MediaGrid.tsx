import type { MediaItem } from '../api/albums'

// Formats every browser can render; HEIC and video get a placeholder until Phase 3 produces previews.
const PREVIEWABLE = ['image/jpeg', 'image/png', 'image/webp']

interface Props {
  items: MediaItem[]
  onDelete: (item: MediaItem) => void
}

export default function MediaGrid({ items, onDelete }: Props) {
  if (items.length === 0) return <p>Henüz medya yok.</p>
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
      {items.map((item) => (
        <figure key={item.id} style={{ margin: 0, position: 'relative' }}>
          {item.url && PREVIEWABLE.includes(item.contentType) ? (
            <img
              src={item.url}
              alt={item.originalFilename}
              loading="lazy"
              style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
            />
          ) : (
            <div
              style={{
                aspectRatio: '1', background: '#eee', display: 'grid', placeItems: 'center', padding: 8,
                textAlign: 'center', overflow: 'hidden',
              }}
            >
              <div>
                <div style={{ fontSize: 32 }}>{item.type === 'VIDEO' ? '🎬' : '🖼️'}</div>
                <small style={{ wordBreak: 'break-all' }}>{item.originalFilename}</small>
                <br />
                <small>{item.contentType}</small>
              </div>
            </div>
          )}
          <button
            onClick={() => onDelete(item)}
            aria-label={`${item.originalFilename} sil`}
            style={{ position: 'absolute', top: 4, right: 4 }}
          >
            ✕
          </button>
        </figure>
      ))}
    </div>
  )
}
