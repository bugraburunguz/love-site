import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  adminCreateSpace, adminListSpaces, adminReissueOwnerInvite, adminUpdateSpace, formatBytes, type AdminSpace, type CreatedInvite,
} from '../api/albums'
import { useAuth } from '../auth/AuthContext'
import Clay from '../components/Clay'
import { InviteLink } from '../components/SpacePanel'
import '../components/dialog.css'
import './space.css'

const GIB = 1024 ** 3

/** Platform administration: spaces, limits and invitation links. Shows numbers only, never anyone's photos. */
export default function AdminPage() {
  const { user } = useAuth()
  const [spaces, setSpaces] = useState<AdminSpace[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [limit, setLimit] = useState('50')
  const [invites, setInvites] = useState<Record<string, CreatedInvite>>({})

  const refresh = useCallback(() => {
    adminListSpaces().then(setSpaces).catch((e: Error) => setError(e.message))
  }, [])
  useEffect(refresh, [refresh])

  if (!user?.admin) return <Navigate to="/" replace />

  async function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const { space, invitation } = await adminCreateSpace(name.trim(), Number(limit))
      setInvites((m) => ({ ...m, [space.id]: invitation }))
      setName('')
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Alan oluşturulamadı')
    }
  }

  async function changeLimit(space: AdminSpace) {
    const answer = window.prompt('Yeni depolama limiti (GB)', String(Math.round((space.limitBytes / GIB) * 10) / 10))
    if (answer === null) return
    try {
      await adminUpdateSpace(space.id, { limitGb: Number(answer.replace(',', '.')) })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Limit değiştirilemedi')
    }
  }

  async function rename(space: AdminSpace) {
    const answer = window.prompt('Alanın yeni adı', space.name)
    if (!answer?.trim()) return
    try {
      await adminUpdateSpace(space.id, { name: answer })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ad değiştirilemedi')
    }
  }

  async function reissue(space: AdminSpace) {
    try {
      const invitation = await adminReissueOwnerInvite(space.id)
      setInvites((m) => ({ ...m, [space.id]: invitation }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bağlantı oluşturulamadı')
    }
  }

  return (
    <main className="plain-page plain-page--wide">
      <p>
        <Link to="/">‹ Albümler</Link>
      </p>
      <h1>Yönetim</h1>

      <form className="plain-form" onSubmit={create}>
        <h2>Yeni alan</h2>
        <div className="plain-form__row">
          <label>
            Alan adı
            <input className="paper-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
          </label>
          <label>
            Limit (GB)
            <input className="paper-input" type="number" min="0.1" step="0.1" value={limit} onChange={(e) => setLimit(e.target.value)} required />
          </label>
        </div>
        <Clay type="submit">Alanı oluştur ve davet bağlantısı al</Clay>
      </form>

      {error && <p role="alert" className="plain-page__error">{error}</p>}

      <h2>Alanlar</h2>
      {spaces === null ? (
        <p>Yükleniyor…</p>
      ) : (
        <ul className="admin-list">
          {spaces.map((s) => (
            <li key={s.id}>
              <div className="admin-list__head">
                <strong>{s.name}</strong>
                <span>
                  {formatBytes(s.usedBytes)} / {formatBytes(s.limitBytes)}
                </span>
              </div>
              <span>
                {s.members.length === 0
                  ? 'Henüz üye yok'
                  : s.members.map((m) => `${m.displayName} (${m.role === 'OWNER' ? 'sahip' : 'üye'})`).join(', ')}
              </span>
              <div className="admin-list__actions">
                <Clay size="sm" tone="cream" onClick={() => void rename(s)}>
                  Adı değiştir
                </Clay>
                <Clay size="sm" tone="cream" onClick={() => void changeLimit(s)}>
                  Limiti değiştir
                </Clay>
                {!s.members.some((m) => m.role === 'OWNER') && (
                  <Clay size="sm" tone="cream" onClick={() => void reissue(s)}>
                    Yeni sahip bağlantısı
                  </Clay>
                )}
              </div>
              {invites[s.id] && <InviteLink invite={invites[s.id]} />}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
