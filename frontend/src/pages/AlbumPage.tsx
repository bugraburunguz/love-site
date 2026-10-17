import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { deleteMedia, listAlbums, listMedia, type Album, type MediaItem } from '../api/albums'
import MediaGrid from '../components/MediaGrid'
import UploadPanel from '../components/UploadPanel'
import { useUploadQueue } from '../upload/useUploadQueue'

export default function AlbumPage() {
  const { id = '' } = useParams()
  const [album, setAlbum] = useState<Album | null | undefined>(undefined)
  const [media, setMedia] = useState<MediaItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => {
    listMedia(id)
      .then(setMedia)
      .catch((e: Error) => setError(e.message))
  }, [id])

  const { entries, add, retry, clearFinished } = useUploadQueue(id, refresh)

  useEffect(() => {
    listAlbums()
      .then((albums) => setAlbum(albums.find((a) => a.id === id) ?? null))
      .catch((e: Error) => setError(e.message))
    refresh()
  }, [id, refresh])

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // allow picking the same files again
    if (files.length > 0) add(files)
  }

  async function onDelete(item: MediaItem) {
    if (!window.confirm(`"${item.originalFilename}" silinsin mi?`)) return
    try {
      await deleteMedia(item.id)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
    }
  }

  if (album === null) {
    return (
      <main style={{ padding: 16 }}>
        <p>Albüm bulunamadı.</p>
        <Link to="/">Albümler</Link>
      </main>
    )
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: 16, display: 'grid', gap: 16 }}>
      <header>
        <Link to="/">← Albümler</Link>
        <h1>{album?.title ?? ''}</h1>
      </header>

      {error && <p role="alert">{error}</p>}
      {media === null ? <p>Yükleniyor…</p> : <MediaGrid items={media} onDelete={(item) => void onDelete(item)} />}

      <UploadPanel entries={entries} onRetry={retry} onClear={clearFinished} />

      <input ref={fileInput} type="file" multiple accept="image/*,video/*" onChange={onFiles} hidden />
      <button
        onClick={() => fileInput.current?.click()}
        aria-label="Dosya ekle"
        style={{
          position: 'fixed', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, fontSize: 28,
          border: 'none', background: '#222', color: '#fff', cursor: 'pointer',
        }}
      >
        +
      </button>
    </main>
  )
}
