import { useEffect, useRef, useState } from 'react'
import { completeMusicUpload, deleteAlbumMusic, requestMusicUpload, type Album } from '../api/albums'
import { putFile } from '../upload/putFile'
import Clay from './Clay'
import ThemePicker from './ThemePicker'
import './dialog.css'

const MUSIC_TYPES: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg' }

function musicType(file: File): string {
  if (file.type) return file.type
  return MUSIC_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? ''
}

interface Props {
  album: Album
  /** the theme shown behind the dialog (live preview) */
  previewThemeId: string
  onPreview: (themeId: string) => void
  onSaveTheme: (themeId: string) => Promise<void>
  /** the album changed on the server (music added / replaced / removed) */
  onAlbum: (album: Album) => void
  onClose: () => void
}

/** Theme (with live preview) and song of an album. */
export default function AlbumSettings({ album, previewThemeId, onPreview, onSaveTheme, onAlbum, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const changed = previewThemeId !== album.themeId

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed])

  function close() {
    if (changed) onPreview(album.themeId) // leave without saving: the album goes back to its own theme
    onClose()
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await onSaveTheme(previewThemeId)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tema kaydedilemedi')
      setBusy(false)
    }
  }

  async function pickSong(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setError(null)
    setBusy(true)
    setProgress(0)
    try {
      const type = musicType(f)
      const ticket = await requestMusicUpload(album.id, { filename: f.name, contentType: type, sizeBytes: f.size })
      await putFile(ticket.uploadUrl, f, ticket.contentType, setProgress)
      onAlbum(await completeMusicUpload(album.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Müzik yüklenemedi')
    } finally {
      setBusy(false)
      setProgress(null)
      if (file.current) file.current.value = ''
    }
  }

  async function removeSong() {
    setBusy(true)
    setError(null)
    try {
      onAlbum(await deleteAlbumMusic(album.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Müzik kaldırılamadı')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop dialog-backdrop--light" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog dialog--wide" role="dialog" aria-modal="true" aria-label="Albüm ayarları">
        <h2 className="dialog__title">Albüm ayarları</h2>

        <span className="dialog__label">Tema (arkadaki albümde canlı görünür)</span>
        <ThemePicker value={previewThemeId} onChange={onPreview} />

        <div className="album-settings__music">
          <span className="dialog__label">Müzik</span>
          <p className="dialog__message">
            {album.musicUrl ? `Çalan parça: ${album.musicName ?? 'müzik'}` : 'Bu albümde müzik yok.'} (mp3, m4a, aac veya ogg, en fazla 20 MB)
          </p>
          {progress !== null && <progress value={progress} max={1} aria-label="Müzik yükleniyor" />}
          <div className="album-settings__actions">
            <input
              ref={file}
              type="file"
              hidden
              accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,.mp3,.m4a,.aac,.ogg"
              onChange={(e) => void pickSong(e.target.files)}
            />
            <Clay size="sm" tone="cream" disabled={busy} onClick={() => file.current?.click()}>
              {album.musicUrl ? 'Müziği değiştir' : 'Müzik yükle'}
            </Clay>
            {album.musicUrl && (
              <Clay size="sm" tone="cream" disabled={busy} onClick={() => void removeSong()}>
                Müziği kaldır
              </Clay>
            )}
          </div>
        </div>

        {error && <p role="alert" className="dialog__error">{error}</p>}
        <div className="dialog__actions">
          <Clay tone="cream" onClick={close}>{changed ? 'Vazgeç' : 'Kapat'}</Clay>
          {changed && <Clay disabled={busy} onClick={() => void save()}>Temayı kaydet</Clay>}
        </div>
      </div>
    </div>
  )
}
