import { mayBurst, shouldRunAmbient } from './engine'

export interface EffectConditions {
  /** prefers-reduced-motion: reduce */
  reduced: boolean
  /** a real mouse is available (not a touch screen) */
  hoverCapable: boolean
  editing: boolean
  lightboxOpen: boolean
  /** the user's switch for the ambient animation */
  ambientOn: boolean
  /** the tab is hidden */
  hidden: boolean
}

/**
 * Which decorative motion may run right now. Reduced motion switches ALL of it off; editing stops the ambient animation, the
 * cursor and the compass (the page must stay still while it is edited); touch screens never get hover effects.
 */
export function effectsAllowed(c: EffectConditions) {
  return {
    ambient: shouldRunAmbient({ enabled: c.ambientOn, reduced: c.reduced, editing: c.editing, lightboxOpen: c.lightboxOpen, hidden: c.hidden }),
    burst: c.hoverCapable && c.ambientOn && mayBurst(c.reduced, c.editing, c.lightboxOpen),
    cursor: c.hoverCapable && !c.reduced && !c.editing,
    wiggle: c.hoverCapable && !c.reduced && !c.editing,
    compass: c.hoverCapable && !c.reduced && !c.editing && !c.lightboxOpen,
  }
}
