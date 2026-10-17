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
 * Readability floors, in page units. A desktop screen shows a page at about 0.53x, so 24 and 22 units come out at about
 * 12.7 px for the caption and 11.7 px for the date (the minimums asked for are 22 and 16 units).
 */
export const MIN_CAPTION_FONT = 24
export const MIN_DATE_FONT = 22

export const captionFontSize = (width: number) => Math.max(MIN_CAPTION_FONT, width * 0.085)
export const dateFontSize = (width: number) => Math.max(MIN_DATE_FONT, width * 0.05)
/**
 * Height of the white strip under the picture: 20% of the width, but never less than two caption lines plus the date
 * (so the strip is taller than before on narrow polaroids).
 */
export const frameBottom = (width: number) =>
  Math.max(width * FRAME_BOTTOM, captionFontSize(width) * 2.1 + dateFontSize(width) * 1.3 + 8)

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
  return { imageWidth, imageHeight, height: width * FRAME_TOP + imageHeight + frameBottom(width) }
}
