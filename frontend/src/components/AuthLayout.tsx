import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { isNativeApp } from '../native/platform'
import '../components/ui/ui.css'
import '../pages/auth.css'

export function Brand({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="auth-brand" aria-label="Hatıra Defterim ana sayfa">
      <span className="auth-brand__mark" aria-hidden="true">❦</span>
      <span>Hatıra Defterim</span>
    </Link>
  )
}

interface Props {
  children: ReactNode
  /** the burgundy cover panel next to the form (sign-in); without it the card is a single letter (signup, invite) */
  cover?: ReactNode
  wide?: boolean
}

/** Sign-in, signup and invitation share this page: cream paper, one card, quiet footer. */
export default function AuthLayout({ children, cover, wide = false }: Props) {
  return (
    <main className="ui auth">
      <header className="auth__top">
        <Brand to={isNativeApp ? '/login' : '/'} />
      </header>
      <div className={`auth__card${cover ? ' auth__card--split' : ''}${wide ? ' auth__card--wide' : ''}`}>
        {cover && <aside className="auth__cover">{cover}</aside>}
        <div className="auth__body">{children}</div>
      </div>
      <footer className="auth__foot">
        <Link to="/gizlilik">Gizlilik</Link>
        <span aria-hidden="true">·</span>
        <Link to="/hesap-silme">Hesap silme</Link>
        <span aria-hidden="true">·</span>
        <span>Reklamsız, takipsiz, yalnızca ikiniz</span>
      </footer>
    </main>
  )
}
