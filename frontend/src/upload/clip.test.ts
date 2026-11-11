import { describe, expect, it } from 'vitest'
import { CLIP_SECONDS, clipRange, clipStart, isVideoFile, timeLabel } from './clip'

describe('clipRange', () => {
  it('lets the window slide from the beginning to 3 s before the end', () => {
    expect(clipRange(10)).toEqual({ max: 7, length: CLIP_SECONDS })
  })

  it('has nothing to choose for a video of 3 s or less (it is used whole)', () => {
    expect(clipRange(3)).toEqual({ max: 0, length: 3 })
    expect(clipRange(1.5)).toEqual({ max: 0, length: 1.5 })
  })

  it('treats an unknown length as a single clip', () => {
    expect(clipRange(Number.NaN)).toEqual({ max: 0, length: CLIP_SECONDS })
  })
})

describe('clipStart', () => {
  it('keeps the start inside the video and rounds to whole milliseconds', () => {
    expect(clipStart(4.25, 10)).toBe(4250)
    expect(clipStart(9, 10)).toBe(7000)
    expect(clipStart(-1, 10)).toBe(0)
    expect(clipStart(1.23456, 10)).toBe(1235)
  })
})

describe('timeLabel', () => {
  it('writes minutes and seconds like a player', () => {
    expect(timeLabel(0)).toBe('0:00')
    expect(timeLabel(4.6)).toBe('0:04')
    expect(timeLabel(75)).toBe('1:15')
  })
})

describe('isVideoFile', () => {
  it('knows videos by type, and by extension when the type is missing', () => {
    expect(isVideoFile({ name: 'a.mov', type: 'video/quicktime' })).toBe(true)
    expect(isVideoFile({ name: 'IMG_0001.MOV', type: '' })).toBe(true)
    expect(isVideoFile({ name: 'a.jpg', type: 'image/jpeg' })).toBe(false)
  })
})
