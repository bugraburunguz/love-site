import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import {
  changeAlbumTheme, deleteMedia, getMediaStatuses, listAlbums, listMedia, reprocessMedia, updateCaption, type Album, type MediaDto,
} from '../api/albums'
import {
  addSticker, applyPageTheme, changePageLook, changePageTheme, changeTemplate, createPage, deletePage, featureMedia, initializePages,
  moveItem, placeMedia, removeItem, reorderPages, type PageDto, type PageItemDto, type PageTemplate,
} from '../api/pages'
import AlbumMusic from '../components/AlbumMusic'
import AlbumSettings from '../components/AlbumSettings'
import Ambient, { useAmbientPreference } from '../components/Ambient'
import Clay from '../components/Clay'
import CompassNeedle from '../components/CompassNeedle'
import ErrorBoundary from '../components/ErrorBoundary'
import ErrorScreen from '../components/ErrorScreen'
import '../components/clay.css'
import { ConfirmDialog } from '../components/Dialog'
import Lightbox from '../components/Lightbox'
import Book from '../components/book/Book'
import type { DropTarget, PageEditor } from '../components/book/editor'
import PageBar from '../components/edit/PageBar'
import PagePanel from '../components/edit/PagePanel'
import Tray from '../components/edit/Tray'
import UploadSetupDialog from '../components/edit/UploadSetupDialog'
import UploadPanel from '../components/UploadPanel'
import ExportCard from '../components/export/ExportCard'
import SharePanel from '../components/export/SharePanel'
import '../components/export/export.css'
import { getOriginal, type ExportType } from '../api/exports'
import { useExports } from '../export/useExports'
import { download } from '../export/share'
import DateEditDialog from '../components/calendar/DateEditDialog'
import { useAspectProbe } from '../hooks/useAspectProbe'
import { usePages } from '../hooks/usePages'
import { effectsAllowed } from '../components/ambient/effects'
import { initialDistribution } from '../layout/autoLayout'
import { assetUrl } from '../themes/assets'
import type { Metrics } from '../layout/geometry'
import { freezePayload, layoutPage } from '../layout/pageLayout'
import type { PageLayout } from '../layout/types'
import { cachedAspects, rememberAspects } from '../media/aspectCache'
import { useReducedMotion, useHoverCapable } from '../hooks/useReducedMotion'
import { themeDecor } from '../themes/decor'
import { themeVars } from '../themes/cssVars'
import { resolvePageTheme, scopeIndexes, themesInUse, type ThemeScope } from '../themes/pageTheme'
import { getTheme } from '../themes/registry'
import { loadThemeFonts, ThemeContext, useThemeFonts } from '../themes/ThemeContext'
import { useUploadQueue } from '../upload/useUploadQueue'
import './album.css'

/** Re-layouts caused by late-arriving aspect ratios are grouped into one update per this many ms. */
const RELAYOUT_DELAY = 250
const MAX_AUTO = 4

export default function AlbumPage() {
  const { id = '' } = useParams()
  // key: a different album is a fresh page, with its own aspect cache and state
  return <AlbumView key={id} id={id} />
}

type Confirm =
  | { kind: 'unfreeze'; page: PageDto; template: PageTemplate }
  | { kind: 'deletePage'; page: PageDto }
  | { kind: 'themeRest'; pages: PageDto[]; themeId: string | null }
  | null

const mediaItems = (page: PageDto): PageItemDto[] =>
  page.items.filter((i) => i.kind === 'MEDIA' && i.mediaId).sort((a, b) => (a.slotIndex ?? a.zIndex ?? 0) - (b.slotIndex ?? b.zIndex ?? 0))

