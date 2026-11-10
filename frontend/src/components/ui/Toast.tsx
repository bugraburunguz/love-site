import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { dismissToast, pushToast, type ToastItem, type ToastTone } from './toastQueue'

type Show = (message: string, tone?: ToastTone) => void

const ToastContext = createContext<Show | null>(null)

const SEAL: Record<ToastTone, string> = { info: '♥', success: '✓', error: '!' }
const DURATION_MS = 4500

function Note({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  return (
    <div className={`ui-toast ui-toast--${item.tone}`}>
      <span className="ui-toast__seal" aria-hidden="true">{SEAL[item.tone]}</span>
      <span className="ui-toast__text">{item.message}</span>
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

  const show = useCallback<Show>((message, tone = 'info') => {
    const id = nextId.current++
    setItems((q) => pushToast(q, { id, message, tone }))
    window.setTimeout(() => dismiss(id), tone === 'error' ? DURATION_MS * 2 : DURATION_MS)
  }, [dismiss])

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

/** show(message, tone) from anywhere under <ToastProvider>; a no-op outside it (e.g. the export render page). */
export function useToast(): Show {
  return useContext(ToastContext) ?? noop
}

function noop() {}
