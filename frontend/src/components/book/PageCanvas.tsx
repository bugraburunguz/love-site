import type { MediaDto } from '../../api/albums'
import { PAGE_H, PAGE_W, type Metrics } from '../../layout/geometry'
import type { PageLayout } from '../../layout/types'
import LivingPhoto from '../LivingPhoto'
import { Sticker, Tape } from '../ornaments/Ornaments'
import './book.css'

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
}

/**
 * Draws one page from data only: it receives a PageLayout and positions everything in page units
 * (PAGE_W x PAGE_H) inside a single scaled container. Where the layout came from does not matter.
 */
export default function PageCanvas({
  layout, mediaById, aspects, scale, metrics, side, pageNumber, interactive = true, emptyHint, onOpen, onRetry, onAspect,
}: Props) {
  const items = layout ? [...layout.items].sort((a, b) => a.zIndex - b.zIndex) : []
  return (
    <div className={`page page--${side}`} style={{ width: PAGE_W * scale, height: PAGE_H * scale }}>
      <div className="page__inner" style={{ width: PAGE_W, height: PAGE_H, transform: `scale(${scale})` }}>
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
