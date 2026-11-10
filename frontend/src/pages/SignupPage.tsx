import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { formatBytes, signupStatus, type SignupStatus } from '../api/albums'
import { api, ApiError } from '../api/client'
import { validateNewAccount } from '../auth/accountForm'
import { useAuth, type User } from '../auth/AuthContext'
import AuthLayout from '../components/AuthLayout'
import PasswordField from '../components/PasswordField'
import { Button, Checkbox, TextField, uiButtonClass } from '../components/ui'

/** Public signup: opens a small free notebook of one's own; the partner joins later through the usual invitation. */
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
    let alive = true
    signupStatus()
      .then((s) => {
        if (!alive) return
        setStatus(s)
        setClosed(!s.open)
      })
      .catch(() => alive && setError('Kayıt durumu alınamadı, lütfen sayfayı yenile.'))
    return () => {
      alive = false
    }
  }, [loading, user])

  if (loading) return <p className="boot">Defter açılıyor…</p>
  if (user) return <Navigate to="/" replace />

  if (closed) {
    return (
      <AuthLayout>
        <div className="auth-state">
          <span className="auth__seal" aria-hidden="true">✉</span>
          <h1>Şu an yeni kayıt alınmıyor</h1>
          <p>Yeni defterler için yer şimdilik doldu. Davet bağlantın varsa onunla katılabilirsin.</p>
          <Link to="/login" className={uiButtonClass('secondary')}>Giriş sayfası</Link>
        </div>
      </AuthLayout>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const problem = validateNewAccount({ password, repeat, privacy })
    setError(problem)
    if (problem) return
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
    <AuthLayout wide>
      <div className="auth-letter">
        <span className="auth__seal" aria-hidden="true">❦</span>
        <div className="ui-eyebrow">Yeni defter</div>
        <h1>Defterini aç</h1>
        <p>
          Kendi anı defterini oluştur, sonra partnerini davet et.
          {status && ` Ücretsiz defterde ${formatBytes(status.freeLimitBytes)} yer var; ikiniz birlikte kullanırsınız.`}
        </p>
      </div>

      {error && (
        <p role="alert" className="auth__banner">
          <span>{error}</span>
        </p>
      )}

      <form className="auth__form" onSubmit={onSubmit}>
        <div className="auth__row">
          <TextField label="Adın" hint="Partnerinin göreceği isim" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} required autoComplete="name" />
          <TextField label="E-posta" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div className="auth__row">
          <PasswordField label="Şifre" hint="En az 10 karakter" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required autoComplete="new-password" />
          <PasswordField label="Şifre tekrar" value={repeat} onChange={(e) => setRepeat(e.target.value)} minLength={10} required autoComplete="new-password" />
        </div>
        <Checkbox checked={privacy} onChange={(e) => setPrivacy(e.target.checked)}>
          <Link to="/gizlilik" target="_blank" rel="noopener">Gizlilik politikasını</Link> okudum ve kabul ediyorum.
        </Checkbox>
        <Button type="submit" size="lg" block loading={busy} disabled={!status}>
          Hesabı oluştur
        </Button>
      </form>

      <div className="auth__notes">
        <div className="auth__note">
          <h3>Şifreni sakla</h3>
          <p>Şifre sıfırlama yok; şifreni güvenli bir yerde tut.</p>
        </div>
        <div className="auth__note">
          <h3>Boş defter silinir</h3>
          <p>30 gün içinde hiçbir şey eklenmeyen ücretsiz defterler kendiliğinden silinir.</p>
        </div>
      </div>

      <p className="auth__alt">
        Zaten hesabın var mı? <Link to="/login">Giriş yap</Link>
      </p>
    </AuthLayout>
  )
}
