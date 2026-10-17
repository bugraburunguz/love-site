const CHUNK_SIZE = 4 * 1024 * 1024

/** Incremental SHA-256: reads the file in slices so a large video never sits in memory as one buffer. */
export async function sha256File(file: File, onProgress?: (ratio: number) => void): Promise<string> {
  // loaded on first upload only, so the login and album screens do not pay for it
  const { createSHA256 } = await import('hash-wasm')
  const hasher = await createSHA256()
  hasher.init()
  for (let offset = 0; offset < file.size; offset += CHUNK_SIZE) {
    const buffer = await file.slice(offset, offset + CHUNK_SIZE).arrayBuffer()
    hasher.update(new Uint8Array(buffer))
    onProgress?.(Math.min(1, (offset + CHUNK_SIZE) / file.size))
  }
  return hasher.digest('hex')
}
