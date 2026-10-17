/**
 * Page model shared by the layout generator and the renderer.
 * Everything is expressed in page units (a page is PAGE_W x PAGE_H); pixels never appear here.
 * Phase 5 will load PageLayout[] from the database instead of calling autoLayout, with no change to the renderer.
 */
export type PageItem = {
  id: string
  kind: 'MEDIA' | 'TAPE' | 'STICKER'
  mediaId?: string
  /** centre of the item, in page units */
  x: number
  y: number
  /** page units; height follows the media aspect ratio */
  width: number
  /** degrees */
  rotation: number
  zIndex: number
  /** tape colour, sticker kind, ... */
  variant?: string
}

export type PageLayout = {
  pageIndex: number
  items: PageItem[]
  /** set for stored pages: the editor needs to know which page and template it is drawing */
  pageId?: string
  template?: 'AUTO' | 'FEATURED' | 'FREE'
}
