import { useState, type InputHTMLAttributes } from 'react'
import { TextField } from './ui'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  hint?: string
}

/** A password input with a "Göster / Gizle" toggle (typing a long password on a phone is easier when you can see it). */
export default function PasswordField({ label, hint, ...input }: Props) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="auth-pass">
      <TextField label={label} hint={hint} type={visible ? 'text' : 'password'} {...input} />
      <button
        type="button"
        className="auth-pass__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={`${label} göster`}
      >
        {visible ? 'Gizle' : 'Göster'}
      </button>
    </div>
  )
}
