import { useEffect } from 'react'

type SwipeBackBridge = { webkit?: { messageHandlers?: { swipeBack?: { postMessage(enabled: boolean): void } } } }

/**
 * Turns the iOS edge swipe (back / forward through the app's pages, see MainViewController) on or off.
 * A no-op on the website and on Android, where the handler does not exist.
 */
export function setSwipeBack(enabled: boolean): void {
  try {
    ;(window as unknown as SwipeBackBridge).webkit?.messageHandlers?.swipeBack?.postMessage(enabled)
  } catch {
    /* the shell is gone or does not listen */
  }
}

/** Keeps the edge swipe off while the calling page is on screen (the album book turns pages with the same swipe). */
export function useNoSwipeBack(): void {
  useEffect(() => {
    setSwipeBack(false)
    return () => setSwipeBack(true)
  }, [])
}
