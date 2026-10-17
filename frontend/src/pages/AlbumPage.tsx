import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { deleteMedia, listAlbums, listMedia, updateCaption, type Album, type MediaDto } from '../api/albums'
import Clay from '../components/Clay'
import '../components/clay.css'
import { ConfirmDialog } from '../components/Dialog'
import Lightbox from '../components/Lightbox'
import Book from '../components/book/Book'
import { coverColor } from '../components/leather'
import UploadPanel from '../components/UploadPanel'
import { autoLayout } from '../layout/autoLayout'
import type { PageLayout } from '../layout/types'
import { useAspectProbe } from '../hooks/useAspectProbe'
import { useUploadQueue } from '../upload/useUploadQueue'
import './album.css'

export default function AlbumPage() {
  const { id = '' } = useParams()
  const [album, setAlbum] = useState<Album | null | undefined>(undefined)
  const [media, setMedia] = useState<MediaDto[] | null>(null)
  const [aspects, setAspects] = useState<Record<string, number>>({})
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

  useEffect(() => {
    listAlbums()
      .then((albums) => setAlbum(albums.find((a) => a.id === id) ?? null))
      .catch((e: Error) => setError(e.message))
    refresh()
  }, [id, refresh])

  const onAspect = useCallback((mediaId: string, ratio: number) => {
    setAspects((prev) => (Math.abs((prev[mediaId] ?? 0) - ratio) < 0.005 ? prev : { ...prev, [mediaId]: ratio }))
  }, [])

  const items = useMemo(() => media ?? [], [media])
  const mediaById = useMemo(() => new Map(items.map((m) => [m.id, m])), [items])
  // Layout is generated from data only; Phase 5 will feed stored layouts into the same Book.
  const pages: PageLayout[] = useMemo(
    () => (items.length ? autoLayout(items, id, aspects) : [{ pageIndex: 0, items: [] }]),
    [items, id, aspects],
  )

  // Photos are measured before they are drawn so frames never change height after first paint.
  const settled = useAspectProbe(items, probeLimit, onAspect)
  const firstSpread = items.slice(0, 10)
  const ready = patience || firstSpread.every((m) => settled.has(m.id))
  useEffect(() => {
    if (media === null) return
    const timer = setTimeout(() => setPatience(true), 4000)
    return () => clearTimeout(timer)
  }, [media])

  // How many photos precede the end of the pages the reader is about to see
  const onPosition = useCallback(
    (start: number, cols: number) => {
      let count = 0
      for (const page of pages.slice(0, start + cols * 3)) count += page.items.filter((i) => i.kind === 'MEDIA').length
      setProbeLimit((limit) => Math.max(limit, count))
    },
    [pages],
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
        const next = items[items.findIndex((m) => m.id === current) + 1] ?? items[items.findIndex((m) => m.id === current) - 1]
        return next?.id ?? null
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
          pages={pages}
          mediaById={mediaById}
          aspects={aspects}
          coverColor={coverColor(id)}
          emptyHint={items.length === 0}
          keyboard={openIndex < 0 && !toDelete}
          onOpen={(m) => setOpenId(m.id)}
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
