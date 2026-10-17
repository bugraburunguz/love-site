/**
 * Aspect ratios (width / height) learned from loaded photos, kept in memory per album for the lifetime of the
 * tab, so reopening an album lays it out correctly on the very first render.
 */
const cache = new Map<string, Record<string, number>>()

export function cachedAspects(albumId: string): Record<string, number> {
  return { ...(cache.get(albumId) ?? {}) }
}

export function rememberAspects(albumId: string, aspects: Readonly<Record<string, number>>) {
  cache.set(albumId, { ...aspects })
}
