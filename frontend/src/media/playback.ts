import { useEffect, type RefObject } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'

/** At most this many videos play at once; the rest wait on their first frame. */
export const MAX_PLAYING = 6

type Client = { start: () => void; stop: () => void }

const active = new Set<Client>()
const waiting: Client[] = []

function request(client: Client) {
  if (active.has(client)) return
  if (active.size < MAX_PLAYING) {
    active.add(client)
    client.start()
  } else if (!waiting.includes(client)) {
    waiting.push(client)
  }
}

function release(client: Client) {
  const queued = waiting.indexOf(client)
  if (queued >= 0) waiting.splice(queued, 1)
  if (active.delete(client)) {
    client.stop()
    const next = waiting.shift()
    if (next) {
      active.add(next)
      next.start()
    }
  }
}

/** Test helper: how many videos currently hold a playing slot. */
export function playingCount(): number {
  return active.size
}

/**
 * Plays the video muted and looping while it is on screen, pauses it when it leaves, and never runs more than
 * MAX_PLAYING at the same time. If the browser refuses to autoplay the video quietly stays on its first frame.
 */
export function useVideoPlayback(ref: RefObject<HTMLVideoElement | null>, enabled: boolean) {
  const reduced = useReducedMotion()
  useEffect(() => {
    const video = ref.current
    if (!video || !enabled || reduced) return
    video.muted = true
    const client: Client = {
      start: () => {
        video.play().catch(() => release(client))
      },
      stop: () => video.pause(),
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) request(client)
          else release(client)
        }
      },
      { threshold: 0.2 },
    )
    observer.observe(video)
    return () => {
      observer.disconnect()
      release(client)
    }
  }, [ref, enabled, reduced])
}
