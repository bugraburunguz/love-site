import { useEffect, useState } from 'react'
import {
  createSpecialDay, deleteSpecialDay, listSpecialDays, updateSpecialDay, type SpecialDay, type SpecialIcon as Icon,
} from '../../api/calendar'
import { longDate } from '../../calendar/calendarMath'
import Clay from '../Clay'
import { Frame } from '../Dialog'
import SpecialIcon, { ICON_LABEL, ICONS } from './SpecialIcon'

type Draft = { id?: string; title: string; day: string; icon: Icon; yearly: boolean }
const EMPTY: Draft = { title: '', day: '', icon: 'heart', yearly: true }

/** Your special days: add, change, remove. Yearly ones come back every year on the same day; one-off ones show once. */
export default function SpecialDaysDialog({ onChanged, onClose }: { onChanged: () => void; onClose: () => void }) {
  const [days, setDays] = useState<SpecialDay[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => listSpecialDays().then(setDays).catch((e: Error) => setError(e.message))
  useEffect(() => {
    void load()
  }, [])

  async function save() {
    if (!draft) return
    setError(null)
    try {
      const body = { title: draft.title.trim(), day: draft.day, icon: draft.icon, yearly: draft.yearly }
      if (draft.id) await updateSpecialDay(draft.id, body)
      else await createSpecialDay(body)
      setDraft(null)
      await load()
      onChanged()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi')
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
    <Frame title="Özel günlerimiz" onClose={onClose}>
      <div className="special-days">
        {draft ? (
          <div className="dialog__form">
            <label className="dialog__label">
              Ad
              <input className="paper-input" value={draft.title} maxLength={80} placeholder="Tanışma günümüz" autoFocus
                onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label className="dialog__label">
              Tarih
              <input className="paper-input" type="date" value={draft.day} min="1900-01-01" max="2100-12-31"
                onChange={(e) => setDraft({ ...draft, day: e.target.value })} />
            </label>
            <div className="special-days__icons" role="radiogroup" aria-label="Simge">
              {ICONS.map((icon) => (
                <button key={icon} type="button" role="radio" aria-checked={draft.icon === icon} aria-label={ICON_LABEL[icon]}
                  className="special-days__icon" onClick={() => setDraft({ ...draft, icon })}>
                  <SpecialIcon icon={icon} size={22} />
                </button>
              ))}
            </div>
            <label className="export-option">
              <input type="radio" name="repeat" checked={draft.yearly} onChange={() => setDraft({ ...draft, yearly: true })} /> Her yıl
            </label>
            <label className="export-option">
              <input type="radio" name="repeat" checked={!draft.yearly} onChange={() => setDraft({ ...draft, yearly: false })} /> Yalnızca bir kez
            </label>
            {error && <p role="alert" className="dialog__error">{error}</p>}
            <div className="dialog__actions">
              <Clay tone="cream" onClick={() => setDraft(null)}>Vazgeç</Clay>
              <Clay disabled={!draft.title.trim() || !draft.day} onClick={() => void save()}>Kaydet</Clay>
            </div>
          </div>
        ) : (
          <>
            {days === null ? <p className="dialog__message">Yükleniyor…</p> : days.length === 0 ? (
              <p className="dialog__message">Henüz özel gün yok. Tanıştığınız gün, yıldönümünüz…</p>
            ) : (
              <ul className="special-days__list">
                {days.map((d) => (
                  <li key={d.id}>
                    <SpecialIcon icon={d.icon} size={20} />
                    <span className="special-days__title">{d.title}</span>
                    <span className="special-days__date">{longDate(d.day)}{d.yearly ? ' · her yıl' : ''}</span>
                    <Clay size="sm" tone="cream" onClick={() => setDraft({ ...d })}>Düzenle</Clay>
                    <Clay size="sm" tone="rose" onClick={() => void remove(d.id)}>Sil</Clay>
                  </li>
                ))}
              </ul>
            )}
            {error && <p role="alert" className="dialog__error">{error}</p>}
            <div className="dialog__actions">
              <Clay tone="cream" onClick={onClose}>Kapat</Clay>
              <Clay onClick={() => setDraft({ ...EMPTY })}>Özel gün ekle</Clay>
            </div>
          </>
        )}
      </div>
    </Frame>
  )
}
