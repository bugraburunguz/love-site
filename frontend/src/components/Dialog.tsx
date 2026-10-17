import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import Clay from './Clay'
import './dialog.css'

function Frame({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="dialog-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <h2 className="dialog__title">{title}</h2>
        {children}
      </div>
    </div>
  )
}

interface PromptProps {
  title: string
  label: string
  initial?: string
  confirmLabel: string
  maxLength?: number
  onSubmit: (value: string) => void | Promise<void>
  onClose: () => void
}

/** A paper card asking for one line of text (new album, rename). */
export function PromptDialog({ title, label, initial = '', confirmLabel, maxLength = 200, onSubmit, onClose }: PromptProps) {
  const [value, setValue] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit(trimmed)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bir şeyler ters gitti')
      setBusy(false)
    }
  }

  return (
    <Frame title={title} onClose={onClose}>
      <form onSubmit={submit} className="dialog__form">
        <label className="dialog__label">
          {label}
          <input className="paper-input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={maxLength} autoFocus />
        </label>
        {error && <p role="alert" className="dialog__error">{error}</p>}
        <div className="dialog__actions">
          <Clay tone="cream" onClick={onClose}>Vazgeç</Clay>
          <Clay type="submit" disabled={busy || !value.trim()}>{confirmLabel}</Clay>
        </div>
      </form>
    </Frame>
  )
}

interface ConfirmProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }: ConfirmProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Frame title={title} onClose={onClose}>
      <p className="dialog__message">{message}</p>
      <div className="dialog__actions">
        <Clay tone="cream" onClick={onClose} autoFocus>Vazgeç</Clay>
        <Clay
          tone="rose"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              onClose()
            }
          }}
        >
          {confirmLabel}
        </Clay>
      </div>
    </Frame>
  )
}
