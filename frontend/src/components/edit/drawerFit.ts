/**
 * The edit drawers (Hatıra çantası) slide in from the right, min(340px, 88vw) wide (edit.css .tray). Below the tablet
 * breakpoint they cover the page, so after a sticker is picked the drawer closes and the sticker is seen landing;
 * from tablet width up the page stays visible beside it and the drawer stays open for the next one.
 */
export const DRAWER_BESIDE_PAGE_MIN_WIDTH = 760

export function closesAfterPick(viewportWidth: number): boolean {
  return viewportWidth < DRAWER_BESIDE_PAGE_MIN_WIDTH
}
