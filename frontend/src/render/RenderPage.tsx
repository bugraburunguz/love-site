import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { MediaDto } from '../api/albums'
import type { PageDto } from '../api/pages'
import PageCanvas from '../components/book/PageCanvas'
import CoverFace from '../components/CoverFace'
import { toMetrics } from '../layout/geometry'
import { CAROUSEL, EXPORT_METRICS, STORY, carouselPageScale, polaroidLayout, stickerLayout, storyLayout, type SceneLayout } from '../layout/exportLayout'
import { layoutPage } from '../layout/pageLayout'
import type { PageLayout } from '../layout/types'
import { coverSource } from '../media/display'
import { assetUrl } from '../themes/assets'
import { pageVars, themeVars } from '../themes/cssVars'
import { themeDecor } from '../themes/decor'
import { themesInUse } from '../themes/pageTheme'
import { getTheme } from '../themes/registry'
import { loadThemeFonts, ThemeContext } from '../themes/ThemeContext'
import { RenderModeContext } from './renderMode'
import './render.css'

/** What the loopback render endpoint answers (the export's payload snapshot with presigned URLs). */
interface Scene {
  kind: 'polaroid' | 'story' | 'page' | 'cover' | 'closing' | 'sticker'
  mediaId?: string
  themeId?: string
  swatch?: string | null
  paper?: string | null
  background?: 'transparent' | 'page'
  format?: 'story' | 'post'
  motion?: boolean
  pageId?: string
  pageNumber?: number
}

interface Payload {
  type: string
  watermark: string | null
  album: { id: string; title: string; themeId: string; coverMediaId: string | null; createdAt?: string }
  media: Record<string, MediaDto & { createdAt: string }>
  pages?: Record<string, PageDto>
  scenes: Scene[]
}

interface SceneInfo {
  width: number
  height: number
  transparent: boolean
  videos: { mediaId: string; cx: number; cy: number; w: number; h: number; angle: number; filter: object }[]
  polaroid?: SceneLayout['polaroid']
  overflow: boolean
}

declare global {
  interface Window {
    __RENDER__?: { ready: boolean; error?: string; show: (index: number) => Promise<SceneInfo>; key?: (colour: string) => Promise<void> }
  }
}

/** "'Caveat', 'Comic Sans MS', cursive" -> Caveat */
function firstFamily(stack: string): string {
  return stack.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

async function settle(root: HTMLElement) {
  await nextFrame()
  await nextFrame()
  await document.fonts.ready
  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(images.map(async (img) => {
    if (!img.complete) await new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }) })
    await img.decode().catch(() => undefined)
  }))
  await document.fonts.ready
  await nextFrame()
}

function measure(root: HTMLElement, transparent: boolean, size: { width: number; height: number }, polaroid?: SceneLayout['polaroid']): SceneInfo {
  const videos = Array.from(root.querySelectorAll<HTMLElement>('[data-video-window]')).map((el) => {
    const corner = (name: string) => (el.querySelector(`[data-corner="${name}"]`) as HTMLElement).getBoundingClientRect()
    const tl = corner('tl')
    const tr = corner('tr')
    const bl = corner('bl')
    const theme = getTheme(el.closest<HTMLElement>('[data-page-theme]')?.dataset.pageTheme)
    return {
      mediaId: el.dataset.videoWindow as string,
      // centre of the (rotated) rectangle = midpoint of two opposite corners
      cx: (tr.x + bl.x) / 2,
      cy: (tr.y + bl.y) / 2,
      w: Math.hypot(tr.x - tl.x, tr.y - tl.y),
      h: Math.hypot(bl.x - tl.x, bl.y - tl.y),
      angle: (Math.atan2(tr.y - tl.y, tr.x - tl.x) * 180) / Math.PI,
      filter: theme.mediaFilter,
    }
  })
  const overflow = Array.from(root.querySelectorAll<HTMLElement>('.polaroid__caption')).some((el) => el.scrollHeight > el.clientHeight + 1)
  return { ...size, transparent, videos, polaroid, overflow }
}

/** The faint site name in a corner: the host of APP_PUBLIC_URL, in the page's ink colour. */
function Watermark({ text, style }: { text: string | null; style: CSSProperties }) {
  if (!text) return null
  return <div className="render-watermark" style={style}>{text}</div>
}

/** Watermark inside the bottom strip of a polaroid, turned with it. */
function PolaroidMark({ text, p, ink }: { text: string | null; p: SceneLayout['polaroid']; ink: string }) {
  if (!text) return null
  return (
    <div className="render-polaroid-mark" style={{
      left: p.x, top: p.y, width: p.width, height: p.height, transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
    }}>
      <span style={{ fontSize: Math.max(9, p.width * 0.024), color: ink, right: p.width * 0.04, bottom: p.width * 0.018 }}>{text}</span>
    </div>
  )
}

