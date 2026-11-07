/* =========================================================================
   scroll-fx.js — MOTION (§8): reveals, section state + mood, nav indicator,
   scroll-progress fallback, card spotlight / tilt / glare / holo.
   Classic deferred script; needs window.FX (exits quietly without it).
   Uses FX.onScroll / FX.on only: no window scroll or pointermove listeners.
   ========================================================================= */
(function () {
    'use strict';

    const FX = window.FX;
    if (!FX) return;

    const doc = document;
    const root = doc.documentElement;
    const byDomOrder = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const guard = (name, fn) => {
        try { fn(); } catch (err) { if (FX.debug) console.error('[scroll-fx] ' + name, err); }
    };

    /* ---------- 1. Reveal system (§8.1) ---------- */
    const REVEAL_SELECTOR = '.section-eyebrow, .section-title, .gallery-tabs, .gallery-intro, .bento-grid > .bento-card';
    const revealOn = () => root.classList.contains('fx-reveal');
    const targets = [...doc.querySelectorAll(REVEAL_SELECTOR)].filter(el => !el.closest('#home'));
    let revealIO = null;

    const revealNow = (el) => el.classList.add('rv-in', 'rv-now');
    const delayFor = (el, i) => (el.classList.contains('gallery-card') ? Math.min(i, 8) * 50 : Math.min(i, 7) * 70) + 'ms';

    if (!revealOn() || !('IntersectionObserver' in window)) {
        targets.forEach(revealNow);
    } else {
        // Already on screen at init: show in this frame, never animate in late
        const vh = innerHeight * 0.9;
        const pending = [];
        targets.forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.bottom > 0 && r.top < vh && (r.width || r.height)) revealNow(el);
            else pending.push(el);
        });

        revealIO = new IntersectionObserver(entries => {
            entries.filter(e => e.isIntersecting).map(e => e.target).sort(byDomOrder).forEach((el, i) => {
                el.style.setProperty('--rv-delay', delayFor(el, i));
                el.classList.add('rv-in');
                revealIO.unobserve(el);
            });
        }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
        pending.forEach(el => revealIO.observe(el));
    }

    // Gallery tab switch: the new panel's photos develop again in a cascade
    FX.on('gallery', ({ panelId }) => {
        const panel = panelId && doc.getElementById(panelId);
        if (!panel || !revealOn()) return;
        const cards = [...panel.querySelectorAll('.gallery-grid > .gallery-card')];
        cards.forEach(card => {
            card.classList.remove('rv-in', 'rv-now');
            if (revealIO) revealIO.unobserve(card);
        });
        void panel.offsetHeight;   // one reflow so the animation restarts
        cards.forEach((card, i) => {
            card.style.setProperty('--rv-delay', Math.min(i, 8) * 50 + 'ms');
            card.classList.add('rv-in');
        });
    });

    // Printing always shows everything
    window.addEventListener('beforeprint', () => targets.forEach(revealNow));

    FX.markReady('scroll');

    /* ---------- 2. Section state, seams and sky mood (§8.2) ---------- */
    guard('sections', () => {
        const sections = [...doc.querySelectorAll('section[id]')];
        if ('IntersectionObserver' in window) {
            const sectionIO = new IntersectionObserver(entries => entries.forEach(e => {
                e.target.classList.toggle('is-visible', e.isIntersecting);
                if (e.isIntersecting) e.target.classList.add('is-inview');
            }), { threshold: 0 });
            sections.forEach(s => sectionIO.observe(s));
        } else {
            sections.forEach(s => s.classList.add('is-visible', 'is-inview'));
        }

        const fxBg = doc.getElementById('fx-bg');
        if (!fxBg) return;
        const setMood = (id) => {
            const section = id && id !== 'footer' ? doc.getElementById(id) : null;
            const mood = (section && section.dataset.fxMood) || 'ember';
            if (fxBg.dataset.mood !== mood) fxBg.dataset.mood = mood;
        };
        setMood(FX.state.section);
        FX.on('section', ({ id }) => setMood(id));
    });

    /* ---------- 3. Gliding nav indicator (§8.3) ---------- */
    guard('indicator', () => {
        const menu = doc.querySelector('.nav-menu');
        if (!menu) return;
        const indicator = doc.createElement('li');
        indicator.className = 'nav-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        indicator.setAttribute('role', 'presentation');
        menu.appendChild(indicator);
        menu.classList.add('has-indicator');

        let placed = false;   // true once positioned while visible (desktop nav)
        const place = (link) => {
            const w = link ? link.offsetWidth : 0;
            if (!w) { indicator.classList.remove('is-on'); return; }
            // First visible placement jumps into position; later ones glide
            const visible = indicator.offsetParent !== null;
            const jump = !placed || !visible;
            if (jump) indicator.classList.add('is-instant');
            indicator.style.setProperty('--ni-x', link.offsetLeft + 'px');
            indicator.style.setProperty('--ni-w', w + 'px');
            indicator.classList.add('is-on');
            if (jump) {
                void indicator.offsetWidth;
                indicator.classList.remove('is-instant');
            }
            placed = visible;
        };
        const placeActive = () => place(menu.querySelector('.nav-link.active'));

        placeActive();
        FX.on('section', placeActive);
        FX.on('layout', placeActive);

        // Hover previews a link; leaving the menu returns to the active one
        menu.addEventListener('pointerover', (e) => {
            const link = e.target instanceof Element && e.target.closest('.nav-link');
            if (link && e.pointerType !== 'touch') place(link);
        });
        menu.addEventListener('pointerleave', placeActive);
    });

    /* ---------- 4. Scroll progress fallback (§8.4) ---------- */
    guard('progress', () => {
        const bar = doc.querySelector('.fx-progress');
        const timeline = window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()');
        if (!bar || timeline) return;
        const initMax = Math.max(1, root.scrollHeight - innerHeight);   // until the boot measures on fx:layout
        let last = -1;
        const write = () => {
            const S = FX.scroll;
            const p = Math.min(1, Math.max(0, S.y / (S.max > 1 ? S.max : initMax)));
            if (Math.abs(p - last) <= 0.001) return;
            last = p;
            bar.style.setProperty('--scroll-p', p.toFixed(4));
        };
        FX.onScroll(write);
        FX.on('layout', write);
    });

    /* ---------- 5. Card spotlight, tilt, glare, holo (§8.5) ---------- */
    guard('cards', () => {
        if (!FX.enabled || !FX.finePointer) return;

        const grids = [...doc.querySelectorAll('.bento-grid')];
        if (!grids.length) return;

        const LERP = 0.14;
        const EPS = 0.02;
        const LIFT = -6;
        const isHolo = (card) => card.matches('.certificates-grid .large-horizontal');
        const maxTilt = (card) => (card.matches('.large, .large-horizontal, .wide') ? 3 : 6);
        const tiltAllowed = () => FX.motion && FX.tier !== 'low' && innerWidth >= 1024;

        let tiltOn = tiltAllowed();
        let hovered = null;                 // card under the pointer
        let rect = null, rectScrollY = 0;   // cached rect of the hovered card
        let px = 0, py = 0;                 // last pointer position (client coords)
        let frame = 0;
        const tilting = new Map();          // card -> { x, y, lift, tx, ty, tl }

        const clearTilt = (card) => {
            card.classList.remove('is-tilting');
            ['--tilt-x', '--tilt-y', '--lift', '--glare'].forEach(v => card.style.removeProperty(v));
            tilting.delete(card);
        };

        const enter = (card) => {
            hovered = card;
            rect = card.getBoundingClientRect();
            rectScrollY = window.scrollY;
            const tiltable = tiltOn && !card.classList.contains('gallery-card');
            if (!card.classList.contains('gallery-card')) card.style.setProperty('--glare', '1');
            if (tiltable && !tilting.has(card)) {
                card.style.setProperty('--lift', '0px');
                card.style.setProperty('--tilt-x', '0deg');
                card.style.setProperty('--tilt-y', '0deg');
                card.classList.add('is-tilting');
                tilting.set(card, { x: 0, y: 0, lift: 0, tx: 0, ty: 0, tl: LIFT });
            } else if (tilting.has(card)) {
                tilting.get(card).tl = LIFT;
            }
            schedule();
        };

        const leave = (card) => {
            if (hovered === card) { hovered = null; rect = null; }
            const st = tilting.get(card);
            if (st) {
                st.tx = 0; st.ty = 0; st.tl = 0;
                card.style.setProperty('--glare', '0');   // removed with the other vars once settled
            } else {
                card.style.removeProperty('--glare');
            }
            schedule();
        };

        const resetAll = () => {
            if (hovered) hovered.style.removeProperty('--glare');
            hovered = null; rect = null;
            [...tilting.keys()].forEach(clearTilt);
        };

        function schedule() {
            if (!frame) frame = requestAnimationFrame(tick);
        }

        function tick() {
            frame = 0;

            // Pointer-driven light on the hovered card
            if (hovered && rect) {
                const sy = window.scrollY;
                if (sy !== rectScrollY) {   // cards move exactly with the page: shift, don't re-measure
                    rect = { left: rect.left, top: rect.top - (sy - rectScrollY), width: rect.width, height: rect.height };
                    rectScrollY = sy;
                }
                const nx = Math.min(0.5, Math.max(-0.5, (px - rect.left) / rect.width - 0.5));
                const ny = Math.min(0.5, Math.max(-0.5, (py - rect.top) / rect.height - 0.5));
                hovered.style.setProperty('--gx', ((nx + 0.5) * 100).toFixed(1) + '%');
                hovered.style.setProperty('--gy', ((ny + 0.5) * 100).toFixed(1) + '%');
                if (isHolo(hovered)) hovered.style.setProperty('--holo-angle', (nx * 240).toFixed(1) + 'deg');
                const st = tilting.get(hovered);
                if (st) {
                    const max = maxTilt(hovered);
                    st.ty = nx * 2 * max;
                    st.tx = -ny * 2 * max;
                }
            }

            // Shared tilt loop: runs only while a card is active or settling
            let busy = false;
            tilting.forEach((st, card) => {
                st.x += (st.tx - st.x) * LERP;
                st.y += (st.ty - st.y) * LERP;
                st.lift += (st.tl - st.lift) * LERP;
                const settled = Math.abs(st.tx - st.x) < EPS && Math.abs(st.ty - st.y) < EPS && Math.abs(st.tl - st.lift) < EPS;
                if (settled && card !== hovered && st.tl === 0) { clearTilt(card); return; }
                card.style.setProperty('--tilt-x', st.x.toFixed(2) + 'deg');
                card.style.setProperty('--tilt-y', st.y.toFixed(2) + 'deg');
                card.style.setProperty('--lift', st.lift.toFixed(2) + 'px');
                if (!settled) busy = true;
            });
            if (busy) schedule();
        }

        const cardFrom = (node) => (node instanceof Element ? node.closest('.bento-card') : null);

        grids.forEach(grid => {
            grid.addEventListener('pointerover', (e) => {
                if (e.pointerType === 'touch') return;
                const card = cardFrom(e.target);
                if (!card || card === hovered || !grid.contains(card)) return;
                if (hovered) leave(hovered);
                px = e.clientX; py = e.clientY;
                enter(card);
            });
            grid.addEventListener('pointerout', (e) => {
                const card = cardFrom(e.target);
                if (card && card === hovered && !card.contains(e.relatedTarget)) leave(card);
            });
            grid.addEventListener('pointermove', (e) => {
                if (!hovered || e.pointerType === 'touch') return;
                px = e.clientX; py = e.clientY;
                schedule();
            }, { passive: true });
        });

        // Keep the light under a still pointer while the page scrolls
        FX.onScroll(() => { if (hovered) schedule(); });

        // Overlays reset the active card at once; eligibility follows layout and motion
        FX.on('overlay', ({ open }) => { if (open) resetAll(); });
        const reevaluate = () => {
            const next = tiltAllowed();
            if (next === tiltOn) return;
            tiltOn = next;
            if (!tiltOn) [...tilting.keys()].forEach(clearTilt);
        };
        FX.on('layout', reevaluate);
        FX.on('motion', reevaluate);
    });
})();
