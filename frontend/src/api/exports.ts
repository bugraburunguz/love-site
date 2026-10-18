import { api } from './client'

export type ExportType = 'POLAROID' | 'STORY' | 'POST' | 'CAROUSEL' | 'REELS' | 'STICKER_PACK'
export type ExportStatus = 'QUEUED' | 'RUNNING' | 'READY' | 'FAILED'

export interface ExportFile {
  name: string
  contentType: string
  size: number
  /** short-lived presigned link; the browser saves the file under `name` */
  url: string
  /** main: the result; zip: everything in one file; png: single transparent sticker */
  role: 'main' | 'zip' | 'png'
}

export interface ExportJob {
  id: string
  type: ExportType
  status: ExportStatus
  albumId: string | null
  params: Record<string, unknown>
  createdAt: string
  finishedAt: string | null
  expiresAt: string
  files: ExportFile[]
  notes: string[]
  error: string | null
  /** what the render measured per scene (polaroid position / rotation, caption overflow) */
  meta: Record<string, unknown>[]
}

export const createExport = (type: ExportType, params: Record<string, unknown>) =>
  api<ExportJob>('/api/exports', { method: 'POST', body: { type, params } })
export const getExport = (id: string) => api<ExportJob>(`/api/exports/${id}`)
export const listAlbumExports = (albumId: string) => api<ExportJob[]>(`/api/albums/${albumId}/exports`)
export const getOriginal = (mediaId: string) => api<{ url: string; filename: string }>(`/api/media/${mediaId}/original`)
