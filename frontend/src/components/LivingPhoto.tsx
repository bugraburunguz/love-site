import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { MediaDto } from '../api/albums'
import { useHoverCapable, useReducedMotion } from '../hooks/useReducedMotion'
import { DEFAULT_ASPECT, FRAME_BOTTOM, FRAME_SIDE, FRAME_TOP, clampAspect } from '../layout/geometry'
import { resolveDisplay } from '../media/display'
import { useVideoPlayback } from '../media/playback'
import DevelopingPlaceholder from './DevelopingPlaceholder'
import './photo.css'

interface Props {
  media: MediaDto
  /** frame width in the units of the surrounding coordinate system (page units on a page, px in the lightbox) */
  width: number
  /** picture aspect ratio (width / height) once known */
  aspect?: number
  /** false turns off hover tilt and click, e.g. for the editing mode of a later phase or inside the lightbox */
  interactive?: boolean
  onOpen?: (media: MediaDto) => void
  onAspect?: (mediaId: string, aspect: number) => void
  /** replaces the caption text (the lightbox puts an input here) */
  captionSlot?: ReactNode
}

const MAX_TILT = 4

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function AutoVideo({ src, poster, label, onAspect }: { src: string; poster?: string; label: string; onAspect: (a: number) => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  useVideoPlayback(ref, !failed)
  if (failed) return <DevelopingPlaceholder />
  return (
    <video
      ref={ref}
      className="polaroid__media"
      // #t=0.001 makes browsers paint the first frame while the video waits (or when motion is reduced)
      src={`${src}#t=0.001`}
      poster={poster}
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
      aria-label={label}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget
        if (v.videoWidth && v.videoHeight) onAspect(v.videoWidth / v.videoHeight)
      }}
      onError={() => setFailed(true)}
    />
  )
}

function MediaView({ media, onAspect }: { media: MediaDto; onAspect: (a: number) => void }) {
  const display = resolveDisplay(media)
  const [failed, setFailed] = useState(false)
  const label = media.caption || media.originalFilename
  if (display.mode === 'placeholder' || failed) return <DevelopingPlaceholder />
  if (display.mode === 'video') {
    return <AutoVideo src={display.src} poster={display.poster} label={label} onAspect={onAspect} />
  }
  return (
    <img
      className="polaroid__media"
      src={display.src}
      alt={label}
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={(e) => {
        const img = e.currentTarget
        if (img.naturalWidth && img.naturalHeight) onAspect(img.naturalWidth / img.naturalHeight)
      }}
      onError={() => setFailed(true)}
    />
  )
}

export default function LivingPhoto({ media, width, aspect, interactive = true, onOpen, onAspect, captionSlot }: Props) {
  const reduced = useReducedMotion()
  const hoverCapable = useHoverCapable()
  const tiltRef = useRef<HTMLDivElement>(null)
  const tilt = interactive && hoverCapable && !reduced
  const a = clampAspect(aspect ?? (media.width && media.height ? media.width / media.height : DEFAULT_ASPECT))

  const imageWidth = width * (1 - 2 * FRAME_SIDE)
  const frameStyle: CSSProperties = {
    width,
    fontSize: width * 0.085,
    padding: `${width * FRAME_TOP}px ${width * FRAME_SIDE}px 0`,
  }

  function onPointerMove(e: PointerEvent<HTMLElement>) {
    if (!tilt || e.pointerType !== 'mouse') return
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    const el = tiltRef.current
    if (!el) return
    el.style.setProperty('--tilt-x', `${(-py * 2 * MAX_TILT).toFixed(2)}deg`)
    el.style.setProperty('--tilt-y', `${(px * 2 * MAX_TILT).toFixed(2)}deg`)
  }

  function resetTilt() {
    tiltRef.current?.style.setProperty('--tilt-x', '0deg')
    tiltRef.current?.style.setProperty('--tilt-y', '0deg')
  }

  function onKeyDown(e: KeyboardEvent) {
    if (interactive && onOpen && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onOpen(media)
    }
  }

  return (
    <figure
      className={`polaroid${interactive ? ' polaroid--interactive' : ''}${tilt ? ' polaroid--tilt' : ''}`}
      onPointerMove={onPointerMove}
      onPointerLeave={resetTilt}
      onClick={interactive && onOpen ? () => onOpen(media) : undefined}
      onKeyDown={onKeyDown}
      tabIndex={interactive && onOpen ? 0 : undefined}
      role={interactive && onOpen ? 'button' : undefined}
      aria-label={interactive && onOpen ? `${media.caption || media.originalFilename} - büyüt` : undefined}
    >
      <div ref={tiltRef} className="polaroid__tilt" style={frameStyle}>
        <div className="polaroid__image" style={{ width: imageWidth, height: imageWidth / a }}>
          <MediaView media={media} onAspect={(ratio) => onAspect?.(media.id, ratio)} />
          <div className="polaroid__grain" aria-hidden="true" />
        </div>
        <figcaption className="polaroid__caption" style={{ height: width * FRAME_BOTTOM }}>
          {captionSlot ?? (media.caption ? <span className="polaroid__text">{media.caption}</span> : null)}
          <time className="polaroid__date" dateTime={media.createdAt} style={{ fontSize: width * 0.05 }}>
            {formatDate(media.createdAt)}
          </time>
        </figcaption>
      </div>
    </figure>
  )
}
