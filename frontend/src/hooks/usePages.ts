import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import {
  getPages, patchItem, type Geometry, type PageDto, type PageItemDto, type PagesView,
} from '../api/pages'

const DEBOUNCE_MS = 300

function replacePage(view: PagesView, page: PageDto): PagesView {
  return { ...view, pages: view.pages.map((p) => (p.id === page.id ? page : p)) }
}

/**
 * The stored pages of one album. Writes apply their answer (the server returns the whole new state) and a 409 reloads
 * what the server holds, so a stale device can never silently overwrite another one. Position changes of FREE pages are
 * applied locally at once and sent 300 ms after the last change, one request in flight per item.
 */
export function usePages(albumId: string) {
  const [view, setView] = useState<PagesView | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const viewRef = useRef<PagesView | null>(null)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const inflight = useRef(new Set<string>())
  const again = useRef(new Set<string>())

  const set = useCallback((next: PagesView | null) => {
    viewRef.current = next
    setView(next)
  }, [])

  const hasPendingWrites = () => timers.current.size > 0 || inflight.current.size > 0

  const refresh = useCallback(async () => {
    if (hasPendingWrites()) return // do not overwrite what the user just did; the next refresh catches up
    try {
      set(await getPages(albumId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sayfalar yüklenemedi')
    }
  }, [albumId, set])

  const handleError = useCallback(
    async (e: unknown) => {
      if (e instanceof ApiError && e.status === 409) {
        const current = e.problem?.current as (PagesView & PageDto) | undefined
        if (current && viewRef.current) {
          if ('pages' in current && Array.isArray(current.pages)) set(current)
          else if (current.id) set(replacePage(viewRef.current, current))
          setNotice('Sayfa başka bir yerde değişti, güncellendi')
        } else {
          setError(e.message)
        }
      } else {
        setError(e instanceof Error ? e.message : 'İşlem yapılamadı')
      }
      timers.current.forEach((t) => clearTimeout(t))
      timers.current.clear()
      try {
        set(await getPages(albumId))
      } catch {
        /* keep what we have */
      }
    },
    [albumId, set],
  )

  /** Runs a write that answers with the whole new state. */
  const run = useCallback(
    async (op: () => Promise<PagesView>): Promise<boolean> => {
      try {
        set(await op())
        return true
      } catch (e) {
        await handleError(e)
        return false
      }
    },
    [handleError, set],
  )

  const flush = useCallback(
    (itemId: string) => {
      const item = viewRef.current?.pages.flatMap((p) => p.items).find((i) => i.id === itemId)
      if (!item) return
      if (inflight.current.has(itemId)) {
        again.current.add(itemId)
        return
      }
      inflight.current.add(itemId)
      const sent: Geometry = {
        x: item.x ?? undefined, y: item.y ?? undefined, width: item.width ?? undefined,
        rotation: item.rotation ?? undefined, zIndex: item.zIndex ?? undefined,
      }
      patchItem(itemId, sent, item.version)
        .then((saved) => updateItem(itemId, (i) => ({ ...i, version: saved.version })))
        .catch((e) => handleError(e))
        .finally(() => {
          inflight.current.delete(itemId)
          if (again.current.delete(itemId)) flush(itemId)
        })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleError],
  )

  function updateItem(itemId: string, fn: (item: PageItemDto) => PageItemDto) {
    const current = viewRef.current
    if (!current) return
    set({
      ...current,
      pages: current.pages.map((p) => (p.items.some((i) => i.id === itemId) ? { ...p, items: p.items.map((i) => (i.id === itemId ? fn(i) : i)) } : p)),
    })
  }

  /** Applies a position change locally; `final` (drag / rotate / scale ended) schedules the debounced save. */
  const setGeometry = useCallback(
    (itemId: string, geometry: Geometry, final: boolean) => {
      updateItem(itemId, (i) => ({
        ...i,
        x: geometry.x ?? i.x,
        y: geometry.y ?? i.y,
        width: geometry.width ?? i.width,
        rotation: geometry.rotation ?? i.rotation,
        zIndex: geometry.zIndex ?? i.zIndex,
      }))
      if (!final) return
      const old = timers.current.get(itemId)
      if (old) clearTimeout(old)
      timers.current.set(
        itemId,
        setTimeout(() => {
          timers.current.delete(itemId)
          flush(itemId)
        }, DEBOUNCE_MS),
      )
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [flush],
  )

  useEffect(() => {
    const pending = timers.current
    void refresh()
    return () => pending.forEach((t) => clearTimeout(t))
  }, [refresh])

  return {
    view, notice, error, clearNotice: () => setNotice(null), clearError: () => setError(null),
    refresh, apply: set, run, setGeometry,
  }
}
