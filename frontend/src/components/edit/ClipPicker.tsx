import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { clipRange, clipStart, timeLabel } from '../../upload/clip'
import { Button, Modal } from '../ui'
import '../upload.css'

interface Props {
  /** the video to choose from: a local file (object URL) before uploading, the original afterwards */
  src: string
  /** the start chosen so far (ms), null for the beginning */
  startMs: number | null
  onDone: (startMs: number) => void
  onCancel: () => void
  /** shown while the choice is being saved (after uploading) */
  busy?: boolean
  error?: string | null
}

/**
 * LS-22: pick the 3 seconds of a video that become its living photo. The video plays the chosen window over and over;
 * the strip below shows where it sits in the whole video and moves with the slider.
 */
export default function ClipPicker({ src, startMs, onDone, onCancel, busy = false, error = null }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [start, setStart] = useState((startMs ?? 0) / 1000)
  const [failed, setFailed] = useState(false)
  const range = clipRange(duration ?? Number.NaN)
  const startRef = useRef(start)
  startRef.current = start

  // play only the chosen window, from its start again when it ends
  useEffect(() => {
    const v = video.current
    if (!v) return
    const keepInWindow = () => {
      const from = startRef.current
      if (v.currentTime < from - 0.05 || v.currentTime >= from + range.length) {
        v.currentTime = from
        void v.play().catch(() => undefined)
      }
    }
    v.addEventListener('timeupdate', keepInWindow)
    return () => v.removeEventListener('timeupdate', keepInWindow)
  }, [range.length])

  function move(seconds: number) {
    const next = Math.min(Math.max(0, seconds), range.max)
    setStart(next)
    const v = video.current
    if (v) {
      v.currentTime = next
      void v.play().catch(() => undefined)
    }
  }

  const known = duration !== null && Number.isFinite(duration) && duration > 0
  const windowStyle = known
    ? ({ '--clip-left': `${(start / duration) * 100}%`, '--clip-width': `${(range.length / duration) * 100}%` } as CSSProperties)
    : undefined

  return (
    <Modal title="Canlı fotoğrafın 3 saniyesi" eyebrow="Klibi seç" onClose={onCancel} dismissable={!busy}>
      <div className="ui-form clip-picker">
        <p className="ui-muted ui-modal__text">
          Videonun hangi anı albümde canlansın? Kaydırarak seç; seçtiğin 3 saniye albümde ileri geri oynar.
        </p>
        <div className="clip-picker__stage">
          {failed ? (
            <p className="clip-picker__fallback">Bu tarayıcı videoyu gösteremiyor (iPhone videoları bazı bilgisayar tarayıcılarında açılmaz). Anı telefondan seçebilirsin; şimdilik seçili an değişmez.</p>
          ) : (
            <video
              ref={video}
              src={src}
              muted
              playsInline
              autoPlay
              preload="metadata"
              onLoadedMetadata={(e) => {
                const length = e.currentTarget.duration
                // a start saved earlier may sit past the last full window (the server slid it back): show where it really is
                const from = clipStart(startRef.current, length) / 1000
                setDuration(length)
                setStart(from)
                startRef.current = from
                e.currentTarget.currentTime = from
              }}
              onError={() => setFailed(true)}
            />
          )}
        </div>

        {known && range.max > 0 ? (
          <div className="clip-picker__controls">
            <div className="clip-picker__track" style={windowStyle} aria-hidden="true">
              <span className="clip-picker__window" />
            </div>
            <input
              className="clip-picker__slider"
              type="range"
              min={0}
              max={range.max}
              step={0.1}
              value={start}
              aria-label="Klibin başladığı an"
              aria-valuetext={`${timeLabel(start)} ile ${timeLabel(start + range.length)} arası`}
              onChange={(e) => move(Number(e.target.value))}
            />
            <p className="clip-picker__time">
              <strong>{timeLabel(start)} – {timeLabel(start + range.length)}</strong>
              <span className="ui-muted"> / {timeLabel(duration)}</span>
            </p>
          </div>
        ) : known ? (
          <p className="ui-muted">Video 3 saniyeden kısa; tamamı kullanılır.</p>
        ) : null}

        {error && <p role="alert" className="ui-field__error">{error}</p>}
        <div className="ui-modal__actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Vazgeç</Button>
          {/* nothing can be chosen until the video's length is known; when it cannot play here, the earlier choice stays */}
          <Button loading={busy} disabled={!known} onClick={() => known && onDone(clipStart(start, duration))}>Bu anı kullan</Button>
        </div>
      </div>
    </Modal>
  )
}
