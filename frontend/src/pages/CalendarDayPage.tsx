import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { deleteMedia, listAlbums, reprocessMedia, updateCaption, type Album, type MediaDto } from '../api/albums'
import { calendarDay, type DayView } from '../api/calendar'
import { longDate, occurrenceLabel, parseDay } from '../calendar/calendarMath'
import Clay from '../components/Clay'
import { ConfirmDialog } from '../components/Dialog'
import ErrorScreen from '../components/ErrorScreen'
import Lightbox from '../components/Lightbox'
import LivingPhoto from '../components/LivingPhoto'
import DateEditDialog from '../components/calendar/DateEditDialog'
import SpecialIcon from '../components/calendar/SpecialIcon'
import BottomTabs from '../components/BottomTabs'
import { pageThemeVars, pageVars, themeVars } from '../themes/cssVars'
import { getTheme } from '../themes/registry'
import { loadThemeFonts, ThemeContext } from '../themes/ThemeContext'
import type { ThemeDef } from '../themes/types'
import './calendar.css'

const FRAME = 220

/** One day of the calendar: every photo / video of that day (oldest first), the album it is in, the special days. */
export default function CalendarDayPage() {
  const { date = '' } = useParams()
  const [search] = useSearchParams()
  const albumId = search.get('album')
  const navigate = useNavigate()
  const [day, setDay] = useState<DayView | null>(null)
  const [albums, setAlbums] = useState<Album[]>([])
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number>(-1)
  const [editing, setEditing] = useState<MediaDto | null>(null)
  const [toDelete, setToDelete] = useState<MediaDto | null>(null)
  const [aspects, setAspects] = useState<Record<string, number>>({})
  const valid = parseDay(date) !== null

  const load = useCallback(() => {
    if (!valid) return
    calendarDay(date, albumId).then(setDay).catch((e: Error) => setError(e.message))
  }, [date, albumId, valid])
  useEffect(load, [load])
  useEffect(() => {
    listAlbums().then(setAlbums).catch(() => undefined)
  }, [])

  const albumTheme = useMemo(() => new Map(albums.map((a) => [a.id, getTheme(a.themeId)])), [albums])
  const themeOf = useCallback((mediaId: string): ThemeDef | undefined => {
    const m = day?.media.find((x) => x.media.id === mediaId)
    return m?.media.albumId ? albumTheme.get(m.media.albumId) : undefined
  }, [day, albumTheme])
  const filterTheme = getTheme(albums.find((a) => a.id === albumId)?.themeId)
  useEffect(() => {
    for (const t of new Set([filterTheme, ...albumTheme.values()])) void loadThemeFonts(t)
  }, [filterTheme, albumTheme])

  if (!valid) return <ErrorScreen kind="notfound" />

  const items = day?.media.map((m) => m.media) ?? []
  const back = `/takvim?ay=${date.slice(0, 7)}${albumId ? `&album=${albumId}` : ''}`
  const replace = (updated: MediaDto) => setDay((d) => d && { ...d, media: d.media.map((x) => (x.media.id === updated.id ? { ...x, media: updated } : x)) })
  const showInAlbum = (m: MediaDto) => m.albumId && navigate(`/albums/${m.albumId}?medya=${m.id}`)
  const time = (iso: string) => new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })

  return (
    <ThemeContext.Provider value={filterTheme}>
    <main className="calendar calendar--day" style={{ ...themeVars(filterTheme), ...pageVars(filterTheme, 'light', 'textured') } as CSSProperties}>
      <header className="calendar__header">
        <Link to={back} className="clay clay--pill clay--sm clay--cream">‹ Takvim</Link>
        <h1>{longDate(date)}</h1>
        <span />
      </header>

      {day?.specialDays.map((o) => (
        <p key={o.id} className="calendar__today-special"><SpecialIcon icon={o.icon} /> {occurrenceLabel(o.title, o.yearly, o.years)}</p>
      ))}
      {error && <p role="alert" className="calendar__error">{error}</p>}
      {day === null ? <p className="calendar__empty">Açılıyor…</p> : day.media.length === 0 ? (
        <p className="calendar__empty">Bu günde fotoğraf yok.</p>
      ) : (
        <ul className="calendar__day-list">
          {day.media.map(({ media, albumTitle }, i) => {
            const t = media.albumId ? albumTheme.get(media.albumId) : undefined
            return (
              <li key={media.id} className="calendar__day-item" style={t ? pageThemeVars(t) : undefined}>
                <LivingPhoto media={media} width={FRAME} aspect={aspects[media.id]} onOpen={() => setOpen(i)}
                  onAspect={(id, a) => setAspects((s) => (s[id] === a ? s : { ...s, [id]: a }))} />
                <div className="calendar__day-meta">
                  <span>{albumTitle ?? 'Albüm'} · {time(media.displayDate)}</span>
                  {media.dateUncertain && !media.dateOverridden && (
                    <button type="button" className="calendar__link calendar__link--warn" onClick={() => setEditing(media)}>
                      ? Tarih belirsiz — tarihi düzelt
                    </button>
                  )}
                  {media.albumId && <button type="button" className="calendar__link" onClick={() => showInAlbum(media)}>Albümde göster</button>}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {open >= 0 && open < items.length && (
        <Lightbox
          items={items}
          index={open}
          aspects={aspects}
          onIndex={setOpen}
          onClose={() => setOpen(-1)}
          onCaption={async (id, caption) => replace({ ...(await updateCaption(id, caption)) })}
          onDelete={setToDelete}
          onRetry={async (m) => replace(await reprocessMedia(m.id))}
          onAspect={(id, a) => setAspects((s) => (s[id] === a ? s : { ...s, [id]: a }))}
          themeOf={themeOf}
          menuExtra={(m, close) => (
            <>
              <Clay size="sm" tone="cream" role="menuitem" onClick={() => { close(); setEditing(m) }}>Tarihi düzelt</Clay>
              {m.albumId && <Clay size="sm" tone="cream" role="menuitem" onClick={() => { close(); showInAlbum(m) }}>Albümde göster</Clay>}
            </>
          )}
        />
      )}

      {editing && (
        <DateEditDialog media={editing} onClose={() => setEditing(null)} onSaved={() => { setOpen(-1); load() }} />
      )}
      {toDelete && (
        <ConfirmDialog
          title="Fotoğraf silinsin mi?"
          message={`"${toDelete.caption || toDelete.originalFilename}" albümden kalkacak ve 30 gün sonra kalıcı olarak silinir.`}
          confirmLabel="Sil"
          onClose={() => setToDelete(null)}
          onConfirm={async () => {
            await deleteMedia(toDelete.id)
            setOpen(-1)
            load()
          }}
        />
      )}
      <BottomTabs />
    </main>
    </ThemeContext.Provider>
  )
}
