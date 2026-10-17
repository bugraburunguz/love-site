import type { Geometry } from '../../api/pages'

/** Where a dragged photo was dropped. */
export type DropTarget =
  | { kind: 'item'; itemId: string; pageId: string }
  | { kind: 'page'; pageId: string; /** drop position as a fraction of the page */ fx: number; fy: number }
  | { kind: 'thumb'; pageId: string }

/** What the book needs from the album screen while a page is being edited. */
export interface PageEditor {
  selectedId: string | null
  onSelect: (itemId: string | null) => void
  onFocusPage: (pageId: string) => void
  /** live position changes; `final` when the gesture ended */
  onGeometry: (itemId: string, geometry: Geometry, final: boolean) => void
  onDrop: (itemId: string, target: DropTarget) => void
}
