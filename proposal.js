'use strict';

/* ============================================================
   PROPOSAL PAGE — Evlilik Teklifi Animation Engine
   Rose bloom → crimson/gold heart · Kayahan ambient lyrics
   ============================================================ */

/* ── CONFIG ── */
const CFG = {
  colors: {
    petalDark  : '#3d000a',
    petalMid   : '#7a1020',
    petalBright: '#c0392b',
    petalTip   : '#e8758a',
    petalGlow  : 'rgba(200,80,90,0.9)',
    centerGold : '#f0c040',
    centerEdge : '#c9a227',
    stemGreen  : '#1b4332',
    leafGreen  : '#2d6a4f',
    heartA     : '#8b0000',
    heartB     : '#c0392b',
    heartC     : '#e8758a',
    heartGlow  : 'rgba(192,57,43,0.85)',
    goldGlow   : 'rgba(201,162,39,0.8)',
    bokeh      : 'rgba(201,162,39,0.10)',
    lyric      : 'rgba(201,162,39,',   // opacity appended dynamically
    confetti   : ['#c9a227','#f0c040','#e8758a','#8b0000','#fff8e7','#c0392b','#ffd700'],
  },

  rose: {
    layers: [
      { petals: 5, scaleF: 1.00, angleOff: 0,              timingOffset: 0    },
      { petals: 5, scaleF: 0.72, angleOff: Math.PI / 5,    timingOffset: 550  },
      { petals: 5, scaleF: 0.50, angleOff: Math.PI / 10,   timingOffset: 1100 },
    ],
    petalLen : 58,
    petalW   : 26,
    centerR  : 20,
    stemH    : 115,
    stemW    : 6,
  },

  heart: { size: 78, pulseAmp: 0.07, pulseHz: 1.0, glowRadius: 30 },

  transform: { particleCount: 210, scatterMs: 1500, convergeMs: 1900 },

  bg: { count: 50 },

  lyrics: [
    'Gözlerinin hapsindeyim',
    'Acı aşk, tatlı hüzün',
    'Kalbim seni istedi',
    'Seninle her yer cennet',
    'Bir ömür seni sevdim',
    'Sen olsan da olmasan da',
    'Sevda kuşun kanadında',
    'Yüreğim sana ait',
    'Seni seviyorum hayatım',
    'Her şeyi yak',
    'Gözlerin benim dünyam',
    'Aşk bu, neyini anlatayım',
    'Seninle bitmez bu gece',
    'Yanına alıver beni',
    'Rüzgar gibi geçmesin',
    'Bir ömür yetmez sana',
    'Sensiz olmaz bu dünya',
    'Kalbim sana emanet',
  ],

  buttons: {
    yesGrow   : 1.15,
    yesMax    : 3.0,
    noShrink  : 0.86,
    noMinScale: 0.22,
    noDissolve: 10,
    dodgePx   : 125,
  },

  noTexts: [
    'Henüz değil...',
    'Gerçekten mi?',
    'Bence bir daha düşün 💍',
    'Peki peki… beklerim',
    'Yüzük hâlâ cepte duruyor',
    'Gerçekten mi?',
    'Kalbimi kırıyorsun',
    'Son şansın bu...',
    'Annem de seni seviyor',
    'Pişman olacaksın 😢',
  ],
};

/* ── UTILS ── */
const ease = {
  inOutCubic : t => t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2,
  outCubic   : t => 1-Math.pow(1-t,3),
  outBack    : t => { const c=1.70158+1; return 1+c*Math.pow(t-1,3)+(c-1)*Math.pow(t-1,2); },
  outElastic : t => { if(!t||t===1)return t; return Math.pow(2,-10*t)*Math.sin((t*10-.75)*(2*Math.PI/3))+1; },
  inOutExpo  : t => { if(!t||t===1)return t; return t<.5?Math.pow(2,20*t-10)/2:(2-Math.pow(2,-20*t+10))/2; },
};
const lerp  = (a,b,t) => a+(b-a)*t;
const clamp = (v,lo,hi) => Math.max(lo,Math.min(hi,v));
const rand  = (lo,hi) => lo+Math.random()*(hi-lo);
const delay = ms => new Promise(r => setTimeout(r,ms));

