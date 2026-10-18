import { FRAME_TOP, TAPE_ASPECT, clampAspect, polaroidSize, type Metrics } from './geometry'
import type { Decor } from './autoLayout'
import { createRng } from './prng'
import { boxInside, boxOf, boxesOverlap, intersectionArea, polaroidShapes, stickerPoly, tapePoly, toPage, type Box } from './shapes'
import type { PageItem } from './types'

/**
 * Compositions of the exports (Instagram story / post, the polaroid image, WhatsApp stickers). Pure and deterministic per
 * media id, like the page layouts: the same photo always gets the same tilt, tape and stickers. Units are output pixels at
 * scale 1 (a story is 1080 x 1920 of them). The drawing itself is the site's: these items go through the same PageCanvas /
 * LivingPhoto / ThemeTape / ThemeSticker as an album page.
 */

/** Text rules for exports: design sizes (1 unit = 1 px, so the screen minimums never kick in). */
export const EXPORT_METRICS: Metrics = { scale: 1, compact: false }

export type SceneLayout = {
  width: number
  height: number
  items: PageItem[]
  /** the polaroid: centre, size and rotation (the watermark and the visual tests use it) */
  polaroid: { x: number; y: number; width: number; height: number; rotation: number }
}

export const STORY = { width: 1080, height: 1920, safeTop: 250, safeBottom: 250, side: 70 }
export const POST = { width: 1080, height: 1350, safeTop: 80, safeBottom: 80, side: 70 }
type Frame = typeof STORY

/** Largest frame width whose rotated polaroid fits into maxW x maxH. */
function fitWidth(aspect: number, rotation: number, maxW: number, maxH: number, m: Metrics): number {
  let lo = 40
  let hi = Math.max(lo, maxW)
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    const box = polaroidShapes({ x: 0, y: 0, width: mid, rotation }, aspect, m).box
    if (box.maxX - box.minX <= maxW && box.maxY - box.minY <= maxH) lo = mid
    else hi = mid
  }
  return lo
}

/**
 * Story / post: the page background of the media's page theme, the polaroid slightly tilted in the middle of the safe area,
 * one fastener of the theme on its top edge and 1-3 of the theme's stickers in empty space, never on the photo. Nothing goes
 * into the top and bottom strips Instagram covers with its own controls.
 */
export function storyLayout(mediaId: string, aspectIn: number | undefined, format: 'story' | 'post', decor: Decor, m: Metrics = EXPORT_METRICS): SceneLayout {
  // as large as possible, but small enough that at least one sticker finds an empty spot
  let layout: SceneLayout | null = null
  for (const share of [0.8, 0.75, 0.7, 0.65, 0.6, 0.55]) {
    layout = storyAt(mediaId, aspectIn, format, decor, m, share)
    if (decor.stickers.length === 0 || layout.items.some((i) => i.kind === 'STICKER')) return layout
  }
  return layout as SceneLayout
}

function storyAt(mediaId: string, aspectIn: number | undefined, format: 'story' | 'post', decor: Decor, m: Metrics, share: number): SceneLayout {
  const f: Frame = format === 'story' ? STORY : POST
  const aspect = clampAspect(aspectIn)
  const rng = createRng(`${mediaId}:export:${format}`)
  const sign = rng.next() < 0.5 ? -1 : 1
  const rotation = sign * rng.range(1.5, 4)
  const usable: Box = { minX: f.side, minY: f.safeTop, maxX: f.width - f.side, maxY: f.height - f.safeBottom }
  const uw = usable.maxX - usable.minX
  const uh = usable.maxY - usable.minY
  // leave room for the tape above and for stickers around it
  const width = fitWidth(aspect, rotation, uw * share, (uh - 70) * share, m)
  const { height } = polaroidSize(width, aspect, m)
  const x = f.width / 2
  const y = usable.minY + 35 + (uh - 35) / 2
  const polaroid = { x, y, width, height, rotation }
  const items: PageItem[] = [{ id: `${mediaId}:photo`, kind: 'MEDIA', mediaId, x, y, width, rotation, zIndex: 10 }]
  const shapes = polaroidShapes({ x, y, width, rotation }, aspect, m)

  const tape = decor.tapes.length > 0 ? placeTape(polaroid, aspect, rng, m) : null
  const occupied: Box[] = [shapes.box]
  if (tape) {
    items.push({ id: `${mediaId}:tape`, kind: 'TAPE', x: tape.x, y: tape.y, width: tape.width, rotation: tape.rotation, zIndex: 20, variant: rng.pick(decor.tapes) })
    occupied.push(boxOf(tapePoly(tape)))
  }
  const wanted = decor.stickers.length === 0 ? 0 : 1 + Math.floor(rng.next() * 3)
  for (let s = 0; s < wanted; s++) {
    const sticker = placeSticker(usable, occupied, rng, format === 'story' ? [110, 160] : [90, 130])
    if (!sticker) break
    occupied.push(boxOf(stickerPoly(sticker)))
    items.push({ id: `${mediaId}:sticker${s}`, kind: 'STICKER', ...sticker, zIndex: 30 + s, variant: rng.pick(decor.stickers) })
  }
  return { width: f.width, height: f.height, items, polaroid }
}

