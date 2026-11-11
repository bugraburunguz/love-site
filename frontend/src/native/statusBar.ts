import { StatusBar, Style } from '@capacitor/status-bar'
import { useEffect } from 'react'
import { COLOR_MODE_EVENT, readColorMode, type ColorMode } from '../styles/colorMode'
import { isNativeApp } from './platform'

/** The colour of the clock and battery icons: dark on the cream paper, light in night reading. */
export function statusBarText(mode: ColorMode, systemDark: boolean, fixed?: 'dark' | 'light' | null): 'dark' | 'light' {
  if (fixed) return fixed
  const dark = mode === 'dark' || (mode === 'system' && systemDark)
  return dark ? 'light' : 'dark'
}

// set while a screen with its own paper is open (the album desk is always light, in night reading too)
let fixedText: 'dark' | 'light' | null = null

/** Keeps the status bar text in the given colour while the calling screen is on show. */
export function useStatusBarText(text: 'dark' | 'light'): void {
  useEffect(() => {
    if (!isNativeApp) return
    fixedText = text
    void syncStatusBar()
    return () => {
      fixedText = null
      void syncStatusBar()
    }
  }, [text])
}

const darkQuery = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null)

/** Applies the status bar text colour for the current choice (store app only). */
export async function syncStatusBar(mode: ColorMode = readColorMode()): Promise<void> {
  if (!isNativeApp) return
  const text = statusBarText(mode, darkQuery()?.matches ?? false, fixedText)
  try {
    // Capacitor's names describe the bar's background: Style.Light = dark text, Style.Dark = light text
    await StatusBar.setStyle({ style: text === 'dark' ? Style.Light : Style.Dark })
  } catch {
    /* not available on this platform */
  }
}

/** Keeps the status bar in step: with the phone's appearance (choice "system") and with the profile's light/dark choice. */
export function watchSystemAppearance(): void {
  if (!isNativeApp) return
  darkQuery()?.addEventListener('change', () => void syncStatusBar())
  window.addEventListener(COLOR_MODE_EVENT, (e) => void syncStatusBar((e as CustomEvent<ColorMode>).detail))
}
