import { useCallback, useMemo, useRef } from 'react'
import { addSticker, placeMedia, removeItem, type Geometry, type PageItemDto, type PagesView } from '../../api/pages'
import { EditHistory } from './history'

/** The parts of usePages the undoable edits need. */
interface PagesApi {
  current: () => PagesView | null
  runFor: (op: () => Promise<PagesView>) => Promise<PagesView | null>
  setGeometry: (itemId: string, geometry: Geometry, final: boolean) => void
}

function geometryOf(item: PageItemDto): Geometry {
  return {
    x: item.x ?? undefined,
    y: item.y ?? undefined,
    width: item.width ?? undefined,
    rotation: item.rotation ?? undefined,
    zIndex: item.zIndex ?? undefined,
  }
}

const same = (a: Geometry, b: Geometry) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.rotation === b.rotation && a.zIndex === b.zIndex

/**
 * Undoable editor actions: moving / rotating / scaling / restacking an item, taking an item off a page, adding a sticker.
 * An item that comes back gets a new id from the server; `alias` maps every old id to its newest one, so older steps
 * (e.g. "moved") still find the item.
 */
export function useUndoableEdits(pages: PagesApi) {
  const history = useMemo(() => new EditHistory(), [])
  const gestureStart = useRef(new Map<string, Geometry>())
  const alias = useRef(new Map<string, string>())
  const api = useRef(pages)
  api.current = pages

  const resolve = (id: string) => {
    let at = id
    for (let i = 0; i < 100 && alias.current.has(at); i++) at = alias.current.get(at)!
    return at
  }
  const itemById = (id: string) => api.current.current()?.pages.flatMap((p) => p.items).find((i) => i.id === id) ?? null
  const stickerIds = (view: PagesView | null, pageId: string) =>
    new Set(view?.pages.find((p) => p.id === pageId)?.items.filter((i) => i.kind === 'STICKER').map((i) => i.id) ?? [])

  /** adds a sticker and answers its new id (null on failure) */
  const putSticker = async (pageId: string, variant: string, geometry: Geometry): Promise<string | null> => {
    const before = stickerIds(api.current.current(), pageId)
    const view = await api.current.runFor(() => addSticker(pageId, variant, geometry))
    if (!view) return null
    return [...stickerIds(view, pageId)].find((id) => !before.has(id)) ?? null
  }

  const onGeometry = useCallback((itemId: string, geometry: Geometry, final: boolean) => {
    if (!gestureStart.current.has(itemId)) {
      const item = itemById(itemId)
      if (item) gestureStart.current.set(itemId, geometryOf(item))
    }
    api.current.setGeometry(itemId, geometry, final)
    if (!final) return
    const before = gestureStart.current.get(itemId)
    gestureStart.current.delete(itemId)
    const now = itemById(itemId)
    if (!before || !now) return
    const after = geometryOf(now)
    if (same(before, after)) return
    const apply = (g: Geometry) => async () => {
      const id = resolve(itemId)
      if (!itemById(id)) return false
      api.current.setGeometry(id, g, true)
      return true
    }
    history.push({ label: 'Konum değişikliği', undo: apply(before), redo: apply(after) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history])

  /** Takes an item off its page (a photo goes back to the tray); undo puts it back where it was. */
  const removeFromPage = useCallback(async (itemId: string) => {
    const view = api.current.current()
    const page = view?.pages.find((p) => p.items.some((i) => i.id === itemId))
    const item = page?.items.find((i) => i.id === itemId)
    if (!page || !item) return
    const removed = await api.current.runFor(() => removeItem(itemId))
    if (!removed) return
    const geometry = geometryOf(item)
    const free = page.template === 'FREE'
    history.push({
      label: item.kind === 'STICKER' ? 'Çıkartmayı kaldırma' : 'Sayfadan kaldırma',
      undo: async () => {
        if (item.kind === 'STICKER' && item.variant) {
          const id = await putSticker(page.id, item.variant, geometry)
          if (id) alias.current.set(itemId, id)
          return id !== null
        }
        if (!item.mediaId) return false
        const mediaId = item.mediaId
        const back = await api.current.runFor(() => placeMedia(page.id, mediaId, item.slotIndex ?? undefined, free ? geometry : undefined))
        const placed = back?.pages.find((p) => p.id === page.id)?.items.find((i) => i.mediaId === mediaId)
        if (placed) alias.current.set(itemId, placed.id)
        return !!placed
      },
      redo: async () => !!(await api.current.runFor(() => removeItem(resolve(itemId)))),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history])

  /** Adds a sticker to a page; undo takes it off again. Answers the new sticker's id. */
  const addStickerTo = useCallback(async (pageId: string, variant: string, geometry: Geometry) => {
    const id = await putSticker(pageId, variant, geometry)
    if (!id) return null
    history.push({
      label: 'Çıkartma ekleme',
      undo: async () => !!(await api.current.runFor(() => removeItem(resolve(id)))),
      redo: async () => {
        const again = await putSticker(pageId, variant, geometry)
        if (again) alias.current.set(id, again)
        return again !== null
      },
    })
    return id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history])

  return { history, onGeometry, removeFromPage, addStickerTo }
}
