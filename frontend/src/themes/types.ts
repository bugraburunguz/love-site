/**
 * A theme is DATA: one folder `themes/<id>/` with a `theme.ts` that fills this shape plus its files under `assets/`.
 * Nothing in the app branches on a theme id; everything reads these values.
 */

export const SWATCH_SLOTS = ['light', 'soft', 'accent', 'deep', 'dark'] as const
export type SwatchSlot = (typeof SWATCH_SLOTS)[number]

export const PAPER_SLOTS = ['plain', 'lined', 'textured', 'special'] as const
export type PaperSlot = (typeof PAPER_SLOTS)[number]

/** Page colour. `ink` is the colour of everything printed on the page; contrast(ink, bg) must be at least 4.5. */
export interface Swatch {
  bg: string
  ink: string
  /** tone of the page shadows (any CSS colour) */
  shadow: string
}

export type AmbientKind = 'petals' | 'hearts' | 'sparkles' | 'confetti' | 'paperPlanes' | 'clouds' | 'snow' | 'bokeh' | 'leaves' | 'bats'

export interface AmbientLayer {
  kind: AmbientKind
  /** particles of this layer; the layers of a theme add up to at most MAX_AMBIENT_PARTICLES */
  count: number
  /** 1 = a calm drift */
  speed: number
  colors: string[]
  /** size range in CSS px */
  size: [number, number]
}

export const MAX_AMBIENT_PARTICLES = 30

export type BurstKind = 'petals' | 'sparkles' | 'snow' | 'bats'

export interface ThemeFonts {
  /** CSS font-family value for the album title and the cover */
  display: string
  /** font of the other headings (dialog titles ...); `display` when absent (a decorative display font may be too loud for them) */
  headings?: string
  /** CSS font-family value for polaroid captions; the shared hand font when absent */
  hand?: string
  /** dynamic import of the font files, called when an album of this theme is opened (never at start-up) */
  load: () => Promise<unknown>
}

/**
 * Only appearance. The outer geometry of the polaroid (edges, bottom strip, aspect handling) is the same in every theme,
 * so the layout engine and its overflow tests do not know about themes. Do not add sizes here.
 */
export interface FrameSkin {
  /** frame colour */
  paper: string
  /** colour of the thin edge line */
  edge: string
  /** optional texture file laid over the frame colour */
  texture?: string
  /** optional overlay (lace corners, ribbons) drawn over the frame; stretched to the frame, so keep it light */
  corner?: string
  /** stamp-like perforated edge: little half-circles in the page colour along the frame edge (same outer size) */
  perforated?: boolean
}

export interface ThemeSticker {
  id: string
  name: string
  /** file under assets/stickers/ */
  file: string
}

export interface MediaFilter {
  sepia: number
  contrast: number
  saturate: number
  brightness: number
}

/** The photo filter may never distort faces: these are the hard limits (checked by the theme tests). */
export const MEDIA_FILTER_LIMITS = {
  sepia: [0, 0.35],
  contrast: [0.95, 1.12],
  saturate: [0.8, 1.1],
  brightness: [0.95, 1.08],
} as const

export interface Accents {
  blush: string
  blushLight: string
  rose: string
  roseDeep: string
  gold: string
  goldLight: string
  /** the round "+" button */
  plus: string
  /** keyboard focus ring */
  focus: string
}

export interface ThemeDef {
  id: string
  name: string
  description: string
  fonts: ThemeFonts
  swatches: Record<SwatchSlot, Swatch>
  /** file names under assets/ (mid-grey textures: they are blended onto the swatch colour, so every paper works on every colour) */
  papers: Record<PaperSlot, string>
  cover: {
    /** leather / cloth colour */
    color: string
    /** colour of the title on the cover */
    ink: string
    /** optional texture file replacing the shared leather grain */
    texture?: string
    /** SVG ornament drawn on the cover */
    ornament: string
    /** colour of the stitched border */
    stitch: string
  }
  frameSkin: FrameSkin
  /** tape-like strips for the automatic decoration: tape, ribbons, clips (files under assets/) */
  fasteners: string[]
  stickers: ThemeSticker[]
  /** sticker ids (no text in them) that the automatic decoration may put on empty spots of AUTO / FEATURED pages */
  autoStickers: string[]
  mediaFilter: MediaFilter
  ambient: AmbientLayer[]
  hover: {
    /** colour of the glow around a photo under the mouse (desktop) */
    glow: string
    burst?: BurstKind
    /** stickers wiggle under the mouse */
    wiggle?: boolean
    /** a small compass needle in the page corner follows the mouse */
    compass?: boolean
  }
  /** desktop mouse cursor over the pages (view mode only) */
  cursor?: { file: string; hotspot: [number, number] }
  /** a line of handwriting under the last page of the album (purely visual) */
  endNote?: string
  musicBox: { closed: string; open: string }
  accents: Accents
}

export const DEFAULT_THEME_ID = 'romantik'
