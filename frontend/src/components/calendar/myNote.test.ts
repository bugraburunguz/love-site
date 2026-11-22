import { describe, expect, it } from 'vitest'
import type { DayNote } from '../../api/calendar'
import { withMyNote } from './myNote'

const note = (body: string, mine: boolean, authorId = mine ? 'me' : 'partner'): DayNote => ({
  authorId,
  authorName: authorId,
  body,
  updatedAt: '2026-01-01T00:00:00Z',
  mine,
})

describe('withMyNote', () => {
  it('replaces my note with the saved one and keeps the partner note', () => {
    const notes = [note('eski', true), note('onun', false)]
    expect(withMyNote(notes, note('yeni', true))).toEqual([note('yeni', true), note('onun', false)])
  })

  it('adds my first note and removes it when it was cleared', () => {
    expect(withMyNote([note('onun', false)], note('ilk', true))).toEqual([note('onun', false), note('ilk', true)])
    expect(withMyNote([note('eski', true), note('onun', false)], null)).toEqual([note('onun', false)])
  })
})
