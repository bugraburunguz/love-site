import { useEffect, useLayoutEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useLocation, useNavigate, useNavigationType, type NavigateFunction } from 'react-router-dom'
import { isNativeApp } from './platform'

/**
 * Store app: screen changes animate like iOS instead of swapping instantly.
 *
 * React Router's own `viewTransition` option only works with a data router; this app uses <BrowserRouter>, so the
 * transition is started here: document.startViewTransition around a synchronous navigate (flushSync; main.tsx turns
 * the router's startTransition off in the app). <html data-nav> tells native.css which animation to run, and is
 * removed when it ends.
 *
 * Taps on in-app links are taken over by one capture-phase click listener. That skips the <Link>'s own navigation,
 * so a link that needs its Link props (state, replace) or cancels itself in onClick must carry data-no-transition.
 * The iOS back swipe keeps the web view's own animation, so history pops are not animated twice.
 */
export type NavKind = 'tab' | 'push' | 'pop' | 'none'
export type NavType = 'PUSH' | 'POP' | 'REPLACE'

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

/** The album screen has no tab bar; between two screens that both show it, the bar stays put while they slide. */
export function keepsTabs(from: string, to: string): boolean {
  const hasTabs = (url: string) => !pathOf(url).startsWith('/albums/')
  return hasTabs(from) && hasTabs(to)
}

/** The screens behind the current one in this session (paths only), as far as the app can follow them. */
export function nextStack(stack: string[], type: NavType, url: string): string[] {
  const path = pathOf(url)
  const top = stack[stack.length - 1]
  if (top === path) return stack // same screen, only the query changed
  if (type === 'PUSH') return [...stack, path]
  if (type === 'REPLACE') return stack.length ? [...stack.slice(0, -1), path] : [path]
  if (stack.length > 1 && stack[stack.length - 2] === path) return stack.slice(0, -1) // a back step
  return [path] // app start, a forward step or a jump: start over from here
}

/** The bar's back button: step back when the parent is the previous screen, otherwise replace this screen with it. */
export function backAction(stack: string[], to: string): 'history' | 'replace' {
  return stack.length > 1 && stack[stack.length - 2] === pathOf(to) ? 'history' : 'replace'
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

/**
 * Runs `update` (which changes the screen) inside a view transition of the given kind, when the web view has them.
 * <html data-nav> picks the animation, <html data-tabs="keep"> holds the tab bar still (native.css).
 */
function animate(kind: NavKind, tabs: boolean, update: () => void | Promise<void>): void {
  if (typeof document.startViewTransition !== 'function') {
    void update()
    return
  }
  const root = document.documentElement
  root.dataset.nav = kind
  if (tabs) root.dataset.tabs = 'keep'
  else delete root.dataset.tabs
  const transition = document.startViewTransition(update)
  void transition.finished.finally(() => {
    if (root.dataset.nav === kind) delete root.dataset.nav
    delete root.dataset.tabs
  })
}

// what the bar's back button needs from the router; set by the hook below (one router, one app)
let navigateRef: NavigateFunction | null = null
let stackRef: string[] = []
let screenChanged: (() => void) | null = null

/** The navigation bar's back button (AppHeader): back to `to`, animated as a pop. */
export function nativeBack(to: string): void {
  const navigate = navigateRef
  if (!navigate) return
  const tabs = keepsTabs(stackRef[stackRef.length - 1] ?? to, to)
  if (backAction(stackRef, to) === 'replace') {
    animate('pop', tabs, () => flushSync(() => navigate(to, { replace: true })))
    return
  }
  // a history step lands asynchronously (popstate): the new screen is captured once the hook has seen it
  animate('pop', tabs, () => new Promise<void>((resolve) => {
    const done = () => {
      screenChanged = null
      resolve()
    }
    screenChanged = done
    window.setTimeout(done, 600) // never hold the screen frozen if the step does not land
    navigate(-1)
  }))
}

/** Mounted once inside the router; does nothing on the website. */
export function useNativeNavTransitions(): void {
  const navigate = useNavigate()
  const location = useLocation()
  const type = useNavigationType()
  const current = location.pathname
  const seen = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (!isNativeApp || seen.current === location.key) return
    seen.current = location.key
    stackRef = nextStack(stackRef, type, location.pathname)
    screenChanged?.()
  }, [location.key, location.pathname, type])

  useEffect(() => {
    if (!isNativeApp) return
    navigateRef = navigate
    return () => {
      navigateRef = null
    }
  }, [navigate])

  useEffect(() => {
    if (!isNativeApp || typeof document.startViewTransition !== 'function') return
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.hasAttribute('data-no-transition')) return
      const to = interceptable(
        e,
        { href: anchor.href, target: anchor.target, hasDownload: anchor.hasAttribute('download') },
        window.location.origin,
      )
      if (!to) return
      const kind = navKind(current, to)
      if (kind === 'none') return // same screen (e.g. another page of the album): the <Link> handles it as before
      e.preventDefault() // the <Link>'s own handler sees this and stays out
      animate(kind, keepsTabs(current, to), () => flushSync(() => navigate(to)))
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [navigate, current])
}
