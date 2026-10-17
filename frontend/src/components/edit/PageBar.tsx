import interact from 'interactjs'
import { useEffect, useRef } from 'react'
import type { MediaDto } from '../../api/albums'
import type { PageDto, PageTemplate } from '../../api/pages'
import Clay from '../Clay'
import '../book/edit.css'

interface Props {
  pages: PageDto[]
  mediaById: ReadonlyMap<string, MediaDto>
  current: number
  onGo: (index: number) => void
  onReorder: (pageIds: string[]) => void
  onAdd: (afterIndex: number) => void
  onDelete: (page: PageDto) => void
  onTemplate: (page: PageDto, template: PageTemplate) => void
}

const TEMPLATE_LABEL: Record<PageTemplate, string> = { AUTO: 'Otomatik', FEATURED: 'Tek fotoğraf', FREE: 'Serbest' }
const BADGE: Record<PageTemplate, string> = { AUTO: '', FEATURED: '1', FREE: '✥' }

function Thumb({ page, mediaById, current, onGo, onReorder, order }: {
  page: PageDto; mediaById: ReadonlyMap<string, MediaDto>; current: boolean; onGo: () => void
  onReorder: (pageId: string, dropIndex: number) => void; order: number
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const latest = useRef(onReorder)
  latest.current = onReorder

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
            el.classList.add('page-bar__thumb--ghost')
            el.style.width = `${origin.width}px`
            el.style.height = `${origin.height}px`
          }
          el.style.left = `${origin.left + dx}px`
          el.style.top = `${origin.top + dy}px`
        },
        end(e) {
          if (!moved) return
          el.classList.remove('page-bar__thumb--ghost')
          el.style.cssText = ''
          const thumbs = Array.from(document.querySelectorAll<HTMLElement>('[data-thumb-index]'))
          let index = thumbs.length
          for (const t of thumbs) {
            const r = t.getBoundingClientRect()
            if (e.clientX < r.left + r.width / 2) {
              index = Number(t.dataset.thumbIndex)
              break
            }
          }
          latest.current(page.id, index)
        },
      },
    })
    return () => {
      instance.unset()
    }
  }, [page.id])

  const media = page.items
    .filter((i) => i.kind === 'MEDIA' && i.mediaId)
    .sort((a, b) => (a.slotIndex ?? a.zIndex ?? 0) - (b.slotIndex ?? b.zIndex ?? 0))
    .slice(0, 4)
    .map((i) => mediaById.get(i.mediaId as string))
  return (
    <button
      ref={ref}
      type="button"
      className={`page-bar__thumb${current ? ' page-bar__thumb--current' : ''}${media.length <= 1 ? ' page-bar__thumb--single' : ''}`}
      data-thumb-page-id={page.id}
      data-thumb-index={order}
      aria-label={`${order + 1}. sayfa, ${TEMPLATE_LABEL[page.template]}`}
      aria-current={current ? 'true' : undefined}
      onClick={onGo}
    >
      {media.map((m, n) => (m?.thumbUrl || m?.posterUrl ? <img key={n} src={(m.thumbUrl ?? m.posterUrl) as string} alt="" draggable={false} /> : <span key={n} />))}
      <span className="page-bar__number">{order + 1}</span>
      {BADGE[page.template] && <span className="page-bar__badge">{BADGE[page.template]}</span>}
    </button>
  )
}

/** The strip of page thumbnails under the book while editing: jump, re-order by dragging, add, delete, pick the template. */
export default function PageBar({ pages, mediaById, current, onGo, onReorder, onAdd, onDelete, onTemplate }: Props) {
  const page = pages[Math.min(current, pages.length - 1)]

  function reorder(pageId: string, dropIndex: number) {
    const ids = pages.map((p) => p.id)
    const from = ids.indexOf(pageId)
    if (from < 0) return
    ids.splice(from, 1)
    ids.splice(dropIndex > from ? dropIndex - 1 : dropIndex, 0, pageId)
    if (ids.every((id, i) => id === pages[i].id)) return
    onReorder(ids)
  }

  return (
    <div className="page-bar">
      <div className="page-bar__strip" role="list" aria-label="Sayfalar">
        <button type="button" className="page-bar__add" aria-label="Başa sayfa ekle" onClick={() => onAdd(-1)}>+</button>
        {pages.map((p, i) => (
          <div key={p.id} role="listitem" style={{ display: 'contents' }}>
            <Thumb page={p} mediaById={mediaById} current={i === current} onGo={() => onGo(i)} onReorder={reorder} order={i} />
            <button type="button" className="page-bar__add" aria-label={`${i + 1}. sayfadan sonra sayfa ekle`} onClick={() => onAdd(i)}>+</button>
          </div>
        ))}
      </div>
      {page && (
        <div className="page-bar__actions">
          <span className="item-bar__label">Sayfa {page.pageIndex + 1}</span>
          <span className="page-bar__templates" role="group" aria-label="Sayfa düzeni">
            {(Object.keys(TEMPLATE_LABEL) as PageTemplate[]).map((t) => (
              <Clay key={t} size="sm" tone={page.template === t ? 'rose' : 'cream'} aria-pressed={page.template === t}
                onClick={() => page.template !== t && onTemplate(page, t)}>
                {TEMPLATE_LABEL[t]}
              </Clay>
            ))}
          </span>
          <Clay size="sm" tone="cream" onClick={() => onDelete(page)}>Sayfayı sil</Clay>
        </div>
      )}
    </div>
  )
}
