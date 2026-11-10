import { useSyncExternalStore } from 'react'

/**
 * One undoable edit of the album editor. Both directions talk to the server and answer whether it worked; ids that
 * change on the way (a removed item comes back with a new id) are resolved inside the closures at run time.
 */
export interface HistoryEntry {
  label: string
  undo: () => Promise<boolean>
  redo: () => Promise<boolean>
}

/**
 * Undo / redo of the album editor. One step runs at a time. A failed step clears everything: the server then holds a
 * state the remaining steps were not recorded against (another device edited, a 409 reloaded the pages).
 */
export class EditHistory {
  private done: HistoryEntry[] = []
  private undone: HistoryEntry[] = []
  private running = false
  /** edits pushed while a step was running; the older steps no longer match the pages, so only these survive */
  private pushedWhileRunning: HistoryEntry[] = []
  private readonly listeners = new Set<() => void>()
  private snapshot = 0

  constructor(private readonly limit = 50) {}

  get canUndo() { return !this.running && this.done.length > 0 }
  get canRedo() { return !this.running && this.undone.length > 0 }
  get busy() { return this.running }
  get size() { return this.done.length }
  get undoLabel() { return this.done.at(-1)?.label ?? null }
  get redoLabel() { return this.undone.at(-1)?.label ?? null }

  push(entry: HistoryEntry) {
    if (this.running) {
      this.pushedWhileRunning.push(entry)
      return
    }
    this.done.push(entry)
    if (this.done.length > this.limit) this.done.shift()
    this.undone = []
    this.emit()
  }

  clear() {
    this.done = []
    this.undone = []
    this.pushedWhileRunning = []
    this.emit()
  }

  undo(): Promise<boolean> {
    return this.step(this.done, this.undone, 'undo')
  }

  redo(): Promise<boolean> {
    return this.step(this.undone, this.done, 'redo')
  }

  private async step(from: HistoryEntry[], to: HistoryEntry[], direction: 'undo' | 'redo'): Promise<boolean> {
    if (this.running || from.length === 0) return false
    const entry = from.pop()!
    this.running = true
    this.emit()
    let ok = false
    try {
      ok = await entry[direction]()
    } catch {
      ok = false
    }
    this.running = false
    if (this.pushedWhileRunning.length > 0) {
      // the user edited while the step ran: what the stacks recorded is no longer reliable
      this.done = this.pushedWhileRunning.slice(-this.limit)
      this.undone = []
      this.pushedWhileRunning = []
    } else if (ok) to.push(entry)
    else {
      this.done = []
      this.undone = []
    }
    this.emit()
    return ok
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** changes whenever anything a button shows could have changed (for useSyncExternalStore) */
  version = () => this.snapshot

  private emit() {
    this.snapshot++
    this.listeners.forEach((l) => l())
  }
}

/** Re-renders the caller when the history changes. */
export function useHistoryState(history: EditHistory) {
  useSyncExternalStore(history.subscribe, history.version)
  return { canUndo: history.canUndo, canRedo: history.canRedo, busy: history.busy, undoLabel: history.undoLabel, redoLabel: history.redoLabel }
}
