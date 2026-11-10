import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { initials } from '../shelf/shelfText'
import { Brand } from './AuthLayout'
import './appnav.css'

/**
 * The top bar of the signed-in screens: brand, the main sections (from tablet width up; phones use the bottom tabs)
 * and the round avatar that opens the profile.
 */
export default function AppHeader() {
  const { user } = useAuth()
  return (
    <header className="app-header">
      <div className="ui-container app-header__inner">
        <Brand to="/" />
        <nav className="app-header__nav" aria-label="Ana bölümler">
          <NavLink to="/" end className="app-header__link">Raf</NavLink>
          <NavLink to="/takvim" className="app-header__link">Takvim</NavLink>
        </nav>
        <Link to="/profil" className="app-header__avatar" aria-label="Profil ve defter ayarları">
          <span aria-hidden="true">{initials(user?.displayName ?? '')}</span>
        </Link>
      </div>
    </header>
  )
}
