import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { MediaDto } from '../api/albums'
import { useElementSize } from '../hooks/useElementSize'
import {
  DEFAULT_ASPECT, FRAME_SIDE, UNIT_METRICS, captionFontSize, clampAspect, polaroidSize, type Metrics,
} from '../layout/geometry'
import { pageThemeVars } from '../themes/cssVars'
import { ThemeContext, useTheme } from '../themes/ThemeContext'
import type { ThemeDef } from '../themes/types'
import LivingPhoto from './LivingPhoto'
import './lightbox.css'

/** An entry of the lightbox's ⋯ menu (the album and the calendar add their own: date, download, share). */
export function LightboxItem({ danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return <button type="button" role="menuitem" className={`lightbox__item${danger ? ' lightbox__item--danger' : ''}`} {...props} />
}

const longDay = (iso: string) => new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })

interface Props {
  items: MediaDto[]
  index: number
  aspects: Readonly<Record<string, number>>
  onIndex: (index: number) => void
  onClose: () => void
  onCaption: (mediaId: string, caption: string) => Promise<void>
  onDelete: (media: MediaDto) => void
  onRetry: (media: MediaDto) => void | Promise<void>
  onAspect: (mediaId: string, aspect: number) => void
  /** theme of the page a photo is on (its frame, filter and hand font follow that page); the album theme otherwise */
  themeOf?: (mediaId: string) => ThemeDef | undefined
  /** extra entries of the ⋯ menu (download / share) */
  menuExtra?: (media: MediaDto, close: () => void) => React.ReactNode
}

const SWIPE = 60

export default function Lightbox({ items, index, aspects, onIndex, onClose, onCaption, onDelete, onRetry, onAspect, themeOf, menuExtra }: Props) {
  const media = items[index]
  const albumTheme = useTheme()
  const stageRef = useRef<HTMLDivElement>(null)
  const { width: stageW, height: stageH } = useElementSize(stageRef)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState(media?.caption ?? '')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setDraft(media?.caption ?? '')
    setSaveError(null)
  }, [media?.id, media?.caption])

  const prev = () => index > 0 && onIndex(index - 1)
  const next = () => index < items.length - 1 && onIndex(index + 1)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (menuOpen) setMenuOpen(false)
        else onClose()
        return
      }
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menuOpen])

  if (!media) return null

  const aspect = clampAspect(aspects[media.id] ?? (media.width && media.height ? media.width / media.height : DEFAULT_ASPECT))
  // The lightbox shows the whole caption: the strip under the picture gets as many lines as the text needs.
  const metricsFor = (width: number): Metrics => {
    const charsPerLine = Math.max(8, Math.floor((width * (1 - 2 * FRAME_SIDE)) / (captionFontSize(width, UNIT_METRICS) * 0.46)))
    return { ...UNIT_METRICS, lines: Math.min(10, Math.max(1, Math.ceil(draft.length / charsPerLine))) }
  }
  // Biggest frame width that fits the stage (the strip height depends on the width, so search instead of solving)
  let frameWidth = Math.max(160, Math.min(stageW - 24, 760))
  while (frameWidth > 160 && polaroidSize(frameWidth, aspect, metricsFor(frameWidth)).height > stageH - 24) frameWidth -= 4
  const metrics = metricsFor(frameWidth)

  async function save() {
    const value = draft.trim()
    if (value === (media.caption ?? '')) return
    try {
      setSaveError(null)
      await onCaption(media.id, value)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Kaydedilemedi')
    }
  }

  const onPointerDown = (e: PointerEvent) => {
    if (e.target instanceof HTMLElement && e.target.closest('input,textarea,button')) return
    pointer.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: PointerEvent) => {
    const start = pointer.current
    pointer.current = null
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? next : prev)()
    else if (dy > SWIPE * 1.4 && Math.abs(dy) > Math.abs(dx)) onClose()
  }

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Fotoğraf"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="lightbox__bar">
        {/* deleting is deliberately tucked away: it lives behind this small menu and still asks for confirmation */}
        <div className="lightbox__menu" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="lightbox__icon"
            aria-label="Diğer işlemler"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="lightbox__dropdown" role="menu">
              {menuExtra?.(media, () => setMenuOpen(false))}
              <LightboxItem
                danger
                onClick={() => {
                  setMenuOpen(false)
                  onDelete(media)
                }}
              >
                Çöpe taşı
              </LightboxItem>
            </div>
          )}
        </div>
        <button type="button" className="lightbox__icon" onClick={onClose} aria-label="Kapat" autoFocus>
          ✕
        </button>
      </div>

      <div className="lightbox__stage" ref={stageRef} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <button type="button" className="lightbox__icon lightbox__nav lightbox__nav--prev" onClick={prev} disabled={index === 0} aria-label="Önceki fotoğraf">
          ‹
        </button>
        {stageW > 0 && (
          <ThemeContext.Provider value={themeOf?.(media.id) ?? albumTheme}>
          <div className="lightbox__photo" key={media.id} style={pageThemeVars(themeOf?.(media.id) ?? albumTheme)}>
            <LivingPhoto
              media={media}
              width={frameWidth}
              aspect={aspect}
              interactive={false}
              variant="display"
              onRetry={onRetry}
              metrics={metrics}
              onAspect={onAspect}
              captionSlot={
                <textarea
                  className="polaroid__caption-input"
                  value={draft}
                  maxLength={280}
                  rows={1}
                  placeholder="Bir şeyler yazın…"
                  aria-label="Altyazı"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => void save()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.currentTarget.blur()
                    }
                  }}
                />
              }
            />
          </div>
          </ThemeContext.Provider>
        )}
        <button type="button" className="lightbox__icon lightbox__nav lightbox__nav--next" onClick={next} disabled={index === items.length - 1} aria-label="Sonraki fotoğraf">
          ›
        </button>
      </div>

      <div className="lightbox__footer">
        <span className="lightbox__pill">{index + 1} / {items.length}</span>
        <span className="lightbox__date">{longDay(media.displayDate)}{media.dateUncertain && !media.dateOverridden ? ' ?' : ''}</span>
        {media.uploadedByName && <span className="lightbox__by">Ekleyen: {media.uploadedByName}</span>}
        {saveError && <span role="alert" className="lightbox__error">{saveError}</span>}
      </div>
    </div>
  )
}
