export type Tab = '/' | '/takvim' | '/profil'

/** Which bottom tab a screen belongs to: the three tab screens and the screens below each of them. */
export function tabOf(path: string): Tab | null {
  if (path === '/' || path.startsWith('/albums/')) return '/'
  if (path === '/takvim' || path.startsWith('/takvim/')) return '/takvim'
  if (path === '/profil' || path === '/cop' || path === '/admin') return '/profil'
  return null
}

/**
 * The lit tab. Store app: the screen's tab (iOS keeps it lit on the screens below). Website: unchanged from the
 * NavLink rules (Raf only on "/", the others on their own path and below it).
 */
export function activeTab(path: string, native: boolean): Tab | null {
  if (native) return tabOf(path)
  if (path === '/') return '/'
  if (path === '/takvim' || path.startsWith('/takvim/')) return '/takvim'
  if (path === '/profil' || path.startsWith('/profil/')) return '/profil'
  return null
}
