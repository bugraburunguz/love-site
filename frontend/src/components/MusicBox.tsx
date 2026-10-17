import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { getMusicUrl } from '../api/albums'
import './clay.css'
import './musicbox.css'

const STORAGE_KEY = 'music-box-on'

function readRemembered(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function remember(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    /* storage unavailable (private mode): the toggle still works for this visit */
  }
}

const MusicContext = createContext<{ available: boolean } | null>(null)

/**
 * One <audio> element for the whole app, so the music keeps playing while pages change.
 * It never starts by itself: only a tap on the music box starts it. The "on" preference is remembered
 * only to mark the button after a reload; playback itself is never resumed automatically.
 */
export function MusicProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [wasOn] = useState(readRemembered)

  useEffect(() => {
    let cancelled = false
    getMusicUrl()
      .then((r) => !cancelled && setUrl(r?.url ?? null))
      .catch(() => !cancelled && setUrl(null))
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = useCallback(async () => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
      remember(false)
      return
    }
    try {
      // The signed link is short-lived; ask for a fresh one when it is no longer the one we hold.
      const fresh = await getMusicUrl()
      if (fresh && fresh.url !== audio.getAttribute('src')) audio.src = fresh.url
      await audio.play()
      setPlaying(true)
      remember(true)
    } catch {
      setPlaying(false)
    }
  }, [playing])

  return (
    <MusicContext.Provider value={{ available: url !== null }}>
      {children}
      {url && (
        <>
          <audio ref={audioRef} src={url} loop preload="none" onPause={() => setPlaying(false)} />
          <button
            type="button"
            className={`musicbox clay${playing ? ' musicbox--playing' : ''}${!playing && wasOn ? ' musicbox--remembered' : ''}`}
            onClick={() => void toggle()}
            aria-pressed={playing}
            aria-label={playing ? 'Müziği durdur' : 'Müziği çal'}
            title={playing ? 'Müziği durdur' : 'Müziği çal'}
          >
            <svg viewBox="0 0 48 48" aria-hidden="true">
              <rect x="7" y="24" width="34" height="17" rx="4" fill="#8b5a2b" stroke="#4a2f23" strokeWidth="1.5" />
              <rect x="11" y="28" width="26" height="3" rx="1.5" fill="#e6cb8e" />
              <circle cx="24" cy="36" r="2.4" fill="#e6cb8e" />
              <g className="musicbox__lid">
                <rect x="7" y="17" width="34" height="8" rx="3" fill="#a66f3a" stroke="#4a2f23" strokeWidth="1.5" />
              </g>
            </svg>
            <span className="musicbox__note musicbox__note--a" aria-hidden="true">♪</span>
            <span className="musicbox__note musicbox__note--b" aria-hidden="true">♫</span>
          </button>
        </>
      )}
    </MusicContext.Provider>
  )
}

export function useMusic() {
  return useContext(MusicContext)
}
