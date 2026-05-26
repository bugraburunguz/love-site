(function () {
  'use strict';

  /* ── helpers ─────────────────────────────────────────────── */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function c01(v) { return clamp(v, 0, 1); }
  function lerp(a, b, t) { return a + (b - a) * c01(t); }
  function lerpRGB(a, b, t) {
    return [
      Math.round(lerp(a[0], b[0], t)),
      Math.round(lerp(a[1], b[1], t)),
      Math.round(lerp(a[2], b[2], t)),
    ];
  }
  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── canvas ──────────────────────────────────────────────── */
  var canvas = document.getElementById('worldCanvas');
  var ctx    = canvas.getContext('2d', { alpha: false });
  var W = 0, H = 0, dpr = 1;

  /* ── particle systems ────────────────────────────────────── */
  var rain = [], dust = [], petals = [], sunPts = [];
  var webCx = 0, webCy = 0, webR = 0;

  function buildRain() {
    rain = [];
    for (var i = 0; i < 200; i++) {
      rain.push({
        x: rand(0, W), y: rand(-H, H),
        vx: rand(-28, -16), vy: rand(280, 480),
        len: rand(8, 18), a: rand(0.18, 0.45),
      });
    }
  }

  function buildDust() {
    dust = [];
    for (var i = 0; i < 55; i++) {
      dust.push({
        x: rand(0, W), y: rand(0, H),
        vx: rand(-6, 6), vy: rand(-12, -3),
        r: rand(0.7, 1.8), a: rand(0.06, 0.22),
        ph: rand(0, Math.PI * 2),
      });
    }
  }

  function buildPetals() {
    petals = [];
    for (var i = 0; i < 75; i++) {
      petals.push({
        x: rand(0, W), y: rand(-H, 0),
        vx: rand(-25, 25), vy: rand(20, 55),
        rot: rand(0, Math.PI * 2), rv: rand(-1.2, 1.2),
        sz: rand(4, 9), hue: rand(18, 48),
        a: rand(0.45, 0.85), ph: rand(0, Math.PI * 2),
      });
    }
  }

  function buildSunPts() {
    sunPts = [];
    for (var i = 0; i < 110; i++) {
      sunPts.push({
        x: rand(0, W), y: rand(H * 0.5, H * 1.2),
        vx: rand(-12, 12), vy: rand(-35, -12),
        r: rand(0.8, 2.6), a: rand(0.28, 0.62),
        ph: rand(0, Math.PI * 2),
      });
    }
  }

  function buildWeb() {
    webCx = W * 0.09;
    webCy = H * 0.11;
    webR  = Math.min(W, H) * 0.14;
  }

  function rebuildAll() {
    buildRain(); buildDust(); buildPetals(); buildSunPts(); buildWeb();
  }

  /* ── resize ──────────────────────────────────────────────── */
  function resizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildAll();
  }

  /* ── tick helpers ────────────────────────────────────────── */
  function tickRain(dt, intensity) {
    for (var i = 0; i < rain.length; i++) {
      var d = rain[i];
      d.x += d.vx * dt * intensity;
      d.y += d.vy * dt * intensity;
      if (d.y > H + 20) { d.y = rand(-30, 0); d.x = rand(0, W); }
      if (d.x < -10)    d.x = W + 10;
    }
  }

  function tickDust(dt, t) {
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      d.x += (d.vx + Math.sin(t * 0.28 + d.ph) * 0.5) * dt;
      d.y += d.vy * dt;
      if (d.y < -10)    { d.y = H + 10; d.x = rand(0, W); }
      if (d.x < -10)    d.x = W + 10;
      if (d.x > W + 10) d.x = -10;
    }
  }

  function tickPetals(dt, t) {
    for (var i = 0; i < petals.length; i++) {
      var p = petals[i];
      p.x += (p.vx + Math.sin(t * 0.38 + p.ph) * 18) * dt;
      p.y += p.vy * dt;
      p.rot += p.rv * dt;
      if (p.y > H + 20)  { p.y = rand(-40, -10); p.x = rand(0, W); }
      if (p.x < -20)     p.x = W + 20;
      if (p.x > W + 20)  p.x = -20;
    }
  }

  function tickSunPts(dt, t) {
    for (var i = 0; i < sunPts.length; i++) {
      var p = sunPts[i];
      p.x += (p.vx + Math.sin(t * 0.45 + p.ph) * 9) * dt;
      p.y += p.vy * dt;
      if (p.y < -20) { p.y = rand(H * 0.6, H + 20); p.x = rand(0, W); }
    }
  }

  /* ── draw helpers ────────────────────────────────────────── */
  var skyDarkTop = [10,  10,  8];
  var skyDarkBot = [18,  14, 10];
  var skyWarmTop = [90,  38,  6];
  var skyWarmBot = [32,  18,  8];

  function drawSky(p) {
    var t   = c01((p - 0.22) / 0.62);
    var top = lerpRGB(skyDarkTop, skyWarmTop, t);
    var bot = lerpRGB(skyDarkBot, skyWarmBot, t);
    var g   = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgb(' + top + ')');
    g.addColorStop(1, 'rgb(' + bot + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawRain(alpha) {
    if (alpha < 0.01) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(160,180,200,0.55)';
    ctx.lineWidth = 0.7;
    for (var i = 0; i < rain.length; i++) {
      var d = rain[i];
      ctx.globalAlpha = d.a * alpha;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x + d.vx * 0.022, d.y + d.len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDust(alpha) {
    if (alpha < 0.01) return;
    ctx.save();
    ctx.fillStyle = 'rgba(165,158,145,1)';
    for (var i = 0; i < dust.length; i++) {
      var d = dust[i];
      ctx.globalAlpha = d.a * alpha;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawWeb(alpha) {
    if (alpha < 0.01) return;
    var spokes = 8, rings = 5;
    ctx.save();
    ctx.globalAlpha = alpha * 0.38;
    ctx.strokeStyle = 'rgba(165,160,150,1)';
    ctx.lineWidth = 0.5;
    for (var s = 0; s < spokes; s++) {
      var ang = (s / spokes) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(webCx, webCy);
      ctx.lineTo(webCx + Math.cos(ang) * webR, webCy + Math.sin(ang) * webR);
      ctx.stroke();
    }
    for (var r = 1; r <= rings; r++) {
      var rad = (r / rings) * webR;
      ctx.beginPath();
      for (var s2 = 0; s2 <= spokes; s2++) {
        var ang2 = (s2 / spokes) * Math.PI * 2 - Math.PI / 2;
        var x = webCx + Math.cos(ang2) * rad;
        var y = webCy + Math.sin(ang2) * rad;
        if (s2 === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPetals(alpha) {
    if (alpha < 0.01) return;
    ctx.save();
    for (var i = 0; i < petals.length; i++) {
      var p = petals[i];
      ctx.globalAlpha = p.a * alpha;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.beginPath();
      ctx.ellipse(0, -p.sz * 0.55, p.sz * 0.42, p.sz, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'hsl(' + p.hue + ',78%,66%)';
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawRays(alpha, t) {
    if (alpha < 0.01) return;
    var srcX = W * 0.82, srcY = -H * 0.08;
    ctx.save();
    for (var i = 0; i < 12; i++) {
      var baseAng = Math.PI * 0.55 + (i / 12) * Math.PI * 0.65;
      var shimmer = 0.7 + 0.3 * Math.sin(t * 0.85 + i * 1.4);
      var hw      = 0.035 + 0.018 * Math.sin(t * 0.55 + i);
      var len     = H * 2.5;
      var ex      = srcX + Math.cos(baseAng) * len;
      var ey      = srcY + Math.sin(baseAng) * len;
      var grad    = ctx.createLinearGradient(srcX, srcY, ex, ey);
      grad.addColorStop(0,    'rgba(255,200,80,'  + (0.18 * alpha * shimmer) + ')');
      grad.addColorStop(0.35, 'rgba(255,165,45,'  + (0.07 * alpha * shimmer) + ')');
      grad.addColorStop(1,    'rgba(255,130,20,0)');
      ctx.beginPath();
      ctx.moveTo(srcX, srcY);
      ctx.lineTo(srcX + Math.cos(baseAng - hw) * len, srcY + Math.sin(baseAng - hw) * len);
      ctx.lineTo(srcX + Math.cos(baseAng + hw) * len, srcY + Math.sin(baseAng + hw) * len);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.globalAlpha = 1;
      ctx.fill();
    }
    var glow = ctx.createRadialGradient(srcX, srcY, 0, srcX, srcY, H * 0.55);
    glow.addColorStop(0,    'rgba(255,225,100,' + (0.32 * alpha) + ')');
    glow.addColorStop(0.22, 'rgba(255,165,50,'  + (0.14 * alpha) + ')');
    glow.addColorStop(1,    'rgba(255,110,15,0)');
    ctx.beginPath();
    ctx.arc(srcX, srcY, H * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.restore();
  }

  function drawSunPts(alpha) {
    if (alpha < 0.01) return;
    ctx.save();
    ctx.fillStyle = 'rgba(225,170,55,1)';
    for (var i = 0; i < sunPts.length; i++) {
      var p = sunPts[i];
      ctx.globalAlpha = p.a * alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVignette() {
    var g = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.25, W / 2, H * 0.55, H * 0.9);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ── scroll progress ─────────────────────────────────────── */
  var scrollP = 0;
  window.addEventListener('scroll', function () {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    scrollP = max > 0 ? window.scrollY / max : 0;
  }, { passive: true });

  /* ── text sections ───────────────────────────────────────── */
  var el1        = document.getElementById('section1');
  var el2        = document.getElementById('section2');
  var el3        = document.getElementById('section3');
  var scrollHint = document.getElementById('scrollHint');
  var s2in = false, s3in = false;

  function updateText(p) {
    // Section 1: visible from start, fades out
    var op1 = p < 0.25 ? 1 : c01(1 - (p - 0.25) / 0.14);
    el1.style.opacity = op1;

    // Section 2
    var op2 = 0;
    if      (p < 0.30) op2 = 0;
    else if (p < 0.43) op2 = (p - 0.30) / 0.13;
    else if (p < 0.58) op2 = 1;
    else if (p < 0.69) op2 = 1 - (p - 0.58) / 0.11;
    el2.style.opacity = op2;
    if (op2 > 0.08 && !s2in) { s2in = true;  el2.classList.add('in'); }
    if (op2 < 0.04 &&  s2in) { s2in = false; el2.classList.remove('in'); }

    // Section 3
    var op3 = 0;
    if      (p < 0.62) op3 = 0;
    else if (p < 0.75) op3 = (p - 0.62) / 0.13;
    else               op3 = Math.max(0.85, 1 - Math.max(0, p - 0.95) / 0.05);
    el3.style.opacity = op3;
    if (op3 > 0.08 && !s3in) { s3in = true;  el3.classList.add('in'); }
    if (op3 < 0.04 &&  s3in) { s3in = false; el3.classList.remove('in'); }

    if (scrollHint) {
      if (p > 0.04) scrollHint.classList.add('away');
      else if (p < 0.01) scrollHint.classList.remove('away');
    }
  }

  /* ── typewriter ──────────────────────────────────────────── */
  var heroEl      = document.getElementById('heroText');
  var heroLine    = document.getElementById('heroHairline');
  var fullTW      = 'Kalbim uzun zamandır\nkimse yaşamıyormuş gibi\nsessizdi.';
  var twIdx = 0, twDone = false;

  function renderTW(idx, done) {
    var slice = fullTW.slice(0, idx);
    var parts = slice.split('\n');
    while (heroEl.firstChild) heroEl.removeChild(heroEl.firstChild);
    for (var i = 0; i < parts.length; i++) {
      heroEl.appendChild(document.createTextNode(parts[i]));
      if (i < parts.length - 1) heroEl.appendChild(document.createElement('br'));
    }
    if (!done) {
      var cur = document.createElement('span');
      cur.className = 'cursor';
      cur.setAttribute('aria-hidden', 'true');
      heroEl.appendChild(cur);
    }
  }

  function stepTW() {
    if (twDone) return;
    twIdx = Math.min(twIdx + 1, fullTW.length);
    renderTW(twIdx, twIdx >= fullTW.length);
    if (twIdx >= fullTW.length) {
      twDone = true;
      heroLine.style.transition = 'transform 1.3s ease';
      heroLine.style.transform  = 'scaleX(1)';
      return;
    }
    var ch    = fullTW[twIdx - 1];
    var delay = ch === '\n' ? 220 : rand(44, 68);
    setTimeout(stepTW, delay);
  }

  if (reduceMotion) {
    renderTW(fullTW.length, true);
    heroLine.style.transform  = 'scaleX(1)';
    heroLine.style.transition = 'none';
  } else {
    setTimeout(stepTW, 700);
  }

  /* ── RAF loop ────────────────────────────────────────────── */
  var lastTs = 0;

  function loop(ts) {
    requestAnimationFrame(loop);
    var dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    var t  = ts / 1000;
    var p  = scrollP;

    drawSky(p);

    var dark = c01(1 - p / 0.50);
    if (dark > 0.01) {
      tickRain(dt, dark);
      drawRain(dark * 0.85);
      tickDust(dt, t);
      drawDust(dark * 0.65);
      drawWeb(c01(1 - p / 0.45));
    }

    var flower = c01((p - 0.28) / 0.44);
    if (flower > 0.01) {
      tickPetals(dt, t);
      drawPetals(flower);
    }

    var sun = c01((p - 0.58) / 0.38);
    if (sun > 0.01) {
      drawRays(sun, t);
      tickSunPts(dt, t);
      drawSunPts(sun * 0.82);
    }

    drawVignette();
    updateText(p);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  requestAnimationFrame(loop);

  /* ── viz canvas sizing ───────────────────────────────────── */
  var vizCanvas = document.getElementById('vizCanvas');
  var vCtx      = vizCanvas.getContext('2d');

  function sizeViz() {
    var r = vizCanvas.getBoundingClientRect();
    vizCanvas.width  = Math.max(1, Math.round(r.width));
    vizCanvas.height = Math.max(1, Math.round(r.height));
  }

  setTimeout(sizeViz, 60);
  window.addEventListener('resize', sizeViz);

  /* ── audio player ────────────────────────────────────────── */
  var audio   = document.getElementById('bgAudio');
  var playBtn = document.getElementById('playBtn');
  var icPlay  = document.getElementById('icPlay');
  var icPause = document.getElementById('icPause');
  var vinyl   = document.getElementById('vinylDisc');

  var audioCtx = null, analyser = null, vizRaf = null, playing = false;

  function initAC() {
    if (audioCtx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    var src = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.8;
    src.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  function drawViz() {
    vizRaf = requestAnimationFrame(drawViz);
    var vW = vizCanvas.width, vH = vizCanvas.height;
    vCtx.clearRect(0, 0, vW, vH);
    if (!analyser) return;
    var data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    var bw = vW / data.length;
    for (var i = 0; i < data.length; i++) {
      var bh     = (data[i] / 255) * vH;
      var bright = 0.55 + (data[i] / 255) * 0.45;
      vCtx.fillStyle = 'rgba(215,170,70,' + bright + ')';
      vCtx.fillRect(i * bw, vH - bh, Math.max(1, bw - 1), bh);
    }
  }

  function setPlaying(v) {
    playing = v;
    icPlay.hidden  =  v;
    icPause.hidden = !v;
    if (v) {
      vinyl.classList.add('spinning');
      if (!vizRaf) drawViz();
    } else {
      vinyl.classList.remove('spinning');
      if (vizRaf) { cancelAnimationFrame(vizRaf); vizRaf = null; }
    }
  }

  playBtn.addEventListener('click', function () {
    initAC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(function () {});
    }
  });

  audio.addEventListener('play',  function () { setPlaying(true);  });
  audio.addEventListener('pause', function () { setPlaying(false); });
  audio.addEventListener('ended', function () { setPlaying(false); });

  // Auto-play on load; fall back to first-gesture unlock if browser blocks it
  (function autoStart() {
    function fadeIn() {
      setPlaying(true);
      var vol = 0;
      (function fadeVol() {
        vol = Math.min(0.65, vol + 0.65 / 90);
        audio.volume = vol;
        if (vol < 0.65) requestAnimationFrame(fadeVol);
      })();
    }
    audio.volume = 0;
    audio.play().then(fadeIn).catch(function () {
      var player = document.getElementById('audioPlayer');
      if (player) player.classList.add('waiting');
      var unlock = function () {
        if (player) player.classList.remove('waiting');
        audio.play().then(fadeIn).catch(function () {});
        document.removeEventListener('click',      unlock);
        document.removeEventListener('touchstart', unlock);
        document.removeEventListener('touchend',   unlock);
        document.removeEventListener('keydown',    unlock);
      };
      document.addEventListener('click',      unlock, { once: true });
      document.addEventListener('touchstart', unlock, { once: true, passive: true });
      document.addEventListener('touchend',   unlock, { once: true, passive: true });
      document.addEventListener('keydown',    unlock, { once: true });
    });
  })();

  // Save audio state before navigating to index.html so it can resume
  var ctaLink = document.querySelector('.cta-link');
  if (ctaLink) {
    ctaLink.addEventListener('click', function () {
      sessionStorage.setItem('ihtilal_time',    audio.currentTime);
      sessionStorage.setItem('ihtilal_playing', playing ? '1' : '0');
    });
  }

})();
