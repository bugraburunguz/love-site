/**
 * LS-22: a video becomes a 3-second living photo (played forward and back). The user picks where those 3 seconds
 * start; the server keeps the same rules (backend ClipWindow), these are for the picker.
 */
export const CLIP_SECONDS = 3

/** How far the start can go (seconds) and how long the clip is, for a video of `duration` seconds. */
export function clipRange(duration: number): { max: number; length: number } {
  if (!Number.isFinite(duration) || duration <= 0) return { max: 0, length: CLIP_SECONDS }
  if (duration <= CLIP_SECONDS) return { max: 0, length: duration }
  return { max: duration - CLIP_SECONDS, length: CLIP_SECONDS }
}

/** The start to send to the server, in whole milliseconds, kept inside the video. */
export function clipStart(seconds: number, duration: number): number {
  const { max } = clipRange(duration)
  return Math.round(Math.min(Math.max(0, seconds), max) * 1000)
}

export function timeLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const VIDEO_EXT = /\.(mov|mp4|m4v|3gp|webm|mkv|avi)$/i

export function isVideoFile(file: { name: string; type: string }): boolean {
  return file.type ? file.type.startsWith('video/') : VIDEO_EXT.test(file.name)
}
