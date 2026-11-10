import { Link } from 'react-router-dom'
import { uiButtonClass } from './ui'
import './albumbar.css'

interface Props {
  title: string
  /** e.g. "Romantik · 12 sayfa" */
  subtitle: string
  editing: boolean
  ready: boolean
  /** null: the user asked for no motion, so the ornaments switch is not offered */
  ambient: { on: boolean; toggle: () => void } | null
  onAdd: () => void
  onShare: () => void
  onSettings: () => void
  onToggleEdit: () => void
  undo: { canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null; onUndo: () => void; onRedo: () => void }
  savedAt: Date | null
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="album-bar__icon">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const ICONS = {
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  photo: 'M4 7h3l2-2h6l2 2h3v12H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
}

/** The bar above the book: back to the shelf, the album's name and what can be done with it (view or edit mode). */
export default function AlbumBar(p: Props) {
  const time = p.savedAt?.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  return (
    <header className={`album-bar${p.editing ? ' album-bar--editing' : ''}`}>
      <div className="album-bar__lead">
        {p.editing ? (
          <button type="button" className={uiButtonClass('ghost', 'sm')} onClick={p.onToggleEdit}>‹ Bitir</button>
        ) : (
          <Link to="/" className={uiButtonClass('ghost', 'sm')}>‹ Raf</Link>
        )}
        <div className="album-bar__titles">
          <h1 className="album-bar__title">{p.title}</h1>
          <span className="album-bar__subtitle">{p.editing ? 'Düzenleme modu' : p.subtitle}</span>
        </div>
      </div>

      {p.editing ? (
        <div className="album-bar__tools" role="group" aria-label="Düzenleme">
          <button type="button" className="album-bar__btn" onClick={p.undo.onUndo} disabled={!p.undo.canUndo}
            aria-label={p.undo.undoLabel ? `Geri al: ${p.undo.undoLabel}` : 'Geri al'} title="Geri al (⌘Z)">
            <Icon d={ICONS.undo} />
          </button>
          <button type="button" className="album-bar__btn" onClick={p.undo.onRedo} disabled={!p.undo.canRedo}
            aria-label={p.undo.redoLabel ? `Yinele: ${p.undo.redoLabel}` : 'Yinele'} title="Yinele (⇧⌘Z)">
            <Icon d={ICONS.redo} />
          </button>
          <span className="album-bar__saved" role="status">
            {time ? <>Otomatik kaydedildi <span className="album-bar__time">· {time}</span></> : 'Değişiklikler kendiliğinden kaydedilir'}
          </span>
          <button type="button" className={uiButtonClass('primary', 'sm')} onClick={p.onToggleEdit}>
            Düzenlemeyi bitir
          </button>
        </div>
      ) : (
        <div className="album-bar__tools" role="group" aria-label="Albüm">
          {p.ambient && (
            <button type="button" className="album-bar__btn" onClick={p.ambient.toggle} aria-pressed={p.ambient.on}
              aria-label={p.ambient.on ? 'Süsleri kapat' : 'Süsleri aç'} title={p.ambient.on ? 'Süsleri kapat' : 'Süsleri aç'}>
              <Icon d={ICONS.sparkle} />
            </button>
          )}
          <button type="button" className="album-bar__btn" onClick={p.onShare} disabled={!p.ready} aria-label="Paylaş" title="Paylaş">
            <Icon d={ICONS.share} />
          </button>
          <button type="button" className="album-bar__btn" onClick={p.onSettings} disabled={!p.ready} aria-label="Albüm ayarları" title="Albüm ayarları">
            <Icon d={ICONS.settings} />
          </button>
          <button type="button" className={`${uiButtonClass('secondary', 'sm')} album-bar__wide`} onClick={p.onAdd}>
            <Icon d={ICONS.photo} /> Fotoğraf ekle
          </button>
          <button type="button" className={uiButtonClass('primary', 'sm')} onClick={p.onToggleEdit} aria-label="Albümü düzenle">
            <Icon d={ICONS.edit} /> <span className="album-bar__label">Düzenle</span>
          </button>
        </div>
      )}
    </header>
  )
}
