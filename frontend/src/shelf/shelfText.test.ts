import { describe, expect, it } from 'vitest'
import { albumSpan, initials, memoryCount } from './shelfText'

describe('initials', () => {
  it('takes the first letters of up to two words, upper-cased the Turkish way', () => {
    expect(initials('ilknur ışık')).toBe('İI')
    expect(initials('Defne')).toBe('D')
    expect(initials('  Bizim   Küçük Evrenimiz ')).toBe('BK')
    expect(initials('')).toBe('♥')
  })
})

describe('memoryCount', () => {
  it('says how many memories an album holds', () => {
    expect(memoryCount(0)).toBe('Henüz boş')
    expect(memoryCount(1)).toBe('1 anı')
    expect(memoryCount(1420)).toBe('1.420 anı')
  })
})

describe('albumSpan', () => {
  it('shows the months the photos were taken in, or when the album was started', () => {
    expect(albumSpan(['2023-07-14T10:00:00Z', '2023-07-28T10:00:00Z'], '2024-01-01T00:00:00Z')).toBe('Temmuz 2023')
    expect(albumSpan(['2023-12-20T10:00:00Z', '2024-01-03T10:00:00Z'], '2024-01-01T00:00:00Z')).toBe('Aralık 2023 – Ocak 2024')
    // no suffix after the year: Turkish would need "2024'ten" but "2020'den"
    expect(albumSpan([], '2024-10-05T00:00:00Z')).toBe('Başlangıç: Ekim 2024')
  })
})
