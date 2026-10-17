import { hashString } from '../layout/prng'

const COVERS = ['var(--leather-bordeaux)', 'var(--leather-forest)', 'var(--leather-navy)', 'var(--leather-tan)']

/** Same album id always gets the same leather colour. */
export function coverColor(albumId: string): string {
  return COVERS[hashString(albumId) % COVERS.length]
}
