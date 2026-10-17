import { describe, expect, it } from 'vitest'
import { autoLayout, pageSizes } from './autoLayout'
import { BOUNDS, DEFAULT_ASPECT } from './geometry'
import { area, boxOf, boxesOverlap, intersectionArea, polaroidShapes, stickerPoly, tapePoly } from './shapes'
import type { PageItem, PageLayout } from './types'

const ASPECTS = [9 / 16, 3 / 4, 16 / 9, 1]
/** The rule from the brief, deliberately not imported from the generator. */
const MAX_IMAGE_COVER = 0.15

function makeMedia(count: number, seed: number) {
  const media = Array.from({ length: count }, (_, i) => ({ id: `m${seed}-${i}` }))
  const aspects: Record<string, number> = {}
  // mixed 9:16, 3:4, 16:9 and 1:1; a few photos have no known ratio yet (default 9:16)
  media.forEach((m, i) => {
    const pick = (i * 7 + seed * 3) % 5
    if (pick < 4) aspects[m.id] = ASPECTS[pick]
  })
  return { media, aspects }
}

function mediaCount(page: PageLayout) {
  return page.items.filter((i) => i.kind === 'MEDIA').length
}

function shapesOf(item: PageItem, aspects: Record<string, number>) {
  return polaroidShapes(item, item.mediaId ? aspects[item.mediaId] ?? DEFAULT_ASPECT : undefined)
}

/** Every rule from the brief, checked independently of the generator's own bookkeeping. */
function violations(pages: PageLayout[], aspects: Record<string, number>, count: number): string[] {
  const problems: string[] = []
  const tag = (page: PageLayout, what: string) => problems.push(`page ${page.pageIndex}: ${what}`)

  if (pages.reduce((sum, p) => sum + mediaCount(p), 0) !== count) problems.push('media lost or duplicated')

  pages.forEach((page, k) => {
    const photos = page.items.filter((i) => i.kind === 'MEDIA')
    const tapes = page.items.filter((i) => i.kind === 'TAPE')
    const stickers = page.items.filter((i) => i.kind === 'STICKER')

    if (count > 1 && (photos.length < 2 || photos.length > 4)) tag(page, `${photos.length} photos on a page`)
    if (k % 2 === 1 && Math.abs(mediaCount(pages[k - 1]) - photos.length) > 1) tag(page, 'spread is unbalanced')

    const shapes = photos.map((p) => shapesOf(p, aspects))
    shapes.forEach((s, i) => {
      const b = s.box
      if (b.minX < BOUNDS.minX || b.maxX > BOUNDS.maxX || b.minY < BOUNDS.minY || b.maxY > BOUNDS.maxY) {
        tag(page, `photo ${i} leaves the page area ${JSON.stringify(b)}`)
      }
    })

    // z-order: higher zIndex lies on top
    const order = photos.map((p, i) => ({ i, z: p.zIndex })).sort((a, b) => a.z - b.z)
    for (let a = 0; a < order.length; a++) {
      const lower = shapes[order[a].i]
      for (let b = a + 1; b < order.length; b++) {
        const upper = shapes[order[b].i]
        if (intersectionArea(upper.frame, lower.caption) > 0.5) tag(page, 'a caption is covered')
        if (intersectionArea(upper.frame, lower.image) > area(lower.image) * MAX_IMAGE_COVER + 1e-6) {
          tag(page, 'more than 15% of a picture is covered')
        }
      }
    }

    for (const t of tapes) {
      const poly = tapePoly(t)
      const box = boxOf(poly)
      if (box.minX < BOUNDS.minX || box.maxX > BOUNDS.maxX || box.minY < BOUNDS.minY || box.maxY > BOUNDS.maxY) {
        tag(page, 'tape leaves the page area')
      }
      shapes.forEach((s) => {
        if (intersectionArea(poly, s.image) > 0.5) tag(page, 'tape touches a picture')
        if (intersectionArea(poly, s.caption) > 0.5) tag(page, 'tape covers a caption')
      })
    }

    for (const st of stickers) {
      const poly = stickerPoly(st)
      const box = boxOf(poly)
      if (box.minX < BOUNDS.minX || box.maxX > BOUNDS.maxX || box.minY < BOUNDS.minY || box.maxY > BOUNDS.maxY) {
        tag(page, 'sticker leaves the page area')
      }
      shapes.forEach((s) => {
        if (boxesOverlap(box, s.box)) tag(page, 'sticker overlaps a photo bounding box')
      })
      tapes.forEach((t) => {
        if (boxesOverlap(box, boxOf(tapePoly(t)))) tag(page, 'sticker overlaps tape')
      })
    }
  })
  return problems
}

