import type { ExportFile } from '../api/exports'
import { isNativeApp } from '../native/platform'

/**
 * Handing a finished export to the phone's share sheet (Instagram, WhatsApp ... are picked there; there is no web API to post
 * to them directly). iOS Safari only allows navigator.share right after a tap, and refuses it when the tap first has to wait
 * for a download. So the files are downloaded BEFORE, kept in memory as File objects, and the "Paylaş" button only becomes
 * active once they are ready; the tap then calls navigator.share at once.
 */

/** A phone or tablet (touch first): there the share sheet is offered; desktops download. */
export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true
}

export async function prefetchFiles(files: ExportFile[]): Promise<File[]> {
  return Promise.all(files.map(async (f) => {
    const res = await fetch(f.url, { credentials: 'omit' })
    if (!res.ok) throw new Error(`İndirilemedi (${res.status})`)
    const blob = await res.blob()
    return new File([blob], f.name, { type: f.contentType || blob.type })
  }))
}

export function canShareFiles(files: File[]): boolean {
  try {
    return files.length > 0 && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files })
  } catch {
    return false
  }
}

/** Must be called directly from the click handler (no await before it). */
export function shareFiles(files: File[], title?: string): Promise<void> {
  return navigator.share({ files, title })
}

/**
 * Saves a file: from memory when it was prefetched (blob URL), else through the presigned link (Content-Disposition:
 * attachment). In the store app a web view cannot download, so the file goes to the system share sheet ("Save image",
 * "Save to Files" ...).
 */
export function download(file: Pick<ExportFile, 'url' | 'name' | 'contentType'>, prefetched?: File) {
  if (isNativeApp) {
    void import('../native/share').then(({ nativeShare }) => nativeShare([prefetched ?? file], file.name))
    return
  }
  const a = document.createElement('a')
  const href = prefetched ? URL.createObjectURL(prefetched) : file.url
  a.href = href
  a.download = file.name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  if (prefetched) setTimeout(() => URL.revokeObjectURL(href), 60_000)
}
