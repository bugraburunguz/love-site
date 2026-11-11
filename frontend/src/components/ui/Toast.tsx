import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { dismissToast, pushToast, type ToastAction, type ToastItem, type ToastTone } from './toastQueue'

interface Options {
  /** one button on the note, e.g. "Geri al" */
  action?: ToastAction
  /** a newer note with the same key replaces this one */
  key?: string
}

type Show = (message: string, tone?: ToastTone, options?: Options) => void

const ToastContext = createContext<Show | null>(null)

const SEAL: Record<ToastTone, string> = { info: '♥', success: '✓', error: '!' }
const DURATION_MS = 4500

/**
 * One note. It goes away by itself after a while; a note with a button waits longer, and not at all while the pointer
 * is on it or the keyboard is in it, so its button can always be reached.
 */
function Note({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    if (held) return
    const ms = item.tone === 'error' || item.action ? DURATION_MS * 2 : DURATION_MS
    const timer = window.setTimeout(() => onDismiss(item.id), ms)
    return () => window.clearTimeout(timer)
  }, [held, item.id, item.tone, item.action, onDismiss])
  return (
    <div
      className={`ui-toast ui-toast--${item.tone}`}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeld(false)
      }}
    >
      <span className="ui-toast__seal" aria-hidden="true">{SEAL[item.tone]}</span>
      <span className="ui-toast__text">{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="ui-toast__action"
          onClick={() => {
            item.action?.run()
            onDismiss(item.id)
          }}
        >
          {item.action.label}
        </button>
      )}
      <button type="button" className="ui-toast__close" onClick={() => onDismiss(item.id)} aria-label="Bildirimi kapat">×</button>
    </div>
  )
}

/**
 * Wax-sealed notes at the bottom of the screen. The two live regions stay mounted (empty most of the time), so screen
 * readers announce a note when it is added: errors assertively, the rest politely.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setItems((q) => dismissToast(q, id)), [])

  const show = useCallback<Show>((message, tone = 'info', options) => {
    const id = nextId.current++
    setItems((q) => pushToast(q, { id, message, tone, action: options?.action, key: options?.key }))
  }, [])

  const value = useMemo(() => show, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ui-toasts">
        <div className="ui-toasts__region" role="alert" aria-live="assertive">
          {items.filter((t) => t.tone === 'error').map((t) => <Note key={t.id} item={t} onDismiss={dismiss} />)}
        </div>
        <div className="ui-toasts__region" role="status" aria-live="polite">
          {items.filter((t) => t.tone !== 'error').map((t) => <Note key={t.id} item={t} onDismiss={dismiss} />)}
        </div>
      </div>
    </ToastContext.Provider>
  )
}

/** show(message, tone, { action, key }) from anywhere under <ToastProvider>; a no-op outside it (e.g. the export render page). */
export function useToast(): Show {
  return useContext(ToastContext) ?? noop
}

function noop() {}
