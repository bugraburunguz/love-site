import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useHoverCapable, useReducedMotion } from '../hooks/useReducedMotion'
import { useTheme } from '../themes/ThemeContext'
import { AmbientEngine, mayBurst, shouldRunAmbient } from './ambient/engine'
import './ambient/ambient.css'

const BurstContext = createContext<((x: number, y: number) => void) | undefined>(undefined)

/** A hover burst for the photo under the mouse, or undefined when bursts are off (touch, reduced motion, editing ...). */
export function useBurst(): ((x: number, y: number) => void) | undefined {
  return useContext(BurstContext)
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
 * One canvas above the book (it never takes pointer events) running the album theme's ambient particles, plus the hover
 * bursts. Everything is off with prefers-reduced-motion, while editing, while the lightbox is open and while the tab is
 * hidden.
 */
export default function Ambient({ enabled, editing, lightboxOpen, children }: Props) {
  const theme = useTheme()
  const reduced = useReducedMotion()
  const hoverCapable = useHoverCapable()
  const canvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<AmbientEngine | null>(null)
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden)

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const run = shouldRunAmbient({ enabled, reduced, editing, lightboxOpen, hidden })

  useEffect(() => {
    const el = canvas.current
    if (!el || !run) return
    let created: AmbientEngine
    try {
      created = new AmbientEngine(el, theme.id)
    } catch {
      return // no canvas support: the album is just calm
    }
    engine.current = created
    created.configure(theme.ambient, theme.hover.burst)
    const resize = () => created.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 1.5))
    resize()
    window.addEventListener('resize', resize)
    created.start()
    return () => {
      window.removeEventListener('resize', resize)
      created.stop()
      engine.current = null
    }
  }, [run, theme])

  const allowBurst = hoverCapable && mayBurst(reduced, editing, lightboxOpen) && enabled && !!theme.hover.burst
  const burst = useCallback((x: number, y: number) => engine.current?.burst(x, y), [])

  return (
    <BurstContext.Provider value={allowBurst ? burst : undefined}>
      {children}
      {run && <canvas ref={canvas} className="ambient" aria-hidden="true" />}
    </BurstContext.Provider>
  )
}
