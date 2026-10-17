import { useEffect, useRef, useState } from 'react'
import type { MediaDto } from '../api/albums'
import { resolveDisplay } from '../media/display'

const CONCURRENCY = 4

/**
 * Measures the real aspect ratio of photos (and videos) before they are drawn, so polaroid frames get their
 * final height on first paint instead of jumping when the picture finishes loading. Only the first `limit`
 * items are probed; the caller raises the limit as the reader approaches later pages. Items that already carry
 * width/height from the server (Phase 3) are settled without any request.
 *
 * Returns the ids that are settled: measured, failed, or not measurable (placeholders).
 */
export function useAspectProbe(
  items: readonly MediaDto[],
  limit: number,
  onAspect: (mediaId: string, aspect: number) => void,
): ReadonlySet<string> {
  const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set())
  const started = useRef(new Set<string>())
  const queue = useRef<MediaDto[]>([])
  const active = useRef(0)
  const onAspectRef = useRef(onAspect)
  onAspectRef.current = onAspect

  useEffect(() => {
    const settle = (id: string) => setSettled((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))

    const probe = (media: MediaDto) =>
      new Promise<void>((resolve) => {
        if (media.width && media.height) {
          resolve()
          return
        }
        const display = resolveDisplay(media)
        if (display.mode === 'placeholder') {
          resolve()
          return
        }
        const done = (ratio?: number) => {
          if (ratio && Number.isFinite(ratio)) onAspectRef.current(media.id, ratio)
          resolve()
        }
        if (display.mode === 'image') {
          const img = new Image()
          img.onload = () => done(img.naturalWidth / img.naturalHeight)
          img.onerror = () => done()
          img.src = display.src
        } else {
          const video = document.createElement('video')
          video.preload = 'metadata'
          video.muted = true
          video.onloadedmetadata = () => done(video.videoWidth / video.videoHeight)
          video.onerror = () => done()
          video.src = display.src
        }
      })

    const pump = () => {
      while (active.current < CONCURRENCY && queue.current.length > 0) {
        const media = queue.current.shift()!
        active.current++
        void probe(media).finally(() => {
          active.current--
          settle(media.id)
          pump()
        })
      }
    }

    for (const media of items.slice(0, limit)) {
      if (started.current.has(media.id)) continue
      started.current.add(media.id)
      queue.current.push(media)
    }
    pump()
  }, [items, limit])

  return settled
}