export default function RenderPage() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [index, setIndex] = useState(-1)
  /** each scene is drawn twice: the second pass lays out again with every font and image in place */
  const [pass, setPass] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const pendingShow = useRef<((info: SceneInfo) => void) | null>(null)
  const currentInfo = useRef<{ transparent: boolean; size: { width: number; height: number }; polaroid?: SceneLayout['polaroid'] } | null>(null)

  useEffect(() => {
    document.documentElement.classList.add('render-mode')
    const jobId = window.location.pathname.split('/')[2] ?? ''
    const token = new URLSearchParams(window.location.search).get('token') ?? ''
    window.__RENDER__ = { ready: false, show: () => Promise.reject(new Error('not ready')) }
    fetch(`/internal/render/${encodeURIComponent(jobId)}?token=${encodeURIComponent(token)}`, { credentials: 'omit' })
      .then((r) => {
        if (!r.ok) throw new Error(`render data: HTTP ${r.status}`)
        return r.json() as Promise<Payload>
      })
      .then(async (data) => {
        const album = getTheme(data.album.themeId)
        const ids = data.scenes.map((s) => s.themeId ?? null).concat(Object.values(data.pages ?? {}).map((p) => p.themeId))
        const used = themesInUse(ids, album)
        await Promise.all(used.map(loadThemeFonts))
        // @font-face files load only when text uses them; load them NOW, so the first layout already has the real fonts
        // (a clamped caption laid out with a fallback font keeps its ellipsis in the wrong place)
        const families = new Set<string>(['Cormorant Garamond', 'Cinzel', 'Caveat'])
        for (const t of used) for (const f of [t.fonts.hand, t.fonts.display, t.fonts.headings]) if (f) families.add(firstFamily(f))
        const sample = 'Aa İıĞğÜüŞşÖöÇç 0123'
        await Promise.all([...families].flatMap((fam) => ['400', '500', '600', 'italic 400'].map((w) =>
          document.fonts.load(`${w} 48px "${fam}"`, sample).catch(() => []))))
        setPayload(data)
      })
      .catch((e: Error) => {
        window.__RENDER__ = { ready: false, error: e.message, show: () => Promise.reject(e) }
      })
  }, [])

  useEffect(() => {
    if (!payload) return
    window.__RENDER__ = {
      ready: true,
      // colour of the video windows for the next screenshot (see .polaroid__window)
      key: async (colour: string) => {
        document.documentElement.style.setProperty('--window-key', colour)
        await nextFrame()
        await nextFrame()
      },
      show: (i: number) => new Promise<SceneInfo>((resolve) => {
        pendingShow.current = resolve
        setPass(0)
        setIndex(i)
      }),
    }
  }, [payload])

  useLayoutEffect(() => {
    const resolve = pendingShow.current
    const root = rootRef.current
    if (!resolve || !root || index < 0) return
    if (pass === 0) {
      void settle(root).then(() => setPass(1))
      return
    }
    pendingShow.current = null
    void settle(root).then(() => {
      const c = currentInfo.current
      resolve(measure(root, c?.transparent ?? false, c?.size ?? { width: 1080, height: 1920 }, c?.polaroid))
    })
  }, [index, pass])

  const scene = payload && index >= 0 ? payload.scenes[index] : null
  const albumTheme = useMemo(() => getTheme(payload?.album.themeId), [payload])
  const motion = useMemo(() => new Set(scene?.motion && scene.mediaId ? [scene.mediaId] : []), [scene])
  const mediaById = useMemo(() => new Map(Object.entries(payload?.media ?? {})), [payload])
  const aspects = useMemo(() => {
    const out: Record<string, number> = {}
    for (const [id, m] of Object.entries(payload?.media ?? {})) if (m.width && m.height) out[id] = m.width / m.height
    return out
  }, [payload])

  let content: ReactNode = null
  if (payload && scene) {
    const r = drawScene(payload, scene, albumTheme, mediaById, aspects)
    currentInfo.current = { transparent: r.transparent, size: r.size, polaroid: r.polaroid }
    content = r.node
  }

  return (
    <RenderModeContext.Provider value={{ active: true, motion }}>
      <ThemeContext.Provider value={albumTheme}>
        <div ref={rootRef} className="render-root" style={themeVars(albumTheme)} key={`${index}:${pass}`}>
          {content}
        </div>
      </ThemeContext.Provider>
    </RenderModeContext.Provider>
  )
}

