export const PAGE_W = 1000
export const PAGE_H = 1400

/** Nothing on a page may come closer than this to the page edge. */
export const PAGE_MARGIN = 40
/** Strip at the bottom kept free for the printed page number. */
export const NUMBER_RESERVE = 100

/** Area in which every item (rotated bounding box, frame and caption included) must stay. */
export const BOUNDS = {
  minX: PAGE_MARGIN,
  maxX: PAGE_W - PAGE_MARGIN,
  minY: PAGE_MARGIN,
  maxY: PAGE_H - NUMBER_RESERVE,
}

/** Used until the real aspect ratio (width / height) of a photo is known: most photos are 9:16 portrait. */
export const DEFAULT_ASPECT = 9 / 16

const MIN_ASPECT = 0.5
const MAX_ASPECT = 2

/** Polaroid frame proportions, as a fraction of the frame width. */
export const FRAME_SIDE = 0.06
export const FRAME_TOP = 0.06
export const FRAME_BOTTOM = 0.2

/**
 * How a page is shown on this screen. Text must stay readable on small screens, so its size is
 *   max(design size in page units * scale, minimum in screen px)
 * and the strip under the picture is sized from that, which is why the layout needs the metrics too.
 */
export type Metrics = {
  /** screen px per page unit (the Book's single page scale) */
  scale: number
  /** narrow screens: caption is one line with an ellipsis (the full text is in the lightbox) */
  compact: boolean
  /** caption lines to make room for, overriding the compact/regular default (the lightbox shows the full text) */
  lines?: number
}

/** A page on a ~1440x900 desktop screen; used when no metrics are given (tests, tools). */
export const DESKTOP_METRICS: Metrics = { scale: 0.53, compact: false }
/** 1 unit = 1 px (the lightbox). */
export const UNIT_METRICS: Metrics = { scale: 1, compact: false }

/** Smallest text on screen, in px. */
export const MIN_CAPTION_PX = 13
export const MIN_DATE_PX = 10
/** Design sizes in page units (never smaller than these, whatever the screen). */
export const MIN_CAPTION_FONT = 24
export const MIN_DATE_FONT = 22

/** Metrics scale is rounded DOWN to this step, so the px minimums are never undershot and layouts are not recomputed per pixel. */
const SCALE_STEP = 0.02
export function toMetrics(scale: number, compact: boolean): Metrics {
  return { scale: Math.max(0.2, Math.floor(scale / SCALE_STEP) * SCALE_STEP), compact }
}

export const captionFontSize = (width: number, m: Metrics = DESKTOP_METRICS) =>
  Math.max(MIN_CAPTION_FONT, width * 0.085, MIN_CAPTION_PX / m.scale)
export const dateFontSize = (width: number, m: Metrics = DESKTOP_METRICS) =>
  Math.max(MIN_DATE_FONT, width * 0.05, MIN_DATE_PX / m.scale)
export const captionLines = (m: Metrics = DESKTOP_METRICS) => m.lines ?? (m.compact ? 1 : 2)
/**
 * Height of the white strip under the picture: 20% of the width, but never less than the caption lines plus the date.
 * The layout uses this same number for its bounding boxes, so what is placed is what is drawn.
 */
export const frameBottom = (width: number, m: Metrics = DESKTOP_METRICS) =>
  Math.max(
    width * FRAME_BOTTOM,
    captionFontSize(width, m) * 1.05 * captionLines(m) + dateFontSize(width, m) * 1.3 + 8,
  )

/** Washi tape is this many times wider than tall (matches the CSS). */
export const TAPE_ASPECT = 3.6

export function clampAspect(aspect: number | undefined): number {
  if (!aspect || !Number.isFinite(aspect)) return DEFAULT_ASPECT
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect))
}

/** Outer size of a polaroid of the given frame width holding a picture with the given aspect ratio. */
export function polaroidSize(width: number, aspect: number | undefined, m: Metrics = DESKTOP_METRICS) {
  const imageWidth = width * (1 - 2 * FRAME_SIDE)
  const imageHeight = imageWidth / clampAspect(aspect)
  return { imageWidth, imageHeight, height: width * FRAME_TOP + imageHeight + frameBottom(width, m) }
}
