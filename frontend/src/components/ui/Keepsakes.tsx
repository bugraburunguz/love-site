import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { tiltFor } from './tilt'

type Tape = 'rose' | 'kraft' | 'none'

function TapeStrip({ tape }: { tape: Tape }) {
  if (tape === 'none') return null
  return <span className={`ui-tape${tape === 'kraft' ? ' ui-tape--kraft' : ''}`} aria-hidden="true" />
}

interface CardProps extends HTMLAttributes<HTMLElement> {
  sunk?: boolean
  tape?: Tape
  as?: 'section' | 'article' | 'div'
}

/** A card of pressed cotton paper; `sunk` for the tinted inner panels. */
export function Card({ sunk = false, tape = 'none', as: Tag = 'section', className = '', children, ...rest }: CardProps) {
  return (
    <Tag className={`ui-card${sunk ? ' ui-card--sunk' : ''} ${className}`.trim()} {...rest}>
      <TapeStrip tape={tape} />
      {children}
    </Tag>
  )
}

interface PolaroidProps {
  src: string
  alt: string
  caption?: ReactNode
  /** seeds the stable hand-pasted tilt; pass the media id */
  seed?: string
  tape?: Tape
  width?: number | string
  className?: string
}

/** A photo print: white frame with a wide chin for the handwritten caption, slightly tilted, optional washi tape. */
export function Polaroid({ src, alt, caption, seed, tape = 'rose', width = 220, className = '' }: PolaroidProps) {
  const style = { width, '--ui-tilt': `${seed === undefined ? 0 : tiltFor(seed)}deg` } as CSSProperties
  return (
    <figure className={`ui-polaroid ${className}`.trim()} style={style}>
      <TapeStrip tape={tape} />
      <img className="ui-polaroid__img" src={src} alt={alt} loading="lazy" decoding="async" />
      <figcaption className="ui-polaroid__caption">{caption}</figcaption>
    </figure>
  )
}

interface ChipProps extends HTMLAttributes<HTMLElement> {
  active?: boolean
  /** a plain label (badge) instead of a toggle button */
  static?: boolean
  icon?: ReactNode
}

/** A toggle pill (filters) or, with `static`, a badge. */
export function Chip({ active = false, static: isStatic = false, icon, className = '', children, ...rest }: ChipProps) {
  if (isStatic) {
    return (
      <span className={`ui-chip ui-chip--static${active ? ' ui-chip--active' : ''} ${className}`.trim()} {...rest}>
        {icon}
        {children}
      </span>
    )
  }
  return (
    <button type="button" className={`ui-chip ${className}`.trim()} aria-pressed={active} {...rest}>
      {icon}
      {children}
    </button>
  )
}

interface MeterProps {
  label: string
  used: number
  limit: number
  format: (n: number) => string
}

/** Storage use: turns gold from 85 % and red when full. */
export function Meter({ label, used, limit, format }: MeterProps) {
  const ratio = limit > 0 ? Math.min(1, used / limit) : 1
  const state = ratio >= 1 ? ' ui-meter--full' : ratio >= 0.85 ? ' ui-meter--near' : ''
  return (
    <div className={`ui-meter${state}`}>
      <div className="ui-meter__row">
        <span>{label}</span>
        <span className="ui-muted">{format(used)} / {format(limit)}</span>
      </div>
      <div className="ui-meter__track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}>
        <div className="ui-meter__fill" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  )
}

interface EmptyProps {
  art?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}

/** What an empty list says instead of nothing: a small drawing, one line of comfort, one action. */
export function EmptyState({ art = '❦', title, children, action }: EmptyProps) {
  return (
    <div className="ui-empty">
      <div className="ui-empty__art" aria-hidden="true">{art}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}
