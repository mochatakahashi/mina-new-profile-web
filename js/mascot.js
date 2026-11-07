/* =============================================================================
   js/mascot.js — the cloud buddy                               owner: MASCOT
   ES module (spec §6, contracts §9). Name lives in MASCOT_NAME below.

   Boot      window "load" -> requestIdleCallback -> start(). Exits before any
             import for ?fx=off, ?fx=nomascot and sessionStorage 'mochi-hidden'.
   Render    procedural three.js buddy (one small WebGL context) or an inline
             SVG twin (no WebGL, import failure, context loss). Same behaviour.
   Budget    zero DOM reads per frame (layout cache refreshed on fx:layout);
             3 style writes per frame (--m-x, --m-y, --m-scale); loop paused
             when away, when the tab is hidden and under reduced motion.

   ORIGINALITY CHECK (spec §6.1) — 2026-11-07 — RESULT: NO MATCH.
   Silhouette compared lobe by lobe (WebGL SDF body and SVG twin share the
   same six lobes): a white-lilac cumulus, wider than tall (~1.37:1), six
   soft lobes, a softly flattened base, no limbs below the body; low-set tall
   indigo oval eyes with two highlights each, pink blush, a small ink smile,
   two side puff arms, and a faceted (icosahedral) data node on a tilted orbit.
   - Kirby: single-lobe pink sphere with red feet, Warp Star -> no (6 lobes,
     white-lilac, no feet, the companion is a faceted node, not a star).
   - Lakitu's cloud / Goku's Flying Nimbus: cloud-as-vehicle with a rider,
     wide toothy grin / faceless yellow puff -> no (no rider, never ridden,
     small closed smile, no teeth).
   - Sanrio (Cinnamoroll etc.): puppy with long ears and a curled tail -> no
     (no ears, no tail, no animal features).
   - Pusheen: grey tabby cat -> no.  Care Bears / Funshine clouds: bears, or
     clouds as platforms/rainbows -> no (no bear, no rainbow, no symbol).
   - Platform cloud emoji: flat-bottomed 3-bump faceless glyph -> no (6 lobes,
     rounded base, face, arms, orbiting node).
   - Pikmin: stem/leaf/flower on the head -> no (nothing on the head).
   - Banned features absent: ears, horns, hats, wings, tail, lightning, rain,
     teeth, single eye, star-shaped companion.
   Checked analytically from the geometry (no browser available to this
   agent); integration testing should confirm visually with ?fx=no3d too.
   ============================================================================= */

/* ---------- Identity: rename the buddy here (one-line change) ---------- */
const MASCOT_NAME = 'Mochi';
const A11Y_NAME = `${MASCOT_NAME}, the cloud buddy`;

/* ---------- Placement tables (spec §6.3) ---------- */
const IDS = ['home', 'about', 'tech', 'leadership', 'ambassadorship', 'side-quests',
  'articles', 'certificates', 'hobbies', 'gallery', 'contact', 'footer'];
const SIDE = { home: 'right', about: 'left', tech: 'right', leadership: 'left', ambassadorship: 'right', 'side-quests': 'left',
  articles: 'right', certificates: 'left', hobbies: 'right', gallery: 'left', contact: 'right', footer: 'left' };
const STATION_Y = { home: .30, about: .30, tech: .45, leadership: .40, ambassadorship: .35, 'side-quests': .55, articles: .30,
  certificates: .35, hobbies: .50, gallery: .30, contact: .40, footer: .40 };
const SCALES_HOME = [1.3, 1, .8];
const SCALES = [1, .8, .64];
const SPRING_K = 48, SPRING_C = 11.8;
const PEEK_LEAN = 8 * Math.PI / 180;
const IDLE_T = { mode: 'idle', side: 'right', lean: 0 };

/* ---------- Speech lines (spec §6.4, verbatim; tech line per owner's lead) ----------
   d = desktop, s = short (<= 768px; also the touch "tap" wording when tap: true) */
const LINES = {
  home: { d: `Hi! I'm ${MASCOT_NAME}, Rodmina's cloud buddy. Welcome aboard!` },
  about: { d: "Rodmina's goal? Becoming a skilled solutions architect." },
  tech: { d: 'AWS and Azure: my favorite kind of clouds!' },
  leadership: { d: 'Founder Captain of AWS Cloud Club – APC, now Lead & President!', s: 'From Founder Captain to Lead & President!' },
  ambassadorship: { d: 'First Place, Whoscall x Gogolook Ambassador Program 2024!' },
  'side-quests': { d: 'Nine side quests in 2026: moderator, writer, volunteer, photographer…', s: 'Nine side quests in 2026. Tap a photo!' },
  articles: { d: 'Two event recaps, written for Kaka Computer.' },
  certificates: { d: 'TESDA NC2 certified, and pursuing more cloud certifications.' },
  hobbies: { d: 'Off the clock: reading, music, photography and exploring nature.', s: 'Beyond tech: reading, music, photography, nature.' },
  gallery: { d: 'Pick a year, then click any photo to open it.', s: 'Pick a year, then tap any photo to open it.', tap: true },
  contact: { d: 'Open to opportunities, collaborations, or a tech chat. Say hi!', s: 'Open to opportunities and collaborations. Say hi!' },
  footer: { d: 'Thanks for floating by!' },
  hover: { d: 'Click me to chat with the AI assistant.', s: 'Tap me to chat with the AI assistant.', tap: true },
  focus: { d: 'Press Enter to chat with the AI assistant.' },
  'gallery-year-1': { d: 'Year 1 · Campus: APC Microsoft Community, JISSA and JPCS.' },
  'gallery-2026': { d: '2026 · Beyond Campus: community days, hackathons and tech events.', s: '2026: community days, hackathons and tech events.' },
  'theme-light': { d: 'Good morning! Dawn mode on.' },
  'theme-dark': { d: 'Back to the stars.' },
};
const PHONE_LINES = new Set(['home', 'leadership', 'side-quests', 'gallery', 'contact']);
const HIT_SELECTOR = 'a, button, input, textarea, select, [role="button"], [role="tab"], iframe, .gallery-card';
const BUBBLE_ANCHOR = { top: [.5, .2], bottom: [.5, .8], left: [.1, .5], right: [.9, .5] };   /* box fractions */

/* ---------- Palette tokens: [css var, dark fallback, dawn fallback] ---------- */
const PALETTE = {
  lit: ['--mascot-lit', '#ffffff'], mid: ['--mascot-mid', '#e6dcff'], shadow: ['--mascot-shadow', '#a99beb', '#c8b8f5'],
  rim: ['--mascot-rim', '#ff7ac8', '#a78bfa'], ink: ['--mascot-ink', '#1e1b4b'], blush: ['--mascot-blush', '#ff8fb8', '#f472b6'],
  node: ['--mascot-node', '#f0abfc'], nodeChat: ['--mascot-node-chat', '#67e8f9'],
  outline: ['--mascot-outline', 'rgba(124,92,224,0)', 'rgba(124,92,224,.35)'],
};

/* ---------- Small helpers ---------- */
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (k, dt) => 1 - Math.pow(1 - k, dt * 60);          /* frame-rate independent lerp factor */
const rand = (a, b) => a + Math.random() * (b - a);
const easeInOutCubic = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
const bump = (elapsed, dur) => (elapsed >= 0 && elapsed < dur ? Math.sin(Math.PI * elapsed / dur) : 0);

const store = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* storage blocked: session rules degrade to per-page */ } },
};

function parseColor(str) {
  let m = /^#([0-9a-f]{3,8})$/i.exec(str);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = h.replace(/./g, c => c + c);
    const n = parseInt(h.slice(0, 6), 16);
    return { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  m = /rgba?\(([^)]+)\)/i.exec(str);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    return { r: (p[0] || 0) / 255, g: (p[1] || 0) / 255, b: (p[2] || 0) / 255, a: p.length > 3 ? p[3] : 1 };
  }
  return { r: 1, g: 1, b: 1, a: 1 };
}

function readPalette() {
  const root = document.documentElement, cs = getComputedStyle(root);
  const dawn = root.getAttribute('data-theme') === 'light';
  const out = {};
  for (const k in PALETTE) {
    const [name, dark, light] = PALETTE[k];
    out[k] = parseColor(cs.getPropertyValue(name).trim() || (dawn && light ? light : dark));
  }
  return out;
}

/* =============================================================================
   Body shape: smooth-min union of 6 spheres (spec §6.1), shared by both renderers
   ============================================================================= */
const BODY_SPHERES = [[0, 0, 0, .62], [-.52, -.12, 0, .44], [.52, -.12, 0, .44], [-.22, .38, 0, .42], [.25, .42, 0, .46], [0, -.30, 0, .50]];
const SMIN_K = .18;
const FLAT_Y = -.40;

function bodySdf(x, y, z) {
  let d = 0;
  for (let i = 0; i < BODY_SPHERES.length; i++) {
    const s = BODY_SPHERES[i];
    const di = Math.hypot(x - s[0], y - s[1], z - s[2]) - s[3];
    if (i === 0) { d = di; continue; }
    const h = Math.max(SMIN_K - Math.abs(d - di), 0) / SMIN_K;
    d = Math.min(d, di) - h * h * SMIN_K * .25;
  }
  return d;
}

/* Soft, C1-continuous flattening of the base (keeps the silhouette wider than tall) */
function flattenBase(y) {
  if (y >= FLAT_Y) return y;
  const d = FLAT_Y - y;
  return FLAT_Y - d / (1 + d * 1.6);
}

/* Unit direction -> point on the body surface (12-step binary search on the SDF) */
function projectToBody(dx, dy, dz) {
  let lo = 0, hi = 1.6;
  for (let i = 0; i < 12; i++) {
    const m = (lo + hi) / 2;
    if (bodySdf(dx * m, dy * m, dz * m) < 0) lo = m; else hi = m;
  }
  const r = (lo + hi) / 2;
  return [dx * r, flattenBase(dy * r), dz * r];
}

/* Front surface point + normal at (x, y) in body space: used to seat the face */
function surfaceFront(x, y) {
  let lo = 0, hi = 1.2;
  for (let i = 0; i < 16; i++) {
    const m = (lo + hi) / 2;
    if (bodySdf(x, y, m) < 0) lo = m; else hi = m;
  }
  const z = (lo + hi) / 2, e = .002;
  const nx = bodySdf(x + e, y, z) - bodySdf(x - e, y, z);
  const ny = bodySdf(x, y + e, z) - bodySdf(x, y - e, z);
  const nz = bodySdf(x, y, z + e) - bodySdf(x, y, z - e);
  const l = Math.hypot(nx, ny, nz) || 1;
  return { x, y, z, nx: nx / l, ny: ny / l, nz: nz / l };
}

