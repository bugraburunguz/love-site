import { describe, expect, it } from 'vitest'
import { interceptable, navKind } from './navTransition'

describe('navKind', () => {
  it('cross-fades between the three tabs', () => {
    expect(navKind('/', '/takvim')).toBe('tab')
    expect(navKind('/profil', '/')).toBe('tab')
  })

  it('pushes into a deeper screen and pops back out of it', () => {
    expect(navKind('/', '/albums/a1')).toBe('push')
    expect(navKind('/profil', '/cop')).toBe('push')
    expect(navKind('/takvim', '/takvim/gun/2026-11-11')).toBe('push')
    expect(navKind('/albums/a1', '/')).toBe('pop')
    expect(navKind('/cop', '/profil')).toBe('pop')
  })

  it('ignores the query and a link to the same screen', () => {
    expect(navKind('/albums/a1', '/albums/a1?sayfa=3')).toBe('none')
    expect(navKind('/', '/')).toBe('none')
  })

  it('pushes between two screens at the same depth', () => {
    expect(navKind('/albums/a1', '/takvim/gun/2026-11-11')).toBe('push')
  })
})

describe('interceptable', () => {
  const origin = 'capacitor://localhost'
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }
  const link = { href: 'capacitor://localhost/albums/a1', target: '', hasDownload: false }

  it('takes plain clicks on links inside the app', () => {
    expect(interceptable(click, link, origin)).toBe('/albums/a1')
  })

  it('keeps the query and the hash', () => {
    expect(interceptable(click, { ...link, href: 'capacitor://localhost/albums/a1?sayfa=2#x' }, origin)).toBe('/albums/a1?sayfa=2#x')
  })

  it('leaves other clicks to the browser', () => {
    expect(interceptable({ ...click, metaKey: true }, link, origin)).toBeNull()
    expect(interceptable({ ...click, button: 1 }, link, origin)).toBeNull()
    expect(interceptable({ ...click, defaultPrevented: true }, link, origin)).toBeNull()
    expect(interceptable(click, { ...link, target: '_blank' }, origin)).toBeNull()
    expect(interceptable(click, { ...link, hasDownload: true }, origin)).toBeNull()
    expect(interceptable(click, { ...link, href: 'https://example.com/x' }, origin)).toBeNull()
  })
})
