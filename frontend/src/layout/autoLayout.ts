import { BOUNDS, DESKTOP_METRICS, FRAME_TOP, TAPE_ASPECT, clampAspect, polaroidSize, type Metrics } from './geometry'
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
/** Wider cell overlap when photos are enlarged to fill a sparse page. */
const GROW_SLACK = 110
/** Share of the usable page area the polaroids' bounding boxes should add up to. */
export const TARGET_FILL = 0.55
const GROW_STEPS = [1.04, 1.08, 1.12, 1.17, 1.22, 1.28, 1.35, 1.42, 1.5, 1.6, 1.7, 1.8, 1.95, 2.1, 2.3]
const SHRINK_STEPS = [1, 0.97, 0.94, 0.91, 0.88, 0.85, 0.82, 0.79, 0.76, 0.72, 0.68, 0.64, 0.6, 0.55, 0.5, 0.45, 0.4]
const ATTEMPTS = 24
/** Growing a page is a search for the largest scale that still obeys every rule, so it tries harder. */
const GROW_ATTEMPTS = 80

type Rect = { x0: number; y0: number; x1: number; y1: number }
type Spec = { id: string; aspect: number; baseWidth: number; rotation: number; tape: boolean }
type Placement = { spec: Spec; x: number; y: number; width: number; shapes: PolaroidShapes }

/**
 * An album of 2 or more photos always has an EVEN number of pages, so every spread has two filled pages, and pages are
 * filled evenly (neighbours differ by at most one photo). From 4 photos on every page holds 2-4; with 2 or 3 photos the
 * pages hold 1+1 and 2+1. A single photo gets one page.
 */
