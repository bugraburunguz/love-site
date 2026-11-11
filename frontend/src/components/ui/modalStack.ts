/**
 * Open modals, oldest first: only the top one reacts to Escape and Tab, so one key press closes one layer.
 * The stack also owns the page's scroll lock: the first dialog locks it, the last one to close frees it. (Each dialog
 * restoring what it saw on open broke when two closed in the same commit: the inner one put "hidden" back.)
 */
interface StyleLike {
  overflow: string
}

const stack: symbol[] = []
let savedOverflow = ''

const bodyStyle = (): StyleLike | undefined => (typeof document === 'undefined' ? undefined : document.body.style)

export function openModal(style: StyleLike | undefined = bodyStyle()): symbol {
  const token = Symbol('modal')
  if (stack.length === 0 && style) {
    savedOverflow = style.overflow
    style.overflow = 'hidden'
  }
  stack.push(token)
  return token
}

export function closeModal(token: symbol, style: StyleLike | undefined = bodyStyle()): void {
  const i = stack.indexOf(token)
  if (i < 0) return
  stack.splice(i, 1)
  if (stack.length === 0 && style) style.overflow = savedOverflow
}

export function isTopModal(token: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === token
}