/* ── STATE ── */
const S = {
  phase    : 'loading',
  noCount  : 0,
  yesScale : 1,
  noScale  : 1,
  noFixed  : false,
  noX : 0, noY : 0,
  rafIds   : {},
  bgParts  : [],
  lyricParts: [],
  fireworks: [],
  risingHearts: [],
  petals   : [],
  confetti : [],
  heartT   : 0,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

/* ── CANVAS ── */
let bgCvs, bgCtx, mainCvs, mainCtx, fxCvs, fxCtx;
const DPR = () => Math.min(window.devicePixelRatio||1, 2);

function setupCanvas(c) {
  const dpr=DPR(), w=window.innerWidth, h=window.innerHeight;
  c.width=w*dpr; c.height=h*dpr;
  c.style.width=w+'px'; c.style.height=h+'px';
  const ctx=c.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  return ctx;
}
function resizeAll() {
  bgCtx=setupCanvas(bgCvs);
  mainCtx=setupCanvas(mainCvs);
  fxCtx=setupCanvas(fxCvs);
}

/* ── BACKGROUND — bokeh + Kayahan lyrics ── */
const Background = {
  init() {
    const W=window.innerWidth, H=window.innerHeight;
    S.bgParts = Array.from({length:CFG.bg.count},()=>({
      x:rand(0,W), y:rand(0,H),
      r:rand(2,7), opacity:rand(0.025,0.10),
      vx:rand(-0.2,0.2), vy:rand(-0.2,0.2),
      phase:rand(0,Math.PI*2), speed:rand(0.007,0.020),
    }));
    S.lyricParts = CFG.lyrics.map(text=>({
      text, x:rand(0,W), y:rand(H*0.1,H),
      vx:rand(-0.15,0.15), vy:rand(-0.35,-0.06),
      opacity:rand(0.055,0.13),
      size:rand(12,18),
      phase:rand(0,Math.PI*2), speed:rand(0.006,0.014),
    }));
  },

  tick() {
    const W=window.innerWidth, H=window.innerHeight;
    bgCtx.clearRect(0,0,W,H);

    // Bokeh
    for(const p of S.bgParts){
      p.x+=p.vx; p.y+=p.vy; p.phase+=p.speed;
      if(p.x<-p.r*2) p.x=W+p.r; if(p.x>W+p.r*2) p.x=-p.r;
      if(p.y<-p.r*2) p.y=H+p.r; if(p.y>H+p.r*2) p.y=-p.r;
      const a=p.opacity*(0.65+0.35*Math.sin(p.phase));
      const g=bgCtx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r*2.2);
      g.addColorStop(0,`rgba(201,162,39,${a})`);
      g.addColorStop(1,'rgba(201,162,39,0)');
      bgCtx.beginPath();
      bgCtx.arc(p.x,p.y,p.r*2.2,0,Math.PI*2);
      bgCtx.fillStyle=g; bgCtx.fill();
    }

    // Kayahan lyrics — floating faintly
    bgCtx.save();
    for(const p of S.lyricParts){
      p.x+=p.vx; p.y+=p.vy; p.phase+=p.speed;
      if(p.y<-30){ p.y=H+10; p.x=rand(0,W); }
      if(p.x<-250){ p.x=W+10; p.y=rand(0,H); }
      if(p.x>W+250){ p.x=-10; p.y=rand(0,H); }
      const a=p.opacity*(0.6+0.4*Math.sin(p.phase));
      bgCtx.globalAlpha=a;
      bgCtx.font=`italic ${p.size}px Georgia,serif`;
      bgCtx.fillStyle='#c9a227';
      bgCtx.fillText(p.text, p.x, p.y);
    }
    bgCtx.restore();
    bgCtx.globalAlpha=1;

    S.rafIds.bg=requestAnimationFrame(()=>Background.tick());
  },

  start(){ this.init(); this.tick(); },
};

/* ── HEART UTILS ── */
function heartPoint(t,s){
  return {
    x:  16*Math.pow(Math.sin(t),3)*s,
    y: -(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))*s,
  };
}
function traceHeart(ctx,s){
  for(let i=0;i<=120;i++){
    const p=heartPoint((i/120)*Math.PI*2,s);
    i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);
  }
  ctx.closePath();
}

