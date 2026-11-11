import { describe, expect, it } from 'vitest'
import { LatestSaver, UndoBurst } from './latestSaver'

describe('UndoBurst', () => {
  it('undoes a burst of quick picks to the theme from before the first one', () => {
    const burst = new UndoBurst<string>()
    const a = burst.start('romantik')
    const b = burst.start('buyulu') // tapped while the first save runs
    expect(a.from).toBe('romantik')
    expect(b.from).toBe('romantik')
    expect(burst.settle(a.seq)).toBe(false) // an older pick: no note for it
    expect(burst.settle(b.seq)).toBe(true)
  })

  it('starts a new burst once every save has settled', () => {
    const burst = new UndoBurst<string>()
    const a = burst.start('romantik')
    burst.settle(a.seq)
    const b = burst.start('seyahat')
    expect(b.from).toBe('seyahat')
    expect(burst.settle(b.seq)).toBe(true)
  })
})

function deferred() {
  let resolve!: () => void
  let reject!: (e: Error) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('LatestSaver', () => {
  it('saves a single pick at once', async () => {
    const saved: string[] = []
    const saver = new LatestSaver<string>(async (v) => {
      saved.push(v)
    })
    await saver.save('buyulu')
    expect(saved).toEqual(['buyulu'])
  })

  it('skips the picks made while a save runs and saves only the last one after it', async () => {
    const calls: string[] = []
    const gates: ReturnType<typeof deferred>[] = []
    const saver = new LatestSaver<string>((v) => {
      calls.push(v)
      const d = deferred()
      gates.push(d)
      return d.promise
    })
    const first = saver.save('buyulu')
    const second = saver.save('seyahat')
    const third = saver.save('yilbasi')
    expect(calls).toEqual(['buyulu'])
    gates[0].resolve()
    await first
    await Promise.resolve()
    expect(calls).toEqual(['buyulu', 'yilbasi'])
    gates[1].resolve()
    await Promise.all([second, third])
    expect(calls).toEqual(['buyulu', 'yilbasi'])
  })

  it('still saves the queued pick when the running save fails', async () => {
    const calls: string[] = []
    const gates: ReturnType<typeof deferred>[] = []
    const saver = new LatestSaver<string>((v) => {
      calls.push(v)
      const d = deferred()
      gates.push(d)
      return d.promise
    })
    const first = saver.save('buyulu')
    const second = saver.save('seyahat')
    gates[0].reject(new Error('ağ hatası'))
    await expect(first).rejects.toThrow('ağ hatası')
    await Promise.resolve()
    expect(calls).toEqual(['buyulu', 'seyahat'])
    gates[1].resolve()
    await expect(second).resolves.toBeUndefined()
  })

  it('reports a failed save to the caller and keeps working', async () => {
    let fail = true
    const saver = new LatestSaver<string>(async () => {
      if (fail) throw new Error('Tema kaydedilemedi')
    })
    await expect(saver.save('buyulu')).rejects.toThrow('Tema kaydedilemedi')
    fail = false
    await expect(saver.save('seyahat')).resolves.toBeUndefined()
  })
})
