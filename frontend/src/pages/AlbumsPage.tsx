import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { createAlbum, deleteAlbum, listAlbums, renameAlbum, type Album } from '../api/albums'
import { useAuth } from '../auth/AuthContext'

export default function AlbumsPage() {
  const { user, logout } = useAuth()
  const [albums, setAlbums] = useState<Album[] | null>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    listAlbums()
      .then(setAlbums)
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(refresh, [refresh])

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hata')
    }
  }

  function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    void run(async () => {
      await createAlbum(title.trim())
      setTitle('')
    })
  }

  function onRename(album: Album) {
    const next = window.prompt('Yeni ad', album.title)?.trim()
    if (next && next !== album.title) void run(() => renameAlbum(album.id, next))
  }

  function onDelete(album: Album) {
    if (window.confirm(`"${album.title}" albümü silinsin mi?`)) void run(() => deleteAlbum(album.id))
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: 16, display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Albümler</h1>
        <span>
          {user?.displayName} <button onClick={() => void logout()}>Çıkış</button>
        </span>
      </header>

      <form onSubmit={onCreate} style={{ display: 'flex', gap: 8 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Yeni albüm adı"
          maxLength={200}
          style={{ flex: 1 }}
        />
        <button type="submit">Oluştur</button>
      </form>

      {error && <p role="alert">{error}</p>}
      {albums === null ? (
        <p>Yükleniyor…</p>
      ) : albums.length === 0 ? (
        <p>Henüz albüm yok.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {albums.map((album) => (
            <li key={album.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <Link to={`/albums/${album.id}`}>{album.title}</Link>
              <span style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => onRename(album)}>Yeniden adlandır</button>
                <button onClick={() => onDelete(album)}>Sil</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