/* ── ROSE SCENE ── */
const Rose = {
  animate() {
    return new Promise(resolve => {
      const W=window.innerWidth, H=window.innerHeight;
      const cx=W/2, cy=H/2-30;
      const R=CFG.rose, layers=R.layers;

      // Timing
      const T_SEED    = 400;
      const T_STEM_S  = 300, T_STEM_E = 1800;
      const T_BUD_S   = 1600, T_BUD_E = 2300;
      const T_PETAL_S = 2200;  // outer layer start
      const PETAL_DUR = 420, PETAL_STAG = 110;
      const LAST_OPEN = T_PETAL_S + layers[layers.length-1].timingOffset
                      + (layers[layers.length-1].petals-1)*PETAL_STAG + PETAL_DUR;
      const T_HOLD    = LAST_OPEN + 800;

      let start=null;

      const tick=ts=>{
        if(!start) start=ts;
        const el=ts-start;
        mainCtx.clearRect(0,0,W,H);

        /* — seed — */
        const seedP=clamp(el/T_SEED,0,1);
        if(seedP>0){
          mainCtx.save();
          mainCtx.globalAlpha=ease.outCubic(seedP);
          mainCtx.beginPath();
          mainCtx.ellipse(cx,cy+R.stemH*0.52,8,5,-0.3,0,Math.PI*2);
          const sg=mainCtx.createRadialGradient(cx,cy+R.stemH*0.52,0,cx,cy+R.stemH*0.52,8);
          sg.addColorStop(0,'#5a000f'); sg.addColorStop(1,'#2d0008');
          mainCtx.fillStyle=sg; mainCtx.fill();
          mainCtx.restore();
        }

        /* — stem — */
        if(el>T_STEM_S){
          const sp=ease.inOutCubic(clamp((el-T_STEM_S)/(T_STEM_E-T_STEM_S),0,1));
          const baseY=cy+R.stemH*0.52, topY=baseY-R.stemH*sp;
          mainCtx.save();
          mainCtx.strokeStyle=CFG.colors.stemGreen;
          mainCtx.lineWidth=R.stemW; mainCtx.lineCap='round';
          mainCtx.beginPath();
          mainCtx.moveTo(cx,baseY);
          mainCtx.quadraticCurveTo(cx+Math.sin(sp*Math.PI)*8,baseY-R.stemH*sp*0.5,cx,topY);
          mainCtx.stroke();

          // Leaves
          if(sp>0.45){
            const lp=ease.outBack(clamp((sp-0.45)/0.4,0,1));
            const ly=baseY-R.stemH*0.5;
            this.drawLeaf(cx,ly,lp, 1);
            this.drawLeaf(cx,ly,lp,-1);
          }
          mainCtx.restore();
        }

        /* — bud — */
        if(el>T_BUD_S){
          const bp=ease.outBack(clamp((el-T_BUD_S)/(T_BUD_E-T_BUD_S),0,1));
          const topY=cy-R.stemH*0.48;
          mainCtx.save();
          mainCtx.translate(cx,topY);
          mainCtx.scale(bp,bp);
          mainCtx.beginPath();
          mainCtx.ellipse(0,0,10,14,0,0,Math.PI*2);
          const bg2=mainCtx.createRadialGradient(0,-4,0,0,0,14);
          bg2.addColorStop(0,'#8b1020'); bg2.addColorStop(1,'#3d000a');
          mainCtx.fillStyle=bg2; mainCtx.fill();
          mainCtx.restore();
        }

        /* — rose petals (layers) — */
        if(el>T_PETAL_S-200){
          const topY=cy-R.stemH*0.48;
          mainCtx.save();
          mainCtx.translate(cx,topY);

          // Draw layers back to front (outer first)
          for(let li=layers.length-1; li>=0; li--){
            const layer=layers[li];
            for(let pi=0; pi<layer.petals; pi++){
              const pStart=T_PETAL_S + layer.timingOffset + pi*PETAL_STAG;
              const pp=ease.outElastic(clamp((el-pStart)/PETAL_DUR,0,1));
              if(pp<=0) continue;

              const glowT=el-pStart;
              const glow = glowT>0 && glowT<600
                ? (glowT<200 ? glowT/200 : Math.max(0,1-(glowT-200)/400))
                : 0;

              const angle=(pi/layer.petals)*Math.PI*2 + layer.angleOff - Math.PI/2;
              this.drawPetal(angle, pp, layer.scaleF, glow);
            }
          }

          // Golden center
          const centerOpen = ease.outCubic(clamp((el-T_BUD_E)/400,0,1));
          if(centerOpen>0){
            mainCtx.shadowBlur=12; mainCtx.shadowColor='rgba(240,192,64,0.7)';
            mainCtx.beginPath();
            mainCtx.arc(0,0,R.centerR*centerOpen,0,Math.PI*2);
            const cg=mainCtx.createRadialGradient(0,-3,0,0,0,R.centerR);
            cg.addColorStop(0,'#fff59d'); cg.addColorStop(0.5,CFG.colors.centerGold);
            cg.addColorStop(1,CFG.colors.centerEdge);
            mainCtx.fillStyle=cg; mainCtx.shadowBlur=0; mainCtx.fill();

            // Stamens (tiny gold dots)
            for(let s=0;s<8;s++){
              const sa=(s/8)*Math.PI*2;
              const sr=R.centerR*0.65*centerOpen;
              mainCtx.beginPath();
              mainCtx.arc(Math.cos(sa)*sr,Math.sin(sa)*sr,1.8*centerOpen,0,Math.PI*2);
              mainCtx.fillStyle=CFG.colors.centerGold; mainCtx.fill();
            }
          }

          mainCtx.restore();
        }

        if(el>=T_HOLD){ resolve({cx,cy}); return; }
        S.rafIds.rose=requestAnimationFrame(tick);
      };

      S.rafIds.rose=requestAnimationFrame(tick);
    });
  },

  drawPetal(angle, progress, scaleF, glowIntensity) {
    const len=CFG.rose.petalLen*scaleF, hw=CFG.rose.petalW*scaleF/2;
    mainCtx.save();
    mainCtx.rotate(angle);
    mainCtx.scale(progress,progress);

    if(glowIntensity>0.01){
      mainCtx.shadowBlur=18*glowIntensity;
      mainCtx.shadowColor=CFG.colors.petalGlow;
    }

    // Rounded rose petal shape
    mainCtx.beginPath();
    mainCtx.moveTo(0,0);
    mainCtx.bezierCurveTo(-hw*0.7,-len*0.25,-hw*1.3,-len*0.55,-hw*0.85,-len);
    mainCtx.bezierCurveTo(-hw*0.3,-len*1.12, hw*0.3,-len*1.12,  hw*0.85,-len);
    mainCtx.bezierCurveTo( hw*1.3,-len*0.55, hw*0.7,-len*0.25,  0, 0);

    const grad=mainCtx.createLinearGradient(0,0,0,-len);
    grad.addColorStop(0,  CFG.colors.petalDark);
    grad.addColorStop(0.35,CFG.colors.petalMid);
    grad.addColorStop(0.7, CFG.colors.petalBright);
    grad.addColorStop(1,   CFG.colors.petalTip);
    mainCtx.fillStyle=grad;
    mainCtx.fill();
    mainCtx.restore();
  },

  drawLeaf(cx, y, progress, side) {
    mainCtx.save();
    mainCtx.translate(cx,y);
    mainCtx.scale(progress*side,progress);
    mainCtx.beginPath();
    mainCtx.moveTo(0,0);
    mainCtx.bezierCurveTo(8,-8,22,-6,24,0);
    mainCtx.bezierCurveTo(22,6,8,8,0,0);
    mainCtx.fillStyle=CFG.colors.leafGreen;
    mainCtx.fill();
    mainCtx.restore();
  },

  getPetalPositions(cx,cy) {
    const topY=cy-CFG.rose.stemH*0.48;
    const R=CFG.rose, positions=[];
    for(const layer of R.layers){
      for(let pi=0;pi<layer.petals;pi++){
        const angle=(pi/layer.petals)*Math.PI*2+layer.angleOff-Math.PI/2;
        const r=R.petalLen*layer.scaleF*0.7;
        positions.push({ x:cx+Math.cos(angle)*r, y:topY+Math.sin(angle)*r });
      }
    }
    return positions;
  },
};

