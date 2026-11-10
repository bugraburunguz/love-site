import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** small helper on the right of the label, e.g. "En az 10 karakter" */
  hint?: string
  error?: string | null
  icon?: ReactNode
}

/** Label, input, hint and error wired together for screen readers. */
export function TextField({ label, hint, error, icon, className = '', id: ownId, 'aria-describedby': ownDescribedBy, ...input }: FieldProps) {
  const generated = useId()
  const id = ownId ?? generated
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  return (
    <div className={`ui-field${icon ? ' ui-field--icon' : ''}${error ? ' ui-field--error' : ''} ${className}`.trim()}>
      <div className="ui-field__top">
        <label className="ui-field__label" htmlFor={id}>{label}</label>
        {hint && <span className="ui-field__hint" id={hintId}>{hint}</span>}
      </div>
      <div className="ui-field__box">
        <input
          {...input}
          id={id}
          className="ui-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={[ownDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined}
        />
        {icon && <span className="ui-field__icon" aria-hidden="true">{icon}</span>}
      </div>
      {error && <p className="ui-field__error" id={errorId} role="alert">{error}</p>}
    </div>
  )
}

interface CheckProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  children: ReactNode
}

/** A checkbox on a sunk paper strip (consents, options); the whole strip is the hit area. */
export function Checkbox({ children, className = '', ...input }: CheckProps) {
  return (
    <label className={`ui-check ${className}`.trim()}>
      <input type="checkbox" {...input} />
      <span>{children}</span>
    </label>
  )
}
