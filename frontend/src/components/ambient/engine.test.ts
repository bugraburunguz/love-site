import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_LIST } from '../../themes/registry'
import { MAX_AMBIENT_PARTICLES } from '../../themes/types'
import { effectsAllowed, type EffectConditions } from './effects'
import { AmbientEngine, particleBudget, shouldRunAmbient } from './engine'

const NORMAL: EffectConditions = { reduced: false, hoverCapable: true, editing: false, lightboxOpen: false, ambientOn: true, hidden: false }

describe('which motion may run', () => {
  it('everything runs on a normal desktop screen', () => {
    expect(effectsAllowed(NORMAL)).toEqual({ ambient: true, burst: true, cursor: true, wiggle: true, compass: true })
  })

  it('prefers-reduced-motion switches ambient, bursts, cursor, wiggle and compass off', () => {
    expect(effectsAllowed({ ...NORMAL, reduced: true })).toEqual({ ambient: false, burst: false, cursor: false, wiggle: false, compass: false })
  })

  it('the edit mode stops the ambient animation (and everything that would move around the page)', () => {
    const e = effectsAllowed({ ...NORMAL, editing: true })
    expect(e.ambient).toBe(false)
    expect(e.burst).toBe(false)
    expect(e.cursor).toBe(false)
    expect(e.compass).toBe(false)
  })

  it('stops while the lightbox is open or the tab is hidden, and when the user switches it off', () => {
    expect(effectsAllowed({ ...NORMAL, lightboxOpen: true }).ambient).toBe(false)
    expect(effectsAllowed({ ...NORMAL, hidden: true }).ambient).toBe(false)
    expect(effectsAllowed({ ...NORMAL, ambientOn: false }).ambient).toBe(false)
    expect(effectsAllowed({ ...NORMAL, ambientOn: false }).burst).toBe(false)
  })

  it('touch screens get no hover effects, but the ambient animation still runs', () => {
    const e = effectsAllowed({ ...NORMAL, hoverCapable: false })
    expect(e.burst || e.cursor || e.wiggle || e.compass).toBe(false)
    expect(e.ambient).toBe(true)
  })

  it('shouldRunAmbient needs every condition', () => {
    const base = { enabled: true, reduced: false, editing: false, lightboxOpen: false, hidden: false }
    expect(shouldRunAmbient(base)).toBe(true)
    for (const key of Object.keys(base) as (keyof typeof base)[]) {
      const flipped = { ...base, [key]: key === 'enabled' ? false : true }
      expect(shouldRunAmbient(flipped), key).toBe(false)
    }
  })
})

describe('the engine', () => {
  let frames: number
  beforeEach(() => {
    frames = 0
    vi.stubGlobal('requestAnimationFrame', () => ++frames)
    vi.stubGlobal('cancelAnimationFrame', () => undefined)
  })
  afterEach(() => vi.unstubAllGlobals())

  function fakeCanvas() {
    const ctx = new Proxy({}, { get: (_t, prop) => (prop === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => undefined), set: () => true })
    return { getContext: () => ctx, width: 0, height: 0 } as unknown as HTMLCanvasElement
  }

  it('does nothing until it is started: no frame is requested and a hover burst is ignored', () => {
    const engine = new AmbientEngine(fakeCanvas(), 'test')
    engine.configure(THEME_LIST[0].ambient, THEME_LIST[0].hover.burst)
    engine.resize(800, 600, 1)
    engine.burst(10, 10)
    expect(engine.running).toBe(false)
    expect(frames).toBe(0)
  })

  it('starts and stops cleanly; stopping removes bursts and later bursts are ignored', () => {
    const engine = new AmbientEngine(fakeCanvas(), 'test')
    engine.configure(THEME_LIST[0].ambient, THEME_LIST[0].hover.burst)
    engine.resize(800, 600, 1)
    engine.start()
    expect(engine.running).toBe(true)
    engine.stop()
    expect(engine.running).toBe(false)
    engine.burst(10, 10)
    expect(engine.running).toBe(false)
  })

  it('every theme stays within the particle budget', () => {
    for (const t of THEME_LIST) expect(particleBudget(t.ambient), t.id).toBeLessThanOrEqual(MAX_AMBIENT_PARTICLES)
  })
})
