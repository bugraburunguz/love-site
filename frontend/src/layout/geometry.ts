export const PAGE_W = 1000
export const PAGE_H = 1400

/** Used until the real aspect ratio (width / height) of a photo is known. */
export const DEFAULT_ASPECT = 0.8

const MIN_ASPECT = 0.55
const MAX_ASPECT = 1.9

/** Polaroid frame proportions, as a fraction of the frame width. */
export const FRAME_SIDE = 0.06
export const FRAME_TOP = 0.06
export const FRAME_BOTTOM = 0.2

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
