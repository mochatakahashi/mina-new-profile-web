/* =============================================================================
   hero3d.js — "Architect's Nebula" hero (ES module, owner: HERO)

   Order matters:
   1. Cloud-dive var (--hero-p on #home) and fx:intro events run first and never
      depend on three.js, so they work with the CSS fallback too.
   2. Then three@0.170.0 is imported (import map) and a tiered scene is built:
      dithered domain-warped nebula, twinkling stars, mesh clouds (high/mid) or
      instanced billboard puffs (low), the cloud-silhouette node network with
      data pulses, pointer links and a tap pulse ring, and foreground motes.
   3. The loop runs only while #home is on screen, no overlay is open and the
      page is visible; it degrades itself on slow GPUs and survives context loss.

   Colours: every shader works in display (sRGB) space on values read from the
   --hero-* tokens, so the scene matches the CSS palette exactly.
   Spec: §4 (scene, interaction, budgets), §9 (contracts).
   ============================================================================= */

/* ---------- Constants ---------- */
const doc = document;
const root = doc.documentElement;
const T0 = performance.now();          // intro clock: ms after module init
const STILL_T = 30;                    // scene time used for static frames
const FOV = 42;
const CAM_Z = 10;
const WORLD_PER_PX_K = 2 * Math.tan((FOV / 2) * Math.PI / 180) * CAM_Z;   // world units across the canvas height at z = 0
const CLOUD_MARGIN = .4;               // drift + wobble headroom around the text box (world units)
const YAW_A = .35, YAW_W = .02 / .35;  // cloud yaw sways ±.35 rad at up to .02 rad/s (bounded, so the text box stays clear)
const YAW_SAMPLES = [-1, -.5, 0, .5, 1].map(s => s * YAW_A);

const TIERS = {
  high: { oct: 4, stars: 1400, clouds: 6, detail: 3, nodes: 42, edges: 96, pulses: 6, links: 3, motes: 60, puffs: false, every: 1 },
  mid:  { oct: 3, stars: 800,  clouds: 4, detail: 2, nodes: 32, edges: 72, pulses: 4, links: 2, motes: 0,  puffs: false, every: 1 },
  low:  { oct: 2, stars: 450,  clouds: 0, detail: 0, nodes: 22, edges: 48, pulses: 3, links: 0, motes: 0,  puffs: true,  every: 2 },
};

/* Mesh cloud rest layout (x, y, z, scale); mid uses the first four */
const CLOUD_LAYOUT = [
  [-5.2, -1.6, 1.5, 1.25], [5.0, -1.9, 1.0, 1.4], [-3.2, 2.3, -2.5, .9],
  [3.6, 2.6, -3.0, .8], [-7.5, .6, -4, 1.1], [7.8, .2, -4.5, 1.2],
];

/* Node-network silhouette: three overlapping lobes (centre xyz, radius) */
const LOBES = [[-1.4, 0, 0, 1.4], [0, .6, 0, 1.8], [1.3, .1, 0, 1.3]];

/* Text box used when the DOM cannot be measured (world units on z = 0) */
const SPEC_BOX = { x: 3.2, y0: -1.2, y1: 1.6 };
const SPEC_NAME_BOX = { x: 2.6, y0: -.6, y1: 1 };

const TOKENS = {
  sky0: '--hero-sky-0', sky1: '--hero-sky-1', sky2: '--hero-sky-2', sky3: '--hero-sky-3', skyHi: '--hero-sky-hi',
  core: '--hero-core', cloudShadow: '--hero-cloud-shadow', cloudMid: '--hero-cloud-mid', cloudLit: '--hero-cloud-lit',
  cloudRim: '--hero-cloud-rim', star: '--hero-star', line: '--hero-line', node: '--hero-node',
  pulse: '--hero-pulse', mote: '--hero-mote',
};
const FALLBACK = {
  dark: {
    sky0: '#0b0820', sky1: '#1a0f3d', sky2: '#7c3aed', sky3: '#db2777', skyHi: '#f0abfc', core: '#a855f7',
    cloudShadow: '#5b3fa8', cloudMid: '#b9a6ff', cloudLit: '#f5eeff', cloudRim: '#ff6ec7',
    star: '#ffffff', line: '#c4b5fd', node: '#f0abfc', pulse: '#67e8f9', mote: '#e9d5ff',
  },
  light: {
    sky0: '#fbf7ff', sky1: '#e9ddff', sky2: '#ffd9ec', sky3: '#ffe9d6', skyHi: '#ffffff', core: '#f5d0fe',
    cloudShadow: '#c9b6f2', cloudMid: '#ece4ff', cloudLit: '#ffffff', cloudRim: '#ff9bcb',
    star: '#7c3aed', line: '#8b5cf6', node: '#a21caf', pulse: '#0e7490', mote: '#f5b66b',
  },
};
/* Non-colour look per theme. add: 1 = additive glow (night), 0 = alpha "over" (dawn) */
const LOOK = {
  dark:  { starA: 1,   starMono: 0, moteGain: 1,   add: 1, line: .30 },
  light: { starA: .22, starMono: 1, moteGain: 2.9, add: 0, line: .30 },
};

