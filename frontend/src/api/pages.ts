import { api } from './client'

export type PageTemplate = 'AUTO' | 'FEATURED' | 'FREE'

export interface PageItemDto {
  id: string
  kind: 'MEDIA' | 'STICKER' | 'TAPE' | 'TEXT'
  mediaId: string | null
  slotIndex: number | null
  x: number | null
  y: number | null
  width: number | null
  rotation: number | null
  zIndex: number | null
  variant: string | null
  version: number
}

export interface PageDto {
  id: string
  albumId: string
  pageIndex: number
  template: PageTemplate
  version: number
  swatch: string | null
  paper: string | null
  items: PageItemDto[]
}

export interface PagesView {
  pages: PageDto[]
  /** live media of the album that is on no page */
  tray: string[]
}

export interface Geometry {
  x?: number
  y?: number
  width?: number
  rotation?: number
  zIndex?: number
}

export interface FrozenItem {
  id: string
  x: number
  y: number
  width: number
  rotation: number
  zIndex: number
}

export const getPages = (albumId: string) => api<PagesView>(`/api/albums/${albumId}/pages`)
export const initializePages = (albumId: string, pages: { template: PageTemplate; mediaIds: string[] }[]) =>
  api<PagesView>(`/api/albums/${albumId}/pages/initialize`, { method: 'POST', body: { pages } })
export const createPage = (albumId: string, afterPageIndex: number, template: PageTemplate) =>
  api<PagesView>(`/api/albums/${albumId}/pages`, { method: 'POST', body: { afterPageIndex, template } })
export const reorderPages = (albumId: string, pageIds: string[]) =>
  api<PagesView>(`/api/albums/${albumId}/pages/reorder`, { method: 'POST', body: { pageIds } })
export const changeTemplate = (pageId: string, template: PageTemplate, version: number, items?: FrozenItem[]) =>
  api<PagesView>(`/api/pages/${pageId}`, { method: 'PATCH', body: { template, version, items } })
/** swatch / paper: a slot, or 'DEFAULT' to go back to the theme's choice */
export const changePageLook = (pageId: string, version: number, look: { swatch?: string; paper?: string }) =>
  api<PagesView>(`/api/pages/${pageId}`, { method: 'PATCH', body: { version, ...look } })
export const addSticker = (pageId: string, variant: string, geometry: Geometry) =>
  api<PagesView>('/api/page-items', { method: 'POST', body: { pageId, kind: 'STICKER', variant, ...geometry } })
export const deletePage = (pageId: string, version: number) =>
  api<PagesView>(`/api/pages/${pageId}?version=${version}`, { method: 'DELETE' })
export const patchItem = (itemId: string, geometry: Geometry, version: number) =>
  api<PageItemDto>(`/api/page-items/${itemId}`, { method: 'PATCH', body: { ...geometry, version } })
export const moveItem = (itemId: string, targetPageId: string, slotIndex?: number, geometry?: Geometry) =>
  api<PagesView>(`/api/page-items/${itemId}/move`, { method: 'POST', body: { targetPageId, slotIndex, ...geometry } })
export const placeMedia = (pageId: string, mediaId: string, slotIndex?: number, geometry?: Geometry) =>
  api<PagesView>('/api/page-items', { method: 'POST', body: { pageId, mediaId, slotIndex, ...geometry } })
export const removeItem = (itemId: string) => api<PagesView>(`/api/page-items/${itemId}`, { method: 'DELETE' })
export const featureMedia = (mediaId: string) => api<PagesView>(`/api/media/${mediaId}/feature`, { method: 'POST' })
