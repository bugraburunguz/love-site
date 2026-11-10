import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { previewInvite, type InvitePreview } from '../api/albums'
import { api, ApiError } from '../api/client'
import { validateNewAccount } from '../auth/accountForm'
import { useAuth, type User } from '../auth/AuthContext'
import AuthLayout from '../components/AuthLayout'
import PasswordField from '../components/PasswordField'
import { Button, Checkbox, TextField, uiButtonClass } from '../components/ui'

function initials(name: string): string {
  const letters = name.split(/\s+/).filter(Boolean).map((w) => w[0]?.toLocaleUpperCase('tr-TR'))
  return letters.slice(0, 2).join('') || '♥'
}

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
  const [repeat, setRepeat] = useState('')
  const [privacy, setPrivacy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (loading || user) return
    let alive = true
    previewInvite(token)
      .then((p) => alive && setPreview(p))
      .catch(() => alive && setInvalid(true))
    return () => {
      alive = false
    }
  }, [token, loading, user])

  if (loading) return <p className="boot">Defter açılıyor…</p>

  if (user) {
    return (
      <AuthLayout>
        <div className="auth-state">
          <span className="auth__seal" aria-hidden="true">♥</span>
          <h2>Zaten bir alana üyesin</h2>
          <p>Bu davet bağlantısını kullanmak için önce çıkış yapman gerekir.</p>
          <Link to="/" className={uiButtonClass('secondary')}>Albümlerime dön</Link>
        </div>
      </AuthLayout>
    )
  }

  if (invalid) {
    return (
      <AuthLayout>
        <div className="auth-state">
          <span className="auth__seal" aria-hidden="true">✉</span>
          <h2>Davet geçersiz</h2>
          <p>
            Bu davet bağlantısı geçersiz, kullanılmış ya da süresi dolmuş (bağlantılar 7 gün geçerlidir). Seni davet eden kişiden
            yeni bir bağlantı isteyebilirsin.
          </p>
          <div className="landing__ctas">
            <Link to="/login" className={uiButtonClass('secondary')}>Giriş yap</Link>
            <Link to="/kayit" className={uiButtonClass('ghost')}>Kendi defterini aç</Link>
          </div>
        </div>
      </AuthLayout>
    )
  }

  if (!preview) return <p className="boot">Davet kontrol ediliyor…</p>

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const problem = validateNewAccount({ password, repeat, privacy })
    setError(problem)
    if (problem) return
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

  const until = new Date(preview.expiresAt).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })
  const owner = preview.role === 'OWNER'

  return (
    <AuthLayout wide>
      <div className="auth-letter">
        <span className="auth__seal" aria-hidden="true">✉</span>
        <div className="ui-eyebrow">Mühürlü davetiye</div>
        <h1>{owner ? 'Defterin seni bekliyor' : 'Seni bir anı defterine davet ettiler'}</h1>
        <p>
          {owner
            ? 'Defterini kurmak için hesabını oluştur; sonra partnerini davet edebilirsin.'
            : 'Yalnızca ikinizin satırlarıyla büyüyecek bir köşe. Katılmak için hesabını oluştur.'}
        </p>
      </div>

      <div className="auth-invite">
        <span className="auth-invite__mono" aria-hidden="true">{initials(preview.spaceName)}</span>
        <div>
          <strong>{preview.spaceName}</strong>
          <span>Bağlantı {until} tarihine kadar geçerli</span>
        </div>
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
        <Button type="submit" size="lg" block loading={busy}>
          Daveti kabul et
        </Button>
      </form>

      <p className="auth__alt">
        Zaten hesabın var mı? <Link to="/login">Giriş yap</Link>
      </p>
    </AuthLayout>
  )
}
