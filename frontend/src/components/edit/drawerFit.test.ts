import { describe, expect, it } from 'vitest'
import { closesAfterPick } from './drawerFit'

describe('closesAfterPick', () => {
  it('closes the drawer on a phone, where it covers the page the sticker lands on', () => {
    expect(closesAfterPick(393)).toBe(true)
    expect(closesAfterPick(759)).toBe(true)
  })

  it('keeps it open beside the page on wider screens, to add several in a row', () => {
    expect(closesAfterPick(760)).toBe(false)
    expect(closesAfterPick(1440)).toBe(false)
  })
})
