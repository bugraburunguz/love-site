import { useCallback, useEffect, useRef, useState } from 'react'
import { createExport, getExport, listAlbumExports, type ExportJob, type ExportType } from '../api/exports'

const DISMISSED_KEY = 'exports-dismissed'

function readDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

function writeDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids].slice(-200)))
  } catch {
    /* storage unavailable: the card simply comes back next time */
  }
}

/**
 * The exports of one album (last 24 h). Jobs keep running on the server when the page is left; coming back to the album
 * lists them again, so a finished one shows up as "Hazır". Unfinished ones are polled every 3 s.
 */
export function useExports(albumId: string) {
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(readDismissed)
  /** jobs started on this page, newest first: their cards stay on top even when the server returns an older, identical job */
  const started = useRef(new Map<string, number>())

  const refresh = useCallback(() => {
    listAlbumExports(albumId).then(setJobs).catch(() => undefined)
  }, [albumId])

  useEffect(() => {
    refresh()
    const again = () => !document.hidden && refresh()
    document.addEventListener('visibilitychange', again)
    return () => document.removeEventListener('visibilitychange', again)
  }, [refresh])

  const activeKey = jobs.filter((j) => j.status === 'QUEUED' || j.status === 'RUNNING').map((j) => j.id).join(',')
  useEffect(() => {
    if (!activeKey) return
    const timer = setInterval(() => {
      if (document.hidden) return
      for (const id of activeKey.split(',')) {
        getExport(id)
          .then((fresh) => setJobs((list) => list.map((j) => (j.id === fresh.id ? fresh : j))))
          .catch(() => undefined)
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [activeKey])

  const start = useCallback(async (type: ExportType, params: Record<string, unknown>) => {
    const job = await createExport(type, params)
    started.current.set(job.id, Date.now())
    setJobs((list) => [job, ...list.filter((j) => j.id !== job.id)])
    setDismissed((d) => {
      if (!d.has(job.id)) return d
      const next = new Set(d)
      next.delete(job.id)
      writeDismissed(next)
      return next
    })
    return job
  }, [])

  const dismiss = useCallback((id: string) => {
    setDismissed((d) => {
      const next = new Set(d).add(id)
      writeDismissed(next)
      return next
    })
  }, [])

  const rank = (j: ExportJob) => started.current.get(j.id) ?? 0
  const cards = jobs
    .filter((j) => !dismissed.has(j.id))
    .sort((a, b) => rank(b) - rank(a) || b.createdAt.localeCompare(a.createdAt))
    // one card at a time: more would cover the book (all of them are listed in the share dialog)
    .slice(0, 1)
  return { jobs, cards, start, dismiss, refresh }
}
