import { useEffect, useState } from 'react'

function query(q: string): MediaQueryList | null {
  return typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(q) : null
}

function useMediaQuery(q: string): boolean {
  const [matches, setMatches] = useState(() => query(q)?.matches ?? false)
  useEffect(() => {
    const mql = query(q)
    if (!mql) return
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [q])
  return matches
}

export const useReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)')

/** True on devices with a real hover pointer (not touch). */
export const useHoverCapable = () => useMediaQuery('(hover: hover) and (pointer: fine)')
