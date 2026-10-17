import { contrast } from './contrast'
import {
  MAX_AMBIENT_PARTICLES, MEDIA_FILTER_LIMITS, PAPER_SLOTS, SWATCH_SLOTS, type ThemeDef,
} from './types'

const SLUG = /^[a-z][a-z0-9-]{1,40}$/
const ALLOWED_FRAME_KEYS = ['paper', 'edge', 'texture', 'corner', 'perforated']

/**
 * Everything a theme must satisfy, as a list of problems (empty = fine). `files` is the set of paths under the theme's
 * assets folder (e.g. "stickers/wax-seal.svg"). Used by the tests; also handy when writing a new theme.
 */
export function validateTheme(theme: ThemeDef, files: ReadonlySet<string>): string[] {
  const problems: string[] = []
  const need = (cond: boolean, message: string) => {
    if (!cond) problems.push(message)
  }
  const file = (name: string | undefined, what: string) => {
    need(!!name && files.has(name), `${what}: missing file ${name}`)
  }

  need(SLUG.test(theme.id), 'id must be a lower-case slug')
  need(theme.name.length > 1 && theme.description.length > 10, 'name and description (Turkish) are required')
  need(!!theme.fonts.display, 'display font')
  need(typeof theme.fonts.load === 'function', 'fonts.load')

  for (const slot of SWATCH_SLOTS) {
    const s = theme.swatches[slot]
    need(!!s, `swatch ${slot} missing`)
    if (!s) continue
    need(contrast(s.bg, s.ink) >= 4.5, `swatch ${slot}: contrast ${contrast(s.bg, s.ink).toFixed(2)} < 4.5`)
  }
  need(Object.keys(theme.swatches).length === SWATCH_SLOTS.length, 'exactly the 5 semantic swatch slots')
  need(Object.keys(theme.papers).length === PAPER_SLOTS.length, 'exactly the 4 semantic paper slots')
  for (const slot of PAPER_SLOTS) file(theme.papers[slot], `paper ${slot}`)

  file(theme.cover.ornament, 'cover ornament')
  if (theme.cover.texture) file(theme.cover.texture, 'cover texture')
  need(contrast(theme.cover.color, theme.cover.ink) >= 3, 'cover title ink must be readable on the cover colour')

  for (const key of Object.keys(theme.frameSkin)) need(ALLOWED_FRAME_KEYS.includes(key), `frameSkin.${key} is not an appearance property`)
  if (theme.frameSkin.texture) file(theme.frameSkin.texture, 'frame texture')
  if (theme.frameSkin.corner) file(theme.frameSkin.corner, 'frame corner')

  need(theme.fasteners.length >= 3, 'at least 3 fasteners')
  theme.fasteners.forEach((f) => file(f, 'fastener'))

  need(theme.stickers.length >= 10 && theme.stickers.length <= 12, `10-12 stickers, found ${theme.stickers.length}`)
  const ids = new Set<string>()
  for (const s of theme.stickers) {
    need(SLUG.test(s.id) && !ids.has(s.id), `sticker id ${s.id} must be a unique slug`)
    ids.add(s.id)
    need(s.name.length > 0, `sticker ${s.id} needs a name`)
    file(`stickers/${s.file}`, `sticker ${s.id}`)
  }
  need(theme.autoStickers.length >= 2 && theme.autoStickers.every((id) => ids.has(id)), 'autoStickers must be existing sticker ids (at least 2)')

  for (const key of Object.keys(MEDIA_FILTER_LIMITS) as (keyof typeof MEDIA_FILTER_LIMITS)[]) {
    const [lo, hi] = MEDIA_FILTER_LIMITS[key]
    const v = theme.mediaFilter[key]
    need(v >= lo && v <= hi, `mediaFilter.${key} = ${v} is outside ${lo}..${hi}`)
  }

  const particles = theme.ambient.reduce((sum, l) => sum + l.count, 0)
  need(particles <= MAX_AMBIENT_PARTICLES, `ambient uses ${particles} particles, at most ${MAX_AMBIENT_PARTICLES}`)
  need(theme.ambient.length > 0, 'an ambient animation is required')

  file(theme.musicBox.closed, 'music box (closed)')
  file(theme.musicBox.open, 'music box (open)')
  if (theme.cursor) file(theme.cursor.file, 'cursor')
  return problems
}
