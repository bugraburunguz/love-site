import type { MediaDto } from '../../api/albums'
import type { PageDto } from '../../api/pages'
import '../book/edit.css'

/**
 * Multi-selection for the share dialogs, drawn with the editor's tray items (same thumbnails, same "selected" frame), so
 * choosing photos for an export looks like choosing them while editing.
 */
export function MediaPicker({ media, selected, onChange, max }: {
  media: MediaDto[]; selected: string[]; onChange: (ids: string[]) => void; max: number
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id))
    else if (selected.length < max) onChange([...selected, id])
  }
  return (
    <div className="tray__grid export-picker" role="group" aria-label="Medya seç">
      {media.map((m) => {
        const src = m.thumbUrl ?? m.posterUrl
        const at = selected.indexOf(m.id)
        return (
          <button key={m.id} type="button" className={`tray__item${at >= 0 ? ' tray__item--selected' : ''}`} aria-pressed={at >= 0}
            aria-label={m.caption || m.originalFilename} onClick={() => toggle(m.id)}>
            {src ? <img src={src} alt="" draggable={false} /> : <span>…</span>}
            {at >= 0 && <span className="export-picker__badge">{at + 1}</span>}
            {m.loopUrl && <span className="export-picker__live" aria-label="hareketli">▶</span>}
          </button>
        )
      })}
    </div>
  )
}

export function PagePicker({ pages, mediaById, selected, onChange, max }: {
  pages: PageDto[]; mediaById: ReadonlyMap<string, MediaDto>; selected: string[]; onChange: (ids: string[]) => void; max: number
}) {
  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id))
    else if (selected.length < max) onChange([...selected, id])
  }
  return (
    <div className="tray__grid export-picker" role="group" aria-label="Sayfa seç">
      {pages.map((p) => {
        const first = p.items.find((i) => i.kind === 'MEDIA' && i.mediaId)
        const m = first?.mediaId ? mediaById.get(first.mediaId) : undefined
        const src = m?.thumbUrl ?? m?.posterUrl
        const on = selected.includes(p.id)
        return (
          <button key={p.id} type="button" className={`tray__item${on ? ' tray__item--selected' : ''}`} aria-pressed={on}
            aria-label={`Sayfa ${p.pageIndex + 1}`} onClick={() => toggle(p.id)}>
            {src ? <img src={src} alt="" draggable={false} /> : <span>…</span>}
            <span className="export-picker__badge">{p.pageIndex + 1}</span>
          </button>
        )
      })}
    </div>
  )
}