function placeTape(p: SceneLayout['polaroid'], aspect: number, rng: ReturnType<typeof createRng>, m: Metrics) {
  const shapes = polaroidShapes(p, aspect, m)
  for (let attempt = 0; attempt < 8; attempt++) {
    const width = p.width * rng.range(0.26, 0.32)
    const relative = rng.range(-5, 5)
    const rad = (Math.abs(relative) * Math.PI) / 180
    const thickness = width / TAPE_ASPECT
    const reach = (thickness / 2) * Math.cos(rad) + (width / 2) * Math.sin(rad)
    const local = { x: rng.range(-0.15, 0.15) * p.width, y: -p.height / 2 + p.width * FRAME_TOP - reach - 1 }
    const centre = toPage(p, local)
    const item = { x: centre.x, y: centre.y, width, rotation: p.rotation + relative }
    const poly = tapePoly(item)
    if (intersectionArea(poly, shapes.image) <= 0.5 && intersectionArea(poly, shapes.caption) <= 0.5) return item
  }
  return null
}

function placeSticker(area: Box, occupied: Box[], rng: ReturnType<typeof createRng>, size: [number, number]) {
  const padded = occupied.map((b) => ({ minX: b.minX - 14, minY: b.minY - 14, maxX: b.maxX + 14, maxY: b.maxY + 14 }))
  for (let attempt = 0; attempt < 120; attempt++) {
    const width = rng.range(size[0], size[1])
    const item = {
      x: rng.range(area.minX + width / 2, area.maxX - width / 2),
      y: rng.range(area.minY + width / 2, area.maxY - width / 2),
      width,
      rotation: rng.range(-20, 20),
    }
    const box = boxOf(stickerPoly(item))
    if (boxInside(box, area) && !padded.some((o) => boxesOverlap(o, box))) return item
  }
  return null
}

/** Long edge of the polaroid image export. */
export const POLAROID_LONG_EDGE = 2000
/** Long edge of the moving polaroid (MP4): the size Instagram uses, and a third of the memory ffmpeg needs at 2000 px. */
export const POLAROID_VIDEO_LONG_EDGE = 1080

/**
 * The polaroid on its own, never rotated. Transparent: a thin margin for the soft shadow. Page background: the polaroid lies
 * on the theme's paper with a wider margin. Either way the image's long edge is exactly 2000 px.
 */
export function polaroidLayout(mediaId: string, aspectIn: number | undefined, background: 'transparent' | 'page', m: Metrics = EXPORT_METRICS,
  longEdge: number = POLAROID_LONG_EDGE): SceneLayout {
  const aspect = clampAspect(aspectIn)
  const margin = background === 'page' ? 0.09 : 0.025
  const size = (w: number) => {
    const { height } = polaroidSize(w, aspect, m)
    const pad = w * margin
    return { w: w + 2 * pad, h: height + 2 * pad, height, pad }
  }
  let lo = 100
  let hi = longEdge
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2
    const s = size(mid)
    if (Math.max(s.w, s.h) <= longEdge) lo = mid
    else hi = mid
  }
  const width = lo
  const s = size(width)
  // the long side is exactly longEdge, the other one rounded to an even number (H.264 needs even sizes for the video)
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2)
  const W = s.w >= s.h ? longEdge : even(s.w)
  const H = s.h > s.w ? longEdge : even(s.h)
  const x = W / 2
  const y = H / 2
  return {
    width: W,
    height: H,
    items: [{ id: `${mediaId}:photo`, kind: 'MEDIA', mediaId, x, y, width, rotation: 0, zIndex: 10 }],
    polaroid: { x, y, width, height: s.height, rotation: 0 },
  }
}

export const STICKER_SIZE = 512
export const STICKER_MARGIN = 16

/** A WhatsApp sticker: the polaroid with its caption, slightly tilted, at least 16 px of empty margin on every side. */
export function stickerLayout(mediaId: string, aspectIn: number | undefined, m: Metrics = EXPORT_METRICS): SceneLayout {
  const aspect = clampAspect(aspectIn)
  const rng = createRng(`${mediaId}:sticker`)
  const rotation = (rng.next() < 0.5 ? -1 : 1) * rng.range(3, 6)
  // the soft shadow reaches a few px beyond the frame: keep it inside the margin too
  const inner = STICKER_SIZE - 2 * (STICKER_MARGIN + 6)
  const width = fitWidth(aspect, rotation, inner, inner, m)
  const { height } = polaroidSize(width, aspect, m)
  const x = STICKER_SIZE / 2
  const y = STICKER_SIZE / 2
  return {
    width: STICKER_SIZE,
    height: STICKER_SIZE,
    items: [{ id: `${mediaId}:photo`, kind: 'MEDIA', mediaId, x, y, width, rotation, zIndex: 10 }],
    polaroid: { x, y, width, height, rotation },
  }
}

/** Carousel: an album page (1000 x 1400) fitted into 1080 x 1350 with a margin of the album's cover around it. */
export const CAROUSEL = { width: 1080, height: 1350, margin: 60 }
export function carouselPageScale(): number {
  return Math.min((CAROUSEL.width - 2 * CAROUSEL.margin) / 1000, (CAROUSEL.height - 2 * CAROUSEL.margin) / 1400)
}
