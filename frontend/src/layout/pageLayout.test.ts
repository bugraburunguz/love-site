import { describe, expect, it } from 'vitest'
import type { PageDto, PageItemDto } from '../api/pages'
import { initialDistribution, layoutAutoPage, layoutFeaturedPage, pageSizes } from './autoLayout'
import { BOUNDS, DEFAULT_ASPECT, DESKTOP_METRICS, toMetrics, type Metrics } from './geometry'
import { freezePayload, layoutPage } from './pageLayout'
import { area, boxOf, boxesOverlap, intersectionArea, polaroidShapes, stickerPoly, tapePoly } from './shapes'
import type { PageLayout } from './types'

const ASPECTS = [9 / 16, 3 / 4, 16 / 9, 1, 0.5, 2, 4 / 3]
const SCREENS: Record<string, Metrics> = {
  desktop: DESKTOP_METRICS,
  phone390: toMetrics(0.348, true),
  phone320: toMetrics(0.27, true),
  bigDesktop: toMetrics(0.9, false),
}
const MAX_IMAGE_COVER = 0.15

function inside(box: { minX: number; minY: number; maxX: number; maxY: number }) {
  return box.minX >= BOUNDS.minX - 1e-6 && box.maxX <= BOUNDS.maxX + 1e-6 && box.minY >= BOUNDS.minY - 1e-6 && box.maxY <= BOUNDS.maxY + 1e-6
}

function problems(layout: PageLayout, aspects: Record<string, number>, m: Metrics): string[] {
  const out: string[] = []
  const photos = layout.items.filter((i) => i.kind === 'MEDIA')
  const shapes = photos.map((p) => polaroidShapes(p, p.mediaId ? aspects[p.mediaId] ?? DEFAULT_ASPECT : undefined, m))
  shapes.forEach((s, i) => {
    if (!inside(s.box)) out.push(`photo ${i} leaves the page ${JSON.stringify(s.box)}`)
  })
  const order = photos.map((p, i) => ({ i, z: p.zIndex })).sort((a, b) => a.z - b.z)
  for (let a = 0; a < order.length; a++) {
    for (let b = a + 1; b < order.length; b++) {
      const lower = shapes[order[a].i]
      const upper = shapes[order[b].i]
      if (intersectionArea(upper.frame, lower.caption) > 0.5) out.push('caption covered')
      if (intersectionArea(upper.frame, lower.image) > area(lower.image) * MAX_IMAGE_COVER + 1e-6) out.push('picture covered > 15%')
    }
  }
  for (const t of layout.items.filter((i) => i.kind === 'TAPE')) {
    const poly = tapePoly(t)
    if (!inside(boxOf(poly))) out.push('tape leaves the page')
    shapes.forEach((s) => {
      if (intersectionArea(poly, s.image) > 0.5) out.push('tape touches a picture')
      if (intersectionArea(poly, s.caption) > 0.5) out.push('tape covers a caption')
    })
  }
  for (const st of layout.items.filter((i) => i.kind === 'STICKER')) {
    const box = boxOf(stickerPoly(st))
    if (!inside(box)) out.push('sticker leaves the page')
    shapes.forEach((s) => {
      if (boxesOverlap(box, s.box)) out.push('sticker overlaps a photo')
    })
  }
  return out
}

const refs = (n: number, tag: string) => Array.from({ length: n }, (_, i) => ({ id: `${tag}-m${i}`, itemId: `${tag}-i${i}` }))

describe('AUTO pages (1-4 photos, computed per page)', () => {
  for (const [screen, metrics] of Object.entries(SCREENS)) {
    for (let n = 1; n <= 4; n++) {
      it(`${n} photo(s) on ${screen}: every aspect mix stays inside the page without hiding anything`, () => {
        const found: string[] = []
        for (let seed = 0; seed < 25; seed++) {
          const media = refs(n, `s${seed}`)
          const aspects: Record<string, number> = {}
          media.forEach((m, i) => {
            const pick = (i * 3 + seed) % (ASPECTS.length + 1)
            if (pick < ASPECTS.length) aspects[m.id] = ASPECTS[pick] // the rest keep the unknown-ratio default
          })
          const layout = layoutAutoPage(media, `page-${seed}`, aspects, metrics)
          expect(layout.items.filter((i) => i.kind === 'MEDIA')).toHaveLength(n)
          found.push(...problems(layout, aspects, metrics).map((p) => `seed ${seed}: ${p}`))
        }
        expect(found).toEqual([])
      })
    }
  }

  it('is deterministic and uses the page item ids; a photo keeps its tilt wherever it lands', () => {
    const media = refs(3, 'd')
    const a = layoutAutoPage(media, 'page-x', {}, DESKTOP_METRICS)
    const b = layoutAutoPage(media, 'page-x', {}, DESKTOP_METRICS)
    expect(a).toEqual(b)
    expect(a.items.filter((i) => i.kind === 'MEDIA').map((i) => i.id)).toEqual(['d-i0', 'd-i1', 'd-i2'])
    const solo = layoutAutoPage([media[1]], 'page-x', {}, DESKTOP_METRICS)
    expect(solo.items.find((i) => i.mediaId === 'd-m1')!.rotation).toBeCloseTo(a.items.find((i) => i.mediaId === 'd-m1')!.rotation, 9)
  })
})

