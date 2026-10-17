import { PAGE_W, polaroidSize } from './geometry'
import { createRng } from './prng'
import type { PageItem, PageLayout } from './types'

type Slot = { x: number; y: number; w: number }

// Hand-placed slots per page size (page units). Neighbouring polaroids overlap a little on purpose.
const TEMPLATES: Record<number, Slot[][]> = {
  1: [[{ x: 500, y: 700, w: 640 }]],
  2: [
    [
      { x: 370, y: 420, w: 470 },
      { x: 630, y: 1010, w: 470 },
    ],
  ],
  3: [
    [
      { x: 310, y: 390, w: 450 },
      { x: 690, y: 730, w: 430 },
      { x: 380, y: 1080, w: 420 },
    ],
    [
      { x: 660, y: 340, w: 430 },
      { x: 330, y: 700, w: 450 },
      { x: 640, y: 1090, w: 430 },
    ],
  ],
  4: [
    [
      { x: 275, y: 335, w: 390 },
      { x: 705, y: 425, w: 380 },
      { x: 320, y: 905, w: 400 },
      { x: 725, y: 1030, w: 385 },
    ],
    [
      { x: 700, y: 320, w: 395 },
      { x: 285, y: 460, w: 380 },
      { x: 690, y: 905, w: 380 },
      { x: 300, y: 1060, w: 400 },
    ],
  ],
  5: [
    [
      { x: 255, y: 265, w: 335 },
      { x: 710, y: 305, w: 330 },
      { x: 480, y: 780, w: 390 },
      { x: 270, y: 1160, w: 320 },
      { x: 725, y: 1135, w: 325 },
    ],
    [
      { x: 705, y: 270, w: 335 },
      { x: 275, y: 320, w: 330 },
      { x: 520, y: 780, w: 390 },
      { x: 730, y: 1160, w: 320 },
      { x: 275, y: 1130, w: 325 },
    ],
  ],
}

const STICKER_SPOTS = [
  { x: 120, y: 120 },
  { x: 880, y: 130 },
  { x: 880, y: 1290 },
  { x: 120, y: 1290 },
  { x: 500, y: 90 },
]
const STICKERS = ['heart', 'star', 'sparkle'] as const
const TAPES = ['rose', 'cream', 'gold', 'sage'] as const

const MIN_PER_PAGE = 3
const MAX_PER_PAGE = 5
const TAPE_WIDTH = 170

/** How many media go on each page: 3 to 5, deterministic for a seed, last page never left nearly empty. */
function pageSizes(count: number, seed: string): number[] {
  const rng = createRng(`${seed}:pages`)
  const sizes: number[] = []
  let left = count
  while (left > 0) {
    const size = Math.min(left, rng.pick([4, 3, 5, 4]))
    sizes.push(size)
    left -= size
  }
  // Move items from the previous page so the last one has at least MIN_PER_PAGE (when possible).
  const last = sizes.length - 1
  while (last > 0 && sizes[last] < MIN_PER_PAGE && sizes[last - 1] > MIN_PER_PAGE) {
    sizes[last - 1]--
    sizes[last]++
  }
  return sizes.map((s) => Math.min(MAX_PER_PAGE, s))
}

/**
 * Pure and deterministic: the same media list + seed always gives the same pages.
 * `aspects` (mediaId -> width/height, known after images load) only influences where tape sits on a
 * polaroid's top edge; page assignment and polaroid centres never depend on it, so nothing jumps around.
 */
export function autoLayout(
  media: ReadonlyArray<{ id: string }>,
  seed: string,
  aspects: Readonly<Record<string, number>> = {},
): PageLayout[] {
  const pages: PageLayout[] = []
  let cursor = 0

  pageSizes(media.length, seed).forEach((size, pageIndex) => {
    const pageRng = createRng(`${seed}:page:${pageIndex}`)
    const templates = TEMPLATES[size] ?? TEMPLATES[5]
    const slots = pageRng.pick(templates)
    const mirror = pageRng.next() < 0.5
    const items: PageItem[] = []
    let z = 10

    for (let i = 0; i < size; i++) {
      const m = media[cursor++]
      const slot = slots[i]
      // Per-media randomness is seeded by the media id, so a photo keeps its tilt wherever it lands.
      const rng = createRng(`${seed}:${m.id}`)
      const x = (mirror ? PAGE_W - slot.x : slot.x) + rng.range(-18, 18)
      const y = slot.y + rng.range(-18, 18)
      const width = slot.w * rng.range(0.95, 1.05)
      const rotation = rng.range(-7, 7)
      const zIndex = z++
      items.push({ id: `${m.id}:photo`, kind: 'MEDIA', mediaId: m.id, x, y, width, rotation, zIndex })

      if (rng.next() < 0.45) {
        const { height } = polaroidSize(width, aspects[m.id])
        const dx = rng.range(-0.18, 0.18) * width
        const rad = (rotation * Math.PI) / 180
        // top edge of the (rotated) polaroid
        const offX = dx * Math.cos(rad) + (height / 2) * Math.sin(rad)
        const offY = dx * Math.sin(rad) - (height / 2) * Math.cos(rad)
        items.push({
          id: `${m.id}:tape`,
          kind: 'TAPE',
          x: x + offX,
          y: y + offY,
          width: TAPE_WIDTH,
          rotation: rotation + rng.range(-14, 14),
          zIndex: zIndex + 1,
          variant: rng.pick(TAPES),
        })
        z++
      }
    }

    if (pageRng.next() < 0.6) {
      const spot = pageRng.pick(STICKER_SPOTS)
      items.push({
        id: `page${pageIndex}:sticker`,
        kind: 'STICKER',
        x: spot.x + pageRng.range(-12, 12),
        y: spot.y + pageRng.range(-12, 12),
        width: pageRng.range(64, 92),
        rotation: pageRng.range(-22, 22),
        zIndex: z++,
        variant: pageRng.pick(STICKERS),
      })
    }

    pages.push({ pageIndex, items })
  })

  return pages
}
