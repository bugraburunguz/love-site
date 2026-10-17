import { THEME_LIST } from '../themes/registry'
import { assetUrl } from '../themes/assets'
import { pageVars, themeVars } from '../themes/cssVars'
import type { ThemeDef } from '../themes/types'
import { makeVariant } from '../themes/variant'
import '../themes/themes.css'

/** A small preview of a theme: cover colour and ornament, a page of its colour with a polaroid and one of its stickers. */
function ThemeCard({ theme, selected, onSelect }: { theme: ThemeDef; selected: boolean; onSelect: () => void }) {
  const sticker = theme.stickers.find((s) => s.id === theme.autoStickers[0]) ?? theme.stickers[0]
  const stickerUrl = assetUrl(theme.id, `stickers/${sticker.file}`)
  const ornament = assetUrl(theme.id, theme.cover.ornament)
  return (
    <button type="button" className="theme-card" aria-pressed={selected} onClick={onSelect} style={themeVars(theme)} data-variant={makeVariant(theme.id, sticker.id)}>
      <span className="theme-card__cover" style={{ background: theme.cover.color }}>
        {ornament && <img src={ornament} alt="" draggable={false} />}
      </span>
      <span className="theme-card__page" style={pageVars(theme)}>
        <span className="theme-card__photo" />
        {stickerUrl && <img className="theme-card__sticker" src={stickerUrl} alt="" draggable={false} />}
      </span>
      <span className="theme-card__name">{theme.name}</span>
    </button>
  )
}

interface Props {
  value: string
  onChange: (themeId: string) => void
}

/** The six themes as cards. Which themes exist is decided by the registry only. */
export default function ThemePicker({ value, onChange }: Props) {
  return (
    <div className="theme-grid" role="group" aria-label="Tema">
      {THEME_LIST.map((t) => (
        <ThemeCard key={t.id} theme={t} selected={t.id === value} onSelect={() => onChange(t.id)} />
      ))}
    </div>
  )
}
