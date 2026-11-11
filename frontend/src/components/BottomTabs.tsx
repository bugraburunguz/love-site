import { Link, useLocation } from 'react-router-dom'
import { isNativeApp } from '../native/platform'
import { activeTab, type Tab } from './tabOf'
import './appnav.css'

/**
 * Phones (and the store apps): three tabs at the bottom, within reach of the thumb. From tablet width up the top bar
 * (AppHeader) carries the sections instead, so the bar is hidden there (CSS). It styles itself from the --ui-* tokens
 * without a .ui scope (a fixed element must not get the scope's full-height paper), so it also fits the screens that are
 * not redesigned yet. In the store app a screen below a tab (Çöp kutusu under Profil) keeps its tab lit, as on iOS.
 */
export default function BottomTabs() {
  const lit = activeTab(useLocation().pathname, isNativeApp)
  const props = (tab: Tab) => ({
    to: tab,
    className: `bottom-tabs__tab${lit === tab ? ' active' : ''}`,
    'aria-current': lit === tab ? ('page' as const) : undefined,
  })
  return (
    <nav className="bottom-tabs" aria-label="Ana bölümler">
      <Link {...props('/')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h4v14H4zM10 5h4v14h-4zM16 6l3.5-1 3 13-3.5 1z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
        <span>Raf</span>
      </Link>
      <Link {...props('/takvim')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M12 17.5s-3-1.8-3-4a1.6 1.6 0 0 1 3-1 1.6 1.6 0 0 1 3 1c0 2.2-3 4-3 4z" fill="currentColor" /></svg>
        <span>Takvim</span>
      </Link>
      <Link {...props('/profil')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M4.5 20c1.2-3.8 4-5.6 7.5-5.6s6.3 1.8 7.5 5.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <span>Profil</span>
      </Link>
    </nav>
  )
}
