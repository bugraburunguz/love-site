import { createRng, type Rng } from '../../layout/prng'
import { MAX_AMBIENT_PARTICLES, type AmbientKind, type AmbientLayer, type BurstKind } from '../../themes/types'

/** Everything that decides whether the ambient animation may run. Pure, so it is easy to test. */
export interface AmbientConditions {
  /** the user's switch in the album header */
  enabled: boolean
  /** prefers-reduced-motion: reduce */
  reduced: boolean
  /** edit mode: the page must stay still while it is being edited */
  editing: boolean
  /** the lightbox covers the book */
  lightboxOpen: boolean
  /** the tab is hidden */
  hidden: boolean
}

export function shouldRunAmbient(c: AmbientConditions): boolean {
  return c.enabled && !c.reduced && !c.editing && !c.lightboxOpen && !c.hidden
}

/** Hover bursts (and the custom cursor and sticker wiggle) share the reduced-motion rule: no motion when it is asked for. */
export function mayBurst(reduced: boolean, editing: boolean, lightboxOpen: boolean): boolean {
  return !reduced && !editing && !lightboxOpen
}

interface Particle {
  kind: AmbientKind
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rot: number
  vrot: number
  phase: number
  sway: number
  color: string
  alpha: number
  /** seconds left for burst particles; Infinity for ambient ones */
  life: number
  maxLife: number
  wait: number
}

const TAU = Math.PI * 2
const MAX_BURST = 24

/** Total particles a theme asks for (the theme tests keep this at 30 or below). */
export function particleBudget(layers: ReadonlyArray<AmbientLayer>): number {
  return layers.reduce((sum, l) => sum + l.count, 0)
}

function makeParticle(kind: AmbientKind, layer: AmbientLayer, w: number, h: number, rng: Rng, initial: boolean): Particle {
  const size = rng.range(layer.size[0], layer.size[1])
  const color = rng.pick(layer.colors)
  const speed = layer.speed
  const base: Particle = {
    kind, x: rng.range(0, w), y: initial ? rng.range(0, h) : -size * 2, vx: 0, vy: 0, size, rot: rng.range(0, TAU), vrot: 0,
    phase: rng.range(0, TAU), sway: rng.range(0.4, 1.2), color, alpha: 1, life: Infinity, maxLife: Infinity, wait: 0,
  }
  switch (kind) {
    case 'petals':
    case 'leaves':
      return { ...base, vx: rng.range(-8, 8) * speed, vy: rng.range(14, 28) * speed, vrot: rng.range(-1.2, 1.2), alpha: 0.8 }
    case 'hearts':
      return { ...base, y: initial ? base.y : h + size, vx: rng.range(-6, 6) * speed, vy: -rng.range(10, 20) * speed, alpha: 0.7 }
    case 'confetti':
      return { ...base, vx: rng.range(-6, 6) * speed, vy: rng.range(18, 34) * speed, vrot: rng.range(-3, 3), alpha: 0.85 }
    case 'snow':
      return { ...base, vx: rng.range(-4, 4) * speed, vy: rng.range(14, 30) * speed, alpha: rng.range(0.55, 0.95) }
    case 'sparkles':
      return { ...base, y: rng.range(0, h), vx: rng.range(-2, 2) * speed, vy: rng.range(-3, 3) * speed, alpha: 0, sway: rng.range(0.6, 1.8) }
    case 'bokeh':
      return { ...base, y: rng.range(0, h), vx: rng.range(-4, 4) * speed, vy: rng.range(-4, -1) * speed, alpha: 0.16, sway: rng.range(0.2, 0.6) }
    case 'clouds':
      return { ...base, y: rng.range(h * 0.05, h * 0.7), x: initial ? rng.range(-size, w) : -size * 2, vx: rng.range(4, 9) * speed, vy: 0, alpha: 0.35 }
    case 'paperPlanes':
      return { ...base, x: initial ? rng.range(0, w) : -size * 2, y: initial ? rng.range(h * 0.2, h) : h * rng.range(0.5, 1), vx: rng.range(24, 40) * speed, vy: -rng.range(8, 16) * speed, rot: -0.35, alpha: 0.9 }
    case 'bats':
      // flies by only now and then: it waits off-screen between flights
      return { ...base, x: -size * 3, y: rng.range(h * 0.1, h * 0.5), vx: rng.range(70, 100) * speed, vy: 0, alpha: 0.85, wait: initial ? rng.range(2, 12) : rng.range(8, 22) }
  }
}

