/** Small deterministic PRNG so the same seed always produces the same page. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
  }
}

export type Rng = {
  /** 0 <= n < 1 */
  next: () => number
  /** min <= n < max */
  range: (min: number, max: number) => number
  pick: <T>(items: readonly T[]) => T
}

export function createRng(seed: string): Rng {
  let a = xmur3(seed)()
  const next = () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    pick: (items) => items[Math.floor(next() * items.length)],
  }
}

/** Stable small integer from a string (cover colours etc.) */
export function hashString(value: string): number {
  return xmur3(value)()
}
