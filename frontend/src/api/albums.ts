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
  /** the file gets a page of its own */
  featured?: boolean
}

export interface UploadItemResult {
  clientId: string
  result: 'PRESIGNED' | 'DUPLICATE' | 'QUOTA_EXCEEDED' | 'ERROR'
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

export interface SpaceInfo {
  id: string
  name: string
  role: 'OWNER' | 'MEMBER'
  members: { displayName: string; role: string }[]
  usedBytes: number
  limitBytes: number
  maxMembers: number
  canInvite: boolean
}

export interface CreatedInvite {
  spaceId: string
  token: string
  path: string
  expiresAt: string
}

export const getSpace = () => api<SpaceInfo>('/api/space')
export const createPartnerInvite = () => api<CreatedInvite>('/api/space/invites', { method: 'POST' })

export interface AdminSpace {
  id: string
  name: string
  members: { displayName: string; role: string }[]
  usedBytes: number
  limitBytes: number
  createdAt: string
}

export const adminListSpaces = () => api<AdminSpace[]>('/api/admin/spaces')
export const adminCreateSpace = (name: string, limitGb: number) =>
  api<{ space: AdminSpace; invitation: CreatedInvite }>('/api/admin/spaces', { method: 'POST', body: { name, limitGb } })
export const adminUpdateSpace = (id: string, patch: { name?: string; limitGb?: number }) =>
  api<AdminSpace>(`/api/admin/spaces/${id}`, { method: 'PATCH', body: patch })
export const adminReissueOwnerInvite = (id: string) =>
  api<CreatedInvite>(`/api/admin/spaces/${id}/invites`, { method: 'POST' })

export interface InvitePreview {
  spaceName: string
  role: 'OWNER' | 'MEMBER'
  expiresAt: string
}

export const previewInvite = (token: string) => api<InvitePreview>(`/api/invites/${encodeURIComponent(token)}`)

/** "12,3 GB" style size */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toLocaleString('tr-TR', { maximumFractionDigits: i < 2 ? 0 : 1 })} ${units[i]}`
}
