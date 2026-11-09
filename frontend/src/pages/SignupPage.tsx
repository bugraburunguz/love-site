import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { formatBytes, signupStatus, type SignupStatus } from '../api/albums'
import { api, ApiError } from '../api/client'
import { useAuth, type User } from '../auth/AuthContext'
import Clay from '../components/Clay'
import '../components/dialog.css'
import './space.css'

/** Public signup: opens a small free space of one's own; the partner joins later through the usual invitation. */
export default function SignupPage() {
  const { user, loading, setUser } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<SignupStatus | null>(null)
  const [closed, setClosed] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [privacy, setPrivacy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (loading || user) return
    signupStatus()
      .then((s) => {
        setStatus(s)
        setClosed(!s.open)
      })
      .catch(() => setError('Kayıt durumu alınamadı, lütfen sayfayı yenile.'))
  }, [loading, user])

  if (loading) return <p className="boot">Defter açılıyor…</p>
  if (user) return <Navigate to="/" replace />

  if (closed) {
    return (
      <main className="plain-page">
        <h1>Şu an yeni kayıt alınmıyor</h1>
        <p>Yeni defterler için yer şimdilik doldu. Davet bağlantın varsa onunla katılabilirsin.</p>
        <Link to="/login">Giriş sayfası</Link>
      </main>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 10) {
      setError('Şifre en az 10 karakter olmalı')
      return
    }
    if (password !== repeat) {
      setError('Şifreler aynı değil')
      return
    }
    if (!privacy) {
      setError('Gizlilik politikasını onaylaman gerekiyor')
      return
    }
    setBusy(true)
    try {
      const created = await api<User>('/api/signup', {
        method: 'POST',
        body: { displayName, email, password, acceptPrivacy: privacy },
      })
      setUser(created)
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SIGNUP_CLOSED') setClosed(true)
      else setError(err instanceof Error ? err.message : 'Hesap oluşturulamadı')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="plain-page">
      <h1>Defterini aç</h1>
      <p>
        Kendi anı defterini oluştur, sonra partnerini davet et.
        {status && ` Ücretsiz defterde ${formatBytes(status.freeLimitBytes)} yer var; ikiniz birlikte kullanırsınız.`}
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
        <div className="plain-form__row">
          <label>
            Şifre (en az 10 karakter)
            <input className="paper-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required autoComplete="new-password" />
          </label>
          <label>
            Şifre tekrar
            <input className="paper-input" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} minLength={10} required autoComplete="new-password" />
          </label>
        </div>
        <label className="plain-form__check">
          <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
          <span>
            <Link to="/gizlilik" target="_blank" rel="noopener">Gizlilik politikasını</Link> okudum ve kabul ediyorum.
          </span>
        </label>
        <p className="plain-form__hint">Şifre sıfırlama yok; şifreni güvenli bir yerde sakla.</p>
        {error && <p role="alert" className="plain-page__error">{error}</p>}
        <Clay type="submit" disabled={busy || !status}>
          Hesabı oluştur
        </Clay>
      </form>
      <p>
        Zaten hesabın var mı? <Link to="/login">Giriş yap</Link>
      </p>
    </main>
  )
}
