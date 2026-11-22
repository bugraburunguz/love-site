/** First letters of up to two words (avatars, space monograms); "♥" when there is no name. */
export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toLocaleUpperCase('tr-TR'))
  return letters.slice(0, 2).join('') || '♥'
}

export function memoryCount(n: number): string {
  return n === 0 ? 'Henüz boş' : `${n.toLocaleString('tr-TR')} anı`
}

const monthYear = (d: Date) => d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' })

/** The months an album's photos were taken in ("Aralık 2023 – Ocak 2024"); an empty album shows when it was started. */
export function albumSpan(firstShownAt: string | null, lastShownAt: string | null, createdAt: string): string {
  if (!firstShownAt) return `Başlangıç: ${monthYear(new Date(createdAt))}`
  const first = monthYear(new Date(firstShownAt))
  const last = monthYear(new Date(lastShownAt ?? firstShownAt))
  return first === last ? first : `${first} – ${last}`
}
