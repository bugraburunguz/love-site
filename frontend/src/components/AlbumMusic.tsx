import { useCallback, useEffect, useRef, useState } from 'react'
import { assetUrl } from '../themes/assets'
import { useTheme } from '../themes/ThemeContext'
import './clay.css'
import './musicbox.css'

const FADE_MS = 700

/** Ramps the volume down, then pauses; the element is free to be dropped afterwards. */
function fadeOut(audio: HTMLAudioElement, then?: () => void) {
  const steps = 14
  let i = 0
  const timer = setInterval(() => {
    i++
    audio.volume = Math.max(0, 1 - i / steps)
    if (i >= steps) {
      clearInterval(timer)
      audio.pause()
      audio.volume = 1
      then?.()
    }
  }, FADE_MS / steps)
}

interface Props {
  /** presigned link of the album's song; null = the album has no music and no button is shown */
  url: string | null
  /** asks for a fresh link (the signed one is short-lived) */
  refreshUrl: () => Promise<string | null>
}

/**
 * The music box of the open album. It never starts by itself: only a tap on the button starts the song. Leaving the album
 * (this component unmounts) fades the song out; another album brings its own song, again waiting for a tap.
 */
export default function AlbumMusic({ url, refreshUrl }: Props) {
  const theme = useTheme()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  // leaving the album: fade out and let go of the file
  useEffect(
    () => () => {
      const audio = audioRef.current
      if (audio && !audio.paused) fadeOut(audio, () => audio.removeAttribute('src'))
    },
    [],
  )

  // the song was replaced or removed while the album is open: stop the old one
  useEffect(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
    }
    setPlaying(false)
  }, [url])

  const toggle = useCallback(async () => {
    const audio = audioRef.current ?? (audioRef.current = new Audio())
    audio.loop = true
    audio.preload = 'none'
    if (playing) {
      setPlaying(false)
      fadeOut(audio)
      return
    }
    try {
      const fresh = (await refreshUrl().catch(() => null)) ?? url
      if (!fresh) return
      if (fresh !== audio.getAttribute('src')) audio.src = fresh
      audio.volume = 1
      await audio.play()
      setPlaying(true)
    } catch {
      setPlaying(false)
    }
  }, [playing, refreshUrl, url])

  if (!url) return null
  const picture = assetUrl(theme.id, playing ? theme.musicBox.open : theme.musicBox.closed)
  return (
    <button
      type="button"
      className={`musicbox clay${playing ? ' musicbox--playing' : ''}`}
      onClick={() => void toggle()}
      aria-pressed={playing}
      aria-label={playing ? 'Müziği durdur' : 'Müziği çal'}
      title={playing ? 'Müziği durdur' : 'Müziği çal'}
    >
      {picture && <img src={picture} alt="" draggable={false} />}
      <span className="musicbox__note musicbox__note--a" aria-hidden="true">♪</span>
      <span className="musicbox__note musicbox__note--b" aria-hidden="true">♫</span>
    </button>
  )
}
