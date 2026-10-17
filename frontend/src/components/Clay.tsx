import type { ButtonHTMLAttributes } from 'react'
import './clay.css'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** round: icon buttons; seal: the big wax-seal "+" ; pill: text buttons */
  shape?: 'pill' | 'round' | 'seal'
  tone?: 'blush' | 'rose' | 'cream'
  size?: 'sm' | 'md'
}

/** Claymorphism lives only in controls: soft, puffy, slightly raised. */
export default function Clay({ shape = 'pill', tone = 'blush', size = 'md', className = '', type = 'button', ...rest }: Props) {
  return <button type={type} className={`clay clay--${shape} clay--${tone} clay--${size} ${className}`} {...rest} />
}
