import { createSHA256 } from 'hash-wasm'

const CHUNK_SIZE = 4 * 1024 * 1024

/** Incremental SHA-256: reads the file in slices so a large video never sits in memory as one buffer. */
export async function sha256File(file: File, onProgress?: (ratio: number) => void): Promise<string> {
  const hasher = await createSHA256()
  hasher.init()
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const buffer = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer()
    hasher.update(new Uint8Array(buffer))
    onProgress?.(Math.min(1, (offset + CHUNK_SIZE) / file.size))
  }
  return hasher.digest('hex')
}
