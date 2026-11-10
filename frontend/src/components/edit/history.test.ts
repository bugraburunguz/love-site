import { describe, expect, it } from 'vitest'
import { EditHistory, type HistoryEntry } from './history'

function recorder() {
  const log: string[] = []
  const entry = (name: string, ok = true): HistoryEntry => ({
    label: name,
    undo: async () => { log.push(`undo ${name}`); return ok },
    redo: async () => { log.push(`redo ${name}`); return ok },
  })
  return { log, entry }
}

describe('EditHistory', () => {
  it('undoes newest first and redoes in the original order', async () => {
    const h = new EditHistory()
    const { log, entry } = recorder()
    h.push(entry('a'))
    h.push(entry('b'))
    expect(h.canUndo).toBe(true)
    expect(h.canRedo).toBe(false)
    await h.undo()
    await h.undo()
    expect(h.canUndo).toBe(false)
    await h.redo()
    await h.redo()
    expect(log).toEqual(['undo b', 'undo a', 'redo a', 'redo b'])
  })

  it('a new edit drops what could be redone', async () => {
    const h = new EditHistory()
    const { entry } = recorder()
    h.push(entry('a'))
    await h.undo()
    h.push(entry('b'))
    expect(h.canRedo).toBe(false)
    expect(h.undoLabel).toBe('b')
  })

  it('keeps only the newest steps', () => {
    const h = new EditHistory(3)
    const { entry } = recorder()
    for (const n of ['a', 'b', 'c', 'd']) h.push(entry(n))
    expect(h.size).toBe(3)
    expect(h.undoLabel).toBe('d')
  })

  it('forgets everything when a step fails (the server holds something else now)', async () => {
    const h = new EditHistory()
    const { entry } = recorder()
    h.push(entry('a'))
    h.push(entry('b', false))
    expect(await h.undo()).toBe(false)
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
  })

  it('runs one step at a time and tells listeners', async () => {
    const h = new EditHistory()
    let calls = 0
    h.subscribe(() => calls++)
    let release!: () => void
    h.push({ label: 'slow', undo: () => new Promise<boolean>((r) => { release = () => r(true) }), redo: async () => true })
    const first = h.undo()
    expect(h.busy).toBe(true)
    expect(await h.undo()).toBe(false) // ignored while busy
    release()
    await first
    expect(h.busy).toBe(false)
    expect(calls).toBeGreaterThanOrEqual(3)
  })
})