/* =============================================================================
   WebGL renderer (three.js, no scene lights, ShaderMaterials fed by --mascot-*)
   ============================================================================= */
const BODY_VERT = /* glsl */`
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vY = position.y;
  gl_Position = projectionMatrix * mv;
}`;

const BODY_FRAG = /* glsl */`
uniform vec3 uLit;
uniform vec3 uMid;
uniform vec3 uShadow;
uniform vec3 uRim;
uniform vec3 uTint;
varying vec3 vN;
varying vec3 vV;
varying float vY;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(vV);
  vec3 L = normalize(vec3(-.45, .78, .62));
  float w = dot(N, L) * .5 + .5;
  vec3 col = mix(uShadow, uMid, smoothstep(.30, .40, w));            /* 3-band toon ramp */
  col = mix(col, uLit, smoothstep(.60, .70, w));
  col = mix(col, uTint, (1. - smoothstep(-.62, -.30, vY)) * .45);     /* lilac belly */
  float ndv = clamp(dot(N, V), 0., 1.);
  vec3 irid = mix(vec3(.72, .60, 1.), vec3(.50, .92, 1.), smoothstep(.15, .95, 1. - ndv));
  col = mix(col, irid, .08);                                          /* 8% iridescent sheen */
  col += uRim * pow(1. - ndv, 3.) * .8;                               /* fresnel rim */
  col += smoothstep(.955, .975, dot(N, normalize(L + V))) * .22;       /* toon gloss dot */
  gl_FragColor = vec4(col, 1.);
  #include <colorspace_fragment>
}`;

const OUTLINE_VERT = /* glsl */`
uniform float uW;
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * uW, 1.0);
}`;

const FLAT_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  gl_FragColor = vec4(uColor, uAlpha);
  #include <colorspace_fragment>
}`;

const UV_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const DISC_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float r = length(vUv - .5) * 2.;
  gl_FragColor = vec4(uColor, (1. - smoothstep(.1, 1., r)) * uAlpha);
  #include <colorspace_fragment>
}`;

const NODE_VERT = /* glsl */`
varying vec3 vN;
void main() {
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const NODE_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uGlow;
uniform float uFlash;
varying vec3 vN;
void main() {
  float l = .62 + .5 * max(dot(normalize(vN), normalize(vec3(-.4, .8, .6))), 0.);   /* faceted shading */
  gl_FragColor = vec4(mix(uColor * l * uGlow, vec3(1.), uFlash), 1.);
  #include <colorspace_fragment>
}`;

function buildBodyGeometry(THREE, detail) {
  const ico = new THREE.IcosahedronGeometry(1, detail);
  const src = ico.getAttribute('position');
  const ids = new Map(), pos = [], index = [];
  for (let i = 0; i < src.count; i++) {               /* weld the non-indexed sphere, then project */
    const x = src.getX(i), y = src.getY(i), z = src.getZ(i);
    const key = Math.round(x * 1e5) + ',' + Math.round(y * 1e5) + ',' + Math.round(z * 1e5);
    let id = ids.get(key);
    if (id === undefined) {
      id = pos.length / 3;
      ids.set(key, id);
      const p = projectToBody(x, y, z);
      pos.push(p[0], p[1], p[2]);
    }
    index.push(id);
  }
  ico.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

function createWebGLRenderer(THREE, host, { tier, onLost }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'mascot-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const lost = e => { e.preventDefault(); onLost(); };
  let renderer = null;

  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    canvas.addEventListener('webglcontextlost', lost, false);
    const dprCap = tier === 'high' ? 2 : 1.5;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, .1, 20);
    camera.position.set(0, 0, 5.2);

    /* Palette: uniforms hold these Color objects; theme changes lerp them in place */
    const KEYS = Object.keys(PALETTE).filter(k => k !== 'outline');
    const col = {}, goal = {};
    KEYS.concat('outline').forEach(k => { col[k] = new THREE.Color(); goal[k] = new THREE.Color(); });
    let outlineA = 0, outlineGoal = 0, lerping = false, lerpLeft = 0;

    const bodyMat = new THREE.ShaderMaterial({
      uniforms: { uLit: { value: col.lit }, uMid: { value: col.mid }, uShadow: { value: col.shadow }, uRim: { value: col.rim }, uTint: { value: new THREE.Color(0xc4b5fd) } },
      vertexShader: BODY_VERT, fragmentShader: BODY_FRAG,
    });
    const outlineMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col.outline }, uAlpha: { value: 0 }, uW: { value: .028 } },
      vertexShader: OUTLINE_VERT, fragmentShader: FLAT_FRAG, side: THREE.BackSide, transparent: true,
    });
    const inkMat = new THREE.MeshBasicMaterial();
    inkMat.color = col.ink;
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const blushMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col.blush }, uAlpha: { value: .55 } },
      vertexShader: UV_VERT, fragmentShader: DISC_FRAG, transparent: true, depthWrite: false,
    });
    const shadowMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: col.ink }, uAlpha: { value: .25 } },
      vertexShader: UV_VERT, fragmentShader: DISC_FRAG, transparent: true, depthWrite: false,
    });
    const nodeColor = new THREE.Color();
    const nodeMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: nodeColor }, uGlow: { value: 1 }, uFlash: { value: 0 } },
      vertexShader: NODE_VERT, fragmentShader: NODE_FRAG,
    });
    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = haloCanvas.height = 64;
    const hctx = haloCanvas.getContext('2d');
    const grad = hctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(.35, 'rgba(255,255,255,.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    hctx.fillStyle = grad;
    hctx.fillRect(0, 0, 64, 64);
    const haloTex = new THREE.CanvasTexture(haloCanvas);
    haloTex.colorSpace = THREE.SRGBColorSpace;
    const haloMat = new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    haloMat.color = nodeColor;
    const materials = [bodyMat, outlineMat, inkMat, whiteMat, blushMat, shadowMat, nodeMat, haloMat];

    /* Rig: rig (bob, head turn, bank) > squash (pivot at the base) > core > body */
    const rig = new THREE.Group();
    scene.add(rig);
    const squash = new THREE.Group();
    squash.position.y = -.58;
    rig.add(squash);
    const core = new THREE.Group();
    core.position.y = .58;
    squash.add(core);
    const bodyG = new THREE.Group();
    bodyG.scale.set(1, .92, .85);
    core.add(bodyG);

    const detail = tier === 'high' ? 20 : tier === 'mid' ? 16 : 12;
    const bodyGeo = buildBodyGeometry(THREE, detail);
    bodyG.add(new THREE.Mesh(bodyGeo, bodyMat));
    const hull = new THREE.Mesh(bodyGeo, outlineMat);            /* dawn-only inverted-hull outline */
    hull.visible = false;
    bodyG.add(hull);

    /* Face, seated on the SDF surface and oriented to its normal */
    const Z = new THREE.Vector3(0, 0, 1), n = new THREE.Vector3();
    const seat = (obj, x, y, lift) => {
      const p = surfaceFront(x, y);
      n.set(p.nx, p.ny, p.nz);
      obj.position.set(p.x + p.nx * lift, p.y + p.ny * lift, p.z + p.nz * lift);
      obj.quaternion.setFromUnitVectors(Z, n);
      obj.userData.base = obj.position.clone();
      bodyG.add(obj);
      return obj;
    };
    const eyeGeo = new THREE.SphereGeometry(.085, 24, 16);
    const hlBigGeo = new THREE.SphereGeometry(.028, 12, 8);
    const hlSmallGeo = new THREE.SphereGeometry(.014, 10, 6);
    const happyGeo = new THREE.TorusGeometry(.058, .016, 8, 20, Math.PI);
    const eyes = [-1, 1].map(sx => {
      const g = new THREE.Group();
      const ball = new THREE.Mesh(eyeGeo, inkMat);
      ball.scale.set(1, 1.35, .5);
      const h1 = new THREE.Mesh(hlBigGeo, whiteMat);
      h1.position.set(.03, .05, .04);
      h1.scale.z = .4;
      const h2 = new THREE.Mesh(hlSmallGeo, whiteMat);
      h2.position.set(-.02, -.03, .04);
      h2.scale.z = .4;
      const arc = new THREE.Mesh(happyGeo, inkMat);              /* ^ ^ happy eyes */
      arc.position.set(0, -.012, .012);
      arc.visible = false;
      g.add(ball, h1, h2, arc);
      seat(g, sx * .20, .08, -.012);
      return { g, ball, h1, h2, arc };
    });
    const blushGeo = new THREE.CircleGeometry(.09, 24);
    [-1, 1].forEach(sx => seat(new THREE.Mesh(blushGeo, blushMat), sx * .34, -.06, .008));
    const mouth = seat(new THREE.Group(), 0, -.03, .002);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(.06, .014, 8, 16, Math.PI), inkMat);
    smile.rotation.z = Math.PI;
    const oMouth = new THREE.Mesh(new THREE.TorusGeometry(.035, .014, 8, 20), inkMat);
    oMouth.position.y = -.035;
    const grin = new THREE.Mesh(new THREE.TorusGeometry(.085, .016, 8, 24, Math.PI), inkMat);
    grin.rotation.z = Math.PI;
    mouth.add(smile, oMouth, grin);

    /* Arms: puffs pivoting at the body edge (pushed out so they read at rest) */
    const armGeo = new THREE.SphereGeometry(.16, 20, 14);
    const arms = [-1, 1].map(sx => {
      const pivot = new THREE.Group();
      pivot.position.set(sx * .76, -.15, .14);
      core.add(pivot);
      const puff = new THREE.Mesh(armGeo, bodyMat);
      puff.position.set(sx * .15, -.02, 0);
      puff.scale.set(1.25, .9, .9);
      pivot.add(puff);
      const ring = new THREE.Mesh(armGeo, outlineMat);
      ring.visible = false;
      puff.add(ring);
      return { pivot, ring };
    });

    /* Signature: faceted data node on a tilted orbit (passes behind the body) */
    const nodePivot = new THREE.Group();
    nodePivot.position.y = .1;                           /* orbit clears the arm puffs */
    nodePivot.rotation.x = 20 * Math.PI / 180;
    rig.add(nodePivot);
    const nodeG = new THREE.Group();
    nodePivot.add(nodeG);
    const node = new THREE.Mesh(new THREE.IcosahedronGeometry(.05, 0), nodeMat);
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(.34);
    nodeG.add(node, halo);

    /* Soft floating shadow */
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .26), shadowMat);
    shadow.position.set(0, -.92, -.4);
    scene.add(shadow);

    let sized = '';
    return {
      kind: 'webgl',
      ready: renderer.compileAsync ? renderer.compileAsync(scene, camera).catch(() => {}) : Promise.resolve(),
      resize(px) {
        const dpr = Math.min(window.devicePixelRatio || 1, dprCap), key = px + '@' + dpr;
        if (key === sized) return;
        sized = key;
        renderer.setPixelRatio(dpr);
        renderer.setSize(px, px, false);
      },
      setPalette(p, instant) {
        for (const k of KEYS) goal[k].setRGB(p[k].r, p[k].g, p[k].b, THREE.SRGBColorSpace);
        goal.outline.setRGB(p.outline.r, p.outline.g, p.outline.b, THREE.SRGBColorSpace);
        outlineGoal = p.outline.a;
        if (instant) {
          for (const k in col) col[k].copy(goal[k]);
          outlineA = outlineGoal;
          lerping = false;
        } else { lerping = true; lerpLeft = .6; }
      },
      render(p, dt) {
        if (lerping) {                                       /* ~600ms theme crossfade */
          lerpLeft -= dt > 0 ? dt : 1;
          const k = lerpLeft <= 0 ? 1 : 1 - Math.exp(-dt * 9);
          for (const key in col) col[key].lerp(goal[key], k);
          outlineA += (outlineGoal - outlineA) * k;
          if (lerpLeft <= 0) lerping = false;
        }
        rig.position.y = -.04 + p.y;
        rig.rotation.set(p.rx, p.ry, p.rz);
        squash.scale.set(p.sx, p.sy, p.sx);
        const showArc = p.happy > .6;
        for (const e of eyes) {
          const b = e.g.userData.base;
          e.g.position.set(b.x + p.eyeX, b.y + p.eyeY + .02 * p.happy, b.z);
          e.arc.visible = showArc;
          e.ball.visible = !showArc;
          e.ball.scale.y = 1.35 * Math.max(.06, p.eyeOpen * (1 - .65 * p.happy));
          e.h1.visible = e.h2.visible = !showArc && p.eyeOpen > .5;
        }
        blushMat.uniforms.uAlpha.value = .55 * p.blush;
        smile.visible = p.mouth === 'smile';
        oMouth.visible = p.mouth === 'o';
        grin.visible = p.mouth === 'grin';
        mouth.scale.y = p.mouthY;
        arms[0].pivot.rotation.z = -p.armL;
        arms[1].pivot.rotation.z = p.armR;
        nodeG.position.set(Math.cos(p.node) * .95, 0, Math.sin(p.node) * .95);
        node.rotation.set(p.node * 1.3, p.node * 2.1, 0);
        node.scale.setScalar(.9 + .2 * p.nodePulse);
        nodeColor.copy(col.node).lerp(col.nodeChat, p.nodeChat);
        nodeMat.uniforms.uGlow.value = .85 + .35 * p.nodePulse;
        nodeMat.uniforms.uFlash.value = p.nodeFlash;
        haloMat.opacity = Math.min(1, .45 + .4 * p.nodePulse + p.nodeFlash);
        shadow.scale.set(p.shadow, p.shadow, 1);
        shadowMat.uniforms.uAlpha.value = .25 * p.shadowA;
        const outlined = outlineA > .01;
        hull.visible = arms[0].ring.visible = arms[1].ring.visible = outlined;
        outlineMat.uniforms.uAlpha.value = outlineA;
        renderer.render(scene, camera);
      },
      dispose(contextLost) {
        canvas.removeEventListener('webglcontextlost', lost, false);
        scene.traverse(o => { if (o.geometry && !o.isSprite) o.geometry.dispose(); });   /* sprite quad is shared by three */
        materials.forEach(m => m.dispose());
        haloTex.dispose();
        renderer.dispose();
        if (!contextLost) renderer.forceContextLoss();
        canvas.remove();
      },
    };
  } catch (err) {
    canvas.removeEventListener('webglcontextlost', lost, false);
    if (renderer) renderer.dispose();
    canvas.remove();
    throw err;
  }
}

