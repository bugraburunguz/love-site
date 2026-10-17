import { BOUNDS, FRAME_TOP, TAPE_ASPECT, clampAspect, polaroidSize } from './geometry'
import { createRng, type Rng } from './prng'
import {
  boxInside, boxOf, boxesOverlap, intersectionArea, area, polaroidShapes, stickerPoly, tapePoly, toPage,
  type Box, type PolaroidShapes,
} from './shapes'
import type { PageItem, PageLayout } from './types'

/** An item may hide at most this share of another item's picture area, and none of its caption strip. */
export const MAX_IMAGE_COVER = 0.15
/** Tolerance (page units squared) for "zero" overlap. */
const EPS_AREA = 0.5

const MIN_PER_PAGE = 2
const MAX_PER_PAGE = 4
const TAPE_WIDTH = 120
const TAPE_RESERVE = 40
const SLACK = 40
const SHRINK_STEPS = [1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.6, 0.5, 0.4]
const ATTEMPTS = 14

type Rect = { x0: number; y0: number; x1: number; y1: number }
type Spec = { id: string; aspect: number; baseWidth: number; rotation: number; tape: boolean }
type Placement = { spec: Spec; x: number; y: number; width: number; shapes: PolaroidShapes }

/**
 * Pages hold 2-4 photos (a lone photo only when the album has just one) and pages are filled evenly, so the two
 * pages of a spread never differ by more than one photo.
 */
export function pageSizes(count: number, seed: string): number[] {
  if (count <= 0) return []
  if (count === 1) return [1]
  const rng = createRng(`${seed}:pages`)
  const minPages = Math.ceil(count / MAX_PER_PAGE)
  const maxPages = Math.floor(count / MIN_PER_PAGE)
  const wanted = Math.round(count / rng.range(2.6, 3.6))
  const pages = Math.min(maxPages, Math.max(minPages, wanted))
  const base = Math.floor(count / pages)
  const sizes = new Array<number>(pages).fill(base)
  const order = [...sizes.keys()]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  for (let k = 0; k < count - base * pages; k++) sizes[order[k]]++
  return sizes
}

function targetWidth(n: number, rng: Rng): number {
  const factor = rng.range(0.92, 1.08)
  if (n === 1) return 520 * factor
  if (n === 2) return 400 * factor
  return rng.range(300, 340) * factor
}

function cellsFor(n: number, arrangement: number): Rect[] {
  const { minX, maxX, minY, maxY } = BOUNDS
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  const full: Rect = { x0: minX, y0: minY, x1: maxX, y1: maxY }
  const left: Rect = { x0: minX, y0: minY, x1: midX + SLACK, y1: maxY }
  const right: Rect = { x0: midX - SLACK, y0: minY, x1: maxX, y1: maxY }
  const top: Rect = { x0: minX, y0: minY, x1: maxX, y1: midY + SLACK }
  const bottom: Rect = { x0: minX, y0: midY - SLACK, x1: maxX, y1: maxY }
  const quarter = (col: 0 | 1, row: 0 | 1): Rect => ({
    x0: col === 0 ? minX : midX - SLACK,
    x1: col === 0 ? midX + SLACK : maxX,
    y0: row === 0 ? minY : midY - SLACK,
    y1: row === 0 ? midY + SLACK : maxY,
  })
  if (n === 1) return [full]
  if (n === 2) return arrangement === 0 ? [left, right] : [top, bottom]
  if (n === 3) {
    if (arrangement === 0) return [top, quarter(0, 1), quarter(1, 1)]
    if (arrangement === 1) return [quarter(0, 0), quarter(1, 0), bottom]
    const third = (maxX - minX) / 3
    return [0, 1, 2].map((i) => ({ x0: minX + i * third - SLACK, y0: minY, x1: minX + (i + 1) * third + SLACK, y1: maxY }))
  }
  return [quarter(0, 0), quarter(1, 0), quarter(0, 1), quarter(1, 1)]
}

function arrangementCount(n: number): number {
  return n === 1 ? 1 : n === 2 ? 2 : n === 3 ? 3 : 1
}

