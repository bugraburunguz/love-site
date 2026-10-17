import { describe, expect, it } from 'vitest'
import type { MediaDto } from '../api/albums'
import { resolveDisplay } from './display'

function media(patch: Partial<MediaDto>): MediaDto {
  return {
    id: 'm1', type: 'IMAGE', status: 'READY', thumbUrl: 't.webp', displayUrl: 'd.webp', loopUrl: null, posterUrl: null,
    width: 800, height: 600, ...patch,
  } as MediaDto
}

describe('resolveDisplay', () => {
  it('shows an ordinary photo as an image without a live clip', () => {
    const d = resolveDisplay(media({}))
    expect(d).toMatchObject({ mode: 'image', src: 'd.webp' })
    expect((d as { live?: string }).live).toBeUndefined()
  })

  it('keeps a Motion Photo an image and hands the clip over as the live layer', () => {
    const d = resolveDisplay(media({ loopUrl: 'loop.mp4', posterUrl: 'p.webp' }))
    expect(d).toMatchObject({ mode: 'image', src: 'd.webp', live: 'loop.mp4' })
  })

  it('does not play a clip while the item is not READY', () => {
    expect(resolveDisplay(media({ status: 'PROCESSING', loopUrl: 'loop.mp4' })).mode).toBe('placeholder')
    expect(resolveDisplay(media({ status: 'FAILED', loopUrl: 'loop.mp4' })).mode).toBe('failed')
  })

  it('still plays a video as a video', () => {
    expect(resolveDisplay(media({ type: 'VIDEO', displayUrl: null, thumbUrl: null, loopUrl: 'l.mp4', posterUrl: 'p.webp' })))
      .toEqual({ mode: 'video', src: 'l.mp4', poster: 'p.webp' })
  })
})
