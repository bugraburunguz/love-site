import { Link } from 'react-router-dom'
import { useTheme, useThemeFonts } from '../themes/ThemeContext'
import { ThemeSticker } from './ornaments/ThemeOrnaments'
import { uiButtonClass } from './ui/Button'
import './errorscreen.css'

export type ErrorKind = 'notfound' | 'error'

const TEXT: Record<ErrorKind, { eyebrow: string; title: string; body: string }> = {
  notfound: {
    eyebrow: 'Bu sayfa defterden kopmuş',
    title: 'Bu sayfa bulunamadı',
    body: 'Aradığınız sayfa taşınmış, silinmiş ya da hiç var olmamış olabilir.',
  },
  error: {
    eyebrow: 'Bir sayfa yırtıldı',
    title: 'Bir şeyler ters gitti',
    body: 'Beklenmedik bir hata oluştu. Sayfayı yenilemeyi deneyin; sorun sürerse biraz sonra tekrar bakın.',
  },
}

/**
 * Turkish "not found" / "something went wrong" page: a torn-out notebook page with one of the current theme's stickers
 * (the album's theme inside an album, the default elsewhere). Only text, CSS and one image, so it still renders when
 * everything else is broken (ErrorBoundary shows it too).
 */
export default function ErrorScreen({ kind }: { kind: ErrorKind }) {
  const theme = useTheme()
  useThemeFonts(theme)
  const text = TEXT[kind]
  const sticker = theme.stickers[kind === 'notfound' ? 0 : Math.min(1, theme.stickers.length - 1)]
  return (
    <main className="ui error-screen" data-error-kind={kind}>
      <section className="error-screen__page" role={kind === 'error' ? 'alert' : undefined}>
        {sticker && (
          <div className="error-screen__sticker" aria-hidden="true">
            <ThemeSticker variant={`${theme.id}:${sticker.id}`} />
          </div>
        )}
        <p className="error-screen__code">{kind === 'notfound' ? '404' : 'Hata'}</p>
        <div className="ui-eyebrow">{text.eyebrow}</div>
        <h1>{text.title}</h1>
        <p className="error-screen__body">{text.body}</p>
        <div className="error-screen__actions">
          <Link to="/" className={uiButtonClass('primary')}>Rafa dön</Link>
          {kind === 'error' && (
            <button type="button" className={uiButtonClass('secondary')} onClick={() => window.location.reload()}>
              Sayfayı yenile
            </button>
          )}
        </div>
      </section>
    </main>
  )
}