/* =============================================================================
   SVG renderer (same silhouette: 6 lobes in scene units x 44px, centre 60,46)
   ============================================================================= */
const SVG_LOBES = [[60, 46, 27.3, 25.1], [37.1, 50.9, 19.4, 17.8], [82.9, 50.9, 19.4, 17.8],
  [50.3, 30.6, 18.5, 17], [71, 29, 20.2, 18.6], [60, 57, 22, 15.5]];
const SVG_UNIT = 44;

function svgMarkup() {
  const lobes = grow => SVG_LOBES.map(([cx, cy, rx, ry]) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${(rx + grow).toFixed(1)}" ry="${(ry + grow).toFixed(1)}"/>`).join('');
  const node = cls => `<g class="m-node ${cls}"><g class="m-orb-x"><g class="m-orb-y">` +
    '<circle class="m-node-halo" cx="60" cy="42" r="6.5"/>' +
    '<polygon class="m-node-core" points="60,39.4 62.25,40.7 62.25,43.3 60,44.6 57.75,43.3 57.75,40.7"/>' +
    '<polygon class="m-node-facet" points="60,39.4 62.25,40.7 60,42 57.75,40.7"/></g></g></g>';
  const arm = (cls, cx) => `<g class="m-arm ${cls}"><ellipse class="m-arm-rim" cx="${cx}" cy="53.5" rx="10.2" ry="7.7"/>` +
    `<ellipse class="m-arm-fill" cx="${cx}" cy="53.5" rx="8.8" ry="6.3"/></g>`;
  const eye = (cls, cx) => `<g class="m-eye ${cls}"><g class="m-eye-blink">` +
    `<ellipse class="m-eye-ball" cx="${cx}" cy="42.8" rx="3.7" ry="5"/>` +
    `<circle class="m-eye-hl" cx="${(cx + 1.3).toFixed(1)}" cy="40.6" r="1.25"/>` +
    `<circle class="m-eye-hl" cx="${(cx - .9).toFixed(1)}" cy="44.1" r=".62"/></g></g>`;
  return `<svg class="mascot-svg" viewBox="0 0 120 90" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="mascot-g-body" gradientUnits="userSpaceOnUse" cx="50" cy="26" r="60">
      <stop class="m-stop-lit" offset="0"/><stop class="m-stop-lit" offset=".42"/><stop class="m-stop-mid" offset="1"/>
    </radialGradient>
    <linearGradient id="mascot-g-tint" gradientUnits="userSpaceOnUse" x1="0" y1="50" x2="0" y2="75">
      <stop class="m-stop-shade" offset="0" stop-opacity="0"/><stop class="m-stop-shade" offset="1" stop-opacity=".6"/>
    </linearGradient>
    <radialGradient id="mascot-g-blush"><stop class="m-stop-blush" offset="0"/><stop class="m-stop-blush" offset="1" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse class="m-shadow" cx="60" cy="83" rx="25" ry="3.4"/>
  <g class="m-bob"><g class="m-rig">
    ${node('m-node-back')}
    ${arm('m-arm-l', 20)}${arm('m-arm-r', 100)}
    <g class="m-rim">${lobes(1.5)}</g>
    <g class="m-fill">${lobes(0)}</g>
    <g class="m-tint">${lobes(0)}</g>
    <ellipse class="m-gloss" cx="47" cy="22" rx="6.5" ry="3.4" transform="rotate(-22 47 22)"/>
    <g class="m-face">
      <ellipse class="m-blush" cx="45" cy="48.4" rx="4.6" ry="3.1"/><ellipse class="m-blush" cx="75" cy="48.4" rx="4.6" ry="3.1"/>
      <g class="mascot-svg-eyes">${eye('m-eye-l', 51.2)}${eye('m-eye-r', 68.8)}<path class="m-happy" d="M47.8 43.6Q51.2 39.2 54.6 43.6M65.4 43.6Q68.8 39.2 72.2 43.6"/></g>
      <path class="m-mouth m-mouth-smile" d="M57.4 46.9Q60 49.9 62.6 46.9"/>
      <ellipse class="m-mouth m-mouth-o" cx="60" cy="48.6" rx="1.6" ry="1.9"/>
      <path class="m-mouth m-mouth-grin" d="M56.2 46.8Q60 52.4 63.8 46.8Z"/>
    </g>
    ${node('m-node-front')}
  </g></g>
</svg>`;
}

function createSvgRenderer(host) {
  host.insertAdjacentHTML('beforeend', svgMarkup());
  const svg = host.lastElementChild;
  const rig = svg.querySelector('.m-rig'), eyes = svg.querySelector('.mascot-svg-eyes');
  let lastRig = '', lastEyes = '';
  return {
    kind: 'svg',
    resize() {},
    setPalette() {},                                   /* colours come straight from CSS vars */
    render(p) {
      const r = `translate(0 ${(-p.hop * SVG_UNIT).toFixed(2)}) rotate(${(-p.rz * 57.2958).toFixed(2)} 60 52) ` +
        `translate(60 76) scale(${p.sx.toFixed(3)} ${p.sy.toFixed(3)}) translate(-60 -76)`;
      if (r !== lastRig) { rig.setAttribute('transform', r); lastRig = r; }
      const e = `translate(${(p.eyeX / .05 * 2.5).toFixed(2)} ${(-p.eyeY / .04 * 2.5).toFixed(2)})`;
      if (e !== lastEyes) { eyes.setAttribute('transform', e); lastEyes = e; }
    },
    dispose() { svg.remove(); },
  };
}

/* =============================================================================
   Controller
   ============================================================================= */
const MARKUP = `<div class="mascot-body"></div>
<button type="button" id="mascot-btn" class="mascot-hit" aria-controls="ai-chat-panel" aria-expanded="false"></button>
<button type="button" class="mascot-dismiss" aria-label="Hide cloud buddy"><span aria-hidden="true">&times;</span></button>
<div class="mascot-bubble" aria-hidden="true" data-place="top"><span class="mascot-bubble-text"></span></div>`;

async function start(FX) {
  if (document.getElementById('mascot')) return;
  const doc = document, root = doc.documentElement;

  /* ---------- DOM: #mascot sits immediately before #ai-chat-widget ---------- */
  const el = doc.createElement('div');
  el.id = 'mascot';
  el.innerHTML = MARKUP;
  const bodyHost = el.querySelector('.mascot-body');
  const btn = el.querySelector('#mascot-btn');
  const dismissBtn = el.querySelector('.mascot-dismiss');
  const bubble = el.querySelector('.mascot-bubble');
  const typed = doc.createElement('span'), ghost = doc.createElement('span');
  ghost.className = 'mascot-bubble-ghost';                 /* untyped rest keeps the bubble size fixed */
  el.querySelector('.mascot-bubble-text').append(typed, ghost);
  const trail = doc.createElement('div');                  /* private fixed layer for flight puffs */
  trail.className = 'mascot-trail';
  trail.setAttribute('aria-hidden', 'true');
  const widget = doc.getElementById('ai-chat-widget');
  if (widget && widget.parentNode) {
    widget.parentNode.insertBefore(trail, widget);
    widget.parentNode.insertBefore(el, widget);
  } else doc.body.append(trail, el);
  syncChat();                                              /* labelled from the first moment it exists */
  btn.disabled = dismissBtn.disabled = true;               /* inert until its listeners are attached */

  /* ---------- State ---------- */
  const st = {
    section: FX.state.section || 'home', reduced: !FX.motion, visible: !doc.hidden, dead: false, ready: false,
    x: -400, y: -400, s: 1, vx: 0, vy: 0, vs: 0, fvx: 0, fvy: 0,
    key: '', mode: '', side: 'right', keyAt: -1e9, glueKey: '', lastSy: FX.scroll.y, flight: null, entrance: null,
    arrival: null, recheck: false, raf: 0, last: 0,
    hover: false, focusVis: false, selfFocus: false, pressPending: false,
    lastInputAt: performance.now(), lastScrollAt: 0, shy: false, shyNear: 0, shyLeft: 0, focusOv: null,
    peekOut: false, dockOut: false, slideAt: 0, patrolY: 0, patrol: null, patrolRef: performance.now(), patrolDelay: rand(10000, 14000),
    puffs: 0, secTimer: 0, panelTimer: 0, focusTimer: 0, flashTimer: 0, squintTimer: 0,
  };
  const A = {                                              /* animation channels */
    t: 0, gx: 0, gy: 0, headX: 0, headY: 0, happy: 0, whee: 0, sleepy: 0, chat: FX.state.chatOpen ? 1 : 0, v: 0, moving: false,
    bank: 0, lean: 0, hopY: 0, hopV: 0, pop: 1, popAt: 0,
    blinkAt: -1e9, blinkNext: performance.now() + rand(2500, 6000), blinkDouble: false,
    waveAt: -1e9, hoverWaveAt: -1e9, hopAt: -1e9, nodAt: -1e9, lookAt: -1e9, squashAt: -1e9, talkAt: -1e9,
    flashAt: -1e9, squintUntil: 0, wobbleAt: -1e9,
  };
  const pose = { y: 0, hop: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, eyeX: 0, eyeY: 0, eyeOpen: 1, happy: 0, blush: 1,
    mouth: 'smile', mouthY: 1, armL: -.12, armR: -.12, node: .5, nodePulse: 1, nodeChat: 0, nodeFlash: 0, shadow: 1, shadowA: 1 };
  const B = { visible: false, timer: 0, typeTimer: 0, lastAt: -1e9, hoverAt: -1e9, readyAt: 0, lastTry: 0, sec: null, evt: null };
  const said = new Set((() => { try { const a = JSON.parse(store.get('mochi-said') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } })());
  const L = { bpW: 0, vw: 0, vh: 0, base: 150, nav: 76, safeB: 0, heroH: 1, heroPar: false, sec: {}, panel: null };
  const tgt = { mode: 'peek', side: 'left', key: '', x: 0, y: 0, s: 1, lean: 0, glue: false };
  const held = { ...tgt };
  let heldSy = 0;
  let R = null;

  /* ---------- Layout cache (DOM reads happen only here, on init and fx:layout) ---------- */
  function rectOf(node, ySc, shift = 0) {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return { l: r.left, r: r.right, t: r.top + ySc - shift, b: r.bottom + ySc - shift, w: r.width, h: r.height };
  }
  const inflate = (r, d) => r && { l: r.l - d, r: r.r + d, t: r.t - d, b: r.b + d, w: r.w + 2 * d, h: r.h + 2 * d };
  function contentBox(node) {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    if (!r.width) return null;
    if (node.classList.contains('bento-grid')) return { l: r.left, r: r.right };
    const cs = getComputedStyle(node);
    return { l: r.left + (parseFloat(cs.paddingLeft) || 0), r: r.right - (parseFloat(cs.paddingRight) || 0) };
  }
  function measureSection(id, ySc, heroShift) {
    let secEl, anchorEl, avoidEls, contentEl = null, boxEl;
    if (id === 'home') {
      secEl = doc.getElementById('home');
      anchorEl = doc.querySelector('.hero h1');
      avoidEls = ['.hero-chip', '.hero h1', '.subtitle', '.hero-buttons'].map(s => doc.querySelector(s));
      boxEl = doc.querySelector('.hero-content');
    } else if (id === 'footer') {
      secEl = doc.querySelector('.footer');
      anchorEl = doc.querySelector('.footer .container p:first-child');
      avoidEls = secEl ? [...secEl.querySelectorAll('.container p')] : [];
      boxEl = secEl && secEl.querySelector('.container');
    } else {
      secEl = doc.getElementById(id);
      if (!secEl) return null;
      anchorEl = secEl.querySelector('.section-title');
      avoidEls = [secEl.querySelector('.section-eyebrow'), anchorEl];
      contentEl = [...secEl.querySelectorAll('.gallery-tabs, .bento-grid')].find(n => n.offsetHeight > 0) || null;
      boxEl = [...secEl.querySelectorAll('.bento-grid')].find(n => n.offsetWidth > 0) || secEl.querySelector('.container');
    }
    const s = rectOf(secEl, ySc);
    if (!s) return null;
    const shift = id === 'home' ? heroShift : 0;
    const content = rectOf(contentEl, ySc);
    const band = id === 'home' ? { t: s.t + L.nav, b: s.b - 96 }
      : id === 'footer' ? { t: s.t, b: s.b }
      : { t: s.t + 8, b: (content ? content.t : s.b) - 8 };
    const box = contentBox(boxEl) || { l: L.vw * .1, r: L.vw * .9 };
    return {
      anchor: rectOf(anchorEl, ySc, shift), band,
      avoid: avoidEls.map(nd => inflate(rectOf(nd, ySc, shift), 8)).filter(Boolean),
      gridL: box.l, gridR: box.r,
      lanes: { left: [8, box.l - 12], right: [box.r + 12, L.vw - 8] },
    };
  }
  function readPanel() {
    const p = doc.getElementById('ai-chat-panel');
    const r = p && p.getBoundingClientRect();
    L.panel = r && r.width ? { l: r.left, t: r.top, w: r.width, h: r.height } : null;
  }
  function measure() {
    const ySc = window.scrollY || 0;
    L.bpW = window.innerWidth;
    L.vw = root.clientWidth || L.bpW;
    L.vh = window.innerHeight;
    L.base = L.bpW >= 1200 ? 150 : L.bpW >= 769 ? 128 : L.bpW >= 481 ? 92 : 80;
    const nav = doc.querySelector('.navbar'), nr = nav && nav.getBoundingClientRect();
    L.nav = nr && nr.bottom > 0 ? nr.bottom : (L.bpW <= 768 ? 66 : 76);
    L.safeB = parseFloat(getComputedStyle(trail).paddingBottom) || 0;
    const home = doc.getElementById('home'), hr = rectOf(home, ySc);
    L.heroH = hr ? Math.max(1, hr.h) : L.vh;
    L.heroPar = root.classList.contains('fx-motion');     /* hero3d translates .hero-content by --hero-p */
    const inline = home ? parseFloat(home.style.getPropertyValue('--hero-p')) : NaN;
    const pNow = L.heroPar ? (isNaN(inline) ? clamp(ySc / L.heroH, 0, 1) : inline) : 0;
    L.sec = {};
    for (const id of IDS) L.sec[id] = measureSection(id, ySc, pNow * .18 * L.vh);
    readPanel();
  }
  let sizedFor = 0;
  function applySize() {
    const px = Math.round(L.base * 1.3);
    if (px !== sizedFor) { sizedFor = px; el.style.setProperty('--m-size', px + 'px'); }
    if (R) R.resize(px);
  }

  /* ---------- Target resolution: chat -> away -> dock -> heading-perch -> lane -> peek ---------- */
  function setT(mode, side, key, x, y, s, lean, glue) {
    tgt.mode = mode; tgt.side = side; tgt.key = key; tgt.x = x; tgt.y = y; tgt.s = s; tgt.lean = lean; tgt.glue = glue;
    return tgt;
  }
  const awayT = () => setT('away', st.side, 'away', st.x, st.y, st.s, 0, false);
  const homeShift = () => (L.heroPar ? clamp(FX.scroll.y / L.heroH, 0, 1) * .18 * L.vh : 0);
  function hitsAvoid(list, x, yDoc, size) {
    for (const r of list) if (x < r.r && x + size > r.l && yDoc < r.b && yDoc + size > r.t) return true;
    return false;
  }
  function guardRobot(x, y, size) {                         /* never inside [vw-120, vw] x [vh-120, vh] */
    return x + size > L.vw - 120 && y + size > L.vh - 120 ? L.vh - 122 - size : y;
  }
  function stationY(id, size, side, extra) {
    return clamp((STATION_Y[id] ?? .4) * L.vh + extra, L.nav + 16, L.vh - size - (side === 'right' ? 110 : 16));
  }
  function shyDuck(now, bx, by, size) {                     /* pointer lingering within 80px -> duck outward */
    const P = FX.pointer;
    if (!FX.finePointer || P.type !== 'mouse' || !P.moved || st.hover) { st.shyNear = 0; st.shy = false; return false; }
    const dx = Math.max(bx - P.x, 0, P.x - (bx + size)), dy = Math.max(by - P.y, 0, P.y - (by + size));
    if (dx * dx + dy * dy < 6400) {
      st.shyLeft = 0;
      if (!st.shy) { if (!st.shyNear) st.shyNear = now; else if (now - st.shyNear > 300) st.shy = true; }
    } else {
      st.shyNear = 0;
      if (st.shy) { if (!st.shyLeft) st.shyLeft = now; else if (now - st.shyLeft > 1200) { st.shy = false; st.shyLeft = 0; } }
    }
    return st.shy;
  }
  function perchT(id, S) {
    const a = S.anchor;
    if (!a) return null;
    const sy = FX.scroll.y, shift = id === 'home' ? homeShift() : 0, at = a.t - sy + shift;
    if (at < L.nav + 8 || at > .78 * L.vh) return null;
    const prefer = SIDE[id] || 'right';
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? prefer : (prefer === 'right' ? 'left' : 'right');
      for (const s of (id === 'home' ? SCALES_HOME : SCALES)) {
        const size = L.base * s;
        const x = side === 'right' ? a.r + 24 : a.l - 24 - size;
        if (x < 12 || x + size > L.vw - 12) continue;
        const yMin = Math.max(S.band.t - sy, L.nav + 8);
        const yMax = Math.min(S.band.b - sy, L.vh - 12 - (side === 'right' ? 110 : 0)) - size;
        if (yMax < yMin) continue;
        const y = clamp(at + a.h / 2 - size / 2, yMin, yMax);
        if (hitsAvoid(S.avoid, x, y + sy - shift, size)) continue;
        return setT('perch', side, 'perch:' + side + ':' + id, x, y, s, 0, true);
      }
    }
    return null;
  }
  function laneT(id, S, now) {
    const side = SIDE[id] || 'left', ln = S.lanes[side], w = ln[1] - ln[0];
    if (w < .8 * L.base) return null;
    const s = Math.min(1, w / L.base), size = L.base * s;
    let x = ln[0] + (w - size) / 2;
    const y = guardRobot(x, stationY(id, size, side, 0), size);
    if (shyDuck(now, x, y, size)) x += (side === 'left' ? -.6 : .6) * size;
    return setT('lane', side, 'lane:' + side + ':' + id, x, y, s, 0, false);
  }
  function peekT(id, S, now, forcedSide) {
    const side = forcedSide || SIDE[id] || 'left';
    const gap = S ? (side === 'left' ? S.gridL : L.vw - S.gridR) : 0;
    const s = clamp((gap - 8) / (.7 * L.base), .64, 1), size = L.base * s;
    let x = side === 'left' ? -.3 * size : L.vw - .7 * size;
    const y = guardRobot(x, stationY(id, size, side, st.patrolY), size);
    const out = st.peekOut || st.selfFocus;                  /* fully on-screen while its own controls have focus */
    if (out) x = side === 'left' ? 8 : L.vw - size - 8;
    else if (shyDuck(now, x, y, size)) x += (side === 'left' ? -.6 : .6) * size;
    const lean = (side === 'left' ? -PEEK_LEAN : PEEK_LEAN) * (out ? .35 : 1);
    return setT('peek', side, 'peek:' + side + ':' + id, x, y, s, lean, false);
  }
  function dockT(now, motion) {
    const size = L.base, y = L.vh - size - 16 - L.safeB;
    let x = 8 - .42 * size;
    if (st.focusOv) x = 8 - .9 * size;
    else if (st.selfFocus) x = 8;
    else if (motion && st.dockOut) x = 8;
    else if (motion && shyDuck(now, x, y, size)) x -= .6 * size;
    return setT(motion ? 'dock' : 'static', 'left', motion ? 'dock' : 'static', x, y, 1, 0, false);
  }
  function resolve(now) {
    if (FX.state.chatOpen) {
      const s = .64, size = L.base * s, P = L.panel;
      if (L.bpW > 640 && P) {
        const x = P.l - size - 12;
        if (x >= 12) return setT('chat', 'right', 'chat', x, clamp(P.t + 8, 8, L.vh - size - 8), s, 0, false);
      }
      return awayT();
    }
    if (FX.state.overlay) return awayT();
    if (st.reduced) {
      if (L.bpW <= 768) return dockT(now, false);
      const size = L.base * .8;
      return setT('static', 'left', 'static', st.focusOv ? -.6 * size : 16, L.vh - size - 24, .8, 0, false);
    }
    if (L.bpW <= 768) return dockT(now, true);
    const id = st.section, S = L.sec[id];
    if (S && !st.focusOv) {
      const p = perchT(id, S) || laneT(id, S, now);
      if (p) return p;
    }
    return peekT(id, S, now, st.focusOv ? st.focusOv.side : null);
  }

  /* Hysteresis: a new key is accepted at most every 350ms (chat/away instantly) */
  function acceptTarget(now) {
    const T = resolve(now);
    if (T.key !== st.key) {
      const instant = st.key === '' || T.mode === 'away' || T.mode === 'chat' || st.mode === 'away' || st.mode === 'chat';
      if (!instant && now - st.keyAt < 350) {
        if (held.glue) { held.y -= FX.scroll.y - heldSy; heldSy = FX.scroll.y; }
        return held;
      }
      const pk = st.key, pm = st.mode, ps = st.side;
      st.key = T.key; st.mode = T.mode; st.side = T.side; st.keyAt = now;
      onKeyChange(pk, pm, ps, T, now);
    }
    Object.assign(held, T);
    heldSy = FX.scroll.y;
    return T;
  }
  function onKeyChange(prevKey, prevMode, prevSide, T, now) {
    if (T.mode === 'away') { goAway(); return; }
    if (prevMode === 'away' || prevKey === '') { snapTo(T); A.popAt = now; return; }
    const h0 = L.base * st.s / 2, h1 = L.base * T.s / 2;
    const dist = Math.hypot(T.x + h1 - st.x - h0, T.y + h1 - st.y - h0);
    let arrival = st.arrival && T.key.endsWith(':' + st.arrival.id) ? st.arrival.id : null;
    if (!arrival && st.flight) arrival = st.flight.arrival;
    if (dist > 160 && T.mode !== 'dock' && prevMode !== 'dock') {
      startFlight(T, now, { cross: prevSide !== T.side, arrival });
      if (arrival) st.arrival = null;
    } else {
      if (st.flight) { st.vx = st.fvx; st.vy = st.fvy; st.flight = null; }   /* hand the flight's momentum to the spring */
      if (arrival) { react(arrival, now); st.arrival = null; }
    }
  }
  function snapTo(T) {
    st.x = T.x; st.y = T.y; st.s = T.s;
    st.vx = st.vy = st.vs = st.fvx = st.fvy = 0;
    st.flight = null;
  }
  function goAway() {
    st.mode = 'away';
    st.flight = null;
    hideBubble();
    setAttr('state', 'away');
  }

  /* ---------- Movement: spring follow + quadratic Bezier flights ---------- */
  function startFlight(T, now, opts) {
    const h0 = L.base * st.s / 2, h1 = L.base * T.s / 2;
    const x0 = st.x + h0, y0 = st.y + h0, x2 = T.x + h1, y2 = T.y + h1;
    const dist = Math.hypot(x2 - x0, y2 - y0);
    let cy = (y0 + y2) / 2 - (opts.big ? Math.max(200, dist * .35) : Math.min(160, dist * .35));
    if (opts.cross) cy = Math.min(cy, 2 * (L.nav + 40) - (y0 + y2) / 2);   /* apex skims just under the nav glass */
    st.flight = { t0: now, dur: opts.dur || clamp(600 + dist * .6, 700, 1200), x0, y0, cx: (x0 + x2) / 2, cy, s0: st.s,
      puffAt: now, arrival: opts.arrival || null, entrance: !!opts.entrance };
    st.fvx = st.fvy = 0;
    hideBubble();
  }
  function flyStep(now, dt, T) {
    const f = st.flight;
    const p = clamp((now - f.t0) / f.dur, 0, 1), e = easeInOutCubic(p), u = 1 - e;
    const s = lerp(f.s0, T.s, e), half = L.base * s / 2;
    const ex = T.x + L.base * T.s / 2, ey = T.y + L.base * T.s / 2;      /* live target: perches stay glued */
    const bx = u * u * f.x0 + 2 * u * e * f.cx + e * e * ex;
    const by = u * u * f.y0 + 2 * u * e * f.cy + e * e * ey;
    if (dt > 0) {
      const k = damp(.35, dt);
      st.fvx += ((bx - half - st.x) / dt - st.fvx) * k;
      st.fvy += ((by - half - st.y) / dt - st.fvy) * k;
    }
    st.x = bx - half; st.y = by - half; st.s = s;
    if (FX.tier !== 'low' && now - f.puffAt >= 90) { f.puffAt = now; spawnPuff(bx, by, half * 2); }
    if (p >= 1) land(now);
  }
  function land(now) {
    const f = st.flight;
    st.flight = null;
    st.vx = st.vy = st.vs = st.fvx = st.fvy = 0;
    forceBlink(now);
    if (f.arrival) react(f.arrival, now, f.entrance);
  }
  function move(now, dt, T) {
    const sy = FX.scroll.y, dSy = sy - st.lastSy;
    st.lastSy = sy;
    if (A.popAt) {
      const p = (now - A.popAt) / 420;
      A.pop = p >= 1 ? 1 : .6 + .4 * easeOutBack(Math.max(0, p));
      if (p >= 1) A.popAt = 0;
    }
    if (st.flight) { flyStep(now, dt, T); return; }
    if (T.glue && st.glueKey === T.key) st.y -= dSy;      /* glued to a perched heading while scrolling */
    st.glueKey = T.glue ? T.key : '';
    const ty = T.mode === 'lane' || T.mode === 'peek' || T.mode === 'dock' ? T.y + clamp(-A.v * 1.2, -24, 24) : T.y;
    st.vx += (SPRING_K * (T.x - st.x) - SPRING_C * st.vx) * dt; st.x += st.vx * dt;
    st.vy += (SPRING_K * (ty - st.y) - SPRING_C * st.vy) * dt; st.y += st.vy * dt;
    st.vs += (SPRING_K * (T.s - st.s) - SPRING_C * st.vs) * dt; st.s += st.vs * dt;
  }
  function patrolStep(now) {                               /* peek: drift +-80px after 10-14s without scroll */
    if (st.peekOut) return;
    if (!st.patrol) {
      if (now - st.patrolRef < st.patrolDelay) return;
      st.patrol = { from: st.patrolY, to: rand(-80, 80), t0: now };
    }
    const p = Math.min(1, (now - st.patrol.t0) / 2400);
    st.patrolY = lerp(st.patrol.from, st.patrol.to, easeInOutCubic(p));
    if (p >= 1) { st.patrol = null; st.patrolRef = now; st.patrolDelay = rand(10000, 14000); }
  }
  function spawnPuff(cx, cy, size) {
    if (st.puffs >= 8) return;
    const d = doc.createElement('div'), ps = size * .42;
    d.className = 'mascot-puff';
    d.style.cssText = `--m-px:${(cx - ps / 2).toFixed(1)}px;--m-py:${(cy + size * .12 - ps / 2).toFixed(1)}px;--m-ps:${ps.toFixed(1)}px`;
    trail.appendChild(d);
    st.puffs++;
    setTimeout(() => { d.remove(); st.puffs--; }, 720);
  }

  /* ---------- Reactions ---------- */
  function forceBlink(now) {
    A.blinkAt = now;
    A.blinkDouble = Math.random() < .2;
    A.blinkNext = now + rand(2500, 6000);
  }
  const blinkCurve = d => (d < 0 ? 1 : d < 60 ? 1 - .92 * d / 60 : d < 140 ? .08 + .92 * (d - 60) / 80 : 1);
  function squashCurve(d) {                                /* press: squash 90ms, then a springy release */
    if (d < 0) return 0;
    if (d < 90) return d / 90;
    const q = (d - 90) / 350;
    return q >= 1 ? 0 : Math.cos(q * Math.PI * 2.5) * (1 - q) * (1 - q);
  }
  function pulseClass(cls, ms, key) {
    el.classList.add(cls);
    clearTimeout(st[key]);
    st[key] = setTimeout(() => el.classList.remove(cls), ms);
  }
  function react(id, now, entrance) {
    forceBlink(now);
    B.readyAt = now + (entrance ? 300 : 380);
    if (entrance) { A.waveAt = now; return; }
    if (FX.tier === 'low') return;
    if (id === 'leadership' || id === 'ambassadorship') A.hopAt = now;
    else if (id === 'gallery') {
      A.flashAt = now; A.squintUntil = now + 420;
      pulseClass('is-flash', 160, 'flashTimer');
      pulseClass('is-squint', 420, 'squintTimer');
    } else if (id === 'articles') A.lookAt = now;
    else if (id === 'contact' || id === 'footer') A.waveAt = now;
    else A.nodAt = now;
  }
  function maybeWave(now) {
    if (st.reduced || now - A.hoverWaveAt < 6000) return;
    A.hoverWaveAt = A.waveAt = now;
  }
  const isTouch = () => (FX.pointer.moved ? FX.pointer.type !== 'mouse' : !!FX.isTouch);

  /* ---------- Pose (shared by both renderers) ---------- */
  function animate(now, dt, T) {
    const t = (A.t += dt), P = FX.pointer;
    const size = L.base * st.s, cx = st.x + size / 2, cy = st.y + size / 2, f = damp(.1, dt);

    const sleepyNow = now - st.lastInputAt > 25000 && !st.flight && !B.visible && T.mode !== 'chat';
    if (!sleepyNow && A.sleepy > .5) forceBlink(now);       /* any input wakes it with a blink */
    A.sleepy += ((sleepyNow ? 1 : 0) - A.sleepy) * damp(.05, dt);

    const v = FX.scroll.scrolling ? FX.scroll.vy : 0;      /* scroll lean, whee, settle wobble */
    A.v += (v - A.v) * damp(.2, dt);
    if (Math.abs(A.v) > 8) A.moving = true;
    else if (A.moving && Math.abs(A.v) < 1.5) { A.moving = false; A.wobbleAt = now; }
    A.whee += ((Math.abs(A.v) > 40 ? 1 : 0) - A.whee) * damp(.2, dt);

    let gx, gy;                                            /* gaze target in [-1, 1] */
    if (st.flight) {
      const sp = Math.hypot(st.fvx, st.fvy) || 1;
      gx = st.fvx / sp * .9; gy = st.fvy / sp * .6;
    } else if (T.mode === 'chat' && L.panel) {
      gx = clamp((L.panel.l + L.panel.w * .5 - cx) / 400, -1, 1);
      gy = clamp((L.panel.t + L.panel.h * .4 - cy) / 400, -1, 1);
    } else if (isTouch()) {
      const recent = P.tapX >= 0 && now - P.t < 1500;
      gx = recent ? clamp((P.tapX - cx) / 400, -1, 1) : (T.side === 'left' ? .55 : -.55);
      gy = recent ? clamp((P.tapY - cy) / 400, -1, 1) : (FX.scroll.dir || 1) * .35;
    } else {
      gx = clamp((P.x - cx) / 400, -1, 1);
      gy = clamp((P.y - cy) / 400, -1, 1);
    }
    if (A.sleepy > .5) { gx *= .2; gy = .5; }
    const look = bump(now - A.lookAt, 400);
    if (look) gy = lerp(gy, -1, look);
    A.gx += (gx - A.gx) * f;
    A.gy += (gy - A.gy) * f;
    pose.eyeX = A.gx * .05;
    pose.eyeY = -A.gy * .04;

    if (now >= A.blinkNext) forceBlink(now);
    let open = blinkCurve(now - A.blinkAt);
    if (A.blinkDouble) open = Math.min(open, blinkCurve(now - A.blinkAt - 200));
    pose.eyeOpen = open * lerp(1, .45, A.sleepy);

    const happyNow = st.hover || st.focusVis || now < A.squintUntil;
    A.happy += ((happyNow ? 1 : 0) - A.happy) * damp(.2, dt);
    pose.happy = A.happy;
    pose.blush = 1 + .6 * A.happy;
    pose.mouth = A.whee > .5 ? 'o' : A.happy > .5 ? 'grin' : 'smile';
    const talkE = now - A.talkAt;
    pose.mouthY = talkE >= 0 && talkE < 600 ? 1 + .8 * (.5 - .5 * Math.cos(talkE / 1000 * 6 * Math.PI * 2)) : 1;

    const bob = Math.sin(t * 1.6) * .08 * lerp(1, .5, A.sleepy);
    A.hopV += (-180 * A.hopY - 16 * A.hopV) * dt;            /* hover hop spring */
    A.hopY += A.hopV * dt;
    pose.hop = A.hopY + .18 * bump(now - A.hopAt, 320);
    pose.y = bob + pose.hop;

    const vx = st.flight ? st.fvx : st.vx;
    A.bank += (clamp(-vx * .0009, -.35, .35) - A.bank) * damp(.15, dt);
    A.lean += ((T.lean || 0) - A.lean) * damp(.1, dt);
    const wp = (now - A.waveAt) / 600, waving = wp >= 0 && wp < 1;
    const waveRight = T.side === 'left';                     /* content-side arm */
    const wobbleE = now - A.wobbleAt;
    const wobble = wobbleE < 500 ? Math.sin(wobbleE / 1000 * 22) * .05 * (1 - wobbleE / 500) : 0;
    pose.rz = Math.sin(t * .9) * .05 + A.bank + A.lean + wobble + (waving ? (waveRight ? -.08 : .08) * Math.sin(Math.PI * wp) : 0);
    A.headY += (A.gx * .35 - A.headY) * f;
    A.headX += (A.gy * .25 - A.headX) * f;
    pose.rx = A.headX + clamp(A.v * .004, -.2, .2) + .15 * bump(now - A.nodAt, 400);
    pose.ry = A.headY;

    const breath = Math.sin(t * 2.2) * .015, sq = squashCurve(now - A.squashAt);
    let sx = (1 / (1 + breath)) * (1 + .15 * sq) * (1 - .04 * A.whee);
    let sy = (1 + breath) * (1 - .15 * sq) * (1 + .1 * A.whee);
    if (st.flight) {
      const sp = Math.hypot(st.fvx, st.fvy), str = Math.min(.12, sp * .00012), ax = sp ? Math.abs(st.fvx) / sp : 0;
      sx *= 1 + str * ax;
      sy *= 1 + str * (1 - ax);
    }
    pose.sx = sx;
    pose.sy = sy;

    const sway = Math.sin(t * 1.4) * .12;
    pose.armL = st.flight ? .3 : -.12 + sway;
    pose.armR = st.flight ? .3 : -.12 - sway;
    if (waving) {
      const w = lerp(-.2, 1.1, .5 - .5 * Math.cos(wp * Math.PI * 4));   /* 2 cycles in 600ms */
      if (waveRight) pose.armR = w; else pose.armL = w;
    }

    pose.node = t * Math.PI / 3;                              /* 6s orbit */
    pose.nodePulse = B.visible ? .7 + .3 * Math.sin(t * 9) : .8 + .2 * Math.sin(t * 3);
    A.chat += ((FX.state.chatOpen ? 1 : 0) - A.chat) * damp(.12, dt);
    pose.nodeChat = A.chat;
    pose.nodeFlash = now - A.flashAt < 160 ? 1 : 0;
    const lift = clamp(pose.y, -.1, .3);
    pose.shadow = 1 - lift * 1.4;
    pose.shadowA = 1 - lift * 1.6;
  }
  function staticPose() {
    const h = st.hover || st.focusVis ? 1 : 0;
    Object.assign(pose, { y: 0, hop: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, eyeX: 0, eyeY: 0, eyeOpen: 1, happy: h, blush: 1 + .6 * h,
      mouth: h ? 'grin' : 'smile', mouthY: 1, armL: -.12, armR: -.12, node: .5, nodePulse: 1,
      nodeChat: FX.state.chatOpen ? 1 : 0, nodeFlash: 0, shadow: 1, shadowA: 1 });
  }

  /* ---------- Writes ---------- */
  const W = { x: NaN, y: NaN, k: NaN }, attrs = {};
  function writePos(force) {
    const k = st.s * A.pop / 1.3;
    if (force || Math.abs(st.x - W.x) > .05) { W.x = st.x; el.style.setProperty('--m-x', st.x.toFixed(2) + 'px'); }
    if (force || Math.abs(st.y - W.y) > .05) { W.y = st.y; el.style.setProperty('--m-y', st.y.toFixed(2) + 'px'); }
    if (force || Math.abs(k - W.k) > .0005) { W.k = k; el.style.setProperty('--m-scale', k.toFixed(4)); }
  }
  function setAttr(name, v) {
    if (attrs[name] === v) return;
    attrs[name] = v;
    el.dataset[name] = v;
  }
  function stateName(now) {
    if (st.mode === 'away') return 'away';
    if (st.flight) return 'flying';
    if (now - A.waveAt < 600) return 'wave';
    if (st.hover || st.focusVis) return 'hover';
    if (B.visible) return 'talk';
    if (A.whee > .5) return 'whee';
    if (A.sleepy > .5) return 'sleep';
    return 'idle';
  }
  function markReady() {
    if (st.ready || st.dead) return;
    st.ready = true;
    root.classList.add('mascot-ready');
    FX.markReady('mascot', { renderer: R.kind });
  }

  /* ---------- Speech bubbles ---------- */
  function lineText(id) {
    const l = LINES[id];
    if (!l) return '';
    return l.s && (L.bpW <= 768 || (l.tap && isTouch())) ? l.s : l.d;
  }
  function markSaid(id) {
    if (id === 'hover' || id === 'focus') return;
    said.add(id);
    store.set('mochi-said', JSON.stringify([...said]));
  }
  function queueSection(id) {
    B.sec = null;
    if (st.reduced || said.has(id) || !LINES[id]) return;
    if (L.bpW <= 768 && !PHONE_LINES.has(id)) return;        /* phones: only five sections auto-show */
    B.sec = id;
  }
  function queueEvent(id) {
    if (st.reduced || said.has(id) || !LINES[id]) return;
    B.evt = { id, exp: performance.now() + 8000 };
  }
  function placementsFor(mode, side) {
    if (mode === 'peek') return [side === 'left' ? 'right' : 'left'];
    if (mode === 'dock' || mode === 'static') return ['top', 'right'];
    return ['top'];
  }
  function placeBubble(place, w, h) {
    const m = L.base * 1.3, k = st.s / 1.3;
    let a = BUBBLE_ANCHOR[place];
    let vx = st.x + a[0] * m * k, vy = st.y + a[1] * m * k;
    if (place === 'top' && vy - 7 - h < L.nav + 4) {          /* would sit under the nav: flip */
      place = 'bottom';
      a = BUBBLE_ANCHOR.bottom;
      vx = st.x + a[0] * m * k; vy = st.y + a[1] * m * k;
    }
    let ox, oy, tail;
    if (place === 'top' || place === 'bottom') {
      const l = clamp(vx - w / 2, 8, Math.max(8, L.vw - 8 - w));
      tail = clamp(vx - l, 14, w - 14);
      ox = tail; oy = place === 'top' ? h + 7 : -7;
    } else {
      const top = clamp(vy - h / 2, L.nav + 4, Math.max(L.nav + 4, L.vh - 8 - h));
      tail = clamp(vy - top, 12, h - 12);
      ox = place === 'left' ? w + 7 : -7; oy = tail;
    }
    const rect = { l: vx - ox, t: vy - oy, w, h };
    if (rect.l < 4 || rect.l + w > L.vw - 4 || rect.t < 4 || rect.t + h > L.vh - 4) return null;
    return { place, rect, left: a[0] * m - ox, top: a[1] * m - oy, ox, oy, tail };
  }
  function collides(r) {                                     /* elementsFromPoint at 4 corners + centre */
    const pts = [[r.l + 2, r.t + 2], [r.l + r.w - 2, r.t + 2], [r.l + 2, r.t + r.h - 2], [r.l + r.w - 2, r.t + r.h - 2], [r.l + r.w / 2, r.t + r.h / 2]];
    for (const [x, y] of pts) {
      for (const n of doc.elementsFromPoint(x, y)) {
        if (el.contains(n) || trail.contains(n)) continue;
        if (n.matches && n.matches(HIT_SELECTOR)) return true;
      }
    }
    return false;
  }
  function typeOn(text) {
    clearInterval(B.typeTimer);
    if (st.reduced) { typed.textContent = text; ghost.textContent = ''; return; }
    let i = 0;
    B.typeTimer = setInterval(() => {
      i++;
      typed.textContent = text.slice(0, i);
      ghost.textContent = text.slice(i);
      if (i >= text.length) clearInterval(B.typeTimer);
    }, 18);
  }
  function showBubble(id, now, places) {
    const text = lineText(id);
    if (!text) return false;
    typed.textContent = '';
    ghost.textContent = text;
    const w = bubble.offsetWidth, h = bubble.offsetHeight;    /* one read, at show time only */
    for (const place of places) {
      const g = placeBubble(place, w, h);
      if (!g || collides(g.rect)) continue;
      bubble.dataset.place = g.place;
      bubble.style.left = g.left.toFixed(1) + 'px';
      bubble.style.top = g.top.toFixed(1) + 'px';
      bubble.style.transformOrigin = `${g.ox.toFixed(1)}px ${g.oy.toFixed(1)}px`;
      bubble.style.setProperty('--m-tail', g.tail.toFixed(1) + 'px');
      bubble.classList.add('is-visible');
      B.visible = true;
      B.lastAt = A.talkAt = now;
      typeOn(text);
      clearTimeout(B.timer);
      B.timer = setTimeout(hideBubble, st.reduced ? 4000 : Math.min(6000, 1800 + 45 * text.length));
      if (st.reduced) setAttr('state', 'talk');
      return true;
    }
    ghost.textContent = '';
    return false;
  }
  function hideBubble() {
    clearTimeout(B.timer);
    clearInterval(B.typeTimer);
    st.peekOut = st.dockOut = false;
    if (!B.visible) return;
    B.visible = false;
    bubble.classList.remove('is-visible');
    if (st.reduced && st.mode !== 'away') setAttr('state', st.hover || st.focusVis ? 'hover' : 'idle');
  }
  const settled = T => Math.abs(st.x - T.x) < 6 && Math.abs(st.y - T.y) < 8 && Math.hypot(st.vx, st.vy) < 160;
  function tryBubble(now, T) {                               /* cheap checks every frame; DOM work <= every 400ms */
    if (B.visible || st.flight || st.reduced || st.entrance) return;
    if (B.evt && now > B.evt.exp) B.evt = null;
    if (B.sec && B.sec !== st.section) B.sec = null;
    const id = B.evt ? B.evt.id : B.sec;
    if (!id || T.mode === 'chat' || T.mode === 'away' || FX.state.overlay || FX.state.chatOpen || st.focusOv) {
      st.peekOut = st.dockOut = false;
      return;
    }
    if (now < B.lastAt + 6000 || (!B.evt && now < B.readyAt)) return;
    if (T.mode === 'dock') {
      if (now - st.lastScrollAt < 600) return;
      if (!st.dockOut) { st.dockOut = true; st.slideAt = now; return; }
      if (now - st.slideAt < 450) return;
    } else if (T.mode === 'peek') {
      if (!st.peekOut) { st.peekOut = true; st.slideAt = now; return; }
      if (now - st.slideAt < 420) return;
    }
    if (!settled(T) || now - B.lastTry < 400) return;
    B.lastTry = now;
    const ok = showBubble(id, now, placementsFor(T.mode, T.side));
    if (B.evt && B.evt.id === id) B.evt = null; else B.sec = null;
    if (ok) {
      markSaid(id);
      if (id === 'home' && T.mode === 'dock') A.waveAt = now;
    } else st.peekOut = st.dockOut = false;                  /* collision: stays unsaid for a later visit */
  }
  function offerLine(id) {                                   /* hover / keyboard-focus lines */
    const now = performance.now();
    if (B.visible || st.flight || st.mode === 'away' || st.mode === 'chat' || FX.state.overlay || FX.state.chatOpen) return;
    if (now < B.lastAt + 6000 || (id === 'hover' && now < B.hoverAt + 20000)) return;
    if (showBubble(id, now, placementsFor(st.mode, st.side)) && id === 'hover') B.hoverAt = now;
  }

  /* ---------- Frame loop ---------- */
  function entranceStep(now) {
    if (st.section !== 'home' || FX.scroll.y >= 40 || FX.state.overlay || FX.state.chatOpen) {
      st.entrance = null;
      popIn();
      return false;
    }
    if (!FX.state.introDone && now < st.entrance.until) return true;
    st.entrance = null;
    const T = resolve(now);
    st.key = T.key; st.mode = T.mode; st.side = T.side; st.keyAt = now;
    queueSection('home');
    if (T.mode === 'dock') { st.x = -L.base; st.y = T.y; st.arrival = { id: 'home', at: now }; }
    else startFlight(T, now, { big: true, dur: 1200, arrival: 'home', entrance: true });
    return false;
  }
  function popIn() {
    const now = performance.now(), T = resolve(now);
    st.key = T.key; st.mode = T.mode; st.side = T.side; st.keyAt = now;
    if (T.mode === 'away') { goAway(); return; }
    snapTo(T);
    if (!st.reduced) { A.popAt = now; A.pop = .6; }
  }
  let fpsCount = 0, fpsAt = 0, dbg = null;
  function debugTick(now) {
    fpsCount++;
    if (now - fpsAt >= 1000) { FX._mascotFps = fpsCount; fpsCount = 0; fpsAt = now; }
    const S = L.sec[st.section];
    if (!dbg || !S) return;
    const sy = FX.scroll.y, place = (d, l, t, w, h) => {
      d.style.transform = `translate3d(${l.toFixed(1)}px, ${t.toFixed(1)}px, 0)`;
      d.style.width = Math.max(0, w).toFixed(1) + 'px';
      d.style.height = Math.max(0, h).toFixed(1) + 'px';
    };
    if (S.anchor) place(dbg[0], S.anchor.l, S.anchor.t - sy, S.anchor.w, S.anchor.h);
    place(dbg[1], 0, S.band.t - sy, L.vw, S.band.b - S.band.t);
  }
  function step(now, dt) {
    st.recheck = false;
    if (st.entrance && entranceStep(now)) { animate(now, dt, IDLE_T); R.render(pose, dt); markReady(); return; }
    if (st.mode === 'peek') patrolStep(now);
    const T = acceptTarget(now);
    if (T.mode === 'away') return;
    if (st.arrival && !st.flight && now - st.arrival.at > 400) { react(st.arrival.id, now); st.arrival = null; }
    move(now, dt, T);
    animate(now, dt, T);
    writePos(false);
    setAttr('mode', T.mode);
    setAttr('side', T.side);
    setAttr('state', stateName(now));
    tryBubble(now, T);
    R.render(pose, dt);
    markReady();
    if (FX.debug) debugTick(now);
  }
  const wantLoop = () => !st.dead && !!R && st.visible && !st.reduced && (st.mode !== 'away' || st.recheck);
  function frame(now) {
    st.raf = 0;
    if (!wantLoop()) return;
    st.raf = requestAnimationFrame(frame);
    const idle = now - st.lastInputAt > 25000 && !st.flight && !B.visible;   /* chat keeps the awake face, not the frame rate */
    const fps = (A.sleepy > .5 || (idle && st.mode === 'chat')) ? 20 : FX.tier === 'low' ? 30 : 60;
    if (now - st.last < 1000 / fps - 1.5) return;
    const dt = Math.min((now - st.last) / 1000, 1 / 30);
    st.last = now;
    step(now, dt);
  }
  function wake() {
    if (st.raf || !wantLoop()) return;
    st.last = performance.now();
    st.raf = requestAnimationFrame(frame);
  }
  function updateStatic() {                                  /* reduced motion: one render per state change */
    if (st.dead || !R) return;
    const now = performance.now(), T = resolve(now);
    st.key = T.key; st.mode = T.mode; st.side = T.side;
    if (T.mode === 'away') { goAway(); return; }
    snapTo(T);
    A.pop = 1;
    A.popAt = 0;
    writePos(true);
    staticPose();
    setAttr('mode', T.mode);
    setAttr('side', T.side);
    setAttr('state', st.hover || st.focusVis ? 'hover' : B.visible ? 'talk' : 'idle');
    R.render(pose, 0);
    requestAnimationFrame(markReady);
  }
  function kick() {
    if (st.dead) return;
    if (st.reduced) { updateStatic(); return; }
    st.recheck = true;
    wake();
  }
  function setReduced(on) {
    if (on === st.reduced) return;
    st.reduced = on;
    hideBubble();
    B.sec = B.evt = null;
    st.flight = null;
    if (on) { updateStatic(); return; }
    st.key = '';
    popIn();
    wake();
  }

  /* ---------- Renderer: WebGL when allowed, SVG otherwise (and on context loss) ---------- */
  function swapToSvg() {
    if (!R || R.kind === 'svg' || st.dead) return;
    const old = R;
    R = createSvgRenderer(bodyHost);
    el.dataset.renderer = 'svg';
    try { old.dispose(true); } catch (e) { FX.log('mascot: dispose after context loss failed', e); }
    if (st.reduced) updateStatic(); else kick();
  }
  measure();
  applySize();
  if (FX.allow3D()) {
    try {
      const THREE = await import('three');
      R = createWebGLRenderer(THREE, bodyHost, { tier: FX.tier, onLost: swapToSvg });
      if (R.ready) await R.ready;                            /* programs compile off the main thread before the first render */
    } catch (err) {
      FX.log('mascot: WebGL unavailable, using SVG', err);
      R = null;
    }
  }
  if (!R) R = createSvgRenderer(bodyHost);
  el.dataset.renderer = R.kind;
  st.section = FX.state.section || st.section;               /* late joiner: events during the import are gone */
  st.reduced = !FX.motion;
  st.visible = !doc.hidden;
  st.lastSy = FX.scroll.y;
  A.chat = FX.state.chatOpen ? 1 : 0;
  syncChat();
  measure();                                                 /* layout may have settled during the import */
  applySize();
  R.setPalette(readPalette(), true);

  /* ---------- Button semantics, hover, focus, dismiss ---------- */
  function syncChat() {
    const open = !!FX.state.chatOpen;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.setAttribute('aria-label', `${A11Y_NAME}: ${open ? 'close' : 'open'} the AI chat assistant`);
  }
  function act() {
    if (st.dead) return;
    hideBubble();
    if (FX.state.chatOpen) FX.closeChat(); else FX.openChat(btn);
  }
  btn.addEventListener('click', () => {
    st.lastInputAt = performance.now();
    if (st.pressPending) return;
    if (st.reduced) { act(); return; }
    A.squashAt = performance.now();
    st.pressPending = true;
    setTimeout(() => { st.pressPending = false; act(); }, 130);
  });
  function setHover(on) {
    const now = performance.now();
    st.hover = on;
    st.lastInputAt = now;
    if (on) {
      st.shy = false;
      if (!st.reduced) A.hopV += 2.1;
      maybeWave(now);
      offerLine('hover');
    }
    if (st.reduced) updateStatic();
  }
  btn.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') setHover(true); });
  btn.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') setHover(false); });
  btn.addEventListener('focus', () => {
    let kb = false;
    try { kb = btn.matches(':focus-visible'); } catch (e) { kb = false; }
    if (!kb) return;
    st.focusVis = true;
    st.lastInputAt = performance.now();
    maybeWave(st.lastInputAt);
    offerLine('focus');
    if (st.reduced) updateStatic();
  });
  btn.addEventListener('blur', () => {
    if (!st.focusVis) return;
    st.focusVis = false;
    if (st.reduced) updateStatic();
  });
  btn.addEventListener('keydown', e => { if (e.key === 'Escape' && B.visible) hideBubble(); });   /* script.js still runs its own Escape */
  el.addEventListener('focusin', () => { st.selfFocus = true; kick(); });
  el.addEventListener('focusout', e => { if (!el.contains(e.relatedTarget)) { st.selfFocus = false; kick(); } });

  function onFocusIn(e) {                                    /* focus rule: move away from the focused element */
    st.lastInputAt = performance.now();
    const t = e.target;
    if (!t || t === doc.body || t === root || el.contains(t) || !t.getBoundingClientRect || st.mode === 'chat' || st.mode === 'away') return;
    const r = t.getBoundingClientRect(), size = L.base * st.s;
    const hit = r.right > st.x - 8 && r.left < st.x + size + 8 && r.bottom > st.y - 8 && r.top < st.y + size + 8;
    if (hit) {
      st.focusOv = { el: t, side: st.side === 'left' ? 'right' : 'left', until: performance.now() + 4000 };
      hideBubble();
      clearTimeout(st.focusTimer);
      const check = () => {
        if (!st.focusOv || st.dead) return;
        if (doc.activeElement === st.focusOv.el) { st.focusTimer = setTimeout(check, 1000); return; }
        st.focusOv = null;
        kick();
      };
      st.focusTimer = setTimeout(check, 4000);
      kick();
    } else if (st.focusOv && st.focusOv.el !== t && performance.now() >= st.focusOv.until) {
      st.focusOv = null;
      kick();
    }
  }
  doc.addEventListener('focusin', onFocusIn);

  function acceptSection(id) {
    if (!id || id === st.section || st.dead) return;
    st.section = id;
    hideBubble();
    queueSection(id);
    st.arrival = { id, at: performance.now() };
    if (st.reduced) updateStatic();
  }

  const offs = [
    FX.on('section', d => { clearTimeout(st.secTimer); st.secTimer = setTimeout(() => acceptSection(d.id), 250); }),
    FX.on('chat', () => {                                    /* focus return stays with script.js */
      syncChat();
      readPanel();
      clearTimeout(st.panelTimer);
      st.panelTimer = setTimeout(() => { readPanel(); kick(); }, 360);   /* again once the panel transition settles */
      hideBubble();
      kick();
    }),
    FX.on('overlay', () => { if (FX.state.overlay) hideBubble(); kick(); }),
    FX.on('theme', d => {
      R.setPalette(readPalette(), st.reduced);
      queueEvent(d.theme === 'light' ? 'theme-light' : 'theme-dark');
      kick();
    }),
    FX.on('gallery', d => { if (d.panelId && LINES[d.panelId]) queueEvent(d.panelId); }),
    FX.on('layout', () => { measure(); applySize(); kick(); }),
    FX.on('visibility', d => { st.visible = d.visible !== false; if (st.visible) kick(); }),
    FX.on('motion', () => setReduced(!FX.motion)),
  ];
  FX.onScroll(() => {
    if (st.dead) return;
    const now = performance.now();
    st.lastScrollAt = st.patrolRef = st.lastInputAt = now;
    st.patrol = null;
  });
  FX.onPointer(() => { if (!st.dead) st.lastInputAt = performance.now(); });

  function dismiss() {
    if (st.dead) return;
    store.set('mochi-hidden', '1');
    const refocus = el.contains(doc.activeElement);
    st.dead = true;
    if (st.raf) cancelAnimationFrame(st.raf);
    offs.forEach(off => off());
    doc.removeEventListener('focusin', onFocusIn);
    [st.secTimer, st.panelTimer, st.focusTimer, st.flashTimer, st.squintTimer, B.timer].forEach(clearTimeout);
    clearInterval(B.typeTimer);
    el.classList.add('is-leaving');
    if (refocus) { const robot = doc.getElementById('ai-chat-toggle'); if (robot) robot.focus(); }
    setTimeout(() => {
      try { R.dispose(false); } catch (e) { FX.log('mascot: dispose failed', e); }
      el.remove();
      trail.remove();
      root.classList.remove('mascot-ready');
    }, 340);
  }
  dismissBtn.addEventListener('click', dismiss);
  btn.disabled = dismissBtn.disabled = false;

  if (FX.debug) {
    dbg = [0, 1].map(() => { const d = doc.createElement('div'); d.className = 'mascot-debug'; trail.appendChild(d); return d; });
  }

  /* ---------- First placement: entrance flight, pop-in or static ---------- */
  staticPose();
  R.render(pose, 0);
  requestAnimationFrame(markReady);                          /* html.mascot-ready only after a real frame */
  if (st.reduced) updateStatic();
  else if (st.section === 'home' && FX.scroll.y < 40 && !FX.state.overlay && !FX.state.chatOpen) {
    st.entrance = { until: performance.now() + 1800 };       /* wait for fx:intro done (or 1.8s) */
    st.x = L.bpW <= 768 ? -L.base : L.vw + L.base;
    st.y = L.bpW <= 768 ? L.vh - L.base - 16 - L.safeB : .8 * L.vh;
    st.s = 1;
    writePos(true);
    setAttr('mode', L.bpW <= 768 ? 'dock' : 'peek');
    setAttr('side', L.bpW <= 768 ? 'left' : 'right');
    setAttr('state', 'idle');
  } else popIn();
  wake();
}

/* =============================================================================
   Boot guard: after window load + idle; never imports three when disabled
   ============================================================================= */
function init() {
  const FX = window.FX;
  if (!FX.enabled || FX.flags.off || FX.flags.nomascot || store.get('mochi-hidden') === '1') return;
  const run = () => { start(FX).catch(err => FX.log('mascot: init failed', err)); };
  const idle = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 600);
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

if (window.FX) init();
