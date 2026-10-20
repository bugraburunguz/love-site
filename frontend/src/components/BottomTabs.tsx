import { NavLink } from 'react-router-dom'
import './bottomtabs.css'

/**
 * Narrow screens (phones, small tablets, the store apps): two tabs at the bottom, within reach of the thumb. On wide screens
 * the calendar sits next to the shelf instead, so the bar is not shown there (CSS).
 */
export default function BottomTabs() {
  return (
    <nav className="bottom-tabs" aria-label="Ana bölümler">
      <NavLink to="/" end className="bottom-tabs__tab">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h4v14H4zM10 5h4v14h-4zM16 6l3.5-1 3 13-3.5 1z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
        <span>Albümler</span>
      </NavLink>
      <NavLink to="/takvim" className="bottom-tabs__tab">
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M12 17.5s-3-1.8-3-4a1.6 1.6 0 0 1 3-1 1.6 1.6 0 0 1 3 1c0 2.2-3 4-3 4z" fill="currentColor" /></svg>
        <span>Takvim</span>
      </NavLink>
    </nav>
  )
}
