import type { Album, MediaDto } from './albums'
import { api } from './client'

export interface TrashAlbum {
  album: Album
  mediaCount: number
  deletedAt: string
  purgeAt: string
}

export interface TrashMedia {
  media: MediaDto
  albumId: string
  albumTitle: string | null
  deletedAt: string
  purgeAt: string
}

export interface TrashView {
  retentionDays: number
  albums: TrashAlbum[]
  media: TrashMedia[]
}

export const getTrash = () => api<TrashView>('/api/trash')
export const restoreMedia = (id: string) => api<void>(`/api/trash/media/${id}/restore`, { method: 'POST' })
export const restoreAlbum = (id: string) => api<void>(`/api/trash/albums/${id}/restore`, { method: 'POST' })
