import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { initials } from '../shelf/shelfText'
import { Brand } from './AuthLayout'
import './appnav.css'

interface Props {
  /** the screen's name; the store app shows it small in the bar once the page's own heading scrolls away */
  title?: string
  /** store app: the bar's back link (top left), for screens below a tab */
  back?: { to: string; label: string }
  /** store app: the screen's main action as an icon button (top right) */
  action?: ReactNode
}

/** true once the page has scrolled past `offset` px (the large heading is out of view) */
function useScrolled(offset: number): boolean {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > offset)
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [offset])
  return scrolled
}

/**
 * The top bar of the signed-in screens. Website: brand, the main sections (from tablet width up; phones use the bottom
 * tabs) and the round avatar that opens the profile. Store app (.native-app, see appnav.css): an iOS navigation bar,
 * with the back link, the screen's title once scrolled and its action; brand and avatar are left out (Profil is a tab).
 */
export default function AppHeader({ title, back, action }: Props) {
  const { user } = useAuth()
  const scrolled = useScrolled(40)
  return (
    <header className={`app-header${scrolled ? ' app-header--scrolled' : ''}`}>
      <div className="ui-container app-header__inner">
        <div className="app-header__lead">
          {back && (
            <Link to={back.to} className="app-header__back">
              <svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {back.label}
            </Link>
          )}
          <Brand to="/" />
        </div>
        {title && <p className="app-header__title" aria-hidden="true">{title}</p>}
        <nav className="app-header__nav" aria-label="Ana bölümler">
          <NavLink to="/" end className="app-header__link">Raf</NavLink>
          <NavLink to="/takvim" className="app-header__link">Takvim</NavLink>
        </nav>
        <div className="app-header__trail">
          {action && <div className="app-header__action">{action}</div>}
          <Link to="/profil" className="app-header__avatar" aria-label="Profil ve defter ayarları">
            <span aria-hidden="true">{initials(user?.displayName ?? '')}</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
