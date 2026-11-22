export type CacheEvent<T> = { type: 'value'; value: T } | { type: 'stale' } | { type: 'clear' }

const MAX_KEEP_MS = 40 * 60_000

export interface CachedQuery<T> {
  key: string
  fetch: () => Promise<T>
  maxAgeMs: number
}

interface Entry {
  hasValue: boolean
  value: unknown
  at: number
  storedAt: number
  version: number
  inflight?: Promise<unknown>
}

const entries = new Map<string, Entry>()
const listeners = new Map<string, Set<(e: CacheEvent<unknown>) => void>>()
let versions = 0

function entryOf(key: string): Entry {
  let entry = entries.get(key)
  if (!entry) {
    entry = { hasValue: false, value: undefined, at: 0, storedAt: 0, version: ++versions }
    entries.set(key, entry)
  }
  return entry
}

function emit(key: string, event: CacheEvent<unknown>) {
  for (const listener of [...(listeners.get(key) ?? [])]) listener(event)
}

function write(key: string, value: unknown) {
  const entry = entryOf(key)
  entry.hasValue = true
  entry.value = value
  entry.at = Date.now()
  entry.storedAt = entry.at
  emit(key, { type: 'value', value })
}

function fetchInto<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = entryOf(key)
  if (entry.inflight) return entry.inflight as Promise<T>
  const version = entry.version
  const current = () => entries.get(key) === entry && entry.version === version
  const request = fetcher().then(
    (value) => {
      if (current()) {
        entry.inflight = undefined
        write(key, value)
      }
      return value
    },
    (error: unknown) => {
      if (current()) entry.inflight = undefined
      throw error
    },
  )
  entry.inflight = request
  return request
}

function isUsable(entry: Entry | undefined): entry is Entry {
  return entry !== undefined && entry.hasValue && Date.now() - entry.storedAt < MAX_KEEP_MS
}

export function cachedGet<T>(key: string, fetcher: () => Promise<T>, maxAgeMs: number): Promise<T> {
  const entry = entries.get(key)
  if (isUsable(entry)) {
    if (Date.now() - entry.at >= maxAgeMs) fetchInto(key, fetcher).catch(() => undefined)
    return Promise.resolve(entry.value as T)
  }
  return fetchInto(key, fetcher)
}

export function refreshCached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const entry = entries.get(key)
  if (entry && !entry.inflight) entry.at = 0
  return fetchInto(key, fetcher)
}

export function peekCached<T>(key: string): T | undefined {
  const entry = entries.get(key)
  return isUsable(entry) ? (entry.value as T) : undefined
}

export function setCached<T>(key: string, next: T | ((current: T | undefined) => T)): void {
  const value = typeof next === 'function' ? (next as (current: T | undefined) => T)(peekCached<T>(key)) : next
  if (value === undefined) {
    invalidate(key)
    return
  }
  const entry = entryOf(key)
  entry.version = ++versions
  entry.inflight = undefined
  write(key, value)
}

export function invalidate(key: string, options: { prefix?: boolean } = {}): void {
  const keys = options.prefix ? [...entries.keys()].filter((k) => k.startsWith(key)) : entries.has(key) ? [key] : []
  for (const k of keys) {
    const entry = entries.get(k)!
    entry.at = 0
    entry.version = ++versions
    entry.inflight = undefined
    if (!entry.hasValue) entries.delete(k)
    emit(k, { type: 'stale' })
  }
}

export function clearCache(): void {
  entries.clear()
  for (const key of [...listeners.keys()]) emit(key, { type: 'clear' })
}

export function subscribeCached<T>(key: string, listener: (e: CacheEvent<T>) => void): () => void {
  let set = listeners.get(key)
  if (!set) {
    set = new Set()
    listeners.set(key, set)
  }
  const l = listener as (e: CacheEvent<unknown>) => void
  set.add(l)
  return () => {
    set.delete(l)
    if (set.size === 0) listeners.delete(key)
  }
}
