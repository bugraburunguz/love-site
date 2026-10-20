import { useState } from 'react'
import { setMediaDate, type MediaDto } from '../../api/albums'
import { fromInstant, toInstant } from '../../calendar/calendarMath'
import Clay from '../Clay'
import { Frame } from '../Dialog'

/**
 * Corrects the date of a photo / video by hand (day and time, in this device's time zone). The calendar, the date under the
 * polaroid and the exports all follow it; "Orijinal tarihe dön" removes the correction.
 */
export default function DateEditDialog({ media, onSaved, onClose }: { media: MediaDto; onSaved: (m: MediaDto) => void; onClose: () => void }) {
  const start = fromInstant(media.displayDate)
  const [date, setDate] = useState(start.date)
  const [time, setTime] = useState(start.time)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(value: string | null) {
    setBusy(true)
    setError(null)
    try {
      onSaved(await setMediaDate(media.id, value))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kaydedilemedi')
      setBusy(false)
    }
  }

  const instant = toInstant(date, time)
  return (
    <Frame title="Tarihi düzelt" onClose={onClose}>
      <div className="dialog__form">
        {media.dateUncertain && !media.dateOverridden && (
          <p className="dialog__message">Bu fotoğrafın çekim tarihi bilinmiyor; şimdilik telefondaki dosya ya da yükleme tarihi gösteriliyor.</p>
        )}
        <label className="dialog__label">
          Gün
          <input className="paper-input" type="date" value={date} min="1900-01-01" max="2100-12-31" onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="dialog__label">
          Saat
          <input className="paper-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        {error && <p role="alert" className="dialog__error">{error}</p>}
        <div className="dialog__actions">
          {media.dateOverridden && (
            <Clay tone="cream" disabled={busy} onClick={() => void save(null)}>Orijinal tarihe dön</Clay>
          )}
          <Clay tone="cream" onClick={onClose}>Vazgeç</Clay>
          <Clay disabled={busy || !instant} onClick={() => instant && void save(instant)}>Kaydet</Clay>
        </div>
      </div>
    </Frame>
  )
}
