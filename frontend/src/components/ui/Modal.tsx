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
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A letter lifted off the page: centred card with a ribbon on desktop, bottom sheet on phones. Focus moves in, stays
 * in (Tab wraps) and returns to the opener on close; the page behind does not scroll.
 */
export default function Modal({ title, eyebrow, onClose, children, actions, dismissable = true }: Props) {
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    const token = openModal()
    const opener = document.activeElement as HTMLElement | null
    const first = box.current?.querySelector<HTMLElement>('[autofocus], ' + FOCUSABLE)
    ;(first ?? box.current)?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (!isTopModal(token)) return
      if (e.key === 'Escape' && dismissable) {
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
      closeModal(token)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      opener?.focus?.()
    }
  }, [dismissable])

  return createPortal(
    <div className="ui ui-modal-backdrop" onMouseDown={(e) => dismissable && e.target === e.currentTarget && onClose()}>
      <div className="ui-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={box} tabIndex={-1}>
        <div className="ui-modal__head">
          <div>
            {eyebrow && <div className="ui-eyebrow">{eyebrow}</div>}
            <h2 id={titleId}>{title}</h2>
          </div>
          {dismissable && (
            <button type="button" className="ui-modal__close" onClick={onClose} aria-label="Kapat">
              ×
            </button>
          )}
        </div>
        {children}
        {actions && <div className="ui-modal__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  )
}
