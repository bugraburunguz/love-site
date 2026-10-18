import type { CoverSource } from '../media/display'
import { assetUrl } from '../themes/assets'
import type { ThemeDef } from '../themes/types'
import './leather.css'
import '../pages/shelf.css'

/**
 * The leather book of an album as the shelf shows it (also drawn, scaled up, as the cover image of exports). `eager`: load the
 * window picture right away (exports wait for every image before the screenshot).
 */
export default function CoverFace({ theme, title, createdAt, still, eager }: {
  theme: ThemeDef; title: string; createdAt: string; still: CoverSource | null; eager?: boolean
}) {
  const ornament = assetUrl(theme.id, theme.cover.ornament)
  return (
    <div className="album-cover__book">
      <div className="album-cover__pages" aria-hidden="true" />
      <div className="album-cover__face leather">
        {ornament && <img className="album-cover__ornament" src={ornament} alt="" draggable={false} />}
        <div className="album-cover__window">
          {still ? (
            still.kind === 'video' ? (
              <video src={`${still.src}#t=0.001`} muted playsInline preload="metadata" aria-hidden="true" />
            ) : (
              <img src={still.src} alt="" loading={eager ? 'eager' : 'lazy'} decoding="async" />
            )
          ) : (
            <span className="gold-foil">✦</span>
          )}
        </div>
        <h2 className="emboss album-cover__title">{title}</h2>
        <div className="gold-foil album-cover__year">
          {new Date(createdAt).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })}
        </div>
      </div>
    </div>
  )
}
