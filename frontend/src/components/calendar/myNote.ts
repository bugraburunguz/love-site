import type { DayNote } from '../../api/calendar'

export function withMyNote(notes: DayNote[], saved: DayNote | null): DayNote[] {
  const others = notes.filter((n) => !n.mine)
  if (!saved) return others
  const at = notes.findIndex((n) => n.mine)
  return at < 0 ? [...others, saved] : notes.map((n) => (n.mine ? saved : n))
}
