import { createContext, useContext, useEffect } from 'react'
import { getTheme } from './registry'
import { DEFAULT_THEME_ID, type ThemeDef } from './types'

export const ThemeContext = createContext<ThemeDef>(getTheme(DEFAULT_THEME_ID))

/** The theme of the album that is open (the default theme outside albums). */
export function useTheme(): ThemeDef {
  return useContext(ThemeContext)
}

const loaded = new Map<string, Promise<unknown>>()

/** Loads the font files of a theme once; they are separate chunks, never part of the start-up bundle. */
export function loadThemeFonts(theme: ThemeDef): Promise<unknown> {
  let p = loaded.get(theme.id)
  if (!p) {
    p = theme.fonts.load().catch(() => undefined) // a missing font only means the fallback font is used
    loaded.set(theme.id, p)
  }
  return p
}

export function useThemeFonts(theme: ThemeDef): void {
  useEffect(() => {
    void loadThemeFonts(theme)
  }, [theme])
}
