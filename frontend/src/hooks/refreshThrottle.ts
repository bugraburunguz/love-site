export const RETURN_REFRESH_GAP_MS = 30_000

export function shouldRefreshOnReturn(hidden: boolean, lastRefreshAt: number, now: number): boolean {
  return !hidden && now - lastRefreshAt >= RETURN_REFRESH_GAP_MS
}