function AlbumView({ id }: { id: string }) {
  const [album, setAlbum] = useState<Album | null | undefined>(undefined)
  const [media, setMedia] = useState<MediaDto[] | null>(null)
  const [measured, setMeasured] = useState<Record<string, number>>(() => cachedAspects(id))
  const [openId, setOpenId] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<MediaDto | null>(null)
  const [probeLimit, setProbeLimit] = useState(12)
  const [patience, setPatience] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickedFiles, setPickedFiles] = useState<File[] | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // editing
  const [editing, setEditing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusPageId, setFocusPageId] = useState<string | null>(null)
  const [visibleStart, setVisibleStart] = useState(0)
  const [bookCols, setBookCols] = useState(2)
  const [trayOpen, setTrayOpen] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [search, setSearch] = useSearchParams()
  const [settingsOpen, setSettingsOpen] = useState(() => search.get('ayarlar') === '1')
  const [previewThemeId, setPreviewThemeId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [dateEdit, setDateEdit] = useState<MediaDto | null>(null)
  const exportsState = useExports(id)
  const [ambientOn, setAmbientOn] = useAmbientPreference()
  const reduced = useReducedMotion()
  const hoverCapable = useHoverCapable()
  const pendingSticker = useRef<string | null>(null)
  const [goTo, setGoTo] = useState<{ index: number; nonce: number }>({ index: 0, nonce: 0 })
  const layouts = useRef<PageLayout[]>([])

  const theme = useMemo(() => getTheme(previewThemeId ?? album?.themeId), [previewThemeId, album?.themeId])
  useThemeFonts(theme)
  const pagesState = usePages(id)
  const { view, run: runPages, refresh: refreshPages } = pagesState
  // pages with a theme of their own: their hand fonts are loaded too (a spread may need two)
  const pageThemeKey = (view?.pages ?? []).map((p) => p.themeId ?? '').join(',')
  useEffect(() => {
    for (const t of themesInUse(pageThemeKey.split(','), theme)) void loadThemeFonts(t)
  }, [pageThemeKey, theme])

  const refresh = useCallback(() => {
    listMedia(id)
      .then(setMedia)
      .catch((e: Error) => setError(e.message))
  }, [id])

  const refreshAll = useCallback(() => {
    refresh()
    void refreshPages()
  }, [refresh, refreshPages])

  const { entries, add, retry, clearFinished } = useUploadQueue(id, refreshAll)

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

  // Another device may have changed the pages: look again whenever this tab comes back (no realtime channel).
  useEffect(() => {
    const again = () => {
      if (document.hidden) return
      refreshAll()
    }
    document.addEventListener('visibilitychange', again)
    window.addEventListener('focus', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      window.removeEventListener('focus', again)
    }
  }, [refreshAll])

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

  const all = useMemo(() => media ?? [], [media])
  const mediaById = useMemo(() => new Map(all.map((m) => [m.id, m])), [all])
  const pages = useMemo(() => view?.pages ?? [], [view])

  // The one-time import: an album without stored pages gets the distribution the old automatic layout would have made.
  const initialized = useRef(false)
  useEffect(() => {
    if (initialized.current || !view || media === null) return
    if (view.pages.length > 0 || media.length === 0) return
    initialized.current = true
    const groups = initialDistribution(media, id)
    initializePages(id, groups.map((g) => ({ template: 'AUTO' as const, mediaIds: g.map((m) => m.id) })))
      .then(pagesState.apply)
      .catch((e: Error) => setError(e.message))
  }, [view, media, id, pagesState.apply])

  // Photos in page order (the lightbox walks through them), then the ones on no page.
  const items = useMemo(() => {
    const placed: MediaDto[] = []
    for (const page of pages) {
      for (const item of mediaItems(page)) {
        const m = mediaById.get(item.mediaId as string)
        if (m) placed.push(m)
      }
    }
    return placed
  }, [pages, mediaById])
  // media id -> theme of the page it sits on (the lightbox and the exports show a photo in its page's theme)
  const pageThemeByMedia = useMemo(() => {
    const result = new Map<string, string | null>()
    for (const page of pages) for (const item of mediaItems(page)) result.set(item.mediaId as string, page.themeId ?? null)
    return result
  }, [pages])
  const themeOfMedia = useCallback((mediaId: string) => resolvePageTheme(pageThemeByMedia.get(mediaId), theme), [pageThemeByMedia, theme])
  const trayMedia = useMemo(() => (view?.tray ?? []).map((tid) => mediaById.get(tid)).filter((m): m is MediaDto => !!m), [view, mediaById])

  // Ratio per photo: measured in the browser, or sent by the API once the media worker exists.
  const aspects = useMemo(() => {
    const result: Record<string, number> = {}
    for (const m of all) if (m.width && m.height) result[m.id] = m.width / m.height
    return { ...result, ...measured }
  }, [all, measured])

  // Layouts are computed per page from data only (plus the screen's text metrics, which the Book supplies).
  // Computing a page is the expensive part, so every page keeps its result until it changes (pages the user did not
  // touch keep their identity when another page is edited).
  // the automatic decoration (fasteners, stickers) of a page comes from that page's theme
  const layoutCache = useRef(new WeakMap<PageDto, { metrics: Metrics; aspects: object; decor: object; layout: PageLayout }>())
  const layout = useCallback(
    (metrics: Metrics): PageLayout[] =>
      pages.length
        ? pages.map((p) => {
            const decor = themeDecor(resolvePageTheme(p.themeId, theme))
            const hit = layoutCache.current.get(p)
            if (hit && hit.metrics === metrics && hit.aspects === aspects && hit.decor === decor) return hit.layout
            const computed = layoutPage(p, aspects, metrics, decor)
            layoutCache.current.set(p, { metrics, aspects, decor, layout: computed })
            return computed
          })
        : [{ pageIndex: 0, items: [] }],
    [pages, aspects, theme],
  )
  const onLayouts = useCallback((computed: PageLayout[]) => {
    layouts.current = computed
  }, [])

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
      setVisibleStart(start)
      setBookCols(cols)
      const count = pages.slice(0, start + cols * 3).reduce((sum, p) => sum + mediaItems(p).length, 0)
      setProbeLimit((limit) => Math.max(limit, count))
    },
    [pages],
  )

  const openIndex = openId ? items.findIndex((m) => m.id === openId) : -1

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = '' // allow picking the same files again
    if (files.length > 0) setPickedFiles(files)
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
      setSelectedId(null)
      refreshAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Silinemedi')
    }
  }

  // ---- editing --------------------------------------------------------------------------------------------------

  const findItem = useCallback(
    (itemId: string): { page: PageDto; item: PageItemDto } | null => {
      for (const page of pages) {
        const item = page.items.find((i) => i.id === itemId)
        if (item) return { page, item }
      }
      return null
    },
    [pages],
  )

  const focusIndex = useMemo(() => {
    const at = pages.findIndex((p) => p.id === focusPageId)
    return Math.min(Math.max(at >= 0 ? at : visibleStart, 0), Math.max(pages.length - 1, 0))
  }, [pages, focusPageId, visibleStart])

  const handleDrop = useCallback(
    (itemId: string, target: DropTarget) => {
      const from = findItem(itemId)
      if (!from || from.item.kind !== 'MEDIA') return
      if (target.kind === 'item') {
        const dest = findItem(target.itemId)
        if (!dest) return
        void runPages(() => moveItem(itemId, dest.page.id, dest.item.slotIndex ?? undefined))
      } else if (target.kind === 'thumb') {
        if (target.pageId === from.page.id) return
        void runPages(() => moveItem(itemId, target.pageId))
      } else {
        if (target.pageId === from.page.id) return
        const dest = pages.find((p) => p.id === target.pageId)
        const geometry = dest?.template === 'FREE' ? { x: Math.round(target.fx * 1000), y: Math.round(target.fy * 1400) } : undefined
        void runPages(() => moveItem(itemId, target.pageId, undefined, geometry))
      }
    },
    [findItem, pages, runPages],
  )

  const editor = useMemo<PageEditor | undefined>(
    () =>
      editing
        ? {
            selectedId,
            onSelect: setSelectedId,
            onFocusPage: setFocusPageId,
            onGeometry: pagesState.setGeometry,
            onDrop: handleDrop,
          }
        : undefined,
    [editing, selectedId, pagesState.setGeometry, handleDrop],
  )

  function toggleEditing() {
    setEditing((on) => !on)
    setSelectedId(null)
    setTrayOpen(false)
  }

  const selected = selectedId ? findItem(selectedId) : null
  const selectedMedia = selected?.item.mediaId ? mediaById.get(selected.item.mediaId) : undefined

  function changePageTemplate(page: PageDto, template: PageTemplate) {
    if (page.template === 'FREE') {
      setConfirm({ kind: 'unfreeze', page, template })
      return
    }
    if (template === 'FREE') {
      // freeze exactly what is drawn right now
      const drawn = layouts.current.find((l) => l.pageId === page.id)
      if (!drawn) return
      void runPages(() => changeTemplate(page.id, 'FREE', page.version, freezePayload(drawn)))
      return
    }
    void runPages(() => changeTemplate(page.id, template, page.version))
  }

  const neighbour = (page: PageDto, delta: -1 | 1) => pages[pages.findIndex((p) => p.id === page.id) + delta]
  const canMoveTo = (dest?: PageDto) => !!dest && (dest.template !== 'AUTO' || mediaItems(dest).length < MAX_AUTO)

  function bringTo(front: boolean) {
    if (!selected) return
    const zs = selected.page.items.map((i) => i.zIndex ?? 0)
    const z = front ? Math.max(...zs) + 1 : Math.max(0, Math.min(...zs) - 1)
    pagesState.setGeometry(selected.item.id, { zIndex: z }, true)
  }

  const trayTarget = pages[focusIndex]
  function addFromTray(mediaId: string) {
    if (!trayTarget) return
    void runPages(() => placeMedia(trayTarget.id, mediaId))
  }
  function dropFromTray(mediaId: string, x: number, y: number) {
    for (const el of document.elementsFromPoint(x, y)) {
      if (!(el instanceof HTMLElement)) continue
      if (el.dataset.thumbPageId) return void runPages(() => placeMedia(el.dataset.thumbPageId as string, mediaId))
      if (el.dataset.itemId && el.dataset.pageId) {
        const slot = Number(el.dataset.slot)
        const pageId = el.dataset.pageId
        return void runPages(() => placeMedia(pageId, mediaId, Number.isFinite(slot) && el.dataset.slot !== '' ? slot : undefined))
      }
      if (el.dataset.pageSurface) {
        const rect = el.getBoundingClientRect()
        const pageId = el.dataset.pageSurface
        const dest = pages.find((p) => p.id === pageId)
        const geometry = dest?.template === 'FREE'
          ? { x: Math.round(((x - rect.left) / rect.width) * 1000), y: Math.round(((y - rect.top) / rect.height) * 1400) }
          : undefined
        return void runPages(() => placeMedia(pageId, mediaId, undefined, geometry))
      }
    }
  }

  // a sticker that was just added is selected, so it can be moved at once
  useEffect(() => {
    const pageId = pendingSticker.current
    if (!pageId || !view) return
    const page = view.pages.find((p) => p.id === pageId)
    const stickers = page?.items.filter((i) => i.kind === 'STICKER') ?? []
    if (stickers.length === 0) return
    pendingSticker.current = null
    setSelectedId(stickers.reduce((a, b) => ((b.zIndex ?? 0) > (a.zIndex ?? 0) ? b : a)).id)
  }, [view])

  /** Page theme from the page panel: the spread (default), only this page, or this page and every later one (asks first). */
  function changeTheme(themeId: string | null, scope: ThemeScope) {
    const index = focusIndex
    const targets = scopeIndexes(pages.length, index, scope).map((i) => pages[i])
    if (targets.length === 0) return
    if (scope === 'rest' && targets.length > 1) {
      setConfirm({ kind: 'themeRest', pages: targets, themeId })
      return
    }
    void applyTheme(targets, themeId)
  }

  function applyTheme(targets: PageDto[], themeId: string | null) {
    if (targets.length === 1) return runPages(() => changePageTheme(targets[0].id, targets[0].version, themeId))
    return runPages(() => applyPageTheme(id, targets.map((p) => ({ id: p.id, version: p.version })), themeId))
  }

  function addStickerToPage(variant: string) {
    const page = pages[focusIndex]
    if (!page) return
    pendingSticker.current = page.id
    void runPages(() => addSticker(page.id, variant, { x: 500, y: 700, width: 170, rotation: 0 }))
  }

  const currentPage = pages[focusIndex]
  const lightboxOpen = openIndex >= 0 && !editing

  // the short "updated" notice disappears by itself
  const { notice, clearNotice } = pagesState
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(clearNotice, 4500)
    return () => clearTimeout(t)
  }, [notice, clearNotice])

  // the calendar's "Albümde göster" links here with ?medya=<id>: turn to the page that holds it (the flag is consumed)
  const wanted = search.get('medya')
  useEffect(() => {
    if (!wanted || !view || !ready) return
    const index = pages.findIndex((p) => p.items.some((i) => i.mediaId === wanted))
    if (index >= 0) {
      setFocusPageId(pages[index].id)
      setGoTo((g) => ({ index, nonce: g.nonce + 1 }))
    }
    setSearch({}, { replace: true })
  }, [wanted, view, ready, pages, setSearch])

  // the shelf menu links here with ?ayarlar=1 to open the settings straight away; the flag is consumed
  useEffect(() => {
    if (search.get('ayarlar') === '1') {
      setSearch({}, { replace: true })
    }
  }, [search, setSearch])

  const refreshMusicUrl = useCallback(async () => {
    const albums = await listAlbums()
    const fresh = albums.find((a) => a.id === id)
    if (fresh) setAlbum(fresh)
    return fresh?.musicUrl ?? null
  }, [id])

  async function saveTheme(themeId: string) {
    const updated = await changeAlbumTheme(id, themeId)
    setAlbum(updated)
    setPreviewThemeId(null)
  }

  if (album === null) {
    // a missing album and one that belongs to another space look exactly the same
    return <ErrorScreen kind="notfound" />
  }

  const shownError = error ?? pagesState.error

  const effects = effectsAllowed({ reduced, hoverCapable, editing, lightboxOpen, ambientOn, hidden: false })
  const cursor = theme.cursor && effects.cursor && assetUrl(theme.id, theme.cursor.file)
  const rootClass = `album-screen${cursor ? ' album-screen--cursor' : ''}`
  const rootStyle = {
    ...themeVars(theme),
    ...(cursor && theme.cursor ? { '--theme-cursor': `url("${cursor}") ${theme.cursor.hotspot[0]} ${theme.cursor.hotspot[1]}, auto` } : {}),
  } as React.CSSProperties

  return (
    <ThemeContext.Provider value={theme}>
    <ErrorBoundary>
    <Ambient enabled={ambientOn} editing={editing} lightboxOpen={lightboxOpen}>
    <main className={rootClass} style={rootStyle}>
      <header className="album-screen__header">
        <Link to="/" className="clay clay--pill clay--sm clay--cream album-screen__back">
          ‹ Albümler
        </Link>
        <h1 className="album-screen__title">{album?.title ?? ''}</h1>
        <span className="album-screen__tools">
          {!reduced && (
            <Clay shape="round" size="sm" tone="cream" onClick={() => setAmbientOn(!ambientOn)} aria-pressed={ambientOn}
              aria-label={ambientOn ? 'Süsleri kapat' : 'Süsleri aç'} title={ambientOn ? 'Süsleri kapat' : 'Süsleri aç'}>
              ✦
            </Clay>
          )}
          <Clay shape="round" size="sm" tone="cream" onClick={() => setShareOpen(true)} aria-label="Paylaş" title="Paylaş" disabled={!album || editing}>
            ⇪
          </Clay>
          <Clay shape="round" size="sm" tone="cream" onClick={() => setSettingsOpen(true)} aria-label="Albüm ayarları" title="Albüm ayarları" disabled={!album}>
            ⚙
          </Clay>
          <Clay shape="round" size="sm" tone={editing ? 'rose' : 'cream'} onClick={toggleEditing}
            aria-label={editing ? 'Düzenlemeyi bitir' : 'Albümü düzenle'} aria-pressed={editing}>
            {editing ? '✓' : '✎'}
          </Clay>
        </span>
      </header>

      {shownError && (
        <p role="alert" className="album-screen__error" onClick={() => { setError(null); pagesState.clearError() }}>
          {shownError}
        </p>
      )}
      {notice && <div className="notice" role="status">{notice}</div>}

      {media === null || view === null || !ready ? (
        <p className="album-screen__loading">Albüm açılıyor…</p>
      ) : (
        <Book
          layout={layout}
          mediaById={mediaById}
          aspects={aspects}
          coverColor={theme.cover.color}
          emptyHint={all.length === 0}
          keyboard={openIndex < 0 && !toDelete && !confirm && !pickedFiles}
          onOpen={(m) => setOpenId(m.id)}
          onRetry={retryProcessing}
          onAspect={onAspect}
          onPosition={onPosition}
          editor={editor}
          goTo={goTo}
          onLayouts={onLayouts}
        />
      )}

      {editing && view && (
        <div className="edit-tools">
          {/* always rendered: a bar that appears and disappears would resize the book and re-layout every page */}
          {!selected && (
            <div className="item-bar"><span className="item-bar__label">Düzenlemek için bir fotoğrafa dokun</span></div>
          )}
          {selected && !selectedMedia && selected.item.kind === 'STICKER' && (
            <div className="item-bar" role="toolbar" aria-label="Seçili çıkartma">
              <span className="item-bar__label">Seçili çıkartma</span>
              <Clay size="sm" tone="cream" onClick={() => bringTo(true)}>Öne getir</Clay>
              <Clay size="sm" tone="cream" onClick={() => bringTo(false)}>Arkaya gönder</Clay>
              <Clay size="sm" tone="rose" onClick={() => { void runPages(() => removeItem(selected.item.id)); setSelectedId(null) }}>Sil</Clay>
            </div>
          )}
          {selected && selectedMedia && (
            <div className="item-bar" role="toolbar" aria-label="Seçili fotoğraf">
              <span className="item-bar__label">Seçili fotoğraf</span>
              <Clay size="sm" tone="cream" onClick={() => void runPages(() => featureMedia(selectedMedia.id))}>Öne çıkar</Clay>
              <Clay size="sm" tone="cream" disabled={!canMoveTo(neighbour(selected.page, -1))}
                onClick={() => void runPages(() => moveItem(selected.item.id, neighbour(selected.page, -1)!.id))}>
                ‹ Önceki sayfaya
              </Clay>
              <Clay size="sm" tone="cream" disabled={!canMoveTo(neighbour(selected.page, 1))}
                onClick={() => void runPages(() => moveItem(selected.item.id, neighbour(selected.page, 1)!.id))}>
                Sonraki sayfaya ›
              </Clay>
              {selected.page.template === 'FREE' && (
                <>
                  <Clay size="sm" tone="cream" onClick={() => bringTo(true)}>Öne getir</Clay>
                  <Clay size="sm" tone="cream" onClick={() => bringTo(false)}>Arkaya gönder</Clay>
                </>
              )}
              <Clay size="sm" tone="cream" onClick={() => void runPages(() => removeItem(selected.item.id))}>Sayfadan kaldır</Clay>
              <Clay size="sm" tone="rose" onClick={() => setToDelete(selectedMedia)}>Sil</Clay>
            </div>
          )}
          <PageBar
            pages={pages}
            mediaById={mediaById}
            current={focusIndex}
            onGo={(index) => { setFocusPageId(pages[index]?.id ?? null); setGoTo((g) => ({ index, nonce: g.nonce + 1 })) }}
            onReorder={(ids) => void runPages(() => reorderPages(id, ids))}
            onAdd={(after) => void runPages(() => createPage(id, after, 'AUTO'))}
            onDelete={(page) => setConfirm({ kind: 'deletePage', page })}
            onTemplate={changePageTemplate}
          />
          <div className="item-bar">
            <Clay size="sm" tone="cream" disabled={!currentPage} onClick={() => { setPanelOpen(true); setTrayOpen(false) }}>Tema, renk, doku, çıkartma</Clay>
            {trayMedia.length > 0 && !trayOpen && (
              <Clay size="sm" tone="cream" onClick={() => { setTrayOpen(true); setPanelOpen(false) }}>Tepsi ({trayMedia.length})</Clay>
            )}
          </div>
        </div>
      )}

      {editing && panelOpen && currentPage && (
        <PagePanel
          page={currentPage}
          single={bookCols === 1}
          onTheme={changeTheme}
          onLook={(look) => void runPages(() => changePageLook(currentPage.id, currentPage.version, look))}
          onSticker={addStickerToPage}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {editing && trayOpen && trayMedia.length > 0 && (
        <Tray media={trayMedia} targetLabel={`${focusIndex + 1}.`} onAdd={addFromTray} onDrop={dropFromTray} onClose={() => setTrayOpen(false)} />
      )}

      {openIndex >= 0 && !editing && (
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
          themeOf={themeOfMedia}
          menuExtra={(m, close) => {
            const ready = m.status === 'READY'
            const run = (type: ExportType, params: Record<string, unknown>) => {
              close()
              exportsState.start(type, { mediaId: m.id, ...params })
                .then(() => setOpenId(null))
                .catch((e: Error) => setError(e.message))
            }
            return (
              <>
                <Clay size="sm" tone="cream" role="menuitem" onClick={() => { close(); setDateEdit(m) }}>Tarihi düzelt</Clay>
                <p className="lightbox__menu-title">İndir / Paylaş</p>
                <Clay size="sm" tone="cream" role="menuitem" disabled={!ready} onClick={() => run('POLAROID', { background: 'transparent' })}>Polaroid olarak indir (şeffaf)</Clay>
                <Clay size="sm" tone="cream" role="menuitem" disabled={!ready} onClick={() => run('POLAROID', { background: 'page' })}>Polaroid olarak indir (sayfa arka planlı)</Clay>
                {m.loopUrl && <Clay size="sm" tone="cream" role="menuitem" disabled={!ready} onClick={() => run('POLAROID', { motion: true })}>Hareketli polaroid (video)</Clay>}
                <Clay size="sm" tone="cream" role="menuitem" disabled={!ready} onClick={() => run('STORY', {})}>Instagram Story</Clay>
                <Clay size="sm" tone="cream" role="menuitem" disabled={!ready} onClick={() => run('POST', {})}>Instagram gönderisi</Clay>
                <Clay size="sm" tone="cream" role="menuitem" onClick={() => {
                  close()
                  getOriginal(m.id).then((o) => {
                    download({ url: o.url, name: o.filename, contentType: m.contentType })
                  }).catch((e: Error) => setError(e.message))
                }}>Orijinal dosya</Clay>
              </>
            )
          }}
        />
      )}

      {dateEdit && (
        <DateEditDialog
          media={dateEdit}
          onClose={() => setDateEdit(null)}
          onSaved={(updated) => setMedia((list) => list?.map((x) => (x.id === updated.id ? updated : x)) ?? list)}
        />
      )}

      {shareOpen && album && (
        <SharePanel
          album={album}
          pages={pages}
          media={items.filter((m) => m.status === 'READY')}
          mediaById={mediaById}
          jobs={exportsState.jobs}
          onStart={async (type, params) => {
            await exportsState.start(type, params)
            setShareOpen(false)
          }}
          onClose={() => setShareOpen(false)}
        />
      )}

      {exportsState.cards.length > 0 && !editing && (
        <div className="export-cards">
          {exportsState.cards.map((job) => <ExportCard key={job.id} job={job} onDismiss={() => exportsState.dismiss(job.id)} />)}
        </div>
      )}

      {toDelete && (
        <ConfirmDialog
          title="Fotoğraf silinsin mi?"
          message={`"${toDelete.caption || toDelete.originalFilename}" albümden kalkacak ve 30 gün sonra kalıcı olarak silinir.`}
          confirmLabel="Sil"
          onClose={() => setToDelete(null)}
          onConfirm={confirmDelete}
        />
      )}

      {confirm?.kind === 'unfreeze' && (
        <ConfirmDialog
          title="Serbest düzen silinsin mi?"
          message="Fotoğrafların elle verdiğin konumları silinir; fotoğraflar sırayla otomatik yerleşir."
          confirmLabel="Otomatiğe geç"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const { page, template } = confirm
            await runPages(() => changeTemplate(page.id, template, page.version))
          }}
        />
      )}
      {confirm?.kind === 'themeRest' && (
        <ConfirmDialog
          title="Tema sonraki sayfalara da uygulansın mı?"
          message={`Bu sayfa ve sonraki ${confirm.pages.length - 1} sayfa (albümün sonuna kadar) seçtiğin temayı alacak.`}
          confirmLabel="Uygula"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await applyTheme(confirm.pages, confirm.themeId)
          }}
        />
      )}
      {confirm?.kind === 'deletePage' && (
        <ConfirmDialog
          title="Sayfa silinsin mi?"
          message="Sayfadaki fotoğraflar silinmez; tepsiye geri döner ve istediğin sayfaya yeniden koyabilirsin."
          confirmLabel="Sayfayı sil"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            const { page } = confirm
            await runPages(() => deletePage(page.id, page.version))
          }}
        />
      )}

      {pickedFiles && (
        <UploadSetupDialog
          files={pickedFiles}
          onCancel={() => setPickedFiles(null)}
          onStart={(files, single) => {
            setPickedFiles(null)
            add(files, single)
          }}
        />
      )}

      {settingsOpen && album && (
        <AlbumSettings
          album={album}
          previewThemeId={previewThemeId ?? album.themeId}
          onPreview={setPreviewThemeId}
          onSaveTheme={saveTheme}
          onAlbum={setAlbum}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <AlbumMusic url={album?.musicUrl ?? null} refreshUrl={refreshMusicUrl} />
      {theme.hover.compass && effects.compass && <CompassNeedle />}

      <UploadPanel entries={entries} onRetry={retry} onClear={clearFinished} />

      <input ref={fileInput} type="file" multiple accept="image/*,video/*" onChange={onFiles} hidden />
      {/* hidden while editing: it would sit on top of the editing tools, and uploading is done outside the editor */}
      {!editing && (
        <Clay shape="seal" className="album-screen__add" onClick={() => fileInput.current?.click()} aria-label="Dosya ekle">
          +
        </Clay>
      )}
    </main>
    </Ambient>
    </ErrorBoundary>
    </ThemeContext.Provider>
  )
}
