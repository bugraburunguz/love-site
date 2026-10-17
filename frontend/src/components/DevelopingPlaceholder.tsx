import './photo.css'

/** Shown for formats the browser cannot draw yet (HEIC, some videos) or files that fail to load. */
export default function DevelopingPlaceholder() {
  return (
    <div className="developing" role="img" aria-label="Fotoğraf banyo ediliyor">
      <span className="developing__text">Fotoğraf banyo ediliyor…</span>
    </div>
  )
}