describe('FEATURED pages', () => {
  for (const [screen, metrics] of Object.entries(SCREENS)) {
    it(`a single photo fills the page on ${screen} for every aspect ratio`, () => {
      const found: string[] = []
      for (let seed = 0; seed < 25; seed++) {
        for (const aspect of ASPECTS) {
          const media = { id: `f${seed}`, itemId: `fi${seed}` }
          const layout = layoutFeaturedPage(media, `fp-${seed}-${aspect}`, { [media.id]: aspect }, metrics)
          const photo = layout.items.filter((i) => i.kind === 'MEDIA')
          expect(photo).toHaveLength(1)
          found.push(...problems(layout, { [media.id]: aspect }, metrics).map((p) => `seed ${seed} aspect ${aspect}: ${p}`))
          // as large as the usable area allows: either the width or the height of the usable area is (nearly) used
          const box = polaroidShapes(photo[0], aspect, metrics).box
          const usedW = (box.maxX - box.minX) / (BOUNDS.maxX - BOUNDS.minX)
          const usedH = (box.maxY - box.minY) / (BOUNDS.maxY - BOUNDS.minY)
          if (Math.max(usedW, usedH) < 0.85) found.push(`seed ${seed} aspect ${aspect}: only ${Math.round(Math.max(usedW, usedH) * 100)}% of the page used`)
        }
      }
      expect(found).toEqual([])
    })
  }

  it('is bigger than any photo of an AUTO page and deterministic', () => {
    const media = { id: 'm', itemId: 'i' }
    const featured = layoutFeaturedPage(media, 'p', { m: 0.75 }, DESKTOP_METRICS)
    expect(featured).toEqual(layoutFeaturedPage(media, 'p', { m: 0.75 }, DESKTOP_METRICS))
    const auto = layoutAutoPage([media], 'p', { m: 0.75 }, DESKTOP_METRICS)
    expect(featured.items[0].width).toBeGreaterThanOrEqual(auto.items[0].width)
  })

  it('an empty FEATURED page has no items', () => {
    expect(layoutFeaturedPage(undefined, 'p', {}, DESKTOP_METRICS).items).toEqual([])
  })
})

function item(partial: Partial<PageItemDto> & { id: string }): PageItemDto {
  return {
    kind: 'MEDIA', mediaId: partial.id + '-media', slotIndex: null, x: null, y: null, width: null, rotation: null, zIndex: null,
    variant: null, version: 0, ...partial,
  }
}

describe('stored pages -> layout', () => {
  const page = (template: PageDto['template'], items: PageItemDto[]): PageDto => ({ id: 'pg', albumId: 'al', pageIndex: 3, template, version: 1, swatch: null, paper: null, themeId: null, items })

  it('AUTO follows the stored slot order, not the order of the array', () => {
    const layout = layoutPage(page('AUTO', [item({ id: 'b', slotIndex: 1 }), item({ id: 'a', slotIndex: 0 })]), {}, DESKTOP_METRICS)
    expect(layout.pageIndex).toBe(3)
    expect(layout.items.filter((i) => i.kind === 'MEDIA').map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('FREE uses exactly the stored positions', () => {
    const layout = layoutPage(page('FREE', [item({ id: 'a', x: 123, y: 456, width: 321, rotation: -7.5, zIndex: 9 })]), {}, DESKTOP_METRICS)
    expect(layout.items).toEqual([
      { id: 'a', kind: 'MEDIA', mediaId: 'a-media', x: 123, y: 456, width: 321, rotation: -7.5, zIndex: 9, variant: undefined, stored: true },
    ])
  })

  it('freezing sends exactly the positions that are drawn (AUTO and FEATURED), nothing recomputed', () => {
    for (const template of ['AUTO', 'FEATURED'] as const) {
      const dto = page(template, [item({ id: 'a', slotIndex: 0 }), ...(template === 'AUTO' ? [item({ id: 'b', slotIndex: 1 })] : [])])
      const aspects = { 'a-media': 0.75, 'b-media': 1.5 }
      const layout = layoutPage(dto, aspects, SCREENS.phone390)
      const payload = freezePayload(layout)
      const drawn = layout.items.filter((i) => i.kind === 'MEDIA')
      expect(payload).toHaveLength(drawn.length)
      drawn.forEach((d, n) => {
        expect(payload[n]).toEqual({ id: d.id, x: d.x, y: d.y, width: d.width, rotation: d.rotation, zIndex: d.zIndex })
      })
      // and once stored, the FREE page draws those very numbers
      const frozen = page('FREE', payload.map((p) => item({ ...p })))
      const again = layoutPage(frozen, aspects, SCREENS.phone390).items
      drawn.forEach((d) => {
        const f = again.find((i) => i.id === d.id)!
        expect([f.x, f.y, f.width, f.rotation, f.zIndex]).toEqual([d.x, d.y, d.width, d.rotation, d.zIndex])
      })
    }
  })
})

describe('initial distribution', () => {
  it('splits the media exactly like the former album layout did', () => {
    const media = Array.from({ length: 11 }, (_, i) => ({ id: `m${i}` }))
    const groups = initialDistribution(media, 'album-1')
    expect(groups.map((g) => g.length)).toEqual(pageSizes(11, 'album-1'))
    expect(groups.flat()).toEqual(media)
  })
})
