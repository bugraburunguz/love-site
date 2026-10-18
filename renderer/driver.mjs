// Render driver of the export worker.
//
// The Java worker starts this once (`node driver.mjs`) and keeps it running: ONE headless Chromium is launched lazily and
// reused for every export (a fresh browser context per job, closed afterwards). Requests and answers are single JSON lines
// on stdin / stdout; anything else this process prints goes to stderr.
//
//   -> {"id":1,"op":"render","url":"http://127.0.0.1:8099/render/<job>?token=...","dpr":1,"timeoutMs":60000,
//       "scenes":[{"index":0,"out":"/tmp/export-x/scene-0.png"}]}
//   <- {"id":1,"ok":true,"scenes":[{...info the render page returned for scene 0...}]}
//   <- {"id":1,"ok":false,"error":"..."}
//
// The render page (SPA route /render/:jobId) exposes window.__RENDER__ = { ready, error, show(index) }. show() draws one
// scene with the site's own components, waits for fonts and images and returns its size and the screen geometry of every
// video window (transparent holes ffmpeg fills with the moving picture).
//
// `node driver.mjs --selftest` launches Chromium, draws Turkish text and an emoji on a canvas and fails unless the emoji
// comes out in colour (the Docker build runs it).
import { chromium } from 'playwright-core'
import readline from 'node:readline'

let browserPromise = null

function launch() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      // the container runs as an unprivileged user without user namespaces; the pages are our own SPA and bucket images
      chromiumSandbox: false,
      args: ['--disable-gpu', '--disable-dev-shm-usage', '--font-render-hinting=none', '--hide-scrollbars', '--mute-audio'],
    }).then((browser) => {
      browser.on('disconnected', () => { browserPromise = null })
      return browser
    }).catch((e) => {
      browserPromise = null
      throw e
    })
  }
  return browserPromise
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n')
}

async function render(req) {
  const browser = await launch()
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: req.dpr || 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
  })
  try {
    const page = await context.newPage()
    page.setDefaultTimeout(req.timeoutMs || 60000)
    const pageErrors = []
    page.on('pageerror', (e) => pageErrors.push(String(e)))
    page.on('console', (m) => { if (m.type() === 'error') process.stderr.write(`[render page] ${m.text()}\n`) })
    await page.goto(req.url, { waitUntil: 'load' })
    await page.waitForFunction(() => window.__RENDER__ && (window.__RENDER__.ready || window.__RENDER__.error))
    const failure = await page.evaluate(() => window.__RENDER__.error || null)
    if (failure) throw new Error(`render page: ${failure}`)
    const infos = []
    for (const scene of req.scenes) {
      const info = await page.evaluate((i) => window.__RENDER__.show(i), scene.index)
      await page.setViewportSize({ width: Math.ceil(info.width), height: Math.ceil(info.height) })
      // two frames after the resize, so nothing is still being painted
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      const shoot = (path) => page.screenshot({
        path,
        type: 'png',
        omitBackground: !!info.transparent,
        clip: { x: 0, y: 0, width: Math.ceil(info.width), height: Math.ceil(info.height) },
        animations: 'disabled',
        caret: 'hide',
        scale: 'device',
      })
      if (info.videos && info.videos.length > 0) {
        // video windows: once in magenta, once in green; the worker turns the difference into a real alpha channel
        await page.evaluate(() => window.__RENDER__.key('#ff00ff'))
        await shoot(scene.out)
        await page.evaluate(() => window.__RENDER__.key('#00ff00'))
        await shoot(scene.out.replace(/\.png$/, '.key2.png'))
        await page.evaluate(() => window.__RENDER__.key('transparent'))
        info.keyed = true
      } else {
        await shoot(scene.out)
      }
      infos.push(info)
    }
    if (pageErrors.length) process.stderr.write(`[render page] errors: ${pageErrors.join(' | ')}\n`)
    return infos
  } finally {
    await context.close().catch(() => {})
  }
}

async function selftest() {
  const browser = await launch()
  const page = await browser.newPage()
  const result = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 200
    c.height = 80
    const ctx = c.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 200, 80)
    ctx.font = '48px sans-serif'
    ctx.fillStyle = '#000'
    ctx.fillText('ğş😍', 4, 60)
    const data = ctx.getImageData(0, 0, 200, 80).data
    let coloured = 0
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
      if (Math.max(r, g, b) - Math.min(r, g, b) > 80) coloured++
    }
    return { coloured, version: navigator.userAgent }
  })
  await browser.close()
  if (result.coloured < 50) {
    console.error(`SELFTEST FAILED: emoji is not drawn in colour (${result.coloured} coloured pixels)`)
    process.exit(1)
  }
  console.error(`selftest ok: Chromium starts, colour emoji works (${result.coloured} coloured pixels) - ${result.version}`)
  process.exit(0)
}

if (process.argv.includes('--selftest')) {
  await selftest()
} else {
  const lines = readline.createInterface({ input: process.stdin })
  lines.on('line', async (line) => {
    let req
    try {
      req = JSON.parse(line)
    } catch {
      return
    }
    try {
      if (req.op === 'ping') {
        await launch()
        send({ id: req.id, ok: true })
      } else if (req.op === 'render') {
        send({ id: req.id, ok: true, scenes: await render(req) })
      } else {
        send({ id: req.id, ok: false, error: `unknown op ${req.op}` })
      }
    } catch (e) {
      send({ id: req.id, ok: false, error: String(e && e.message ? e.message : e).slice(0, 2000) })
    }
  })
  lines.on('close', async () => {
    if (browserPromise) await (await browserPromise).close().catch(() => {})
    process.exit(0)
  })
}
