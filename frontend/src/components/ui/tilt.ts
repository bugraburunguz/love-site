/** A stable "pasted by hand" rotation for a keepsake (polaroid, sticker): -1.5deg … +1.5deg, the same for the same seed. */
export function tiltFor(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const unit = ((h >>> 0) % 1001) / 1000 // 0 … 1
  return Math.round((unit * 3 - 1.5) * 100) / 100
}
