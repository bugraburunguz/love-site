'use strict';

/* ============================================================
   CONFIG
   ============================================================ */
const CFG = {
  colors: {
    petalWhite : '#fff8fb',
    petalPink  : '#ffd6e7',
    petalGlow  : 'rgba(255,200,220,0.95)',
    center     : '#ffd700',
    centerEdge : '#ffb300',
    stem       : '#4caf50',
    heartA     : '#ff1744',
    heartB     : '#ff4d6d',
    heartC     : '#ff8fab',
    heartGlow  : 'rgba(255,77,109,0.85)',
    particle   : '#ff9fc1',
    confetti   : ['#ff6b9d','#ff4d6d','#ffb3c6','#ffffff','#ffd700','#ff9fc1','#ffcce7','#c77dff'],
  },

  daisy: {
    numPetals  : 12,
    petalLen   : 58,
    petalW     : 24,
    centerR    : 24,
    stemH      : 120,
    stemW      : 6,
  },

  heart: {
    size           : 78,   // half-unit scale (pixels)
    pulseAmp       : 0.07,
    pulseHz        : 1.15,
    glowRadius     : 28,
  },

  transform: {
    particleCount  : 210,
    scatterMs      : 1500,
    convergeMs     : 1900,
  },

  bg: { count: 55 },

  buttons: {
    yesGrow    : 1.15,
    yesMax     : 3.1,
    noShrink   : 0.86,
    noMinScale : 0.22,
    noDissolve : 10,   // vanishes after this many clicks
    dodgePx    : 130,  // desktop cursor dodge radius
  },

  noTexts: [
    'Hayır',
    'Emin misin?',
    'Bence tekrar düşün 😢',
    'Bak üzülüyorum',
    'Son kararın mı?',
    'Basma bence…',
    'Gerçekten mi?',
    'Kalbimi kırıyorsun',
    'Son şansın',
    'Tamam küscem',
  ],
};

/* ============================================================
   EASING UTILITIES
   ============================================================ */
const ease = {
  inOutCubic : t => t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2,
  outCubic   : t => 1 - Math.pow(1-t, 3),
  inCubic    : t => t*t*t,
  outBack    : t => { const c = 1.70158+1; return 1 + c*Math.pow(t-1,3) + (c-1)*Math.pow(t-1,2); },
  outElastic : t => {
    if (t===0||t===1) return t;
    return Math.pow(2,-10*t)*Math.sin((t*10-0.75)*(2*Math.PI/3))+1;
  },
  inOutExpo  : t => {
    if (t===0||t===1) return t;
    return t<.5 ? Math.pow(2,20*t-10)/2 : (2-Math.pow(2,-20*t+10))/2;
  },
};

const lerp   = (a, b, t) => a + (b - a) * t;
const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand   = (lo, hi) => lo + Math.random()*(hi-lo);
const delay  = ms => new Promise(r => setTimeout(r, ms));

/* ============================================================
   STATE
   ============================================================ */
