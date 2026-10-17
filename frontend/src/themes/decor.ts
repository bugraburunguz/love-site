import type { Decor } from '../layout/autoLayout'
import type { ThemeDef } from './types'
import { makeVariant } from './variant'

const cache = new WeakMap<ThemeDef, Decor>()

/** What the automatic decoration may use in a theme: its tape-like fasteners and its text-free stickers. */
export function themeDecor(theme: ThemeDef): Decor {
  let decor = cache.get(theme)
  if (!decor) {
    decor = {
      tapes: theme.fasteners.map((f) => f.replace(/\.svg$/, '')),
      stickers: theme.autoStickers.map((id) => makeVariant(theme.id, id)),
    }
    cache.set(theme, decor)
  }
  return decor
}
