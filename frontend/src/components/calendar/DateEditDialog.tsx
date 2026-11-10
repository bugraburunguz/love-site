import { useState } from 'react'
import { setMediaDate, type MediaDto } from '../../api/albums'
import { fromInstant, toInstant } from '../../calendar/calendarMath'
import { Button, Modal, TextField } from '../ui'

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
    <Modal title="Tarihi düzelt" eyebrow="Takvim" onClose={onClose} dismissable={!busy}>
      <div className="ui-form">
        {media.dateUncertain && !media.dateOverridden && (
          <p className="ui-muted ui-modal__text">Bu fotoğrafın çekim tarihi bilinmiyor; şimdilik telefondaki dosya ya da yükleme tarihi gösteriliyor.</p>
        )}
        <div className="ui-form__row">
          <TextField label="Gün" type="date" value={date} min="1900-01-01" max="2100-12-31" onChange={(e) => setDate(e.target.value)} />
          <TextField label="Saat" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        {error && <p role="alert" className="ui-field__error">{error}</p>}
        <div className="ui-modal__actions">
          {media.dateOverridden && (
            <Button variant="ghost" disabled={busy} onClick={() => void save(null)}>Orijinal tarihe dön</Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={busy}>Vazgeç</Button>
          <Button loading={busy} disabled={!instant} onClick={() => instant && void save(instant)}>Kaydet</Button>
        </div>
      </div>
    </Modal>
  )
}
