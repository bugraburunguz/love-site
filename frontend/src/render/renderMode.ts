import { createContext, useContext } from 'react'

/**
 * Set by the export render route only. The site's components draw exactly as on the site, except: images load at once from
 * the display variant, nothing moves, and a media item whose motion the export wants is drawn as a transparent WINDOW (with
 * three corner markers) that ffmpeg later fills with the loop.
 */
export interface RenderMode {
  active: boolean
  /** media ids drawn as video windows */
  motion: ReadonlySet<string>
}

export const RenderModeContext = createContext<RenderMode>({ active: false, motion: new Set() })

export function useRenderMode(): RenderMode {
  return useContext(RenderModeContext)
}
