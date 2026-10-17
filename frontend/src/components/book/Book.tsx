import {
  useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent, type ReactNode,
} from 'react'
import type { MediaDto } from '../../api/albums'
import { useElementSize } from '../../hooks/useElementSize'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { PAGE_H, PAGE_W, toMetrics, type Metrics } from '../../layout/geometry'
import type { PageLayout } from '../../layout/types'
import Clay from '../Clay'
import PageCanvas from './PageCanvas'
import type { PageEditor } from './editor'
import './book.css'

interface Props {
  /** builds the pages for this screen's metrics (text size depends on the page scale, so the layout does too) */
  layout: (metrics: Metrics) => PageLayout[]
  mediaById: ReadonlyMap<string, MediaDto>
  aspects: Readonly<Record<string, number>>
  /** leather colour of the cover frame */
  coverColor: string
  emptyHint?: boolean
  /** turn the keyboard arrows off while a modal is open */
  keyboard?: boolean
  onOpen: (media: MediaDto) => void
  onRetry: (media: MediaDto) => void | Promise<void>
  onAspect: (mediaId: string, aspect: number) => void
  /** called with the first visible page index and the number of pages shown at once */
  onPosition?: (start: number, cols: number) => void
  /** while editing: photos have handles, swiping is off (the arrow buttons turn the pages) */
  editor?: PageEditor
  /** jump to a page (bump `nonce` to jump again to the same page) */
  goTo?: { index: number; nonce: number }
  /** the layouts as computed for this screen (the editor freezes exactly these positions) */
  onLayouts?: (pages: PageLayout[]) => void
}

type Flip = { dir: 'next' | 'prev'; from: number }

const SWIPE_DISTANCE = 50

/**
 * The open book. It owns the single page scale (fits one or two pages into the available area),
 * the current spread, and the CSS 3D page turn. Pages themselves are drawn by PageCanvas.
 */
