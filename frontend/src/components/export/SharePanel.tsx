import { useState } from 'react'
import type { Album, MediaDto } from '../../api/albums'
import type { ExportJob, ExportType } from '../../api/exports'
import type { PageDto } from '../../api/pages'
import Clay from '../Clay'
import { Frame } from '../Dialog'
import ExportCard from './ExportCard'
import { MediaPicker, PagePicker } from './Pickers'
import './export.css'

type Mode = 'menu' | 'carousel' | 'reels' | 'stickers'

interface Props {
  album: Album
  pages: PageDto[]
  /** READY media in page order (only those can be exported) */
  media: MediaDto[]
  mediaById: ReadonlyMap<string, MediaDto>
  jobs: ExportJob[]
  onStart: (type: ExportType, params: Record<string, unknown>) => Promise<unknown>
  onClose: () => void
}

/** The album's "Paylaş" menu: Instagram carousel, a Reels video, a WhatsApp sticker pack, and the exports of the last 24 h. */
export default function SharePanel({ album, pages, media, mediaById, jobs, onStart, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('menu')
  const [selected, setSelected] = useState<string[]>([])
  const [cover, setCover] = useState(true)
  const [music, setMusic] = useState(false)
  const [animated, setAnimated] = useState(false)
  const [watermark, setWatermark] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function open(next: Mode) {
    setMode(next)
    setError(null)
    if (next === 'carousel') setSelected(pages.slice(0, Math.min(10, pages.length)).map((p) => p.id))
    if (next === 'reels') setSelected(media.slice(0, Math.min(10, media.length)).map((m) => m.id))
    if (next === 'stickers') setSelected(media.slice(0, Math.min(6, media.length)).map((m) => m.id))
    setCover(next !== 'carousel')
  }

  async function submit(type: ExportType, params: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      await onStart(type, { ...params, watermark })
      setMode('menu')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Başlatılamadı')
    } finally {
      setBusy(false)
    }
  }

  const watermarkToggle = (
    <label className="export-option">
      <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} />
      Köşede site adı (filigran)
    </label>
  )
  const stickerCount = selected.length
  const reelsSeconds = (cover ? 1.5 : 0) + selected.length * 2.5 + 2 - (selected.length + (cover ? 1 : 0)) * 0.5

  return (
    <Frame title={mode === 'menu' ? 'Paylaş' : mode === 'carousel' ? 'Instagram carousel' : mode === 'reels' ? 'Reels oluştur' : 'WhatsApp sticker paketi'} onClose={onClose}>
      <div className="share-panel">
        {mode === 'menu' && (
          <>
            <div className="share-panel__options">
              <Clay onClick={() => open('carousel')} disabled={pages.length === 0}>Instagram carousel</Clay>
              <Clay onClick={() => open('reels')} disabled={media.length === 0}>Reels oluştur</Clay>
              <Clay onClick={() => open('stickers')} disabled={media.length < 3}>WhatsApp sticker paketi</Clay>
            </div>
            <h3 className="share-panel__subtitle">Son 24 saat</h3>
            {jobs.length === 0 ? <p className="dialog__message">Henüz dışa aktarma yok. Dosyalar 24 saat sonra silinir.</p> : (
              <div className="share-panel__list">{jobs.map((j) => <ExportCard key={j.id} job={j} compact />)}</div>
            )}
            <div className="dialog__actions"><Clay tone="cream" onClick={onClose}>Kapat</Clay></div>
          </>
        )}

        {mode === 'carousel' && (
          <>
            <p className="dialog__message">En fazla 20 sayfa seç ({selected.length}/20). Her sayfa 1080×1350 bir görsel olur; videolar kapak karesiyle görünür.</p>
            <PagePicker pages={pages} mediaById={mediaById} selected={selected} onChange={setSelected} max={20} />
            <label className="export-option"><input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} />Albüm kapağı ilk görsel olsun</label>
            {watermarkToggle}
            {error && <p role="alert" className="dialog__error">{error}</p>}
            <div className="dialog__actions">
              <Clay tone="cream" onClick={() => setMode('menu')}>Geri</Clay>
              <Clay disabled={busy || selected.length === 0} onClick={() => submit('CAROUSEL', { albumId: album.id, pageIds: selected, includeCover: cover })}>Hazırla</Clay>
            </div>
          </>
        )}

        {mode === 'reels' && (
          <>
            <p className="dialog__message">En fazla 30 medya ({selected.length}/30, yaklaşık {Math.max(0, Math.round(reelsSeconds))} sn). Hareketli fotoğraflar videoda oynar.</p>
            <MediaPicker media={media} selected={selected} onChange={setSelected} max={30} />
            <label className="export-option"><input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} />Albüm kapağıyla başlasın</label>
            <label className="export-option">
              <input type="checkbox" checked={music} disabled={!album.musicUrl} onChange={(e) => setMusic(e.target.checked)} />
              Albüm müziğini ekle{!album.musicUrl && ' (albümün müziği yok)'}
            </label>
            {music && (
              <p className="export-warning" role="note">
                Telifli müzik içeren videolar Instagram'da sessize alınabilir veya kaldırılabilir. Sessiz bırakıp müziği Instagram'da eklemek daha güvenli.
              </p>
            )}
            {watermarkToggle}
            {error && <p role="alert" className="dialog__error">{error}</p>}
            <div className="dialog__actions">
              <Clay tone="cream" onClick={() => setMode('menu')}>Geri</Clay>
              <Clay disabled={busy || selected.length === 0} onClick={() => submit('REELS', { albumId: album.id, mediaIds: selected, includeCover: cover, includeAlbumMusic: music })}>Hazırla</Clay>
            </div>
          </>
        )}

        {mode === 'stickers' && (
          <>
            <p className="dialog__message">3–30 fotoğraf seç ({stickerCount}/30). Her biri 512×512 şeffaf bir sticker olur.</p>
            <MediaPicker media={media} selected={selected} onChange={setSelected} max={30} />
            <label className="export-option">
              <input type="checkbox" checked={animated} onChange={(e) => setAnimated(e.target.checked)} />
              Hareketli fotoğraflar animasyonlu olsun
            </label>
            {watermarkToggle}
            {error && <p role="alert" className="dialog__error">{error}</p>}
            <div className="dialog__actions">
              <Clay tone="cream" onClick={() => setMode('menu')}>Geri</Clay>
              <Clay disabled={busy || stickerCount < 3} onClick={() => submit('STICKER_PACK', { mediaIds: selected, animated })}>Hazırla</Clay>
            </div>
          </>
        )}
      </div>
    </Frame>
  )
}
