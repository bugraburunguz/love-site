import { describe, expect, it } from 'vitest'
import { RETURN_REFRESH_GAP_MS, shouldRefreshOnReturn } from './refreshThrottle'

describe('shouldRefreshOnReturn', () => {
  it('refreshes only when the tab is visible and the last refresh is at least 30 s old', () => {
    expect(RETURN_REFRESH_GAP_MS).toBe(30_000)
    expect(shouldRefreshOnReturn(false, 0, 100_000)).toBe(true)
    expect(shouldRefreshOnReturn(false, 70_000, 100_000)).toBe(true)
    expect(shouldRefreshOnReturn(false, 70_001, 100_000)).toBe(false)
    expect(shouldRefreshOnReturn(true, 0, 100_000)).toBe(false)
  })
})
