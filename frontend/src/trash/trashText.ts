const DAY = 24 * 60 * 60 * 1000

/** "12 gün sonra kalıcı olarak silinecek"; the last day (and an overdue item the nightly purge has not reached) is "Bugün". */
export function purgeLabel(purgeAt: string, now: Date = new Date()): string {
  const days = Math.ceil((new Date(purgeAt).getTime() - now.getTime()) / DAY)
  return days <= 0 || new Date(purgeAt).getTime() - now.getTime() < DAY / 2
    ? 'Bugün kalıcı olarak silinecek'
    : `${days} gün sonra kalıcı olarak silinecek`
}
