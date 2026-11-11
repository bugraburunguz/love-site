import { describe, expect, it } from 'vitest'
import { draftChanged, EMPTY_DRAFT } from './specialDraft'

describe('draftChanged', () => {
  it('lets an untouched form close straight away', () => {
    expect(draftChanged({ ...EMPTY_DRAFT }, EMPTY_DRAFT)).toBe(false)
    const day = { id: 'd1', title: 'Tanışma', day: '2024-02-14', icon: 'heart' as const, yearly: true }
    expect(draftChanged({ ...day }, day)).toBe(false)
  })

  it('asks before throwing away what was typed or picked', () => {
    expect(draftChanged({ ...EMPTY_DRAFT, title: 'Yıldönümü' }, EMPTY_DRAFT)).toBe(true)
    expect(draftChanged({ ...EMPTY_DRAFT, day: '2025-06-01' }, EMPTY_DRAFT)).toBe(true)
    expect(draftChanged({ ...EMPTY_DRAFT, icon: 'star' }, EMPTY_DRAFT)).toBe(true)
    expect(draftChanged({ ...EMPTY_DRAFT, yearly: false }, EMPTY_DRAFT)).toBe(true)
  })

  it('ignores spaces typed around an unchanged name', () => {
    const day = { id: 'd1', title: 'Tanışma', day: '2024-02-14', icon: 'heart' as const, yearly: true }
    expect(draftChanged({ ...day, title: ' Tanışma ' }, day)).toBe(false)
  })
})