/* ── TRANSFORM ── */
const Transform = {
  animate(origin) {
    return new Promise(resolve=>{
      const W=window.innerWidth, H=window.innerHeight;
      const {cx,cy}=origin;
      const topY=cy-CFG.rose.stemH*0.48;
      const hScale=CFG.heart.size/16;
      const {particleCount,scatterMs,convergeMs}=CFG.transform;
      const petalPos=Rose.getPetalPositions(cx,cy);

      const targets=[];
      for(let i=0;i<particleCount;i++){
        const t=(i/particleCount)*Math.PI*2;
        const p=heartPoint(t,hScale);
        targets.push({x:cx+p.x,y:topY+p.y});
      }

      const parts=[];
      const perPetal=Math.floor(particleCount/petalPos.length);
      petalPos.forEach((petal,pi)=>{
        for(let j=0;j<perPetal;j++){
          const jitter=CFG.rose.petalLen*0.3;
          const sx=petal.x+rand(-jitter,jitter)*0.4;
          const sy=petal.y+rand(-jitter,jitter)*0.4;
          const sa=Math.atan2(petal.y-topY,petal.x-cx);
          const sr=Math.hypot(petal.x-cx,petal.y-topY);
          const scatter=sa+rand(-0.35,0.35);
          const sdist=sr+rand(25,80);
          const ti=(pi*perPetal+j)%particleCount;
          parts.push({
            sx,sy,
            mx:cx+Math.cos(scatter)*sdist,
            my:topY+Math.sin(scatter)*sdist*0.85,
            tx:targets[ti].x, ty:targets[ti].y,
            size:rand(1.8,3.5),
          });
        }
      });

      let start=null;
      const total=scatterMs+convergeMs;

      const tick=ts=>{
        if(!start) start=ts;
        const el=ts-start;
        mainCtx.clearRect(0,0,W,H);

        for(const p of parts){
          let x,y,alpha;
          if(el<=scatterMs){
            const t=ease.inOutCubic(el/scatterMs);
            x=lerp(p.sx,p.mx,t); y=lerp(p.sy,p.my,t); alpha=0.6+0.4*t;
          } else {
            const t=ease.inOutExpo((el-scatterMs)/convergeMs);
            x=lerp(p.mx,p.tx,t); y=lerp(p.my,p.ty,t); alpha=0.5+0.5*t;
            if(t>0.6){ mainCtx.shadowBlur=6; mainCtx.shadowColor=CFG.colors.heartGlow; }
          }
          const tg=clamp((el-scatterMs)/convergeMs,0,1);
          const r=Math.round(lerp(210,192,tg)), g=Math.round(lerp(30,57,tg)), b=Math.round(lerp(60,43,tg));
          mainCtx.globalAlpha=alpha;
          mainCtx.beginPath();
          mainCtx.arc(x,y,p.size,0,Math.PI*2);
          mainCtx.fillStyle=`rgb(${r},${g},${b})`;
          mainCtx.fill();
          mainCtx.shadowBlur=0;
        }
        mainCtx.globalAlpha=1;
        if(el>=total){ resolve(); return; }
        S.rafIds.transform=requestAnimationFrame(tick);
      };
      S.rafIds.transform=requestAnimationFrame(tick);
    });
  },
};

/* ── HEART SCENE ── */
const Heart = {
  cx:0, cy:0,

  drawAt(scale,glowMul){
    const {cx,cy}=this;
    const W=window.innerWidth, H=window.innerHeight;
    mainCtx.clearRect(0,0,W,H);
    mainCtx.save();
    mainCtx.translate(cx,cy);
    const s=(CFG.heart.size/16)*scale;

    // Crimson bloom layers
    for(let layer=3;layer>=1;layer--){
      mainCtx.shadowBlur=CFG.heart.glowRadius*layer*0.5*glowMul;
      mainCtx.shadowColor=`rgba(192,57,43,${0.2*glowMul/layer})`;
      mainCtx.beginPath(); traceHeart(mainCtx,s*(1+layer*0.05));
      mainCtx.fillStyle=`rgba(180,20,40,${0.07/layer})`; mainCtx.fill();
    }

    // Gold outer ring hint
    mainCtx.shadowBlur=CFG.heart.glowRadius*1.5*glowMul;
    mainCtx.shadowColor=`rgba(201,162,39,${0.3*glowMul})`;
    mainCtx.beginPath(); traceHeart(mainCtx,s*1.04);
    mainCtx.fillStyle=`rgba(201,162,39,${0.06*glowMul})`; mainCtx.fill();

    // Main heart fill
    mainCtx.shadowBlur=CFG.heart.glowRadius*glowMul;
    mainCtx.shadowColor=CFG.colors.heartGlow;
    mainCtx.beginPath(); traceHeart(mainCtx,s);
    const hg=mainCtx.createRadialGradient(0,-s*3,0,0,s*2,s*16);
    hg.addColorStop(0,CFG.colors.heartC);
    hg.addColorStop(0.4,CFG.colors.heartB);
    hg.addColorStop(1,CFG.colors.heartA);
    mainCtx.fillStyle=hg; mainCtx.fill();
    mainCtx.restore();
  },

  start(origin){
    this.cx=origin.cx;
    this.cy=origin.cy-CFG.rose.stemH*0.48;
    let start=null;

    const tick=ts=>{
      if(S.phase!=='heart'&&S.phase!=='question') return;
      if(!start) start=ts;
      const el=ts-start;
      S.heartT=el;
      const appear=ease.outBack(clamp(el/900,0,1));
      const pulse=1+CFG.heart.pulseAmp*Math.sin((el/1000)*CFG.heart.pulseHz*Math.PI*2);
      const glowMul=appear*(0.7+0.3*Math.sin((el/1000)*CFG.heart.pulseHz*Math.PI*2));
      this.drawAt(appear*pulse,glowMul);
      S.rafIds.heart=requestAnimationFrame(tick);
    };
    S.rafIds.heart=requestAnimationFrame(tick);
  },
};

