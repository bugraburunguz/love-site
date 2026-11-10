/**
 * Light / dark ("Gece okuması") for the app chrome. "system" follows prefers-color-scheme; light and dark set
 * <html data-theme> (see ui-tokens.css). The choice is a per-device convenience: storage may be missing or blocked
 * (private mode, app webview quirks), so every access is guarded and the default is always "system".
 */
export type ColorMode = 'system' | 'light' | 'dark'

const KEY = 'ui-color-mode'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface RootLike {
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

function defaultStorage(): StorageLike | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

export function readColorMode(storage: StorageLike | undefined = defaultStorage()): ColorMode {
  try {
    const value = storage?.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function writeColorMode(mode: ColorMode, storage: StorageLike | undefined = defaultStorage()): void {
  try {
    if (mode === 'system') storage?.removeItem(KEY)
    else storage?.setItem(KEY, mode)
  } catch {
    // a blocked storage only means the choice is not remembered
  }
}

export function applyColorMode(mode: ColorMode, root: RootLike = document.documentElement): void {
  if (mode === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)
}

/** fired on window after the user picked a mode (the store app's status bar follows it) */
export const COLOR_MODE_EVENT = 'ui-color-mode'

/** Remember and apply in one go (the settings toggle). */
export function setColorMode(mode: ColorMode): void {
  writeColorMode(mode)
  applyColorMode(mode)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<ColorMode>(COLOR_MODE_EVENT, { detail: mode }))
}
