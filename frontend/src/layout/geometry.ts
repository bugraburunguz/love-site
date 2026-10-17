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

/** Washi tape is this many times wider than tall (matches the CSS). */
export const TAPE_ASPECT = 3.6

export function clampAspect(aspect: number | undefined): number {
  if (!aspect || !Number.isFinite(aspect)) return DEFAULT_ASPECT
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, aspect))
}

/** Outer size of a polaroid of the given frame width holding a picture with the given aspect ratio. */
export function polaroidSize(width: number, aspect: number | undefined) {
  const imageWidth = width * (1 - 2 * FRAME_SIDE)
  const imageHeight = imageWidth / clampAspect(aspect)
  return { imageWidth, imageHeight, height: width * FRAME_TOP + imageHeight + width * FRAME_BOTTOM }
}
