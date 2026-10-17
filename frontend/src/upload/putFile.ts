/** PUT a file to a presigned URL. XMLHttpRequest because fetch has no upload progress events. */
export function putFile(
  url: string,
  file: File,
  contentType: string,
  onProgress: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    // Must match the Content-Type the URL was signed with.
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Yükleme başarısız (${xhr.status})`))
    xhr.onerror = () => reject(new Error('Ağ hatası'))
    xhr.ontimeout = () => reject(new Error('Zaman aşımı'))
    xhr.send(file)
  })
}
