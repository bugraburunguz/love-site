import { useState } from 'react'
import Clay from '../Clay'
import '../dialog.css'
import '../book/edit.css'

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
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Yüklenecek dosyalar">
        <h2 className="dialog__title">{files.length} dosya yüklenecek</h2>
        <label className="upload-setup__all">
          <input type="checkbox" checked={all} onChange={(e) => setSingle(files.map(() => e.target.checked))} /> Hepsi tek sayfa
        </label>
        <ul className="upload-setup">
          {files.map((f, i) => (
            <li key={i}>
              <span className="upload-setup__name">{f.name}</span>
              <label>
                <input type="checkbox" checked={single[i]} onChange={(e) => setSingle((s) => s.map((v, n) => (n === i ? e.target.checked : v)))} /> Tek sayfa
              </label>
            </li>
          ))}
        </ul>
        <div className="dialog__actions">
          <Clay tone="cream" onClick={onCancel}>Vazgeç</Clay>
          <Clay onClick={() => onStart(files, single)}>Yükle</Clay>
        </div>
      </div>
    </div>
  )
}
