import { api } from './client'

export interface Album {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export interface MediaItem {
  id: string
  type: 'IMAGE' | 'VIDEO'
  status: string
  originalFilename: string
  contentType: string
  sizeBytes: number
  createdAt: string
  url: string | null
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

export const listMedia = (albumId: string) => api<MediaItem[]>(`/api/albums/${albumId}/media`)
export const deleteMedia = (id: string) => api<void>(`/api/media/${id}`, { method: 'DELETE' })
export const requestUploads = (albumId: string, files: UploadFileRequest[]) =>
  api<{ items: UploadItemResult[] }>(`/api/albums/${albumId}/uploads`, { method: 'POST', body: { files } })
export const completeUpload = (mediaId: string) => api<MediaItem>(`/api/media/${mediaId}/complete`, { method: 'POST' })
