import type { CSSProperties } from 'react'
import { cssUrl } from './assets'
import { PAPER_SLOTS, SWATCH_SLOTS, type PaperSlot, type SwatchSlot, type ThemeDef } from './types'

type Vars = Record<string, string>

const asStyle = (vars: Vars) => vars as CSSProperties

/** Theme-wide CSS variables: fonts, accent colours, photo filter, polaroid frame skin, cursor, glow. */
export function themeVars(theme: ThemeDef): CSSProperties {
  const f = theme.mediaFilter
  const skin = theme.frameSkin
  const vars: Vars = {
    '--font-title': theme.fonts.display,
    '--font-display': theme.fonts.headings ?? theme.fonts.display,
    '--font-hand': theme.fonts.hand ?? "'Caveat', 'Comic Sans MS', cursive",
    '--blush': theme.accents.blush,
    '--blush-light': theme.accents.blushLight,
    '--rose-dust': theme.accents.rose,
    '--rose-deep': theme.accents.roseDeep,
    '--gold': theme.accents.gold,
    '--gold-light': theme.accents.goldLight,
    '--theme-plus': theme.accents.plus,
    '--theme-focus': theme.accents.focus,
    '--media-filter': `sepia(${f.sepia}) saturate(${f.saturate}) contrast(${f.contrast}) brightness(${f.brightness})`,
    '--frame-paper': skin.paper,
    '--frame-edge': skin.edge,
    '--frame-texture': cssUrl(theme.id, skin.texture),
    '--frame-corner': cssUrl(theme.id, skin.corner),
    '--theme-glow': theme.hover.glow,
    '--cover-color': theme.cover.color,
    '--cover-ink': theme.cover.ink,
    '--cover-stitch': theme.cover.stitch,
  }
  if (theme.cover.texture) vars['--tex-leather'] = cssUrl(theme.id, theme.cover.texture)
  return asStyle(vars)
}

export function swatchSlot(slot: string | null | undefined): SwatchSlot {
  return (SWATCH_SLOTS as readonly string[]).includes(slot ?? '') ? (slot as SwatchSlot) : 'light'
}

export function paperSlot(slot: string | null | undefined): PaperSlot {
  return (PAPER_SLOTS as readonly string[]).includes(slot ?? '') ? (slot as PaperSlot) : 'plain'
}

/** Per page: colour and paper. A page without its own choice uses the theme's default (light / plain). */
export function pageVars(theme: ThemeDef, swatch?: string | null, paper?: string | null): CSSProperties {
  const sw = theme.swatches[swatchSlot(swatch)]
  return asStyle({
    '--page-bg': sw.bg,
    '--page-ink': sw.ink,
    '--page-shadow': sw.shadow,
    '--page-paper': cssUrl(theme.id, theme.papers[paperSlot(paper)]),
    // the "holes" of a perforated frame show the page: they are drawn in the page colour
    '--perf-color': theme.frameSkin.perforated ? sw.bg : 'transparent',
  })
}
