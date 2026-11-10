import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import {
  adminBackupStatus, adminCreateSpace, adminListSpaces, adminReissueOwnerInvite, adminReprocessAll, adminRunBackup, adminSignupSummary,
  adminUpdateSpace, formatBytes,
  type AdminSpace, type BackupRun, type BackupStatus, type CreatedInvite, type SignupSummary,
} from '../api/albums'
import { useAuth } from '../auth/AuthContext'
import AppHeader from '../components/AppHeader'
import BottomTabs from '../components/BottomTabs'
import { InviteLink } from '../components/SpacePanel'
import { Button, Card, Chip, ConfirmModal, Meter, PromptModal, TextField, useToast } from '../components/ui'
import { initials } from '../shelf/shelfText'
import './admin.css'
import './home.css'

const GIB = 1024 ** 3

const STATUS_LABEL: Record<BackupRun['status'], string> = { RUNNING: 'çalışıyor', OK: 'başarılı', FAILED: 'başarısız' }

type Filter = 'all' | 'full' | 'waiting' | 'free'
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tümü' },
  { id: 'full', label: '2 üye' },
  { id: 'waiting', label: 'Partner bekleniyor' },
  { id: 'free', label: 'Ücretsiz kayıt' },
]

type Edit = { kind: 'rename' | 'limit'; space: AdminSpace } | null

function RunLine({ title, run }: { title: string; run: BackupRun | null }) {
  return (
    <div className="admin-run">
      <div className="admin-run__head">
        <strong>{title}</strong>
        {run ? (
          <span className={`admin-status${run.status === 'FAILED' ? ' admin-status--bad' : run.status === 'OK' ? ' admin-status--ok' : ''}`}>
            {STATUS_LABEL[run.status]}
          </span>
        ) : (
          <span className="admin-status">henüz çalışmadı</span>
        )}
      </div>
      {run && (
        <span className="ui-muted">
          Son çalışma: {new Date(run.startedAt).toLocaleString('tr-TR')}
          {run.objectCount !== null && run.totalBytes !== null && ` · ${run.objectCount} nesne, ${formatBytes(run.totalBytes)}`}
          {run.copiedCount !== null && ` (bu çalışmada ${run.copiedCount} yazıldı)`}
        </span>
      )}
      {run?.message && <span className="ui-field__error">{run.message}</span>}
    </div>
  )
}

