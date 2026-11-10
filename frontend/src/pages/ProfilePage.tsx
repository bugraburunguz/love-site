import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createPartnerInvite, formatBytes, getSpace, type CreatedInvite, type SpaceInfo } from '../api/albums'
import { useAuth } from '../auth/AuthContext'
import AppHeader from '../components/AppHeader'
import BottomTabs from '../components/BottomTabs'
import DeleteAccountDialog from '../components/DeleteAccountDialog'
import { inviteUrl } from '../components/SpacePanel'
import { Button, Card, Chip, Meter, TextField, useToast } from '../components/ui'
import { initials } from '../shelf/shelfText'
import { readColorMode, setColorMode, type ColorMode } from '../styles/colorMode'
import './home.css'

const MODES: { mode: ColorMode; label: string }[] = [
  { mode: 'system', label: 'Sistem' },
  { mode: 'light', label: 'Gündüz' },
  { mode: 'dark', label: 'Gece okuması' },
]

function PartnerInvite() {
  const toast = useToast()
  const [invite, setInvite] = useState<CreatedInvite | null>(null)
  const [busy, setBusy] = useState(false)

  async function make() {
    setBusy(true)
    try {
      setInvite(await createPartnerInvite())
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Davet oluşturulamadı', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      toast('Bağlantı kopyalandı', 'success')
    } catch {
      toast('Kopyalanamadı; bağlantıyı seçip kendin kopyalayabilirsin', 'error')
    }
  }

  if (!invite) {
    return (
      <div className="profile__invite">
        <p className="ui-muted">Partnerin için tek kullanımlık bir bağlantı oluştur ve ona gönder. Bağlantıyı açınca defterinize katılır.</p>
        <div className="profile__actions">
          <Button onClick={() => void make()} loading={busy}>Davet bağlantısı oluştur</Button>
        </div>
      </div>
    )
  }

  const url = inviteUrl(invite)
  return (
    <div className="profile__invite">
      <div className="profile__invite-row">
        <TextField label="Davet bağlantısı" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
        <Button variant="primary" onClick={() => void copy(url)}>Kopyala</Button>
      </div>
      <p className="ui-muted">
        {new Date(invite.expiresAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihine kadar geçerli ve tek
        kullanımlık. Yeni bir bağlantı oluşturursan öncekiler geçersiz olur.
      </p>
      <div className="profile__actions">
        <Button variant="ghost" size="sm" onClick={() => void make()} loading={busy}>Yeni bağlantı oluştur</Button>
      </div>
    </div>
  )
}

/** /profil: the couple's notebook (members, invitation, storage), the look of the app, and the account. */
export default function ProfilePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [space, setSpace] = useState<SpaceInfo | null>(null)
  const [mode, setMode] = useState<ColorMode>(readColorMode())
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getSpace().then(setSpace).catch(() => undefined)
  }, [])

  function pick(next: ColorMode) {
    setColorMode(next)
    setMode(next)
  }

  async function signOut() {
    await logout()
    navigate('/login', { replace: true })
  }

  const owner = space?.members.find((m) => m.role === 'OWNER')
  const partner = space?.members.find((m) => m.role !== 'OWNER')

  return (
    <div className="ui home">
      <AppHeader />
      <main className="ui-container home__main">
        <div className="profile">
          <Card className="profile__wide">
            <div className="profile__hero">
              <div>
                <div className="ui-eyebrow">Ortak hatıra defteri</div>
                <h1>
                  Bizim defterimiz <em>{space?.name ?? user?.spaceName ?? ''}</em>
                </h1>
                {space && (
                  <p className="ui-muted">
                    {space.members.length}/{space.maxMembers} kişi
                    {space.kind === 'FREE' && ' · Ücretsiz defter'}
                  </p>
                )}
              </div>
              {space && (
                <div className="profile__members" aria-label="Defterin üyeleri">
                  <div className="profile__member">
                    <span className="profile__avatar" aria-hidden="true">{initials(owner?.displayName ?? '')}</span>
                    <span>{owner?.displayName}</span>
                    <small>Sahip</small>
                  </div>
                  <span className="profile__heart" aria-hidden="true">♥</span>
                  <div className="profile__member">
                    {partner ? (
                      <>
                        <span className="profile__avatar" aria-hidden="true">{initials(partner.displayName)}</span>
                        <span>{partner.displayName}</span>
                        <small>Üye</small>
                      </>
                    ) : (
                      <>
                        <span className="profile__avatar profile__avatar--empty" aria-hidden="true">?</span>
                        <span>Partnerin</span>
                        <small>Davet bekleniyor</small>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>

          {space?.canInvite && (
            <Card tape="rose">
              <h2>Partnerini davet et</h2>
              <PartnerInvite />
            </Card>
          )}

          {space && (
            <Card>
              <h2>Anı sandığı</h2>
              <Meter label="Kullanılan alan" used={space.usedBytes} limit={space.limitBytes} format={formatBytes} />
              <p className="ui-muted">
                {space.kind === 'FREE'
                  ? 'Ücretsiz defterde videolar kısa olmalı. 30 gün içinde hiçbir şey eklenmezse defter kendiliğinden silinir.'
                  : 'Silinen fotoğraflar 30 gün çöpte bekler ve o süre boyunca yer kaplamaya devam eder.'}
              </p>
            </Card>
          )}

          <Card>
            <h2>Görünüm</h2>
            <p className="ui-muted">Defterin bu cihazda gündüz mü gece mi açılsın? Albüm sayfaları kendi temalarıyla görünür.</p>
            <div className="profile__actions" role="group" aria-label="Görünüm">
              {MODES.map((m) => (
                <Chip key={m.mode} active={mode === m.mode} onClick={() => pick(m.mode)}>{m.label}</Chip>
              ))}
            </div>
          </Card>

          <Card>
            <h2>Hesap</h2>
            <p className="ui-muted">{user?.displayName} · {user?.email}</p>
            <ul className="profile__list">
              {user?.admin && (
                <li><Link to="/admin" className="profile__row">Yönetim <span aria-hidden="true">›</span></Link></li>
              )}
              <li><Link to="/gizlilik" className="profile__row">Gizlilik politikası <span aria-hidden="true">›</span></Link></li>
              <li><button type="button" className="profile__row" onClick={() => void signOut()}>Çıkış yap <span aria-hidden="true">›</span></button></li>
              <li><button type="button" className="profile__row profile__row--danger" onClick={() => setDeleting(true)}>Hesabımı sil <span aria-hidden="true">›</span></button></li>
            </ul>
          </Card>
        </div>
      </main>
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
      <BottomTabs />
    </div>
  )
}
