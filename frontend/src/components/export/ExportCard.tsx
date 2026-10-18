import { useEffect, useState } from 'react'
import type { ExportJob } from '../../api/exports'
import { canShareFiles, download, isTouchDevice, prefetchFiles, shareFiles } from '../../export/share'
import { isNativeApp } from '../../native/platform'
import Clay from '../Clay'
import './export.css'

export const EXPORT_LABEL: Record<ExportJob['type'], string> = {
  POLAROID: 'Polaroid',
  STORY: 'Instagram Story',
  POST: 'Instagram gönderisi',
  CAROUSEL: 'Instagram carousel',
  REELS: 'Reels',
  STICKER_PACK: 'WhatsApp sticker paketi',
}

/** Prefetching is skipped above this size (a long reel on a phone data plan): the card offers a plain download instead. */
const PREFETCH_LIMIT = 150 * 1024 * 1024

/**
 * One export: "Hazırlanıyor…" while the worker renders, then share / download. On a phone that can share files the result is
 * downloaded into memory first and "Paylaş" becomes active only then (iOS needs navigator.share straight after the tap).
 */
export default function ExportCard({ job, onDismiss, compact }: { job: ExportJob; onDismiss?: () => void; compact?: boolean }) {
  const ready = job.status === 'READY'
  const main = job.files.filter((f) => f.role === 'main')
  const zip = job.files.find((f) => f.role === 'zip')
  const pngs = job.files.filter((f) => f.role === 'png')
  const shareable = job.type === 'STICKER_PACK' ? [] : main
  const [files, setFiles] = useState<File[] | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle')
  const [error, setError] = useState<string | null>(null)
  const touch = isTouchDevice()
  const total = shareable.reduce((s, f) => s + f.size, 0)

  useEffect(() => {
    if (isNativeApp || !ready || !touch || shareable.length === 0 || total > PREFETCH_LIMIT || typeof navigator.canShare !== 'function') return
    let cancelled = false
    setState('loading')
    prefetchFiles(shareable)
      .then((list) => {
        if (cancelled) return
        setFiles(list)
        setState('idle')
      })
      .catch(() => !cancelled && setState('failed'))
    return () => {
      cancelled = true
    }
    // the presigned links change on every poll; the job id and status are what matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, job.id, touch])

  const canShare = !!files && canShareFiles(files)

  function onShare() {
    if (!files) return
    setError(null)
    // no await before this call: iOS only allows it right after the tap
    shareFiles(files, EXPORT_LABEL[job.type]).catch((e: Error) => {
      if (e.name !== 'AbortError') setError('Paylaşılamadı. "Galeriye kaydet / İndir" ile kaydedebilirsin.')
    })
  }

  function onDownload() {
    shareable.forEach((f, i) => download(f, files?.[i]))
  }

  return (
    <div className={`export-card${compact ? ' export-card--compact' : ''}`} role="status">
      <div className="export-card__head">
        <strong>{EXPORT_LABEL[job.type]}</strong>
        {/* hiding a card never cancels the export: it keeps running and stays in the share dialog's list */}
        {onDismiss && (
          <button type="button" className="export-card__close" aria-label="Kartı kapat" onClick={onDismiss}>✕</button>
        )}
      </div>
      {(job.status === 'QUEUED' || job.status === 'RUNNING') && (
        <p className="export-card__progress"><span className="export-card__dots" aria-hidden="true" />Hazırlanıyor…</p>
      )}
      {job.status === 'FAILED' && <p className="export-card__error">{job.error ?? 'Hazırlanamadı.'}</p>}
      {ready && (
        <>
          <p className="export-card__ready">Hazır</p>
          {job.notes.map((n) => <p key={n} className="export-card__note">{n}</p>)}
          {job.type === 'STICKER_PACK' ? (
            <div className="export-card__actions">
              {zip && <Clay size="sm" onClick={() => download(zip)}>{isNativeApp ? 'Paketi paylaş / kaydet (.zip)' : 'Paketi indir (.zip)'}</Clay>}
              <details className="export-card__help">
                <summary>WhatsApp'a nasıl eklenir?</summary>
                <p>Paketin tamamı için: telefonuna bir sticker maker (sticker oluşturucu) uygulaması kur, zip'teki <code>stickers</code> klasörünü
                  içe aktar ve "WhatsApp'a ekle" de. Simge istenirse <code>tray.png</code>'yi seç.</p>
                <p>Tek bir sticker için: aşağıdan bir PNG'yi kaydet, WhatsApp'ta bir sohbette sticker menüsündeki "Oluştur" ile aç.</p>
              </details>
              {pngs.length > 0 && (
                <div className="export-card__pngs">
                  {pngs.map((p) => <button key={p.name} type="button" onClick={() => download(p)}>{p.name}</button>)}
                </div>
              )}
            </div>
          ) : isNativeApp ? (
            <div className="export-card__actions">
              <Clay size="sm" disabled={state === 'loading'} onClick={() => {
                setError(null)
                setState('loading')
                void import('../../native/share')
                  .then(({ nativeShare }) => nativeShare(shareable, EXPORT_LABEL[job.type]))
                  .catch(() => setError('Paylaşılamadı. Biraz sonra yeniden deneyin.'))
                  .finally(() => setState('idle'))
              }}>
                {state === 'loading' ? 'Hazırlanıyor…' : 'Paylaş / Kaydet'}
              </Clay>
              <p className="export-card__note">Açılan menüden Instagram, WhatsApp ya da "Resmi kaydet" / "Videoyu kaydet"i seç.</p>
            </div>
          ) : touch && typeof navigator.canShare === 'function' && total <= PREFETCH_LIMIT ? (
            <div className="export-card__actions">
              <Clay size="sm" disabled={!canShare} onClick={onShare}>
                {state === 'loading' ? 'Hazırlanıyor…' : 'Paylaş'}
              </Clay>
              <Clay size="sm" tone="cream" onClick={onDownload}>Galeriye kaydet / İndir</Clay>
              {state === 'failed' && <p className="export-card__note">Dosya önceden alınamadı; "İndir" ile kaydedebilirsin.</p>}
              {files && !canShare && <p className="export-card__note">Bu tarayıcı dosya paylaşımını desteklemiyor; indirip galeriden paylaşabilirsin.</p>}
            </div>
          ) : (
            <div className="export-card__actions">
              <Clay size="sm" onClick={onDownload}>{shareable.length > 1 ? `İndir (${shareable.length} dosya)` : 'İndir'}</Clay>
              {zip && shareable.length > 1 && <Clay size="sm" tone="cream" onClick={() => download(zip)}>Hepsi tek dosyada (.zip)</Clay>}
            </div>
          )}
          {error && <p role="alert" className="export-card__error">{error}</p>}
        </>
      )}
    </div>
  )
}
