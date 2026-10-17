import { assetUrl } from '../../themes/assets'
import { findSticker } from '../../themes/registry'
import { useTheme } from '../../themes/ThemeContext'
import { Sticker, Tape } from './Ornaments'
import './ornaments.css'

/** A sticker of any theme ("themeId:stickerId"). An unknown theme or sticker draws nothing instead of failing. */
export function ThemeSticker({ variant }: { variant?: string }) {
  const found = findSticker(variant)
  const url = found ? assetUrl(found.theme.id, `stickers/${found.sticker.file}`) : undefined
  if (url) return <img className="sticker sticker--img" src={url} alt="" draggable={false} />
  // the three original generic stickers (pages made before themes existed)
  if (variant === 'heart' || variant === 'star' || variant === 'sparkle') return <Sticker variant={variant} />
  return null
}

/** A tape-like strip: a fastener file of the album's theme, or one of the original generic tapes. */
export function ThemeTape({ variant }: { variant?: string }) {
  const theme = useTheme()
  const file = variant ? `${variant}.svg` : undefined
  const url = file && theme.fasteners.includes(file) ? assetUrl(theme.id, file) : undefined
  if (url) return <img className="tape tape--img" src={url} alt="" draggable={false} />
  return <Tape variant={variant} />
}