function burstParticles(kind: BurstKind, x: number, y: number, rng: Rng): Particle[] {
  const out: Particle[] = []
  const count = kind === 'bats' ? 3 : 9
  const palette: Record<BurstKind, string[]> = {
    petals: ['#F4C2C2', '#E8A0AE', '#D8A7B1'],
    sparkles: ['#FFF1C4', '#E0A96D', '#FFFFFF'],
    snow: ['#FFFFFF', '#E6F6FF'],
    bats: ['#1A1A1A', '#2A1346'],
  }
  for (let i = 0; i < count; i++) {
    const a = rng.range(0, TAU)
    const v = rng.range(30, kind === 'bats' ? 70 : 110)
    const life = rng.range(0.7, 1.3)
    out.push({
      kind, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'bats' ? 30 : 10), size: kind === 'bats' ? rng.range(10, 14) : rng.range(5, 11),
      rot: rng.range(0, TAU), vrot: rng.range(-4, 4), phase: rng.range(0, TAU), sway: 1, color: rng.pick(palette[kind]), alpha: 1, life, maxLife: life, wait: 0,
    })
  }
  return out
}

function drawParticle(ctx: CanvasRenderingContext2D, p: Particle, t: number) {
  let alpha = p.alpha
  if (p.life !== Infinity) alpha *= Math.max(0, Math.min(1, p.life / p.maxLife))
  if (p.kind === 'sparkles' && p.life === Infinity) alpha = 0.5 + 0.5 * Math.sin(t * p.sway + p.phase)
  if (p.kind === 'bokeh') alpha = p.alpha * (0.6 + 0.4 * Math.sin(t * p.sway + p.phase))
  if (alpha <= 0.01) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(p.x, p.y)
  ctx.rotate(p.rot)
  ctx.fillStyle = p.color
  const s = p.size
  switch (p.kind) {
    case 'petals':
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 0.5, s * 0.28, 0, 0, TAU)
      ctx.fill()
      break
    case 'leaves':
      ctx.beginPath()
      ctx.moveTo(0, -s * 0.7)
      ctx.bezierCurveTo(s * 0.7, -s * 0.2, s * 0.5, s * 0.5, 0, s * 0.7)
      ctx.bezierCurveTo(-s * 0.5, s * 0.5, -s * 0.7, -s * 0.2, 0, -s * 0.7)
      ctx.fill()
      break
    case 'hearts':
      ctx.beginPath()
      ctx.moveTo(0, s * 0.35)
      ctx.bezierCurveTo(-s * 0.9, -s * 0.2, -s * 0.4, -s * 0.8, 0, -s * 0.25)
      ctx.bezierCurveTo(s * 0.4, -s * 0.8, s * 0.9, -s * 0.2, 0, s * 0.35)
      ctx.fill()
      break
    case 'confetti':
      ctx.scale(1, Math.cos(t * 2 + p.phase))
      ctx.fillRect(-s * 0.5, -s * 0.25, s, s * 0.5)
      break
    case 'snow':
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.5, 0, TAU)
      ctx.fill()
      break
    case 'sparkles': {
      const r = s * 0.6
      ctx.beginPath()
      ctx.moveTo(0, -r)
      ctx.quadraticCurveTo(r * 0.12, -r * 0.12, r, 0)
      ctx.quadraticCurveTo(r * 0.12, r * 0.12, 0, r)
      ctx.quadraticCurveTo(-r * 0.12, r * 0.12, -r, 0)
      ctx.quadraticCurveTo(-r * 0.12, -r * 0.12, 0, -r)
      ctx.fill()
      break
    }
    case 'bokeh': {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.5)
      g.addColorStop(0, p.color)
      g.addColorStop(1, 'rgba(255,215,0,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.5, 0, TAU)
      ctx.fill()
      break
    }
    case 'clouds':
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 0.5, s * 0.16, 0, 0, TAU)
      ctx.ellipse(-s * 0.2, -s * 0.08, s * 0.26, s * 0.16, 0, 0, TAU)
      ctx.ellipse(s * 0.16, -s * 0.1, s * 0.22, s * 0.15, 0, 0, TAU)
      ctx.fill()
      break
    case 'paperPlanes':
      ctx.beginPath()
      ctx.moveTo(s * 0.5, 0)
      ctx.lineTo(-s * 0.5, -s * 0.28)
      ctx.lineTo(-s * 0.2, 0)
      ctx.lineTo(-s * 0.5, s * 0.18)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = 'rgba(80,50,30,0.35)'
      ctx.lineWidth = 1
      ctx.stroke()
      break
    case 'bats': {
      const flap = Math.sin(t * 9 + p.phase) * 0.45
      for (const side of [-1, 1]) {
        ctx.save()
        ctx.scale(side, 1)
        ctx.rotate(flap)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(s * 0.4, -s * 0.5, s * 0.9, -s * 0.2)
        ctx.quadraticCurveTo(s * 0.7, 0, s * 0.55, s * 0.1)
        ctx.quadraticCurveTo(s * 0.4, -s * 0.05, s * 0.2, s * 0.12)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
      ctx.beginPath()
      ctx.ellipse(0, 0, s * 0.14, s * 0.2, 0, 0, TAU)
      ctx.fill()
      break
    }
  }
  ctx.restore()
}

