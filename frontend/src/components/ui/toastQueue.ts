export type ToastTone = 'info' | 'success' | 'error'

/** one button on the note, e.g. "Geri al" after a change that was saved at once */
export interface ToastAction {
  label: string
  run: () => void
}

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
  action?: ToastAction
  /** a newer note with the same key replaces this one */
  key?: string
}

/** At most three notes on screen; the oldest makes room for a new one. */
export const MAX_TOASTS = 3

export function pushToast(queue: ToastItem[], item: ToastItem): ToastItem[] {
  const rest = item.key ? queue.filter((t) => t.key !== item.key) : queue
  return [...rest, item].slice(-MAX_TOASTS)
}

export function dismissToast(queue: ToastItem[], id: number): ToastItem[] {
  return queue.some((t) => t.id === id) ? queue.filter((t) => t.id !== id) : queue
}
