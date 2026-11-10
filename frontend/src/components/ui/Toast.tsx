import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { dismissToast, pushToast, type ToastItem, type ToastTone } from './toastQueue'

type Show = (message: string, tone?: ToastTone) => void

const ToastContext = createContext<Show | null>(null)

const SEAL: Record<ToastTone, string> = { info: '♥', success: '✓', error: '!' }
const DURATION_MS = 4500

/** Wax-sealed notes at the bottom of the screen; errors are announced assertively, the rest politely. */
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
      <div className="ui ui-toasts">
        {items.map((t) => (
          <div key={t.id} className={`ui-toast ui-toast--${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}>
            <span className="ui-toast__seal" aria-hidden="true">{SEAL[t.tone]}</span>
            <span className="ui-toast__text">{t.message}</span>
            <button type="button" className="ui-toast__close" onClick={() => dismiss(t.id)} aria-label="Bildirimi kapat">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** show(message, tone) from anywhere under <ToastProvider>; a no-op outside it (e.g. the export render page). */
export function useToast(): Show {
  return useContext(ToastContext) ?? noop
}

function noop() {}
