export type ToastTone = 'info' | 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

/** At most three notes on screen; the oldest makes room for a new one. */
export const MAX_TOASTS = 3

export function pushToast(queue: ToastItem[], item: ToastItem): ToastItem[] {
  return [...queue, item].slice(-MAX_TOASTS)
}

export function dismissToast(queue: ToastItem[], id: number): ToastItem[] {
  return queue.some((t) => t.id === id) ? queue.filter((t) => t.id !== id) : queue
}
