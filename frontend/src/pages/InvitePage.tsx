import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { previewInvite, type InvitePreview } from '../api/albums'
import { api, ApiError } from '../api/client'
import { useAuth, type User } from '../auth/AuthContext'
import Clay from '../components/Clay'
import '../components/dialog.css'
import './space.css'

/** Public page behind an invitation link. Wrong, used and expired links all look the same on purpose. */
export default function InvitePage() {
  const { token = '' } = useParams()
  const { user, loading, setUser } = useAuth()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (loading || user) return
    previewInvite(token)
      .then(setPreview)
      .catch(() => setInvalid(true))
  }, [token, loading, user])

  if (loading) return <p className="boot">Defter açılıyor…</p>

  if (user) {
    return (
      <main className="plain-page">
        <h1>Zaten bir alana üyesin</h1>
        <p>Bu davet bağlantısını kullanmak için önce çıkış yapman gerekir.</p>
        <Link to="/">Albümlerime dön</Link>
      </main>
    )
  }

  if (invalid) {
    return (
      <main className="plain-page">
        <h1>Davet geçersiz</h1>
        <p>Bu davet bağlantısı geçersiz ya da süresi dolmuş. Seni davet eden kişiden yeni bir bağlantı isteyebilirsin.</p>
        <Link to="/login">Giriş sayfası</Link>
      </main>
    )
  }

  if (!preview) return <p className="boot">Davet kontrol ediliyor…</p>

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 10) {
      setError('Şifre en az 10 karakter olmalı')
      return
    }
    setBusy(true)
    try {
      const created = await api<User>(`/api/invites/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        body: { displayName, email, password },
      })
      setUser(created)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setInvalid(true)
      else setError(err instanceof Error ? err.message : 'Hesap oluşturulamadı')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="plain-page">
      <h1>{preview.spaceName}</h1>
      <p>
        {preview.role === 'OWNER' ? 'Alanını kurmak için' : 'Bu alana katılmak için'} bir hesap oluştur. Bağlantı{' '}
        {new Date(preview.expiresAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })} tarihine kadar geçerli.
      </p>
      <form className="plain-form" onSubmit={onSubmit}>
        <label>
          Adın
          <input className="paper-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} required autoComplete="name" />
        </label>
        <label>
          E-posta
          <input className="paper-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Şifre (en az 10 karakter)
          <input className="paper-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required autoComplete="new-password" />
        </label>
        {error && <p role="alert" className="plain-page__error">{error}</p>}
        <Clay type="submit" disabled={busy}>
          Hesabı oluştur
        </Clay>
      </form>
    </main>
  )
}
