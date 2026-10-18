import { useCallback, useEffect, useState, type MouseEvent } from 'react'
import { Link } from 'react-router-dom'
import SpacePanel from '../components/SpacePanel'
import { createAlbum, deleteAlbum, listAlbums, listMedia, renameAlbum, type Album } from '../api/albums'
import { useAuth } from '../auth/AuthContext'
import Clay from '../components/Clay'
import { ConfirmDialog, PromptDialog } from '../components/Dialog'
import NewAlbumDialog from '../components/NewAlbumDialog'
import CoverFace from '../components/CoverFace'
import { themeVars } from '../themes/cssVars'
import { getTheme } from '../themes/registry'
import { loadThemeFonts } from '../themes/ThemeContext'
import '../components/leather.css'
import { coverSource, type CoverSource } from '../media/display'
import './shelf.css'

type DialogState =
  | { kind: 'create' }
  | { kind: 'rename'; album: Album }
  | { kind: 'delete'; album: Album }
  | null

function AlbumCover({ album, onRename, onDelete }: { album: Album; onRename: () => void; onDelete: () => void }) {
  const [still, setStill] = useState<CoverSource | null>(null)
  const [menu, setMenu] = useState(false)
  const theme = getTheme(album.themeId)

  // the cover is lettered in the theme's own font, which loads only for themes that are on the shelf
  useEffect(() => {
    void loadThemeFonts(theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false
    listMedia(album.id)
      .then((items) => {
        if (cancelled) return
        for (const item of items) {
          const src = coverSource(item)
          if (src) {
            setStill(src)
            return
          }
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [album.id])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  const stop = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <article className="album-cover" style={themeVars(theme)}>
      <Link to={`/albums/${album.id}`} className="album-cover__link" aria-label={`${album.title} albümünü aç`}>
        <CoverFace theme={theme} title={album.title} createdAt={album.createdAt} still={still} />
      </Link>

      <div className="album-cover__menu" onPointerDown={(e) => e.stopPropagation()}>
        <Clay shape="round" size="sm" tone="cream" aria-label={`${album.title} seçenekleri`} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
          ⋯
        </Clay>
        {menu && (
          <div className="album-cover__dropdown">
            <Link to={`/albums/${album.id}?ayarlar=1`} className="clay clay--pill clay--sm clay--cream" onClick={() => setMenu(false)}>
              Tema ve müzik
            </Link>
            <Clay size="sm" tone="cream" onClick={(e) => { stop(e); setMenu(false); onRename() }}>
              Yeniden adlandır
            </Clay>
            <Clay size="sm" tone="rose" onClick={(e) => { stop(e); setMenu(false); onDelete() }}>
              Sil
            </Clay>
          </div>
        )}
      </div>
    </article>
  )
}

export default function AlbumsPage() {
  const { user, logout } = useAuth()
  const [albums, setAlbums] = useState<Album[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)

  const refresh = useCallback(() => {
    listAlbums()
      .then(setAlbums)
      .catch((e: Error) => setError(e.message))
  }, [])

  useEffect(refresh, [refresh])

  const close = useCallback(() => setDialog(null), [])

  return (
    <main className="shelf">
      <header className="shelf__header">
        <h1>Albümlerimiz</h1>
        <div className="shelf__user">
          <span>{user?.displayName}</span>
          {user?.admin && (
            <Link to="/admin" className="clay clay--pill clay--sm clay--cream">
              Yönetim
            </Link>
          )}
          <Clay size="sm" tone="cream" onClick={() => void logout()}>
            Çıkış
          </Clay>
        </div>
      </header>

      {error && <p role="alert" className="shelf__error">{error}</p>}

      <SpacePanel />

      {albums === null ? (
        <p className="shelf__loading">Raf hazırlanıyor…</p>
      ) : (
        <div className="shelf__grid">
          {albums.map((album) => (
            <AlbumCover
              key={album.id}
              album={album}
              onRename={() => setDialog({ kind: 'rename', album })}
              onDelete={() => setDialog({ kind: 'delete', album })}
            />
          ))}

          <button type="button" className="new-album" onClick={() => setDialog({ kind: 'create' })}>
            <svg viewBox="0 0 120 150" aria-hidden="true">
              <rect x="14" y="10" width="92" height="130" rx="6" fill="#f3e6c9" stroke="#b89868" strokeWidth="3" strokeDasharray="7 6" />
              <path d="M30 30h60M30 46h60M30 62h40" stroke="#d7c294" strokeWidth="3" strokeLinecap="round" />
              <g transform="translate(60 96) rotate(40)">
                <rect x="-6" y="-44" width="12" height="62" rx="3" fill="#c07a89" stroke="#7a3f4d" strokeWidth="2" />
                <path d="M-6 18 L0 32 L6 18 Z" fill="#f1d3a2" stroke="#7a3f4d" strokeWidth="2" strokeLinejoin="round" />
                <rect x="-6" y="-44" width="12" height="9" rx="3" fill="#e6cb8e" />
              </g>
            </svg>
            <span>Yeni albüm</span>
          </button>
        </div>
      )}

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
        <PromptDialog
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
        <ConfirmDialog
          title="Albüm silinsin mi?"
          message={`"${dialog.album.title}" albümü raftan kalkacak. İçindekilerle birlikte 30 gün sonra kalıcı olarak silinir.`}
          confirmLabel="Sil"
          onClose={close}
          onConfirm={async () => {
            try {
              await deleteAlbum(dialog.album.id)
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Silinemedi')
            }
            refresh()
          }}
        />
      )}
    </main>
  )
}