export function pageSizes(count: number, seed: string): number[] {
  if (count <= 0) return []
  if (count === 1) return [1]
  if (count === 2) return [1, 1]
  if (count === 3) return createRng(`${seed}:pages`).next() < 0.5 ? [2, 1] : [1, 2]

  const rng = createRng(`${seed}:pages`)
  const minPages = Math.ceil(count / MAX_PER_PAGE)
  const maxPages = Math.floor(count / MIN_PER_PAGE)
  const choices: number[] = []
  for (let p = minPages; p <= maxPages; p++) if (p % 2 === 0) choices.push(p)
  // choices is never empty for count >= 4 (checked by the tests); prefer the page count nearest to ~3 photos per page
  const wanted = count / rng.range(2.6, 3.6)
  const pages = choices.reduce((best, p) => (Math.abs(p - wanted) < Math.abs(best - wanted) ? p : best), choices[0])

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

/** Frame widths by photos on the page (page units). */
export const WIDTH_RANGES: Record<number, [number, number]> = {
  1: [520, 520],
  2: [420, 460],
  3: [360, 400],
  4: [300, 340],
}

function targetWidth(n: number, rng: Rng): number {
  const [lo, hi] = WIDTH_RANGES[Math.min(n, 4)]
  return hi > lo ? rng.range(lo, hi) : lo
}

function cellsFor(n: number, arrangement: number, slack: number): Rect[] {
  const { minX, maxX, minY, maxY } = BOUNDS
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  const full: Rect = { x0: minX, y0: minY, x1: maxX, y1: maxY }
  const left: Rect = { x0: minX, y0: minY, x1: midX + slack, y1: maxY }
  const right: Rect = { x0: midX - slack, y0: minY, x1: maxX, y1: maxY }
  const top: Rect = { x0: minX, y0: minY, x1: maxX, y1: midY + slack }
  const bottom: Rect = { x0: minX, y0: midY - slack, x1: maxX, y1: maxY }
  const quarter = (col: 0 | 1, row: 0 | 1): Rect => ({
    x0: col === 0 ? minX : midX - slack,
    x1: col === 0 ? midX + slack : maxX,
    y0: row === 0 ? minY : midY - slack,
    y1: row === 0 ? midY + slack : maxY,
  })
  if (n === 1) return [full]
  if (n === 2) return arrangement === 0 ? [left, right] : [top, bottom]
  if (n === 3) {
    if (arrangement === 0) return [top, quarter(0, 1), quarter(1, 1)]
    if (arrangement === 1) return [quarter(0, 0), quarter(1, 0), bottom]
    const third = (maxX - minX) / 3
    return [0, 1, 2].map((i) => ({ x0: minX + i * third - slack, y0: minY, x1: minX + (i + 1) * third + slack, y1: maxY }))
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

function tryPlace(specs: Spec[], scale: number, arrangement: number, rng: Rng, m: Metrics, slack = SLACK): Placement[] | null {
  const cells = cellsFor(specs.length, arrangement, slack)
  const placed: Placement[] = []
  specs.forEach((spec, i) => {
    const width = spec.baseWidth * scale
    const half = polaroidShapes({ x: 0, y: 0, width, rotation: spec.rotation }, spec.aspect, m).box
    const cell = cells[i]
    const bounds = boundsFor(spec)
    const pick = (lo: number, hi: number) => (hi > lo ? rng.range(lo, hi) : (lo + hi) / 2)
    const xLo = Math.max(cell.x0 + half.maxX, bounds.minX + half.maxX)
    const xHi = Math.min(cell.x1 - half.maxX, bounds.maxX - half.maxX)
    const yLo = Math.max(cell.y0 + half.maxY, bounds.minY + half.maxY)
    const yHi = Math.min(cell.y1 - half.maxY, bounds.maxY - half.maxY)
    const x = Math.min(bounds.maxX - half.maxX, Math.max(bounds.minX + half.maxX, pick(xLo, xHi)))
    const y = Math.min(bounds.maxY - half.maxY, Math.max(bounds.minY + half.maxY, pick(yLo, yHi)))
    placed.push({ spec, x, y, width, shapes: polaroidShapes({ x, y, width, rotation: spec.rotation }, spec.aspect, m) })
  })
  return placementOk(placed) ? placed : null
}

const USABLE_AREA = (BOUNDS.maxX - BOUNDS.minX) * (BOUNDS.maxY - BOUNDS.minY)

/** Sum of the polaroids' (rotated) bounding-box areas relative to the usable page area. */
export function fillRatio(boxes: Box[]): number {
  return boxes.reduce((sum, b) => sum + (b.maxX - b.minX) * (b.maxY - b.minY), 0) / USABLE_AREA
}

function placePage(specs: Spec[], rng: Rng, m: Metrics): Placement[] {
  const arrangements = arrangementCount(specs.length)
  const order = [...Array(arrangements).keys()]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const attemptAt = (scale: number): Placement[] | null => {
    for (const arrangement of order) {
      for (let attempt = 0; attempt < (scale > 1 ? GROW_ATTEMPTS : ATTEMPTS); attempt++) {
        const result = tryPlace(specs, scale, arrangement, rng, m, scale > 1 ? GROW_SLACK : SLACK)
        if (result) return result
      }
    }
    return null
  }
  const fill = (placed: Placement[]) => fillRatio(placed.map((p) => p.shapes.box))

  const natural = attemptAt(1)
  if (natural) {
    if (fill(natural) >= TARGET_FILL) return natural
    // Too empty (typically wide photos): grow the photos just enough, as long as the rules still hold.
    let best = natural
    for (const scale of GROW_STEPS) {
      const bigger = attemptAt(scale)
      if (!bigger) continue
      if (fill(bigger) > fill(best)) best = bigger
      if (fill(best) >= TARGET_FILL) break
    }
    return best
  }
  for (const scale of SHRINK_STEPS.slice(1)) {
    const result = attemptAt(scale)
    if (result) return result
  }
  // Unreachable in practice (the smallest scale always fits); keep the page usable regardless.
  return tryPlace(specs, SHRINK_STEPS[SHRINK_STEPS.length - 1], 0, rng, m) ?? []
}

type TapePlacement = { x: number; y: number; width: number; rotation: number }

/** Tape straddles the top edge of the polaroid frame and never reaches down into the picture. */
function placeTape(target: Placement, all: Placement[], rng: Rng, m: Metrics): TapePlacement | null {
  const { height } = polaroidSize(target.width, target.spec.aspect, m)
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

type MediaRef = { id: string; /** layout item id; defaults to `${id}:photo` */ itemId?: string }

/**
 * Builds one page from the given media (1-4). `pageSeed` drives the page-level choices (arrangement, sticker) and
 * `mediaSeed` the per-photo ones (tilt, size, tape); they are separate so legacy album-wide layouts keep their results.
 */
function buildPage(
  media: ReadonlyArray<MediaRef>,
  pageSeed: string,
  mediaSeed: string,
  aspects: Readonly<Record<string, number>>,
  metrics: Metrics,
  pageIndex: number,
): PageLayout {
  const size = media.length
  const rng = createRng(pageSeed)
  const specs: Spec[] = media.map((m) => {
    // randomness per media id: a photo keeps its tilt, tape and size wherever it lands
    const own = createRng(`${mediaSeed}:${m.id}`)
    return {
      id: m.id,
      aspect: clampAspect(aspects[m.id]),
      rotation: own.range(-7, 7),
      baseWidth: targetWidth(size, own),
      tape: own.next() < 0.4,
    }
  })

  const placements = placePage(specs, rng, metrics)
  const items = decorate(placements, media, mediaSeed, rng, metrics, pageIndex)
  return { pageIndex, items }
}

/** Photos as page items plus the deterministic tape and (sometimes) one sticker. */
function decorate(
  placements: Placement[],
  media: ReadonlyArray<MediaRef>,
  mediaSeed: string,
  rng: Rng,
  metrics: Metrics,
  pageIndex: number,
): PageItem[] {
  const items: PageItem[] = placements.map((p, i) => ({
    id: media.find((m) => m.id === p.spec.id)?.itemId ?? `${p.spec.id}:photo`,
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
    const tape = placeTape(p, placements, createRng(`${mediaSeed}:${p.spec.id}:tape`), metrics)
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
      variant: createRng(`${mediaSeed}:${p.spec.id}:tapecolour`).pick(TAPES),
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
  return items
}

/**
 * Pure and deterministic: the same media list, seed and aspect ratios always give the same pages.
 *
 * Only used to decide the FIRST distribution of an album that has no stored pages yet (it is sent to the server once);
 * afterwards the database decides which media is on which page and `layoutAutoPage` / `layoutFeaturedPage` only place
 * the photos of one page.
 *
 * `metrics` (page scale on this screen, narrow or not) decides how tall the caption strip must be for readable text.
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
  metrics: Metrics = DESKTOP_METRICS,
): PageLayout[] {
  const pages: PageLayout[] = []
  let cursor = 0
  pageSizes(media.length, seed).forEach((size, pageIndex) => {
    const slice = media.slice(cursor, cursor + size)
    cursor += size
    pages.push(buildPage(slice, `${seed}:page:${pageIndex}`, seed, aspects, metrics, pageIndex))
  })
  return pages
}

/** Splits an album's media (in order) into the pages `autoLayout` would make; the payload of the one-time initialization. */
export function initialDistribution<T extends { id: string }>(media: ReadonlyArray<T>, seed: string): T[][] {
  const result: T[][] = []
  let cursor = 0
  for (const size of pageSizes(media.length, seed)) {
    result.push(media.slice(cursor, cursor + size))
    cursor += size
  }
  return result
}

/** AUTO template: 1-4 photos in slot order, positions computed here, deterministic per page id and media id. */
export function layoutAutoPage(
  media: ReadonlyArray<MediaRef>,
  pageId: string,
  aspects: Readonly<Record<string, number>>,
  metrics: Metrics = DESKTOP_METRICS,
  pageIndex = 0,
): PageLayout {
  return buildPage(media.slice(0, MAX_PER_PAGE), `${pageId}:page`, pageId, aspects, metrics, pageIndex)
}

/**
 * FEATURED template: one photo as large as the page area allows, centred, with a slight tilt; tape and sticker rules
 * are the same as on AUTO pages.
 */
export function layoutFeaturedPage(
  media: MediaRef | undefined,
  pageId: string,
  aspects: Readonly<Record<string, number>>,
  metrics: Metrics = DESKTOP_METRICS,
  pageIndex = 0,
): PageLayout {
  if (!media) return { pageIndex, items: [] }
  const own = createRng(`${pageId}:${media.id}`)
  const aspect = clampAspect(aspects[media.id])
  const rotation = own.range(-2.5, 2.5)
  const spec: Spec = { id: media.id, aspect, baseWidth: 0, rotation, tape: own.next() < 0.5 }
  const bounds = boundsFor(spec)
  const centre = { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }

  const fits = (width: number) =>
    boxInside(polaroidShapes({ ...centre, width, rotation }, aspect, metrics).box, bounds)
  let lo = 120
  let hi = BOUNDS.maxX - BOUNDS.minX
  if (fits(hi)) lo = hi
  else for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  const width = lo
  spec.baseWidth = width
  const placement: Placement = {
    spec, x: centre.x, y: centre.y, width,
    shapes: polaroidShapes({ ...centre, width, rotation }, aspect, metrics),
  }
  const rng = createRng(`${pageId}:page`)
  return { pageIndex, items: decorate([placement], [media], pageId, rng, metrics, pageIndex) }
}
