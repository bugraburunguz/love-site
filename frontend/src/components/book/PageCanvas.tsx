import { lazy, Suspense, useRef } from 'react'
import type { MediaDto } from '../../api/albums'
import { PAGE_H, PAGE_W, type Metrics } from '../../layout/geometry'
import type { PageLayout } from '../../layout/types'
import LivingPhoto from '../LivingPhoto'
import { Sticker, Tape } from '../ornaments/Ornaments'
import type { PageEditor } from './editor'
import type { PageItem } from '../../layout/types'
import './book.css'

// interact.js is only needed while editing: it is loaded on first use and kept out of the main bundle
const ItemEditor = lazy(() => import('./ItemEditor'))

interface Props {
  /** null renders a blank sheet (the unused half of the last spread) */
  layout: PageLayout | null
  mediaById: ReadonlyMap<string, MediaDto>
  aspects: Readonly<Record<string, number>>
  /** page units -> screen pixels; computed once by the book */
  scale: number
  /** text size rules for this screen; the same metrics the layout was generated with */
  metrics: Metrics
  side: 'left' | 'right' | 'single'
  /** 1-based number printed at the bottom, omitted for blank sheets */
  pageNumber?: number
  interactive?: boolean
  emptyHint?: boolean
  onOpen?: (media: MediaDto) => void
  onRetry?: (media: MediaDto) => void | Promise<void>
  onAspect?: (mediaId: string, aspect: number) => void
  /** present while the page is being edited: photos get handles and stop reacting to hover / click */
  editor?: PageEditor
}

function EditablePhoto({
  item, style, media, aspect, metrics, scale, editor, layout, slot,
}: {
  item: PageItem; style: Record<string, string | number>; media: MediaDto; aspect?: number; metrics: Metrics; scale: number
  editor: PageEditor; layout: PageLayout; slot: number | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="page-item" style={style}>
      <LivingPhoto media={media} width={item.width} aspect={aspect} metrics={metrics} interactive={false} />
      <Suspense fallback={null}>
        <ItemEditor
          itemId={item.id}
          pageId={layout.pageId ?? ''}
          free={layout.template === 'FREE'}
          slot={slot}
          geometry={{ x: item.x, y: item.y, width: item.width, rotation: item.rotation, zIndex: item.zIndex }}
          scale={scale}
          selected={editor.selectedId === item.id}
          itemRef={ref}
          editor={editor}
        />
      </Suspense>
    </div>
  )
}

/**
 * Draws one page from data only: it receives a PageLayout and positions everything in page units
 * (PAGE_W x PAGE_H) inside a single scaled container. Where the layout came from does not matter.
 */
export default function PageCanvas({
  layout, mediaById, aspects, scale, metrics, side, pageNumber, interactive = true, emptyHint, onOpen, onRetry, onAspect, editor,
}: Props) {
  const items = layout ? [...layout.items].sort((a, b) => a.zIndex - b.zIndex) : []
  const editing = editor !== undefined && layout?.pageId !== undefined
  const slotOf = (id: string) => {
    const order = items.filter((i) => i.kind === 'MEDIA')
    const at = order.findIndex((i) => i.id === id)
    return at < 0 ? null : at
  }
  return (
    <div className={`page page--${side}${editing ? ' page--editing' : ''}`} style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
      <div
        className="page__inner"
        style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})` }}
        data-page-surface={editing ? layout?.pageId : undefined}
        onPointerDown={editing ? (e) => {
          if (e.target === e.currentTarget) editor.onSelect(null)
          if (layout?.pageId) editor.onFocusPage(layout.pageId)
        } : undefined}
      >
        {items.map((item) => {
          const style = {
            left: item.x,
            top: item.y,
            width: item.width,
            zIndex: item.zIndex,
            transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
          }
          if (item.kind === 'MEDIA') {
            const media = item.mediaId ? mediaById.get(item.mediaId) : undefined
            if (!media) return null
            if (editing) {
              return (
                <EditablePhoto key={item.id} item={item} style={style} media={media} aspect={aspects[media.id]} metrics={metrics}
                  scale={scale} editor={editor} layout={layout!} slot={slotOf(item.id)} />
              )
            }
            return (
              <div key={item.id} className="page-item" style={style}>
                <LivingPhoto
                  media={media}
                  width={item.width}
                  aspect={aspects[media.id]}
                  metrics={metrics}
                  interactive={interactive}
                  onOpen={onOpen}
                  onRetry={onRetry}
                  onAspect={onAspect}
                />
              </div>
            )
          }
          return (
            <div key={item.id} className="page-item page-item--deco" style={style}>
              {item.kind === 'TAPE' ? <Tape variant={item.variant} /> : <Sticker variant={item.variant} />}
            </div>
          )
        })}

        {emptyHint && (
          <div className="page__hint">
            <span>İlk anınızı ekleyin</span>
            <svg viewBox="0 0 220 160" aria-hidden="true">
              <path d="M10 20 C 90 0, 190 40, 160 120" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 12" />
              <path d="M130 100 L160 130 L192 96" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        {pageNumber !== undefined && <div className="page__number">{pageNumber}</div>}
      </div>
    </div>
  )
}
