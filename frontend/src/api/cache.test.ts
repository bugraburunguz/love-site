import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cachedGet, clearCache, invalidate, peekCached, refreshCached, setCached, subscribeCached } from './cache'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  clearCache()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('expiry and clearing', () => {
  it('waits for the server instead of showing a value older than its presigned links', async () => {
    await cachedGet('k', async () => 1, 1000)
    vi.setSystemTime(new Date('2026-01-01T00:41:00Z'))
    const d = deferred<number>()
    const pending = cachedGet('k', () => d.promise, 1000)
    let settled = false
    void pending.then(() => (settled = true))
    await flush()
    expect(settled).toBe(false)
    expect(peekCached('k')).toBeUndefined()
    d.resolve(2)
    expect(await pending).toBe(2)
  })

  it('tells subscribers when the cache is cleared', async () => {
    await cachedGet('k', async () => 1, 1000)
    const events: string[] = []
    subscribeCached('k', (e) => events.push(e.type))
    clearCache()
    expect(events).toEqual(['clear'])
  })
})

describe('cachedGet', () => {
  it('makes one request for concurrent calls of the same key', async () => {
    const d = deferred<number>()
    const fetcher = vi.fn(() => d.promise)
    const a = cachedGet('k', fetcher, 1000)
    const b = cachedGet('k', fetcher, 1000)
    d.resolve(7)
    expect(await a).toBe(7)
    expect(await b).toBe(7)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('returns fresh data without the network', async () => {
    const fetcher = vi.fn(async () => 1)
    await cachedGet('k', fetcher, 1000)
    vi.setSystemTime(new Date('2026-01-01T00:00:00.900Z'))
    expect(await cachedGet('k', fetcher, 1000)).toBe(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('returns stale data at once and refreshes it in the background', async () => {
    let n = 0
    const fetcher = vi.fn(async () => ++n)
    await cachedGet('k', fetcher, 1000)
    const seen: number[] = []
    const off = subscribeCached<number>('k', (e) => e.type === 'value' && seen.push(e.value))
    vi.setSystemTime(new Date('2026-01-01T00:00:02Z'))
    expect(await cachedGet('k', fetcher, 1000)).toBe(1)
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(seen).toEqual([2])
    expect(peekCached('k')).toBe(2)
    off()
  })

  it('does not keep a failed request', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(3)
    await expect(cachedGet('k', fetcher, 1000)).rejects.toThrow('x')
    expect(await cachedGet('k', fetcher, 1000)).toBe(3)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('keeps the stale value when the background refresh fails', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(1).mockRejectedValueOnce(new Error('x'))
    await cachedGet('k', fetcher, 1000)
    vi.setSystemTime(new Date('2026-01-01T00:00:02Z'))
    expect(await cachedGet('k', fetcher, 1000)).toBe(1)
    await flush()
    expect(peekCached('k')).toBe(1)
  })
})

describe('refreshCached', () => {
  it('goes to the network even when the data is fresh', async () => {
    let n = 0
    const fetcher = vi.fn(async () => ++n)
    await cachedGet('k', fetcher, 1000)
    expect(await refreshCached('k', fetcher)).toBe(2)
    expect(peekCached('k')).toBe(2)
  })
})

describe('setCached', () => {
  it('stores a value or applies an updater and tells the subscribers', async () => {
    const seen: number[] = []
    const off = subscribeCached<number>('k', (e) => e.type === 'value' && seen.push(e.value))
    setCached('k', 1)
    setCached<number>('k', (v) => (v ?? 0) + 10)
    expect(peekCached('k')).toBe(11)
    expect(seen).toEqual([1, 11])
    const fetcher = vi.fn(async () => 0)
    expect(await cachedGet('k', fetcher, 1000)).toBe(11)
    expect(fetcher).not.toHaveBeenCalled()
    off()
  })

  it('treats an updater that knows nothing (undefined) as an invalidation', async () => {
    const d = deferred<number>()
    const pending = cachedGet('k', () => d.promise, 1000)
    setCached<number | undefined>('k', (v) => v)
    d.resolve(1)
    await pending
    expect(peekCached('k')).toBeUndefined()
    const fetcher = vi.fn(async () => 2)
    expect(await cachedGet('k', fetcher, 1000)).toBe(2)
  })

  it('wins over a request that was already on its way', async () => {
    const d = deferred<number>()
    const pending = cachedGet('k', () => d.promise, 1000)
    setCached('k', 5)
    d.resolve(1)
    await pending
    expect(peekCached('k')).toBe(5)
  })
})

describe('invalidate', () => {
  it('makes a key stale: the next read shows it and fetches again', async () => {
    let n = 0
    const fetcher = vi.fn(async () => ++n)
    await cachedGet('k', fetcher, 60_000)
    invalidate('k')
    expect(await cachedGet('k', fetcher, 60_000)).toBe(1)
    await flush()
    expect(peekCached('k')).toBe(2)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('works on a prefix and tells the subscribers', async () => {
    setCached('day:a', 1)
    setCached('day:b', 2)
    setCached('other', 3)
    const events: string[] = []
    const offA = subscribeCached('day:a', (e) => events.push(`a:${e.type}`))
    const offO = subscribeCached('other', (e) => events.push(`o:${e.type}`))
    invalidate('day:', { prefix: true })
    expect(events).toEqual(['a:stale'])
    const fetcher = vi.fn(async () => 9)
    await cachedGet('other', fetcher, 60_000)
    expect(fetcher).not.toHaveBeenCalled()
    await cachedGet('day:b', fetcher, 60_000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    offA()
    offO()
  })

  it('drops the answer of a request started before it', async () => {
    const d = deferred<number>()
    const pending = cachedGet('k', () => d.promise, 60_000)
    invalidate('k')
    d.resolve(1)
    await pending
    expect(peekCached('k')).toBeUndefined()
  })
})

describe('clearCache', () => {
  it('forgets everything, also answers still on their way', async () => {
    setCached('k', 1)
    const d = deferred<number>()
    const pending = cachedGet('j', () => d.promise, 1000)
    clearCache()
    d.resolve(2)
    await pending
    expect(peekCached('k')).toBeUndefined()
    expect(peekCached('j')).toBeUndefined()
  })
})
