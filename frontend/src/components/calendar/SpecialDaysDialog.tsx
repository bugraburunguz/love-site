import { useEffect, useState } from 'react'
import {
  createSpecialDay, deleteSpecialDay, listSpecialDays, updateSpecialDay, type SpecialDay, type SpecialIcon as Icon,
} from '../../api/calendar'
import { longDate } from '../../calendar/calendarMath'
import { Button, Checkbox, Modal, TextField } from '../ui'
import SpecialIcon, { ICON_LABEL, ICONS } from './SpecialIcon'

type Draft = { id?: string; title: string; day: string; icon: Icon; yearly: boolean }
const EMPTY: Draft = { title: '', day: '', icon: 'heart', yearly: true }

/** Your special days: add, change, remove. Yearly ones come back every year on the same day; one-off ones show once. */
export default function SpecialDaysDialog({ onChanged, onClose }: { onChanged: () => void; onClose: () => void }) {
  const [days, setDays] = useState<SpecialDay[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => listSpecialDays().then(setDays).catch((e: Error) => setError(e.message))
  useEffect(() => {
    void load()
  }, [])

  // switching between the list and the form starts without the other view's message
  function edit(next: Draft | null) {
    setError(null)
    setDraft(next)
  }

  async function save() {
    if (!draft || busy) return
    setError(null)
    setBusy(true)
    try {
      const body = { title: draft.title.trim(), day: draft.day, icon: draft.icon, yearly: draft.yearly }
      if (draft.id) await updateSpecialDay(draft.id, body)
      else await createSpecialDay(body)
      setDraft(null)
      await load()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    try {
      await deleteSpecialDay(id)
      await load()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Silinemedi')
    }
  }

  return (
    // while a day is being written, Escape / backdrop must not throw the draft away ("Vazgeç" goes back to the list)
    <Modal title="Özel günlerimiz" eyebrow="Takvim" onClose={onClose} dismissable={!draft}>
      <div className="special-days">
        {draft ? (
          <div className="ui-form">
            <TextField label="Ad" value={draft.title} maxLength={80} placeholder="Tanışma günümüz" autoFocus
              onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            <TextField label="Tarih" type="date" value={draft.day} min="1900-01-01" max="2100-12-31"
              onChange={(e) => setDraft({ ...draft, day: e.target.value })} />
            <div className="ui-field">
              <span className="ui-field__label">Simge</span>
              <div className="special-days__icons" role="radiogroup" aria-label="Simge">
                {ICONS.map((icon) => (
                  <button key={icon} type="button" role="radio" aria-checked={draft.icon === icon} aria-label={ICON_LABEL[icon]}
                    className="special-days__icon" onClick={() => setDraft({ ...draft, icon })}>
                    <SpecialIcon icon={icon} size={22} />
                  </button>
                ))}
              </div>
            </div>
            <Checkbox checked={draft.yearly} onChange={(e) => setDraft({ ...draft, yearly: e.target.checked })}>
              Her yıl tekrarlansın (kapalıysa yalnızca o yıl görünür)
            </Checkbox>
            {error && <p role="alert" className="ui-field__error">{error}</p>}
            <div className="ui-modal__actions">
              <Button variant="secondary" onClick={() => edit(null)} disabled={busy}>Vazgeç</Button>
              <Button loading={busy} disabled={!draft.title.trim() || !draft.day} onClick={() => void save()}>Kaydet</Button>
            </div>
          </div>
        ) : (
          <div className="ui-form">
            {days === null ? <p className="ui-muted ui-modal__text">Yükleniyor…</p> : days.length === 0 ? (
              <p className="ui-muted ui-modal__text">Henüz özel gün yok. Tanıştığınız gün, yıldönümünüz…</p>
            ) : (
              <ul className="special-days__list">
                {days.map((d) => (
                  <li key={d.id}>
                    <SpecialIcon icon={d.icon} size={20} />
                    <span className="special-days__title">{d.title}</span>
                    <span className="special-days__date">{longDate(d.day)}{d.yearly ? ' · her yıl' : ''}</span>
                    <Button size="sm" variant="ghost" onClick={() => edit({ ...d })}>Düzenle</Button>
                    <Button size="sm" variant="danger" onClick={() => void remove(d.id)}>Sil</Button>
                  </li>
                ))}
              </ul>
            )}
            {error && <p role="alert" className="ui-field__error">{error}</p>}
            <div className="ui-modal__actions">
              <Button onClick={() => edit({ ...EMPTY })}>Özel gün ekle</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
