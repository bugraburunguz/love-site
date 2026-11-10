import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { getTrash, restoreAlbum, restoreMedia, type TrashView } from '../api/trash'
import AppHeader from '../components/AppHeader'
import BottomTabs from '../components/BottomTabs'
import { Button, Card, Chip, EmptyState, Polaroid, useToast } from '../components/ui'
import { coverSource } from '../media/display'
import { memoryCount } from '../shelf/shelfText'
import { getTheme } from '../themes/registry'
import { purgeLabel } from '../trash/trashText'
import './home.css'

/**
 * /cop: what was deleted in the last 30 days. Everything here still counts against the storage until the nightly purge
 * removes it; "Geri al" puts it back (a photo of a deleted album comes back with its album).
 */
export default function TrashPage() {
  const toast = useToast()
  const [trash, setTrash] = useState<TrashView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(() => {
    getTrash().then(setTrash).catch((e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  async function restore(id: string, run: () => Promise<void>, done: string) {
    setBusy(id)
    try {
      await run()
      toast(done, 'success')
      load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Geri alınamadı', 'error')
    } finally {
      setBusy(null)
    }
  }

  const empty = trash && trash.albums.length === 0 && trash.media.length === 0

  return (
    <div className="ui home">
      <AppHeader />
      <main className="ui-container home__main">
        <header className="trash__head">
          <div>
            <div className="ui-eyebrow">Geri alma arşivi</div>
            <h1 className="home__shelf-title">Çöp kutusu</h1>
          </div>
          <p className="ui-muted">
            Sildiğin albüm ve fotoğraflar {trash?.retentionDays ?? 30} gün burada bekler, sonra kalıcı olarak silinir. O süre boyunca
            depolama alanında yer kaplamaya devam ederler.
          </p>
        </header>

        {error && <p role="alert" className="ui-field__error">{error}</p>}
        {trash === null && !error && <p className="ui-muted">Açılıyor…</p>}

        {empty && (
          <Card>
            <EmptyState art="✿" title="Çöp kutusu boş">Silinen bir şey olunca burada {trash.retentionDays} gün bekler.</EmptyState>
          </Card>
        )}

        {trash && trash.albums.length > 0 && (
          <section aria-labelledby="trash-albums">
            <div className="home__section-head">
              <h2 id="trash-albums" className="trash__title">Albümler</h2>
              <Chip static>{trash.albums.length}</Chip>
            </div>
            <ul className="trash__list">
              {trash.albums.map((t) => (
                <li key={t.album.id} className="trash-album" style={{ '--album-color': getTheme(t.album.themeId).cover.color } as CSSProperties}>
                  <span className="trash-album__spine" aria-hidden="true" />
                  <div className="trash-album__text">
                    <strong>{t.album.title}</strong>
                    <span className="ui-muted">{memoryCount(t.mediaCount)} · {purgeLabel(t.purgeAt)}</span>
                  </div>
                  <Button size="sm" variant="secondary" loading={busy === t.album.id}
                    onClick={() => void restore(t.album.id, () => restoreAlbum(t.album.id), `"${t.album.title}" rafına geri döndü`)}>
                    Geri al
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {trash && trash.media.length > 0 && (
          <section aria-labelledby="trash-media">
            <div className="home__section-head">
              <h2 id="trash-media" className="trash__title">Fotoğraf ve videolar</h2>
              <Chip static>{trash.media.length}</Chip>
            </div>
            <ul className="trash__grid">
              {trash.media.map((t) => {
                const src = coverSource(t.media)
                return (
                  <li key={t.media.id} className="trash-item">
                    {src ? (
                      <Polaroid src={src.src} alt={t.media.caption ?? t.media.originalFilename} caption={t.albumTitle ?? ''}
                        seed={t.media.id} tape="none" width="100%" />
                    ) : (
                      <div className="trash-item__blank" aria-hidden="true">{t.media.type === 'VIDEO' ? '▶' : '✿'}</div>
                    )}
                    <span className="trash-item__when">{purgeLabel(t.purgeAt)}</span>
                    <Button size="sm" variant="secondary" block loading={busy === t.media.id}
                      aria-label={`${t.media.caption || t.media.originalFilename} geri al`}
                      onClick={() => void restore(t.media.id, () => restoreMedia(t.media.id), 'Albümüne geri döndü')}>
                      Geri al
                    </Button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </main>
      <BottomTabs />
    </div>
  )
}
