import { describe, expect, it } from 'vitest'
import { THEME_LIST } from '../themes/registry'
import { themeDecor } from '../themes/decor'
import { POLAROID_LONG_EDGE, POST, STICKER_MARGIN, STICKER_SIZE, STORY, polaroidLayout, stickerLayout, storyLayout, EXPORT_METRICS } from './exportLayout'
import { boxOf, intersectionArea, polaroidShapes, stickerPoly, tapePoly } from './shapes'

const ASPECTS = [0.5, 9 / 16, 0.75, 1, 4 / 3, 16 / 9, 2]
const IDS = Array.from({ length: 25 }, (_, i) => `media-${i}`)

describe('export compositions', () => {
  it('story / post: inside the safe area, stickers never on the photo, 1-3 stickers, deterministic', () => {
    for (const theme of THEME_LIST) {
      const decor = themeDecor(theme)
      for (const id of IDS) for (const aspect of ASPECTS) for (const format of ['story', 'post'] as const) {
        const f = format === 'story' ? STORY : POST
        const l = storyLayout(id, aspect, format, decor)
        expect(l.width).toBe(1080)
        expect(l.height).toBe(format === 'story' ? 1920 : 1350)
        const photo = polaroidShapes(l.polaroid, aspect, EXPORT_METRICS)
        expect(photo.box.minY).toBeGreaterThanOrEqual(f.safeTop)
        expect(photo.box.maxY).toBeLessThanOrEqual(f.height - f.safeBottom)
        expect(photo.box.minX).toBeGreaterThanOrEqual(f.side)
        expect(Math.abs(l.polaroid.rotation)).toBeGreaterThan(1)
        expect(Math.abs(l.polaroid.rotation)).toBeLessThanOrEqual(4)
        const stickers = l.items.filter((i) => i.kind === 'STICKER')
        expect(stickers.length).toBeGreaterThanOrEqual(1)
        expect(stickers.length).toBeLessThanOrEqual(3)
        for (const s of stickers) {
          const poly = stickerPoly(s)
          expect(intersectionArea(poly, photo.frame)).toBe(0)
          const b = boxOf(poly)
          expect(b.minY).toBeGreaterThanOrEqual(f.safeTop)
          expect(b.maxY).toBeLessThanOrEqual(f.height - f.safeBottom)
          expect(theme.autoStickers.map((a) => `${theme.id}:${a}`)).toContain(s.variant)
        }
        const tape = l.items.find((i) => i.kind === 'TAPE')
        if (tape) expect(intersectionArea(tapePoly(tape), photo.image)).toBeLessThanOrEqual(0.5)
        expect(storyLayout(id, aspect, format, decor)).toEqual(l)
      }
    }
  })

  it('polaroid image: never rotated, long edge exactly 2000 px, frame inside the canvas', () => {
    for (const aspect of ASPECTS) for (const bg of ['transparent', 'page'] as const) {
      const l = polaroidLayout('x', aspect, bg)
      expect(Math.max(l.width, l.height)).toBe(POLAROID_LONG_EDGE)
      expect(l.width % 2 + l.height % 2).toBe(0)
      const v = polaroidLayout('x', aspect, bg, EXPORT_METRICS, 1080)
      expect(Math.max(v.width, v.height)).toBe(1080)
      expect(v.width % 2 + v.height % 2).toBe(0)
      expect(l.polaroid.rotation).toBe(0)
      const box = polaroidShapes(l.polaroid, aspect, EXPORT_METRICS).box
      expect(box.minX).toBeGreaterThanOrEqual(0)
      expect(box.maxY).toBeLessThanOrEqual(l.height)
    }
  })

  it('sticker: 512 x 512 with at least 16 px of margin, slightly tilted', () => {
    for (const id of IDS) for (const aspect of ASPECTS) {
      const l = stickerLayout(id, aspect)
      expect([l.width, l.height]).toEqual([STICKER_SIZE, STICKER_SIZE])
      const box = polaroidShapes(l.polaroid, aspect, EXPORT_METRICS).box
      expect(box.minX).toBeGreaterThanOrEqual(STICKER_MARGIN)
      expect(box.minY).toBeGreaterThanOrEqual(STICKER_MARGIN)
      expect(box.maxX).toBeLessThanOrEqual(STICKER_SIZE - STICKER_MARGIN)
      expect(box.maxY).toBeLessThanOrEqual(STICKER_SIZE - STICKER_MARGIN)
      expect(Math.abs(l.polaroid.rotation)).toBeGreaterThanOrEqual(3)
    }
  })
})
