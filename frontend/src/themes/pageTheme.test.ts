import { describe, expect, it } from 'vitest'
import { pageLayers } from '../components/Ambient'
import { layoutPage } from '../layout/pageLayout'
import { DESKTOP_METRICS, polaroidSize } from '../layout/geometry'
import type { PageDto } from '../api/pages'
import { pageThemeVars, themeVars } from './cssVars'
import { themeDecor } from './decor'
import { resolvePageTheme, scopeIndexes, themesInUse } from './pageTheme'
import { THEME_LIST, getTheme } from './registry'

const page = (id: string, themeId: string | null, mediaIds: string[]): PageDto => ({
  id, albumId: 'a', pageIndex: 0, template: 'AUTO', version: 0, swatch: null, paper: null, themeId,
  items: mediaIds.map((m, i) => ({ id: `i-${m}`, kind: 'MEDIA', mediaId: m, slotIndex: i, x: null, y: null, width: null, rotation: null, zIndex: null, variant: null, version: 0 })),
})

describe('page theme', () => {
  const album = getTheme('romantik')

  it('null follows the album theme (also a changed one); a set theme stays', () => {
    expect(resolvePageTheme(null, album).id).toBe('romantik')
    expect(resolvePageTheme(null, getTheme('yilbasi')).id).toBe('yilbasi')
    expect(resolvePageTheme('buyulu', album).id).toBe('buyulu')
    expect(resolvePageTheme('buyulu', getTheme('yilbasi')).id).toBe('buyulu')
    expect(resolvePageTheme('removed-theme', album).id).toBe('romantik')
  })

  it('scopes: the spread is the pair the book shows, "rest" runs to the end', () => {
    expect(scopeIndexes(6, 0, 'spread')).toEqual([0, 1])
    expect(scopeIndexes(6, 3, 'spread')).toEqual([2, 3])
    expect(scopeIndexes(5, 4, 'spread')).toEqual([4])
    expect(scopeIndexes(6, 3, 'page')).toEqual([3])
    expect(scopeIndexes(6, 3, 'rest')).toEqual([3, 4, 5])
    expect(scopeIndexes(6, 9, 'page')).toEqual([])
  })

  it('a spread with two hand fonts loads both themes', () => {
    expect(themesInUse([null, 'buyulu', 'buyulu', null], album).map((t) => t.id).sort()).toEqual(['buyulu', 'romantik'])
  })

  it('the album part (cover, accents, title) is not in the page vars; the page part is', () => {
    const pageVars = pageThemeVars(getTheme('buyulu')) as Record<string, string>
    expect(Object.keys(pageVars)).toEqual(expect.arrayContaining(['--font-hand', '--media-filter', '--frame-paper', '--theme-glow']))
    for (const albumOnly of ['--cover-color', '--theme-plus', '--font-title', '--rose-deep']) expect(pageVars[albumOnly]).toBeUndefined()
    expect((themeVars(album) as Record<string, string>)['--cover-color']).toBe(album.cover.color)
  })

  it('layout geometry does not depend on the page theme (only the decoration files do)', () => {
    const aspects = { m1: 0.75, m2: 1.5, m3: 0.6 }
    const base = layoutPage(page('p', null, ['m1', 'm2', 'm3']), aspects, DESKTOP_METRICS, themeDecor(album))
    for (const t of THEME_LIST) {
      const other = layoutPage(page('p', t.id, ['m1', 'm2', 'm3']), aspects, DESKTOP_METRICS, themeDecor(t))
      const frames = (l: typeof base) => l.items.filter((i) => i.kind === 'MEDIA').map(({ x, y, width, rotation }) => ({ x, y, width, rotation }))
      expect(frames(other)).toEqual(frames(base))
      expect(other.themeId).toBe(t.id)
    }
    expect(polaroidSize(400, 0.75).height).toBeGreaterThan(0)
  })

  it('a page of a spread gets half of the ambient particles', () => {
    for (const t of THEME_LIST) {
      const half = pageLayers(t.ambient, 0.5).reduce((s, l) => s + l.count, 0)
      const full = pageLayers(t.ambient, 1).reduce((s, l) => s + l.count, 0)
      expect(half).toBeLessThanOrEqual(Math.ceil(full / 2) + t.ambient.length)
    }
  })
})
