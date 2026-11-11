import { useRef, useState } from 'react'
import { completeMusicUpload, deleteAlbumMusic, requestMusicUpload, type Album } from '../api/albums'
import { putFile } from '../upload/putFile'
import { getTheme } from '../themes/registry'
import ThemePicker from './ThemePicker'
import { Button, Modal } from './ui'
import './ui/ui.css'

const MUSIC_TYPES: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg' }

function musicType(file: File): string {
  if (file.type) return file.type
  return MUSIC_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''] ?? ''
}

interface Props {
  album: Album
  /** the theme the album shows (the last pick, while it is being saved) */
  themeId: string
  /** a theme was tapped: the album page saves it at once and offers to undo it */
  onPickTheme: (themeId: string) => void
  /** the theme a just-saved change can go back to (also offered by the note under the dialog) */
  undoTo: string | null
  onUndo: () => void
  /** the album changed on the server (music added / replaced / removed) */
  onAlbum: (album: Album) => void
  onClose: () => void
}

/** Theme (saved the moment it is tapped, visible on the album behind) and song of an album. */
export default function AlbumSettings({ album, themeId, onPickTheme, undoTo, onUndo, onAlbum, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  function pickTheme(next: string) {
    if (next !== themeId) onPickTheme(next)
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
    <Modal
      title="Albüm ayarları"
      eyebrow={album.title}
      onClose={onClose}
      dismissable={!busy}
      light
    >
      <div className="ui-form album-settings">
        <div className="ui-field">
          <span className="ui-field__label">Tema</span>
          <span className="ui-field__hint">Dokunduğun tema hemen kaydedilir; istersen alttaki notla geri alabilirsin.</span>
          <ThemePicker value={themeId} onChange={pickTheme} />
          {undoTo && (
            // the note at the bottom is behind this dialog for the keyboard: the same undo, reachable here
            <p className="ui-muted album-settings__undo">
              Tema kaydedildi.{' '}
              <Button size="sm" variant="ghost" onClick={onUndo}>{`${getTheme(undoTo).name} temasına geri al`}</Button>
            </p>
          )}
        </div>

        <div className="ui-field album-settings__music">
          <span className="ui-field__label">Müzik</span>
          <p className="ui-muted ui-modal__text">
            {album.musicUrl ? `Çalan parça: ${album.musicName ?? 'müzik'}` : 'Bu albümde müzik yok.'} (mp3, m4a, aac veya ogg, en fazla 20 MB)
          </p>
          {progress !== null && (
            <div className="ui-meter">
              <div className="ui-meter__track" role="progressbar" aria-label="Müzik yükleniyor" aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={Math.round(progress * 100)}>
                <div className="ui-meter__fill" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          )}
          <div className="album-settings__actions">
            <input
              ref={file}
              type="file"
              hidden
              accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,.mp3,.m4a,.aac,.ogg"
              onChange={(e) => void pickSong(e.target.files)}
            />
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => file.current?.click()}>
              {album.musicUrl ? 'Müziği değiştir' : 'Müzik yükle'}
            </Button>
            {album.musicUrl && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removeSong()}>
                Müziği kaldır
              </Button>
            )}
          </div>
        </div>
        {error && <p role="alert" className="ui-field__error">{error}</p>}
      </div>
    </Modal>
  )
}
