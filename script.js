/* =========================================================================
   script.js — core behaviour (theme, nav, section spy, modals, chat,
   photo viewer, gallery tabs). Works with or without window.FX (§9.3/§9.4).
   ========================================================================= */
(function () {
    'use strict';

    const doc = document;
    const htmlElement = doc.documentElement;
    const body = doc.body;

    /* ---------- FX shim (page keeps working if the boot script is missing) ---------- */
    const FX = window.FX || createShim();

    function createShim() {
        const scroll = { y: window.scrollY || 0 };
        const subs = [];
        let ticking = false;
        const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        // The one passive scroll listener that drives .is-scrolled / .is-hidden without FX
        window.addEventListener('scroll', () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                scroll.y = window.scrollY || 0;
                subs.forEach(fn => fn(scroll));
            });
        }, { passive: true });
        return {
            enabled: true, reducedMotion: reduced, motion: !reduced, flags: {}, state: {}, scroll,
            emit() {}, on() { return () => {}; },
            onScroll(fn) { subs.push(fn); fn(scroll); },
            onPointer() {}, markReady() {}
        };
    }

    const prefersMotion = () => FX.motion !== false && !FX.reducedMotion;
    const flags = FX.flags || {};

    /* ---------- Theme ("Dawn breaks", §8.7) ---------- */
    const themeToggle = doc.getElementById('theme-toggle');
    const themeIcon = themeToggle ? themeToggle.querySelector('i') : null;
    const themeMeta = doc.querySelector('meta[name="theme-color"]');

    const savedTheme = () => {
        try { return localStorage.getItem('theme'); } catch (e) { return null; }
    };
    const fallbackTheme = savedTheme() === 'light' ? 'light' : 'dark';
    const currentTheme = htmlElement.getAttribute('data-theme') || fallbackTheme;
    htmlElement.setAttribute('data-theme', currentTheme);

    function syncIcon(t) {
        // Expose the state to assistive tech: the name says what activating the toggle does
        if (themeToggle) themeToggle.setAttribute('aria-label', t === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
        if (!themeIcon) return;
        themeIcon.classList.toggle('fa-sun', t === 'dark');
        themeIcon.classList.toggle('fa-moon', t !== 'dark');
    }

    function applyTheme(t) {
        htmlElement.setAttribute('data-theme', t);
        try { localStorage.setItem('theme', t); } catch (e) { /* storage blocked */ }
        syncIcon(t);
        if (themeMeta) themeMeta.setAttribute('content', t === 'light' ? '#fbf7ff' : '#0b0820');
        FX.emit('theme', { theme: t });
    }

    syncIcon(currentTheme);

    if (themeToggle) {
        let themeBusy = false;
        let fadeTimer = 0;

        themeToggle.addEventListener('click', () => {
            if (themeBusy) return;
            const next = htmlElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';

            if (doc.startViewTransition && prefersMotion() && !flags.novt) {
                // Circular wipe from the toggle, radius computed to the farthest corner
                const r = themeToggle.getBoundingClientRect();
                const x = r.left + r.width / 2;
                const y = r.top + r.height / 2;
                const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
                themeBusy = true;
                const vt = doc.startViewTransition(() => applyTheme(next));
                vt.ready.then(() => htmlElement.animate(
                    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
                    { duration: 700, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' }
                )).catch(() => {});
                vt.finished.catch(() => {}).then(() => { themeBusy = false; });
            } else {
                // Fallback: short colour crossfade (instant under reduced motion via the kill-switch)
                htmlElement.classList.add('theme-fade');
                applyTheme(next);
                clearTimeout(fadeTimer);
                fadeTimer = setTimeout(() => htmlElement.classList.remove('theme-fade'), 400);
            }
        });
    }

    /* ---------- Navigation drawer ---------- */
    const navbar = doc.querySelector('.navbar');
    const hamburger = doc.querySelector('.hamburger');
    const navMenu = doc.getElementById('nav-menu') || doc.querySelector('.nav-menu');
    const navLinks = [...doc.querySelectorAll('.nav-link')];
    let menuOpen = false;
    const drawerLinks = () => (navMenu ? [...navMenu.querySelectorAll('a[href]')] : []);

    function setMenu(open) {
        open = !!open;
        if (!navMenu || open === menuOpen) return;
        const focusInside = navMenu.contains(doc.activeElement);
        menuOpen = open;
        navMenu.classList.toggle('active', open);
        if (hamburger) {
            hamburger.classList.toggle('is-open', open);
            hamburger.setAttribute('aria-expanded', String(open));
            hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        }
        FX.emit('overlay', { open, kind: 'menu', id: 'nav-menu' });
        if (open) {
            // Move focus into the drawer (its links precede the hamburger in the DOM)
            requestAnimationFrame(() => {
                const first = drawerLinks()[0];
                if (menuOpen && first) first.focus();
            });
        } else if (focusInside && hamburger && hamburger.offsetParent !== null) {
            hamburger.focus();
        }
    }

    if (hamburger) hamburger.addEventListener('click', () => setMenu(!menuOpen));
    navLinks.forEach(link => link.addEventListener('click', () => setMenu(false)));

    if (navbar) {
        // Close the drawer once focus moves outside the navbar
        navbar.addEventListener('focusout', (e) => {
            if (menuOpen && e.relatedTarget instanceof Node && !navbar.contains(e.relatedTarget)) setMenu(false);
        });
        // While open, Tab wraps between the hamburger and the drawer links (visual order)
        navbar.addEventListener('keydown', (e) => {
            if (!menuOpen || e.key !== 'Tab' || !hamburger) return;
            const links = drawerLinks();
            if (!links.length) return;
            if (!e.shiftKey && doc.activeElement === hamburger) {
                e.preventDefault();
                links[0].focus();
            } else if (e.shiftKey && doc.activeElement === links[0]) {
                e.preventDefault();
                hamburger.focus();
            }
        });
    }

    doc.addEventListener('pointerdown', (e) => {
        if (menuOpen && e.target instanceof Element && !e.target.closest('.navbar')) setMenu(false);
    }, { passive: true });

    if (window.matchMedia) {
        const wideNav = window.matchMedia('(min-width: 1100px)');
        const onWide = (e) => { if (e.matches) setMenu(false); };
        if (wideNav.addEventListener) wideNav.addEventListener('change', onWide);
        else if (wideNav.addListener) wideNav.addListener(onWide);
    }

    /* ---------- Section spy (IntersectionObserver, emits fx:section) ---------- */
    const NAV_ALIAS = { articles: 'side-quests', footer: 'contact' };
    let spyTargets = [...doc.querySelectorAll('main section[id]')];
    if (!spyTargets.length) spyTargets = [...doc.querySelectorAll('section[id]')];
    const footerEl = doc.querySelector('.footer');
    let currentSection = null;
    let lastSection = 'home';

    function setSection(id) {
        if (id === currentSection) return;
        const prev = currentSection;
        currentSection = id;
        if (id !== 'footer') lastSection = id;
        const navId = NAV_ALIAS[id] || id;
        navLinks.forEach(l => {
            const on = l.getAttribute('href') === '#' + navId;
            l.classList.toggle('active', on);
            if (on) l.setAttribute('aria-current', 'location'); else l.removeAttribute('aria-current');
        });
        FX.emit('section', {
            id, prev, navId,
            index: id === 'footer' ? spyTargets.length : spyTargets.findIndex(s => s.id === id)
        });
    }

    if ('IntersectionObserver' in window) {
        const spy = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (!e.isIntersecting) return;
                // Record it even under the footer so leaving the footer restores the section actually in the band
                lastSection = e.target.id;
                if (currentSection !== 'footer') setSection(e.target.id);
            });
        }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
        spyTargets.forEach(s => spy.observe(s));

        if (footerEl) new IntersectionObserver(([e]) => {
            if (e.isIntersecting) setSection('footer');
            else if (currentSection === 'footer') setSection(lastSection);
        }, { threshold: 0.5 }).observe(footerEl);
    }

    // One rect pass at load only
    setSection(scrollY < innerHeight * 0.5 ? 'home'
        : (spyTargets.find(s => s.getBoundingClientRect().bottom > innerHeight * 0.5)?.id || 'home'));

    /* ---------- Scroll-driven states ---------- */
    if (navbar) FX.onScroll(s => navbar.classList.toggle('is-scrolled', s.y > 24));

    const scrollIndicator = doc.querySelector('.scroll-indicator');
    if (scrollIndicator) FX.onScroll(s => scrollIndicator.classList.toggle('is-hidden', s.y > 100));

    /* ---------- Smooth scroll for in-page links ---------- */
    doc.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const hash = anchor.getAttribute('href');
            if (!hash || hash.length <= 1) return;
            let target = null;
            try { target = doc.querySelector(hash); } catch (err) { return; }
            if (!target) return;
            e.preventDefault();
            setMenu(false);
            target.scrollIntoView({ behavior: prefersMotion() ? 'smooth' : 'auto', block: 'start' });
            history.replaceState(null, '', hash);
            // Move focus to the target so the next Tab continues from there (fragment navigation was cancelled)
            if (!target.hasAttribute('tabindex') && !target.matches('a[href], button, input, select, textarea')) {
                target.setAttribute('tabindex', '-1');
            }
            target.focus({ preventScroll: true });
        });
    });

    /* ---------- Modals (one setup for all three) ---------- */
    const modals = [];
    const FOCUSABLE = 'a[href], button:not([disabled])';

    function setupModal({ modal, openBtn, closeBtn, overlay }) {
        if (!modal) return;
        let opener = null;
        let closeTimer = 0;

        const isOpen = () => modal.classList.contains('active') && !modal.classList.contains('is-closing');

        const open = () => {
            if (modal.classList.contains('active')) return;
            opener = openBtn || (doc.activeElement instanceof HTMLElement ? doc.activeElement : null);
            modal.classList.add('active');
            modal.setAttribute('aria-hidden', 'false');
            body.style.overflow = 'hidden';
            const focusTarget = closeBtn || modal.querySelector(FOCUSABLE);
            if (focusTarget) focusTarget.focus();
            FX.emit('overlay', { open: true, kind: 'modal', id: modal.id });
        };

        const finishClose = () => {
            modal.classList.remove('active', 'is-closing');
            modal.setAttribute('aria-hidden', 'true');
            body.style.overflow = '';
            if (opener && opener.isConnected) opener.focus();
            opener = null;
            FX.emit('overlay', { open: false, kind: 'modal', id: modal.id });
        };

        const close = () => {
            if (!isOpen()) return;
            modal.classList.add('is-closing');
            clearTimeout(closeTimer);
            if (prefersMotion()) closeTimer = setTimeout(finishClose, 200);
            else finishClose();
        };

        if (openBtn) openBtn.addEventListener('click', open);
        if (closeBtn) closeBtn.addEventListener('click', close);
        if (overlay) overlay.addEventListener('click', close);
        modals.push({ modal, isOpen, close });
    }

    const byId = (id) => doc.getElementById(id);
    [
        ['ambassador-modal', 'open-ambassador-modal', 'close-modal', 'modal-overlay'],
        ['leadership-modal', 'open-leadership-modal', 'close-leadership-modal', 'leadership-modal-overlay'],
        ['industry-modal', 'open-industry-modal', 'close-industry-modal', 'industry-modal-overlay']
    ].forEach(([modal, openBtn, closeBtn, overlay]) => setupModal({
        modal: byId(modal), openBtn: byId(openBtn), closeBtn: byId(closeBtn), overlay: byId(overlay)
    }));

    const activeModal = () => modals.find(m => m.isOpen()) || null;

    // Keep Tab inside the open modal (ignores a modal that is closing)
    function trapModalFocus(e) {
        const m = activeModal();
        if (!m) return;
        const content = m.modal.querySelector('.modal-content') || m.modal;
        const focusable = [...content.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const inside = content.contains(doc.activeElement);
        if (e.shiftKey && (doc.activeElement === first || !inside)) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (doc.activeElement === last || !inside)) {
            e.preventDefault();
            first.focus();
        }
    }

    // Log a welcome message
    console.log('%c👋 Welcome to my portfolio!', 'color: #8b5cf6; font-size: 20px; font-weight: bold;');
    console.log('%cInterested in the code? Check out the GitHub repo!', 'color: #ec4899; font-size: 14px;');

    /* ---------- AI chat widget (lazy iframe, focus return, FX.openChat/closeChat) ---------- */
    const aiChatToggle = doc.getElementById('ai-chat-toggle');
    const aiChatPanel = doc.getElementById('ai-chat-panel');
    const aiChatClose = doc.getElementById('ai-chat-close');
    const chatFrame = aiChatPanel ? aiChatPanel.querySelector('iframe') : null;
    let chatOpen = false;
    let chatOpener = null;

    function loadChat() {
        if (chatFrame && chatFrame.dataset.src && !chatFrame.getAttribute('src')) chatFrame.src = chatFrame.dataset.src;
    }

    const isShown = (el) => !!el && el.isConnected && el.offsetParent !== null
        && getComputedStyle(el).visibility !== 'hidden';

    function openChat(source) {
        if (!aiChatPanel || chatOpen) return;
        loadChat();
        chatOpen = true;
        aiChatPanel.classList.remove('hidden');
        if (aiChatToggle) aiChatToggle.setAttribute('aria-expanded', 'true');
        chatOpener = (source instanceof HTMLElement ? source : null)
            || (FX._chatOpener instanceof HTMLElement ? FX._chatOpener : null)
            || aiChatToggle;
        FX._chatOpener = null;
        setTimeout(() => { if (chatOpen && aiChatClose) aiChatClose.focus(); }, 50);
        FX.emit('chat', { open: true, source: (chatOpener && chatOpener.id) || '' });
    }

    function closeChat() {
        if (!aiChatPanel || !chatOpen) return;
        const focusInside = aiChatPanel.contains(doc.activeElement);
        chatOpen = false;
        aiChatPanel.classList.add('hidden');
        if (aiChatToggle) aiChatToggle.setAttribute('aria-expanded', 'false');
        FX.emit('chat', { open: false });
        if (focusInside) {
            const mascotBtn = doc.getElementById('mascot-btn');
            const target = isShown(chatOpener) ? chatOpener : (isShown(mascotBtn) ? mascotBtn : aiChatToggle);
            if (target) target.focus();
        }
        chatOpener = null;
    }

    if (aiChatToggle) {
        aiChatToggle.addEventListener('pointerenter', loadChat, { once: true });
        aiChatToggle.addEventListener('focus', loadChat, { once: true });
        aiChatToggle.addEventListener('click', () => (chatOpen ? closeChat() : openChat(aiChatToggle)));
    }
    if (aiChatClose) aiChatClose.addEventListener('click', closeChat);

    if (window.FX) {
        FX.openChat = openChat;
        FX.closeChat = closeChat;
    }

    /* ---------- Photo viewer (Side Quests cards + Gallery) ---------- */
    const photoViewer = doc.getElementById('photo-viewer');
    let viewer = null;   // { isOpen, close } for the unified Escape handler

    if (photoViewer) {
        const viewerImg = doc.getElementById('photo-viewer-img');
        const viewerCaption = doc.getElementById('photo-viewer-caption');
        const viewerClose = doc.getElementById('photo-viewer-close');
        const viewerPrev = doc.getElementById('photo-viewer-prev');
        const viewerNext = doc.getElementById('photo-viewer-next');
        const viewerOverlay = doc.getElementById('photo-viewer-overlay');

        const FLIP_WAIT = 700;   // ms to wait for decode before giving up on the zoom
        let viewerPhotos = []; // [{ src, caption, alt }]
        let viewerIndex = 0;
        let viewerOpener = null;
        let viewerToken = 0;   // invalidates pending decode callbacks

        const viewerIsOpen = () => photoViewer.classList.contains('active');
        const canAnimate = () => prefersMotion() && typeof viewerImg.animate === 'function';
        const decoded = () => (viewerImg.decode ? viewerImg.decode() : Promise.resolve()).catch(() => {});

        const showViewerPhoto = (index, crossfade = true) => {
            const total = viewerPhotos.length;
            viewerIndex = (index + total) % total;
            const photo = viewerPhotos[viewerIndex];
            viewerImg.src = photo.src;
            viewerImg.alt = photo.alt || photo.caption;
            viewerCaption.textContent = total > 1
                ? `${photo.caption} · ${viewerIndex + 1} / ${total}`
                : photo.caption;

            // Preload neighbours so arrows feel instant
            if (total > 1) {
                new Image().src = viewerPhotos[(viewerIndex + 1) % total].src;
                new Image().src = viewerPhotos[(viewerIndex - 1 + total) % total].src;
            }

            if (crossfade && canAnimate()) {
                const token = ++viewerToken;
                decoded().then(() => {
                    if (token === viewerToken && viewerIsOpen()) viewerImg.animate([{ opacity: 0 }, { opacity: 1 }], 180);
                });
            }
        };

        // FLIP: the photo zooms out of its thumbnail into the stage
        const zoomFromThumb = (opener) => {
            const thumb = opener && opener.querySelector('img');
            if (!thumb || !canAnimate()) return;
            const from = thumb.getBoundingClientRect();
            const token = ++viewerToken;
            const started = performance.now();
            const hold = viewerImg.animate([{ opacity: 0 }, { opacity: 0 }], FLIP_WAIT);
            decoded().then(() => {
                hold.cancel();
                if (token !== viewerToken || !viewerIsOpen() || performance.now() - started > FLIP_WAIT) return;
                const to = viewerImg.getBoundingClientRect();
                if (!from.width || !to.width) return;
                const dx = (from.left + from.width / 2) - (to.left + to.width / 2);
                const dy = (from.top + from.height / 2) - (to.top + to.height / 2);
                const s = from.width / to.width;
                viewerImg.animate([
                    { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 0.6, borderRadius: '18px' },
                    { transform: 'none', opacity: 1 }
                ], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
            });
        };

        const openPhotoViewer = (photos, startIndex, opener) => {
            if (!photos.length) return;
            viewerPhotos = photos;
            viewerOpener = opener;
            photoViewer.classList.toggle('single', photos.length === 1);
            showViewerPhoto(startIndex, false);
            photoViewer.classList.add('active');
            photoViewer.setAttribute('aria-hidden', 'false');
            body.style.overflow = 'hidden';
            viewerClose.focus();
            FX.emit('overlay', { open: true, kind: 'photo', id: 'photo-viewer' });
            zoomFromThumb(opener);
        };

        const closePhotoViewer = () => {
            if (!viewerIsOpen()) return;
            viewerToken++;
            if (viewerImg.getAnimations) viewerImg.getAnimations().forEach(a => a.cancel());
            photoViewer.classList.remove('active');
            photoViewer.setAttribute('aria-hidden', 'true');
            viewerImg.removeAttribute('src');
            body.style.overflow = '';
            if (viewerOpener) viewerOpener.focus();
            FX.emit('overlay', { open: false, kind: 'photo', id: 'photo-viewer' });
        };

        viewer = { isOpen: viewerIsOpen, close: closePhotoViewer };

        // Side Quest cards: photos listed in data-photos, separated by "|"
        doc.querySelectorAll('.side-quest-photo-btn').forEach(button => {
            const card = button.closest('.bento-card');
            const title = card ? card.querySelector('h3').textContent.trim() : '';
            const coverAlt = button.querySelector('img')?.alt || title;
            const photos = (button.dataset.photos || '')
                .split('|').map(src => src.trim()).filter(Boolean)
                .map((src, i) => ({ src, caption: title, alt: i === 0 ? coverAlt : `${title} – photo ${i + 1}` }));

            if (photos.length > 1) {
                const badge = doc.createElement('span');
                badge.className = 'photo-count';
                badge.innerHTML = `<i class="fas fa-images"></i> ${photos.length}`;
                button.appendChild(badge);
            }
            button.addEventListener('click', () => openPhotoViewer(photos, 0, button));
        });

        // Gallery: each year's photos open together, starting at the clicked one
        doc.querySelectorAll('#gallery .gallery-grid').forEach(grid => {
            const cards = [...grid.querySelectorAll('.gallery-card')];
            const photos = cards.map(card => {
                const img = card.querySelector('img');
                const caption = card.querySelector('.gallery-overlay p')?.textContent.trim() || img.alt;
                return { src: img.getAttribute('src'), caption, alt: img.alt };
            });

            cards.forEach((card, i) => {
                card.setAttribute('role', 'button');
                card.setAttribute('tabindex', '0');
                card.setAttribute('aria-label', `View photo: ${photos[i].caption}`);
                card.addEventListener('click', () => openPhotoViewer(photos, i, card));
                card.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openPhotoViewer(photos, i, card);
                    }
                });
            });
        });

        viewerPrev.addEventListener('click', () => showViewerPhoto(viewerIndex - 1));
        viewerNext.addEventListener('click', () => showViewerPhoto(viewerIndex + 1));
        viewerClose.addEventListener('click', closePhotoViewer);
        viewerOverlay.addEventListener('click', closePhotoViewer);

        // Keyboard: arrows navigate, Tab stays inside the viewer (Escape: unified handler below)
        doc.addEventListener('keydown', (e) => {
            if (!viewerIsOpen()) return;
            const multiple = viewerPhotos.length > 1;

            if (e.key === 'ArrowLeft' && multiple) {
                showViewerPhoto(viewerIndex - 1);
            } else if (e.key === 'ArrowRight' && multiple) {
                showViewerPhoto(viewerIndex + 1);
            } else if (e.key === 'Tab') {
                const focusable = [viewerClose, viewerPrev, viewerNext].filter(b => b.offsetParent !== null);
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                // Also wrap when focus is not on a viewer control (e.g. after clicking the photo)
                const inside = focusable.includes(doc.activeElement);
                if (e.shiftKey && (doc.activeElement === first || !inside)) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && (doc.activeElement === last || !inside)) {
                    e.preventDefault();
                    first.focus();
                }
            }
        });

        // Swipe left/right on phones
        let touchStartX = null;
        photoViewer.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].clientX;
        }, { passive: true });
        photoViewer.addEventListener('touchend', (e) => {
            if (touchStartX === null || viewerPhotos.length < 2) return;
            const dx = e.changedTouches[0].clientX - touchStartX;
            touchStartX = null;
            if (Math.abs(dx) > 50) showViewerPhoto(viewerIndex + (dx < 0 ? 1 : -1));
        }, { passive: true });
    }

    /* ---------- Gallery year tabs ---------- */
    const galleryTabs = [...doc.querySelectorAll('.gallery-tab')];

    const selectGalleryTab = (tab) => {
        const changed = !tab.classList.contains('active');
        galleryTabs.forEach(t => {
            const selected = t === tab;
            t.classList.toggle('active', selected);
            t.setAttribute('aria-selected', String(selected));
            t.tabIndex = selected ? 0 : -1;
            doc.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
        });
        if (!changed) return;
        FX.emit('gallery', { panelId: tab.getAttribute('aria-controls') });
        FX.emit('layout', { reason: 'gallery' });
    };

    galleryTabs.forEach((tab, i) => {
        tab.addEventListener('click', () => selectGalleryTab(tab));
        tab.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const step = e.key === 'ArrowRight' ? 1 : -1;
            const next = galleryTabs[(i + step + galleryTabs.length) % galleryTabs.length];
            selectGalleryTab(next);
            next.focus();
        });
    });

    /* ---------- Unified keyboard handler: Escape priority + modal Tab trap ---------- */
    doc.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') { trapModalFocus(e); return; }
        if (e.key !== 'Escape') return;

        if (viewer && viewer.isOpen()) { viewer.close(); return; }
        const modal = activeModal();
        if (modal) { modal.close(); return; }
        if (chatOpen) { closeChat(); return; }
        if (menuOpen) {
            setMenu(false);
            if (hamburger) hamburger.focus();
        }
    });

    FX.markReady('core');
})();
