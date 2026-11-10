import { describe, expect, it } from 'vitest'
import { statusBarText } from './statusBar'

describe('statusBarText', () => {
  it('uses dark text on the cream paper and light text in night reading', () => {
    expect(statusBarText('light', true)).toBe('dark')
    expect(statusBarText('dark', false)).toBe('light')
  })

  it('follows the phone when the choice is "system"', () => {
    expect(statusBarText('system', true)).toBe('light')
    expect(statusBarText('system', false)).toBe('dark')
  })
})
