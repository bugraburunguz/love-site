/** Every file under themes/<id>/assets/ as a URL (the files stay files: no inlining, so the CSP never needs data: URLs). */
const urls = import.meta.glob('./*/assets/**/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

export function assetUrl(themeId: string, file: string): string | undefined {
  return urls[`./${themeId}/assets/${file}`]
}

/** CSS url() value for an asset, or 'none' when the file is missing. */
export function cssUrl(themeId: string, file: string | undefined): string {
  const url = file ? assetUrl(themeId, file) : undefined
  return url ? `url("${url}")` : 'none'
}
