import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listAlbums, type Album } from '../api/albums'
import {
  calendarMonth, calendarMonths, calendarYear, onThisDay, type MonthView, type OnThisDay, type Occurrence, type YearView,
} from '../api/calendar'
import {
  MONTHS, WEEKDAYS, addMonths, dayKey, intensity, monthGrid, monthKey, nearestMonth, occurrenceLabel, parseMonth, todayKey, yearsAgoLabel,
} from '../calendar/calendarMath'
import Clay from '../components/Clay'
import SpecialDaysDialog from '../components/calendar/SpecialDaysDialog'
import SpecialIcon from '../components/calendar/SpecialIcon'
import BottomTabs from '../components/BottomTabs'
import { themeVars, pageVars } from '../themes/cssVars'
import { getTheme } from '../themes/registry'
import { loadThemeFonts } from '../themes/ThemeContext'
import './calendar.css'

export type CalendarState = { ay?: string | null; yil?: string | null; album?: string | null }

/**
 * Our calendar: the photos and videos of every album (or of one album) by the date they were taken. Month view with a small
 * polaroid on each day that has photos, a year view where days darken with the number of photos, "n years ago today" and the
 * couple's special days. On its own page (/takvim) the state lives in the address (?ay=2026-10 / ?yil=2026, &album=...) so
 * back / forward work; on the shelf of a wide screen it sits next to the albums with its own state.
 */
export default function CalendarPage() {
  const [search, setSearch] = useSearchParams()
  const state: CalendarState = { ay: search.get('ay'), yil: search.get('yil'), album: search.get('album') }
  const onChange = useCallback((next: CalendarState) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v)
    setSearch(params)
  }, [setSearch])
  return (
    <>
      <CalendarBoard state={state} onChange={onChange} />
      <BottomTabs />
    </>
  )
}