/* ── TEXT REVEAL ── */
const TextReveal = {
  reveal(text,el){
    el.innerHTML='';
    [...text].forEach(ch=>{
      const s=document.createElement('span');
      s.className='char'+(ch===' '?' space':'');
      s.textContent=ch===' '?' ':ch;
      el.appendChild(s);
    });
    const spans=el.querySelectorAll('.char');
    spans.forEach((s,i)=>setTimeout(()=>s.classList.add('revealed'),i*70+80));
    return spans.length*70+80+400;
  },
};

/* ── BUTTON CONTROLLER ── */
const Buttons = {
  yesEl:null, noEl:null, noBtnText:null,

  init(yesEl,noEl){
    this.yesEl=yesEl; this.noEl=noEl;
    this.noBtnText=noEl.querySelector('.btn__text');
  },

  onYes(){
    S.phase='finale';
    document.getElementById('questionPanel').style.pointerEvents='none';
    gsap.to(document.getElementById('questionPanel'),{opacity:0,duration:0.4});
    Finale.start();
  },

  onNo(){
    S.noCount++;
    const n=S.noCount;
    if(n<CFG.noTexts.length) this.noBtnText.textContent=CFG.noTexts[n];

    // Grow yes
    S.yesScale=Math.min(CFG.buttons.yesMax,S.yesScale*CFG.buttons.yesGrow);
    if(typeof gsap!=='undefined'){
      gsap.to(this.yesEl,{scale:S.yesScale,duration:0.5,ease:'elastic.out(1.1,0.5)'});
    } else {
      this.yesEl.style.transform=`scale(${S.yesScale})`;
    }

    // Shrink no
    S.noScale=Math.max(CFG.buttons.noMinScale,S.noScale*CFG.buttons.noShrink);

    // Shake
    this.noEl.classList.remove('shaking');
    void this.noEl.offsetWidth;
    this.noEl.classList.add('shaking');

    if(n>=CFG.buttons.noDissolve){ this.dissolveNo(); return; }
    if(n===2) this.makeNoEscape();
    if(S.noFixed) this.jumpNo();
    else {
      this.noEl.style.transform=`scale(${S.noScale})`;
      this.noEl.style.opacity=Math.max(0.35,1-n*0.07);
    }
  },

  makeNoEscape(){
    if(S.noFixed) return;
    const el=this.noEl, rect=el.getBoundingClientRect();
    S.noX=rect.left; S.noY=rect.top;
    el.classList.add('escaped');
    el.style.left=S.noX+'px'; el.style.top=S.noY+'px';
    el.style.transform=`scale(${S.noScale})`;
    S.noFixed=true;
  },

  jumpNo(){
    const el=this.noEl;
    const w=window.innerWidth, h=window.innerHeight;
    const bw=el.offsetWidth*S.noScale+16, bh=el.offsetHeight*S.noScale+16;
    const yRect=this.yesEl.getBoundingClientRect();
    const yCx=yRect.left+yRect.width/2, yCy=yRect.top+yRect.height/2;
    let nx,ny,tries=0;
    do{
      nx=rand(8,w-bw); ny=rand(8,h-bh); tries++;
    } while(Math.hypot(nx+bw/2-yCx,ny+bh/2-yCy)<180&&tries<20);
    S.noX=nx; S.noY=ny;
    el.style.left=nx+'px'; el.style.top=ny+'px';
    el.style.transform=`scale(${S.noScale}) rotate(${rand(-15,15)}deg)`;
    el.style.opacity=Math.max(0.2,1-S.noCount*0.08);
  },

  dissolveNo(){
    const el=this.noEl;
    el.style.pointerEvents='none';
    if(typeof gsap!=='undefined'){
      gsap.to(el,{opacity:0,scale:0,rotation:30,duration:0.7,ease:'power3.in',
        onComplete:()=>el.style.display='none'});
    } else {
      el.style.transition='opacity 0.7s,transform 0.7s';
      el.style.opacity='0'; el.style.transform='scale(0) rotate(30deg)';
    }
    gsap.to(this.yesEl,{
      boxShadow:'0 0 60px rgba(201,162,39,0.9), 0 0 120px rgba(201,162,39,0.5)',
      duration:0.8,
    });
  },

  // Desktop hover-dodge (immediate, touch devices skipped)
  initHoverDodge(el){
    if(window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;
    const DODGE_R=CFG.buttons.dodgePx;
    let ready=false;

    const escapeToFixed=()=>{
      const rect=el.getBoundingClientRect();
      S.noX=rect.left; S.noY=rect.top;
      el.classList.add('escaped');
      el.style.left=S.noX+'px'; el.style.top=S.noY+'px';
      el.style.transition=
        'left 0.22s cubic-bezier(0.34,1.56,0.64,1), top 0.22s cubic-bezier(0.34,1.56,0.64,1)';
      S.noFixed=true; ready=true;
    };

    document.addEventListener('mousemove',e=>{
      if(S.phase!=='question') return;
      if(el.style.display==='none') return;

      if(!ready){
        const r=el.getBoundingClientRect();
        if(Math.hypot(e.clientX-(r.left+r.width/2),e.clientY-(r.top+r.height/2))<DODGE_R*2.5)
          escapeToFixed();
        return;
      }

      const r=el.getBoundingClientRect();
      const cx=r.left+r.width/2, cy=r.top+r.height/2;
      const dx=e.clientX-cx, dy=e.clientY-cy;
      const dist=Math.hypot(dx,dy);
      const zone=DODGE_R+S.noCount*10;
      if(dist<zone&&dist>0){
        const push=(zone*1.9)/dist;
        const nx=clamp(cx-dx*push-r.width/2,  8,window.innerWidth -r.width -8);
        const ny=clamp(cy-dy*push-r.height/2, 8,window.innerHeight-r.height-8);
        S.noX=nx; S.noY=ny;
        el.style.left=nx+'px'; el.style.top=ny+'px';
      }
    });
  },
};

/* ── FINALE ── */
const Finale = {
  start(){
    cancelAnimationFrame(S.rafIds.heart);
    mainCtx.clearRect(0,0,window.innerWidth,window.innerHeight);
    this.launchFireworks();
    this.spawnRisingHearts();
    this.spawnRosePetals();
    this.spawnConfetti();
    this.tick();
    this.cameraShake(8,600);
    this.playMusic();
    setTimeout(()=>this.showFinalMessage(),3000);
  },

  playMusic(){
    const audio=document.getElementById('bgMusic');
    if(!audio||!audio.paused) return; // already playing — let it continue
    audio.volume=0;
    audio.play().catch(()=>{});
    let vol=0;
    const step=()=>{ vol=Math.min(0.65,vol+0.65/90); audio.volume=vol; if(vol<0.65) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  },

  launchFireworks(){
    S.fireworks=[];
    const W=window.innerWidth, H=window.innerHeight;
    const cols=['#c9a227','#f0c040','#e8758a','#c0392b','#ffd700','#fff8e7','#8b0000'];
    for(let f=0;f<12;f++){
      setTimeout(()=>{
        if(S.phase!=='finale') return;
        const bx=rand(W*0.12,W*0.88), by=rand(H*0.08,H*0.48);
        this.burst(bx,by,cols[Math.floor(Math.random()*cols.length)]);
      },f*230+rand(0,120));
    }
  },

  burst(bx,by,color){
    const count=64, hScale=rand(3,6);
    for(let i=0;i<count;i++){
      const t=(i/count)*Math.PI*2;
      const hp=heartPoint(t,hScale);
      const len=Math.hypot(hp.x,hp.y)||1;
      const speed=rand(2.5,5.5);
      S.fireworks.push({
        x:bx,y:by,
        vx:(hp.x/len)*speed+rand(-0.4,0.4),
        vy:(hp.y/len)*speed+rand(-0.4,0.4),
        life:1, decay:1/rand(55,90),
        size:rand(2,4), color,
        trail:Math.random()>0.4,
        trail_x:bx, trail_y:by,
      });
    }
    // Gold sparkle ring
    for(let i=0;i<24;i++){
      const a=(i/24)*Math.PI*2, spd=rand(3,7);
      S.fireworks.push({
        x:bx,y:by,
        vx:Math.cos(a)*spd, vy:Math.sin(a)*spd,
        life:1, decay:1/rand(30,50),
        size:rand(1.5,3), color:'#f0c040',
        trail:false, trail_x:bx, trail_y:by,
      });
    }
  },

  spawnRisingHearts(){
    S.risingHearts=[];
    for(let i=0;i<35;i++){
      setTimeout(()=>{
        const side=Math.random()>0.5?'L':'R';
        const W=window.innerWidth;
        S.risingHearts.push({
          x:side==='L'?rand(0,W*0.25):rand(W*0.75,W),
          y:window.innerHeight+20,
          vx:rand(-0.5,0.5), vy:-(rand(1.8,3.5)),
          size:rand(10,26), opacity:rand(0.5,0.9),
          rot:rand(-0.4,0.4), rotSpd:rand(-0.02,0.02),
          color:`hsl(${rand(0,20)},80%,${rand(50,68)}%)`,
        });
      },i*100+rand(0,80));
    }
  },

  spawnRosePetals(){
    // Larger rose-petal particles float down
    S.petals=[];
    for(let i=0;i<50;i++){
      setTimeout(()=>{
        S.petals.push({
          x:rand(0,window.innerWidth),
          y:-20,
          vx:rand(-1.5,1.5), vy:rand(1.5,3.5),
          rot:rand(0,Math.PI*2), rotSpd:rand(-0.06,0.06),
          size:rand(6,14),
          opacity:rand(0.4,0.8),
          color:`hsl(${rand(345,15)},75%,${rand(45,65)}%)`,
        });
      },i*60+rand(0,500));
    }
  },

  spawnConfetti(){
    S.confetti=[];
    const cols=CFG.colors.confetti;
    for(let i=0;i<100;i++){
      setTimeout(()=>{
        S.confetti.push({
          x:rand(0,window.innerWidth), y:-10,
          vx:rand(-2,2), vy:rand(2.5,5),
          rot:rand(0,Math.PI*2), rsp:rand(-0.15,0.15),
          w:rand(4,10), h:rand(2.5,5.5),
          col:cols[Math.floor(Math.random()*cols.length)],
        });
      },i*35+rand(0,350));
    }
  },

  tick(){
    const W=window.innerWidth, H=window.innerHeight;
    fxCtx.clearRect(0,0,W,H);

    // Fireworks
    for(let i=S.fireworks.length-1;i>=0;i--){
      const p=S.fireworks[i];
      p.x+=p.vx; p.y+=p.vy;
      p.vy+=0.11; p.vx*=0.98; p.vy*=0.98;
      p.life-=p.decay;
      if(p.life<=0){ S.fireworks.splice(i,1); continue; }
      fxCtx.globalAlpha=p.life*p.life;
      fxCtx.shadowBlur=p.life>0.6?9:0;
      fxCtx.shadowColor=p.color;
      if(p.trail){
        fxCtx.beginPath();
        fxCtx.moveTo(p.trail_x,p.trail_y);
        fxCtx.lineTo(p.x,p.y);
        fxCtx.strokeStyle=p.color;
        fxCtx.lineWidth=p.size*0.55;
        fxCtx.lineCap='round'; fxCtx.stroke();
        p.trail_x=p.x; p.trail_y=p.y;
      }
      fxCtx.beginPath();
      fxCtx.arc(p.x,p.y,p.size*p.life,0,Math.PI*2);
      fxCtx.fillStyle=p.color; fxCtx.fill();
      fxCtx.shadowBlur=0;
    }

    // Rising hearts
    for(let i=S.risingHearts.length-1;i>=0;i--){
      const h=S.risingHearts[i];
      h.x+=h.vx; h.y+=h.vy; h.rot+=h.rotSpd;
      if(h.y<-60){ S.risingHearts.splice(i,1); continue; }
      fxCtx.save();
      fxCtx.globalAlpha=h.opacity*clamp((-h.y+H)/H,0,1);
      fxCtx.translate(h.x,h.y); fxCtx.rotate(h.rot);
      fxCtx.beginPath(); traceHeart(fxCtx,h.size/16);
      fxCtx.fillStyle=h.color;
      fxCtx.shadowBlur=14; fxCtx.shadowColor=h.color;
      fxCtx.fill(); fxCtx.restore();
    }

    // Rose petals
    for(let i=S.petals.length-1;i>=0;i--){
      const p=S.petals[i];
      p.x+=p.vx; p.y+=p.vy; p.rot+=p.rotSpd;
      p.vy+=0.03;
      if(p.y>H+20){ S.petals.splice(i,1); continue; }
      fxCtx.save();
      fxCtx.globalAlpha=p.opacity;
      fxCtx.translate(p.x,p.y); fxCtx.rotate(p.rot);
      const hw=p.size/2;
      fxCtx.beginPath();
      fxCtx.moveTo(0,0);
      fxCtx.bezierCurveTo(-hw*0.7,-p.size*0.25,-hw*1.3,-p.size*0.55,-hw*0.85,-p.size);
      fxCtx.bezierCurveTo(-hw*0.3,-p.size*1.12,hw*0.3,-p.size*1.12,hw*0.85,-p.size);
      fxCtx.bezierCurveTo(hw*1.3,-p.size*0.55,hw*0.7,-p.size*0.25,0,0);
      fxCtx.fillStyle=p.color; fxCtx.fill();
      fxCtx.restore();
    }

    // Confetti
    for(let i=S.confetti.length-1;i>=0;i--){
      const c=S.confetti[i];
      c.x+=c.vx; c.y+=c.vy; c.rot+=c.rsp; c.vy+=0.04;
      if(c.y>H+20){ S.confetti.splice(i,1); continue; }
      fxCtx.save();
      fxCtx.globalAlpha=0.85;
      fxCtx.translate(c.x,c.y); fxCtx.rotate(c.rot);
      fxCtx.fillStyle=c.col;
      fxCtx.fillRect(-c.w/2,-c.h/2,c.w,c.h);
      fxCtx.restore();
    }

    fxCtx.globalAlpha=1;
    if(S.phase==='finale'||S.phase==='final'){
      S.rafIds.finale=requestAnimationFrame(()=>Finale.tick());
    }
  },

  cameraShake(intensity,duration){
    const el=document.getElementById('uiOverlay');
    const frames=Array.from({length:21},(_,i)=>{
      const d=1-i/20;
      return {transform:i<20
        ?`translate(${rand(-1,1)*intensity*d}px,${rand(-1,1)*intensity*d}px)`
        :'translate(0,0)'};
    });
    el.animate(frames,{duration,easing:'linear',fill:'forwards'});
  },

  async showFinalMessage(){
    S.phase='final';
    document.getElementById('questionPanel').style.display='none';
    const panel=document.getElementById('finalPanel');
    const textEl=document.getElementById('finalText');
    panel.classList.remove('hidden');

    const msg=' ❤️';
    textEl.innerHTML=[...msg].map(ch=>
      `<span class="final-char" style="display:inline-block">${ch===' '?'&nbsp;':ch}</span>`
    ).join('');

    const chars=panel.querySelectorAll('.final-char');
    const charDelay = chars.length * 0.065 + 0.3 + 0.6; // approx total reveal time (s)

    if(typeof gsap!=='undefined'){
      gsap.to(panel,{opacity:1,duration:0.6});
      gsap.fromTo(chars,
        {opacity:0,filter:'blur(14px)',y:24,scale:0.75},
        {opacity:1,filter:'blur(0px)',y:0,scale:1,
         duration:0.6,stagger:0.065,ease:'power3.out',delay:0.3}
      );

      // Bonus line: "Oleey! Haftaya istemeye geliyoruz 💍"
      const bonusEl=document.getElementById('bonusText');
      if(bonusEl){
        bonusEl.textContent='Oleey! Haftaya istemeye geliyoruz 💍';
        gsap.fromTo(bonusEl,
          {opacity:0, y:18, filter:'blur(8px)'},
          {opacity:1, y:0,  filter:'blur(0px)',
           duration:1.0, ease:'power2.out', delay: charDelay + 0.6}
        );
      }
    } else {
      panel.style.transition='opacity 0.6s';
      panel.style.opacity='1';
      const bonusEl=document.getElementById('bonusText');
      if(bonusEl){
        bonusEl.textContent='Oleey! Haftaya istemeye geliyoruz 💍';
        setTimeout(()=>{
          bonusEl.style.transition='opacity 1s, filter 1s, transform 1s';
          bonusEl.style.opacity='1';
          bonusEl.style.filter='blur(0)';
          bonusEl.style.transform='translateY(0)';
        }, charDelay * 1000 + 600);
      }
    }
  },
};

/* ── MAIN SEQUENCE ── */
async function init(){
  // İhtilal: resume from previous page or autoplay fresh
  (function startIhtilal(){
    const bgm=document.getElementById('bgMusic');
    if(!bgm) return;
    const saved=sessionStorage.getItem('ihtilal_time');
    if(saved!==null){
      bgm.currentTime=parseFloat(saved);
      sessionStorage.removeItem('ihtilal_time');
      sessionStorage.removeItem('ihtilal_playing');
    }
    bgm.volume=0;
    bgm.play().catch(()=>{
      const unlock=()=>{
        bgm.play().catch(()=>{});
        document.removeEventListener('click',unlock);
        document.removeEventListener('touchstart',unlock);
        document.removeEventListener('scroll',unlock);
      };
      document.addEventListener('click',unlock,{once:true});
      document.addEventListener('touchstart',unlock,{once:true});
      document.addEventListener('scroll',unlock,{once:true,passive:true});
    });
    let vol=0;
    const fadeVol=()=>{ vol=Math.min(0.65,vol+0.65/90); bgm.volume=vol; if(vol<0.65) requestAnimationFrame(fadeVol); };
    requestAnimationFrame(fadeVol);
  })();

  bgCvs=document.getElementById('bgCanvas');
  mainCvs=document.getElementById('mainCanvas');
  fxCvs=document.getElementById('fxCanvas');
  resizeAll();

  const yesBtn=document.getElementById('yesBtn');
  const noBtn=document.getElementById('noBtn');
  Buttons.init(yesBtn,noBtn);

  Background.start();
  window.addEventListener('resize',()=>{ resizeAll(); Background.init(); });

  if(S.reducedMotion){
    S.phase='question'; showQuestion(); return;
  }

  // Cinematic fade in
  document.body.style.opacity='0';
  document.body.style.transition='opacity 1.2s ease';
  await delay(30);
  document.body.style.opacity='1';
  await delay(1100);

  // Rose bloom
  S.phase='rose';
  const origin=await Rose.animate();

  // Transform rose → heart
  S.phase='transform';
  await Transform.animate(origin);

  // Heart beats
  S.phase='heart';
  Heart.start(origin);
  await delay(1100);

  // Question
  S.phase='question';
  showQuestion();
}

async function showQuestion(){
  const panel=document.getElementById('questionPanel');
  const textEl=document.getElementById('questionText');

  const H=window.innerHeight;
  if(S.reducedMotion){
    panel.style.top='50%';
    panel.style.transform='translateY(-10%)';
  } else {
    const heartCenterY=H/2-30-CFG.rose.stemH*0.48;
    const heartBottom=heartCenterY+CFG.heart.size*1.25;
    panel.style.top=Math.round(heartBottom+28)+'px';
  }

  panel.classList.add('visible');

  if(typeof gsap!=='undefined'){
    gsap.fromTo(panel,{opacity:0,y:14},{
      opacity:1,y:0,duration:0.8,ease:'power2.out',
      onComplete:()=>gsap.set(panel,{clearProps:'transform,y'}),
    });
  } else {
    panel.style.transition='opacity 0.8s';
    panel.style.opacity='1';
  }

  const revealTime=TextReveal.reveal('Benimle evlenir misin?',textEl);
  await delay(revealTime+200);
  showButtons();
}

function showButtons(){
  const yesBtn=document.getElementById('yesBtn');
  const noBtn=document.getElementById('noBtn');

  if(typeof gsap!=='undefined'){
    gsap.fromTo([yesBtn,noBtn],
      {opacity:0,y:18,scale:0.85},
      {opacity:1,y:0,scale:1,duration:0.6,stagger:0.1,ease:'back.out(1.4)'}
    );
  } else {
    [yesBtn,noBtn].forEach((b,i)=>{
      b.style.transition=`opacity 0.5s ${i*0.1}s,transform 0.5s ${i*0.1}s`;
      b.style.opacity='1'; b.style.transform='scale(1)';
    });
  }

  // Show back nav
  const backNav=document.getElementById('backNav');
  if(backNav&&typeof gsap!=='undefined'){
    gsap.fromTo(backNav,{opacity:0},{opacity:1,duration:1,delay:1.8});
  }

  // Reveal heart photo frames
  const photoLeft  = document.getElementById('photoLeft');
  const photoRight = document.getElementById('photoRight');
  if(photoLeft)  setTimeout(()=>photoLeft.classList.add('visible'),  700);
  if(photoRight) setTimeout(()=>photoRight.classList.add('visible'), 1200);

  yesBtn.addEventListener('click',()=>Buttons.onYes());
  noBtn.addEventListener('click', ()=>Buttons.onNo());
  Buttons.initHoverDodge(noBtn);

  // Ripple
  [yesBtn,noBtn].forEach(btn=>{
    btn.addEventListener('pointerdown',e=>{
      const r=btn.querySelector('.btn__ripple');
      const rect=btn.getBoundingClientRect();
      const size=Math.max(rect.width,rect.height)*2;
      r.style.cssText=`width:${size}px;height:${size}px;left:${e.clientX-rect.left}px;top:${e.clientY-rect.top}px;opacity:0.5;transition:transform 0.5s ease,opacity 0.5s ease;transform:translate(-50%,-50%) scale(0)`;
      void r.offsetWidth;
      r.style.transform='translate(-50%,-50%) scale(1)';
      r.style.opacity='0';
    });
  });
}

/* ── BOOT ── */
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',init);
} else { init(); }
