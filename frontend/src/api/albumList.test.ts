import { describe, expect, it } from 'vitest'
import type { Album } from './albums'
import { addAlbum, removeAlbum, replaceAlbum } from './albumList'

const album = (id: string, title = id): Album => ({
  id,
  title,
  themeId: 'romantik',
  musicUrl: null,
  musicName: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  mediaCount: 0,
  firstShownAt: null,
  lastShownAt: null,
  coverUrl: null,
})

describe('album list', () => {
  it('puts a new album first (the shelf is newest first) and never twice', () => {
    const list = [album('a'), album('b')]
    expect(addAlbum(list, album('c')).map((a) => a.id)).toEqual(['c', 'a', 'b'])
    expect(addAlbum(list, album('b', 'B2')).map((a) => a.title)).toEqual(['B2', 'a'])
  })

  it('replaces an album in its place, and leaves the list alone when it is not there', () => {
    const list = [album('a'), album('b'), album('c')]
    expect(replaceAlbum(list, album('b', 'yeni')).map((a) => a.title)).toEqual(['a', 'yeni', 'c'])
    expect(replaceAlbum(list, album('x'))).toBe(list)
  })

  it('removes an album', () => {
    expect(removeAlbum([album('a'), album('b')], 'a').map((a) => a.id)).toEqual(['b'])
  })

  it('keeps an unknown list unknown', () => {
    expect(addAlbum(undefined, album('a'))).toBeUndefined()
    expect(replaceAlbum(undefined, album('a'))).toBeUndefined()
    expect(removeAlbum(undefined, 'a')).toBeUndefined()
  })
})
