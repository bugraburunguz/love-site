import arkadaslar from './arkadaslar/theme'
import buyulu from './buyulu/theme'
import cadilarBayrami from './cadilar-bayrami/theme'
import romantik from './romantik/theme'
import seyahat from './seyahat/theme'
import yilbasi from './yilbasi/theme'
import { DEFAULT_THEME_ID, type ThemeDef, type ThemeSticker } from './types'
import { parseVariant } from './variant'

/**
 * Adding a theme: create themes/<id>/theme.ts (+ assets/), import it here, and add the id to app.themes.allowed in the
 * backend (application.yml / ThemeProperties). Nothing else knows about individual themes.
 */
const ALL: ThemeDef[] = [romantik, buyulu, arkadaslar, seyahat, yilbasi, cadilarBayrami]

export const THEMES: Readonly<Record<string, ThemeDef>> = Object.fromEntries(ALL.map((t) => [t.id, t]))
export const THEME_LIST: ReadonlyArray<ThemeDef> = ALL

/** Unknown ids (a theme removed later, or newer than this frontend) quietly fall back to the default theme. */
export function getTheme(id: string | null | undefined): ThemeDef {
  return (id && THEMES[id]) || THEMES[DEFAULT_THEME_ID]
}

export function findSticker(variant: string | null | undefined): { theme: ThemeDef; sticker: ThemeSticker } | null {
  const parsed = parseVariant(variant)
  if (!parsed) return null
  const theme = THEMES[parsed.themeId]
  const sticker = theme?.stickers.find((s) => s.id === parsed.stickerId)
  return theme && sticker ? { theme, sticker } : null
}
