import { api } from './client'

export interface Album {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface MediaDto {
  id: string
  type: 'IMAGE' | 'VIDEO'
  status: string
  originalFilename: string
  contentType: string
  sizeBytes: number
  createdAt: string
  caption: string | null
  /** original file */
  url: string | null
  /** The fields below are produced by the media worker in a later phase; null until then. */
  displayUrl?: string | null
  thumbUrl?: string | null
  loopUrl?: string | null
  posterUrl?: string | null
  width?: number | null
  height?: number | null
}

export interface UploadFileRequest {
  clientId: string
  filename: string
  contentType: string
  sizeBytes: number
  sha256?: string
}

export interface UploadItemResult {
  clientId: string
  result: 'PRESIGNED' | 'DUPLICATE' | 'ERROR'
  mediaId: string | null
  uploadUrl: string | null
  contentType: string | null
  error: string | null
}

export const listAlbums = () => api<Album[]>('/api/albums')
export const createAlbum = (title: string) => api<Album>('/api/albums', { method: 'POST', body: { title } })
export const renameAlbum = (id: string, title: string) =>
  api<Album>(`/api/albums/${id}`, { method: 'PATCH', body: { title } })
export const deleteAlbum = (id: string) => api<void>(`/api/albums/${id}`, { method: 'DELETE' })

export const listMedia = (albumId: string) => api<MediaDto[]>(`/api/albums/${albumId}/media`)
export const updateCaption = (id: string, caption: string) =>
  api<MediaDto>(`/api/media/${id}`, { method: 'PATCH', body: { caption } })
export const getMusicUrl = () => api<{ url: string } | undefined>('/api/settings/music')
export const deleteMedia = (id: string) => api<void>(`/api/media/${id}`, { method: 'DELETE' })
export const requestUploads = (albumId: string, files: UploadFileRequest[]) =>
  api<{ items: UploadItemResult[] }>(`/api/albums/${albumId}/uploads`, { method: 'POST', body: { files } })
export const completeUpload = (mediaId: string) => api<MediaDto>(`/api/media/${mediaId}/complete`, { method: 'POST' })