/* ---------- Helpers ---------- */
const easeOutQuint = t => 1 - Math.pow(1 - t, 5);
const easeInOutCubic = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function mulberry32(seed) {             // deterministic layout on every visit
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- GLSL ---------- */
const GLSL_SNOISE2 = /* glsl */`
vec3 permute3(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute3(permute3(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}`;

const GLSL_SNOISE3 = /* glsl */`
vec4 permute4(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise3(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = permute4(permute4(permute4(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec3 ns = (1.0 / 7.0) * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}`;

/* Ring of light expanding from a tap through the network (4 units/s) */
const GLSL_RING = /* glsl */`
uniform float uPulseTime;
uniform vec3 uPulseOrigin;
float pulseRing(vec3 w) {
  float age = uTime - uPulseTime;
  float band = 1.0 - smoothstep(0.0, 0.55, abs(distance(w, uPulseOrigin) - age * 4.0));
  return band * (1.0 - smoothstep(0.0, 2.4, age)) * step(0.0, age);
}`;

const NEBULA_VS = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.999, 1.0); }`;

const NEBULA_FS = /* glsl */`
uniform float uTime, uScroll, uIntro;
uniform vec2 uRes, uMouse;
uniform vec3 uSky0, uSky1, uSky2, uSky3, uSkyHi, uCore;
varying vec2 vUv;
${GLSL_SNOISE2}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < OCT; i++) { s += a * snoise(p); p = p * 2.02 + vec2(11.7, 5.3); a *= 0.5; }
  return s;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float asp = uRes.x / max(uRes.y, 1.0);
  vec2 p = (vUv - 0.5) * vec2(asp, 1.0);
  p = p * (1.25 - 0.3 * uScroll) + uMouse * vec2(0.035, -0.025);
  float t = uTime * 0.015;
  vec2 q = vec2(fbm(p * 1.3 + vec2(t, 0.0)), fbm(p * 1.3 + vec2(5.2, 1.3 - t)));   // domain warp
  float n = fbm(p * 1.1 + q * 1.5 + vec2(1.7 + t, 9.2)) * 0.5 + 0.5;
  vec2 cd = (vUv - vec2(0.5, 0.56)) * vec2(asp, 1.0);
  float r2 = dot(cd, cd);
  float calm = smoothstep(0.04, 0.5, r2);            // quieter wisps behind the name
  float h = vUv.y;
  vec3 col = mix(uSky0, uSky1, smoothstep(0.1, 0.9, h * 0.6 + n * 0.55));
  col = mix(col, uSky2, smoothstep(0.5, 0.9, n) * 0.55 * (0.4 + 0.6 * calm));
  col = mix(col, uSky3, smoothstep(0.45, 1.0, n * 0.6 + length(q) * 0.7) * 0.35 * (0.5 + 0.5 * calm));
  col = mix(col, uSkyHi, smoothstep(0.82, 1.0, n) * 0.15 * calm);
  col = mix(col, uCore, exp(-r2 * 3.0) * 0.35);     // core glow behind the name
  col = mix(uSky0, col, uIntro);
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;      // dither: no banding
  gl_FragColor = vec4(col, 1.0);
}`;

const STAR_VS = /* glsl */`
uniform float uTime, uDpr;
attribute float aPhase, aSize, aTint;
varying float vTw;
varying float vTint;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vTw = 0.55 + 0.45 * sin(uTime * 1.3 + aPhase);
  vTint = aTint;
  gl_PointSize = aSize * uDpr;
}`;

const STAR_FS = /* glsl */`
uniform vec3 uStar;
uniform float uMono, uAlpha, uFade, uAdd;
varying float vTw;
varying float vTint;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.15, 0.5, d);
  vec3 tint = vTint < 0.5 ? uStar : (vTint < 1.5 ? vec3(0.914, 0.835, 1.0) : vec3(0.984, 0.812, 0.91));
  vec3 col = mix(tint, uStar, uMono);
  float alpha = a * vTw * uAlpha * uFade;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col * alpha, alpha * (1.0 - uAdd));
}`;

const CLOUD_VS = /* glsl */`
uniform float uTime, uPush;
uniform vec3 uMouseWorld;
varying vec3 vN;
varying vec3 vW;
varying float vDepth;
${GLSL_SNOISE3}
void main() {
  vec3 p = position + normal * snoise3(position * 1.25 + vec3(0.0, 0.0, uTime * 0.25)) * 0.04;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vec3 d = w.xyz - uMouseWorld;                       // cursor push (pointer hit on z = 1)
  float l = length(d);
  w.xyz += d / max(l, 0.001) * (1.0 - smoothstep(0.0, 1.6, l)) * 0.22 * uPush;
  vec4 mv = viewMatrix * w;
  vN = normalize(mat3(modelMatrix) * normal);
  vW = w.xyz;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const CLOUD_FS = /* glsl */`
uniform vec3 uShadow, uMid, uLit, uRim, uFog;
varying vec3 vN;
varying vec3 vW;
varying float vDepth;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 L = normalize(vec3(-0.55, 0.75, 0.4));          // upper-left key light
  float wrap = clamp((dot(N, L) + 0.4) / 1.4, 0.0, 1.0);
  vec3 col = mix(uShadow, uMid, smoothstep(0.0, 0.6, wrap));
  col = mix(col, uLit, smoothstep(0.55, 1.0, wrap));
  col += uRim * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5) * 0.9;
  col = mix(col, uFog, smoothstep(6.0, 18.0, vDepth));
  gl_FragColor = vec4(col, 1.0);
}`;

const PUFF_VS = /* glsl */`
uniform float uTime, uSpread, uGrow;
attribute float aPhase, aAlpha;
varying vec2 vUv;
varying float vA;
varying float vDepth;
void main() {
  vec3 c = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float size = length(instanceMatrix[0].xyz) * uGrow;
  c.x = c.x * uSpread + sin(uTime * 0.05 + aPhase) * 0.35;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  mv.xy += position.xy * size;                         // camera-facing billboard
  vDepth = -mv.z;
  vA = aAlpha * smoothstep(0.6, 3.0, vDepth);
  vUv = uv;
  gl_Position = projectionMatrix * mv;
}`;

const PUFF_FS = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uShadow, uLit, uFog;
varying vec2 vUv;
varying float vA;
varying float vDepth;
void main() {
  float a = texture2D(uMap, vUv).a * vA;
  if (a < 0.003) discard;
  vec3 col = mix(uShadow, uLit, smoothstep(0.15, 0.85, vUv.y));
  col = mix(col, uFog, smoothstep(6.0, 18.0, vDepth));
  gl_FragColor = vec4(col, a);
}`;

const NODE_VS = /* glsl */`
uniform float uTime, uDpr, uIntroT, uPulseOn, uPointerOn;
uniform vec3 uPointer;
attribute float aIndex, aKind;
varying float vKind;
varying float vGlow;
${GLSL_RING}
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec4 mv = viewMatrix * w;
  gl_Position = projectionMatrix * mv;
  float prox = uPointerOn * (1.0 - smoothstep(0.0, 1.2, distance(w.xyz, uPointer)));
  float ring = pulseRing(w.xyz);
  vKind = aKind;
  vGlow = 1.0 + 0.8 * prox + 1.6 * ring;
  float k = clamp((uIntroT - 200.0 - aIndex * 18.0) / 340.0, 0.0, 1.0) - 1.0;   // staggered pop, easeOutBack
  float pop = 1.0 + 2.70158 * k * k * k + 1.70158 * k * k;
  float size = aKind > 0.5 ? 11.0 * uPulseOn : 7.0 * pop * (1.0 + 0.35 * prox + 0.6 * ring);
  gl_PointSize = size * uDpr * (12.0 / max(-mv.z, 1.0));
}`;

const NODE_FS = /* glsl */`
uniform vec3 uNode, uPulse;
uniform float uNet, uAdd;
varying float vKind;
varying float vGlow;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float halo = 1.0 - smoothstep(0.0, 0.5, d);
  halo *= halo;
  float core = 1.0 - smoothstep(0.08, 0.2, d);
  vec3 col = mix(uNode, uPulse, vKind);
  col = mix(col, vec3(1.0), core * 0.55 * uAdd);       // hot white core at night
  float a = clamp((halo * 0.7 + core * 0.6) * 0.8 * vGlow, 0.0, 1.0) * uNet;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col * a, a * (1.0 - uAdd));
}`;

const LINE_VS = /* glsl */`
uniform float uTime, uPointerOn;
uniform vec3 uPointer;
attribute float aKind, aAlpha;
varying float vA;
varying float vKind;
${GLSL_RING}
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * w;
  float prox = uPointerOn * (1.0 - smoothstep(0.0, 1.6, distance(w.xyz, uPointer)));
  vA = aKind > 0.5 ? aAlpha : 1.0 + 0.9 * prox + 2.0 * pulseRing(w.xyz);
  vKind = aKind;
}`;

const LINE_FS = /* glsl */`
uniform vec3 uLine, uPulse;
uniform float uLineA, uNet, uAdd;
varying float vA;
varying float vKind;
void main() {
  vec3 col = mix(uLine, mix(uLine, uPulse, 0.55), vKind);
  float a = clamp(uLineA * vA, 0.0, 1.0) * uNet;
  gl_FragColor = vec4(col * a, a * (1.0 - uAdd));
}`;

const MOTE_VS = /* glsl */`
uniform float uTime, uDpr;
attribute float aPhase, aSize, aAlpha;
varying float vA;
void main() {
  vec3 p = position + vec3(sin(uTime * 0.07 + aPhase) * 0.35, cos(uTime * 0.05 + aPhase * 1.3) * 0.22, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  vec2 ndc = gl_Position.xy / max(gl_Position.w, 0.001);
  float clearText = smoothstep(0.55, 1.05, length(ndc / vec2(0.62, 0.5)));   // keep the text ellipse clear
  vA = aAlpha * clearText * smoothstep(0.4, 2.0, -mv.z);
  gl_PointSize = aSize * uDpr;
}`;

const MOTE_FS = /* glsl */`
uniform vec3 uMote;
uniform float uAdd, uGain, uFade;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = 1.0 - smoothstep(0.0, 0.5, d);
  a *= a * vA * uGain * uFade;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uMote * a, a * (1.0 - uAdd));
}`;

/* ---------- Module state ---------- */
let FX = null, home = null, stage = null, canvas = null;
let introOn = false;                    // html.fx-intro was set when the module started
const hero = { top: 0, h: 1, w: 1 };    // cached on fx:layout (no reads in scroll handlers)
let dive = 0;                           // 0..1 scroll progress through the hero
let lastHeroP = '';
let heroDived = false;                   // #home.hero-dived: CTAs faded past p .6
let renderer = null, G = null;          // WebGL renderer and the scene API
let readyMarked = false, shaderFailed = false, restoredOnce = false;
let fpsFrames = 0;
const L = {                             // loop state
  raf: 0, lastTick: 0, lastRender: 0, clock: 0,
  inView: true, visible: !doc.hidden, still: false, perfStill: false, forceUntil: 0,
};
const D = { level: 0, n: 0, sum: 0, done: false };   // auto-degrade sampling

if (window.FX) init();

function init() {
  FX = window.FX;
  home = doc.getElementById('home');
  stage = home && home.querySelector('.hero-stage');
  canvas = doc.getElementById('hero-canvas');
  introOn = root.classList.contains('fx-intro') && FX.motion;
  L.still = !!FX.reducedMotion;

  /* 1. Cloud dive + intro events (before, and independent of, three.js) */
  if (home) {
    measureHero();
    FX.onScroll(onScroll);
    FX.on('layout', onLayout);
  }
  FX.on('motion', onMotion);
  runIntroEvents();
  if (FX.debug) startFpsMeter();

  /* 2. WebGL scene */
  boot3D();
}

/* ---------- Cloud dive: --hero-p on #home ---------- */
function measureHero() {
  const r = home.getBoundingClientRect();
  hero.top = r.top + (window.scrollY || 0);
  hero.h = home.offsetHeight || 1;
  hero.w = home.offsetWidth || window.innerWidth || 1;
}

function onScroll(s) {
  dive = clamp01(s.y / hero.h);
  if (!FX.enabled || FX.reducedMotion) return;
  const p = s.y < hero.h * 1.2 ? dive.toFixed(3) : '1.000';
  if (p !== lastHeroP) { lastHeroP = p; home.style.setProperty('--hero-p', p); }
  const dived = +p > .6;                  // nearly invisible: drop CTA hit-testing
  if (dived !== heroDived) { heroDived = dived; home.classList.toggle('hero-dived', dived); }
}

function onLayout() {
  measureHero();
  onScroll(FX.scroll);
  if (G && G.relayout() && L.still) renderStill();
}

function onMotion() {
  if (home) {
    if (FX.reducedMotion) {
      home.style.removeProperty('--hero-p'); lastHeroP = '';
      home.classList.remove('hero-dived'); heroDived = false;
    }
    else onScroll(FX.scroll);
  }
  L.still = !!FX.reducedMotion || L.perfStill;
  if (!G) return;
  if (L.still) { cancelLoop(); renderStill(); } else schedule();
}

/* ---------- Intro events (always emitted, WebGL or not) ---------- */
function runIntroEvents() {
  FX.emit('intro', { phase: 'start' });
  if (introOn) {
    setTimeout(() => FX.emit('intro', { phase: 'title' }), 120);
    setTimeout(() => FX.emit('intro', { phase: 'done' }), 1300);
  } else {
    FX.emit('intro', { phase: 'done' });
  }
  setTimeout(() => root.classList.remove('fx-intro'), 3000);
}

/* ---------- Debug fps (?fx=debug) ---------- */
function startFpsMeter() {
  const el = doc.createElement('div');
  el.id = 'fx-debug-fps';
  el.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(el);
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const fps = Math.round(fpsFrames * 1000 / (now - last));
    fpsFrames = 0; last = now;
    const m = FX._mascotFps;
    let heroTxt = 'css';
    if (G && renderer) {
      const info = renderer.info.render;
      heroTxt = `${fps} fps · ${FX.tier}${D.level ? ' (degraded)' : ''}${L.still ? ' · static' : ''} · ${info.calls} calls · ${info.triangles} tris`;
    }
    el.textContent = `hero ${heroTxt}\nmascot ${typeof m === 'number' ? Math.round(m) + ' fps' : '–'}`;
  }, 500);
}

/* ---------- WebGL boot ---------- */
function useCss(reason, err) {
  FX.log('hero: CSS fallback —', reason, err || '');
  if (!readyMarked) { readyMarked = true; FX.markReady('hero', { renderer: 'css' }); }
}

async function boot3D() {
  if (!home || !stage || !canvas || !FX.enabled || !FX.allow3D()) return useCss('3D not allowed');
  const tier = TIERS[FX.tier] || TIERS.mid;
  let THREE, BGU;
  try {
    [THREE, BGU] = await Promise.all([
      import('three'),
      tier.puffs ? null : import('three/addons/utils/BufferGeometryUtils.js'),
    ]);
  } catch (err) { return useCss('three.js import failed', err); }

  try {
    renderer = new THREE.WebGLRenderer({
      canvas, alpha: false, antialias: FX.tier === 'high', powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.debug.onShaderError = () => { shaderFailed = true; };
    G = buildScene(THREE, BGU, tier);
    sizeToStage();
    G.relayout();
    try { await renderer.compileAsync(G.scene, G.camera); } catch (e) { /* compiles on first render instead */ }
  } catch (err) { teardown(); return useCss('WebGL init failed', err); }

  wireEvents(THREE, BGU, tier);
  firstFrame();
}

function sizeToStage() {
  G.resize(stage.clientWidth || hero.w, stage.clientHeight || hero.h);
}

/* Render the first real frame inside rAF, then crossfade the canvas in */
function firstFrame() {
  requestAnimationFrame(() => {
    if (!G || G.lost) return;
    if (L.still) G.frame(performance.now(), STILL_T, 0, true);
    else G.frame(performance.now(), L.clock, 0, false);
    G.render();
    if (shaderFailed) { teardown(); useCss('shader compile error'); return; }
    root.classList.add('hero3d-ready');
    if (!readyMarked) { readyMarked = true; FX.markReady('hero', { renderer: 'webgl' }); }
    if (FX.debug) FX.log('hero:', FX.tier, renderer.info.render);
    schedule();
  });
}

/* Give the GPU context back (the mascot may want the slot) and stay on the CSS sky */
function teardown() {
  cancelLoop();
  root.classList.remove('hero3d-ready');
  const r = renderer, g = G;
  G = null; renderer = null;
  try { if (g) g.dispose(); if (r) { r.dispose(); r.forceContextLoss(); } } catch (e) { /* already gone */ }
}

function wireEvents(THREE, BGU, tier) {
  if (G.theme !== FX.state.theme) G.setTheme(FX.state.theme, false);   // theme flipped while loading

  /* Loop gating */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      L.inView = entries[entries.length - 1].isIntersecting;
      schedule();
    }, { threshold: 0 }).observe(home);
  }
  FX.on('overlay', schedule);
  L.visible = !doc.hidden;                // re-read: a change during the three.js import was missed
  FX.on('visibility', ({ visible }) => { L.visible = visible !== false; schedule(); });

  /* Theme: re-read --hero-* tokens and lerp (re-render even when static or paused) */
  FX.on('theme', ({ theme }) => {
    if (!G) return;
    G.setTheme(theme, !L.still);
    if (L.still) renderStill();
    else { L.forceUntil = performance.now() + 950; schedule(); }
  });

  /* Resize: debounced, ignoring small height-only changes (mobile URL bar) */
  if ('ResizeObserver' in window) {
    let lastW = stage.clientWidth, lastH = stage.clientHeight, timer = 0;
    new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width), h = Math.round(entry.contentRect.height);
      if (w === lastW && Math.abs(h - lastH) < 120) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        lastW = w; lastH = h;
        if (!G || !w || !h) return;
        G.resize(w, h);                                   // resizing clears the drawing buffer…
        G.relayout();
        if (!L.raf) renderOnce();                         // …so repaint if the loop is not running
      }, 120);
    }).observe(stage);
  }

  /* Click / tap pulse ring (this module's only input listener) */
  home.addEventListener('pointerdown', e => {
    if (!G || L.still || !L.raf) return;
    if (e.target && e.target.closest && e.target.closest('a, button')) return;
    const r = home.getBoundingClientRect();
    G.ring(((e.clientX - r.left) / r.width) * 2 - 1, 1 - ((e.clientY - r.top) / r.height) * 2);
  }, { passive: true });

  /* Context loss: fall back to CSS, rebuild once on restore */
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    if (G) G.lost = true;
    cancelLoop();
    root.classList.remove('hero3d-ready');
    FX.log('hero: WebGL context lost');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (restoredOnce || !renderer) return;
    restoredOnce = true;
    try {
      if (G) G.dispose();
      G = buildScene(THREE, BGU, tier);
      if (D.level) G.degrade();
      sizeToStage();
      G.relayout();
    } catch (err) { teardown(); return useCss('rebuild after context loss failed', err); }
    FX.log('hero: WebGL context restored');
    firstFrame();
  });
}

/* ---------- Loop ---------- */
function shouldRun() {
  if (!G || G.lost || L.still || !L.visible || !L.inView) return false;
  return !FX.state.overlay || performance.now() < L.forceUntil;
}

function schedule() {
  if (!L.raf && shouldRun()) { L.lastTick = 0; L.lastRender = 0; L.raf = requestAnimationFrame(tick); }
}

function cancelLoop() {
  if (L.raf) cancelAnimationFrame(L.raf);
  L.raf = 0;
  pauseSampling();
}

function tick(now) {
  L.raf = 0;
  if (!shouldRun()) { pauseSampling(); return; }
  L.raf = requestAnimationFrame(tick);

  if (L.lastTick) sampleDegrade(now - L.lastTick);
  L.lastTick = now;
  if (L.still) return;                                  // auto-degrade may have stopped us
  if (G.every === 2 && L.lastRender && now - L.lastRender < 1000 / 30 - 2) return;   // low tier: 30 fps by time, not rAF parity

  const dt = L.lastRender ? Math.min((now - L.lastRender) / 1000, .05) : 1 / 60;
  L.lastRender = now;
  L.clock += dt;
  G.frame(now, L.clock, dt, false);
  G.render();
  fpsFrames++;
}

function renderStill() {
  if (!G || G.lost) return;
  G.frame(performance.now(), STILL_T, 0, true);
  G.render();
  fpsFrames++;
}

/* One frame outside the loop: the static frame, or the current animated state */
function renderOnce() {
  if (L.still) { renderStill(); return; }
  if (!G || G.lost) return;
  G.frame(performance.now(), L.clock, 0, false);
  G.render();
}

/* ---------- Auto-degrade: mean rAF delta over frames 30–120, then 90 more ---------- */
function sampleDegrade(delta) {
  if (D.done || FX.state.overlay) return;
  D.n++;
  const d = Math.min(delta, 100);
  if (D.level === 0) {
    if (D.n > 30) D.sum += d;
    if (D.n === 120) {
      if (D.sum / 90 > 22) { D.level = 1; D.n = 0; D.sum = 0; G.degrade(); FX.log('hero: degraded (level 1)'); }
      else D.done = true;
    }
  } else {
    if (D.n > 10) D.sum += d;                          // skip the realloc hitch
    if (D.n === 100) {
      D.done = true;
      if (D.sum / 90 > 28) {
        L.perfStill = L.still = true;
        cancelLoop();
        renderStill();
        FX.log('hero: degraded (static frame)');
      }
    }
  }
}

function pauseSampling() {
  if (!D.done) { D.n = 0; D.sum = 0; }
  L.lastTick = 0;
  L.lastRender = 0;
}

/* ---------- Text box (world units on z = 0), from layout offsets: transform-free ---------- */
function offsetIn(el, ancestor) {
  let x = 0, y = 0, n = el;
  while (n && n !== ancestor) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return n === ancestor ? { x, y } : null;
}

function measureTextBox() {
  const W = home.offsetWidth, H = home.offsetHeight;
  let full = null, name = null;
  if (W && H) {
    const pad = 20;
    for (const el of home.querySelectorAll('.hero-chip, .hero h1, .subtitle, .hero-buttons > *')) {
      const o = offsetIn(el, home);
      if (!o || !el.offsetWidth) continue;
      const r = { l: o.x - pad, r: o.x + el.offsetWidth + pad, t: o.y - pad, b: o.y + el.offsetHeight + pad };
      full = full ? { l: Math.min(full.l, r.l), r: Math.max(full.r, r.r), t: Math.min(full.t, r.t), b: Math.max(full.b, r.b) } : r;
      if (el.tagName === 'H1') name = r;
    }
  }
  const k = WORLD_PER_PX_K / (H || 1);
  const toBox = q => ({ x: Math.max(W / 2 - q.l, q.r - W / 2) * k, y0: (H / 2 - q.b) * k, y1: (H / 2 - q.t) * k });
  const f = full ? toBox(full) : SPEC_BOX;
  return {
    full: { x: Math.max(f.x, SPEC_BOX.x), y0: Math.min(f.y0, SPEC_BOX.y0), y1: Math.max(f.y1, SPEC_BOX.y1) },
    name: name ? toBox(name) : SPEC_NAME_BOX,
  };
}

/* Does a sphere (world xyz, radius) project into the box? z >= 0 uses the full
   text box; clouds behind the text plane only have to keep the name clear. */
function discHits(x, y, z, r, box) {
  const b = z >= 0 ? box.full : box.name;
  const f = CAM_Z / Math.max(CAM_Z - z, .5);
  const R = (r + CLOUD_MARGIN) * f, X = x * f, Y = y * f;
  return Math.abs(X) < b.x + R && Y > b.y0 - R && Y < b.y1 + R;
}

/* Smallest outward move (sideways, or vertical on portrait screens) that clears the box */
function solveRest(x, y, preferY, isClear) {
  if (isClear(x, y)) return [x, y];
  const sx = x < 0 ? -1 : 1, sy = y < .2 ? -1 : 1;
  for (let d = .15; d <= 9; d += .15) {
    const a = preferY ? [x, y + sy * d] : [x + sx * d, y];
    const b = preferY ? [x + sx * d, y] : [x, y + sy * d];
    if (isClear(a[0], a[1])) return a;
    if (isClear(b[0], b[1])) return b;
  }
  return [x + sx * 9, y];
}

/* ---------- Procedural content ---------- */
function sampleNodes(n, rng) {
  const pts = [];
  const area = LOBES.map(l => l[3] * l[3]);
  const total = area.reduce((s, a) => s + a, 0);
  let minD = .75 * Math.sqrt(42 / n);
  for (let tries = 1; pts.length < n && tries < 30000; tries++) {
    if (tries % 3000 === 0) minD *= .9;
    let pick = rng() * total, li = 0;
    while (li < LOBES.length - 1 && pick > area[li]) pick -= area[li++];
    const [cx, cy, cz, r] = LOBES[li];
    const u = rng() * 2 - 1, a = rng() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    const p = [cx + r * s * Math.cos(a), cy + r * u, cz + r * s * Math.sin(a)];
    if (p[1] < -1) continue;                                           // open, flat-ish base
    if (LOBES.some((l, j) => j !== li && dist3(p, l) < l[3])) continue;   // outer surface only
    if (pts.some(q => dist3(p, q) < minD)) continue;                   // even spacing
    pts.push(p);
  }
  return pts.sort((a, b) => a[0] - b[0]);                              // pop-in sweeps left → right
}

function linkNodes(nodes, max) {
  const seen = new Set(), list = [];
  nodes.forEach((p, i) => {
    nodes.map((q, j) => [j, dist3(p, q)])
      .filter(([j, d]) => j !== i && d <= 1.6)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .forEach(([j, d]) => {
        const a = Math.min(i, j), b = Math.max(i, j), key = a * 1000 + b;
        if (!seen.has(key)) { seen.add(key); list.push([a, b, d]); }
      });
  });
  return list.sort((x, y) => x[2] - y[2]).slice(0, max).map(([a, b]) => [a, b]);
}

function puffTexture(THREE) {
  const c = doc.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const blobs = [[128, 150, 92], [84, 152, 64], [172, 152, 66], [110, 112, 62], [152, 106, 58], [58, 166, 44], [198, 168, 44]];
  for (const [x, y, r] of blobs) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.55)');
    gr.addColorStop(.6, 'rgba(255,255,255,.25)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/* ---------- Scene ---------- */
function buildScene(THREE, BGU, tier) {
  const rng = mulberry32(0x20261107);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, .1, 100);
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, 0);
  const owned = [];
  const own = x => { owned.push(x); return x; };

  /* Palette (sRGB values in THREE.Color containers) and shared uniforms */
  const pal = {}, from = {}, to = {};
  for (const k in TOKENS) { pal[k] = new THREE.Color(); from[k] = new THREE.Color(); to[k] = new THREE.Color(); }
  const look = { ...LOOK.dark }, lookFrom = { ...look }, lookTo = { ...look };
  const scratch = new THREE.Color(), clearColor = new THREE.Color();
  const col = k => ({ value: pal[k] });
  const U = {
    time: { value: 0 }, dpr: { value: 1 }, res: { value: new THREE.Vector2(1, 1) }, mouse: { value: new THREE.Vector2() },
    scroll: { value: 0 }, nebIntro: { value: 1 }, fade: { value: 1 }, add: { value: 1 },
    starA: { value: 1 }, starMono: { value: 0 }, moteGain: { value: 1 },
    net: { value: 1 }, lineA: { value: .3 }, introT: { value: 1e6 }, pulseOn: { value: 1 },
    pointer: { value: new THREE.Vector3(0, 0, -99) }, pointerOn: { value: 0 },
    pulseOrigin: { value: new THREE.Vector3(0, 0, -99) }, pulseTime: { value: -100 },
    mouseWorld: { value: new THREE.Vector3(0, 0, -99) }, push: { value: 0 },
    spread: { value: 1 }, grow: { value: 1 },
  };
  /* Premultiplied blend: alpha 0 = additive glow (night), alpha a = normal "over" (dawn) */
  const glowBlend = {
    transparent: true, depthWrite: false, blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  };

  /* 1. Nebula backdrop: full-screen clip-space quad */
  const nebula = new THREE.Mesh(own(new THREE.PlaneGeometry(2, 2)), own(new THREE.ShaderMaterial({
    defines: { OCT: tier.oct },
    uniforms: {
      uTime: U.time, uRes: U.res, uMouse: U.mouse, uScroll: U.scroll, uIntro: U.nebIntro,
      uSky0: col('sky0'), uSky1: col('sky1'), uSky2: col('sky2'), uSky3: col('sky3'), uSkyHi: col('skyHi'), uCore: col('core'),
    },
    vertexShader: NEBULA_VS, fragmentShader: NEBULA_FS, depthTest: false, depthWrite: false,
  })));
  nebula.frustumCulled = false;
  nebula.renderOrder = -1;
  scene.add(nebula);

  /* 2. Starfield: a shell (r 20–40) in a cone behind the scene */
  const starGroup = new THREE.Group();
  scene.add(starGroup);
  const nS = tier.stars;
  const sPos = new Float32Array(nS * 3), sPhase = new Float32Array(nS), sSize = new Float32Array(nS), sTint = new Float32Array(nS);
  const cosMin = Math.cos(64 * Math.PI / 180);
  for (let i = 0; i < nS; i++) {
    const c = cosMin + (1 - cosMin) * rng(), s = Math.sqrt(1 - c * c), a = rng() * Math.PI * 2, r = 20 + rng() * 20;
    sPos[i * 3] = Math.cos(a) * s * r; sPos[i * 3 + 1] = Math.sin(a) * s * r; sPos[i * 3 + 2] = -c * r;
    sPhase[i] = rng() * Math.PI * 2;
    sSize[i] = 1.2 + Math.pow(rng(), 3) * 2.2;
    sTint[i] = Math.floor(rng() * 3);
  }
  const starGeo = own(new THREE.BufferGeometry());
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sPhase, 1));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
  starGeo.setAttribute('aTint', new THREE.BufferAttribute(sTint, 1));
  const stars = new THREE.Points(starGeo, own(new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uDpr: U.dpr, uStar: col('star'), uMono: U.starMono, uAlpha: U.starA, uFade: U.fade, uAdd: U.add },
    vertexShader: STAR_VS, fragmentShader: STAR_FS, ...glowBlend,
  })));
  stars.frustumCulled = false;
  starGroup.add(stars);

  /* 3a. Mesh clouds (high/mid): 5–7 merged icospheres each, one draw call per cloud */
  const clouds = [];
  if (!tier.puffs && BGU) {
    const cloudMat = own(new THREE.ShaderMaterial({
      uniforms: {
        uTime: U.time, uMouseWorld: U.mouseWorld, uPush: U.push,
        uShadow: col('cloudShadow'), uMid: col('cloudMid'), uLit: col('cloudLit'), uRim: col('cloudRim'), uFog: col('sky1'),
      },
      vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS,
    }));
    for (let i = 0; i < tier.clouds; i++) {
      const [x, y, z, s] = CLOUD_LAYOUT[i];
      const { geometry, puffs } = cloudGeometry(THREE, BGU, tier.detail, rng);
      const mesh = new THREE.Mesh(own(geometry), cloudMat);
      mesh.frustumCulled = false;
      scene.add(mesh);
      clouds.push({ mesh, puffs, bx: x, by: y, z, s, x, y, tx: x, ty: y, ph: rng() * Math.PI * 2, yaw: (rng() - .5) * 1.2 });
    }
  }

  /* 3b. Billboard puffs (low): one InstancedMesh, sorted back to front once */
  const puffs = [];
  let puffMesh = null;
  if (tier.puffs) {
    for (let i = 0; i < 16; i++) {
      puffs.push({ bx: (rng() * 2 - 1) * 12, by: (rng() * 2 - 1) * 3, z: -8 + rng() * 5, size: 3 + rng() * 3, a: .35 + rng() * .25 });
    }
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1;
      puffs.push({ bx: side * (4 + rng() * 6), by: -4.6 + rng() * 2.8, z: 2 + rng() * 6, size: 2.5 + rng() * 2, a: .5 + rng() * .35 });
    }
    puffs.sort((p, q) => p.z - q.z);
    for (const p of puffs) { p.x = p.tx = p.bx; p.y = p.ty = p.by; p.ph = rng() * Math.PI * 2; }
    const geo = own(new THREE.PlaneGeometry(1, 1));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(Float32Array.from(puffs, p => p.ph), 1));
    geo.setAttribute('aAlpha', new THREE.InstancedBufferAttribute(Float32Array.from(puffs, p => p.a), 1));
    puffMesh = new THREE.InstancedMesh(geo, own(new THREE.ShaderMaterial({
      uniforms: {
        uTime: U.time, uSpread: U.spread, uGrow: U.grow, uMap: { value: own(puffTexture(THREE)) },
        uShadow: col('cloudShadow'), uLit: col('cloudLit'), uFog: col('sky1'),
      },
      vertexShader: PUFF_VS, fragmentShader: PUFF_FS, transparent: true, depthWrite: false,
    })), puffs.length);
    puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    puffMesh.frustumCulled = false;
    puffMesh.renderOrder = 1;
    scene.add(puffMesh);
  }
  const m4 = new THREE.Matrix4();
  function writePuffs() {
    puffs.forEach((p, i) => puffMesh.setMatrixAt(i, m4.makeScale(p.size, p.size, p.size).setPosition(p.x, p.y, p.z)));
    puffMesh.instanceMatrix.needsUpdate = true;
  }

  /* 4. Cloud-silhouette node network: nodes + data pulses share one Points, edges + pointer links one LineSegments */
  const net = new THREE.Group();
  scene.add(net);
  const nodes = sampleNodes(tier.nodes, rng);
  const edges = linkNodes(nodes, tier.edges);
  const adj = nodes.map(() => []);
  edges.forEach(([a, b], i) => { adj[a].push(i); adj[b].push(i); });
  const N = nodes.length, P = edges.length ? tier.pulses : 0, LK = tier.links;

  const ptPos = new Float32Array((N + P) * 3), ptIdx = new Float32Array(N + P), ptKind = new Float32Array(N + P);
  nodes.forEach((n, i) => { ptPos.set(n, i * 3); ptIdx[i] = i; });
  for (let i = 0; i < P; i++) ptKind[N + i] = 1;
  const ptGeo = own(new THREE.BufferGeometry());
  const ptPosAttr = new THREE.BufferAttribute(ptPos, 3).setUsage(THREE.DynamicDrawUsage);
  ptGeo.setAttribute('position', ptPosAttr);
  ptGeo.setAttribute('aIndex', new THREE.BufferAttribute(ptIdx, 1));
  ptGeo.setAttribute('aKind', new THREE.BufferAttribute(ptKind, 1));
  const points = new THREE.Points(ptGeo, own(new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.time, uDpr: U.dpr, uIntroT: U.introT, uPulseOn: U.pulseOn, uPointerOn: U.pointerOn, uPointer: U.pointer,
      uPulseTime: U.pulseTime, uPulseOrigin: U.pulseOrigin, uNode: col('node'), uPulse: col('pulse'), uNet: U.net, uAdd: U.add,
    },
    vertexShader: NODE_VS, fragmentShader: NODE_FS, ...glowBlend,
  })));
  points.frustumCulled = false;
  points.renderOrder = 2;
  net.add(points);

  const nLV = edges.length * 2 + LK * 2;
  const lnPos = new Float32Array(nLV * 3), lnKind = new Float32Array(nLV), lnAlpha = new Float32Array(nLV).fill(1);
  edges.forEach(([a, b], i) => { lnPos.set(nodes[a], i * 6); lnPos.set(nodes[b], i * 6 + 3); });
  for (let i = edges.length * 2; i < nLV; i++) { lnKind[i] = 1; lnAlpha[i] = 0; }
  const lnGeo = own(new THREE.BufferGeometry());
  const lnPosAttr = new THREE.BufferAttribute(lnPos, 3).setUsage(THREE.DynamicDrawUsage);
  const lnAlphaAttr = new THREE.BufferAttribute(lnAlpha, 1).setUsage(THREE.DynamicDrawUsage);
  lnGeo.setAttribute('position', lnPosAttr);
  lnGeo.setAttribute('aKind', new THREE.BufferAttribute(lnKind, 1));
  lnGeo.setAttribute('aAlpha', lnAlphaAttr);
  const lines = new THREE.LineSegments(lnGeo, own(new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.time, uPointerOn: U.pointerOn, uPointer: U.pointer, uPulseTime: U.pulseTime, uPulseOrigin: U.pulseOrigin,
      uLine: col('line'), uPulse: col('pulse'), uLineA: U.lineA, uNet: U.net, uAdd: U.add,
    },
    vertexShader: LINE_VS, fragmentShader: LINE_FS, ...glowBlend,
  })));
  lines.frustumCulled = false;
  lines.renderOrder = 2;
  net.add(lines);

  /* Data pulses travel edge to edge along connected paths */
  const pulses = [];
  function routePulse(p, fromNode) {
    const options = fromNode == null ? [] : adj[fromNode].filter(i => i !== p.e);
    const e = options.length ? options[Math.floor(Math.random() * options.length)] : Math.floor(Math.random() * edges.length);
    const [a, b] = edges[e];
    const forward = fromNode == null ? Math.random() < .5 : a === fromNode;
    p.e = e; p.a = forward ? a : b; p.b = forward ? b : a; p.t = 0; p.dur = 1.6 + Math.random();
  }
  for (let i = 0; i < P; i++) { const p = { e: -1 }; routePulse(p, null); p.t = Math.random(); pulses.push(p); }

  function stepPulses(dt) {
    for (let i = 0; i < P; i++) {
      const p = pulses[i];
      p.t += dt / p.dur;
      if (p.t >= 1) routePulse(p, p.b);
      const a = nodes[p.a], b = nodes[p.b], o = (N + i) * 3;
      ptPos[o] = a[0] + (b[0] - a[0]) * p.t;
      ptPos[o + 1] = a[1] + (b[1] - a[1]) * p.t;
      ptPos[o + 2] = a[2] + (b[2] - a[2]) * p.t;
    }
    ptPosAttr.addUpdateRange(N * 3, P * 3);
    ptPosAttr.needsUpdate = true;
  }

  /* Pointer links: nearest nodes → the pointer's hit on plane z = -2 */
  const local = new THREE.Vector3();
  const nearest = Array.from({ length: LK }, () => ({ i: -1, d: Infinity }));
  let linksShown = false;
  function stepLinks(on) {
    if (!LK) return;
    const base = edges.length * 2;
    if (on < .01) {
      if (linksShown) {
        lnAlpha.fill(0, base);
        lnAlphaAttr.addUpdateRange(base, LK * 2); lnAlphaAttr.needsUpdate = true;
        linksShown = false;
      }
      return;
    }
    local.copy(U.pointer.value);
    net.worldToLocal(local);
    const scale = net.scale.x;
    nearest.forEach(n => { n.i = -1; n.d = Infinity; });
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const d = Math.hypot(n[0] - local.x, n[1] - local.y, n[2] - local.z) * scale;
      for (let j = 0; j < LK; j++) {
        if (d < nearest[j].d) {
          for (let k = LK - 1; k > j; k--) { nearest[k].i = nearest[k - 1].i; nearest[k].d = nearest[k - 1].d; }
          nearest[j].i = i; nearest[j].d = d;
          break;
        }
      }
    }
    for (let j = 0; j < LK; j++) {
      const v = base + j * 2, hit = nearest[j];
      const a = hit.i >= 0 && hit.d < 2.6 ? (1 - hit.d / 2.6) * 2 * on : 0;
      if (a > 0) {
        lnPos.set(nodes[hit.i], v * 3);
        lnPos[v * 3 + 3] = local.x; lnPos[v * 3 + 4] = local.y; lnPos[v * 3 + 5] = local.z;
      }
      lnAlpha[v] = a; lnAlpha[v + 1] = a * .2;          // fades toward the pointer
    }
    lnPosAttr.addUpdateRange(base * 3, LK * 6); lnPosAttr.needsUpdate = true;
    lnAlphaAttr.addUpdateRange(base, LK * 2); lnAlphaAttr.needsUpdate = true;
    linksShown = true;
  }

  /* 5. Foreground motes (high): large soft bokeh at z 3–6, sampled in view */
  let motes = null;
  if (tier.motes) {
    const n = tier.motes, mPos = new Float32Array(n * 3), mPhase = new Float32Array(n), mSize = new Float32Array(n), mAlpha = new Float32Array(n);
    const tanH = Math.tan((FOV / 2) * Math.PI / 180);
    for (let i = 0; i < n; i++) {
      const z = 3 + rng() * 3, half = (CAM_Z - z) * tanH;
      mPos[i * 3] = (rng() * 2.2 - 1.1) * half * 1.78;
      mPos[i * 3 + 1] = (rng() * 2.2 - 1.1) * half;
      mPos[i * 3 + 2] = z;
      mPhase[i] = rng() * Math.PI * 2;
      mSize[i] = 30 + rng() * 50;
      mAlpha[i] = .10 + rng() * .04;
    }
    const mGeo = own(new THREE.BufferGeometry());
    mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
    mGeo.setAttribute('aPhase', new THREE.BufferAttribute(mPhase, 1));
    mGeo.setAttribute('aSize', new THREE.BufferAttribute(mSize, 1));
    mGeo.setAttribute('aAlpha', new THREE.BufferAttribute(mAlpha, 1));
    motes = new THREE.Points(mGeo, own(new THREE.ShaderMaterial({
      uniforms: { uTime: U.time, uDpr: U.dpr, uMote: col('mote'), uAdd: U.add, uGain: U.moteGain, uFade: U.fade },
      vertexShader: MOTE_VS, fragmentShader: MOTE_FS, ...glowBlend,
    })));
    motes.frustumCulled = false;
    motes.renderOrder = 3;
    scene.add(motes);
  }

  /* ---- Theme: read tokens, lerp over 900 ms ---- */
  let themeLerp = null;
  function readTheme(theme, outPal, outLook) {
    const cs = getComputedStyle(root), fb = FALLBACK[theme] || FALLBACK.dark;
    for (const k in TOKENS) {
      scratch.setStyle(cs.getPropertyValue(TOKENS[k]).trim() || fb[k]);
      scratch.getRGB(outPal[k], THREE.SRGBColorSpace);
    }
    Object.assign(outLook, LOOK[theme] || LOOK.dark);
  }
  function setTheme(theme, animate) {
    api.theme = theme;
    for (const k in pal) from[k].copy(pal[k]);
    Object.assign(lookFrom, look);
    readTheme(theme, to, lookTo);
    themeLerp = { start: performance.now(), dur: animate ? 900 : 0 };
    stepTheme(themeLerp.start);
  }
  function stepTheme(now) {
    if (!themeLerp) return;
    const k = themeLerp.dur ? clamp01((now - themeLerp.start) / themeLerp.dur) : 1, e = easeInOutCubic(k);
    for (const key in pal) pal[key].lerpColors(from[key], to[key], e);
    for (const key in look) look[key] = lookFrom[key] + (lookTo[key] - lookFrom[key]) * e;
    applyLook();
    if (k === 1) themeLerp = null;
  }
  function applyLook() {
    clearColor.setRGB(pal.sky0.r, pal.sky0.g, pal.sky0.b, THREE.SRGBColorSpace);
    renderer.setClearColor(clearColor, 1);
    U.add.value = look.add; U.starA.value = look.starA; U.starMono.value = look.starMono; U.moteGain.value = look.moteGain;
  }
  const startTheme = FX.state.theme === 'light' ? 'light' : 'dark';      // late joiner: start from the current theme
  readTheme(startTheme, pal, look);
  applyLook();

  /* ---- Layout: rest positions that keep clouds out of the text box ---- */
  const layout = { small: false, placed: false };
  function cloudClear(c, x, y, box) {
    for (const sway of YAW_SAMPLES) {                    // test across the whole yaw sway
      const cs = Math.cos(c.yaw + sway), sn = Math.sin(c.yaw + sway);
      for (const [lx, ly, lz, r] of c.puffs) {
        const px = x + (lx * cs + lz * sn) * c.s, pz = c.z + (lz * cs - lx * sn) * c.s;
        if (discHits(px, y + ly * c.s, pz, r * c.s, box)) return false;
      }
    }
    return true;
  }
  /* Returns true when anything visible moved (so static frames re-render only when needed) */
  function relayout() {
    const small = (window.innerWidth || 1024) <= ((FX.bp && FX.bp.tablet) || 768);
    let changed = small !== layout.small;
    layout.small = small;
    const box = measureTextBox();
    const kx = Math.min(1, Math.max(.45, camera.aspect / 1.6));     // narrower than 16:10 pulls clouds in…
    const preferY = camera.aspect < 1;                               // …then portrait clears vertically
    const settle = (item, xy) => {
      if (Math.abs(xy[0] - item.tx) + Math.abs(xy[1] - item.ty) > 1e-3) changed = true;
      [item.tx, item.ty] = xy;
    };
    for (const c of clouds) settle(c, solveRest(c.bx * kx, c.by, preferY, (x, y) => cloudClear(c, x, y, box)));
    for (const p of puffs) settle(p, solveRest(p.bx * kx, p.by, preferY, (x, y) => !discHits(x, y, p.z, p.size * .36, box)));
    if (!layout.placed) {
      layout.placed = true;
      for (const c of clouds) { c.x = c.tx; c.y = c.ty; }
      for (const p of puffs) { p.x = p.tx; p.y = p.ty; }
      if (puffMesh) writePuffs();
    }
    return changed;
  }

  /* ---- Per-frame update ---- */
  const mouse = new THREE.Vector2(), target = new THREE.Vector2(), ray = new THREE.Vector3();
  let pointerOn = 0, degraded = false;
  function hitPlane(cx, cy, z, out) {
    ray.set(cx, cy, .5).unproject(camera).sub(camera.position).normalize();
    return out.copy(camera.position).addScaledVector(ray, (z - camera.position.z) / (ray.z || -1e-6));
  }

  function frame(now, t, dt, still) {
    stepTheme(now);
    const it = introOn && !still ? now - T0 : 1e6;
    const p = still ? 0 : dive;
    const k = still ? 1 : 1 - Math.pow(.94, dt * 60);              // mouse.lerp(target, .06) at 60 fps
    const Pt = FX.pointer;

    /* Pointer (fine pointers only) and touch sway */
    const topV = hero.top - FX.scroll.y;
    const inHero = !still && FX.finePointer && Pt.moved && Pt.y >= topV && Pt.y <= topV + hero.h;
    target.set(FX.finePointer && !still ? Pt.nx : 0, FX.finePointer && !still ? Pt.ny : 0);
    mouse.lerp(target, k);
    pointerOn += ((inHero ? 1 : 0) - pointerOn) * k;

    /* Camera: pointer parallax + cloud dive */
    const sway = FX.isTouch && !still ? Math.sin(t * .15) * .4 : 0;
    camera.position.set(mouse.x * .6 + sway, -mouse.y * .35 - .6 * p, CAM_Z - 5.5 * easeInOutCubic(p));
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    if (pointerOn > .001) {
      const cx = (Pt.x / hero.w) * 2 - 1, cy = 1 - ((Pt.y - topV) / hero.h) * 2;
      hitPlane(cx, cy, -2, U.pointer.value);
      hitPlane(cx, cy, 1, U.mouseWorld.value);
    }

    /* Shared uniforms + intro timeline */
    U.time.value = t;
    U.mouse.value.copy(mouse);
    U.scroll.value = p;
    U.nebIntro.value = clamp01(it / 600);
    U.fade.value = clamp01((it - 100) / 700);
    U.pointerOn.value = pointerOn;
    U.push.value = pointerOn;
    const glide = easeOutQuint(clamp01((it - 150) / 1050));
    const spread = (1.6 - .6 * glide) * (1 + .9 * p);
    const grow = 1 + .25 * p;
    const rest = still ? 1 : 1 - Math.exp(-dt * 2.5);           // eases rest-position changes after layout

    /* Clouds */
    for (const c of clouds) {
      c.x += (c.tx - c.x) * rest; c.y += (c.ty - c.y) * rest;
      c.mesh.position.set(c.x * spread + Math.sin(t * .05 + c.ph) * .3, c.y + Math.sin(t * .4 + c.ph) * .12, c.z);
      c.mesh.scale.setScalar(c.s * grow);
      c.mesh.rotation.y = c.yaw + Math.sin(t * YAW_W + c.ph) * YAW_A;
    }
    if (puffMesh) {
      U.spread.value = spread; U.grow.value = grow;
      let moved = false;
      for (const q of puffs) {
        const dx = q.tx - q.x, dy = q.ty - q.y;
        if (Math.abs(dx) + Math.abs(dy) > 1e-3) { q.x += dx * rest; q.y += dy * rest; moved = true; }
      }
      if (moved) writePuffs();
    }

    /* Stars follow the pointer slightly */
    starGroup.rotation.set(mouse.y * .04, mouse.x * .04, 0);

    /* Network */
    net.position.set(0, layout.small ? 1.6 : .3, -2);
    net.scale.setScalar(layout.small ? 1 : 1.5);
    net.rotation.y = Math.sin(t * .1) * .25 + mouse.x * .15;
    net.updateMatrixWorld();
    U.net.value = 1 - smoothstep(.2, .7, p);
    U.lineA.value = look.line * clamp01((it - 200) / 800);
    U.introT.value = it;
    const pulsing = P > 0 && !still && !degraded;
    U.pulseOn.value = pulsing ? clamp01((it - 900) / 400) : 0;
    if (pulsing) stepPulses(dt);
    stepLinks(still || degraded ? 0 : pointerOn);
  }

  /* ---- API ---- */
  const api = {
    scene, camera, lost: false, every: tier.every, theme: startTheme,
    frame,
    render() { renderer.render(scene, camera); },
    relayout,
    setTheme,
    resize(w, h) {
      const dpr = degraded ? 1 : Math.min(window.devicePixelRatio || 1, FX.dprCap || 1.5, 2400 / Math.max(window.innerWidth || w, 1));
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      U.dpr.value = dpr;
      U.res.value.set(w * dpr, h * dpr);
    },
    ring(cx, cy) {
      hitPlane(cx, cy, -2, U.pulseOrigin.value);
      U.pulseTime.value = U.time.value;
    },
    degrade() {
      degraded = true;
      stars.geometry.setDrawRange(0, Math.floor(nS / 2));
      if (motes) motes.visible = false;
      stepLinks(0);
      api.resize(stage.clientWidth || hero.w, stage.clientHeight || hero.h);
    },
    dispose() {
      owned.forEach(x => x.dispose());
      if (puffMesh) puffMesh.dispose();
      scene.clear();
    },
  };
  return api;
}

/* One cloud: 5–7 icospheres along x (biggest in the middle), merged, flattened base.
   Returns the puff list (local x, y, z, r) for the text-box solver. */
function cloudGeometry(THREE, BGU, detail, rng) {
  const n = 5 + Math.floor(rng() * 3);
  const parts = [], puffs = [];
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * 2 - 1;
    const centre = 1 - Math.abs(f);
    const lx = f * 1.15 + (rng() - .5) * .25;
    const r = .55 + .45 * (centre * .75 + rng() * .25);
    const ly = -.05 + centre * .35 + (rng() - .5) * .12;
    const lz = (rng() - .5) * .7;
    puffs.push([lx, ly, lz, r]);
    const g = new THREE.IcosahedronGeometry(r, detail);
    g.deleteAttribute('uv');
    g.translate(lx, ly, lz);
    parts.push(g);
  }
  const geometry = BGU.mergeGeometries(parts, false);
  parts.forEach(g => g.dispose());
  const pos = geometry.attributes.position, nor = geometry.attributes.normal, BASE = -.3;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y >= BASE) continue;
    pos.setY(i, BASE + (y - BASE) * .28);
    const k = Math.min(1, (BASE - y) * 2.2);              // bend base normals downward
    const nx = nor.getX(i) * (1 - k), ny = nor.getY(i) * (1 - k) - k, nz = nor.getZ(i) * (1 - k);
    const l = Math.hypot(nx, ny, nz) || 1;
    nor.setXYZ(i, nx / l, ny / l, nz / l);
  }
  geometry.computeBoundingSphere();
  return { geometry, puffs };
}
