import { afterEach, describe, expect, it, vi } from 'vitest'
import { setSwipeBack } from './swipeBack'
import { COLOR_MODE_EVENT, setColorMode } from '../styles/colorMode'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('setSwipeBack', () => {
  it('tells the iOS shell to turn the edge swipe on or off', () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', { webkit: { messageHandlers: { swipeBack: { postMessage } } } })
    setSwipeBack(false)
    setSwipeBack(true)
    expect(postMessage.mock.calls).toEqual([[false], [true]])
  })

  it('does nothing outside the iOS app', () => {
    vi.stubGlobal('window', {})
    expect(() => setSwipeBack(false)).not.toThrow()
  })
})

describe('setColorMode', () => {
  it('announces the new mode so the status bar can follow it', () => {
    const target = new EventTarget()
    vi.stubGlobal('window', target)
    vi.stubGlobal('document', { documentElement: { setAttribute() {}, removeAttribute() {} } })
    const seen: string[] = []
    target.addEventListener(COLOR_MODE_EVENT, (e) => seen.push((e as CustomEvent<string>).detail))
    setColorMode('dark')
    setColorMode('system')
    expect(seen).toEqual(['dark', 'system'])
  })
})
