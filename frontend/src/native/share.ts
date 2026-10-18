import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

/**
 * Sharing / saving in the store app. A web view can neither download files nor (reliably) use the Web Share API, so a file
 * is fetched, written to the app's cache folder and handed to the system share sheet, which offers Instagram, WhatsApp,
 * "Save image / video" (gallery) and "Save to Files".
 */
export interface NativeFile {
  url: string
  name: string
  contentType?: string
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(reader.error ?? new Error('Dosya okunamadı'))
    reader.readAsDataURL(blob)
  })
}

async function toCache(file: NativeFile | File): Promise<string> {
  const blob = file instanceof File ? file : await fetch(file.url, { credentials: 'omit' }).then((r) => {
    if (!r.ok) throw new Error(`İndirilemedi (${r.status})`)
    return r.blob()
  })
  const safe = file.name.replace(/[^\p{L}\p{N}._-]+/gu, '_')
  const written = await Filesystem.writeFile({ path: `share/${Date.now()}-${safe}`, data: await toBase64(blob), directory: Directory.Cache, recursive: true })
  return written.uri
}

export async function nativeShare(files: Array<NativeFile | File>, title?: string): Promise<void> {
  const uris: string[] = []
  for (const f of files) uris.push(await toCache(f))
  try {
    await Share.share({ title, files: uris, dialogTitle: title })
  } catch (e) {
    // closing the share sheet without choosing is not an error
    if (!/cancel/i.test(String((e as Error)?.message ?? e))) throw e
  }
}
