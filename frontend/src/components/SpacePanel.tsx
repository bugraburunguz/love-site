import { API_BASE } from '../native/platform'
import { useState } from 'react'
import type { CreatedInvite } from '../api/albums'
import { Button } from './ui'

/** the server sends an absolute url when APP_PUBLIC_URL is set; otherwise the link is built from where the owner is browsing */
export function inviteUrl(invite: Pick<CreatedInvite, 'path' | 'url'>): string {
  // in the store app the page origin is the app itself (capacitor://localhost): links must point at the site
  return invite.url ?? `${API_BASE || window.location.origin}${invite.path}`
}

/** Copyable link plus the expiry note, for the admin screen (the partner invitation lives on the profile page). */
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
      <div className="invite-link__row">
        <input className="ui-input" readOnly value={url} aria-label="Davet bağlantısı" onFocus={(e) => e.currentTarget.select()} />
        <Button size="sm" onClick={() => void copy()}>{copied ? 'Kopyalandı' : 'Kopyala'}</Button>
      </div>
      <p className="invite-link__note">
        Bağlantı {new Date(invite.expiresAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihine kadar geçerli
        ve tek kullanımlık. Yeni bir bağlantı oluşturursan öncekiler geçersiz olur.
      </p>
    </div>
  )
}
