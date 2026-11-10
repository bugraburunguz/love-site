import type { Geometry, PageItemDto, PagesView } from '../../api/pages'
import { EditHistory } from './history'

/** The parts of usePages the undoable edits need. */
export interface PagesApi {
  current: () => PagesView | null
  runFor: (op: () => Promise<PagesView>) => Promise<PagesView | null>
  setGeometry: (itemId: string, geometry: Geometry, final: boolean) => void
}

/** The page writes the undo steps use (the real ones come from api/pages; tests pass fakes). */
export interface PageOps {
  removeItem: (itemId: string) => Promise<PagesView>
  placeMedia: (pageId: string, mediaId: string, slotIndex?: number, geometry?: Geometry) => Promise<PagesView>
  addSticker: (pageId: string, variant: string, geometry: Geometry) => Promise<PagesView>
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
 * (e.g. "moved") still find the item. reset() is called whenever the pages changed in a way the steps did not record
 * (a non-undoable edit, a conflict reload, a failed save).
 */
export class UndoableEdits {
  readonly history = new EditHistory()
  private gestureStart = new Map<string, Geometry>()
  private alias = new Map<string, string>()

  constructor(private readonly api: PagesApi, private readonly ops: PageOps) {}

  reset() {
    this.history.clear()
    this.gestureStart.clear()
    this.alias.clear()
  }

  private resolve(id: string) {
    let at = id
    for (let i = 0; i < 100 && this.alias.has(at); i++) at = this.alias.get(at)!
    return at
  }

  private itemById(id: string) {
    return this.api.current()?.pages.flatMap((p) => p.items).find((i) => i.id === id) ?? null
  }

  private stickerIds(view: PagesView | null, pageId: string) {
    return new Set(view?.pages.find((p) => p.id === pageId)?.items.filter((i) => i.kind === 'STICKER').map((i) => i.id) ?? [])
  }

  /** adds a sticker and answers its new id (null on failure) */
  private async putSticker(pageId: string, variant: string, geometry: Geometry): Promise<string | null> {
    const before = this.stickerIds(this.api.current(), pageId)
    const view = await this.api.runFor(() => this.ops.addSticker(pageId, variant, geometry))
    if (!view) return null
    return [...this.stickerIds(view, pageId)].find((id) => !before.has(id)) ?? null
  }

  onGeometry = (itemId: string, geometry: Geometry, final: boolean) => {
    if (!this.gestureStart.has(itemId)) {
      const item = this.itemById(itemId)
      if (item) this.gestureStart.set(itemId, geometryOf(item))
    }
    this.api.setGeometry(itemId, geometry, final)
    if (!final) return
    const before = this.gestureStart.get(itemId)
    this.gestureStart.delete(itemId)
    const now = this.itemById(itemId)
    if (!before || !now) return
    const after = geometryOf(now)
    if (same(before, after)) return
    const apply = (g: Geometry) => async () => {
      const id = this.resolve(itemId)
      if (!this.itemById(id)) return false
      this.api.setGeometry(id, g, true)
      return true
    }
    this.history.push({ label: 'Konum değişikliği', undo: apply(before), redo: apply(after) })
  }

  /** Takes an item off its page (a photo goes back to the tray); undo puts it back where it was. */
  removeFromPage = async (itemId: string) => {
    const page = this.api.current()?.pages.find((p) => p.items.some((i) => i.id === itemId))
    const item = page?.items.find((i) => i.id === itemId)
    if (!page || !item) return
    const removed = await this.api.runFor(() => this.ops.removeItem(itemId))
    if (!removed) return
    const geometry = geometryOf(item)
    const template = page.template
    this.history.push({
      label: item.kind === 'STICKER' ? 'Çıkartmayı kaldırma' : 'Sayfadan kaldırma',
      undo: async () => {
        const now = this.api.current()?.pages.find((p) => p.id === page.id)
        // the page went away or got another layout: the old place no longer exists
        if (!now || now.template !== template) return false
        if (item.kind === 'STICKER' && item.variant) {
          const id = await this.putSticker(page.id, item.variant, geometry)
          if (id) this.alias.set(itemId, id)
          return id !== null
        }
        if (!item.mediaId) return false
        // a single-photo page that holds another photo now would push that one out
        if (template === 'FEATURED' && now.items.some((i) => i.kind === 'MEDIA')) return false
        const mediaId = item.mediaId
        const free = template === 'FREE'
        const back = await this.api.runFor(() =>
          this.ops.placeMedia(page.id, mediaId, free ? undefined : item.slotIndex ?? undefined, free ? geometry : undefined))
        const placed = back?.pages.find((p) => p.id === page.id)?.items.find((i) => i.mediaId === mediaId)
        if (placed) this.alias.set(itemId, placed.id)
        return !!placed
      },
      redo: async () => !!(await this.api.runFor(() => this.ops.removeItem(this.resolve(itemId)))),
    })
  }

  /** Adds a sticker to a page; undo takes it off again. Answers the new sticker's id. */
  addStickerTo = async (pageId: string, variant: string, geometry: Geometry) => {
    const id = await this.putSticker(pageId, variant, geometry)
    if (!id) return null
    this.history.push({
      label: 'Çıkartma ekleme',
      undo: async () => !!(await this.api.runFor(() => this.ops.removeItem(this.resolve(id)))),
      redo: async () => {
        const again = await this.putSticker(pageId, variant, geometry)
        if (again) this.alias.set(id, again)
        return again !== null
      },
    })
    return id
  }
}
