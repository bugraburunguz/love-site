import { API_BASE } from '../native/platform'
import { useEffect, useState } from 'react'
import { createPartnerInvite, formatBytes, getSpace, type CreatedInvite, type SpaceInfo } from '../api/albums'
import Clay from './Clay'
import '../pages/space.css'

/** the server sends an absolute url when APP_PUBLIC_URL is set; otherwise the link is built from where the owner is browsing */
export function inviteUrl(invite: Pick<CreatedInvite, 'path' | 'url'>): string {
  // in the store app the page origin is the app itself (capacitor://localhost): links must point at the site
  return invite.url ?? `${API_BASE || window.location.origin}${invite.path}`
}

/** Copyable link plus the expiry note; shared by the partner invitation and the admin screen. */
export function InviteLink({ invite }: { invite: CreatedInvite }) {
  const [copied, setCopied] = useState(false)
  const url = inviteUrl(invite)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="invite-link">
      <input className="paper-input" readOnly value={url} aria-label="Davet bağlantısı" onFocus={(e) => e.currentTarget.select()} />
      <Clay size="sm" tone="cream" onClick={() => void copy()}>
        {copied ? 'Kopyalandı' : 'Kopyala'}
      </Clay>
      <p className="invite-link__note">
        Bağlantı {new Date(invite.expiresAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihine kadar geçerli
        ve tek kullanımlık. Yeni bir bağlantı oluşturursan öncekiler geçersiz olur.
      </p>
    </div>
  )
}

/** Storage usage of the couple's space, and (for the owner) the partner invitation. */
export default function SpacePanel() {
  const [space, setSpace] = useState<SpaceInfo | null>(null)
  const [invite, setInvite] = useState<CreatedInvite | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getSpace().then(setSpace).catch(() => undefined)
  }, [])

  if (!space) return null

  const ratio = space.limitBytes > 0 ? Math.min(1, space.usedBytes / space.limitBytes) : 1
  const full = space.usedBytes >= space.limitBytes
  const nearly = !full && ratio >= 0.9

  async function makeInvite() {
    setBusy(true)
    setError(null)
    try {
      setInvite(await createPartnerInvite())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Davet oluşturulamadı')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-panel" aria-label="Depolama">
      <div className="space-panel__row">
        <span className="space-panel__name">{space.name}</span>
        <span className="space-panel__usage">
          {formatBytes(space.usedBytes)} / {formatBytes(space.limitBytes)}
        </span>
      </div>
      <progress
        className={`space-panel__bar${full ? ' space-panel__bar--full' : nearly ? ' space-panel__bar--near' : ''}`}
        value={ratio}
        max={1}
        aria-label="Kullanılan depolama"
      />
      {full && <p role="alert" className="space-panel__warn">Depolama alanınız dolu. Yeni dosya yükleyemezsiniz; silinenler 30 gün sonra yer açar.</p>}
      {nearly && <p className="space-panel__warn">Depolama alanınız dolmak üzere.</p>}

      {space.canInvite && !invite && (
        <Clay size="sm" tone="cream" disabled={busy} onClick={() => void makeInvite()}>
          Partnerini davet et
        </Clay>
      )}
      {space.canInvite && invite && (
        <>
          <InviteLink invite={invite} />
          <Clay size="sm" tone="cream" disabled={busy} onClick={() => void makeInvite()}>
            Yeni bağlantı oluştur
          </Clay>
        </>
      )}
      {error && <p role="alert" className="space-panel__warn">{error}</p>}
    </section>
  )
}
