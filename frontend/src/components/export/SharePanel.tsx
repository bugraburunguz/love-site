import { useState } from 'react'
import type { Album, MediaDto } from '../../api/albums'
import type { ExportJob, ExportType } from '../../api/exports'
import type { PageDto } from '../../api/pages'
import { Button, Checkbox, Modal } from '../ui'
import ExportCard from './ExportCard'
import { MediaPicker, PagePicker } from './Pickers'
import './export.css'

type Mode = 'menu' | 'carousel' | 'reels' | 'stickers'

const TITLE: Record<Mode, string> = {
  menu: 'Paylaş',
  carousel: 'Instagram carousel',
  reels: 'Reels oluştur',
  stickers: 'WhatsApp sticker paketi',
}

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

function Option({ icon, title, text, disabled, onClick }: { icon: string; title: string; text: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="share-option" disabled={disabled} onClick={onClick}>
      <span className="share-option__icon" aria-hidden="true">{icon}</span>
      <span className="share-option__text">
        <strong>{title}</strong>
        <span>{text}</span>
      </span>
      <span className="share-option__go" aria-hidden="true">›</span>
    </button>
  )
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
    <Checkbox checked={watermark} onChange={(e) => setWatermark(e.target.checked)}>Köşede site adı (filigran)</Checkbox>
  )
  const stickerCount = selected.length
  const reelsSeconds = (cover ? 1.5 : 0) + selected.length * 2.5 + 2 - (selected.length + (cover ? 1 : 0)) * 0.5
  const back = <Button variant="secondary" onClick={() => setMode('menu')} disabled={busy}>Geri</Button>

  return (
    <Modal title={TITLE[mode]} eyebrow={mode === 'menu' ? album.title : 'Paylaş'} onClose={onClose} dismissable={!busy}>
      <div className="share-panel ui-form">
        {mode === 'menu' && (
          <>
            <div className="share-panel__options">
              <Option icon="▦" title="Instagram carousel" text="Sayfalar 1080×1350 görseller olur, kapakla birlikte"
                disabled={pages.length === 0} onClick={() => open('carousel')} />
              <Option icon="▶" title="Reels oluştur" text="Fotoğraflar ve kısa videolar dikey bir video olur"
                disabled={media.length === 0} onClick={() => open('reels')} />
              <Option icon="☺" title="WhatsApp sticker paketi" text="3–30 fotoğraftan şeffaf sticker'lar"
                disabled={media.length < 3} onClick={() => open('stickers')} />
            </div>
            <h3 className="share-panel__subtitle">Son 24 saat</h3>
            {jobs.length === 0 ? <p className="ui-muted ui-modal__text">Henüz dışa aktarma yok. Dosyalar 24 saat sonra silinir.</p> : (
              <div className="share-panel__list">{jobs.map((j) => <ExportCard key={j.id} job={j} compact />)}</div>
            )}
          </>
        )}

        {mode === 'carousel' && (
          <>
            <p className="ui-muted ui-modal__text">En fazla 20 sayfa seç ({selected.length}/20). Her sayfa 1080×1350 bir görsel olur; videolar kapak karesiyle görünür.</p>
            <PagePicker pages={pages} mediaById={mediaById} selected={selected} onChange={setSelected} max={20} />
            <Checkbox checked={cover} onChange={(e) => setCover(e.target.checked)}>Albüm kapağı ilk görsel olsun</Checkbox>
            {watermarkToggle}
            {error && <p role="alert" className="ui-field__error">{error}</p>}
            <div className="ui-modal__actions">
              {back}
              <Button loading={busy} disabled={selected.length === 0} onClick={() => submit('CAROUSEL', { albumId: album.id, pageIds: selected, includeCover: cover })}>Hazırla</Button>
            </div>
          </>
        )}

        {mode === 'reels' && (
          <>
            <p className="ui-muted ui-modal__text">En fazla 30 medya ({selected.length}/30, yaklaşık {Math.max(0, Math.round(reelsSeconds))} sn). Hareketli fotoğraflar videoda oynar.</p>
            <MediaPicker media={media} selected={selected} onChange={setSelected} max={30} />
            <Checkbox checked={cover} onChange={(e) => setCover(e.target.checked)}>Albüm kapağıyla başlasın</Checkbox>
            <Checkbox checked={music} disabled={!album.musicUrl} onChange={(e) => setMusic(e.target.checked)}>
              Albüm müziğini ekle{!album.musicUrl && ' (albümün müziği yok)'}
            </Checkbox>
            {music && (
              <p className="export-warning" role="note">
                Telifli müzik içeren videolar Instagram'da sessize alınabilir veya kaldırılabilir. Sessiz bırakıp müziği Instagram'da eklemek daha güvenli.
              </p>
            )}
            {watermarkToggle}
            {error && <p role="alert" className="ui-field__error">{error}</p>}
            <div className="ui-modal__actions">
              {back}
              <Button loading={busy} disabled={selected.length === 0} onClick={() => submit('REELS', { albumId: album.id, mediaIds: selected, includeCover: cover, includeAlbumMusic: music })}>Hazırla</Button>
            </div>
          </>
        )}

        {mode === 'stickers' && (
          <>
            <p className="ui-muted ui-modal__text">3–30 fotoğraf seç ({stickerCount}/30). Her biri 512×512 şeffaf bir sticker olur.</p>
            <MediaPicker media={media} selected={selected} onChange={setSelected} max={30} />
            <Checkbox checked={animated} onChange={(e) => setAnimated(e.target.checked)}>Hareketli fotoğraflar animasyonlu olsun</Checkbox>
            {watermarkToggle}
            {error && <p role="alert" className="ui-field__error">{error}</p>}
            <div className="ui-modal__actions">
              {back}
              <Button loading={busy} disabled={stickerCount < 3} onClick={() => submit('STICKER_PACK', { mediaIds: selected, animated })}>Hazırla</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
