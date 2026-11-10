import { describe, expect, it } from 'vitest'
import { applyColorMode, readColorMode, writeColorMode } from '../../styles/colorMode'
import { closeModal, isTopModal, openModal } from './modalStack'
import { tiltFor } from './tilt'
import { dismissToast, pushToast, type ToastItem } from './toastQueue'

describe('tiltFor', () => {
  it('is deterministic and stays within the pasted-by-hand range', () => {
    for (const seed of ['a', 'Kapadokya', 'b6f1-…', '']) {
      const t = tiltFor(seed)
      expect(t).toBe(tiltFor(seed))
      expect(Math.abs(t)).toBeLessThanOrEqual(1.5)
    }
    expect(new Set(['1', '2', '3', '4', '5', '6'].map(tiltFor)).size).toBeGreaterThan(1)
  })
})

describe('modal stack', () => {
  it('only the newest open modal is on top; closing it hands the top back', () => {
    const a = openModal()
    const b = openModal()
    expect(isTopModal(a)).toBe(false)
    expect(isTopModal(b)).toBe(true)
    closeModal(b)
    expect(isTopModal(a)).toBe(true)
    closeModal(a)
    expect(isTopModal(a)).toBe(false)
  })
})

describe('toast queue', () => {
  const item = (id: number): ToastItem => ({ id, message: `m${id}`, tone: 'info' })

  it('keeps the newest three', () => {
    let q: ToastItem[] = []
    for (let i = 1; i <= 5; i++) q = pushToast(q, item(i))
    expect(q.map((t) => t.id)).toEqual([3, 4, 5])
  })

  it('dismisses by id and ignores unknown ids', () => {
    const q = [item(1), item(2)]
    expect(dismissToast(q, 1).map((t) => t.id)).toEqual([2])
    expect(dismissToast(q, 9)).toBe(q)
  })
})

describe('color mode', () => {
  function fakeRoot() {
    const attrs: Record<string, string> = {}
    return {
      attrs,
      setAttribute: (k: string, v: string) => void (attrs[k] = v),
      removeAttribute: (k: string) => void delete attrs[k],
    }
  }

  function fakeStorage(initial: Record<string, string> = {}, broken = false) {
    const data = { ...initial }
    return {
      data,
      getItem: (k: string) => {
        if (broken) throw new Error('blocked')
        return data[k] ?? null
      },
      setItem: (k: string, v: string) => {
        if (broken) throw new Error('blocked')
        data[k] = v
      },
      removeItem: (k: string) => void delete data[k],
    }
  }

  it('reads a stored choice and falls back to the system for anything else', () => {
    expect(readColorMode(fakeStorage({ 'ui-color-mode': 'dark' }))).toBe('dark')
    expect(readColorMode(fakeStorage({ 'ui-color-mode': 'purple' }))).toBe('system')
    expect(readColorMode(fakeStorage({}, true))).toBe('system')
    expect(readColorMode(undefined)).toBe('system')
  })

  it('forces light or dark on the root and lets the system decide otherwise', () => {
    const root = fakeRoot()
    applyColorMode('dark', root)
    expect(root.attrs['data-theme']).toBe('dark')
    applyColorMode('system', root)
    expect(root.attrs['data-theme']).toBeUndefined()
  })

  it('stores the choice and survives blocked storage', () => {
    const s = fakeStorage()
    writeColorMode('light', s)
    expect(s.data['ui-color-mode']).toBe('light')
    writeColorMode('system', s)
    expect(s.data['ui-color-mode']).toBeUndefined()
    expect(() => writeColorMode('dark', fakeStorage({}, true))).not.toThrow()
  })
})
