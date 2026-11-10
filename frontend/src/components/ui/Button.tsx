import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'gold' | 'ghost' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  block?: boolean
  /** shows a spinner and blocks repeated clicks */
  loading?: boolean
  icon?: ReactNode
}

export function uiButtonClass(variant: ButtonVariant = 'primary', size: 'sm' | 'md' | 'lg' = 'md', block = false): string {
  return `ui-btn ui-btn--${variant}${size === 'md' ? '' : ` ui-btn--${size}`}${block ? ' ui-btn--block' : ''}`
}

/** A button of the design system; for a link that looks like one, use uiButtonClass() on the <Link>. */
export default function Button({
  variant = 'primary', size = 'md', block = false, loading = false, icon, type = 'button', className = '', disabled, children, ...rest
}: Props) {
  return (
    <button
      type={type}
      className={`${uiButtonClass(variant, size, block)} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="ui-btn__spinner" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
}
