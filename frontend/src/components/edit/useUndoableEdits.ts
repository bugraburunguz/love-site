import { useMemo, useRef } from 'react'
import { addSticker, placeMedia, removeItem } from '../../api/pages'
import { UndoableEdits, type PagesApi } from './undoableEdits'

/** One UndoableEdits per album screen, always talking to the latest usePages functions. */
export function useUndoableEdits(pages: PagesApi): UndoableEdits {
  const latest = useRef(pages)
  latest.current = pages
  return useMemo(
    () =>
      new UndoableEdits(
        {
          current: () => latest.current.current(),
          runFor: (op) => latest.current.runFor(op),
          setGeometry: (itemId, geometry, final) => latest.current.setGeometry(itemId, geometry, final),
        },
        { removeItem, placeMedia, addSticker },
      ),
    [],
  )
}
