import { describe, expect, it } from 'vitest'
import type { AdminSpace } from '../api/albums'
import { spaceMatches } from './spaceFilter'

const space = (name: string, members: string[], kind: AdminSpace['kind'] = 'INVITED'): AdminSpace => ({
  id: name, name, kind, usedBytes: 0, limitBytes: 1, createdAt: '2026-11-01T00:00:00Z',
  members: members.map((m, i) => ({ displayName: m, role: i === 0 ? 'OWNER' : 'MEMBER' })),
})

describe('spaceMatches', () => {
  it('finds a space by its name or a member, whatever the dotted / dotless i', () => {
    expect(spaceMatches(space('Işıl ve Can', ['Işıl', 'Can']), 'isil', 'all')).toBe(true)
    expect(spaceMatches(space('Defter', ['Ian', 'İpek']), 'ian', 'all')).toBe(true)
    expect(spaceMatches(space('Defter', ['Ian', 'İpek']), 'IPEK', 'all')).toBe(true)
    expect(spaceMatches(space('Defter', ['Ian']), 'zeynep', 'all')).toBe(false)
  })

  it('filters by members and by kind', () => {
    const full = space('A', ['x', 'y'])
    const waiting = space('B', ['x'])
    const free = space('C', ['x'], 'FREE')
    expect([full, waiting, free].filter((s) => spaceMatches(s, '', 'full')).map((s) => s.name)).toEqual(['A'])
    expect([full, waiting, free].filter((s) => spaceMatches(s, '', 'waiting')).map((s) => s.name)).toEqual(['B', 'C'])
    expect([full, waiting, free].filter((s) => spaceMatches(s, '', 'free')).map((s) => s.name)).toEqual(['C'])
  })
})
