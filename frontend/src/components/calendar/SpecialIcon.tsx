import type { SpecialIcon as Icon } from '../../api/calendar'

export const ICON_LABEL: Record<Icon, string> = {
  heart: 'Kalp', ring: 'Yüzük', cake: 'Pasta', plane: 'Uçak', star: 'Yıldız', home: 'Ev',
}
export const ICONS = Object.keys(ICON_LABEL) as Icon[]

/** Small line icons for special days (drawn here: no icon font, nothing to load). */
export default function SpecialIcon({ icon, size = 16 }: { icon: Icon; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, className: 'special-icon' } as const
  switch (icon) {
    case 'heart':
      return <svg {...common}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="currentColor" /></svg>
    case 'ring':
      return <svg {...common}><circle cx="12" cy="14" r="6" fill="none" stroke="currentColor" strokeWidth="2.2" /><path d="M9 4h6l-3 4z" fill="currentColor" /></svg>
    case 'cake':
      return <svg {...common}><path d="M4 20h16v-7H4zM6 13V10h12v3M12 10V7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="12" cy="5" r="1.4" fill="currentColor" /></svg>
    case 'plane':
      return <svg {...common}><path d="M2 13l20-8-6 15-3-6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
    case 'star':
      return <svg {...common}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor" /></svg>
    case 'home':
      return <svg {...common}><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
  }
}
