import interact from 'interactjs'
import { useEffect, useRef, type RefObject } from 'react'
import type { Geometry } from '../../api/pages'
import type { PageEditor, DropTarget } from './editor'
import './edit.css'

interface Props {
  itemId: string
  pageId: string
  free: boolean
  slot: number | null
  geometry: Required<Geometry>
  scale: number
  selected: boolean
  /** the positioned .page-item element this overlay belongs to */
  itemRef: RefObject<HTMLDivElement | null>
  editor: PageEditor
}

const clampX = (v: number) => Math.min(1000, Math.max(0, v))
const clampY = (v: number) => Math.min(1400, Math.max(0, v))
const MIN_WIDTH = 120
const MAX_WIDTH = 1000

function dropTargetAt(x: number, y: number, selfId: string): DropTarget | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement)) continue
    if (el.dataset.thumbPageId) return { kind: 'thumb', pageId: el.dataset.thumbPageId }
    if (el.dataset.itemId && el.dataset.itemId !== selfId && el.dataset.pageId) {
      return { kind: 'item', itemId: el.dataset.itemId, pageId: el.dataset.pageId }
    }
    if (el.dataset.pageSurface) {
      const rect = el.getBoundingClientRect()
      return { kind: 'page', pageId: el.dataset.pageSurface, fx: (x - rect.left) / rect.width, fy: (y - rect.top) / rect.height }
    }
  }
  return null
}

/**
 * Editing overlay of one photo. Lives inside the (rotated) .page-item, so its outline and handles turn with the photo.
 * Everything is driven by interact.js pointer sequences, which also covers touch. FREE pages: drag, rotate handle,
 * scale handle. AUTO / FEATURED pages: dragging the photo drops it onto another photo (reorder) or page (move).
 */
