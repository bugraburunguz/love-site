import type { MediaDto } from '../api/albums'

// Formats every browser can draw; HEIC/HEIF and friends wait for the Phase 3 display copy.
const BROWSER_IMAGES = ['image/jpeg', 'image/png', 'image/webp']

export type Display =
  | { mode: 'image'; src: string }
  | { mode: 'video'; src: string; poster?: string }
  | { mode: 'placeholder' }

let probe: HTMLVideoElement | null = null
function canPlayVideo(contentType: string): boolean {
  if (typeof document === 'undefined') return false
  probe ??= document.createElement('video')
  return probe.canPlayType(contentType) !== ''
}

/** One rule for before and after Phase 3: use the processed copy if there is one, else the original, else a placeholder. */
export function resolveDisplay(media: MediaDto): Display {
  if (media.type === 'IMAGE') {
    if (media.displayUrl) return { mode: 'image', src: media.displayUrl }
    if (media.url && BROWSER_IMAGES.includes(media.contentType)) return { mode: 'image', src: media.url }
    return { mode: 'placeholder' }
  }
  if (media.loopUrl) return { mode: 'video', src: media.loopUrl, poster: media.posterUrl ?? undefined }
  if (media.url && canPlayVideo(media.contentType)) {
    return { mode: 'video', src: media.url, poster: media.posterUrl ?? undefined }
  }
  return { mode: 'placeholder' }
}

export type CoverSource = { kind: 'image' | 'video'; src: string }

/** What to show in a small still window (album cover): a picture, or a paused first frame; null if nothing showable yet. */
export function coverSource(media: MediaDto): CoverSource | null {
  if (media.thumbUrl) return { kind: 'image', src: media.thumbUrl }
  const display = resolveDisplay(media)
  if (display.mode === 'image') return { kind: 'image', src: display.src }
  if (display.mode === 'video') return display.poster ? { kind: 'image', src: display.poster } : { kind: 'video', src: display.src }
  return null
}
