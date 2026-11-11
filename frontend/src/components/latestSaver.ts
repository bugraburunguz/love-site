/**
 * Bookkeeping for "Geri al" over picks saved at once: a burst of quick picks (each started before the previous one
 * settled) is undone as one, back to the value from before its first pick; only the last pick of a burst gets a note.
 */
export class UndoBurst<T> {
  private pending = 0
  private seq = 0
  private from: T | undefined

  /** a pick was made while `current` was in effect */
  start(current: T): { seq: number; from: T } {
    if (this.pending === 0) this.from = current
    this.pending++
    return { seq: ++this.seq, from: this.from as T }
  }

  /** the pick's save settled; true when it was the latest pick (the one that speaks to the user) */
  settle(seq: number): boolean {
    this.pending = Math.max(0, this.pending - 1)
    return seq === this.seq
  }
}

/**
 * Saves a value the moment it is picked, one request at a time. Picks made while a save is running are not queued one
 * by one: only the last of them is saved afterwards (tapping through themes sends at most two requests). Every caller's
 * promise settles when the save covering its pick is done.
 */
export class LatestSaver<T> {
  private running: Promise<void> | null = null
  private next: { value: T; waiters: { resolve: () => void; reject: (e: unknown) => void }[] } | null = null

  constructor(private readonly write: (value: T) => Promise<void>) {}

  save(value: T): Promise<void> {
    if (!this.running) return this.start(value)
    return new Promise<void>((resolve, reject) => {
      const waiters = this.next?.waiters ?? []
      waiters.push({ resolve, reject })
      this.next = { value, waiters }
    })
  }

  private start(value: T): Promise<void> {
    const run = this.write(value)
    this.running = run.then(
      () => this.drain(),
      () => this.drain(),
    )
    return run
  }

  private drain(): void {
    this.running = null
    const queued = this.next
    this.next = null
    if (!queued) return
    this.start(queued.value).then(
      () => queued.waiters.forEach((w) => w.resolve()),
      (e) => queued.waiters.forEach((w) => w.reject(e)),
    )
  }
}
