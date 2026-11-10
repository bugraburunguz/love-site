import { useRef, useState } from 'react'
import { completeMusicUpload, deleteAlbumMusic, requestMusicUpload, type Album } from '../api/albums'
import { putFile } from '../upload/putFile'
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
  /** the theme shown behind the dialog (live preview) */
  previewThemeId: string
  onPreview: (themeId: string) => void
  onSaveTheme: (themeId: string) => Promise<void>
  /** the album changed on the server (music added / replaced / removed) */
  onAlbum: (album: Album) => void
  onClose: () => void
}

/** Theme (with live preview on the album behind) and song of an album. */
export default function AlbumSettings({ album, previewThemeId, onPreview, onSaveTheme, onAlbum, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const changed = previewThemeId !== album.themeId

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
    <Modal
      title="Albüm ayarları"
      eyebrow={album.title}
      onClose={close}
      dismissable={!busy}
      light
      actions={changed ? (
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>Vazgeç</Button>
          <Button loading={busy} onClick={() => void save()}>Temayı kaydet</Button>
        </>
      ) : undefined}
    >
      <div className="ui-form album-settings">
        <div className="ui-field">
          <span className="ui-field__label">Tema</span>
          <span className="ui-field__hint">Seçtiğin tema arkadaki albümde hemen görünür; kaydedene kadar değişmez.</span>
          <ThemePicker value={previewThemeId} onChange={onPreview} />
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
