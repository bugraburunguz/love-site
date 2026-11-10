/** Open modals, oldest first: only the top one reacts to Escape and Tab, so one key press closes one layer. */
const stack: symbol[] = []

export function openModal(): symbol {
  const token = Symbol('modal')
  stack.push(token)
  return token
}

export function closeModal(token: symbol): void {
  const i = stack.indexOf(token)
  if (i >= 0) stack.splice(i, 1)
}

export function isTopModal(token: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === token
}
