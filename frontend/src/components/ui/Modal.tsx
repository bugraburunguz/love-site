import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { closeModal, isTopModal, openModal } from './modalStack'

interface Props {
  title: string
  /** small line above the title, e.g. "Özel mektup" */
  eyebrow?: string
  onClose: () => void
  children: ReactNode
  /** buttons; laid out right-aligned on desktop, stacked full width on phones */
  actions?: ReactNode
  /** false for dialogs that must be answered (no backdrop click, no Escape) */
  dismissable?: boolean
  /** change it when the dialog swaps its content (steps of a wizard): focus moves back into the dialog */
  refocusKey?: unknown
  /** a faint backdrop without blur, for dialogs that preview their effect on the page behind (album theme) */
  light?: boolean
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A letter lifted off the page: centred card with a ribbon on desktop, bottom sheet on phones. Focus moves in, stays
 * in (Tab wraps) and returns to the opener on close; the page behind does not scroll.
 */
export default function Modal({ title, eyebrow, onClose, children, actions, dismissable = true, refocusKey, light = false }: Props) {
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  // read through a ref: a dialog that becomes busy must not re-run the effect (that would move focus back to the first field)
  const dismissableRef = useRef(dismissable)
  dismissableRef.current = dismissable

  useEffect(() => {
    const token = openModal()
    const opener = document.activeElement as HTMLElement | null
    const first = box.current?.querySelector<HTMLElement>('[autofocus], ' + FOCUSABLE)
    ;(first ?? box.current)?.focus()

    function onKey(e: KeyboardEvent) {
      if (!isTopModal(token)) return
      if (e.key === 'Escape' && dismissableRef.current) {
        e.stopPropagation()
        closeRef.current()
      } else if (e.key === 'Tab' && box.current) {
        const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        if (items.length === 0) return
        const [head, tail] = [items[0], items[items.length - 1]]
        if (e.shiftKey && document.activeElement === head) {
          e.preventDefault()
          tail.focus()
        } else if (!e.shiftKey && document.activeElement === tail) {
          e.preventDefault()
          head.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      closeModal(token) // frees the page scroll when this was the last dialog
      document.removeEventListener('keydown', onKey)
      // the opener may be gone (it lived in a dialog that closed in the same commit): then the page keeps focus
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  // a new step of the dialog: the element that had focus may be gone, so start again at the dialog itself
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    box.current?.focus()
  }, [refocusKey])

  return createPortal(
    <div className={`ui ui-modal-backdrop${light ? ' ui-modal-backdrop--light' : ''}`}
      onMouseDown={(e) => dismissable && e.target === e.currentTarget && onClose()}>
      <div className="ui-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={box} tabIndex={-1}>
        <div className="ui-modal__head">
          <div>
            {eyebrow && <div className="ui-eyebrow">{eyebrow}</div>}
            <h2 id={titleId}>{title}</h2>
          </div>
          {/* disabled rather than removed while the dialog is busy: focus on it must not fall out of the dialog */}
          <button type="button" className="ui-modal__close" onClick={onClose} aria-label="Kapat" disabled={!dismissable}>
            ×
          </button>
        </div>
        {children}
        {actions && <div className="ui-modal__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}
