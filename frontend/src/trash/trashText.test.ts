import { describe, expect, it } from 'vitest'
import { purgeLabel } from './trashText'

describe('purgeLabel', () => {
  const now = new Date('2026-11-10T12:00:00Z')

  it('counts whole days that are left, rounded up', () => {
    expect(purgeLabel('2026-12-10T12:00:00Z', now)).toBe('30 gün sonra kalıcı olarak silinecek')
    expect(purgeLabel('2026-11-11T11:00:00Z', now)).toBe('1 gün sonra kalıcı olarak silinecek')
  })

  it('says "today" in the last hours and never shows a negative count', () => {
    expect(purgeLabel('2026-11-10T20:00:00Z', now)).toBe('Bugün kalıcı olarak silinecek')
    expect(purgeLabel('2026-11-09T12:00:00Z', now)).toBe('Bugün kalıcı olarak silinecek')
  })
})