const S = {
  phase      : 'loading',   // loading|daisy|transform|heart|question|finale|final
  noCount    : 0,
  yesScale   : 1,
  noScale    : 1,
  noFixed    : false,       // has the no-btn escaped to position:fixed?
  noX        : 0,
  noY        : 0,
  rafIds     : {},          // named RAF handles
  bgParts    : [],
  txParts    : [],          // transform particles
  fireworks  : [],
  risingHearts: [],
  confetti   : [],
  heartT     : 0,           // heart pulse time accumulator
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

/* ============================================================
   CANVAS MANAGEMENT
   ============================================================ */
let bgCvs, bgCtx, mainCvs, mainCtx, fxCvs, fxCtx;
const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

function setupCanvas(canvas, ctx_ref) {
  const dpr = DPR();
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function resizeAll() {
  bgCtx   = setupCanvas(bgCvs,   bgCtx);
  mainCtx = setupCanvas(mainCvs, mainCtx);
  fxCtx   = setupCanvas(fxCvs,   fxCtx);
}

/* ============================================================
   BACKGROUND — BOKEH PARTICLES
   ============================================================ */
const Background = {
  init() {
    S.bgParts = [];
    const { innerWidth: W, innerHeight: H } = window;
    for (let i = 0; i < CFG.bg.count; i++) {
      S.bgParts.push({
        x      : rand(0, W),
        y      : rand(0, H),
        r      : rand(2, 8),
        opacity: rand(0.03, 0.13),
        vx     : rand(-0.25, 0.25),
        vy     : rand(-0.25, 0.25),
        phase  : rand(0, Math.PI * 2),
        speed  : rand(0.008, 0.022),
      });
    }
  },

  tick() {
    const { innerWidth: W, innerHeight: H } = window;
    bgCtx.clearRect(0, 0, W, H);

    for (const p of S.bgParts) {
      p.x += p.vx; p.y += p.vy; p.phase += p.speed;
      if (p.x < -p.r*2)   p.x = W + p.r;
      if (p.x > W + p.r*2) p.x = -p.r;
      if (p.y < -p.r*2)   p.y = H + p.r;
      if (p.y > H + p.r*2) p.y = -p.r;

      const alpha = p.opacity * (0.65 + 0.35 * Math.sin(p.phase));
      const g = bgCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2);
      g.addColorStop(0, `rgba(255,183,204,${alpha})`);
      g.addColorStop(1, `rgba(255,183,204,0)`);
      bgCtx.beginPath();
      bgCtx.arc(p.x, p.y, p.r * 2, 0, Math.PI*2);
      bgCtx.fillStyle = g;
      bgCtx.fill();
    }
    S.rafIds.bg = requestAnimationFrame(() => Background.tick());
  },

  start() { this.init(); this.tick(); },
  stop()  { cancelAnimationFrame(S.rafIds.bg); },
};

/* ============================================================
   DAISY SCENE — drawn on mainCanvas
   ============================================================ */
const Daisy = {
  // Returns Promise that resolves when all petals are open + brief hold
  animate() {
    return new Promise(resolve => {
      const W = window.innerWidth, H = window.innerHeight;
      const cx = W / 2;
      const cy = H / 2 - 30;
      const d  = CFG.daisy;

      // Timing checkpoints (ms from start)
      const T_SEED_END    = 400;
      const T_STEM_START  = 300;
      const T_STEM_END    = 1800;
      const T_FLOWER_END  = 2400;
      const T_PETAL_START = 2200;
      const T_PETAL_EACH  = 115;  // stagger per petal
      const T_PETAL_DUR   = 420;
      const T_GLOW_DUR    = 360;
      const T_LAST_PETAL  = T_PETAL_START + (d.numPetals-1) * T_PETAL_EACH + T_PETAL_DUR;
      const T_HOLD        = T_LAST_PETAL + 750;

      let start = null;

      const tick = ts => {
        if (!start) start = ts;
        const el = ts - start;
        mainCtx.clearRect(0, 0, W, H);

        // — seed —
        const seedP = clamp(el / T_SEED_END, 0, 1);
        if (seedP > 0) {
          mainCtx.save();
          mainCtx.globalAlpha = ease.outCubic(seedP);
          mainCtx.beginPath();
          mainCtx.ellipse(cx, cy + d.stemH * 0.52, 9, 6, -0.3, 0, Math.PI*2);
          const sg = mainCtx.createRadialGradient(cx, cy + d.stemH*0.52, 0, cx, cy + d.stemH*0.52, 9);
          sg.addColorStop(0, '#fff59d'); sg.addColorStop(1, CFG.colors.centerEdge);
          mainCtx.fillStyle = sg;
          mainCtx.fill();
          mainCtx.restore();
        }

        // — stem —
        if (el > T_STEM_START) {
          const stemP = ease.inOutCubic(clamp((el - T_STEM_START) / (T_STEM_END - T_STEM_START), 0, 1));
          const baseY = cy + d.stemH * 0.52;
          const topY  = baseY - d.stemH * stemP;
          mainCtx.save();
          mainCtx.strokeStyle = CFG.colors.stem;
          mainCtx.lineWidth   = d.stemW;
          mainCtx.lineCap     = 'round';
          mainCtx.beginPath();
          mainCtx.moveTo(cx, baseY);
          mainCtx.quadraticCurveTo(
            cx + Math.sin(stemP * Math.PI) * 9, baseY - d.stemH * stemP * 0.5,
            cx, topY
          );
          mainCtx.stroke();
          mainCtx.restore();
        }

        // — flower head + petals —
        if (el > T_PETAL_START - 200) {
          const flowerP = ease.outBack(clamp((el - (T_PETAL_START - 200)) / 500, 0, 1));
          const topY    = cy - d.stemH * 0.48;

          mainCtx.save();
          mainCtx.translate(cx, topY);

          // petals (behind center)
          for (let i = 0; i < d.numPetals; i++) {
            const pStart = T_PETAL_START + i * T_PETAL_EACH;
            const pP     = ease.outElastic(clamp((el - pStart) / T_PETAL_DUR, 0, 1));
            const gP     = el > pStart
              ? (el < pStart + T_GLOW_DUR
                ? ease.outCubic((el - pStart) / (T_GLOW_DUR * 0.5))
                : ease.outCubic(1 - (el - pStart - T_GLOW_DUR*0.5) / (T_GLOW_DUR*0.5)))
              : 0;

            if (pP <= 0) continue;
            const angle = (i / d.numPetals) * Math.PI * 2 - Math.PI / 2;

            mainCtx.save();
            mainCtx.rotate(angle);
            mainCtx.scale(pP * flowerP, pP * flowerP);

            if (gP > 0.01) {
              mainCtx.shadowBlur  = 20 * gP;
              mainCtx.shadowColor = CFG.colors.petalGlow;
            }

            const hw = d.petalW / 2;
            mainCtx.beginPath();
            mainCtx.moveTo(0, 0);
            mainCtx.bezierCurveTo(-hw, -d.petalLen*0.26, -hw*1.15, -d.petalLen*0.66, 0, -d.petalLen);
            mainCtx.bezierCurveTo( hw*1.15, -d.petalLen*0.66,  hw, -d.petalLen*0.26, 0, 0);

            const pg = mainCtx.createLinearGradient(0, 0, 0, -d.petalLen);
            pg.addColorStop(0,   'rgba(255,255,255,0.96)');
            pg.addColorStop(0.35, CFG.colors.petalWhite);
            pg.addColorStop(1,    CFG.colors.petalPink);
            mainCtx.fillStyle = pg;
            mainCtx.fill();
            mainCtx.restore();
          }

          // center circle
          mainCtx.shadowBlur  = 10;
          mainCtx.shadowColor = 'rgba(255,220,0,0.6)';
          mainCtx.beginPath();
          mainCtx.arc(0, 0, d.centerR * flowerP, 0, Math.PI*2);
          const cg = mainCtx.createRadialGradient(0,-4,0,0,0,d.centerR);
          cg.addColorStop(0, '#fff9c4'); cg.addColorStop(0.5, CFG.colors.center); cg.addColorStop(1, CFG.colors.centerEdge);
          mainCtx.fillStyle = cg;
          mainCtx.fill();
          mainCtx.restore();
        }

        if (el >= T_HOLD) { resolve({ cx, cy }); return; }
        S.rafIds.daisy = requestAnimationFrame(tick);
      };

      S.rafIds.daisy = requestAnimationFrame(tick);
    });
  },
};

/* ============================================================
   HEART UTILS
   ============================================================ */
function heartPoint(t, scale) {
  const x =  16 * Math.pow(Math.sin(t), 3) * scale;
  const y = -(13*Math.cos(t) - 5*Math.cos(2*t) - 2*Math.cos(3*t) - Math.cos(4*t)) * scale;
  return { x, y };
}

function traceHeart(ctx, scale) {
  for (let i = 0; i <= 120; i++) {
    const t = (i/120) * Math.PI * 2;
    const p = heartPoint(t, scale);
    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

/* ============================================================
   TRANSFORM SCENE — petals → heart particles
   ============================================================ */
const Transform = {
  animate(origin) {
    return new Promise(resolve => {
      const W = window.innerWidth, H = window.innerHeight;
      const { cx, cy } = origin;
      const topY = cy - CFG.daisy.stemH * 0.48;
      const hScale = CFG.heart.size / 16;
      const { particleCount, scatterMs, convergeMs } = CFG.transform;
      const d = CFG.daisy;

      // Build heart target grid
      const targets = [];
      for (let i = 0; i < particleCount; i++) {
        const t = (i / particleCount) * Math.PI * 2;
        const p = heartPoint(t, hScale);
        targets.push({ x: cx + p.x, y: topY + p.y });
      }

      // Build particles (sourced from petal positions)
      const parts = [];
      const perPetal = Math.floor(particleCount / d.numPetals);

      for (let pi = 0; pi < d.numPetals; pi++) {
        const angle  = (pi / d.numPetals) * Math.PI * 2 - Math.PI / 2;
        const px     = cx   + Math.cos(angle) * d.petalLen * 0.75;
        const py     = topY + Math.sin(angle) * d.petalLen * 0.75;
        const spiralR = Math.hypot(px - cx, py - topY);
        const spiralA = Math.atan2(py - topY, px - cx);

        for (let j = 0; j < perPetal; j++) {
          const jitter = d.petalLen * 0.3;
          const sx = px + rand(-jitter, jitter) * 0.4;
          const sy = py + rand(-jitter, jitter) * 0.4;
          const ti = (pi * perPetal + j) % particleCount;

          // mid-scatter position: spiral outward then freeze
          const scatterAngle = spiralA + rand(-0.4, 0.4);
          const scatterDist  = spiralR + rand(20, 80);
          const mx = cx   + Math.cos(scatterAngle) * scatterDist;
          const my = topY + Math.sin(scatterAngle) * scatterDist * 0.85;

          parts.push({
            sx, sy, mx, my,
            tx: targets[ti].x,
            ty: targets[ti].y,
            size: rand(1.8, 3.5),
          });
        }
      }

      let start = null;
      const totalMs = scatterMs + convergeMs;

      const tick = ts => {
        if (!start) start = ts;
        const el  = ts - start;
        const t01 = clamp(el / totalMs, 0, 1);
        mainCtx.clearRect(0, 0, W, H);

        for (const p of parts) {
          let x, y, alpha;

          if (el <= scatterMs) {
            const t = ease.inOutCubic(el / scatterMs);
            x = lerp(p.sx, p.mx, t);
            y = lerp(p.sy, p.my, t);
            alpha = 0.7 + 0.3 * t;
          } else {
            const t = ease.inOutExpo((el - scatterMs) / convergeMs);
            x = lerp(p.mx, p.tx, t);
            y = lerp(p.my, p.ty, t);
            alpha = 0.55 + 0.45 * t;
            // colorize toward heart red
            mainCtx.shadowBlur  = t > 0.6 ? 6 * t : 0;
            mainCtx.shadowColor = CFG.colors.heartGlow;
          }

          const tGlobal = clamp((el - scatterMs) / convergeMs, 0, 1);
          const r = Math.round(lerp(255, 255, tGlobal));
          const g = Math.round(lerp(214, 30,  tGlobal));
          const b = Math.round(lerp(220, 70,  tGlobal));

          mainCtx.globalAlpha = alpha;
          mainCtx.beginPath();
          mainCtx.arc(x, y, p.size, 0, Math.PI*2);
          mainCtx.fillStyle = `rgb(${r},${g},${b})`;
          mainCtx.fill();
          mainCtx.shadowBlur = 0;
        }

        mainCtx.globalAlpha = 1;

        if (el >= totalMs) { resolve(); return; }
        S.rafIds.transform = requestAnimationFrame(tick);
      };

      S.rafIds.transform = requestAnimationFrame(tick);
    });
  },
};

/* ============================================================
   HEART SCENE — beating heart on mainCanvas
   ============================================================ */
const Heart = {
  cx: 0,
  cy: 0,

  drawAt(scale, glowMul) {
    const { cx, cy } = this;
    const W = window.innerWidth, H = window.innerHeight;
    mainCtx.clearRect(0, 0, W, H);
    mainCtx.save();
    mainCtx.translate(cx, cy);

    const s = (CFG.heart.size / 16) * scale;

    // outer bloom
    for (let layer = 3; layer >= 1; layer--) {
      mainCtx.shadowBlur  = CFG.heart.glowRadius * layer * 0.6 * glowMul;
      mainCtx.shadowColor = `rgba(255,77,109,${0.22 * glowMul / layer})`;
      mainCtx.beginPath();
      traceHeart(mainCtx, s * (1 + layer * 0.04));
      mainCtx.fillStyle = `rgba(255,30,80,${0.08 / layer})`;
      mainCtx.fill();
    }

    // main fill
    mainCtx.shadowBlur  = CFG.heart.glowRadius * glowMul;
    mainCtx.shadowColor = CFG.colors.heartGlow;
    mainCtx.beginPath();
    traceHeart(mainCtx, s);

    const hg = mainCtx.createRadialGradient(0, -s*3, 0, 0, s*2, s*16);
    hg.addColorStop(0,   CFG.colors.heartC);
    hg.addColorStop(0.4, CFG.colors.heartB);
    hg.addColorStop(1,   CFG.colors.heartA);
    mainCtx.fillStyle = hg;
    mainCtx.fill();
    mainCtx.restore();
  },

  start(origin) {
    this.cx = origin.cx;
    this.cy = origin.cy - CFG.daisy.stemH * 0.48;
    let start = null;

    const tick = ts => {
      if (S.phase !== 'heart' && S.phase !== 'question') return;
      if (!start) start = ts;
      const el = ts - start;
      S.heartT = el;

      const appear  = ease.outBack(clamp(el / 900, 0, 1));
      const pulse   = 1 + CFG.heart.pulseAmp * Math.sin((el / 1000) * CFG.heart.pulseHz * Math.PI * 2);
      const glowMul = appear * (0.7 + 0.3 * Math.sin((el / 1000) * CFG.heart.pulseHz * Math.PI * 2));

      this.drawAt(appear * pulse, glowMul);
      S.rafIds.heart = requestAnimationFrame(tick);
    };

    S.rafIds.heart = requestAnimationFrame(tick);
  },
};

/* ============================================================
   TEXT REVEAL
   ============================================================ */
const TextReveal = {
  reveal(text, el) {
    el.innerHTML = '';
    const chars = [...text];
    chars.forEach(ch => {
      const span = document.createElement('span');
      span.className = 'char' + (ch === ' ' ? ' space' : '');
      span.textContent = ch === ' ' ? ' ' : ch;
      el.appendChild(span);
    });

    const spans = el.querySelectorAll('.char');
    spans.forEach((s, i) => {
      setTimeout(() => s.classList.add('revealed'), i * 65 + 80);
    });
    return spans.length * 65 + 80 + 400;
  },
};

/* ============================================================
   BUTTON CONTROLLER
   ============================================================ */
const Buttons = {
  yesEl : null,
  noEl  : null,
  noBtnText: null,

  init(yesEl, noEl) {
    this.yesEl   = yesEl;
    this.noEl    = noEl;
    this.noBtnText = noEl.querySelector('.btn__text');
  },

  onYes() {
    S.phase = 'finale';
    document.getElementById('questionPanel').style.pointerEvents = 'none';
    gsap.to(document.getElementById('questionPanel'), { opacity: 0, duration: 0.4 });
    Finale.start();
  },

  onNo() {
    S.noCount++;
    const { noCount } = S;
    const texts = CFG.noTexts;

    // Update text
    if (noCount < texts.length) this.noBtnText.textContent = texts[noCount];

    // Grow yes button
    S.yesScale = Math.min(CFG.buttons.yesMax, S.yesScale * CFG.buttons.yesGrow);
    this.applyYesScale(true);

    // Shrink no button
    S.noScale = Math.max(CFG.buttons.noMinScale, S.noScale * CFG.buttons.noShrink);

    // Add shake
    this.noEl.classList.remove('shaking');
    void this.noEl.offsetWidth; // reflow to restart animation
    this.noEl.classList.add('shaking');

    if (noCount >= CFG.buttons.noDissolve) {
      this.dissolveNo();
      return;
    }

    // Escape to fixed after 2nd click
    if (noCount === 2) this.makeNoEscape();

    if (S.noFixed) {
      this.jumpNo();
    } else {
      this.noEl.style.transform = `scale(${S.noScale})`;
      this.noEl.style.opacity   = Math.max(0.35, 1 - noCount * 0.07);
    }
  },

  applyYesScale(animate) {
    const el = this.yesEl;
    if (animate && typeof gsap !== 'undefined') {
      gsap.to(el, {
        scale   : S.yesScale,
        duration: 0.5,
        ease    : 'elastic.out(1.1, 0.5)',
      });
    } else {
      el.style.transform = `scale(${S.yesScale})`;
    }
  },

  makeNoEscape() {
    if (S.noFixed) return; // Desktop: already handled by initHoverDodge
    const el   = this.noEl;
    const rect = el.getBoundingClientRect();
    S.noX = rect.left;
    S.noY = rect.top;
    el.classList.add('escaped');
    el.style.left      = S.noX + 'px';
    el.style.top       = S.noY + 'px';
    el.style.transform = `scale(${S.noScale})`;
    S.noFixed = true;
    // Mobile: no mousemove listener — tap-to-jump is enough
  },

  // Called once from showButtons(). Non-touch devices get instant hover-dodge.
  initHoverDodge(el) {
    // Touch-only devices (phones/tablets) keep the tap-jump flow unchanged
    if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;

    const DODGE_R = CFG.buttons.dodgePx;
    let ready = false; // becomes true once button is position:fixed

    const escapeToFixed = () => {
      const rect = el.getBoundingClientRect();
      S.noX = rect.left;
      S.noY = rect.top;
      el.classList.add('escaped');
      el.style.left = S.noX + 'px';
      el.style.top  = S.noY + 'px';
      // Springy easing gives the button a "alive" feel
      el.style.transition =
        'left 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.22s cubic-bezier(0.34, 1.56, 0.64, 1)';
      S.noFixed = true;
      ready = true;
    };

    document.addEventListener('mousemove', e => {
      if (S.phase !== 'question') return;
      if (el.style.display === 'none') return;

      // Lazy: escape to fixed only once cursor first approaches
      if (!ready) {
        const r    = el.getBoundingClientRect();
        const dist = Math.hypot(e.clientX - (r.left + r.width/2),
                                e.clientY - (r.top  + r.height/2));
        if (dist < DODGE_R * 2.5) escapeToFixed();
        return;
      }

      // Dodge: push button away from cursor, radius grows with noCount
      const r    = el.getBoundingClientRect();
      const cx   = r.left + r.width  / 2;
      const cy   = r.top  + r.height / 2;
      const dx   = e.clientX - cx;
      const dy   = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const zone = DODGE_R + S.noCount * 10;

      if (dist < zone && dist > 0) {
        const push = (zone * 1.9) / dist;
        const nx   = clamp(cx - dx * push - r.width  / 2, 8, window.innerWidth  - r.width  - 8);
        const ny   = clamp(cy - dy * push - r.height / 2, 8, window.innerHeight - r.height - 8);
        S.noX = nx; S.noY = ny;
        el.style.left = nx + 'px';
        el.style.top  = ny + 'px';
      }
    });
  },

  jumpNo() {
    const el  = this.noEl;
    const w   = window.innerWidth, h = window.innerHeight;
    const bw  = el.offsetWidth  * S.noScale + 16;
    const bh  = el.offsetHeight * S.noScale + 16;
    // Stay away from yes button center
    let nx, ny, tries = 0;
    const yRect = this.yesEl.getBoundingClientRect();
    const yCx   = yRect.left + yRect.width/2;
    const yCy   = yRect.top  + yRect.height/2;
    do {
      nx = rand(8, w - bw);
      ny = rand(8, h - bh);
      tries++;
    } while (Math.hypot(nx + bw/2 - yCx, ny + bh/2 - yCy) < 180 && tries < 20);

    S.noX = nx; S.noY = ny;
    el.style.left      = nx + 'px';
    el.style.top       = ny + 'px';
    el.style.transform = `scale(${S.noScale}) rotate(${rand(-15,15)}deg)`;
    el.style.opacity   = Math.max(0.2, 1 - S.noCount * 0.08);
  },

  dissolveNo() {
    const el = this.noEl;
    el.style.pointerEvents = 'none';
    if (typeof gsap !== 'undefined') {
      gsap.to(el, {
        opacity  : 0,
        scale    : 0,
        rotation : 30,
        duration : 0.7,
        ease     : 'power3.in',
        onComplete: () => el.style.display = 'none',
      });
    } else {
      el.style.transition = 'opacity 0.7s, transform 0.7s';
      el.style.opacity    = '0';
      el.style.transform  = 'scale(0) rotate(30deg)';
    }

    // Give yes button spotlight glow
    gsap.to(this.yesEl, {
      boxShadow : '0 0 60px rgba(255,77,109,0.9), 0 0 120px rgba(255,77,109,0.5)',
      duration  : 0.8,
    });
  },
};

/* ============================================================
   FINALE SCENE
   ============================================================ */
const Finale = {
  start() {
    cancelAnimationFrame(S.rafIds.heart);
    mainCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    this.launchFireworks();
    this.spawnRisingHearts();
    this.spawnConfetti();
    this.tick();

    // Camera shake
    this.cameraShake(8, 600);

    // Show final message after 2.8s
    setTimeout(() => this.showFinalMessage(), 2800);
  },

  launchFireworks() {
    S.fireworks = [];
    const W = window.innerWidth, H = window.innerHeight;
    const cols = ['#ff6b9d','#ff4d6d','#ff1744','#ffb3c6','#ff9fc1','#ffd700','#c77dff'];

    for (let f = 0; f < 10; f++) {
      setTimeout(() => {
        if (S.phase !== 'finale') return;
        const bx = rand(W * 0.15, W * 0.85);
        const by = rand(H * 0.12, H * 0.50);
        const color = cols[Math.floor(Math.random() * cols.length)];
        this.burst(bx, by, color);
      }, f * 260 + rand(0, 120));
    }
  },

  burst(bx, by, color) {
    const count = 64;
    const hScale = rand(3, 6);

    for (let i = 0; i < count; i++) {
      const t     = (i / count) * Math.PI * 2;
      const hp    = heartPoint(t, hScale);
      const len   = Math.hypot(hp.x, hp.y) || 1;
      const speed = rand(2.5, 5.5);
      const trail = Math.random() > 0.45;

      S.fireworks.push({
        x : bx, y : by,
        vx: (hp.x / len) * speed + rand(-0.5, 0.5),
        vy: (hp.y / len) * speed + rand(-0.5, 0.5),
        life: 1,
        decay: 1 / (rand(55, 90)),
        size : rand(2, 4),
        color,
        trail,
        trail_x: bx, trail_y: by,
      });
    }
  },

  spawnRisingHearts() {
    S.risingHearts = [];
    for (let i = 0; i < 30; i++) {
      setTimeout(() => {
        const side = Math.random() > 0.5 ? 'L' : 'R';
        const W = window.innerWidth;
        S.risingHearts.push({
          x      : side === 'L' ? rand(0, W * 0.2) : rand(W * 0.8, W),
          y      : window.innerHeight + 20,
          vx     : rand(-0.6, 0.6),
          vy     : -(rand(1.8, 3.5)),
          size   : rand(10, 28),
          opacity: rand(0.5, 0.9),
          rot    : rand(-0.4, 0.4),
          rotSpd : rand(-0.025, 0.025),
          color  : `hsl(${rand(330,360)},90%,${rand(58,78)}%)`,
        });
      }, i * 110 + rand(0, 80));
    }
  },

  spawnConfetti() {
    S.confetti = [];
    const cols = CFG.colors.confetti;
    for (let i = 0; i < 120; i++) {
      setTimeout(() => {
        S.confetti.push({
          x   : rand(0, window.innerWidth),
          y   : -10,
          vx  : rand(-2, 2),
          vy  : rand(2.5, 5),
          rot : rand(0, Math.PI*2),
          rsp : rand(-0.15, 0.15),
          w   : rand(5, 11),
          h   : rand(3,  6),
          col : cols[Math.floor(Math.random() * cols.length)],
          life: 1,
        });
      }, i * 30 + rand(0, 400));
    }
  },

  tick() {
    const W = window.innerWidth, H = window.innerHeight;
    fxCtx.clearRect(0, 0, W, H);

    // Draw firework particles
    for (let i = S.fireworks.length - 1; i >= 0; i--) {
      const p = S.fireworks[i];
      p.x += p.vx; p.y += p.vy;
      p.vy += 0.12; // gravity
      p.vx *= 0.98; p.vy *= 0.98;
      p.life -= p.decay;

      if (p.life <= 0) { S.fireworks.splice(i, 1); continue; }

      fxCtx.globalAlpha = p.life * p.life;
      fxCtx.shadowBlur  = p.life > 0.6 ? 8 : 0;
      fxCtx.shadowColor = p.color;

      if (p.trail) {
        fxCtx.beginPath();
        fxCtx.moveTo(p.trail_x, p.trail_y);
        fxCtx.lineTo(p.x, p.y);
        fxCtx.strokeStyle = p.color;
        fxCtx.lineWidth   = p.size * 0.6;
        fxCtx.lineCap     = 'round';
        fxCtx.stroke();
        p.trail_x = p.x; p.trail_y = p.y;
      }

      fxCtx.beginPath();
      fxCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI*2);
      fxCtx.fillStyle = p.color;
      fxCtx.fill();
      fxCtx.shadowBlur = 0;
    }

    // Draw rising hearts
    for (let i = S.risingHearts.length - 1; i >= 0; i--) {
      const h = S.risingHearts[i];
      h.x += h.vx; h.y += h.vy; h.rot += h.rotSpd;
      if (h.y < -60) { S.risingHearts.splice(i, 1); continue; }

      fxCtx.save();
      fxCtx.globalAlpha = h.opacity * clamp((-h.y + window.innerHeight) / window.innerHeight, 0, 1);
      fxCtx.translate(h.x, h.y);
      fxCtx.rotate(h.rot);
      fxCtx.beginPath();
      traceHeart(fxCtx, h.size / 16);
      fxCtx.fillStyle = h.color;
      fxCtx.shadowBlur  = 12;
      fxCtx.shadowColor = h.color;
      fxCtx.fill();
      fxCtx.restore();
    }

    // Draw confetti
    for (let i = S.confetti.length - 1; i >= 0; i--) {
      const c = S.confetti[i];
      c.x += c.vx; c.y += c.vy;
      c.rot += c.rsp;
      c.vy += 0.04;

      if (c.y > H + 20) { S.confetti.splice(i, 1); continue; }

      fxCtx.save();
      fxCtx.globalAlpha = 0.85;
      fxCtx.translate(c.x, c.y);
      fxCtx.rotate(c.rot);
      fxCtx.fillStyle = c.col;
      fxCtx.fillRect(-c.w/2, -c.h/2, c.w, c.h);
      fxCtx.restore();
    }

    fxCtx.globalAlpha = 1;

    if (S.phase === 'finale' || S.phase === 'final') {
      S.rafIds.finale = requestAnimationFrame(() => Finale.tick());
    }
  },

  cameraShake(intensity, duration) {
    const el    = document.getElementById('uiOverlay');
    const steps = 20;
    const frames = Array.from({ length: steps + 1 }, (_, i) => {
      const decay = 1 - i / steps;
      return {
        transform: i < steps
          ? `translate(${rand(-1,1)*intensity*decay}px,${rand(-1,1)*intensity*decay}px)`
          : 'translate(0,0)'
      };
    });
    el.animate(frames, { duration, easing: 'linear', fill: 'forwards' });
  },

  async showFinalMessage() {
    S.phase = 'final';

    // Hide question panel
    const qPanel = document.getElementById('questionPanel');
    qPanel.style.display = 'none';

    const panel  = document.getElementById('finalPanel');
    const textEl = document.getElementById('finalText');
    panel.classList.remove('hidden');

    // Build char spans (no CSS-class conflict with TextReveal)
    const msg = 'Biliyordum ❤️';
    textEl.innerHTML = [...msg].map(ch =>
      `<span class="final-char" style="display:inline-block">${ch === ' ' ? '&nbsp;' : ch}</span>`
    ).join('');

    const chars = textEl.querySelectorAll('.final-char');

    if (typeof gsap !== 'undefined') {
      gsap.to(panel,  { opacity: 1, duration: 0.5 });
      gsap.fromTo(chars,
        { opacity: 0, filter: 'blur(14px)', y: 24, scale: 0.75 },
        { opacity: 1, filter: 'blur(0px)',  y: 0,  scale: 1,
          duration: 0.55, stagger: 0.07, ease: 'power3.out', delay: 0.25 }
      );
    } else {
      panel.style.transition = 'opacity 0.5s';
      panel.style.opacity    = '1';
      chars.forEach((c, i) => {
        setTimeout(() => {
          c.style.transition = 'opacity 0.5s, filter 0.5s, transform 0.5s';
          c.style.opacity    = '1';
          c.style.filter     = 'blur(0)';
          c.style.transform  = 'translateY(0) scale(1)';
        }, i * 70 + 200);
      });
    }
  },
};

/* ============================================================
   MAIN ORCHESTRATOR
   ============================================================ */
async function init() {
  // Grab DOM
  bgCvs   = document.getElementById('bgCanvas');
  mainCvs = document.getElementById('mainCanvas');
  fxCvs   = document.getElementById('fxCanvas');
  resizeAll();

  const yesBtn = document.getElementById('yesBtn');
  const noBtn  = document.getElementById('noBtn');
  Buttons.init(yesBtn, noBtn);

  // Start background bokeh
  Background.start();
  window.addEventListener('resize', () => { resizeAll(); Background.init(); });

  // Reduced-motion fast path: skip intro, show question immediately
  if (S.reducedMotion) {
    S.phase = 'question';
    showQuestion();
    return;
  }

  // ---- INTRO SEQUENCE ----

  // 1. Fade in
  document.body.style.opacity = '0';
  document.body.style.transition = 'opacity 1s ease';
  await delay(30);
  document.body.style.opacity = '1';

  await delay(900);

  // 2. Daisy animation
  S.phase = 'daisy';
  const origin = await Daisy.animate();

  // 3. Transform to heart
  S.phase = 'transform';
  await Transform.animate(origin);

  // 4. Beat heart
  S.phase = 'heart';
  Heart.start(origin);

  await delay(1000);

  // 5. Show question panel + text
  S.phase = 'question';
  showQuestion();
}

async function showQuestion() {
  const panel = document.getElementById('questionPanel');
  const textEl = document.getElementById('questionText');

  // Position panel just below the heart (or centered in reduced-motion mode)
  const H = window.innerHeight;
  if (S.reducedMotion) {
    panel.style.top       = '50%';
    panel.style.transform = 'translateX(-50%) translateY(-10%)';
  } else {
    const heartCenterY = H / 2 - 30 - CFG.daisy.stemH * 0.48;
    const heartBottom  = heartCenterY + CFG.heart.size * 1.25;
    panel.style.top = Math.round(heartBottom + 28) + 'px';
  }

  panel.classList.add('visible');

  if (typeof gsap !== 'undefined') {
    gsap.fromTo(panel,
      { opacity: 0, y: 14 },
      {
        opacity  : 1, y: 0, duration: 0.7, ease: 'power2.out',
        // Clear the transform so position:fixed children anchor to viewport, not this panel
        onComplete: () => gsap.set(panel, { clearProps: 'transform,y' }),
      }
    );
  } else {
    panel.style.transition = 'opacity 0.7s';
    panel.style.opacity    = '1';
  }

  const revealTime = TextReveal.reveal('Benimle çıkar mısın?', textEl);

  await delay(revealTime + 200);
  showButtons();
}

function showButtons() {
  const area   = document.getElementById('buttonsArea');
  const yesBtn = document.getElementById('yesBtn');
  const noBtn  = document.getElementById('noBtn');

  if (typeof gsap !== 'undefined') {
    gsap.fromTo([yesBtn, noBtn],
      { opacity: 0, y: 18, scale: 0.85 },
      { opacity: 1, y: 0,  scale: 1, duration: 0.55, stagger: 0.1, ease: 'back.out(1.4)' }
    );
  } else {
    [yesBtn, noBtn].forEach((b, i) => {
      b.style.transition = `opacity 0.5s ${i*0.1}s, transform 0.5s ${i*0.1}s`;
      b.style.opacity    = '1';
      b.style.transform  = 'scale(1)';
    });
  }

  // Wire up button events
  yesBtn.addEventListener('click', () => Buttons.onYes());
  noBtn.addEventListener('click',  () => Buttons.onNo());

  // Desktop hover-dodge (no-op on touch devices)
  Buttons.initHoverDodge(noBtn);

  // Ripple on click
  [yesBtn, noBtn].forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      const r = btn.querySelector('.btn__ripple');
      const rect = btn.getBoundingClientRect();
      const rx = e.clientX - rect.left;
      const ry = e.clientY - rect.top;
      const size = Math.max(rect.width, rect.height) * 2;
      r.style.cssText = `width:${size}px;height:${size}px;left:${rx}px;top:${ry}px;opacity:0.5;transition:transform 0.5s ease,opacity 0.5s ease;transform:translate(-50%,-50%) scale(0)`;
      void r.offsetWidth;
      r.style.transform = 'translate(-50%,-50%) scale(1)';
      r.style.opacity   = '0';
    });
  });
}

/* ============================================================
   BOOT
   ============================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
