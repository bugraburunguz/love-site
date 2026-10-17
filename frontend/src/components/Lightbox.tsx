import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { MediaDto } from '../api/albums'
import { useElementSize } from '../hooks/useElementSize'
import { DEFAULT_ASPECT, FRAME_BOTTOM, FRAME_SIDE, FRAME_TOP, clampAspect } from '../layout/geometry'
import Clay from './Clay'
import LivingPhoto from './LivingPhoto'
import './lightbox.css'

interface Props {
  items: MediaDto[]
  index: number
  aspects: Readonly<Record<string, number>>
  onIndex: (index: number) => void
  onClose: () => void
  onCaption: (mediaId: string, caption: string) => Promise<void>
  onDelete: (media: MediaDto) => void
  onAspect: (mediaId: string, aspect: number) => void
}

const SWIPE = 60

export default function Lightbox({ items, index, aspects, onIndex, onClose, onCaption, onDelete, onAspect }: Props) {
  const media = items[index]
  const stageRef = useRef<HTMLDivElement>(null)
  const { width: stageW, height: stageH } = useElementSize(stageRef)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const [draft, setDraft] = useState(media?.caption ?? '')
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(media?.caption ?? '')
    setSaveError(null)
  }, [media?.id, media?.caption])

  const prev = () => index > 0 && onIndex(index - 1)
  const next = () => index < items.length - 1 && onIndex(index + 1)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.target instanceof HTMLElement && e.target.tagName === 'INPUT') return
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!media) return null

  const aspect = clampAspect(aspects[media.id] ?? (media.width && media.height ? media.width / media.height : DEFAULT_ASPECT))
  // Biggest frame width that fits the stage: height = w * (top + bottom) + w * (1 - 2 side) / aspect
  const heightPerWidth = FRAME_TOP + FRAME_BOTTOM + (1 - 2 * FRAME_SIDE) / aspect
  const frameWidth = Math.max(160, Math.min(stageW - 24, (stageH - 24) / heightPerWidth, 760))

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
    if (e.target instanceof HTMLElement && e.target.closest('input,button')) return
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
        <Clay shape="round" size="sm" tone="cream" onClick={onClose} aria-label="Kapat" autoFocus>
          ✕
        </Clay>
      </div>

      <div className="lightbox__stage" ref={stageRef} onClick={(e) => e.target === e.currentTarget && onClose()}>
        <Clay shape="round" className="lightbox__nav lightbox__nav--prev" onClick={prev} disabled={index === 0} aria-label="Önceki fotoğraf">
          ‹
        </Clay>
        {stageW > 0 && (
          <div className="lightbox__photo" key={media.id}>
            <LivingPhoto
              media={media}
              width={frameWidth}
              aspect={aspect}
              interactive={false}
              onAspect={onAspect}
              captionSlot={
                <input
                  className="polaroid__caption-input"
                  value={draft}
                  maxLength={280}
                  placeholder="Bir şeyler yazın…"
                  aria-label="Altyazı"
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => void save()}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
              }
            />
          </div>
        )}
        <Clay shape="round" className="lightbox__nav lightbox__nav--next" onClick={next} disabled={index === items.length - 1} aria-label="Sonraki fotoğraf">
          ›
        </Clay>
      </div>

      <div className="lightbox__footer">
        <span>{index + 1} / {items.length}</span>
        {saveError && <span role="alert" className="lightbox__error">{saveError}</span>}
        <Clay size="sm" tone="rose" onClick={() => onDelete(media)}>Sil</Clay>
      </div>
    </div>
  )
}
