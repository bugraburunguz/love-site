import type { MediaDto } from '../api/albums'

/** Long edge of the generated thumbnail, in px (the backend's PhotoProcessor.THUMB_EDGE). */
const THUMB_EDGE = 480
const DISPLAY_EDGE = 1600

export type Display =
  | { mode: 'image'; src: string; srcSet?: string }
  | { mode: 'video'; src: string; poster?: string }
  /** waiting for the processing queue (UPLOADED / PROCESSING) or no variants yet */
  | { mode: 'placeholder' }
  | { mode: 'failed' }

/**
 * One rule for every screen. Only generated variants are ever shown: the original (HEIC, huge JPEG, raw video)
 * is never loaded or played by the browser.
 */
export function resolveDisplay(media: MediaDto): Display {
  if (media.status === 'FAILED') return { mode: 'failed' }
  if (media.status !== 'READY') return { mode: 'placeholder' }

  if (media.type === 'IMAGE') {
    if (!media.displayUrl) return { mode: 'placeholder' }
    return { mode: 'image', src: media.displayUrl, srcSet: media.thumbUrl ? srcSet(media) : undefined }
  }
  if (!media.loopUrl) return { mode: 'placeholder' }
  return { mode: 'video', src: media.loopUrl, poster: media.posterUrl ?? undefined }
}

/** `thumb 270w, display 900w`: widths are the real pixel widths of the two files, so the browser can choose well. */
function srcSet(media: MediaDto): string | undefined {
  const { thumbUrl, displayUrl, width, height } = media
  if (!thumbUrl || !displayUrl) return undefined
  if (!width || !height) return `${thumbUrl} ${THUMB_EDGE}w, ${displayUrl} ${DISPLAY_EDGE}w`
  const thumbWidth = Math.max(1, Math.round(width * Math.min(1, THUMB_EDGE / Math.max(width, height))))
  return thumbWidth >= width ? undefined : `${thumbUrl} ${thumbWidth}w, ${displayUrl} ${width}w`
}

export type CoverSource = { kind: 'image' | 'video'; src: string }

/** A small still for the album cover window: the thumbnail, or a video's poster. */
export function coverSource(media: MediaDto): CoverSource | null {
  if (media.status !== 'READY') return null
  const src = media.type === 'IMAGE' ? (media.thumbUrl ?? media.displayUrl) : media.posterUrl
  return src ? { kind: 'image', src } : null
}
