import type { SpecialIcon } from '../../api/calendar'

/** A special day being written or changed in the dialog. */
export type Draft = { id?: string; title: string; day: string; icon: SpecialIcon; yearly: boolean }

export const EMPTY_DRAFT: Draft = { title: '', day: '', icon: 'heart', yearly: true }

/** Whether closing the dialog would lose something: only then is the user asked first. */
export function draftChanged(draft: Draft, start: Draft): boolean {
  return draft.title.trim() !== start.title.trim()
    || draft.day !== start.day
    || draft.icon !== start.icon
    || draft.yearly !== start.yearly
}
