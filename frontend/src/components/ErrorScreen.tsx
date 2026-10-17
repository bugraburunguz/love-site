import { Link } from 'react-router-dom'
import { pageVars, themeVars } from '../themes/cssVars'
import { useTheme, useThemeFonts } from '../themes/ThemeContext'
import { ThemeSticker } from './ornaments/ThemeOrnaments'
import Clay from './Clay'
import './errorscreen.css'

export type ErrorKind = 'notfound' | 'error'

const TEXT: Record<ErrorKind, { title: string; body: string }> = {
  notfound: {
    title: 'Bu sayfa bulunamadı',
    body: 'Aradığınız sayfa taşınmış, silinmiş ya da hiç var olmamış olabilir.',
  },
  error: {
    title: 'Bir şeyler ters gitti',
    body: 'Beklenmedik bir hata oluştu. Sayfayı yenilemeyi deneyin; sorun sürerse biraz sonra tekrar bakın.',
  },
}

/**
 * Turkish "not found" / "something went wrong" page in the look of the current theme (the album's theme inside an
 * album, the default theme elsewhere). It is only text and one of the theme's own stickers, so it still renders when
 * everything else is broken.
 */
export default function ErrorScreen({ kind }: { kind: ErrorKind }) {
  const theme = useTheme()
  useThemeFonts(theme)
  const text = TEXT[kind]
  const sticker = theme.stickers[kind === 'notfound' ? 0 : Math.min(1, theme.stickers.length - 1)]
  return (
    <main className="error-screen" style={{ ...themeVars(theme), ...pageVars(theme, 'soft', 'plain') }} data-error-kind={kind}>
      <section className="error-screen__card" role={kind === 'error' ? 'alert' : undefined}>
        {sticker && (
          <div className="error-screen__sticker" aria-hidden="true">
            <ThemeSticker variant={`${theme.id}:${sticker.id}`} />
          </div>
        )}
        <p className="error-screen__code">{kind === 'notfound' ? '404' : 'Hata'}</p>
        <h1>{text.title}</h1>
        <p>{text.body}</p>
        <div className="error-screen__actions">
          <Link to="/" className="clay clay--pill clay--cream">
            Albümlere dön
          </Link>
          {kind === 'error' && (
            <Clay tone="rose" onClick={() => window.location.reload()}>
              Sayfayı yenile
            </Clay>
          )}
        </div>
      </section>
    </main>
  )
}
