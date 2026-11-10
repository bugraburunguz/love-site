import { useState, type FormEvent } from 'react'
import Button from './Button'
import { TextField } from './Field'
import Modal from './Modal'

interface PromptProps {
  title: string
  label: string
  initial?: string
  confirmLabel: string
  maxLength?: number
  onSubmit: (value: string) => void | Promise<void>
  onClose: () => void
}

/** One line of text (rename an album, name a space). */
export function PromptModal({ title, label, initial = '', confirmLabel, maxLength = 200, onSubmit, onClose }: PromptProps) {
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
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="ui-form">
        <TextField label={label} value={value} onChange={(e) => setValue(e.target.value)} maxLength={maxLength} autoFocus error={error} />
        <div className="ui-modal__actions">
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button type="submit" loading={busy} disabled={!value.trim()}>{confirmLabel}</Button>
        </div>
      </form>
    </Modal>
  )
}

interface ConfirmProps {
  title: string
  message: string
  confirmLabel: string
  /** destructive actions get the red button */
  danger?: boolean
  onConfirm: () => void | Promise<void>
  onClose: () => void
}

/** A yes/no question before something that is hard to undo. */
export function ConfirmModal({ title, message, confirmLabel, danger = false, onConfirm, onClose }: ConfirmProps) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>Vazgeç</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
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
          </Button>
        </>
      }
    >
      <p className="ui-muted" style={{ margin: 0 }}>{message}</p>
    </Modal>
  )
}
