import { describe, expect, it } from 'vitest'
import { closeModal, isTopModal, openModal } from './modalStack'

describe('modal stack scroll lock', () => {
  it('locks the page with the first dialog and frees it with the last, whatever order they close in', () => {
    const body = { overflow: 'auto' }
    const outer = openModal(body)
    expect(body.overflow).toBe('hidden')
    const inner = openModal(body)
    expect(isTopModal(inner)).toBe(true)
    // both unmount in one commit, parent first (the case that left the page stuck)
    closeModal(outer, body)
    expect(body.overflow).toBe('hidden')
    closeModal(inner, body)
    expect(body.overflow).toBe('auto')
  })

  it('ignores a token closed twice', () => {
    const body = { overflow: '' }
    const a = openModal(body)
    closeModal(a, body)
    closeModal(a, body)
    expect(body.overflow).toBe('')
    const b = openModal(body)
    expect(body.overflow).toBe('hidden')
    closeModal(b, body)
    expect(body.overflow).toBe('')
  })
})
