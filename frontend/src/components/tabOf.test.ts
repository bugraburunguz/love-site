import { describe, expect, it } from 'vitest'
import { tabOf } from './tabOf'

describe('tabOf', () => {
  it('lights the tab of the screen itself', () => {
    expect(tabOf('/')).toBe('/')
    expect(tabOf('/takvim')).toBe('/takvim')
    expect(tabOf('/profil')).toBe('/profil')
  })

  it('keeps the parent tab lit on the screens below it', () => {
    expect(tabOf('/cop')).toBe('/profil')
    expect(tabOf('/admin')).toBe('/profil')
    expect(tabOf('/takvim/gun/2026-11-11')).toBe('/takvim')
    expect(tabOf('/albums/a1')).toBe('/')
  })

  it('lights nothing elsewhere', () => {
    expect(tabOf('/gizlilik')).toBeNull()
  })
})
