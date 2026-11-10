import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { contrast } from '../themes/contrast'

const css = readFileSync(fileURLToPath(new URL('./ui-tokens.css', import.meta.url)), 'utf8')

/** The custom properties declared inside the first block that starts with `selector {`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector + ' {')
  if (start < 0) throw new Error(`no block for ${selector}`)
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const vars: Record<string, string> = {}
  for (const m of body.matchAll(/(--ui-[\w-]+)\s*:\s*([^;]+);/g)) vars[m[1]] = m[2].trim()
  return vars
}

const light = block(':root')
const darkAuto = block(':root:not([data-theme="light"])')
const darkForced = block(':root[data-theme="dark"]')

const COLOURS = ['--ui-bg', '--ui-surface', '--ui-surface-sunk', '--ui-ink', '--ui-ink-muted', '--ui-primary', '--ui-on-primary',
  '--ui-primary-soft', '--ui-accent', '--ui-gold', '--ui-border', '--ui-danger', '--ui-success']

describe('ui tokens (Romantic Stationery)', () => {
  it('defines every colour in light and dark', () => {
    for (const name of COLOURS) {
      expect(light[name], `light ${name}`).toMatch(/^#[0-9a-f]{6}$/i)
      expect(darkAuto[name], `dark ${name}`).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('the automatic and the forced dark mode are the same palette', () => {
    expect(darkForced).toEqual(darkAuto)
  })

  for (const [mode, t] of [['light', light], ['dark', darkAuto]] as const) {
    it(`${mode}: text is comfortable to read`, () => {
      // body text 7:1 (the design system's own rule), secondary text and controls AA
      expect(contrast(t['--ui-ink'], t['--ui-bg'])).toBeGreaterThanOrEqual(7)
      expect(contrast(t['--ui-ink'], t['--ui-surface'])).toBeGreaterThanOrEqual(7)
      expect(contrast(t['--ui-ink-muted'], t['--ui-surface'])).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t['--ui-ink-muted'], t['--ui-bg'])).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t['--ui-on-primary'], t['--ui-primary'])).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t['--ui-primary'], t['--ui-surface'])).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t['--ui-danger'], t['--ui-surface'])).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t['--ui-success'], t['--ui-surface'])).toBeGreaterThanOrEqual(4.5)
      expect(contrast(t['--ui-ink'], t['--ui-primary-soft'])).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('loads the design fonts with the Turkish letters', () => {
    const fonts = readFileSync(fileURLToPath(new URL('./fonts.ts', import.meta.url)), 'utf8')
    for (const file of ['playfair-display/latin-ext-600.css', 'playfair-display/latin-ext-500-italic.css',
      'plus-jakarta-sans/latin-ext-400.css', 'plus-jakarta-sans/latin-ext-600.css']) {
      expect(fonts).toContain(`@fontsource/${file}`)
    }
  })
})
