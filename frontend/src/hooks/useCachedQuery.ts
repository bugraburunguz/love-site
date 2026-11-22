import { useCallback, useEffect, useRef, useState } from 'react'
import { cachedGet, peekCached, refreshCached, subscribeCached, type CachedQuery } from '../api/cache'

export interface CachedQueryState<T> {
  data: T | undefined
  error: Error | null
  /** asks the server again even when the cached value is fresh */
  reload: () => void
}

/**
 * A cached GET shared by every screen: the value shows at once when it is cached, a stale one is refreshed in the
 * background, and a change made through the cache (setCached, invalidate) reaches every component that uses the key.
 */
export function useCachedQuery<T>(query: CachedQuery<T>): CachedQueryState<T> {
  const { key, maxAgeMs } = query
  const fetchRef = useRef(query.fetch)
  fetchRef.current = query.fetch
  const [state, setState] = useState<{ key: string; data: T | undefined; error: Error | null }>(() => ({
    key,
    data: peekCached<T>(key),
    error: null,
  }))

  const run = useCallback(
    (force: boolean) => {
      const fetcher = () => fetchRef.current()
      if (force) setState((s) => (s.key === key && s.error ? { ...s, error: null } : s))
      const request = force ? refreshCached(key, fetcher) : cachedGet(key, fetcher, maxAgeMs)
      return request.then(
        (data) => setState((s) => (s.key === key ? { key, data, error: null } : s)),
        (e: unknown) => setState((s) => (s.key === key ? { ...s, error: e instanceof Error ? e : new Error(String(e)) } : s)),
      )
    },
    [key, maxAgeMs],
  )

  useEffect(() => {
    setState((s) => (s.key === key ? s : { key, data: peekCached<T>(key), error: null }))
    const off = subscribeCached<T>(key, (event) => {
      if (event.type === 'value') setState({ key, data: event.value, error: null })
      else if (event.type === 'clear') setState({ key, data: undefined, error: null })
      else void run(false)
    })
    void run(false)
    return off
  }, [key, run])

  const reload = useCallback(() => void run(true), [run])
  const current = state.key === key ? state : { data: peekCached<T>(key), error: null }
  return { data: current.data, error: current.error, reload }
}
