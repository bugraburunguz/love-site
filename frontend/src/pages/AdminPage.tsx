import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  adminBackupStatus, adminCreateSpace, adminListSpaces, adminReissueOwnerInvite, adminReprocessAll, adminRunBackup, adminUpdateSpace, formatBytes,
  type AdminSpace, type BackupRun, type BackupStatus, type CreatedInvite,
} from '../api/albums'
import { useAuth } from '../auth/AuthContext'
import Clay from '../components/Clay'
import { InviteLink } from '../components/SpacePanel'
import '../components/dialog.css'
import './space.css'

const GIB = 1024 ** 3

const STATUS_LABEL: Record<BackupRun['status'], string> = { RUNNING: 'çalışıyor', OK: 'başarılı', FAILED: 'başarısız' }

function RunLine({ title, run }: { title: string; run: BackupRun | null }) {
  if (!run) return <li><strong>{title}</strong><span>Henüz çalışmadı</span></li>
  return (
    <li>
      <div className="admin-list__head">
        <strong>{title}</strong>
        <span className={run.status === 'FAILED' ? 'admin-status admin-status--bad' : 'admin-status'}>{STATUS_LABEL[run.status]}</span>
      </div>
      <span>Son çalışma: {new Date(run.startedAt).toLocaleString('tr-TR')}</span>
      {run.objectCount !== null && run.totalBytes !== null && (
        <span>
          Yedekte {run.objectCount} nesne, {formatBytes(run.totalBytes)}
          {run.copiedCount !== null && ` (bu çalışmada ${run.copiedCount} yazıldı)`}
        </span>
      )}
      {run.message && <span className="plain-page__error">{run.message}</span>}
    </li>
  )
}

/** Last nightly backup per kind, a manual run, and the "queue everything again" action used after a restore. */
function MaintenancePanel({ onError }: { onError: (m: string) => void }) {
  const [backup, setBackup] = useState<BackupStatus | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const refresh = useCallback(() => {
    adminBackupStatus().then(setBackup).catch((e: Error) => onError(e.message))
  }, [onError])
  useEffect(refresh, [refresh])

  async function runNow() {
    try {
      await adminRunBackup()
      setNote('Yedekleme başlatıldı, birkaç dakika sonra yenileyin.')
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Yedekleme başlatılamadı')
    }
  }

  async function reprocess() {
    if (!window.confirm('Tüm fotoğraf ve videolar yeniden işlenecek. Bu sırada albümlerde "işleniyor" görünürler. Devam edilsin mi?')) return
    try {
      const { queued } = await adminReprocessAll()
      setNote(`${queued} öğe işleme sırasına alındı.`)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Sıraya alınamadı')
    }
  }

  return (
    <section aria-label="Yedekleme" className="admin-section">
      <h2>Yedekleme</h2>
      {backup === null ? (
        <p>Yükleniyor…</p>
      ) : !backup.enabled ? (
        <p>Yedekleme kapalı: yedek bucket'ı için BACKUP_S3_* değişkenleri tanımlı değil.</p>
      ) : (
        <ul className="admin-list">
          <RunLine title="Medya (orijinaller ve müzikler)" run={backup.media} />
          <RunLine title="Veritabanı" run={backup.db} />
        </ul>
      )}
      <div className="admin-list__actions">
        <Clay size="sm" tone="cream" onClick={refresh}>
          Yenile
        </Clay>
        {backup?.enabled && (
          <Clay size="sm" tone="cream" onClick={() => void runNow()}>
            Şimdi yedekle
          </Clay>
        )}
        <Clay size="sm" tone="cream" onClick={() => void reprocess()}>
          Tümünü yeniden işle
        </Clay>
      </div>
      {note && <p role="status">{note}</p>}
    </section>
  )
}

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

      <MaintenancePanel onError={setError} />

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
