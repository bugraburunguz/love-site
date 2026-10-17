import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'
import { completeUpload, requestUploads } from '../api/albums'
import { putFile } from './putFile'
import { sha256File } from './sha256'

const CONCURRENCY = 3

/** crypto.randomUUID only exists in secure contexts (https or localhost); fall back for plain-http dev access. */
function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export type UploadStatus = 'queued' | 'hashing' | 'uploading' | 'verifying' | 'done' | 'duplicate' | 'error'

export interface UploadEntry {
  id: string
  file: File
  status: UploadStatus
  /** 0..1 for the current phase (hashing or uploading) */
  progress: number
  sha256?: string
  /** "Tek sayfa": the photo gets a page of its own */
  featured?: boolean
  error?: string
  /** the space is full: retrying does not help until something is deleted */
  quota?: boolean
}

const BUSY: UploadStatus[] = ['queued', 'hashing', 'uploading', 'verifying']

export function isBusy(entry: UploadEntry): boolean {
  return BUSY.includes(entry.status)
}

/** Upload queue with at most 3 files in flight: hash -> presign -> PUT -> complete. */
export function useUploadQueue(albumId: string, onIdle: () => void) {
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const entriesRef = useRef<UploadEntry[]>([])
  const active = useRef(0)
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  const update = useCallback((id: string, patch: Partial<UploadEntry>) => {
    entriesRef.current = entriesRef.current.map((e) => (e.id === id ? { ...e, ...patch } : e))
    setEntries(entriesRef.current)
  }, [])

  const run = useCallback(
    async (entry: UploadEntry) => {
      const { id, file } = entry
      try {
        let sha256 = entry.sha256
        if (!sha256) {
          update(id, { status: 'hashing', progress: 0 })
          sha256 = await sha256File(file, (progress) => update(id, { progress }))
          update(id, { sha256 })
        }

        update(id, { status: 'uploading', progress: 0, error: undefined, quota: false })
        const { items } = await requestUploads(albumId, [
          { clientId: id, filename: file.name, contentType: file.type, sizeBytes: file.size, sha256, lastModified: file.lastModified, featured: entry.featured },
        ])
        const result = items[0]
        if (result.result === 'DUPLICATE') {
          update(id, { status: 'duplicate', progress: 1 })
          return
        }
        if (result.result === 'QUOTA_EXCEEDED') {
          update(id, { status: 'error', error: result.error ?? 'Depolama alanınız dolu', quota: true })
          return
        }
        if (result.result === 'ERROR' || !result.uploadUrl || !result.mediaId || !result.contentType) {
          throw new Error(result.error ?? 'Yükleme hazırlanamadı')
        }

        await putFile(result.uploadUrl, file, result.contentType, (progress) => update(id, { progress }))
        update(id, { status: 'verifying', progress: 1 })
        await completeUpload(result.mediaId)
        update(id, { status: 'done', progress: 1 })
      } catch (e) {
        update(id, { status: 'error', error: e instanceof Error ? e.message : 'Hata', quota: e instanceof ApiError && e.code === 'QUOTA_EXCEEDED' })
      }
    },
    [albumId, update],
  )

  const pump = useCallback(() => {
    while (active.current < CONCURRENCY) {
      const next = entriesRef.current.find((e) => e.status === 'queued')
      if (!next) break
      active.current++
      update(next.id, { status: 'hashing', progress: 0 })
      void run(next).finally(() => {
        active.current--
        pump()
        if (active.current === 0 && !entriesRef.current.some((e) => e.status === 'queued')) onIdleRef.current()
      })
    }
  }, [run, update])

  const add = useCallback(
    (files: File[], featured: boolean[] = []) => {
      const added = files.map<UploadEntry>((file, i) => ({ id: newId(), file, status: 'queued', progress: 0, featured: featured[i] === true }))
      entriesRef.current = [...entriesRef.current, ...added]
      setEntries(entriesRef.current)
      pump()
    },
    [pump],
  )

  const retry = useCallback(
    (id: string) => {
      update(id, { status: 'queued', progress: 0, error: undefined })
      pump()
    },
    [pump, update],
  )

  const clearFinished = useCallback(() => {
    entriesRef.current = entriesRef.current.filter(isBusy)
    setEntries(entriesRef.current)
  }, [])

  // Warn before leaving while anything is still uploading.
  const busy = entries.some(isBusy)
  useEffect(() => {
    if (!busy) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [busy])

  return { entries, add, retry, clearFinished, busy }
}