function boundsFor(spec: Spec): Box {
  return spec.tape ? { ...BOUNDS, minY: BOUNDS.minY + TAPE_RESERVE } : BOUNDS
}

function placementOk(all: Placement[]): boolean {
  for (const p of all) {
    if (!boxInside(p.shapes.box, boundsFor(p.spec))) return false
  }
  // later items lie on top of earlier ones
  for (let lower = 0; lower < all.length; lower++) {
    const imageArea = area(all[lower].shapes.image)
    for (let upper = lower + 1; upper < all.length; upper++) {
      const frame = all[upper].shapes.frame
      if (intersectionArea(frame, all[lower].shapes.caption) > EPS_AREA) return false
      if (intersectionArea(frame, all[lower].shapes.image) > imageArea * MAX_IMAGE_COVER) return false
    }
  }
  return true
}

function tryPlace(specs: Spec[], scale: number, arrangement: number, rng: Rng): Placement[] | null {
  const cells = cellsFor(specs.length, arrangement)
  const placed: Placement[] = []
  specs.forEach((spec, i) => {
    const width = spec.baseWidth * scale
    const half = polaroidShapes({ x: 0, y: 0, width, rotation: spec.rotation }, spec.aspect).box
    const cell = cells[i]
    const bounds = boundsFor(spec)
    const pick = (lo: number, hi: number) => (hi > lo ? rng.range(lo, hi) : (lo + hi) / 2)
    const xLo = Math.max(cell.x0 + half.maxX, bounds.minX + half.maxX)
    const xHi = Math.min(cell.x1 - half.maxX, bounds.maxX - half.maxX)
    const yLo = Math.max(cell.y0 + half.maxY, bounds.minY + half.maxY)
    const yHi = Math.min(cell.y1 - half.maxY, bounds.maxY - half.maxY)
    const x = Math.min(bounds.maxX - half.maxX, Math.max(bounds.minX + half.maxX, pick(xLo, xHi)))
    const y = Math.min(bounds.maxY - half.maxY, Math.max(bounds.minY + half.maxY, pick(yLo, yHi)))
    placed.push({ spec, x, y, width, shapes: polaroidShapes({ x, y, width, rotation: spec.rotation }, spec.aspect) })
  })
  return placementOk(placed) ? placed : null
}

function placePage(specs: Spec[], rng: Rng): Placement[] {
  const arrangements = arrangementCount(specs.length)
  const order = [...Array(arrangements).keys()]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  for (const scale of SHRINK_STEPS) {
    for (const arrangement of order) {
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        const result = tryPlace(specs, scale, arrangement, rng)
        if (result) return result
      }
    }
  }
  // Unreachable in practice (the smallest scale always fits); keep the page usable regardless.
  return tryPlace(specs, SHRINK_STEPS[SHRINK_STEPS.length - 1], 0, rng) ?? []
}

type TapePlacement = { x: number; y: number; width: number; rotation: number }

/** Tape straddles the top edge of the polaroid frame and never reaches down into the picture. */
function placeTape(target: Placement, all: Placement[], rng: Rng): TapePlacement | null {
  const { height } = polaroidSize(target.width, target.spec.aspect)
  const padTop = target.width * FRAME_TOP
  for (let attempt = 0; attempt < 5; attempt++) {
    const width = TAPE_WIDTH * rng.range(0.9, 1.1)
    const relative = rng.range(-5, 5)
    const rad = (Math.abs(relative) * Math.PI) / 180
    const thickness = width / TAPE_ASPECT
    const reach = (thickness / 2) * Math.cos(rad) + (width / 2) * Math.sin(rad)
    const local = { x: rng.range(-0.2, 0.2) * target.width, y: -height / 2 + padTop - reach - 1 }
    const centre = toPage({ x: target.x, y: target.y, width: target.width, rotation: target.spec.rotation }, local)
    const item = { x: centre.x, y: centre.y, width, rotation: target.spec.rotation + relative }
    const poly = tapePoly(item)
    if (!boxInside(boxOf(poly), BOUNDS)) continue
    const clear = all.every(
      (q) => intersectionArea(poly, q.shapes.image) <= EPS_AREA && intersectionArea(poly, q.shapes.caption) <= EPS_AREA,
    )
    if (clear) return item
  }
  return null
}

