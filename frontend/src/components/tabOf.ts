export type Tab = '/' | '/takvim' | '/profil'

/** Which bottom tab a screen belongs to: the three tab screens and the screens below each of them. */
export function tabOf(path: string): Tab | null {
  if (path === '/' || path.startsWith('/albums/')) return '/'
  if (path === '/takvim' || path.startsWith('/takvim/')) return '/takvim'
  if (path === '/profil' || path === '/cop' || path === '/admin') return '/profil'
  return null
}
