import { describe, expect, it } from 'vitest'
import type { Geometry, PageDto, PageItemDto, PagesView } from '../../api/pages'
import { UndoableEdits, type PagesApi, type PageOps } from './undoableEdits'

let nextId = 1
const newId = () => `item-${nextId++}`

function item(over: Partial<PageItemDto>): PageItemDto {
  return { id: newId(), kind: 'MEDIA', mediaId: null, slotIndex: null, x: null, y: null, width: null, rotation: null, zIndex: null, variant: null, version: 0, ...over }
}

function page(id: string, template: PageDto['template'], items: PageItemDto[]): PageDto {
  return { id, template, items, pageIndex: 0, version: 0 } as unknown as PageDto
}

/** An in-memory server: every write answers the whole new view, like the real API. */
function fakeServer(initial: PageDto[]) {
  let view: PagesView = { pages: initial } as unknown as PagesView
  const calls: string[] = []
  const update = (fn: (pages: PageDto[]) => PageDto[]) => {
    view = { ...view, pages: fn(view.pages.map((p) => ({ ...p, items: [...p.items] }))) }
    return view
  }
  const ops: PageOps = {
    removeItem: async (itemId) => {
      calls.push(`remove ${itemId}`)
      return update((pages) => pages.map((p) => ({ ...p, items: p.items.filter((i) => i.id !== itemId) })))
    },
    placeMedia: async (pageId, mediaId, slot, geometry) => {
      calls.push(`place ${mediaId} slot=${slot ?? '-'} geo=${geometry ? `${geometry.x},${geometry.y}` : '-'}`)
      return update((pages) => pages.map((p) => (p.id === pageId ? { ...p, items: [...p.items, item({ mediaId, slotIndex: slot ?? null, x: geometry?.x ?? null, y: geometry?.y ?? null })] } : p)))
    },
    addSticker: async (pageId, variant, g: Geometry) => {
      calls.push(`sticker ${variant} ${g.x},${g.y},${g.width},${g.rotation},${g.zIndex}`)
      return update((pages) => pages.map((p) => (p.id === pageId
        ? { ...p, items: [...p.items, item({ kind: 'STICKER', variant, x: g.x ?? null, y: g.y ?? null, width: g.width ?? null, rotation: g.rotation ?? null, zIndex: g.zIndex ?? null })] }
        : p)))
    },
  }
  const api: PagesApi = {
    current: () => view,
    runFor: async (op) => {
      try {
        return await op()
      } catch {
        return null
      }
    },
    setGeometry: (itemId, g) => {
      calls.push(`geometry ${itemId} ${g.x},${g.y}`)
      update((pages) => pages.map((p) => ({ ...p, items: p.items.map((i) => (i.id === itemId ? { ...i, x: g.x ?? i.x, y: g.y ?? i.y, zIndex: g.zIndex ?? i.zIndex } : i)) })))
    },
  }
  return { api, ops, calls, view: () => view, setTemplate: (pageId: string, t: PageDto['template']) => update((pages) => pages.map((p) => (p.id === pageId ? { ...p, template: t } : p))) }
}

describe('UndoableEdits', () => {
  it('a photo taken off a FREE page comes back at its place; later steps still find it under its new id', async () => {
    const photo = item({ mediaId: 'm1', x: 100, y: 200 })
    const server = fakeServer([page('p1', 'FREE', [photo])])
    const edits = new UndoableEdits(server.api, server.ops)

    edits.onGeometry(photo.id, { x: 300, y: 400 }, true)
    await edits.removeFromPage(photo.id)
    await edits.history.undo() // back on the page, new id
    await edits.history.undo() // the move is undone on the new item
    const back = server.view().pages[0].items.find((i) => i.mediaId === 'm1')!
    expect(back.id).not.toBe(photo.id)
    expect([back.x, back.y]).toEqual([100, 200])
    expect(server.calls).toContain('place m1 slot=- geo=300,400')

    await edits.history.redo() // move again
    await edits.history.redo() // take it off again (by its newest id)
    expect(server.view().pages[0].items).toHaveLength(0)
  })

  it('on an automatic page the photo goes back into its slot, without coordinates', async () => {
    const photo = item({ mediaId: 'm2', slotIndex: 1 })
    const server = fakeServer([page('p1', 'AUTO', [photo])])
    const edits = new UndoableEdits(server.api, server.ops)
    await edits.removeFromPage(photo.id)
    await edits.history.undo()
    expect(server.calls).toContain('place m2 slot=1 geo=-')
  })

  it('does not put a photo back on a page whose layout changed meanwhile', async () => {
    const photo = item({ mediaId: 'm3', slotIndex: 0 })
    const server = fakeServer([page('p1', 'AUTO', [photo])])
    const edits = new UndoableEdits(server.api, server.ops)
    await edits.removeFromPage(photo.id)
    server.setTemplate('p1', 'FREE')
    expect(await edits.history.undo()).toBe(false)
    expect(server.calls.some((c) => c.startsWith('place'))).toBe(false)
  })

  it('a removed sticker comes back with its variant and whole geometry', async () => {
    const sticker = item({ kind: 'STICKER', variant: 'romantik:wax-seal', x: 10, y: 20, width: 170, rotation: 15, zIndex: 4 })
    const server = fakeServer([page('p1', 'FREE', [sticker])])
    const edits = new UndoableEdits(server.api, server.ops)
    await edits.removeFromPage(sticker.id)
    await edits.history.undo()
    expect(server.calls).toContain('sticker romantik:wax-seal 10,20,170,15,4')
  })

  it('reset forgets the steps and a gesture that never ended', async () => {
    const photo = item({ mediaId: 'm4', x: 1, y: 1 })
    const server = fakeServer([page('p1', 'FREE', [photo])])
    const edits = new UndoableEdits(server.api, server.ops)
    edits.onGeometry(photo.id, { x: 5, y: 5 }, false) // drag started, never finished
    edits.reset()
    edits.onGeometry(photo.id, { x: 9, y: 9 }, true)
    await edits.history.undo()
    // undoes to where this gesture started (5,5), not to the stale start of the abandoned one (1,1)
    const now = server.view().pages[0].items[0]
    expect([now.x, now.y]).toEqual([5, 5])
  })
})
