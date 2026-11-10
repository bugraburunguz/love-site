import { useState } from 'react'
import { Button, Checkbox, Modal } from '../ui'
import '../upload.css'

interface Props {
  files: File[]
  onStart: (files: File[], singlePage: boolean[]) => void
  onCancel: () => void
}

/** Shown after picking files: each one may get a page of its own ("Tek sayfa"). */
export default function UploadSetupDialog({ files, onStart, onCancel }: Props) {
  const [single, setSingle] = useState<boolean[]>(() => files.map(() => false))
  const all = single.every(Boolean)
  return (
    <Modal title="Yüklenecek dosyalar" eyebrow={`${files.length} dosya`} onClose={onCancel}>
      <div className="ui-form">
        <p className="ui-muted ui-modal__text">"Tek sayfa" işaretlenen fotoğraf kendi sayfasında büyük durur; diğerleri sayfalara kendiliğinden dizilir.</p>
        <Checkbox checked={all} onChange={(e) => setSingle(files.map(() => e.target.checked))}>Hepsi tek sayfa</Checkbox>
        <ul className="upload-setup">
          {files.map((f, i) => (
            <li key={i}>
              <span className="upload-setup__name">{f.name}</span>
              <label className="upload-setup__single">
                <input type="checkbox" checked={single[i]} onChange={(e) => setSingle((s) => s.map((v, n) => (n === i ? e.target.checked : v)))} /> Tek sayfa
              </label>
            </li>
          ))}
        </ul>
        <div className="ui-modal__actions">
          <Button variant="secondary" onClick={onCancel}>Vazgeç</Button>
          <Button onClick={() => onStart(files, single)}>Yükle</Button>
        </div>
      </div>
    </Modal>
  )
}
