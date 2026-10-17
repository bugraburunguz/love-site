import { useState } from 'react'
import type { PageDto } from '../../api/pages'
import { assetUrl, cssUrl } from '../../themes/assets'
import { swatchSlot, paperSlot } from '../../themes/cssVars'
import { useTheme } from '../../themes/ThemeContext'
import { THEME_LIST } from '../../themes/registry'
import { PAPER_SLOTS, SWATCH_SLOTS } from '../../themes/types'
import { makeVariant } from '../../themes/variant'
import Clay from '../Clay'
import '../../themes/themes.css'
import '../book/edit.css'

const SWATCH_LABEL = { light: 'Açık', soft: 'Yumuşak', accent: 'Vurgu', deep: 'Derin', dark: 'Koyu' } as const
const PAPER_LABEL = { plain: 'Düz', lined: 'Çizgili', textured: 'Dokulu', special: 'Özel' } as const

interface Props {
  page: PageDto
  onLook: (look: { swatch?: string; paper?: string }) => void
  onSticker: (variant: string) => void
  onClose: () => void
}

/** Colour and paper of the current page, and the sticker drawer (the album's theme first, then the other themes). */
export default function PagePanel({ page, onLook, onSticker, onClose }: Props) {
  const theme = useTheme()
  const [tab, setTab] = useState<'look' | 'stickers'>('look')
  const themes = [theme, ...THEME_LIST.filter((t) => t.id !== theme.id)]
  const [shown, setShown] = useState(theme.id)
  const current = themes.find((t) => t.id === shown) ?? theme
  const swatch = page.swatch ? swatchSlot(page.swatch) : null
  const paper = page.paper ? paperSlot(page.paper) : null
  const bg = theme.swatches[swatch ?? 'light'].bg

  return (
    <aside className="tray" aria-label="Sayfa görünümü">
      <div className="tray__head">
        <strong>Sayfa {page.pageIndex + 1}</strong>
        <Clay size="sm" tone="cream" onClick={onClose}>Kapat</Clay>
      </div>
      <div className="page-bar__templates" role="tablist">
        <Clay size="sm" tone={tab === 'look' ? 'rose' : 'cream'} aria-pressed={tab === 'look'} onClick={() => setTab('look')}>Renk ve doku</Clay>
        <Clay size="sm" tone={tab === 'stickers' ? 'rose' : 'cream'} aria-pressed={tab === 'stickers'} onClick={() => setTab('stickers')}>Çıkartmalar</Clay>
      </div>

      {tab === 'look' ? (
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
      ) : (
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
