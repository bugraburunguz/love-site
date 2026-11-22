import type { Album } from './albums'

type AlbumList = Album[] | undefined

export function addAlbum<L extends AlbumList>(list: L, album: Album): L {
  return (list && [album, ...list.filter((a) => a.id !== album.id)]) as L
}

export function replaceAlbum<L extends AlbumList>(list: L, album: Album): L {
  if (!list || !list.some((a) => a.id === album.id)) return list
  return list.map((a) => (a.id === album.id ? album : a)) as L
}

export function removeAlbum<L extends AlbumList>(list: L, id: string): L {
  return (list && list.filter((a) => a.id !== id)) as L
}
