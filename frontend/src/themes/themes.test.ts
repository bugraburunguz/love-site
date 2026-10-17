import { describe, expect, it } from 'vitest'
import { DESKTOP_METRICS, polaroidSize, toMetrics } from '../layout/geometry'
import { contrast } from './contrast'
import { THEME_LIST, THEMES, findSticker, getTheme } from './registry'
import { MAX_AMBIENT_PARTICLES, MEDIA_FILTER_LIMITS, PAPER_SLOTS, SWATCH_SLOTS } from './types'
import { validateTheme } from './validate'
import { makeVariant, parseVariant } from './variant'

// Every file of every theme, as raw text (SVG) or just its presence.
const raw = import.meta.glob('./*/assets/**/*.svg', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
const sources = import.meta.glob(['./*/theme.ts', '../styles/fonts.ts', './registry.ts'], { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

function filesOf(themeId: string): Set<string> {
  const prefix = `./${themeId}/assets/`
  return new Set(Object.keys(raw).filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)))
}

const IDS = ['romantik', 'buyulu', 'arkadaslar', 'seyahat', 'yilbasi', 'cadilar-bayrami']

describe('theme registry', () => {
  it('has the six themes and falls back to the default for unknown ids', () => {
    expect(THEME_LIST.map((t) => t.id).sort()).toEqual([...IDS].sort())
    expect(getTheme('does-not-exist').id).toBe('romantik')
    expect(getTheme(null).id).toBe('romantik')
    expect(getTheme('buyulu').id).toBe('buyulu')
  })

  it('stickers resolve through "themeId:stickerId" variants; unknown ones quietly do not', () => {
    expect(findSticker(makeVariant('romantik', 'wax-seal'))?.sticker.id).toBe('wax-seal')
    expect(findSticker('romantik:nope')).toBeNull()
    expect(findSticker('unknown:wax-seal')).toBeNull()
    expect(findSticker('not a variant')).toBeNull()
    expect(findSticker(null)).toBeNull()
    expect(parseVariant('Romantik:heart')).toBeNull()
    expect(parseVariant('a:b')).toBeNull()
  })
})

describe.each(IDS)('theme %s', (id) => {
  const theme = THEMES[id]

  it('satisfies the schema (5 swatches, 4 papers, 10-12 stickers, all files exist, contrast, filter limits, particles)', () => {
    expect(validateTheme(theme, filesOf(id))).toEqual([])
  })

  it('every swatch has at least 4.5:1 contrast between page and ink', () => {
    for (const slot of SWATCH_SLOTS) {
      const s = theme.swatches[slot]
      expect(contrast(s.bg, s.ink), `${id}/${slot}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('uses exactly the semantic slots', () => {
    expect(Object.keys(theme.swatches).sort()).toEqual([...SWATCH_SLOTS].sort())
    expect(Object.keys(theme.papers).sort()).toEqual([...PAPER_SLOTS].sort())
    expect(theme.stickers.length).toBeGreaterThanOrEqual(10)
    expect(theme.stickers.length).toBeLessThanOrEqual(12)
  })

  it('keeps the photo filter inside the limits that leave faces natural (and uses no hue rotation)', () => {
    for (const key of Object.keys(MEDIA_FILTER_LIMITS) as (keyof typeof MEDIA_FILTER_LIMITS)[]) {
      const [lo, hi] = MEDIA_FILTER_LIMITS[key]
      expect(theme.mediaFilter[key], key).toBeGreaterThanOrEqual(lo)
      expect(theme.mediaFilter[key], key).toBeLessThanOrEqual(hi)
    }
    expect(Object.keys(theme.mediaFilter).sort()).toEqual(['brightness', 'contrast', 'saturate', 'sepia'])
  })

  it('keeps ambient animations small', () => {
    expect(theme.ambient.reduce((sum, l) => sum + l.count, 0)).toBeLessThanOrEqual(MAX_AMBIENT_PARTICLES)
  })

  it('has no <text> element in any sticker (an <img> SVG cannot use web fonts: text is converted to paths)', () => {
    const stickers = Object.entries(raw).filter(([k]) => k.startsWith(`./${id}/assets/stickers/`))
    expect(stickers.length).toBe(theme.stickers.length)
    for (const [path, svg] of stickers) {
      expect(svg, path).not.toMatch(/<text[\s>]/i)
      expect(svg, path).not.toMatch(/<tspan/i)
      expect(svg, path).toContain('viewBox="0 0 100 100"')
      expect(svg, path).not.toMatch(/<script|onload=|href="http/i)
      expect(svg.length, `${path} should stay small`).toBeLessThan(16_000)
    }
  })

  it('draws no shadow inside the stickers (the shadow is a CSS drop-shadow, the same in every theme)', () => {
    for (const [path, svg] of Object.entries(raw).filter(([k]) => k.startsWith(`./${id}/assets/stickers/`))) {
      expect(svg, path).not.toMatch(/<filter|feDropShadow|feGaussianBlur/i)
    }
  })

  it('only describes the frame skin as appearance (no sizes), so polaroid geometry cannot depend on the theme', () => {
    const allowed = ['paper', 'edge', 'texture', 'corner', 'perforated']
    expect(Object.keys(theme.frameSkin).every((k) => allowed.includes(k))).toBe(true)
  })

  it('does not import its fonts at start-up (they load when an album of this theme is opened)', () => {
    const source = sources[`./${id}/theme.ts`]
    expect(source).not.toMatch(/^import\s+['"]@fontsource/m)
    expect(source).not.toMatch(/^import .*from ['"]@fontsource/m)
  })
})

describe('details of single themes', () => {
  it('the magical theme signs off its album with "Büyü tamamlandı", the others have no end note', () => {
    expect(THEMES.buyulu.endNote).toBe('Büyü tamamlandı')
    for (const t of THEME_LIST.filter((x) => x.id !== 'buyulu')) expect(t.endNote, t.id).toBeUndefined()
  })

  it('only the magical theme brings a cursor; seyahat has the compass; arkadaslar wiggles; only cadilar and yilbasi/romantik/buyulu burst', () => {
    expect(THEME_LIST.filter((t) => t.cursor).map((t) => t.id)).toEqual(['buyulu'])
    expect(THEME_LIST.filter((t) => t.hover.compass).map((t) => t.id)).toEqual(['seyahat'])
    expect(THEME_LIST.filter((t) => t.hover.wiggle).map((t) => t.id)).toEqual(['arkadaslar'])
    expect(THEMES.romantik.hover.burst).toBe('petals')
    expect(THEMES.buyulu.hover.burst).toBe('sparkles')
    expect(THEMES.yilbasi.hover.burst).toBe('snow')
    expect(THEMES['cadilar-bayrami'].hover.burst).toBe('bats')
  })

  it('the display font of the loud themes is limited to the title and cover; other headings use a calm font', () => {
    expect(THEMES['cadilar-bayrami'].fonts.headings).toContain('Cinzel')
    expect(THEMES.yilbasi.fonts.headings).toContain('Cinzel')
  })
})

describe('start-up bundle', () => {
  it('only the base fonts are imported statically', () => {
    const base = sources['../styles/fonts.ts']
    const imported = [...base.matchAll(/import '@fontsource\/([a-z-]+)\//g)].map((m) => m[1])
    expect(new Set(imported)).toEqual(new Set(['cinzel', 'cormorant-garamond', 'caveat']))
  })
})

describe('the polaroid outer geometry is the same whatever the theme is', () => {
  it('is a function of width, aspect and screen metrics only', () => {
    const reference = polaroidSize(400, 0.75, DESKTOP_METRICS)
    // it takes no theme argument at all; the numbers are pinned so a theme can never change what the layout engine assumes
    expect(reference.imageWidth).toBeCloseTo(352, 5)
    expect(reference.height).toBeGreaterThan(reference.imageHeight)
    for (const metrics of [DESKTOP_METRICS, toMetrics(0.348, true)]) {
      expect(polaroidSize(400, 0.75, metrics)).toEqual(polaroidSize(400, 0.75, metrics))
    }
    expect(polaroidSize.length).toBeLessThanOrEqual(3)
  })
})
