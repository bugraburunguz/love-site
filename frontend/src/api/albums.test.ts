import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiMock = vi.hoisted(() => vi.fn())
vi.mock('./client', () => ({ api: apiMock }))

import { albumsQuery, changeClip, getMediaStatuses, reprocessMedia, spaceQuery } from './albums'
import { cachedGet, clearCache, peekCached } from './cache'

const ALBUMS = [{ id: 'a' }]

async function primeCache() {
  await cachedGet(albumsQuery.key, async () => ALBUMS as never, 30_000)
  await cachedGet(spaceQuery.key, async () => ({ usedBytes: 1 }) as never, 30_000)
}

function isStale(key: string) {
  const fetcher = vi.fn(async () => [] as never)
  void cachedGet(key, fetcher, 30_000)
  return fetcher.mock.calls.length === 1
}

beforeEach(() => {
  clearCache()
  apiMock.mockReset()
})

describe('media changes reach the shelf', () => {
  it('reprocess and a new clip mark albums and space stale', async () => {
    for (const call of [() => reprocessMedia('m'), () => changeClip('m', 1000)]) {
      clearCache()
      await primeCache()
      apiMock.mockResolvedValueOnce({ id: 'm', status: 'PROCESSING' })
      expect(await call()).toEqual({ id: 'm', status: 'PROCESSING' })
      expect(peekCached(albumsQuery.key)).toEqual(ALBUMS)
      expect(isStale(albumsQuery.key)).toBe(true)
      expect(isStale(spaceQuery.key)).toBe(true)
    }
  })

  it('a status poll that finds a finished item marks albums stale; one with only pending items does not', async () => {
    await primeCache()
    apiMock.mockResolvedValueOnce([{ id: 'm', status: 'PROCESSING' }])
    await getMediaStatuses(['m'])
    expect(isStale(albumsQuery.key)).toBe(false)

    apiMock.mockResolvedValueOnce([{ id: 'm', status: 'READY' }])
    await getMediaStatuses(['m'])
    expect(isStale(albumsQuery.key)).toBe(true)
  })
})
