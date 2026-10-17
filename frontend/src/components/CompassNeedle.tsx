import { useEffect, useRef } from 'react'
import './compass.css'

/** A small brass compass in the corner of the book whose needle turns towards the mouse (desktop, view mode). */
export default function CompassNeedle() {
  const needle = useRef<SVGGElement>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const r = box.current?.getBoundingClientRect()
        if (!r || !needle.current) return
        const angle = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI + 90
        needle.current.style.transform = `rotate(${angle.toFixed(1)}deg)`
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <div ref={box} className="compass" aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="21" fill="#f5e6ca" stroke="#b8860b" strokeWidth="3" />
        <circle cx="24" cy="24" r="16" fill="none" stroke="#b8860b" strokeWidth=".8" strokeDasharray="1.5 2.5" />
        <g ref={needle} className="compass__needle">
          <path d="M24 7 L28 24 L24 22 L20 24Z" fill="#c85a32" stroke="#6a2a14" strokeWidth=".8" strokeLinejoin="round" />
          <path d="M24 41 L28 24 L24 26 L20 24Z" fill="#4a3525" stroke="#2a1a10" strokeWidth=".8" strokeLinejoin="round" />
        </g>
        <circle cx="24" cy="24" r="2.4" fill="#f1d680" stroke="#6a4a0c" strokeWidth=".8" />
      </svg>
    </div>
  )
}
