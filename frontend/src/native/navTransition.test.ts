import { describe, expect, it } from 'vitest'
import { backAction, interceptable, keepsTabs, navKind, nextStack } from './navTransition'

describe('keepsTabs', () => {
  it('holds the tab bar still only when both screens show it', () => {
    expect(keepsTabs('/profil', '/cop')).toBe(true)
    expect(keepsTabs('/', '/takvim')).toBe(true)
    expect(keepsTabs('/', '/albums/a1')).toBe(false)
    expect(keepsTabs('/albums/a1?sayfa=2', '/')).toBe(false)
  })
})

describe('nextStack', () => {
  it('follows pushes, replaces and back steps', () => {
    let s = nextStack([], 'POP', '/profil') // app start
    expect(s).toEqual(['/profil'])
    s = nextStack(s, 'PUSH', '/cop')
    expect(s).toEqual(['/profil', '/cop'])
    s = nextStack(s, 'REPLACE', '/admin')
    expect(s).toEqual(['/profil', '/admin'])
    s = nextStack(s, 'POP', '/profil')
    expect(s).toEqual(['/profil'])
  })

  it('starts over on a jump it cannot place', () => {
    expect(nextStack(['/', '/albums/a1'], 'POP', '/takvim')).toEqual(['/takvim'])
  })

  it('ignores a change of the query on the same screen', () => {
    expect(nextStack(['/', '/albums/a1'], 'PUSH', '/albums/a1')).toEqual(['/', '/albums/a1'])
  })
})

describe('backAction', () => {
  it('steps back in history when the previous screen is the parent', () => {
    expect(backAction(['/profil', '/cop'], '/profil')).toBe('history')
  })

  it('replaces the screen when the app was opened on it (no parent behind it)', () => {
    expect(backAction(['/cop'], '/profil')).toBe('replace')
    expect(backAction(['/', '/cop'], '/profil')).toBe('replace')
  })

  it('compares paths without the query', () => {
    expect(backAction(['/takvim', '/takvim/gun/2026-11-11'], '/takvim?ay=2026-11')).toBe('history')
  })
})

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
