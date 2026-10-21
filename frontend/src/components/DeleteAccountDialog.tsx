import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { getSpace } from '../api/albums'
import { useAuth } from '../auth/AuthContext'
import { deleteAccount, deletionConsequences } from '../legal/legal'
import Clay from './Clay'
import { Frame } from './Dialog'

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
      // the shelf's guard then sends the browser to the login page, which shows the note
      endSession('Hesabın silindi. Hoşça kal.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hesap silinemedi')
      setBusy(false)
    }
  }

  return (
    <Frame title="Hesabımı sil" onClose={busy ? () => undefined : onClose}>
      {members === null && !error ? (
        <p className="dialog__message">Alan bilgisi alınıyor…</p>
      ) : (
        <form onSubmit={submit} className="dialog__form" data-testid="delete-account">
          <ul className="dialog__warning" role="note">
            {deletionConsequences(members ?? 1, user?.role === 'OWNER').map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <label className="dialog__label">
            Onaylamak için şifren
            <input
              className="paper-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </label>
          <label className="dialog__check">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            Ne olacağını okudum, hesabım silinsin.
          </label>
          {error && <p role="alert" className="dialog__error">{error}</p>}
          <div className="dialog__actions">
            <Clay tone="cream" onClick={onClose} disabled={busy}>Vazgeç</Clay>
            <Clay type="submit" tone="rose" disabled={busy || !password || !understood || members === null}>
              {busy ? 'Siliniyor…' : 'Hesabımı kalıcı olarak sil'}
            </Clay>
          </div>
          <p className="dialog__fine">
            Ayrıntılar: <Link to="/gizlilik" onClick={onClose}>Gizlilik politikası</Link>
          </p>
        </form>
      )}
    </Frame>
  )
}
