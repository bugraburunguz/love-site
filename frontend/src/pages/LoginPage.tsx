import { useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useAuth } from '../auth/AuthContext'
import Clay from '../components/Clay'
import '../components/dialog.css'
import '../components/leather.css'
import { createRng } from '../layout/prng'
import './login.css'

export default function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Fixed seed: the same twinkles every visit.
  const sparkles = useMemo(() => {
    const rng = createRng('login-stardust')
    return Array.from({ length: 34 }, (_, i) => ({
      id: i,
      left: rng.range(2, 98),
      top: rng.range(2, 98),
      size: rng.range(4, 11),
      delay: rng.range(0, 5),
      duration: rng.range(2.6, 5.2),
    }))
  }, [])

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
    <main className="login">
      <div className="login__dust" aria-hidden="true">
        {sparkles.map((s) => (
          <span
            key={s.id}
            style={{
              left: `${s.left}%`,
              top: `${s.top}%`,
              width: s.size,
              height: s.size,
              animationDelay: `${s.delay}s`,
              animationDuration: `${s.duration}s`,
            }}
          />
        ))}
      </div>

      <div className="login-book" style={{ '--cover-color': 'var(--leather-bordeaux)' } as CSSProperties}>
        <div className="login-book__cover leather">
          <div className="gold-foil login-book__star" aria-hidden="true">✦</div>
          <h1 className="emboss login-book__title">Anılarımız</h1>
          <div className="gold-foil login-book__rule" aria-hidden="true">❖</div>

          <form className="login-label" onSubmit={onSubmit}>
            <label>
              <span>E-posta</span>
              <input
                className="paper-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label>
              <span>Şifre</span>
              <input
                className="paper-input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <p role="alert" className="login-label__error">{error}</p>}
            <Clay type="submit" disabled={submitting} className="login-label__submit">
              Kapağı aç
            </Clay>
          </form>
        </div>
      </div>
    </main>
  )
}