function drawScene(payload: Payload, scene: Scene, albumTheme: ReturnType<typeof getTheme>, mediaById: Map<string, MediaDto>,
  aspects: Record<string, number>): { node: ReactNode; size: { width: number; height: number }; transparent: boolean; polaroid?: SceneLayout['polaroid'] } {
  const mark = payload.watermark
  const sceneTheme = getTheme(scene.themeId ?? albumTheme.id)
  const ink = sceneTheme.swatches[(scene.swatch as 'light') ?? 'light']?.ink ?? sceneTheme.swatches.light.ink
  const asLayout = (l: SceneLayout): PageLayout => ({ pageIndex: 0, items: l.items, themeId: sceneTheme.id, swatch: scene.swatch ?? null, paper: scene.paper ?? null })
  const common = { mediaById, aspects, scale: 1, metrics: EXPORT_METRICS, side: 'flat' as const, interactive: false }

  switch (scene.kind) {
    case 'polaroid':
    case 'sticker': {
      const l = scene.kind === 'polaroid'
        ? polaroidLayout(scene.mediaId!, aspects[scene.mediaId!], scene.background ?? 'transparent')
        : stickerLayout(scene.mediaId!, aspects[scene.mediaId!])
      const bare = scene.kind === 'sticker' || scene.background !== 'page'
      const size = { width: l.width, height: l.height }
      return {
        size, transparent: bare, polaroid: l.polaroid,
        node: (
          <div className="render-scene" style={size}>
            <PageCanvas layout={asLayout(l)} {...common} size={size} bare={bare} />
            <PolaroidMark text={mark} p={l.polaroid} ink={sceneTheme.swatches.light.ink} />
          </div>
        ),
      }
    }
    case 'story': {
      const l = storyLayout(scene.mediaId!, aspects[scene.mediaId!], scene.format ?? 'story', themeDecor(sceneTheme))
      const size = { width: l.width, height: l.height }
      const bottom = scene.format === 'story' ? STORY.safeBottom + 24 : 36
      return {
        size, transparent: false, polaroid: l.polaroid,
        node: (
          <div className="render-scene" style={size}>
            <PageCanvas layout={asLayout(l)} {...common} size={size} />
            <Watermark text={mark} style={{ right: 48, bottom, color: ink, fontSize: 28 }} />
          </div>
        ),
      }
    }
    case 'page': {
      const page = payload.pages?.[scene.pageId!]
      const scale = carouselPageScale()
      const pageTheme = getTheme(page?.themeId)
      const layout = page ? layoutPage(page, aspects, toMetrics(scale, false), themeDecor(pageTheme)) : null
      const size = { width: CAROUSEL.width, height: CAROUSEL.height }
      return {
        size, transparent: false,
        node: (
          <div className="render-scene render-scene--cover book__cover" style={{ ...size, '--cover-color': albumTheme.cover.color, '--cover-pad': '0px' } as CSSProperties}>
            <div className="render-scene__page">
              <PageCanvas layout={layout} mediaById={mediaById} aspects={aspects} scale={scale} metrics={toMetrics(scale, false)} side="single"
                interactive={false} pageNumber={scene.pageNumber} />
            </div>
            <Watermark text={mark} style={{ right: 26, bottom: 18, color: albumTheme.cover.ink, fontSize: 22 }} />
          </div>
        ),
      }
    }
    case 'cover':
    case 'closing': {
      const size = scene.format === 'post' ? { width: CAROUSEL.width, height: CAROUSEL.height } : { width: STORY.width, height: STORY.height }
      const cover = payload.album.coverMediaId ? mediaById.get(payload.album.coverMediaId) : undefined
      const still = cover ? coverSource(cover) : null
      const big = cover?.displayUrl && cover.type === 'IMAGE' ? { kind: 'image' as const, src: cover.displayUrl } : still
      const ornament = assetUrl(albumTheme.id, albumTheme.cover.ornament)
      const created = payload.album.createdAt ?? new Date().toISOString()
      return {
        size, transparent: false,
        node: (
          <div className="render-scene render-scene--plain page" data-page-theme={albumTheme.id} style={{ ...size, ...pageVars(albumTheme, 'light', 'textured') }}>
            {scene.kind === 'cover' ? (
              <div className="render-cover" style={{ transform: `translate(-50%, -50%) scale(${size.width * 0.66 / 300})` }}>
                <CoverFace theme={albumTheme} title={payload.album.title} createdAt={created} still={big} eager />
              </div>
            ) : (
              <div className="render-closing">
                {ornament && <img src={ornament} alt="" />}
                <h1>{payload.album.title}</h1>
                {mark && <p>{mark}</p>}
              </div>
            )}
            {scene.kind === 'cover' && (
              <Watermark text={mark} style={{ right: 48, bottom: scene.format === 'story' ? STORY.safeBottom + 24 : 36, color: albumTheme.swatches.light.ink, fontSize: 28 }} />
            )}
          </div>
        ),
      }
    }
  }
}
