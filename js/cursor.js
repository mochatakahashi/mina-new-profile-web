/* ==========================================================================
   cursor.js: "Glow orb + ring" cursor, sparkle trail and tap ripples (spec §7)

   Classic `defer` script. Owns #fx-cursor, #fx-sparkle, #fx-taps, the classes
   html.fx-cursor-on / html.fx-kbd, and the inline `translate` on magnet
   targets (exactly one element at a time). Pointer moves arrive through
   FX.onPointer and scroll through FX.onScroll; the only own listeners are
   pointerdown / pointerup / pointerover / pointerout / keydown on `document`.
   ========================================================================== */
(function () {
  'use strict';

  const FX = window.FX;
  if (!FX || !FX.enabled || FX.flags.nocursor) return;      // ?fx=off, ?fx=nocursor: module off

  const d = document, de = d.documentElement, cl = de.classList;

  /* ---- Selectors (state priority: hidden > magnet > view > link > card > text > default) ---- */
  const MAGNET_SELECTOR = '.btn, .expand-button, .theme-toggle, .hamburger, .gallery-tab, .contact-email, .ai-chat-btn, .ai-close-btn, .modal-close, .photo-viewer-close, .photo-viewer-nav, [data-magnetic]';
  const SEL_HIDDEN = 'iframe, #ai-chat-panel, [data-cursor="none"]';
  const SEL_SELF_MOVING = '.mascot-hit';                     // Mochi moves itself: link state only
  const SEL_VIEW = '.gallery-card, .side-quest-photo-btn, [data-cursor="view"]';
  const SEL_LINK = 'a, button, [role="button"], [role="tab"], label, .mascot-hit, [data-cursor="link"]';
  const SEL_CARD = '.bento-card';
  const SEL_TEXT = 'p, li, h1, h2, h3, h4';
  const SEL_TEXT_SKIP = 'a, button, .bento-card';

  /* ---- Tuning ---- */
  const KBD_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Spacebar']);
  const RING_FOLLOW = 0.82;                  // ring lerp factor: 1 - 0.82^(dt * 60)
  const PULL_FOLLOW = 0.8;                   // magnet pull lerp: .2 per 60 Hz frame
  const SCALE_FOLLOW = 0.72;                 // press scale easing
  const RING_PAD = 6;                        // magnet ring = target rect + 6px
  const RING_SHIFT = 0.15, RING_SHIFT_MAX = 12;
  const PULL = 0.25, PULL_MAX = 8, PULL_MAX_SMALL = 4, PULL_MAX_W = 320, PULL_MAX_H = 80;
  const SPRING_K = 300, SPRING_C = 20;       // release spring (per second, slight overshoot)
  const SPARK_BUDGET = { high: 40, mid: 24 }[FX.tier] || 0;
  const SPARK_STEP = 14, SPARK_FAST = 1.5, SPARK_DRIFT = 0.02;   // px, px/ms, px/ms upward
  const SPARK_VARS = ['--sparkle-1', '--sparkle-2', '--sparkle-3', '--sparkle-4'];
  const SPARK_FALLBACK = {
    dark: ['#ffffff', '#f0abfc', '#c4b5fd', '#f9a8d4'],
    light: ['#7c3aed', '#db2777', '#a855f7', '#f59e0b']
  };
  const TAP_POOL = 4, TAP_DOTS = 6, TAP_MAX_MOVE = 10, TAP_MAX_MS = 450;

  /* ---- Helpers ---- */
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const isMouse = (e) => (e.pointerType || 'mouse') === 'mouse';
  const cursorAllowed = () => FX.enabled && FX.motion && FX.finePointer && !FX.flags.nocursor;
  const isDark = () => (FX.state.theme || de.getAttribute('data-theme')) !== 'light';

  function make(tag, id, className) {
    const n = d.createElement(tag);
    if (id) n.id = id;
    if (className) n.className = className;
    n.setAttribute('aria-hidden', 'true');
    return n;
  }

  /* =======================================================================
     Touch tap ripple (any non-mouse pointer; static circle under reduced)
     ======================================================================= */
  let taps = null, tapNext = 0, tapDown = null;

  function tapPool() {
    if (taps) return taps;
    const host = make('div', 'fx-taps');
    taps = [];
    for (let i = 0; i < TAP_POOL; i++) {
      const node = make('div', null, 'fx-tap');
      for (let j = 0; j < TAP_DOTS; j++) node.appendChild(d.createElement('i'));
      host.appendChild(node);
      taps.push({ node, anim: null });
    }
    d.body.appendChild(host);
    return taps;
  }

  function showTap(x, y) {
    const tap = tapPool()[tapNext];
    tapNext = (tapNext + 1) % TAP_POOL;
    const n = tap.node;
    if (tap.anim) { tap.anim.cancel(); tap.anim = null; }
    n.classList.remove('is-on', 'is-static');
    n.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    if (FX.motion) {
      void n.offsetWidth;                                   // restart the CSS keyframes on reuse
      n.classList.add('is-on');
    } else if (n.animate) {
      // Reduced motion: opacity-only fade via WAAPI (the CSS kill-switch would cut a CSS animation)
      n.classList.add('is-static');
      tap.anim = n.animate([{ opacity: 0.35 }, { opacity: 0 }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
    }
  }

  /* =======================================================================
     Custom cursor state
     ======================================================================= */
  let root = null, ring = null, dot = null;
  let active = false, state = 'default', pressed = false, kbd = false, snapNext = false;
  let px = FX.pointer.x, py = FX.pointer.y;                  // pointer (dot)
  let rx = px, ry = py, rs = 1, ds = 1;                     // ring position, ring/dot scale
  let kx = 0, ky = 0;                                       // pointer position when keyboard mode began
  let raf = 0, lastFrame = 0, paused = false;

  // The one magnetized element (or the one springing back to rest)
  const mag = { el: null, releasing: false, cx: 0, cy: 0, w: 0, h: 0, sy: 0, canPull: false, lim: 0, x: 0, y: 0, vx: 0, vy: 0, written: '' };

  // Sparkle canvas
  let canvas = null, ctx = null, dpr = 1, colors = SPARK_FALLBACK.dark, composite = 'lighter', alphaMul = 1;
  let box = null;                                           // last frame's dirty rect (CSS px)
  const sparks = [], sparkFree = [];
  let trailX = px, trailY = py, trailT = 0, travel = 0;

  /* ---- DOM ---- */
  function build() {
    if (root) return;
    if (SPARK_BUDGET) {
      canvas = make('canvas', 'fx-sparkle');
      ctx = canvas.getContext('2d');
      if (ctx) { d.body.appendChild(canvas); sizeCanvas(); readColors(); }
      else canvas = null;
    }
    root = make('div', 'fx-cursor');
    root.setAttribute('data-state', state);
    ring = make('div', null, 'fx-cursor-ring');
    ring.appendChild(make('span', null, 'fx-cursor-glyph'));
    dot = make('div', null, 'fx-cursor-dot');
    root.appendChild(ring);
    root.appendChild(dot);
    d.body.appendChild(root);
  }

  /* ---- Activation ---- */
  function activate(target) {
    build();
    active = true;
    cl.add('fx-cursor-on');
    snap();
    resolve(target);
    writeDot();
    writeRing();
  }

  function deactivate() {
    if (!active) return;
    active = false;
    kbd = false;
    cl.remove('fx-cursor-on', 'fx-kbd');
    restoreMagnet();
    setState('default');
    pressed = false; rs = 1; ds = 1;
    if (root) root.classList.remove('is-pressed');
    clearSparks();
    stop();
  }

  function snap() {
    rx = px; ry = py;
    trailX = px; trailY = py; travel = 0;
    snapNext = false;
  }

  /* ---- State resolution (pointerover delegation + closest) ---- */
  function resolve(t) {
    if (!t || !t.closest) return;
    let next = 'default', magnetEl = null;
    if (t.closest(SEL_HIDDEN)) next = 'hidden';
    else if (t.closest(SEL_SELF_MOVING)) next = 'link';
    else if ((magnetEl = t.closest(MAGNET_SELECTOR))) next = 'magnet';
    else if (t.closest(SEL_VIEW)) next = 'view';
    else if (t.closest(SEL_LINK)) next = 'link';
    else if (t.closest(SEL_CARD)) next = 'card';
    else if (t.closest(SEL_TEXT) && !t.closest(SEL_TEXT_SKIP)) next = 'text';
    if (next === 'magnet' && kbd) { next = 'link'; magnetEl = null; }   // never pull while tabbing
    // Wide targets (e.g. full-width "See More" bars) would stretch the ring into a giant pill:
    // they get the plain link ring instead (one offsetWidth read, only on pointerover)
    if (next === 'magnet' && magnetEl.offsetWidth > PULL_MAX_W) { next = 'link'; magnetEl = null; }
    setMagnet(magnetEl);
    setState(next);
  }

  function setState(next) {
    if (next === state) return;
    if (state === 'hidden') snapNext = true;              // reappear at the pointer, not where it vanished
    state = next;
    if (!root) return;
    root.setAttribute('data-state', next);
    if (next !== 'magnet') ring.style.width = ring.style.height = ring.style.borderRadius = '';
  }

  /* ---- Magnetic snap + pull ---- */
  function setMagnet(el) {
    if (el === mag.el) { if (el) mag.releasing = false; return; }
    if (mag.el) {
      if (el) restoreMagnet();                              // switching targets: old one rests at once
      else {                                                // leaving: spring back to rest
        if (!mag.releasing) { mag.releasing = true; mag.vx = mag.vy = 0; }
        kick();
        return;
      }
    }
    if (!el) return;
    mag.el = el;
    mag.releasing = false;
    mag.x = mag.y = mag.vx = mag.vy = 0;
    mag.written = '';
    measureMagnet();
    mag.canPull = mag.w <= PULL_MAX_W && mag.h <= PULL_MAX_H;
    mag.lim = Math.min(mag.w, mag.h) < 48 ? PULL_MAX_SMALL : PULL_MAX;
    // Ring hugs the target: its rect + pad, its corner radius (read once on enter)
    const r = getComputedStyle(el).borderTopLeftRadius || '';
    const radius = r.slice(-2) === 'px' ? (parseFloat(r) + RING_PAD) + 'px' : (r || '50%');
    ring.style.width = (mag.w + RING_PAD * 2) + 'px';
    ring.style.height = (mag.h + RING_PAD * 2) + 'px';
    ring.style.borderRadius = radius;
  }

  function measureMagnet() {
    const r = mag.el.getBoundingClientRect();
    mag.cx = r.left + r.width / 2 - mag.x;                  // remove our own translate from the rect
    mag.cy = r.top + r.height / 2 - mag.y;
    mag.w = r.width;
    mag.h = r.height;
    mag.sy = FX.scroll.y;
  }

  function restoreMagnet() {
    if (mag.el) mag.el.style.translate = '';
    mag.el = null;
    mag.releasing = false;
    mag.x = mag.y = mag.vx = mag.vy = 0;
    mag.written = '';
  }

  function writeMagnet() {
    const v = mag.x.toFixed(2) + 'px ' + mag.y.toFixed(2) + 'px';
    if (v !== mag.written) { mag.el.style.translate = v; mag.written = v; }
  }

  /* ---- Transforms ---- */
  function writeDot() {
    dot.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0) translate(-50%,-50%)' +
      (ds !== 1 ? ' scale(' + ds.toFixed(3) + ')' : '');
  }

  function writeRing() {
    ring.style.transform = 'translate3d(' + rx.toFixed(2) + 'px,' + ry.toFixed(2) + 'px,0) translate(-50%,-50%)' +
      (rs !== 1 ? ' scale(' + rs.toFixed(3) + ')' : '');
  }

  /* =======================================================================
     Sparkle trail (2D canvas, dirty-rect clears, tier budget 40 / 24 / 0)
     ======================================================================= */
  function sizeCanvas() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = window.innerWidth, h = window.innerHeight;
    const W = Math.round(w * dpr), H = Math.round(h * dpr);
    // fx:layout also fires for body/font/gallery changes: skip the realloc (and bitmap wipe) when nothing changed
    if (canvas.width === W && canvas.height === H &&
        canvas.style.width === w + 'px' && canvas.style.height === h + 'px') return;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    box = null;                                             // resizing clears the bitmap
  }

  function readColors() {
    const dark = isDark(), cs = getComputedStyle(de), fb = SPARK_FALLBACK[dark ? 'dark' : 'light'];
    colors = SPARK_VARS.map((name, i) => cs.getPropertyValue(name).trim() || fb[i]);
    composite = dark ? 'lighter' : 'source-over';
    alphaMul = dark ? 1 : 0.7;
  }

  function spawn(x, y, vx, vy, life, size, drag, glint) {
    let p;
    if (sparks.length < SPARK_BUDGET) {
      p = sparkFree.pop() || {};
      sparks.push(p);
    } else {
      p = sparks[0];                                        // budget full: recycle the most-aged spark
      for (let i = 1; i < sparks.length; i++) if (sparks[i].age / sparks[i].life > p.age / p.life) p = sparks[i];
    }
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.age = 0; p.life = life; p.size = size; p.drag = drag;
    p.glint = glint; p.rot = Math.random() * Math.PI;
    p.color = colors[(Math.random() * colors.length) | 0];
  }

  function trail(x, y, t) {
    const dx = x - trailX, dy = y - trailY, dist = Math.hypot(dx, dy), dt = Math.max(1, t - trailT);
    trailX = x; trailY = y; trailT = t;
    if (!ctx || state === 'hidden' || dist > 400) { travel = 0; return; }
    const perStep = dist / dt > SPARK_FAST ? 2 : 1;
    travel += dist;
    for (let n = 0; travel >= SPARK_STEP && n < 8; n++) {
      travel -= SPARK_STEP;
      const f = dist ? (dist - travel) / dist : 1;           // evenly spaced along the segment
      const sx = x - dx * (1 - f), sy = y - dy * (1 - f);
      for (let k = 0; k < perStep; k++) {
        spawn(sx + (Math.random() - 0.5) * 4, sy + (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05,
          500 + Math.random() * 300, 1.2 + Math.random() * 1.4, 0, Math.random() < 0.3);
      }
    }
    if (travel > SPARK_STEP) travel = 0;
  }

  function burst() {
    if (!ctx || state === 'hidden') return;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + (Math.random() - 0.5) * 0.3, v = 0.14 + Math.random() * 0.06;
      spawn(px, py, Math.cos(a) * v, Math.sin(a) * v, 420 + Math.random() * 200,
        1.4 + Math.random() * 1, 0.006, i % 2 === 0);
    }
    kick();
  }

  function drawGlint(x, y, r, rot) {
    const w = r * 0.28;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = rot + i * Math.PI / 2, b = a + Math.PI / 4;
      ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      ctx.lineTo(x + Math.cos(b) * w, y + Math.sin(b) * w);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawSparks(dt) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (box) ctx.clearRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
    ctx.globalCompositeOperation = composite;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.age += dt;
      if (p.age >= p.life) {
        sparks[i] = sparks[sparks.length - 1];
        sparks.pop();
        sparkFree.push(p);
        continue;
      }
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt;
      p.y += (p.vy - SPARK_DRIFT) * dt;
      const t = p.age / p.life, fade = (t < 0.12 ? t / 0.12 : 1) * (1 - t) * (1 - t);
      ctx.fillStyle = p.color;
      let reach;
      if (p.glint) {
        reach = p.size * 2.6;
        ctx.globalAlpha = fade * alphaMul;
        drawGlint(p.x, p.y, reach, p.rot);
      } else {
        reach = p.size * 2.2;
        ctx.globalAlpha = fade * alphaMul * 0.25;           // soft halo
        ctx.beginPath(); ctx.arc(p.x, p.y, reach, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = fade * alphaMul;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      reach += 2;
      if (p.x - reach < x0) x0 = p.x - reach;
      if (p.y - reach < y0) y0 = p.y - reach;
      if (p.x + reach > x1) x1 = p.x + reach;
      if (p.y + reach > y1) y1 = p.y + reach;
    }
    ctx.globalAlpha = 1;
    box = sparks.length ? { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) } : null;
  }

  function clearSparks() {
    for (const p of sparks) sparkFree.push(p);
    sparks.length = 0;
    if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height); }
    box = null;
  }

  /* =======================================================================
     rAF loop: runs only while the ring, a press, a pull or sparks are moving
     ======================================================================= */
  function kick() {
    if (raf || paused || !active) return;
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function frame(now) {
    raf = 0;
    const dt = clamp(now - lastFrame, 1, 50);
    lastFrame = now;
    const k = dt / (1000 / 60);
    let busy = false, tx = px, ty = py;

    // Magnet: ring centre on the target, element pulled toward the pointer (or springing home)
    if (mag.el) {
      if (!mag.el.isConnected) restoreMagnet();
      else {
        if (mag.sy !== FX.scroll.y) measureMagnet();     // the one rect re-read, only after scrolling
        if (mag.releasing) {
          const s = dt / 1000;
          mag.vx += (-SPRING_K * mag.x - SPRING_C * mag.vx) * s;
          mag.vy += (-SPRING_K * mag.y - SPRING_C * mag.vy) * s;
          mag.x += mag.vx * s;
          mag.y += mag.vy * s;
          if (Math.abs(mag.x) + Math.abs(mag.y) < 0.05 && Math.abs(mag.vx) + Math.abs(mag.vy) < 1) restoreMagnet();
          else busy = true;
        } else {
          const ox = px - mag.cx, oy = py - mag.cy;
          tx = mag.cx + clamp(ox * RING_SHIFT, -RING_SHIFT_MAX, RING_SHIFT_MAX);
          ty = mag.cy + clamp(oy * RING_SHIFT, -RING_SHIFT_MAX, RING_SHIFT_MAX);
          const gx = mag.canPull ? clamp(ox * PULL, -mag.lim, mag.lim) : 0;
          const gy = mag.canPull ? clamp(oy * PULL, -mag.lim, mag.lim) : 0;
          const a = 1 - Math.pow(PULL_FOLLOW, k);
          mag.x += (gx - mag.x) * a;
          mag.y += (gy - mag.y) * a;
          if (Math.abs(gx - mag.x) + Math.abs(gy - mag.y) > 0.05) busy = true;
          else { mag.x = gx; mag.y = gy; }
        }
        if (mag.el) writeMagnet();
      }
    }

    // Ring position
    const a = 1 - Math.pow(RING_FOLLOW, k);
    rx += (tx - rx) * a;
    ry += (ty - ry) * a;
    if (Math.abs(tx - rx) > 0.1 || Math.abs(ty - ry) > 0.1) busy = true;
    else { rx = tx; ry = ty; }

    // Press scales (ring .82, dot 1.6)
    const sa = 1 - Math.pow(SCALE_FOLLOW, k), rsT = pressed ? 0.82 : 1, dsT = pressed ? 1.6 : 1;
    const dotScaling = ds !== dsT;
    rs += (rsT - rs) * sa;
    ds += (dsT - ds) * sa;
    if (Math.abs(rsT - rs) > 0.002 || Math.abs(dsT - ds) > 0.002) busy = true;
    else { rs = rsT; ds = dsT; }
    writeRing();
    if (dotScaling) writeDot();

    // Sparkles
    if (ctx && (sparks.length || box)) {
      drawSparks(dt);
      if (sparks.length) busy = true;
    }

    if (busy && !paused) raf = requestAnimationFrame(frame);
  }

  /* =======================================================================
     Wiring
     ======================================================================= */
  function press(down) {
    if (pressed === down) return;
    pressed = down;
    root.classList.toggle('is-pressed', down);
    kick();
  }

  function onPointer(P, e) {
    if (!e || !isMouse(e)) return;
    px = P.x; py = P.y;
    if (!active) {
      if (!cursorAllowed()) return;
      activate(e.target);                                   // first real mouse move: no orb at 0,0
    }
    if (kbd && Math.abs(px - kx) + Math.abs(py - ky) > 3) {
      kbd = false;
      cl.remove('fx-kbd');
      snapNext = true;
      resolve(e.target);
    }
    if (snapNext) snap();
    if (pressed && e.buttons === 0) press(false);           // released outside the window
    writeDot();                                             // synchronous: the dot never lags
    if (!kbd) trail(px, py, e.timeStamp);
    kick();
  }

  function onDown(e) {
    if (isMouse(e)) { if (active) press(true); return; }
    tapDown = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp };
    deactivate();                                           // hybrid device: touch/pen hides the orb
  }

  function onUp(e) {
    if (isMouse(e)) {
      if (active && pressed) { press(false); burst(); }
      return;
    }
    const t = tapDown;
    tapDown = null;
    if (t && t.id === e.pointerId && e.timeStamp - t.t < TAP_MAX_MS &&
        Math.hypot(e.clientX - t.x, e.clientY - t.y) < TAP_MAX_MOVE) showTap(e.clientX, e.clientY);
  }

  function onOver(e) {
    if (active && isMouse(e)) resolve(e.target);
  }

  function onOut(e) {
    if (!active || !isMouse(e) || e.relatedTarget) return;
    setMagnet(null);                                        // left the window: fade out, release
    setState('hidden');
  }

  function onKey(e) {
    if (!active || kbd || !KBD_KEYS.has(e.key)) return;
    kbd = true;
    kx = px; ky = py;
    cl.add('fx-kbd');                                       // orb hidden: never over a focus ring
    setMagnet(null);
  }

  // Passive document listeners; nothing here ever calls preventDefault
  const passive = { passive: true };
  d.addEventListener('pointerdown', onDown, passive);
  d.addEventListener('pointerup', onUp, passive);

  if (FX.finePointer) {
    FX.onPointer(onPointer);
    FX.onScroll(() => { if (mag.el) kick(); });             // keep the ring on a magnet target while scrolling
    d.addEventListener('pointerover', onOver, passive);
    d.addEventListener('pointerout', onOut, passive);
    d.addEventListener('keydown', onKey, passive);

    // A modal / viewer / drawer / chat can open or close under a still pointer: no pointerover/out
    // fires, so the ring would stay snapped to the button that opened it. Re-resolve from the
    // element that is actually under the pointer now (one hit-test, only on these events).
    const reresolve = () => setTimeout(() => {
      if (!active || kbd) return;
      const t = d.elementFromPoint(px, py);
      if (t) resolve(t); else { setMagnet(null); setState('default'); }
    }, 0);
    FX.on('overlay', reresolve);
    FX.on('chat', reresolve);

    FX.on('theme', () => { if (ctx) readColors(); });
    FX.on('layout', () => {
      if (ctx) sizeCanvas();
      if (mag.el) { mag.sy = NaN; kick(); }
    });
    FX.on('motion', () => { if (!FX.motion) deactivate(); });
    FX.on('visibility', ({ visible }) => {
      paused = !visible;
      if (!paused) return;
      stop();
      restoreMagnet();
      if (active) {                                         // resume clean: no stale press, sparks or pull
        if (state === 'magnet') setState('link');
        press(false); rs = 1; ds = 1; snapNext = true;
        clearSparks();
        writeRing(); writeDot();
      }
    });
  }

  FX.markReady('cursor');
})();