describe('autoLayout', () => {
  it('keeps every rule for 1-40 photos of mixed aspect ratios across 50 seeds', () => {
    const failures: string[] = []
    for (let count = 1; count <= 40; count++) {
      for (let seed = 0; seed < 50; seed++) {
        const { media, aspects } = makeMedia(count, seed)
        const pages = autoLayout(media, `album-${seed}`, aspects)
        for (const problem of violations(pages, aspects, count)) {
          failures.push(`n=${count} seed=${seed} ${problem}`)
          if (failures.length > 15) break
        }
        if (failures.length > 15) break
      }
      if (failures.length > 15) break
    }
    expect(failures).toEqual([])
  })

  it('also holds when no aspect ratio is known yet (defaults to 9:16)', () => {
    const failures: string[] = []
    for (let count = 1; count <= 40; count++) {
      for (let seed = 0; seed < 20; seed++) {
        const media = Array.from({ length: count }, (_, i) => ({ id: `u${seed}-${i}` }))
        failures.push(...violations(autoLayout(media, `seed-${seed}`), {}, count).map((p) => `n=${count} ${p}`))
      }
    }
    expect(failures.slice(0, 10)).toEqual([])
  })

  it('is deterministic', () => {
    const { media, aspects } = makeMedia(23, 5)
    expect(JSON.stringify(autoLayout(media, 'same', aspects))).toBe(JSON.stringify(autoLayout(media, 'same', aspects)))
    expect(JSON.stringify(autoLayout(media, 'same', aspects))).not.toBe(JSON.stringify(autoLayout(media, 'other', aspects)))
  })

  it('page sizes are 2-4 and neighbouring pages differ by at most one', () => {
    for (let count = 2; count <= 120; count++) {
      for (let seed = 0; seed < 10; seed++) {
        const sizes = pageSizes(count, `s${seed}`)
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(count)
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2)
        expect(Math.max(...sizes)).toBeLessThanOrEqual(4)
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
      }
    }
    expect(pageSizes(1, 'x')).toEqual([1])
    expect(pageSizes(0, 'x')).toEqual([])
  })

  it('uses roughly the requested widths (shrinks only when needed to avoid covering photos)', () => {
    let pagesTotal = 0
    let shrunk = 0
    for (let count = 1; count <= 40; count++) {
      for (let seed = 0; seed < 50; seed++) {
        const { media, aspects } = makeMedia(count, seed)
        for (const page of autoLayout(media, `w-${seed}`, aspects)) {
          const photos = page.items.filter((i) => i.kind === 'MEDIA')
          const n = photos.length
          const [lo, hi] = n === 1 ? [520, 520] : n === 2 ? [400, 400] : [300, 340]
          for (const p of photos) {
            expect(p.width).toBeLessThanOrEqual(hi * 1.08 + 1e-6)
            pagesTotal++
            if (p.width < lo * 0.92 - 1e-6) shrunk++
          }
        }
      }
    }
    // widths are only reduced for crowded pages of tall photos
    expect(shrunk / pagesTotal).toBeLessThan(0.35)
  })

  it('does not move a photo when only another page changes', () => {
    const { media, aspects } = makeMedia(12, 2)
    const a = autoLayout(media, 'stable', aspects)
    const changed = { ...aspects, [media[11].id]: 16 / 9 }
    const b = autoLayout(media, 'stable', changed)
    expect(JSON.stringify(a[0])).toBe(JSON.stringify(b[0]))
  })
})

describe('shapes', () => {
  it('rotates rectangles and computes overlaps', () => {
    const upright = polaroidShapes({ x: 100, y: 100, width: 200, rotation: 0 }, 1)
    const turned = polaroidShapes({ x: 100, y: 100, width: 200, rotation: 90 }, 1)
    const w = upright.box.maxX - upright.box.minX
    const h = upright.box.maxY - upright.box.minY
    expect(turned.box.maxX - turned.box.minX).toBeCloseTo(h, 5)
    expect(turned.box.maxY - turned.box.minY).toBeCloseTo(w, 5)

    const a = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
    const b = [{ x: 5, y: 5 }, { x: 15, y: 5 }, { x: 15, y: 15 }, { x: 5, y: 15 }]
    expect(intersectionArea(a, b)).toBeCloseTo(25, 5)
    expect(intersectionArea(a, [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }, { x: 20, y: 30 }])).toBe(0)
  })
})
