import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import AuthLayout from '../components/AuthLayout'
import PasswordField from '../components/PasswordField'
import { Button, TextField } from '../components/ui'

function Cover() {
  return (
    <>
      <span className="auth__seal" aria-hidden="true">♥</span>
      <div className="ui-eyebrow">İki kişilik anı defteri</div>
      <h1>
        Hatıra <em>Defterim</em>
      </h1>
      <p>Zamanın soldurmadığı fotoğraflar, el yazısı notlar ve ikinizin ortak hafıza sandığı.</p>
    </>
  )
}

export default function LoginPage() {
  const { user, loading, login, notice } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Giriş yapılamadı')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout cover={<Cover />}>
      <div className="auth__head">
        <div className="ui-eyebrow">Giriş</div>
        <h2>Defteri arala</h2>
      </div>

      {notice && !error && (
        <p role="status" className="auth__banner auth__banner--info">
          <span>{notice}</span>
        </p>
      )}
      {error && (
        <p role="alert" className="auth__banner">
          <span>
            <strong>Giriş yapılamadı</strong>
            {error}
          </span>
        </p>
      )}

      <form className="auth__form" onSubmit={onSubmit}>
        <TextField label="E-posta" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <PasswordField label="Şifre" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" size="lg" block loading={submitting}>
          Defteri aç
        </Button>
      </form>

      <p className="auth__alt">
        Hesabın yok mu? <Link to="/kayit">Kendi defterini aç</Link>
      </p>

      <div className="auth__notes">
        <div className="auth__note">
          <h3>Davet bağlantın mı var?</h3>
          <p>Partnerinin gönderdiği bağlantıyı açman yeterli; hesabını orada oluşturursun.</p>
        </div>
        <div className="auth__note">
          <h3>Şifreni mi unuttun?</h3>
          <p>
            Şifre sıfırlama yok. Hesabına erişemiyorsan <Link to="/gizlilik">gizlilik sayfasındaki</Link> adresten bize yaz.
          </p>
        </div>
      </div>
    </AuthLayout>
  )
}
