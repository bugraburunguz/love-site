import { describe, expect, it } from 'vitest'
import { activeTab, tabOf } from './tabOf'

describe('activeTab', () => {
  it('keeps the website as it was: a tab is lit only on its own screens', () => {
    expect(activeTab('/', false)).toBe('/')
    expect(activeTab('/takvim/gun/2026-11-11', false)).toBe('/takvim')
    expect(activeTab('/cop', false)).toBeNull()
    expect(activeTab('/albums/a1', false)).toBeNull()
  })

  it('lights the parent tab in the store app', () => {
    expect(activeTab('/cop', true)).toBe('/profil')
  })
})

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
