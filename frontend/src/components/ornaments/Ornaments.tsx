import './ornaments.css'

export function Tape({ variant = 'cream' }: { variant?: string }) {
  return <div className={`tape tape--${variant}`} aria-hidden="true" />
}

const STAR = 'M12 2l2.9 6.6 7.1.6-5.4 4.7 1.7 7-6.3-3.8-6.3 3.8 1.7-7L2 9.2l7.1-.6z'
const HEART = 'M12 21s-7.5-4.6-9.6-9.2C.8 8.3 2.7 4.5 6.3 4.5c2.1 0 3.6 1.1 5.7 3.3 2.1-2.2 3.6-3.3 5.7-3.3 3.6 0 5.5 3.8 3.9 7.3C19.5 16.4 12 21 12 21z'
const SPARKLE = 'M12 1c.8 5.6 2.4 9.2 11 11-8.6 1.8-10.2 5.4-11 11-.8-5.6-2.4-9.2-11-11C9.6 10.2 11.2 6.6 12 1z'

export function Sticker({ variant = 'heart' }: { variant?: string }) {
  const shape = variant === 'star' ? STAR : variant === 'sparkle' ? SPARKLE : HEART
  const fill = variant === 'star' ? 'var(--gold)' : variant === 'sparkle' ? 'var(--gold-light)' : 'var(--rose-dust)'
  return (
    <svg className="sticker" viewBox="0 0 24 24" aria-hidden="true">
      <path d={shape} fill={fill} stroke="rgba(74,47,35,0.45)" strokeWidth="0.6" strokeLinejoin="round" />
      <path d={shape} fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5" transform="translate(-0.4 -0.4)" />
    </svg>
  )
}
