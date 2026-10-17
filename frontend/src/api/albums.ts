import { api } from './client'

export interface Album {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export type MediaStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED'

export interface MediaDto {
  id: string
  type: 'IMAGE' | 'VIDEO'
  status: MediaStatus
  originalFilename: string
  contentType: string
  sizeBytes: number
  createdAt: string
  /** capture date (EXIF / video metadata), else the file's modified time on the device, else the upload time */
  displayDate: string
  caption: string | null
  /** Variant URLs exist only when status is READY. The original file is never exposed. */
  thumbUrl: string | null
  displayUrl: string | null
  loopUrl: string | null
  posterUrl: string | null
  /** display size of the variant (rotation applied) */
  width: number | null
  height: number | null
  durationMs: number | null
}

export interface UploadFileRequest {
  clientId: string
  filename: string
  contentType: string
  sizeBytes: number
  sha256?: string
  /** File.lastModified (epoch ms) */
  lastModified?: number
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
export const getMediaStatuses = (ids: string[]) =>
  api<MediaDto[]>(`/api/media?ids=${ids.join(',')}`)
export const reprocessMedia = (id: string) => api<MediaDto>(`/api/media/${id}/reprocess`, { method: 'POST' })
export const getMusicUrl = () => api<{ url: string } | undefined>('/api/settings/music')
export const deleteMedia = (id: string) => api<void>(`/api/media/${id}`, { method: 'DELETE' })
export const requestUploads = (albumId: string, files: UploadFileRequest[]) =>
  api<{ items: UploadItemResult[] }>(`/api/albums/${albumId}/uploads`, { method: 'POST', body: { files } })
export const completeUpload = (mediaId: string) => api<MediaDto>(`/api/media/${mediaId}/complete`, { method: 'POST' })
