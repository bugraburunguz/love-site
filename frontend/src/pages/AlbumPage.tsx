import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  deleteMedia, getMediaStatuses, listAlbums, listMedia, reprocessMedia, updateCaption, type Album, type MediaDto,
} from '../api/albums'
import Clay from '../components/Clay'
import '../components/clay.css'
import { ConfirmDialog } from '../components/Dialog'
import Lightbox from '../components/Lightbox'
import Book from '../components/book/Book'
import { coverColor } from '../components/leather'
import UploadPanel from '../components/UploadPanel'
import { useAspectProbe } from '../hooks/useAspectProbe'
import { autoLayout, pageSizes } from '../layout/autoLayout'
import type { Metrics } from '../layout/geometry'
import type { PageLayout } from '../layout/types'
import { cachedAspects, rememberAspects } from '../media/aspectCache'
import { useUploadQueue } from '../upload/useUploadQueue'
import './album.css'

/** Re-layouts caused by late-arriving aspect ratios are grouped into one update per this many ms. */
const RELAYOUT_DELAY = 250

export default function AlbumPage() {
  const { id = '' } = useParams()
  // key: a different album is a fresh page, with its own aspect cache and state
  return <AlbumView key={id} id={id} />
}

function AlbumView({ id }: { id: string }) {
  const [album, setAlbum] = useState<Album | null | undefined>(undefined)
  const [media, setMedia] = useState<MediaDto[] | null>(null)
  const [measured, setMeasured] = useState<Record<string, number>>(() => cachedAspects(id))
  const [openId, setOpenId] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<MediaDto | null>(null)
  const [probeLimit, setProbeLimit] = useState(12)
  const [patience, setPatience] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const refresh = useCallback(() => {
    listMedia(id)
      .then(setMedia)
      .catch((e: Error) => setError(e.message))
  }, [id])

  const { entries, add, retry, clearFinished } = useUploadQueue(id, refresh)

  // While some items are still being processed, ask for just those every 5 s (not the whole list); stop when done.
  const pendingKey = useMemo(
    () => (media ?? []).filter((m) => m.status === 'UPLOADED' || m.status === 'PROCESSING').map((m) => m.id).sort().join(','),
    [media],
  )
  useEffect(() => {
    if (!pendingKey) return
    const ids = pendingKey.split(',')
    let cancelled = false
    const timer = setInterval(() => {
      if (document.hidden) return
      getMediaStatuses(ids)
        .then((updated) => {
          if (cancelled) return
          const byId = new Map(updated.map((u) => [u.id, u]))
          // only items whose state changed are replaced, so unchanged photos keep their identity
          setMedia((list) => list?.map((m) => (byId.get(m.id) && byId.get(m.id)!.status !== m.status ? byId.get(m.id)! : m)) ?? list)
        })
        .catch(() => undefined) // a missed poll is simply retried
    }, 5000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [pendingKey])

  async function retryProcessing(item: MediaDto) {
    try {
      const updated = await reprocessMedia(item.id)
      setMedia((list) => list?.map((m) => (m.id === updated.id ? updated : m)) ?? list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tekrar denenemedi')
    }
  }

  useEffect(() => {
    listAlbums()
      .then((albums) => setAlbum(albums.find((a) => a.id === id) ?? null))
      .catch((e: Error) => setError(e.message))
    refresh()
  }, [id, refresh])

  // Aspect ratios arrive one by one; they are collected and applied together so the layout is recomputed once.
  const latest = useRef<Record<string, number>>(cachedAspects(id))
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const settledOnce = useRef(false)
  const flush = useCallback(() => {
    timer.current = undefined
    rememberAspects(id, latest.current)
    setMeasured({ ...latest.current })
  }, [id])
  const onAspect = useCallback(
    (mediaId: string, ratio: number) => {
      if (Math.abs((latest.current[mediaId] ?? 0) - ratio) < 0.005) return
      latest.current[mediaId] = ratio
      // before the book is first shown there is nothing on screen to protect: apply immediately
      if (!settledOnce.current) flush()
      else timer.current ??= setTimeout(flush, RELAYOUT_DELAY)
    },
    [flush],
  )
  useEffect(() => () => clearTimeout(timer.current), [])

  const items = useMemo(() => media ?? [], [media])
  const mediaById = useMemo(() => new Map(items.map((m) => [m.id, m])), [items])

  // Ratio per photo: measured in the browser, or sent by the API once the media worker exists.
  const aspects = useMemo(() => {
    const result: Record<string, number> = {}
    for (const m of items) if (m.width && m.height) result[m.id] = m.width / m.height
    return { ...result, ...measured }
  }, [items, measured])

  // Layout is generated from data only (plus the screen's text metrics, which the Book supplies);
  // Phase 5 will feed stored layouts into the same Book.
  const layout = useCallback(
    (metrics: Metrics): PageLayout[] =>
      items.length ? autoLayout(items, id, aspects, metrics) : [{ pageIndex: 0, items: [] }],
    [items, id, aspects],
  )
  const sizes = useMemo(() => pageSizes(items.length, id), [items.length, id])

  // Photos are measured before they are drawn, so frames never change size after first paint.
  const settled = useAspectProbe(items, probeLimit, aspects, onAspect)
  const firstSpread = items.slice(0, 10)
  const ready = patience || firstSpread.every((m) => settled.has(m.id))
  useEffect(() => {
    if (ready && media !== null) settledOnce.current = true
  }, [ready, media])
  useEffect(() => {
    if (media === null) return
    const timeout = setTimeout(() => setPatience(true), 4000)
    return () => clearTimeout(timeout)
  }, [media])

  // How many photos precede the end of the pages the reader is about to see
  const onPosition = useCallback(
    (start: number, cols: number) => {
      const count = sizes.slice(0, start + cols * 3).reduce((sum, n) => sum + n, 0)
      setProbeLimit((limit) => Math.max(limit, count))
    },
    [sizes],
  )

  const openIndex = openId ? items.findIndex((m) => m.id === openId) : -1

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // allow picking the same files again
    if (files.length > 0) add(files)
  }

  async function saveCaption(mediaId: string, caption: string) {
    const updated = await updateCaption(mediaId, caption)
    setMedia((list) => list?.map((m) => (m.id === mediaId ? { ...m, caption: updated.caption } : m)) ?? list)
  }

  async function confirmDelete() {
    if (!toDelete) return
    try {
      await deleteMedia(toDelete.id)
      setOpenId((current) => {
        if (current !== toDelete.id) return current
        const at = items.findIndex((m) => m.id === current)
        return (items[at + 1] ?? items[at - 1])?.id ?? null
      })
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Silinemedi')
    }
  }

  if (album === null) {
    return (
      <main className="album-screen album-screen--missing">
        <p>Albüm bulunamadı.</p>
        <Link to="/">Albümlere dön</Link>
      </main>
    )
  }

  return (
    <main className="album-screen">
      <header className="album-screen__header">
        <Link to="/" className="clay clay--pill clay--sm clay--cream album-screen__back">
          ‹ Albümler
        </Link>
        <h1 className="album-screen__title">{album?.title ?? ''}</h1>
        <span className="album-screen__spacer" />
      </header>

      {error && <p role="alert" className="album-screen__error">{error}</p>}

      {media === null || !ready ? (
        <p className="album-screen__loading">Albüm açılıyor…</p>
      ) : (
        <Book
          layout={layout}
          mediaById={mediaById}
          aspects={aspects}
          coverColor={coverColor(id)}
          emptyHint={items.length === 0}
          keyboard={openIndex < 0 && !toDelete}
          onOpen={(m) => setOpenId(m.id)}
          onRetry={retryProcessing}
          onAspect={onAspect}
          onPosition={onPosition}
        />
      )}

      {openIndex >= 0 && (
        <Lightbox
          items={items}
          index={openIndex}
          aspects={aspects}
          onIndex={(i) => setOpenId(items[i].id)}
          onClose={() => setOpenId(null)}
          onCaption={saveCaption}
          onDelete={setToDelete}
          onRetry={retryProcessing}
          onAspect={onAspect}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Fotoğraf silinsin mi?"
          message={`"${toDelete.caption || toDelete.originalFilename}" albümden kalkacak.`}
          confirmLabel="Sil"
          onClose={() => setToDelete(null)}
          onConfirm={confirmDelete}
        />
      )}

      <UploadPanel entries={entries} onRetry={retry} onClear={clearFinished} />

      <input ref={fileInput} type="file" multiple accept="image/*,video/*" onChange={onFiles} hidden />
      <Clay shape="seal" className="album-screen__add" onClick={() => fileInput.current?.click()} aria-label="Dosya ekle">
        +
      </Clay>
    </main>
  )
}
