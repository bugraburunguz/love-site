import { useState } from 'react'
import type { PageDto } from '../../api/pages'
import { assetUrl, cssUrl } from '../../themes/assets'
import { swatchSlot, paperSlot } from '../../themes/cssVars'
import { resolvePageTheme, type ThemeScope } from '../../themes/pageTheme'
import { useTheme } from '../../themes/ThemeContext'
import { THEME_LIST } from '../../themes/registry'
import { PAPER_SLOTS, SWATCH_SLOTS, type ThemeDef } from '../../themes/types'
import { makeVariant } from '../../themes/variant'
import Clay from '../Clay'
import '../../themes/themes.css'
import '../book/edit.css'

const SWATCH_LABEL = { light: 'Açık', soft: 'Yumuşak', accent: 'Vurgu', deep: 'Derin', dark: 'Koyu' } as const
const PAPER_LABEL = { plain: 'Düz', lined: 'Çizgili', textured: 'Dokulu', special: 'Özel' } as const

interface Props {
  page: PageDto
  /** one page at a time on screen (phone): the "spread" scope is then worded as "this and the facing page" */
  single: boolean
  onLook: (look: { swatch?: string; paper?: string }) => void
  /** themeId null = back to the album's theme */
  onTheme: (themeId: string | null, scope: ThemeScope) => void
  onSticker: (variant: string) => void
  onClose: () => void
}

/** A tiny page of a theme: its light paper, a polaroid frame in its frame colours, a tape in its first fastener. */
function ThemeSample({ theme }: { theme: ThemeDef }) {
  const sw = theme.swatches[swatchSlot(null)]
  const tape = theme.fasteners[0] ? assetUrl(theme.id, theme.fasteners[0]) : undefined
  return (
    <span className="theme-sample" style={{ backgroundColor: sw.bg, backgroundImage: cssUrl(theme.id, theme.papers.plain) }} aria-hidden="true">
      <span className="theme-sample__frame" style={{ background: theme.frameSkin.paper, boxShadow: `inset 0 0 0 1px ${theme.frameSkin.edge}` }}>
        <span className="theme-sample__photo" />
      </span>
      {tape && <img className="theme-sample__tape" src={tape} alt="" draggable={false} />}
    </span>
  )
}

/** Theme, colour and paper of the current page, and the sticker drawer (this page's theme first, then the album's, then the rest). */
export default function PagePanel({ page, single, onLook, onTheme, onSticker, onClose }: Props) {
  const albumTheme = useTheme()
  const theme = resolvePageTheme(page.themeId, albumTheme)
  const [tab, setTab] = useState<'theme' | 'look' | 'stickers'>('look')
  const [scope, setScope] = useState<ThemeScope>('spread')
  const themes = [theme, ...(albumTheme.id !== theme.id ? [albumTheme] : []), ...THEME_LIST.filter((t) => t.id !== theme.id && t.id !== albumTheme.id)]
  const [shown, setShown] = useState(theme.id)
  const current = themes.find((t) => t.id === shown) ?? theme
  const swatch = page.swatch ? swatchSlot(page.swatch) : null
  const paper = page.paper ? paperSlot(page.paper) : null
  const bg = theme.swatches[swatch ?? 'light'].bg
  const scopes: { id: ThemeScope; label: string }[] = [
    { id: 'spread', label: single ? 'Bu ve karşı sayfa' : 'Bu yayına uygula' },
    { id: 'page', label: 'Sadece bu sayfa' },
    { id: 'rest', label: 'Bu sayfa ve sonrakiler' },
  ]

  return (
    <aside className="tray" aria-label="Sayfa görünümü">
      <div className="tray__head">
        <strong>Sayfa {page.pageIndex + 1}</strong>
        <Clay size="sm" tone="cream" onClick={onClose}>Kapat</Clay>
      </div>
      <div className="page-bar__templates" role="tablist">
        <Clay size="sm" tone={tab === 'look' ? 'rose' : 'cream'} aria-pressed={tab === 'look'} onClick={() => setTab('look')}>Renk ve doku</Clay>
        <Clay size="sm" tone={tab === 'theme' ? 'rose' : 'cream'} aria-pressed={tab === 'theme'} onClick={() => setTab('theme')}>Sayfa teması</Clay>
        <Clay size="sm" tone={tab === 'stickers' ? 'rose' : 'cream'} aria-pressed={tab === 'stickers'} onClick={() => setTab('stickers')}>Çıkartmalar</Clay>
      </div>

      {tab === 'theme' && (
        <div className="page-theme">
          <fieldset className="page-theme__scope">
            <legend className="item-bar__label">Nereye uygulansın?</legend>
            {scopes.map((s) => (
              <label key={s.id}>
                <input type="radio" name="theme-scope" value={s.id} checked={scope === s.id} onChange={() => setScope(s.id)} />
                {s.label}
              </label>
            ))}
          </fieldset>
          <div className="page-theme__grid">
            <button type="button" className="page-theme__option" aria-pressed={page.themeId === null} onClick={() => onTheme(null, scope)}>
              <ThemeSample theme={albumTheme} />
              <span>Albüm teması</span>
            </button>
            {THEME_LIST.map((t) => (
              <button key={t.id} type="button" className="page-theme__option" aria-pressed={page.themeId === t.id} onClick={() => onTheme(t.id, scope)}>
                <ThemeSample theme={t} />
                <span>{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === 'look' && (
        <div>
          <span className="item-bar__label">Sayfa rengi</span>
          <div className="look-swatches">
            {SWATCH_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                className="look-swatch"
                style={{ background: theme.swatches[slot].bg, color: theme.swatches[slot].ink }}
                aria-pressed={swatch === slot}
                aria-label={SWATCH_LABEL[slot]}
                title={SWATCH_LABEL[slot]}
                onClick={() => onLook({ swatch: slot })}
              >
                Aa
              </button>
            ))}
          </div>
          <span className="item-bar__label">Kağıt dokusu</span>
          <div className="look-papers">
            {PAPER_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                className="look-paper"
                style={{ backgroundColor: bg, backgroundImage: cssUrl(theme.id, theme.papers[slot]) }}
                aria-pressed={paper === slot}
                aria-label={PAPER_LABEL[slot]}
                title={PAPER_LABEL[slot]}
                onClick={() => onLook({ paper: slot })}
              />
            ))}
          </div>
          <Clay size="sm" tone="cream" disabled={!swatch && !paper} onClick={() => onLook({ swatch: 'DEFAULT', paper: 'DEFAULT' })}>
            Tema varsayılanı
          </Clay>
        </div>
      )}

      {tab === 'stickers' && (
        <>
          <div className="sticker-tabs">
            {themes.map((t) => (
              <Clay key={t.id} size="sm" tone={t.id === shown ? 'rose' : 'cream'} aria-pressed={t.id === shown} onClick={() => setShown(t.id)}>
                {t.name}
              </Clay>
            ))}
          </div>
          <div className="sticker-grid">
            {current.stickers.map((s) => {
              const url = assetUrl(current.id, `stickers/${s.file}`)
              return (
                <button key={s.id} type="button" aria-label={s.name} title={s.name} onClick={() => onSticker(makeVariant(current.id, s.id))}>
                  {url && <img src={url} alt="" draggable={false} />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </aside>
  )
}