/** A sticker goes only where the page is empty: clear of every polaroid and every piece of tape. */
function placeSticker(all: Placement[], tapes: TapePlacement[], rng: Rng): TapePlacement | null {
  const occupied: Box[] = [
    ...all.map((p) => p.shapes.box),
    ...tapes.map((t) => boxOf(tapePoly(t))),
  ].map((b) => ({ minX: b.minX - 12, minY: b.minY - 12, maxX: b.maxX + 12, maxY: b.maxY + 12 }))
  for (let attempt = 0; attempt < 40; attempt++) {
    const width = rng.range(64, 92)
    const item = {
      x: rng.range(BOUNDS.minX + width, BOUNDS.maxX - width),
      y: rng.range(BOUNDS.minY + width, BOUNDS.maxY - width),
      width,
      rotation: rng.range(-22, 22),
    }
    const box = boxOf(stickerPoly(item))
    if (boxInside(box, BOUNDS) && !occupied.some((o) => boxesOverlap(o, box))) return item
  }
  return null
}

const STICKERS = ['heart', 'star', 'sparkle'] as const
const TAPES = ['rose', 'cream', 'gold', 'sage'] as const

/**
 * Pure and deterministic: the same media list, seed and aspect ratios always give the same pages.
 *
 * `aspects` maps media id -> width / height (learned when images load, or from the API); unknown photos are
 * assumed to be 9:16 portraits. Page assignment never depends on aspect ratios, only positions do.
 *
 * Guarantees for every page: all frames (rotated, caption strip included) stay at least 40 units inside the page
 * and above the page-number strip; no photo has more than 15% of its picture hidden and no caption is hidden;
 * tape never touches a picture; stickers sit in empty space.
 */
export function autoLayout(
  media: ReadonlyArray<{ id: string }>,
  seed: string,
  aspects: Readonly<Record<string, number>> = {},
): PageLayout[] {
  const pages: PageLayout[] = []
  let cursor = 0

  pageSizes(media.length, seed).forEach((size, pageIndex) => {
    const rng = createRng(`${seed}:page:${pageIndex}`)
    const specs: Spec[] = []
    for (let i = 0; i < size; i++) {
      const m = media[cursor++]
      // randomness per media id: a photo keeps its tilt, tape and size wherever it lands
      const own = createRng(`${seed}:${m.id}`)
      specs.push({
        id: m.id,
        aspect: clampAspect(aspects[m.id]),
        rotation: own.range(-7, 7),
        baseWidth: targetWidth(size, own),
        tape: own.next() < 0.4,
      })
    }

    const placements = placePage(specs, rng)
    const items: PageItem[] = placements.map((p, i) => ({
      id: `${p.spec.id}:photo`,
      kind: 'MEDIA',
      mediaId: p.spec.id,
      x: p.x,
      y: p.y,
      width: p.width,
      rotation: p.spec.rotation,
      zIndex: 10 + i,
    }))

    const tapes: TapePlacement[] = []
    placements.forEach((p, i) => {
      if (!p.spec.tape) return
      const tape = placeTape(p, placements, createRng(`${seed}:${p.spec.id}:tape`))
      if (!tape) return
      tapes.push(tape)
      items.push({
        id: `${p.spec.id}:tape`,
        kind: 'TAPE',
        x: tape.x,
        y: tape.y,
        width: tape.width,
        rotation: tape.rotation,
        zIndex: 200 + i,
        variant: createRng(`${seed}:${p.spec.id}:tapecolour`).pick(TAPES),
      })
    })

    if (rng.next() < 0.6) {
      const sticker = placeSticker(placements, tapes, rng)
      if (sticker) {
        items.push({
          id: `page${pageIndex}:sticker`,
          kind: 'STICKER',
          x: sticker.x,
          y: sticker.y,
          width: sticker.width,
          rotation: sticker.rotation,
          zIndex: 300,
          variant: rng.pick(STICKERS),
        })
      }
    }

    pages.push({ pageIndex, items })
  })

  return pages
}
