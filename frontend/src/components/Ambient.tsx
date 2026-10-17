import { createContext, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react'
import { useHoverCapable, useReducedMotion } from '../hooks/useReducedMotion'
import type { AmbientLayer, ThemeDef } from '../themes/types'
import { AmbientEngine, mayBurst, shouldRunAmbient } from './ambient/engine'
import './ambient/ambient.css'

/** What the decorative motion of the open album may do right now (the same for every page). */
interface AmbientState {
  /** the ambient particles may run */
  run: boolean
  /** hover bursts may run (real mouse, not reduced, not editing ...) */
  burst: boolean
}

const AmbientContext = createContext<AmbientState>({ run: false, burst: false })

export function useAmbientState(): AmbientState {
  return useContext(AmbientContext)
}

const STORAGE_KEY = 'ambient-on'

function readPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0' // on unless the user turned it off
  } catch {
    return true
  }
}

export function useAmbientPreference(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(readPreference)
  const set = useCallback((value: boolean) => {
    setOn(value)
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
    } catch {
      /* storage unavailable: the switch still works for this visit */
    }
  }, [])
  return [on, set]
}

interface Props {
  enabled: boolean
  editing: boolean
  lightboxOpen: boolean
  children: ReactNode
}

/**
 * Decides whether the ambient animation and the hover bursts may run. Everything is off with prefers-reduced-motion, while
 * editing, while the lightbox is open and while the tab is hidden. The particles themselves are drawn per page (PageAmbient),
 * each page with its own theme, on its own canvas, clipped to that page.
 */
export default function Ambient({ enabled, editing, lightboxOpen, children }: Props) {
  const reduced = useReducedMotion()
  const hoverCapable = useHoverCapable()
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden)

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const run = shouldRunAmbient({ enabled, reduced, editing, lightboxOpen, hidden })
  const burst = run && hoverCapable && mayBurst(reduced, editing, lightboxOpen)
  const value = useRefStable({ run, burst })
  return <AmbientContext.Provider value={value}>{children}</AmbientContext.Provider>
}

function useRefStable(state: AmbientState): AmbientState {
  const ref = useRef(state)
  if (ref.current.run !== state.run || ref.current.burst !== state.burst) ref.current = state
  return ref.current
}

/** Particle layers of a page: a page in a two-page spread is half the area, so it gets half the particles. */
export function pageLayers(layers: ReadonlyArray<AmbientLayer>, share: number): AmbientLayer[] {
  return layers.map((l) => ({ ...l, count: Math.max(1, Math.ceil(l.count * share)) }))
}

export interface PageAmbientHandle {
  /** a hover burst at page-local CSS px */
  burst: (x: number, y: number) => void
}

/**
 * The ambient canvas of ONE page: absolutely positioned inside the page (which clips it), so particles never cross into the
 * neighbouring page, even when the two pages of a spread have different themes.
 */
export function PageAmbient({ theme, width, height, share, seed, handle }: {
  theme: ThemeDef; width: number; height: number; share: number; seed: string; handle?: Ref<PageAmbientHandle>
}) {
  const { run, burst } = useAmbientState()
  const canvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<AmbientEngine | null>(null)

  useImperativeHandle(handle, () => ({
    burst: (x, y) => {
      if (burst) engine.current?.burst(x, y)
    },
  }), [burst])

  useEffect(() => {
    const el = canvas.current
    if (!el || !run || width <= 0 || height <= 0) return
    let created: AmbientEngine
    try {
      created = new AmbientEngine(el, `${theme.id}:${seed}`)
    } catch {
      return // no canvas support: the page is just calm
    }
    engine.current = created
    created.resize(width, height, Math.min(window.devicePixelRatio || 1, 1.5))
    created.configure(pageLayers(theme.ambient, share), theme.hover.burst)
    created.start()
    return () => {
      created.stop()
      engine.current = null
    }
  }, [run, theme, width, height, share, seed])

  if (!run) return null
  return <canvas ref={canvas} className="page__ambient" style={{ width, height }} aria-hidden="true" />
}
