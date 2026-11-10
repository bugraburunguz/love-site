import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { createAlbum, deleteAlbum, formatBytes, getSpace, listAlbums, listMedia, renameAlbum, type Album, type SpaceInfo } from '../api/albums'
import { onThisDay, type OnThisDay } from '../api/calendar'
import { yearsAgoLabel } from '../calendar/calendarMath'
import AppHeader from '../components/AppHeader'
import BottomTabs from '../components/BottomTabs'
import NewAlbumDialog from '../components/NewAlbumDialog'
import { Button, Card, Chip, ConfirmModal, EmptyState, Meter, Polaroid, PromptModal, uiButtonClass } from '../components/ui'
import { coverSource, type CoverSource } from '../media/display'
import { albumSpan, memoryCount } from '../shelf/shelfText'
import { assetUrl } from '../themes/assets'
import { getTheme } from '../themes/registry'
import './home.css'

type DialogState = { kind: 'create' } | { kind: 'rename'; album: Album } | { kind: 'delete'; album: Album } | null

interface AlbumFacts {
  count: number
  dates: string[]
  still: CoverSource | null
}

function useAlbumFacts(albumId: string): AlbumFacts | null {
  const [facts, setFacts] = useState<AlbumFacts | null>(null)
  useEffect(() => {
    let alive = true
    listMedia(albumId)
      .then((items) => {
        if (!alive) return
        const still = items.map(coverSource).find((s): s is CoverSource => s !== null) ?? null
        setFacts({ count: items.length, dates: items.map((m) => m.displayDate), still })
      })
      .catch(() => alive && setFacts({ count: 0, dates: [], still: null }))
    return () => {
      alive = false
    }
  }, [albumId])
  return facts
}