export default function Book({ layout, mediaById, aspects, coverColor, emptyHint, keyboard = true, onOpen, onRetry, onAspect, onPosition, editor, goTo, onLayouts }: Props) {
  const areaRef = useRef<HTMLDivElement>(null)
  const { width, height } = useElementSize(areaRef)
  const reduced = useReducedMotion()

  const coverPad = width < 640 ? 9 : 22
  const cols = width > 0 && width / Math.max(height, 1) >= 1.3 ? 2 : 1
  const availW = Math.max(0, width - 2 * coverPad - 24)
  const availH = Math.max(0, height - 2 * coverPad - 16)
  const scale = Math.max(0.05, Math.min(availW / (cols * PAGE_W), availH / PAGE_H))

  // Narrow screens get single-line captions; the layout is generated for exactly these metrics.
  const metrics = useMemo(() => toMetrics(scale, width < 700), [scale, width])
  const pages = useMemo(() => layout(metrics), [layout, metrics])

  useEffect(() => {
    onLayouts?.(pages)
  }, [pages, onLayouts])

  const total = Math.max(pages.length, 1)
  const [current, setCurrent] = useState(0)
  const [flip, setFlip] = useState<Flip | null>(null)
  const swipe = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  // First visible page: even on spreads, clamped when pages disappear.
  useEffect(() => {
    if (goTo) setCurrent(Math.max(0, goTo.index))
  }, [goTo])

  const clamped = Math.min(current, total - 1)
  const start = cols === 2 ? clamped - (clamped % 2) : clamped

  useEffect(() => {
    onPosition?.(start, cols)
  }, [start, cols, onPosition])

  const go = useCallback(
    (dir: 'next' | 'prev') => {
      if (flip) return
      const target = dir === 'next' ? start + cols : start - cols
      if (target < 0 || target >= total) return
      if (reduced) setCurrent(target)
      else setFlip({ dir, from: start })
    },
    [flip, start, cols, total, reduced],
  )

  const finish = () => {
    if (!flip) return
    setCurrent(flip.dir === 'next' ? flip.from + cols : flip.from - cols)
    setFlip(null)
  }

  useEffect(() => {
    if (!keyboard) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (e.key === 'ArrowRight') go('next')
      if (e.key === 'ArrowLeft') go('prev')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, keyboard])

  const onPointerDown = (e: PointerEvent) => {
    if (editor) return // dragging photos must not turn pages
    swipe.current = { x: e.clientX, y: e.clientY, moved: false }
  }
  const onPointerUp = (e: PointerEvent) => {
    const s = swipe.current
    swipe.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) > SWIPE_DISTANCE && Math.abs(dx) > Math.abs(dy) * 1.5) {
      swipe.current = { ...s, moved: true }
      go(dx < 0 ? 'next' : 'prev')
      // a swipe must not also count as a click on a photo
      setTimeout(() => (swipe.current = null), 0)
    }
  }
  const swallowClickAfterSwipe = (e: ReactMouseEvent) => {
    if (swipe.current?.moved) {
      e.stopPropagation()
      e.preventDefault()
    }
  }

  const common = { mediaById, aspects, scale, metrics, onOpen, onRetry, onAspect }
  const sheet = (index: number, side: 'left' | 'right' | 'single', interactive = true): ReactNode => {
    const pageLayout = index >= 0 && index < pages.length ? pages[index] : null
    return (
      <PageCanvas
        key={`${index}:${side}`}
        layout={pageLayout}
        side={side}
        pageNumber={pageLayout || (pages.length === 0 && index === 0) ? index + 1 : undefined}
        interactive={interactive && !editor}
        editor={interactive ? editor : undefined}
        emptyHint={emptyHint && index === 0}
        {...common}
      />
    )
  }

  const pageW = PAGE_W * scale
  const pageH = PAGE_H * scale
  const faceStyle: CSSProperties = { width: pageW, height: pageH }

  const leafStyle = (from: string, to: string, left: number): CSSProperties =>
    ({ ...faceStyle, left, '--flip-from': from, '--flip-to': to }) as CSSProperties

  let content: ReactNode
  if (cols === 2) {
    if (!flip) {
      content = (
        <>
          <div className="book__half">{sheet(start, 'left')}</div>
          <div className="book__half">{sheet(start + 1, 'right')}</div>
        </>
      )
    } else if (flip.dir === 'next') {
      const f = flip.from
      content = (
        <>
          <div className="book__half">{sheet(f, 'left', false)}</div>
          <div className="book__half">{sheet(f + 3, 'right', false)}</div>
          <div className="leaf leaf--from-left" style={leafStyle('0deg', '-180deg', pageW)} onAnimationEnd={finish}>
            <div className="leaf__face">{sheet(f + 1, 'right', false)}</div>
            <div className="leaf__face leaf__back">{sheet(f + 2, 'left', false)}</div>
            <div className="leaf__shade" />
          </div>
        </>
      )
    } else {
      const f = flip.from
      content = (
        <>
          <div className="book__half">{sheet(f - 2, 'left', false)}</div>
          <div className="book__half">{sheet(f + 1, 'right', false)}</div>
          <div className="leaf leaf--from-right" style={leafStyle('0deg', '180deg', 0)} onAnimationEnd={finish}>
            <div className="leaf__face">{sheet(f, 'left', false)}</div>
            <div className="leaf__face leaf__back">{sheet(f - 1, 'right', false)}</div>
            <div className="leaf__shade" />
          </div>
        </>
      )
    }
  } else if (!flip) {
    content = <div className="book__half">{sheet(start, 'single')}</div>
  } else if (flip.dir === 'next') {
    const f = flip.from
    content = (
      <>
        <div className="book__half">{sheet(f + 1, 'single', false)}</div>
        <div className="leaf leaf--from-left" style={leafStyle('0deg', '-180deg', 0)} onAnimationEnd={finish}>
          <div className="leaf__face">{sheet(f, 'single', false)}</div>
          <div className="leaf__face leaf__back"><div className="leaf__blank" /></div>
          <div className="leaf__shade" />
        </div>
      </>
    )
  } else {
    const f = flip.from
    content = (
      <>
        <div className="book__half">{sheet(f, 'single', false)}</div>
        <div className="leaf leaf--from-left" style={leafStyle('-180deg', '0deg', 0)} onAnimationEnd={finish}>
          <div className="leaf__face">{sheet(f - 1, 'single', false)}</div>
          <div className="leaf__face leaf__back"><div className="leaf__blank" /></div>
          <div className="leaf__shade" />
        </div>
      </>
    )
  }

  const last = Math.min(start + cols, total)
  const label = cols === 2 && last > start + 1 ? `${start + 1}–${last} / ${total}` : `${start + 1} / ${total}`
  const canPrev = start > 0
  const canNext = start + cols < total

  const arrow = (dir: 'next' | 'prev') => (
    <Clay
      shape="round"
      onClick={() => go(dir)}
      disabled={dir === 'next' ? !canNext : !canPrev}
      aria-label={dir === 'next' ? 'Sonraki sayfa' : 'Önceki sayfa'}
    >
      {dir === 'next' ? '›' : '‹'}
    </Clay>
  )

  return (
    <div className="book" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onClickCapture={swallowClickAfterSwipe}>
      <div className="book__area" ref={areaRef}>
        {width > 0 && (
          <div className="book__cover" style={{ '--cover-pad': `${coverPad}px`, '--cover-color': coverColor } as CSSProperties}>
            <div
              className="book__spread"
              style={{ width: cols * pageW, height: pageH, perspective: cols * pageW * 2.2 }}
            >
              {content}
              {cols === 2 && <div className="book__spine" />}
            </div>
          </div>
        )}
        {cols === 2 && (
          <>
            <div className="book__nav book__nav--prev">{arrow('prev')}</div>
            <div className="book__nav book__nav--next">{arrow('next')}</div>
          </>
        )}
      </div>
      <div className="book__footer">
        {cols === 1 && arrow('prev')}
        <span aria-live="polite">{label}</span>
        {cols === 1 && arrow('next')}
      </div>
    </div>
  )
}