export function CalendarBoard({ state, onChange, embedded = false }: {
  state: CalendarState; onChange: (next: CalendarState) => void; embedded?: boolean
}) {
  const today = todayKey()
  const albumId = state.album ?? null
  const yearParam = Number(state.yil)
  const view: 'month' | 'year' = yearParam ? 'year' : 'month'
  const current = parseMonth(state.ay) ?? parseMonth(today.slice(0, 7))!

  const [albums, setAlbums] = useState<Album[]>([])
  const [months, setMonths] = useState<string[]>([])
  const [month, setMonth] = useState<MonthView | null>(null)
  const [year, setYear] = useState<YearView | null>(null)
  const [past, setPast] = useState<OnThisDay | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [specialOpen, setSpecialOpen] = useState(false)
  const [reload, setReload] = useState(0)

  const album = albums.find((a) => a.id === albumId)
  const theme = getTheme(album?.themeId)
  useEffect(() => {
    void loadThemeFonts(theme)
  }, [theme])

  const go = useCallback((params: CalendarState) => onChange({ ...state, ...params }), [state, onChange])

  useEffect(() => {
    listAlbums().then(setAlbums).catch(() => undefined)
  }, [])

  useEffect(() => {
    calendarMonths(albumId).then((list) => setMonths(list.map((m) => m.month))).catch((e: Error) => setError(e.message))
    onThisDay(albumId).then(setPast).catch(() => undefined)
  }, [albumId, reload])

  const key = monthKey(current.year, current.month)
  useEffect(() => {
    setError(null)
    if (view === 'year') {
      setYear(null)
      calendarYear(yearParam, albumId).then(setYear).catch((e: Error) => setError(e.message))
    } else {
      setMonth(null)
      calendarMonth(key, albumId).then(setMonth).catch((e: Error) => setError(e.message))
    }
  }, [view, key, yearParam, albumId, reload])

  const style = { ...themeVars(theme), ...pageVars(theme, 'light', 'textured') } as CSSProperties
  const dayHref = (date: string) => `/takvim/gun/${date}${albumId ? `?album=${albumId}` : ''}`

  const fullPage = `/takvim?${new URLSearchParams(Object.entries(state).filter(([, v]) => v) as [string, string][]).toString()}`
  const Root = embedded ? 'section' : 'main'
  return (
    <Root className={`calendar${embedded ? ' calendar--embedded' : ''}`} style={style} data-page-theme={theme.id} aria-label={embedded ? 'Takvim' : undefined}>
      <header className="calendar__header">
        {embedded ? <span /> : <Link to="/" className="clay clay--pill clay--sm clay--cream calendar__back">‹ Albümler</Link>}
        {embedded ? <h2 className="calendar__heading"><Link to={fullPage} title="Takvimi tam ekran aç">Takvimimiz</Link></h2> : <h1>Takvimimiz</h1>}
        <div className="calendar__tools">
          <div className="calendar__switch" role="group" aria-label="Görünüm">
            <Clay size="sm" tone={view === 'month' ? 'rose' : 'cream'} aria-pressed={view === 'month'}
              onClick={() => go({ yil: null, ay: key })}>Ay</Clay>
            <Clay size="sm" tone={view === 'year' ? 'rose' : 'cream'} aria-pressed={view === 'year'}
              onClick={() => go({ yil: String(current.year), ay: null })}>Yıl</Clay>
          </div>
          <label className="calendar__filter">
            <span className="visually-hidden">Albüm</span>
            <select value={albumId ?? ''} onChange={(e) => go({ album: e.target.value || null })} aria-label="Albüm">
              <option value="">Tüm albümler</option>
              {albums.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </select>
          </label>
          <Clay size="sm" tone="cream" onClick={() => setSpecialOpen(true)}>Özel günler</Clay>
        </div>
      </header>

      {error && <p role="alert" className="calendar__error">{error}</p>}

      {past && (past.past.length > 0 || past.specialDays.length > 0) && (
        <section className="calendar__past" aria-label="Geçmişte bugün">
          {past.specialDays.map((o) => (
            <p key={o.id} className="calendar__today-special"><SpecialIcon icon={o.icon} /> Bugün: {occurrenceLabel(o.title, o.yearly, o.years)}</p>
          ))}
          {past.past.map((p) => (
            <Link key={p.date} to={dayHref(p.date)} className="calendar__past-day">
              <span className="calendar__past-label">{yearsAgoLabel(p.yearsAgo)}</span>
              <span className="calendar__past-photos">
                {p.media.slice(0, 4).map((m, i) => {
                  const src = m.media.thumbUrl ?? m.media.posterUrl
                  return src ? <img key={m.media.id} src={src} alt="" style={{ '--tilt': `${(i % 2 ? 1 : -1) * (2 + i)}deg` } as CSSProperties} /> : null
                })}
              </span>
              <span className="calendar__past-count">{p.count} anı</span>
            </Link>
          ))}
        </section>
      )}

      {view === 'month' ? (
        <section className="calendar__month" aria-label={`${MONTHS[current.month - 1]} ${current.year}`}>
          <div className="calendar__nav">
            <Clay shape="round" size="sm" tone="cream" aria-label="Önceki ay" onClick={() => {
              const p = addMonths(current.year, current.month, -1)
              go({ ay: monthKey(p.year, p.month) })
            }}>‹</Clay>
            <h2 className="calendar__title">{MONTHS[current.month - 1]} <span>{current.year}</span></h2>
            <Clay shape="round" size="sm" tone="cream" aria-label="Sonraki ay" onClick={() => {
              const n = addMonths(current.year, current.month, 1)
              go({ ay: monthKey(n.year, n.month) })
            }}>›</Clay>
          </div>
          <div className="calendar__jumps">
            <MemoryJump months={months} current={key} dir={-1} onGo={(m) => go({ ay: m })} />
            {key !== today.slice(0, 7) && <button type="button" className="calendar__link" onClick={() => go({ ay: today.slice(0, 7) })}>Bugüne dön</button>}
            <MemoryJump months={months} current={key} dir={1} onGo={(m) => go({ ay: m })} />
          </div>
          <MonthGrid view={month} year={current.year} month={current.month} today={today} dayHref={dayHref} />
        </section>
      ) : (
        <section className="calendar__year" aria-label={String(yearParam)}>
          <div className="calendar__nav">
            <Clay shape="round" size="sm" tone="cream" aria-label="Önceki yıl" onClick={() => go({ yil: String(yearParam - 1) })}>‹</Clay>
            <h2 className="calendar__title">{yearParam}</h2>
            <Clay shape="round" size="sm" tone="cream" aria-label="Sonraki yıl" onClick={() => go({ yil: String(yearParam + 1) })}>›</Clay>
          </div>
          <YearGrid view={year} year={yearParam} today={today} onMonth={(m) => go({ yil: null, ay: monthKey(yearParam, m) })} />
        </section>
      )}

      {specialOpen && <SpecialDaysDialog onChanged={() => setReload((n) => n + 1)} onClose={() => setSpecialOpen(false)} />}
    </Root>
  )
}

function MemoryJump({ months, current, dir, onGo }: { months: string[]; current: string; dir: -1 | 1; onGo: (m: string) => void }) {
  const target = nearestMonth(months, current, dir)
  if (!target) return <span />
  const p = parseMonth(target)!
  return (
    <button type="button" className="calendar__link" onClick={() => onGo(target)}>
      {dir < 0 ? `‹ Önceki anı: ${MONTHS[p.month - 1]} ${p.year}` : `Sonraki anı: ${MONTHS[p.month - 1]} ${p.year} ›`}
    </button>
  )
}

function MonthGrid({ view, year, month, today, dayHref }: {
  view: MonthView | null; year: number; month: number; today: string; dayHref: (d: string) => string
}) {
  const byDay = useMemo(() => new Map((view?.days ?? []).map((d) => [d.date, d])), [view])
  const specials = useMemo(() => {
    const map = new Map<string, Occurrence[]>()
    for (const o of view?.specialDays ?? []) map.set(o.date, [...(map.get(o.date) ?? []), o])
    return map
  }, [view])
  return (
    <div className={`calendar__grid${view ? '' : ' calendar__grid--loading'}`} role="grid">
      {WEEKDAYS.map((w) => <div key={w} className="calendar__weekday" role="columnheader">{w}</div>)}
      {monthGrid(year, month).flat().map((d, i) => {
        if (d === null) return <div key={`e${i}`} className="calendar__cell calendar__cell--empty" />
        const date = dayKey(year, month, d)
        const info = byDay.get(date)
        const sp = specials.get(date) ?? []
        const label = `${d} ${MONTHS[month - 1]}${info ? `, ${info.count} anı` : ''}${sp.length ? `, ${sp.map((o) => o.title).join(', ')}` : ''}`
        const content = (
          <>
            <span className="calendar__day-number">{d}</span>
            {info?.cover?.thumbUrl && <img className="calendar__thumb" src={info.cover.thumbUrl} alt="" loading="lazy" />}
            {info && !info.cover?.thumbUrl && <span className="calendar__thumb calendar__thumb--blank" />}
            {info && info.count > 1 && <span className="calendar__count">{info.count}</span>}
            {info?.uncertain && <span className="calendar__uncertain" title="Tarihi belirsiz fotoğraf var">?</span>}
            {sp.length > 0 && (
              <span className="calendar__specials" title={sp.map((o) => occurrenceLabel(o.title, o.yearly, o.years)).join(', ')}>
                {sp.slice(0, 2).map((o) => <SpecialIcon key={o.id} icon={o.icon} size={14} />)}
              </span>
            )}
          </>
        )
        const cls = `calendar__cell${info ? ' calendar__cell--photos' : ''}${date === today ? ' calendar__cell--today' : ''}${sp.length ? ' calendar__cell--special' : ''}`
        return info || sp.length ? (
          <Link key={date} to={dayHref(date)} className={cls} role="gridcell" aria-label={label}>{content}</Link>
        ) : (
          <div key={date} className={cls} role="gridcell" aria-label={label}>{content}</div>
        )
      })}
    </div>
  )
}

function YearGrid({ view, year, today, onMonth }: { view: YearView | null; year: number; today: string; onMonth: (m: number) => void }) {
  const max = Math.max(0, ...Object.values(view?.days ?? {}))
  const special = new Set((view?.specialDays ?? []).map((o) => o.date))
  return (
    <div className={`calendar__months${view ? '' : ' calendar__grid--loading'}`}>
      {MONTHS.map((name, i) => {
        const m = i + 1
        const total = Object.entries(view?.days ?? {}).filter(([d]) => d.startsWith(monthKey(year, m))).reduce((s, [, n]) => s + n, 0)
        return (
          <button key={name} type="button" className="calendar__mini" onClick={() => onMonth(m)} aria-label={`${name} ${year}, ${total} anı`}>
            <span className="calendar__mini-title">{name}{total > 0 && <small> · {total}</small>}</span>
            <span className="calendar__mini-grid">
              {monthGrid(year, m).flat().map((d, k) => {
                if (d === null) return <span key={k} className="calendar__dot calendar__dot--empty" />
                const date = dayKey(year, m, d)
                const level = intensity(view?.days[date] ?? 0, max)
                return <span key={k} className={`calendar__dot calendar__dot--${level}${special.has(date) ? ' calendar__dot--special' : ''}${date === today ? ' calendar__dot--today' : ''}`} />
              })}
            </span>
          </button>
        )
      })}
    </div>
  )
}
