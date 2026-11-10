import type { AdminSpace } from '../api/albums'

export type SpaceFilter = 'all' | 'full' | 'waiting' | 'free'

const PLAIN: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' }

/**
 * Folds case the Turkish way and then drops the Turkish marks, so a search typed on any keyboard works: "isil" finds
 * "Işıl", "ian" finds "Ian", "IPEK" finds "İpek".
 */
function fold(text: string): string {
  return text.toLocaleLowerCase('tr-TR').replace(/[çğıöşüâîû]/g, (c) => PLAIN[c] ?? c)
}

/** The admin list's search box (space or member name) and filter chips. */
export function spaceMatches(space: AdminSpace, query: string, filter: SpaceFilter): boolean {
  if (filter === 'full' && space.members.length < 2) return false
  if (filter === 'waiting' && space.members.length >= 2) return false
  if (filter === 'free' && space.kind !== 'FREE') return false
  const q = fold(query.trim())
  if (!q) return true
  return [space.name, ...space.members.map((m) => m.displayName)].some((t) => fold(t).includes(q))
}
