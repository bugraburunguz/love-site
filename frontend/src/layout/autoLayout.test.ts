import { describe, expect, it } from 'vitest'
import { autoLayout, fillRatio, pageSizes } from './autoLayout'
import {
  BOUNDS, DEFAULT_ASPECT, captionFontSize, dateFontSize, frameBottom, polaroidSize,
} from './geometry'
import { area, boxOf, boxesOverlap, intersectionArea, polaroidShapes, stickerPoly, tapePoly } from './shapes'
import type { PageItem, PageLayout } from './types'

const ASPECTS = [9 / 16, 3 / 4, 16 / 9, 1]
/** The rule from the brief, deliberately not imported from the generator. */
const MAX_IMAGE_COVER = 0.15
/** Pages aim for 55% fill; no page may fall below this hard floor (a lone landscape photo cannot physically do better). */
const MIN_FILL = 0.45
const TARGET_FILL = 0.55
/** Scale of a page on a 1440x900 desktop screen (the book fits a 1000x1400 page into roughly 530 px of width). */
const DESKTOP_SCALE = 0.53

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

    // From 4 photos on every page holds 2-4; with 2 or 3 photos the pages hold 1 or 2.
    const [min, max] = count >= 4 ? [2, 4] : [1, 2]
    if (count > 1 && (photos.length < min || photos.length > max)) tag(page, `${photos.length} photos on a page`)
    // every spread has two pages, both filled, differing by at most one photo
    if (count > 1) {
      if (pages.length % 2 !== 0) tag(page, 'odd number of pages')
      if (k % 2 === 1) {
        const left = mediaCount(pages[k - 1])
        if (left === 0 || photos.length === 0) tag(page, 'a page of the spread is empty')
        if (Math.abs(left - photos.length) > 1) tag(page, 'spread is unbalanced')
      }
    }

    const shapes = photos.map((p) => shapesOf(p, aspects))
    shapes.forEach((s, i) => {
      const b = s.box
      if (b.minX < BOUNDS.minX || b.maxX > BOUNDS.maxX || b.minY < BOUNDS.minY || b.maxY > BOUNDS.maxY) {
        tag(page, `photo ${i} leaves the page area ${JSON.stringify(b)}`)
      }
    })

    if (photos.length > 0 && fillRatio(shapes.map((sh) => sh.box)) < MIN_FILL) {
      tag(page, `page is only ${Math.round(fillRatio(shapes.map((sh) => sh.box)) * 100)}% filled`)
    }

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

  it('page counts are even, every spread is full and balanced, and an even page count always exists', () => {
    for (let count = 2; count <= 160; count++) {
      for (let seed = 0; seed < 10; seed++) {
        const sizes = pageSizes(count, `s${seed}`)
        expect(sizes.reduce((a, b) => a + b, 0)).toBe(count)
        expect(sizes.length % 2).toBe(0)
        // no page is empty, so both pages of every spread are filled
        expect(Math.min(...sizes)).toBeGreaterThanOrEqual(1)
        expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
        if (count >= 4) {
          expect(Math.min(...sizes)).toBeGreaterThanOrEqual(2)
          expect(Math.max(...sizes)).toBeLessThanOrEqual(4)
        }
        for (let k = 0; k < sizes.length; k += 2) {
          expect(sizes[k]).toBeGreaterThan(0)
          expect(Math.abs(sizes[k] - sizes[k + 1])).toBeLessThanOrEqual(1)
        }
      }
    }
    // the examples from the brief
    expect(pageSizes(4, 'x')).toEqual([2, 2])
    expect([...pageSizes(5, 'x')].sort()).toEqual([2, 3])
    expect(pageSizes(9, 'x').length).toBe(4)
    expect(pageSizes(2, 'x')).toEqual([1, 1])
    expect(pageSizes(1, 'x')).toEqual([1])
    expect(pageSizes(0, 'x')).toEqual([])
  })

  it('treats a half-empty spread as an error', () => {
    const aspects = {}
    const full = autoLayout([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], 'x', aspects)
    expect(violations(full, aspects, 4)).toEqual([])
    // drop the second page's photos: the spread now has one empty page
    const broken = [full[0], { ...full[1], items: [] }]
    expect(violations(broken, aspects, 4).join('|')).toMatch(/spread is empty|a page of the spread is empty/)
    // a single page for several photos is an odd page count
    const odd = [{ pageIndex: 0, items: full.flatMap((p) => p.items) }]
    expect(violations(odd, aspects, 4).join('|')).toMatch(/odd number of pages/)
  })

  it('uses the requested widths and fills the page (growing or shrinking only when the rules demand it)', () => {
    const ranges: Record<number, [number, number]> = { 1: [520, 520], 2: [420, 460], 3: [360, 400], 4: [300, 340] }
    let photos = 0
    let shrunk = 0
    let pages = 0
    let filled = 0
    const byCount: Record<number, number[]> = {}
    for (let count = 1; count <= 40; count++) {
      for (let seed = 0; seed < 50; seed++) {
        const { media, aspects } = makeMedia(count, seed)
        for (const page of autoLayout(media, `w-${seed}`, aspects)) {
          const items = page.items.filter((i) => i.kind === 'MEDIA')
          const [lo] = ranges[items.length]
          const fill = fillRatio(items.map((p) => shapesOf(p, aspects).box))
          ;(byCount[items.length] ??= []).push(fill)
          pages++
          if (fill >= TARGET_FILL) filled++
          for (const p of items) {
            photos++
            if (p.width < lo - 1e-6) shrunk++
          }
        }
      }
    }
    // the brief's ranges are respected unless a crowded page of tall photos has to shrink them
    expect(shrunk / photos).toBeLessThan(0.15)
    // 55% fill: reached by the vast majority of pages
    expect(filled / pages).toBeGreaterThan(0.95)
    for (const [n, fills] of Object.entries(byCount)) {
      expect(Math.min(...fills), `pages with ${n} photos`).toBeGreaterThanOrEqual(MIN_FILL)
    }
  })

  it('caption and date text stay readable on a desktop screen', () => {
    for (let width = 250; width <= 700; width += 10) {
      // page units (the brief: caption >= 22, date >= 16)
      expect(captionFontSize(width)).toBeGreaterThanOrEqual(22)
      expect(dateFontSize(width)).toBeGreaterThanOrEqual(16)
      // on a 1440x900 screen one page unit is ~0.53 px: about 12 px
      expect(captionFontSize(width) * DESKTOP_SCALE).toBeGreaterThanOrEqual(12)
      expect(dateFontSize(width) * DESKTOP_SCALE).toBeGreaterThanOrEqual(11.5)
      // two caption lines plus the date fit in the strip under the picture
      const needed = captionFontSize(width) * 1.05 * 2 + dateFontSize(width) * 1.3
      expect(frameBottom(width)).toBeGreaterThanOrEqual(needed)
      expect(polaroidSize(width, 9 / 16).height).toBeGreaterThan(frameBottom(width))
    }
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
