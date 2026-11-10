import { useState, type FormEvent } from 'react'
import { DEFAULT_THEME_ID } from '../themes/types'
import ThemePicker from './ThemePicker'
import { Button, Modal, TextField } from './ui'

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
    <Modal eyebrow="Yeni cilt" title="Yeni albüm" onClose={onClose}>
      <form onSubmit={submit} className="ui-form">
        <TextField label="Albümün adı" placeholder="Örn. Kapadokya kaçamağımız" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
        <div className="ui-field">
          <span className="ui-field__label">Tema</span>
          <ThemePicker value={themeId} onChange={setThemeId} />
        </div>
        {error && <p role="alert" className="ui-field__error">{error}</p>}
        <div className="ui-modal__actions">
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" loading={busy} disabled={!title.trim()}>Oluştur</Button>
        </div>
      </form>
    </Modal>
  )
}
