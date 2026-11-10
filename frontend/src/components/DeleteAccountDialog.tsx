import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { getSpace } from '../api/albums'
import { useAuth } from '../auth/AuthContext'
import { deleteAccount, deletionConsequences } from '../legal/legal'
import { Button, Checkbox, Modal, TextField } from './ui'

/** "Hesabımı sil": says exactly what goes, asks for the password, then signs out for good. */
export default function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { user, endSession } = useAuth()
  const [members, setMembers] = useState<number | null>(user?.spaceId ? null : 1)
  const [password, setPassword] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user?.spaceId) return
    getSpace()
      .then((s) => setMembers(s.members.length))
      .catch(() => setError('Alan bilgisi alınamadı. Lütfen tekrar deneyin.'))
  }, [user?.spaceId])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!password || !understood) return
    setBusy(true)
    setError(null)
    try {
      await deleteAccount(password)
      // the app shell then sends the browser to the login page, which shows the note
      endSession('Hesabın silindi. Hoşça kal.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hesap silinemedi')
      setBusy(false)
    }
  }

  return (
    <Modal title="Hesabımı sil" eyebrow="Geri alınamaz" onClose={onClose} dismissable={!busy}>
      {members === null && !error ? (
        <p className="ui-muted">Alan bilgisi alınıyor…</p>
      ) : (
        <form onSubmit={submit} className="ui-form" data-testid="delete-account">
          <ul className="delete-account__list" role="note">
            {deletionConsequences(members ?? 1, user?.role === 'OWNER').map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <TextField
            label="Onaylamak için şifren"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <Checkbox checked={understood} onChange={(e) => setUnderstood(e.target.checked)}>
            Ne olacağını okudum, hesabım silinsin.
          </Checkbox>
          {error && <p role="alert" className="ui-field__error">{error}</p>}
          <div className="ui-modal__actions">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Vazgeç</Button>
            <Button type="submit" variant="danger" loading={busy} disabled={!password || !understood || members === null}>
              Hesabımı kalıcı olarak sil
            </Button>
          </div>
          <p className="ui-muted delete-account__fine">
            Ayrıntılar: <Link to="/gizlilik" onClick={onClose}>Gizlilik politikası</Link>
          </p>
        </form>
      )}
    </Modal>
  )
}
