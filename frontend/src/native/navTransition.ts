import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isNativeApp } from './platform'

/**
 * Store app: screen changes animate like iOS instead of swapping instantly. Taps on in-app links go through React
 * Router with a view transition; <html data-nav> tells the CSS (native.css) which animation to run. The back swipe
 * keeps the web view's own animation, so history pops are not animated twice.
 */
export type NavKind = 'tab' | 'push' | 'pop' | 'none'

const TAB_ROOTS = new Set(['/', '/takvim', '/profil'])

const pathOf = (url: string) => url.split(/[?#]/)[0].replace(/\/+$/, '') || '/'

/** 0 for the three tab screens, otherwise the number of path segments (/cop and /albums/x sit one level down). */
function depth(path: string): number {
  if (TAB_ROOTS.has(path)) return 0
  return Math.max(1, path.split('/').filter(Boolean).length - 1)
}

export function navKind(from: string, to: string): NavKind {
  const a = pathOf(from)
  const b = pathOf(to)
  if (a === b) return 'none'
  if (TAB_ROOTS.has(a) && TAB_ROOTS.has(b)) return 'tab'
  return depth(b) < depth(a) ? 'pop' : 'push'
}

interface ClickLike {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
}

interface LinkLike {
  href: string
  target: string
  hasDownload: boolean
}

/** The in-app path to navigate to, or null when the click belongs to the browser (new tab, download, other site). */
export function interceptable(click: ClickLike, link: LinkLike, origin: string): string | null {
  if (click.defaultPrevented || click.button !== 0) return null
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return null
  if ((link.target && link.target !== '_self') || link.hasDownload) return null
  let url: URL
  try {
    url = new URL(link.href, origin)
  } catch {
    return null
  }
  if (url.origin !== new URL(origin).origin) return null
  return url.pathname + url.search + url.hash
}

/** Mounted once inside the router; does nothing on the website. */
export function useNativeNavTransitions(): void {
  const navigate = useNavigate()
  const location = useLocation()
  const current = location.pathname

  useEffect(() => {
    if (!isNativeApp || typeof document.startViewTransition !== 'function') return
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      const to = interceptable(
        e,
        { href: anchor.href, target: anchor.target, hasDownload: anchor.hasAttribute('download') },
        window.location.origin,
      )
      if (!to) return
      const kind = navKind(current, to)
      if (kind === 'none') return // same screen (e.g. another page of the album): React Router handles it as before
      e.preventDefault() // the <Link>'s own handler sees this and stays out
      document.documentElement.dataset.nav = kind
      navigate(to, { viewTransition: true })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [navigate, current])
}
