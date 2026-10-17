import { useEffect, useState, type FormEvent } from 'react'
import { DEFAULT_THEME_ID } from '../themes/types'
import Clay from './Clay'
import ThemePicker from './ThemePicker'
import './dialog.css'

interface Props {
  onSubmit: (title: string, themeId: string) => void | Promise<void>
  onClose: () => void
}

/** Title and theme of a new album. */
export default function NewAlbumDialog({ onSubmit, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [themeId, setThemeId] = useState(DEFAULT_THEME_ID)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(title.trim(), themeId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Albüm oluşturulamadı')
      setBusy(false)
    }
  }

  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog dialog--wide" role="dialog" aria-modal="true" aria-label="Yeni albüm">
        <h2 className="dialog__title">Yeni albüm</h2>
        <form onSubmit={submit} className="dialog__form">
          <label className="dialog__label">
            Albümün adı
            <input className="paper-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
          </label>
          <div>
            <span className="dialog__label">Tema</span>
            <ThemePicker value={themeId} onChange={setThemeId} />
          </div>
          {error && <p role="alert" className="dialog__error">{error}</p>}
          <div className="dialog__actions">
            <Clay tone="cream" onClick={onClose}>Vazgeç</Clay>
            <Clay type="submit" disabled={busy || !title.trim()}>Oluştur</Clay>
          </div>
        </form>
      </div>
    </div>
  )
}
