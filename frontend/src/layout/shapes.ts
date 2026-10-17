import { FRAME_TOP, TAPE_ASPECT, frameBottom, polaroidSize } from './geometry'

export type Point = { x: number; y: number }
/** Convex polygon, counter-clockwise in a y-down coordinate system is not required: orientation is normalised. */
export type Poly = Point[]
export type Box = { minX: number; minY: number; maxX: number; maxY: number }

type Placed = { x: number; y: number; width: number; rotation: number }

function rotatePoint(p: Point, degrees: number): Point {
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }
}

/** Rectangle given in local coordinates (origin at the item centre), rotated and moved into page space. */
function localRect(x0: number, y0: number, x1: number, y1: number, item: Placed): Poly {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ].map((p) => {
    const r = rotatePoint(p, item.rotation)
    return { x: item.x + r.x, y: item.y + r.y }
  })
}

export function boxOf(poly: Poly): Box {
  const xs = poly.map((p) => p.x)
  const ys = poly.map((p) => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

export function unionBox(boxes: Box[]): Box {
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  }
}

export type PolaroidShapes = {
  /** whole polaroid, white frame and caption strip included */
  frame: Poly
  /** the photo or video itself */
  image: Poly
  /** the strip under the picture that holds caption and date */
  caption: Poly
  /** axis-aligned bounding box of the rotated frame */
  box: Box
}

/** Where every part of a polaroid lands on the page (rotation included). */
export function polaroidShapes(item: Placed, aspect: number | undefined): PolaroidShapes {
  const { imageWidth, imageHeight, height } = polaroidSize(item.width, aspect)
  const hw = item.width / 2
  const hh = height / 2
  const imageTop = -hh + item.width * FRAME_TOP
  const frame = localRect(-hw, -hh, hw, hh, item)
  return {
    frame,
    image: localRect(-imageWidth / 2, imageTop, imageWidth / 2, imageTop + imageHeight, item),
    caption: localRect(-hw, hh - frameBottom(item.width), hw, hh, item),
    box: boxOf(frame),
  }
}

export function tapePoly(item: Placed): Poly {
  const h = item.width / TAPE_ASPECT
  return localRect(-item.width / 2, -h / 2, item.width / 2, h / 2, item)
}

export function stickerPoly(item: Placed): Poly {
  return localRect(-item.width / 2, -item.width / 2, item.width / 2, item.width / 2, item)
}

/** Local offset (in the polaroid's own rotated frame) -> page position. */
export function toPage(item: Placed, local: Point): Point {
  const r = rotatePoint(local, item.rotation)
  return { x: item.x + r.x, y: item.y + r.y }
}

function signedArea(poly: Poly): number {
  let sum = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

export function area(poly: Poly): number {
  return Math.abs(signedArea(poly))
}

/** Area of the overlap of two convex polygons (Sutherland-Hodgman clipping). */
export function intersectionArea(a: Poly, b: Poly): number {
  const ba = boxOf(a)
  const bb = boxOf(b)
  if (ba.maxX <= bb.minX || bb.maxX <= ba.minX || ba.maxY <= bb.minY || bb.maxY <= ba.minY) return 0

  const clip = signedArea(b) < 0 ? [...b].reverse() : b
  let output: Poly = signedArea(a) < 0 ? [...a].reverse() : a

  for (let i = 0; i < clip.length && output.length > 0; i++) {
    const c1 = clip[i]
    const c2 = clip[(i + 1) % clip.length]
    const inside = (p: Point) => (c2.x - c1.x) * (p.y - c1.y) - (c2.y - c1.y) * (p.x - c1.x) >= 0
    const cross = (p: Point, q: Point): Point => {
      const dx1 = p.x - q.x
      const dy1 = p.y - q.y
      const dx2 = c1.x - c2.x
      const dy2 = c1.y - c2.y
      const det = dx1 * dy2 - dy1 * dx2
      const n1 = p.x * q.y - p.y * q.x
      const n2 = c1.x * c2.y - c1.y * c2.x
      return { x: (n1 * dx2 - dx1 * n2) / det, y: (n1 * dy2 - dy1 * n2) / det }
    }
    const input = output
    output = []
    for (let j = 0; j < input.length; j++) {
      const cur = input[j]
      const prev = input[(j + input.length - 1) % input.length]
      if (inside(cur)) {
        if (!inside(prev)) output.push(cross(prev, cur))
        output.push(cur)
      } else if (inside(prev)) {
        output.push(cross(prev, cur))
      }
    }
  }
  return output.length < 3 ? 0 : area(output)
}

export function boxInside(box: Box, bounds: Box): boolean {
  return box.minX >= bounds.minX && box.maxX <= bounds.maxX && box.minY >= bounds.minY && box.maxY <= bounds.maxY
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY
}
