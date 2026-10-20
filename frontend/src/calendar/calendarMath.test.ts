import { describe, expect, it } from 'vitest'
import {
  addMonths, daysIn, fromInstant, intensity, longDate, monthGrid, nearestMonth, occurrenceLabel, parseDay, parseMonth, toInstant, weekdayOf,
} from './calendarMath'

describe('calendar math', () => {
  it('builds Monday-first month grids', () => {
    // 1 October 2026 is a Thursday
    expect(weekdayOf(2026, 10, 1)).toBe(3)
    const oct = monthGrid(2026, 10)
    expect(oct[0]).toEqual([null, null, null, 1, 2, 3, 4])
    expect(oct.flat().filter((d) => d !== null)).toHaveLength(31)
    expect(oct.every((w) => w.length === 7)).toBe(true)
    // February 2021 starts on Monday and fills exactly four weeks
    expect(monthGrid(2021, 2)).toHaveLength(4)
    expect(daysIn(2024, 2)).toBe(29)
    expect(daysIn(2026, 2)).toBe(28)
  })

  it('moves between months and finds the nearest month with photos', () => {
    expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 })
    expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 })
    const months = ['2024-07', '2025-02', '2026-10']
    expect(nearestMonth(months, '2025-06', -1)).toBe('2025-02')
    expect(nearestMonth(months, '2025-06', 1)).toBe('2026-10')
    expect(nearestMonth(months, '2024-07', -1)).toBeNull()
  })

  it('parses only real months and days', () => {
    expect(parseMonth('2026-10')).toEqual({ year: 2026, month: 10 })
    expect(parseMonth('2026-13')).toBeNull()
    expect(parseDay('2026-02-29')).toBeNull()
    expect(parseDay('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 })
  })

  it('labels', () => {
    expect(longDate('2026-10-20')).toBe('20 Ekim 2026, Salı')
    expect(occurrenceLabel('Tanışma günümüz', true, 3)).toBe('Tanışma günümüz · 3. yıl')
    expect(occurrenceLabel('Taşınma', false, 0)).toBe('Taşınma')
    expect(intensity(0, 10)).toBe(0)
    expect(intensity(1, 10)).toBe(1)
    expect(intensity(10, 10)).toBe(4)
  })

  it('date + time inputs round-trip through an instant', () => {
    const iso = toInstant('2024-07-01', '16:45') as string
    expect(fromInstant(iso)).toEqual({ date: '2024-07-01', time: '16:45' })
    expect(toInstant('2024-02-30', '10:00')).toBeNull()
  })
})
