import type { PageDto, PageItemDto, FrozenItem } from '../api/pages'
import { layoutAutoPage, layoutFeaturedPage, type Decor } from './autoLayout'
import { DESKTOP_METRICS, type Metrics } from './geometry'
import type { PageItem, PageLayout } from './types'

const DEFAULTS = { x: 500, y: 700, width: 400, rotation: 0 }

function mediaItemsInOrder(page: PageDto): PageItemDto[] {
  return page.items
    .filter((i) => i.kind === 'MEDIA' && i.mediaId)
    .sort((a, b) => (a.slotIndex ?? 1e9) - (b.slotIndex ?? 1e9) || (a.zIndex ?? 0) - (b.zIndex ?? 0))
}

/** FREE template: the stored positions, as they are. Items without media (stickers, later) keep their own variant. */
export function layoutFreePage(page: PageDto): PageLayout {
  const items: PageItem[] = page.items.map((i, n) => ({
    id: i.id,
    kind: i.kind === 'MEDIA' ? 'MEDIA' : i.kind === 'TAPE' ? 'TAPE' : 'STICKER',
    mediaId: i.mediaId ?? undefined,
    x: i.x ?? DEFAULTS.x,
    y: i.y ?? DEFAULTS.y,
    width: i.width ?? DEFAULTS.width,
    rotation: i.rotation ?? DEFAULTS.rotation,
    zIndex: i.zIndex ?? 10 + n,
    variant: i.variant ?? undefined,
    stored: true,
  }))
  return { pageIndex: page.pageIndex, items }
}

/**
 * One stored page -> positioned items. AUTO and FEATURED pages are computed right here from the stored order (so they
 * adapt to the screen), FREE pages use their stored positions. The layout item id of a photo is its page item id.
 */
export function layoutPage(page: PageDto, aspects: Readonly<Record<string, number>>, metrics: Metrics = DESKTOP_METRICS, decor?: Decor): PageLayout {
  const layout = layoutPageItems(page, aspects, metrics, decor)
  return { ...layout, pageId: page.id, template: page.template, swatch: page.swatch, paper: page.paper }
}

function layoutPageItems(page: PageDto, aspects: Readonly<Record<string, number>>, metrics: Metrics, decor?: Decor): PageLayout {
  if (page.template === 'FREE') return layoutFreePage(page)
  const media = mediaItemsInOrder(page).map((i) => ({ id: i.mediaId as string, itemId: i.id }))
  const computed = page.template === 'FEATURED'
    ? layoutFeaturedPage(media[0], page.id, aspects, metrics, page.pageIndex, decor)
    : layoutAutoPage(media, page.id, aspects, metrics, page.pageIndex, decor)
  // stickers placed by hand lie on top of whatever the engine drew (the engine ignores them)
  const stickers: PageItem[] = page.items
    .filter((i) => i.kind === 'STICKER')
    .map((i, n) => ({
      id: i.id, kind: 'STICKER' as const, x: i.x ?? 500, y: i.y ?? 700, width: i.width ?? 140, rotation: i.rotation ?? 0,
      zIndex: i.zIndex ?? 1000 + n, variant: i.variant ?? undefined, stored: true,
    }))
  return { ...computed, items: [...computed.items, ...stickers] }
}

/**
 * The payload for turning a page into a FREE page: exactly the positions that are drawn right now (photos only), so
 * nothing jumps when the page becomes editable.
 */
export function freezePayload(layout: PageLayout): FrozenItem[] {
  return layout.items
    .filter((i) => i.kind === 'MEDIA')
    .map((i) => ({ id: i.id, x: i.x, y: i.y, width: i.width, rotation: i.rotation, zIndex: i.zIndex }))
}
