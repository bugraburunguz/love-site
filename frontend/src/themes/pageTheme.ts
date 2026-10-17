import { getTheme, THEMES } from './registry'
import type { ThemeDef } from './types'

/**
 * Album theme vs page theme. The album theme owns the cover / shelf, the binding around the pages, the controls and the
 * "+" button, the title font and the music box. A page theme owns the paper (swatches + papers), the polaroid frame skin,
 * the fasteners and automatic stickers, the caption hand font, the photo filter, the ambient animation of that page and the
 * hover effect. A page without its own theme (themeId null) uses the album theme, also after the album theme changes.
 */
export function resolvePageTheme(pageThemeId: string | null | undefined, albumTheme: ThemeDef): ThemeDef {
  return pageThemeId && THEMES[pageThemeId] ? getTheme(pageThemeId) : albumTheme
}

/** How far a theme change from the page panel reaches. */
export type ThemeScope = 'spread' | 'page' | 'rest'

/**
 * Indexes of the pages a scope covers, starting at page `index`. A spread is the pair (0,1), (2,3) ... exactly as the book
 * shows them on a wide screen; on a phone (one page at a time) "spread" still means this page and the page facing it.
 */
export function scopeIndexes(pageCount: number, index: number, scope: ThemeScope): number[] {
  if (index < 0 || index >= pageCount) return []
  if (scope === 'page') return [index]
  if (scope === 'rest') return Array.from({ length: pageCount - index }, (_, i) => index + i)
  const first = index - (index % 2)
  return [first, first + 1].filter((i) => i < pageCount)
}

/** Every theme the given pages need (their own ones plus the album theme): their fonts are loaded together. */
export function themesInUse(pageThemeIds: ReadonlyArray<string | null | undefined>, albumTheme: ThemeDef): ThemeDef[] {
  const seen = new Map<string, ThemeDef>([[albumTheme.id, albumTheme]])
  for (const id of pageThemeIds) {
    const t = resolvePageTheme(id, albumTheme)
    seen.set(t.id, t)
  }
  return [...seen.values()]
}
