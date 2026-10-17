import interact from 'interactjs'
import { useEffect, useRef, useState } from 'react'
import type { MediaDto } from '../../api/albums'
import Clay from '../Clay'
import '../book/edit.css'

interface Props {
  media: MediaDto[]
  /** page number (1-based) a tap on "add" puts the photo on */
  targetLabel: string
  onAdd: (mediaId: string) => void
  /** photo dropped on something with these coordinates (page areas are found by the caller via the DOM) */
  onDrop: (mediaId: string, clientX: number, clientY: number) => void
  onClose: () => void
}

function TrayItem({ media, selected, onSelect, onDrop }: {
  media: MediaDto; selected: boolean; onSelect: () => void; onDrop: (clientX: number, clientY: number) => void
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const drop = useRef(onDrop)
  drop.current = onDrop
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let moved = false
    let origin = { left: 0, top: 0, width: 0, height: 0 }
    let dx = 0
    let dy = 0
    const instance = interact(el).draggable({
      listeners: {
        start() {
          moved = false
          dx = 0
          dy = 0
          const r = el.getBoundingClientRect()
          origin = { left: r.left, top: r.top, width: r.width, height: r.height }
        },
        move(e) {
          dx += e.dx
          dy += e.dy
          if (!moved && Math.hypot(dx, dy) < 6) return
          if (!moved) {
            moved = true
            el.classList.add('tray__item--ghost')
            el.style.width = `${origin.width}px`
            el.style.height = `${origin.height}px`
          }
          el.style.left = `${origin.left + dx}px`
          el.style.top = `${origin.top + dy}px`
        },
        end(e) {
          if (!moved) return
          el.classList.remove('tray__item--ghost')
          el.style.cssText = ''
          drop.current(e.clientX, e.clientY)
        },
      },
    })
    return () => {
      instance.unset()
    }
  }, [])
  const src = media.thumbUrl ?? media.posterUrl
  return (
    <button ref={ref} type="button" className={`tray__item${selected ? ' tray__item--selected' : ''}`} onClick={onSelect} aria-label={media.caption || media.originalFilename}>
      {src ? <img src={src} alt="" draggable={false} /> : <span>…</span>}
    </button>
  )
}

/** Photos of the album that are on no page. Tap one and "add", or drag it onto a page. */
export default function Tray({ media, targetLabel, onAdd, onDrop, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const chosen = media.find((m) => m.id === selected)
  return (
    <aside className="tray" aria-label="Tepsi">
      <div className="tray__head">
        <strong>Tepsi ({media.length})</strong>
        <Clay size="sm" tone="cream" onClick={onClose}>Kapat</Clay>
      </div>
      <p className="item-bar__label">Yerleştirilmemiş fotoğraflar. Sürükleyip sayfaya bırak ya da seçip ekle.</p>
      <div className="tray__grid">
        {media.map((m) => (
          <TrayItem key={m.id} media={m} selected={m.id === selected} onSelect={() => setSelected(m.id)} onDrop={(x, y) => onDrop(m.id, x, y)} />
        ))}
      </div>
      {chosen && (
        <Clay onClick={() => { onAdd(chosen.id); setSelected(null) }}>{targetLabel} sayfasına ekle</Clay>
      )}
    </aside>
  )
}
