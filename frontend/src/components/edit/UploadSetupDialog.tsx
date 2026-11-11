import { useEffect, useMemo, useState } from 'react'
import { CLIP_SECONDS, isVideoFile, timeLabel } from '../../upload/clip'
import { Button, Checkbox, Modal } from '../ui'
import ClipPicker from './ClipPicker'
import '../upload.css'

interface Props {
  files: File[]
  /** clipStarts: per file, where a video's 3-second living photo starts (ms); null = the beginning */
  onStart: (files: File[], singlePage: boolean[], clipStarts: (number | null)[]) => void
  onCancel: () => void
}

/** Shown after picking files: each one may get a page of its own ("Tek sayfa"); each video gets its 3 seconds picked. */
export default function UploadSetupDialog({ files, onStart, onCancel }: Props) {
  const [single, setSingle] = useState<boolean[]>(() => files.map(() => false))
  const [clips, setClips] = useState<(number | null)[]>(() => files.map(() => null))
  const [picking, setPicking] = useState<number | null>(null)
  const all = single.every(Boolean)
  const videos = useMemo(() => files.map(isVideoFile), [files])
  const hasVideo = videos.some(Boolean)

  // the picked video plays from the phone / computer itself (nothing is uploaded yet)
  const pickingUrl = useMemo(() => (picking === null ? null : URL.createObjectURL(files[picking])), [picking, files])
  useEffect(() => () => {
    if (pickingUrl) URL.revokeObjectURL(pickingUrl)
  }, [pickingUrl])

  const clipLabel = (ms: number | null) => {
    const from = (ms ?? 0) / 1000
    return `${timeLabel(from)}–${timeLabel(from + CLIP_SECONDS)}`
  }

  return (
    <>
      <Modal title="Yüklenecek dosyalar" eyebrow={`${files.length} dosya`} onClose={onCancel}>
        <div className="ui-form">
          <p className="ui-muted ui-modal__text">
            "Tek sayfa" işaretlenen fotoğraf kendi sayfasında büyük durur; diğerleri sayfalara kendiliğinden dizilir.
            {hasVideo && ' Videolar albümde 3 saniyelik canlı fotoğraf olur; hangi 3 saniye olacağını yanındaki düğmeden seç.'}
          </p>
          <Checkbox checked={all} onChange={(e) => setSingle(files.map(() => e.target.checked))}>Hepsi tek sayfa</Checkbox>
          <ul className="upload-setup">
            {files.map((f, i) => (
              <li key={i}>
                <span className="upload-setup__name">{f.name}</span>
                {videos[i] && (
                  <button type="button" className="upload-setup__clip" onClick={() => setPicking(i)}
                    aria-label={`${f.name}: canlı fotoğraf ${clipLabel(clips[i])}, değiştir`}>
                    ▶ {clipLabel(clips[i])}
                  </button>
                )}
                <label className="upload-setup__single">
                  <input type="checkbox" checked={single[i]} onChange={(e) => setSingle((s) => s.map((v, n) => (n === i ? e.target.checked : v)))} /> Tek sayfa
                </label>
              </li>
            ))}
          </ul>
          <div className="ui-modal__actions">
            <Button variant="secondary" onClick={onCancel}>Vazgeç</Button>
            <Button onClick={() => onStart(files, single, clips)}>Yükle</Button>
          </div>
        </div>
      </Modal>
      {picking !== null && pickingUrl && (
        <ClipPicker
          src={pickingUrl}
          startMs={clips[picking]}
          onCancel={() => setPicking(null)}
          onDone={(ms) => {
            setClips((c) => c.map((v, n) => (n === picking ? ms : v)))
            setPicking(null)
          }}
        />
      )}
    </>
  )
}