/** A disclosure (button + list of actions): Tab moves through the actions, Escape closes and returns to the button. */
function AlbumMenu({ album, onRename, onDelete }: { album: Album; onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return
    list.current?.querySelector<HTMLElement>('a, button')?.focus()
    const close = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="album-card__menu" onPointerDown={(e) => e.stopPropagation()}>
      <button
        ref={button}
        type="button"
        className="album-card__menu-btn"
        aria-label={`${album.title} seçenekleri`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        ⋯
      </button>
      {open && (
        <div className="album-card__dropdown" id={listId} ref={list}>
          <Link to={`/albums/${album.id}?ayarlar=1`} onClick={() => setOpen(false)}>Tema ve müzik</Link>
          <button type="button" onClick={() => { setOpen(false); onRename() }}>Yeniden adlandır</button>
          <button type="button" className="album-card__danger" onClick={() => { setOpen(false); onDelete() }}>Sil</button>
        </div>
      )}
    </div>
  )
}

function AlbumCard({ album, onRename, onDelete }: { album: Album; onRename: () => void; onDelete: () => void }) {
  const theme = getTheme(album.themeId)
  const facts = useAlbumFacts(album.id)
  const ornament = assetUrl(theme.id, theme.cover.ornament)
  const style = { '--album-color': theme.cover.color } as CSSProperties
  return (
    <article className="album-card" style={style}>
      <span className="album-card__ribbon" aria-hidden="true" />
      <div className="album-card__top">
        <Chip static active>{theme.name}</Chip>
        <span className="album-card__count">{facts ? memoryCount(facts.count) : '…'}</span>
      </div>
      <Link to={`/albums/${album.id}`} className="album-card__link" aria-label={`${album.title} albümünü aç`}>
        <div className="album-card__photo">
          {facts?.still ? (
            <Polaroid src={facts.still.src} alt="" seed={album.id} tape="rose" width="100%" />
          ) : (
            <div className="album-card__blank" aria-hidden="true">
              {ornament ? <img src={ornament} alt="" draggable={false} /> : <span>❦</span>}
            </div>
          )}
        </div>
        <h3 className="album-card__title">{album.title}</h3>
        <p className="album-card__span">{facts ? albumSpan(facts.dates, album.createdAt) : ' '}</p>
      </Link>
      <AlbumMenu album={album} onRename={onRename} onDelete={onDelete} />
    </article>
  )
}

/** "Bugün, 2 yıl önce…": photos taken on this calendar day in earlier years. Hidden when there are none. */
function OnThisDayStrip() {
  const [data, setData] = useState<OnThisDay | null>(null)
  useEffect(() => {
    onThisDay().then(setData).catch(() => undefined)
  }, [])
  const days = data?.past.filter((p) => p.media.length > 0) ?? []
  if (days.length === 0) return null
  const first = days[0]
  const prints = days.flatMap((d) => d.media.map((m) => ({ day: d, item: m }))).slice(0, 4)
  return (
    <section className="home__past" aria-labelledby="past-title">
      <div className="home__section-head">
        <h2 id="past-title" className="home__past-title">
          <span aria-hidden="true">◷</span> Bugün, {yearsAgoLabel(first.yearsAgo).toLocaleLowerCase('tr-TR')}…
        </h2>
        {/* a plain YYYY-MM-DD is parsed as UTC: format it in UTC too, or a phone abroad shows the day before */}
        <Chip static>{new Date(first.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}</Chip>
      </div>
      <div className="home__past-row">
        {prints.map(({ day, item }) => {
          const src = coverSource(item.media)
          if (!src) return null
          return (
            <Link key={item.media.id} to={`/takvim/gun/${day.date}`} className="home__past-print">
              <Polaroid src={src.src} alt={item.media.caption ?? ''} caption={item.media.caption ?? item.albumTitle ?? ''} seed={item.media.id} tape={item.media.id.charCodeAt(0) % 2 ? 'rose' : 'kraft'} width="100%" />
            </Link>
          )
        })}
      </div>
    </section>
  )
}

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[] | null>(null)
  const [space, setSpace] = useState<SpaceInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)

  const refresh = useCallback(() => {
    listAlbums()
      .then(setAlbums)
      .catch((e: Error) => setError(e.message))
    getSpace().then(setSpace).catch(() => undefined)
  }, [])

  useEffect(refresh, [refresh])

  const close = useCallback(() => setDialog(null), [])
  const create = () => setDialog({ kind: 'create' })

  return (
    <div className="ui home">
      <AppHeader />
      <main className="ui-container home__main">
        <h1 className="sr-only">Raf</h1>
        {error && <p role="alert" className="ui-field__error">{error}</p>}

        <OnThisDayStrip />

        <section className="home__shelf" aria-labelledby="shelf-title">
          <div className="home__section-head">
            <h2 id="shelf-title" className="home__shelf-title">Kitaplığımız</h2>
            {albums && albums.length > 0 && <Chip static>{albums.length} cilt</Chip>}
            <span className="home__spacer" />
            <Button size="sm" variant="secondary" onClick={create} icon={<span aria-hidden="true">+</span>}>Yeni albüm</Button>
          </div>

          {albums === null ? (
            <p className="ui-muted">Raf hazırlanıyor…</p>
          ) : albums.length === 0 ? (
            <Card className="home__empty">
              <EmptyState
                art="❦"
                title="Rafın henüz boş"
                action={<Button onClick={create}>İlk albümü oluştur</Button>}
              >
                İlk albümünüzü açın; boş sayfaları fotoğraflar ve notlarla birlikte doldurun.
              </EmptyState>
            </Card>
          ) : (
            <div className="home__grid">
              {albums.map((album) => (
                <AlbumCard
                  key={album.id}
                  album={album}
                  onRename={() => setDialog({ kind: 'rename', album })}
                  onDelete={() => setDialog({ kind: 'delete', album })}
                />
              ))}
              <button type="button" className="album-new" onClick={create}>
                <span className="album-new__plus" aria-hidden="true">+</span>
                <span className="album-new__title">Yeni albüm oluştur</span>
                <span className="ui-muted">Boş sayfaları fotoğraflar ve notlarla doldurmaya başla.</span>
              </button>
            </div>
          )}
        </section>

        {space && (
          <Card sunk className="home__storage">
            <Meter label="Anı sandığı" used={space.usedBytes} limit={space.limitBytes} format={formatBytes} />
            <div className="home__storage-links">
              {space.kind === 'FREE' && <span className="ui-muted">Ücretsiz defter · kısa videolar</span>}
              <Link to="/profil" className={uiButtonClass('ghost', 'sm')}>Defter ayarları</Link>
            </div>
          </Card>
        )}
      </main>

      {dialog?.kind === 'create' && (
        <NewAlbumDialog
          onClose={close}
          onSubmit={async (title, themeId) => {
            await createAlbum(title, themeId)
            refresh()
          }}
        />
      )}
      {dialog?.kind === 'rename' && (
        <PromptModal
          title="Yeniden adlandır"
          label="Albümün yeni adı"
          initial={dialog.album.title}
          confirmLabel="Kaydet"
          onClose={close}
          onSubmit={async (title) => {
            await renameAlbum(dialog.album.id, title)
            refresh()
          }}
        />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmModal
          title="Albüm silinsin mi?"
          message={`"${dialog.album.title}" albümü raftan kalkacak. İçindekilerle birlikte 30 gün sonra kalıcı olarak silinir.`}
          confirmLabel="Sil"
          danger
          onClose={close}
          onConfirm={async () => {
            // a failure stays in the dialog (ConfirmModal shows it); success closes it
            await deleteAlbum(dialog.album.id)
            refresh()
          }}
        />
      )}
      <BottomTabs />
    </div>
  )
}
