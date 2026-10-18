import { lazy, Suspense, useRef } from 'react'
import type { MediaDto } from '../../api/albums'
import { PAGE_H, PAGE_W, type Metrics } from '../../layout/geometry'
import type { PageItem, PageLayout } from '../../layout/types'
import { useHoverCapable, useReducedMotion } from '../../hooks/useReducedMotion'
import { pageThemeVars, pageVars } from '../../themes/cssVars'
import { resolvePageTheme } from '../../themes/pageTheme'
import { ThemeContext, useTheme } from '../../themes/ThemeContext'
import { PageAmbient, useAmbientState, type PageAmbientHandle } from '../Ambient'
import LivingPhoto from '../LivingPhoto'
import { ThemeSticker, ThemeTape } from '../ornaments/ThemeOrnaments'
import type { PageEditor } from './editor'
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
  side: 'left' | 'right' | 'single' | 'flat'
  /** 1-based number printed at the bottom, omitted for blank sheets */
  pageNumber?: number
  interactive?: boolean
  emptyHint?: boolean
  onOpen?: (media: MediaDto) => void
  onRetry?: (media: MediaDto) => void | Promise<void>
  onAspect?: (mediaId: string, aspect: number) => void
  /** present while the page is being edited: photos get handles and stop reacting to hover / click */
  editor?: PageEditor
  /** handwriting under the page content (the last page of a theme that has an end note) */
  endNote?: string
  /** share of the theme's ambient particles this page gets (a page of a two-page spread is half the screen) */
  ambientShare?: number
  /** a surface of another size than an album page (export scenes: a story is 1080 x 1920 units) */
  size?: { width: number; height: number }
  /** no paper at all: only the items (transparent export images) */
  bare?: boolean
}

function EditableItem({
  item, style, children, scale, editor, layout, slot, free,
}: {
  item: PageItem; style: Record<string, string | number>; children: React.ReactNode; scale: number
  editor: PageEditor; layout: PageLayout; slot: number | null; free: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="page-item" style={style}>
      {children}
      <Suspense fallback={null}>
        <ItemEditor
          itemId={item.id}
          pageId={layout.pageId ?? ''}
          free={free}
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
 * Colour and paper of the page come from the album's theme through CSS variables.
 */
export default function PageCanvas({
  layout, mediaById, aspects, scale, metrics, side, pageNumber, interactive = true, emptyHint, onOpen, onRetry, onAspect, editor, endNote,
  ambientShare = 1, size, bare,
}: Props) {
  const W = size?.width ?? PAGE_W
  const H = size?.height ?? PAGE_H
  // everything on the page follows the page's theme; the album theme stays outside (cover, binding, controls)
  const albumTheme = useTheme()
  const theme = resolvePageTheme(layout?.themeId, albumTheme)
  const ambientRef = useRef<PageAmbientHandle>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const { burst: burstAllowed } = useAmbientState()
  const reduced = useReducedMotion()
  const hoverCapable = useHoverCapable()
  const burst = interactive && burstAllowed && theme.hover.burst
    ? (x: number, y: number) => {
        const rect = pageRef.current?.getBoundingClientRect()
        if (rect) ambientRef.current?.burst(x - rect.left, y - rect.top)
      }
    : undefined
  const wiggle = theme.hover.wiggle && hoverCapable && !reduced && editor === undefined
  const items = layout ? [...layout.items].sort((a, b) => a.zIndex - b.zIndex) : []
  const editing = editor !== undefined && layout?.pageId !== undefined
  const slotOf = (id: string) => {
    const order = items.filter((i) => i.kind === 'MEDIA')
    const at = order.findIndex((i) => i.id === id)
    return at < 0 ? null : at
  }
  const free = layout?.template === 'FREE'
  return (
    <ThemeContext.Provider value={theme}>
    <div
      ref={pageRef}
      className={`page page--${side}${editing ? ' page--editing' : ''}${wiggle ? ' themed-wiggle' : ''}${bare ? ' page--bare' : ''}`}
      data-page-theme={theme.id}
      style={{
        width: W * scale, height: H * scale, ...pageThemeVars(theme), ...pageVars(theme, layout?.swatch, layout?.paper),
        ...(bare ? { '--perf-color': 'transparent' } as React.CSSProperties : {}),
      }}
    >
      <div
        className="page__inner"
        style={{ width: W, height: H, transform: `scale(${scale})` }}
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
                <EditableItem key={item.id} item={item} style={style} scale={scale} editor={editor} layout={layout!} slot={slotOf(item.id)} free={free}>
                  <LivingPhoto media={media} width={item.width} aspect={aspects[media.id]} metrics={metrics} interactive={false} />
                </EditableItem>
              )
            }
            return (
              <div
                key={item.id}
                className="page-item"
                style={style}
                onPointerEnter={interactive && burst ? (e) => e.pointerType === 'mouse' && burst(e.clientX, e.clientY) : undefined}
              >
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
          if (item.kind === 'STICKER' && item.stored) {
            // a sticker placed by hand: movable while editing, wiggles under the mouse otherwise
            if (editing) {
              return (
                <EditableItem key={item.id} item={item} style={style} scale={scale} editor={editor} layout={layout!} slot={null} free>
                  <ThemeSticker variant={item.variant} />
                </EditableItem>
              )
            }
            return (
              <div key={item.id} className="page-item page-item--sticker" style={style}>
                <ThemeSticker variant={item.variant} />
              </div>
            )
          }
          return (
            <div key={item.id} className="page-item page-item--deco" style={style}>
              {item.kind === 'TAPE' ? <ThemeTape variant={item.variant} /> : <ThemeSticker variant={item.variant} />}
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

        {endNote && <div className="page__endnote">{endNote}</div>}
        {pageNumber !== undefined && <div className="page__number">{pageNumber}</div>}
      </div>
      {interactive && layout && (
        <PageAmbient theme={theme} width={W * scale} height={H * scale} share={ambientShare}
          seed={layout.pageId ?? String(layout.pageIndex)} handle={ambientRef} />
      )}
    </div>
    </ThemeContext.Provider>
  )
}