/** Last nightly backup per kind, a manual run, and the "queue everything again" action used after a restore. */
function MaintenancePanel() {
  const toast = useToast()
  const [backup, setBackup] = useState<BackupStatus | null>(null)
  const [confirmReprocess, setConfirmReprocess] = useState(false)
  const refresh = useCallback(() => {
    adminBackupStatus().then(setBackup).catch((e: Error) => toast(e.message, 'error'))
  }, [toast])
  useEffect(refresh, [refresh])

  async function runNow() {
    try {
      await adminRunBackup()
      toast('Yedekleme başlatıldı, birkaç dakika sonra yenileyin.', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Yedekleme başlatılamadı', 'error')
    }
  }

  return (
    <Card className="admin-card">
      <h2>Yedekleme ve bakım</h2>
      {backup === null ? (
        <p className="ui-muted">Yükleniyor…</p>
      ) : !backup.enabled ? (
        <p className="ui-muted">Yedekleme kapalı: yedek bucket'ı için BACKUP_S3_* değişkenleri tanımlı değil.</p>
      ) : (
        <div className="admin-runs">
          <RunLine title="Medya (orijinaller ve müzikler)" run={backup.media} />
          <RunLine title="Veritabanı" run={backup.db} />
        </div>
      )}
      <div className="admin-actions">
        <Button size="sm" variant="secondary" onClick={refresh}>Yenile</Button>
        {backup?.enabled && <Button size="sm" variant="secondary" onClick={() => void runNow()}>Şimdi yedekle</Button>}
        <Button size="sm" variant="ghost" onClick={() => setConfirmReprocess(true)}>Tümünü yeniden işle</Button>
      </div>
      {confirmReprocess && (
        <ConfirmModal
          title="Tümü yeniden işlensin mi?"
          message='Tüm fotoğraf ve videolar yeniden işlenecek. Bu sırada albümlerde "işleniyor" görünürler.'
          confirmLabel="Yeniden işle"
          onClose={() => setConfirmReprocess(false)}
          onConfirm={async () => {
            const { queued } = await adminReprocessAll()
            toast(`${queued} öğe işleme sırasına alındı.`, 'success')
          }}
        />
      )}
    </Card>
  )
}

/** Platform administration: spaces, limits and invitation links. Shows numbers only, never anyone's photos. */
export default function AdminPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [spaces, setSpaces] = useState<AdminSpace[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  // invited spaces start at 1 GB: the whole server disk is ~38 GB, raise single spaces by hand when needed
  const [limit, setLimit] = useState('1')
  const [creating, setCreating] = useState(false)
  const [invites, setInvites] = useState<Record<string, CreatedInvite>>({})
  const [pool, setPool] = useState<SignupSummary | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [edit, setEdit] = useState<Edit>(null)

  const refresh = useCallback(() => {
    adminListSpaces().then(setSpaces).catch((e: Error) => setError(e.message))
    adminSignupSummary().then(setPool).catch((e: Error) => setError(e.message))
  }, [])
  useEffect(refresh, [refresh])

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR')
    return (spaces ?? []).filter((s) => {
      if (filter === 'full' && s.members.length < 2) return false
      if (filter === 'waiting' && s.members.length >= 2) return false
      if (filter === 'free' && s.kind !== 'FREE') return false
      if (!q) return true
      return [s.name, ...s.members.map((m) => m.displayName)].some((t) => t.toLocaleLowerCase('tr-TR').includes(q))
    })
  }, [spaces, query, filter])

  if (!user?.admin) return <Navigate to="/" replace />

  const used = (spaces ?? []).reduce((sum, s) => sum + s.usedBytes, 0)
  const promised = (spaces ?? []).reduce((sum, s) => sum + s.limitBytes, 0)
  const waiting = (spaces ?? []).filter((s) => s.members.length < 2).length

  async function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setCreating(true)
    try {
      const { space, invitation } = await adminCreateSpace(name.trim(), Number(limit.replace(',', '.')))
      setInvites((m) => ({ ...m, [space.id]: invitation }))
      setName('')
      toast(`"${space.name}" oluşturuldu; davet bağlantısı aşağıda.`, 'success')
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Alan oluşturulamadı')
    } finally {
      setCreating(false)
    }
  }

  async function reissue(space: AdminSpace) {
    try {
      const invitation = await adminReissueOwnerInvite(space.id)
      setInvites((m) => ({ ...m, [space.id]: invitation }))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Bağlantı oluşturulamadı', 'error')
    }
  }

  return (
    <div className="ui home">
      <AppHeader />
      <main className="ui-container home__main">
        <header className="admin-head">
          <div>
            <div className="ui-eyebrow">Yönetim</div>
            <h1 className="home__shelf-title">Alanlar ve bakım</h1>
            <p className="ui-muted">Yalnızca adlar, sayılar ve kotalar görünür; hiçbir alanın fotoğrafı buradan açılmaz.</p>
          </div>
        </header>

        <div className="admin-stats">
          <Card className="admin-stat">
            <span className="admin-stat__label">Alanlar</span>
            <strong className="admin-stat__value">{spaces?.length ?? '…'}</strong>
            <span className="ui-muted">{waiting} alanda partner bekleniyor</span>
          </Card>
          <Card className="admin-stat">
            <span className="admin-stat__label">Kullanılan depolama</span>
            <strong className="admin-stat__value">{spaces ? formatBytes(used) : '…'}</strong>
            <span className="ui-muted">Verilen kotaların toplamı {spaces ? formatBytes(promised) : '…'}</span>
          </Card>
          <Card className="admin-stat">
            <span className="admin-stat__label">Ücretsiz kayıt</span>
            <strong className="admin-stat__value">{pool ? (pool.enabled ? (pool.open ? 'Açık' : 'Dolu') : 'Kapalı') : '…'}</strong>
            {pool && <Meter label={`${pool.freeSpaces} ücretsiz alan`} used={pool.freeSpaces * pool.freeLimitBytes} limit={pool.freeTotalBytes} format={formatBytes} />}
          </Card>
        </div>

        <Card className="admin-card" tape="rose">
          <h2>Yeni alan ve davet bağlantısı</h2>
          <form className="admin-create" onSubmit={create}>
            <TextField label="Alan adı" placeholder="Örn. Aslı ve Cem" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
            <TextField label="Limit (GB)" type="number" min="0.1" step="0.1" value={limit} onChange={(e) => setLimit(e.target.value)} required />
            <Button type="submit" loading={creating}>Alanı oluştur ve davet bağlantısı al</Button>
          </form>
          {error && <p role="alert" className="ui-field__error">{error}</p>}
        </Card>

        <section aria-labelledby="admin-spaces" className="admin-card-wrap">
          <div className="home__section-head">
            <h2 id="admin-spaces" className="admin-title">Alanlar</h2>
            {spaces && <Chip static>{shown.length}/{spaces.length}</Chip>}
            <span className="home__spacer" />
            <input className="ui-input admin-search" type="search" placeholder="Alan ya da üye ara…" aria-label="Alan ya da üye ara"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="admin-filters" role="group" aria-label="Süzgeç">
            {FILTERS.map((f) => <Chip key={f.id} active={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>)}
          </div>

          {spaces === null ? (
            <p className="ui-muted">Yükleniyor…</p>
          ) : shown.length === 0 ? (
            <p className="ui-muted">Eşleşen alan yok.</p>
          ) : (
            <ul className="admin-list">
              {shown.map((s) => (
                <li key={s.id} className="admin-space">
                  <div className="admin-space__main">
                    <div className="admin-space__avatars" aria-hidden="true">
                      {s.members.length === 0 ? <span className="admin-avatar admin-avatar--empty">?</span>
                        : s.members.map((m) => <span key={m.displayName} className="admin-avatar">{initials(m.displayName)}</span>)}
                      {s.members.length === 1 && <span className="admin-avatar admin-avatar--empty">?</span>}
                    </div>
                    <div className="admin-space__text">
                      <strong>{s.name} <span className="admin-kind">{s.kind === 'FREE' ? 'ücretsiz kayıt' : 'davetli'}</span></strong>
                      <span className="ui-muted">
                        {s.members.length === 0
                          ? 'Henüz üye yok'
                          : s.members.map((m) => `${m.displayName} (${m.role === 'OWNER' ? 'sahip' : 'üye'})`).join(', ')}
                        {' · '}{new Date(s.createdAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="admin-space__meter">
                      <Meter label={`${s.members.length}/2 üye`} used={s.usedBytes} limit={s.limitBytes} format={formatBytes} />
                    </div>
                  </div>
                  <div className="admin-actions">
                    <Button size="sm" variant="ghost" onClick={() => setEdit({ kind: 'rename', space: s })}>Adı değiştir</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEdit({ kind: 'limit', space: s })}>Limiti değiştir</Button>
                    {!s.members.some((m) => m.role === 'OWNER') && (
                      <Button size="sm" variant="secondary" onClick={() => void reissue(s)}>Yeni sahip bağlantısı</Button>
                    )}
                  </div>
                  {invites[s.id] && <InviteLink invite={invites[s.id]} />}
                </li>
              ))}
            </ul>
          )}
        </section>

        <MaintenancePanel />
      </main>

      {edit?.kind === 'rename' && (
        <PromptModal
          title="Alanın yeni adı"
          label="Alan adı"
          initial={edit.space.name}
          confirmLabel="Kaydet"
          onClose={() => setEdit(null)}
          onSubmit={async (value) => {
            await adminUpdateSpace(edit.space.id, { name: value })
            refresh()
          }}
        />
      )}
      {edit?.kind === 'limit' && (
        <PromptModal
          title="Depolama limiti"
          label="Yeni limit (GB)"
          initial={String(Math.round((edit.space.limitBytes / GIB) * 10) / 10)}
          confirmLabel="Kaydet"
          maxLength={10}
          onClose={() => setEdit(null)}
          onSubmit={async (value) => {
            const gb = Number(value.replace(',', '.'))
            if (!(gb > 0)) throw new Error('Limit sıfırdan büyük bir sayı olmalı')
            await adminUpdateSpace(edit.space.id, { limitGb: gb })
            refresh()
          }}
        />
      )}
      <BottomTabs />
    </div>
  )
}