export default function ItemEditor({ itemId, pageId, free, slot, geometry, scale, selected, itemRef, editor }: Props) {
  const surface = useRef<HTMLDivElement>(null)
  const rotateHandle = useRef<HTMLDivElement>(null)
  const scaleHandle = useRef<HTMLDivElement>(null)
  const latest = useRef({ geometry, scale, free, editor })
  latest.current = { geometry, scale, free, editor }

  useEffect(() => {
    const el = surface.current
    if (!el) return
    let start = { x: 0, y: 0 }
    let delta = { x: 0, y: 0 }
    const instance = interact(el).draggable({
      listeners: {
        start() {
          const { geometry: g, editor: ed } = latest.current
          start = { x: g.x, y: g.y }
          delta = { x: 0, y: 0 }
          ed.onSelect(itemId)
          ed.onFocusPage(pageId)
        },
        move(e) {
          const { scale: s, free: isFree, editor: ed } = latest.current
          delta.x += e.dx
          delta.y += e.dy
          if (isFree) {
            ed.onGeometry(itemId, { x: clampX(start.x + delta.x / s), y: clampY(start.y + delta.y / s) }, false)
          } else if (itemRef.current) {
            itemRef.current.style.translate = `${delta.x / s}px ${delta.y / s}px`
            itemRef.current.style.zIndex = '9000'
            itemRef.current.classList.add('page-item--dragging')
          }
        },
        end(e) {
          const { free: isFree, editor: ed } = latest.current
          if (isFree) {
            ed.onGeometry(itemId, { x: clampX(start.x + delta.x / latest.current.scale), y: clampY(start.y + delta.y / latest.current.scale) }, true)
            // a free photo that was dragged onto another page leaves its own page
            const target = dropTargetAt(e.clientX, e.clientY, itemId)
            if (target && ((target.kind === 'page' && target.pageId !== pageId) || (target.kind === 'thumb' && target.pageId !== pageId)
              || (target.kind === 'item' && target.pageId !== pageId))) {
              ed.onDrop(itemId, target)
            }
            return
          }
          const node = itemRef.current
          const moved = Math.hypot(delta.x, delta.y) > 4
          if (node) {
            node.style.translate = ''
            node.style.zIndex = ''
            node.classList.remove('page-item--dragging')
          }
          if (!moved) return
          const target = dropTargetAt(e.clientX, e.clientY, itemId)
          if (target) ed.onDrop(itemId, target)
        },
      },
    })
    return () => {
      instance.unset()
    }
  }, [itemId, pageId, itemRef])

  useEffect(() => {
    const rotate = rotateHandle.current
    const grow = scaleHandle.current
    if (!rotate || !grow) return
    let centre = { x: 0, y: 0 }
    let startDistance = 1
    let startWidth = 1
    const readCentre = () => {
      const r = itemRef.current?.getBoundingClientRect()
      centre = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : centre
    }
    const turning = interact(rotate).draggable({
      listeners: {
        start: readCentre,
        move(e) {
          let angle = (Math.atan2(e.clientY - centre.y, e.clientX - centre.x) * 180) / Math.PI + 90
          if (angle > 180) angle -= 360
          if (Math.abs(angle) < 2.5) angle = 0 // a light magnet at "straight"
          latest.current.editor.onGeometry(itemId, { rotation: Math.round(angle * 10) / 10 }, false)
        },
        end(e) {
          let angle = (Math.atan2(e.clientY - centre.y, e.clientX - centre.x) * 180) / Math.PI + 90
          if (angle > 180) angle -= 360
          if (Math.abs(angle) < 2.5) angle = 0
          latest.current.editor.onGeometry(itemId, { rotation: Math.round(angle * 10) / 10 }, true)
        },
      },
    })
    const growing = interact(grow).draggable({
      listeners: {
        start(e) {
          readCentre()
          startDistance = Math.max(1, Math.hypot(e.clientX - centre.x, e.clientY - centre.y))
          startWidth = latest.current.geometry.width
        },
        move(e) {
          const d = Math.hypot(e.clientX - centre.x, e.clientY - centre.y)
          const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth * (d / startDistance)))
          latest.current.editor.onGeometry(itemId, { width: Math.round(width) }, false)
        },
        end(e) {
          const d = Math.hypot(e.clientX - centre.x, e.clientY - centre.y)
          const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth * (d / startDistance)))
          latest.current.editor.onGeometry(itemId, { width: Math.round(width) }, true)
        },
      },
    })
    return () => {
      turning.unset()
      growing.unset()
    }
  }, [itemId, itemRef, selected, free])

  // handles stay finger-sized on the screen whatever the page scale is
  const handle = Math.max(30, 46 / scale)
  return (
    <>
      <div
        ref={surface}
        className={`item-edit${selected ? ' item-edit--selected' : ''}`}
        data-item-id={itemId}
        data-page-id={pageId}
        data-slot={slot ?? ''}
        onPointerDown={() => {
          // a plain tap selects as well (interact.js only reports real drags)
          editor.onSelect(itemId)
          editor.onFocusPage(pageId)
        }}
      />
      {selected && free && (
        <>
          <div className="item-edit__stem" style={{ height: handle * 0.9, top: -handle * 0.9, width: Math.max(2, 2 / scale) }} aria-hidden="true" />
          <div
            ref={rotateHandle}
            className="item-edit__handle item-edit__handle--rotate"
            style={{ width: handle, height: handle, top: -handle * 1.9, marginLeft: -handle / 2, fontSize: handle * 0.6 }}
            role="slider"
            aria-label="Döndür"
            aria-valuenow={Math.round(geometry.rotation)}
          />
          <div
            ref={scaleHandle}
            className="item-edit__handle item-edit__handle--scale"
            style={{ width: handle, height: handle, right: -handle / 2, bottom: -handle / 2, fontSize: handle * 0.6 }}
            role="slider"
            aria-label="Boyutlandır"
            aria-valuenow={Math.round(geometry.width)}
          />
        </>
      )}
    </>
  )
}
