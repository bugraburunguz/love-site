import { useEffect, useRef, useState } from 'react'
import { saveDayNote, type DayNote } from '../../api/calendar'
import { useAuth } from '../../auth/AuthContext'

export function NoteIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="special-icon">
      <path d="M5 4h10l4 4v12H5z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 11h8M8 15h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

const SAVE_AFTER_MS = 1200

/**
 * The diary of a day: my own note (written straight on the paper, saved by itself a moment after I stop typing and when I
 * leave the field) and my partner's note next to it, read-only. Clearing my text removes my note.
 * The parent mounts it again (key) for another day: the text is never replaced from outside while I am typing.
 */
export default function DayNotes({ date, notes, onChange }: { date: string; notes: DayNote[]; onChange: () => void }) {
  const { user } = useAuth()
  const mine = notes.find((n) => n.mine)
  const others = notes.filter((n) => !n.mine)
  const [text, setText] = useState(mine?.body ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saved = useRef(mine?.body ?? '')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  async function save(value: string) {
    clearTimeout(timer.current)
    if (value.trim() === saved.current.trim()) return
    setState('saving')
    try {
      await saveDayNote(date, value)
      saved.current = value.trim()
      setState('saved')
      onChange()
    } catch {
      setState('error')
    }
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <section className="day-notes" aria-label="Günlük">
      <article className="day-note day-note--mine">
        <header className="day-note__author">{user?.displayName ?? 'Ben'}</header>
        <textarea
          className="day-note__text"
          value={text}
          maxLength={5000}
          rows={4}
          placeholder="Bugün nasıl bir gündü? Bir şeyler yaz…"
          aria-label="Benim notum"
          onChange={(e) => {
            const value = e.target.value
            setText(value)
            setState('idle')
            clearTimeout(timer.current)
            timer.current = setTimeout(() => void save(value), SAVE_AFTER_MS)
          }}
          onBlur={() => void save(text)}
        />
        <footer className="day-note__state" aria-live="polite">
          {state === 'saving' && 'Kaydediliyor…'}
          {state === 'saved' && (text.trim() ? 'Kaydedildi' : 'Not silindi')}
          {state === 'error' && <span className="day-note__error">Kaydedilemedi, yeniden dene</span>}
        </footer>
      </article>
      {others.map((n) => (
        <article key={n.authorId} className="day-note">
          <header className="day-note__author">{n.authorName}</header>
          <p className="day-note__text day-note__text--read">{n.body}</p>
          <footer className="day-note__state">
            {new Date(n.updatedAt).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
          </footer>
        </article>
      ))}
    </section>
  )
}
