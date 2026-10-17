/** Sticker variants are stored as "themeId:stickerId". */
const VARIANT = /^[a-z][a-z0-9-]{1,30}:[a-z][a-z0-9-]{1,40}$/

export function makeVariant(themeId: string, stickerId: string): string {
  return `${themeId}:${stickerId}`
}

export function parseVariant(variant: string | null | undefined): { themeId: string; stickerId: string } | null {
  if (!variant || !VARIANT.test(variant)) return null
  const [themeId, stickerId] = variant.split(':')
  return { themeId, stickerId }
}