/**
 * Draws a theme's ambient particles (at most 30) on one canvas that covers the screen and ignores the pointer. It is
 * started and stopped from outside (see shouldRunAmbient), never runs while the tab is hidden, and is capped at 30 fps.
 */
export class AmbientEngine {
  private readonly ctx: CanvasRenderingContext2D
  private particles: Particle[] = []
  private bursts: Particle[] = []
  private raf = 0
  private last = 0
  private t = 0
  private w = 0
  private h = 0
  private readonly rng: Rng
  private layers: ReadonlyArray<AmbientLayer> = []
  private burstKind: BurstKind | undefined

  constructor(private readonly canvas: HTMLCanvasElement, seed = 'ambient') {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas not supported')
    this.ctx = ctx
    this.rng = createRng(seed)
  }

  configure(layers: ReadonlyArray<AmbientLayer>, burst: BurstKind | undefined) {
    this.layers = layers
    this.burstKind = burst
    this.populate()
  }

  resize(width: number, height: number, dpr: number) {
    this.w = width
    this.h = height
    this.canvas.width = Math.round(width * dpr)
    this.canvas.height = Math.round(height * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.populate()
  }

  private populate() {
    if (!this.w || !this.h) return
    const list: Particle[] = []
    for (const layer of this.layers) {
      for (let i = 0; i < layer.count; i++) list.push(makeParticle(layer.kind, layer, this.w, this.h, this.rng, true))
    }
    this.particles = list.slice(0, MAX_AMBIENT_PARTICLES)
  }

  burst(x: number, y: number) {
    if (!this.burstKind || this.raf === 0) return
    const fresh = burstParticles(this.burstKind, x, y, this.rng)
    this.bursts = [...this.bursts, ...fresh].slice(-MAX_BURST)
  }

  get running(): boolean {
    return this.raf !== 0
  }

  start() {
    if (this.raf) return
    this.last = performance.now()
    const frame = (now: number) => {
      this.raf = requestAnimationFrame(frame)
      if (now - this.last < 33) return // ~30 fps is plenty for slow drifting
      const dt = Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      this.step(dt)
      this.draw()
    }
    this.raf = requestAnimationFrame(frame)
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    this.bursts = []
    this.ctx.clearRect(0, 0, this.w, this.h)
  }

  private step(dt: number) {
    this.t += dt
    const { w, h } = this
    for (const p of this.particles) {
      if (p.kind === 'bats') {
        if (p.wait > 0) {
          p.wait -= dt
          continue
        }
        p.x += p.vx * dt
        p.y += Math.sin(this.t * 2 + p.phase) * 30 * dt
        if (p.x > w + p.size * 3) {
          p.x = -p.size * 3
          p.y = this.rng.range(h * 0.1, h * 0.5)
          p.wait = this.rng.range(8, 22)
        }
        continue
      }
      p.x += (p.vx + Math.sin(this.t * p.sway + p.phase) * 10) * dt
      p.y += p.vy * dt
      p.rot += p.vrot * dt
      if (p.kind === 'paperPlanes') p.rot = Math.atan2(p.vy, p.vx)
      const m = p.size * 2
      if (p.y > h + m) {
        p.y = -m
        p.x = this.rng.range(0, w)
      }
      if (p.y < -m * 2 && p.vy < 0 && p.kind !== 'paperPlanes') {
        p.y = h + m
        p.x = this.rng.range(0, w)
      }
      if (p.kind === 'paperPlanes' && (p.x > w + m || p.y < -m)) {
        p.x = -m
        p.y = this.rng.range(h * 0.4, h)
      }
      if (p.x > w + m) p.x = -m
      if (p.x < -m) p.x = w + m
    }
    for (const b of this.bursts) {
      b.life -= dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.vy += (b.kind === 'snow' ? 30 : 60) * dt * (b.kind === 'bats' ? -0.4 : 1)
      b.vx *= 0.98
      b.rot += b.vrot * dt
    }
    this.bursts = this.bursts.filter((b) => b.life > 0)
  }

  private draw() {
    this.ctx.clearRect(0, 0, this.w, this.h)
    for (const p of this.particles) {
      if (p.kind === 'bats' && p.wait > 0) continue
      drawParticle(this.ctx, p, this.t)
    }
    for (const b of this.bursts) drawParticle(this.ctx, b, this.t)
  }
}
