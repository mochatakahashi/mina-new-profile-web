// Theme Toggle (Dark/Light Mode)
const themeToggle = document.getElementById('theme-toggle');
const htmlElement = document.documentElement;
const themeIcon = themeToggle.querySelector('i');

// Check for saved theme preference or default to light mode
const currentTheme = localStorage.getItem('theme') || 'light';
htmlElement.setAttribute('data-theme', currentTheme);

// Update icon based on current theme
if (currentTheme === 'dark') {
    themeIcon.classList.remove('fa-moon');
    themeIcon.classList.add('fa-sun');
}

themeToggle.addEventListener('click', () => {
    const theme = htmlElement.getAttribute('data-theme');
    
    if (theme === 'light') {
        htmlElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        themeIcon.classList.remove('fa-moon');
        themeIcon.classList.add('fa-sun');
    } else {
        htmlElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
        themeIcon.classList.remove('fa-sun');
        themeIcon.classList.add('fa-moon');
    }
});

// Hamburger Menu Toggle
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');
const navLinks = document.querySelectorAll('.nav-link');

hamburger.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    
    // Animate hamburger icon
    const spans = hamburger.querySelectorAll('span');
    if (navMenu.classList.contains('active')) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(7px, -6px)';
    } else {
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
    }
});

// Close mobile menu when clicking on a link
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        const spans = hamburger.querySelectorAll('span');
        spans[0].style.transform = 'none';
        spans[1].style.opacity = '1';
        spans[2].style.transform = 'none';
    });
});

// Active Navigation Link on Scroll
const sections = document.querySelectorAll('section');

function updateActiveLink() {
    const scrollPosition = window.scrollY + 150;
    let currentSection = '';

    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        const sectionId = section.getAttribute('id');

        if (scrollPosition >= sectionTop - 200 && scrollPosition < sectionTop + sectionHeight - 200) {
            currentSection = sectionId;
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${currentSection}`) {
            link.classList.add('active');
        }
    });
}

// Initialize on load
window.addEventListener('load', updateActiveLink);
window.addEventListener('scroll', updateActiveLink);

// Update when hash changes
window.addEventListener('hashchange', updateActiveLink);

// Navbar Background on Scroll
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.style.boxShadow = '0 2px 20px rgba(139, 92, 246, 0.15)';
    } else {
        navbar.style.boxShadow = '0 2px 20px rgba(139, 92, 246, 0.1)';
    }
});

// Smooth Scroll for all links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Intersection Observer for Card Animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 0.6s ease forwards';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe all bento cards
const cards = document.querySelectorAll('.bento-card');
cards.forEach(card => {
    card.style.opacity = '0';
    observer.observe(card);
});

// Typing Effect for Hero Title (Optional Enhancement)
function typeWriter(element, text, speed = 100) {
    let i = 0;
    element.textContent = '';
    
    function type() {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
            setTimeout(type, speed);
        }
    }
    
    type();
}

// Uncomment to enable typing effect
// window.addEventListener('load', () => {
//     const heroTitle = document.querySelector('.hero h1');
//     const originalText = heroTitle.textContent;
//     typeWriter(heroTitle, originalText, 100);
// });

// Add parallax effect to hero section
window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const heroContent = document.querySelector('.hero-content');
    
    if (heroContent && scrolled < window.innerHeight) {
        heroContent.style.transform = `translateY(${scrolled * 0.5}px)`;
        heroContent.style.opacity = 1 - (scrolled / 500);
    }
});

// Gallery Image Modal (for future image implementation)
const galleryCards = document.querySelectorAll('.gallery-card');

galleryCards.forEach(card => {
    card.addEventListener('click', () => {
        // Add your image modal logic here
        console.log('Gallery card clicked - implement modal here');
    });
});

// Add cursor effect (optional aesthetic enhancement)
const createCursorFollower = () => {
    const cursor = document.createElement('div');
    cursor.className = 'cursor-follower';
    cursor.style.cssText = `
        position: fixed;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
        pointer-events: none;
        opacity: 0.5;
        transition: transform 0.15s ease;
        z-index: 9999;
        display: none;
    `;
    document.body.appendChild(cursor);

    document.addEventListener('mousemove', (e) => {
        if (window.innerWidth > 768) {
            cursor.style.display = 'block';
            cursor.style.left = e.clientX - 10 + 'px';
            cursor.style.top = e.clientY - 10 + 'px';
        }
    });

    // Grow cursor on hover
    const interactiveElements = document.querySelectorAll('a, button, .bento-card');
    interactiveElements.forEach(el => {
        el.addEventListener('mouseenter', () => {
            cursor.style.transform = 'scale(1.5)';
        });
        el.addEventListener('mouseleave', () => {
            cursor.style.transform = 'scale(1)';
        });
    });
};

// Uncomment to enable cursor follower
// createCursorFollower();

// Tech stack icons animation on hover
const techTags = document.querySelectorAll('.tech-tag');
techTags.forEach(tag => {
    tag.addEventListener('mouseenter', function() {
        this.style.boxShadow = '0 5px 15px rgba(139, 92, 246, 0.4)';
    });
    
    tag.addEventListener('mouseleave', function() {
        this.style.boxShadow = 'none';
    });
});

// Add counter animation for stats (if you add stats in the future)
function animateCounter(element, target, duration = 2000) {
    let start = 0;
    const increment = target / (duration / 16);
    
    const timer = setInterval(() => {
        start += increment;
        if (start >= target) {
            element.textContent = target;
            clearInterval(timer);
        } else {
            element.textContent = Math.floor(start);
        }
    }, 16);
}

// Hide scroll indicator when scrolling
const scrollIndicator = document.querySelector('.scroll-indicator');
if (scrollIndicator) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 100) {
            scrollIndicator.style.opacity = '0';
        } else {
            scrollIndicator.style.opacity = '1';
        }
    });
}

// Add loading animation
window.addEventListener('load', () => {
    document.body.style.opacity = '0';
    setTimeout(() => {
        document.body.style.transition = 'opacity 0.5s ease';
        document.body.style.opacity = '1';
    }, 100);
});

// Ambassador Modal
const openModalBtn = document.getElementById('open-ambassador-modal');
const ambassadorModal = document.getElementById('ambassador-modal');
const closeModalBtn = document.getElementById('close-modal');
const modalOverlay = document.getElementById('modal-overlay');

if (openModalBtn && ambassadorModal) {
    openModalBtn.addEventListener('click', () => {
        ambassadorModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
}

if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        ambassadorModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    });
}

if (modalOverlay) {
    modalOverlay.addEventListener('click', () => {
        ambassadorModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    });
}

// Leadership Modal
const openLeadershipModalBtn = document.getElementById('open-leadership-modal');
const leadershipModal = document.getElementById('leadership-modal');
const closeLeadershipModalBtn = document.getElementById('close-leadership-modal');
const leadershipModalOverlay = document.getElementById('leadership-modal-overlay');

if (openLeadershipModalBtn && leadershipModal) {
    openLeadershipModalBtn.addEventListener('click', () => {
        leadershipModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
}

if (closeLeadershipModalBtn) {
    closeLeadershipModalBtn.addEventListener('click', () => {
        leadershipModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    });
}

if (leadershipModalOverlay) {
    leadershipModalOverlay.addEventListener('click', () => {
        leadershipModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    });
}

// Industry Engagement Modal
const openIndustryModalBtn = document.getElementById('open-industry-modal');
const industryModal = document.getElementById('industry-modal');
const closeIndustryModalBtn = document.getElementById('close-industry-modal');
const industryModalOverlay = document.getElementById('industry-modal-overlay');

if (openIndustryModalBtn && industryModal) {
    openIndustryModalBtn.addEventListener('click', () => {
        industryModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });
}

if (closeIndustryModalBtn) {
    closeIndustryModalBtn.addEventListener('click', () => {
        industryModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    });
}

if (industryModalOverlay) {
    industryModalOverlay.addEventListener('click', () => {
        industryModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    });
}

// Close modals with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (ambassadorModal && ambassadorModal.classList.contains('active')) {
            ambassadorModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
        if (leadershipModal && leadershipModal.classList.contains('active')) {
            leadershipModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
        if (industryModal && industryModal.classList.contains('active')) {
            industryModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    }
});

// Log a welcome message
console.log('%c👋 Welcome to my portfolio!', 'color: #8b5cf6; font-size: 20px; font-weight: bold;');
console.log('%cInterested in the code? Check out the GitHub repo!', 'color: #ec4899; font-size: 14px;');

// AI Chat Widget Toggle
const aiChatToggle = document.getElementById('ai-chat-toggle');
const aiChatPanel = document.getElementById('ai-chat-panel');
const aiChatClose = document.getElementById('ai-chat-close');

if (aiChatToggle && aiChatPanel) {
    aiChatToggle.addEventListener('click', () => {
        aiChatPanel.classList.remove('hidden');
    });
}

if (aiChatClose && aiChatPanel) {
    aiChatClose.addEventListener('click', () => {
        aiChatPanel.classList.add('hidden');
    });
}

// Side Quests Photo Viewer
const photoViewer = document.getElementById('photo-viewer');

if (photoViewer) {
    const viewerImg = document.getElementById('photo-viewer-img');
    const viewerCaption = document.getElementById('photo-viewer-caption');
    const viewerClose = document.getElementById('photo-viewer-close');
    const viewerPrev = document.getElementById('photo-viewer-prev');
    const viewerNext = document.getElementById('photo-viewer-next');
    const viewerOverlay = document.getElementById('photo-viewer-overlay');

    let viewerPhotos = [];
    let viewerIndex = 0;
    let viewerTitle = '';
    let viewerOpener = null;

    const parsePhotos = (button) =>
        (button.dataset.photos || '').split('|').map(src => src.trim()).filter(Boolean);

    const showViewerPhoto = (index) => {
        const total = viewerPhotos.length;
        viewerIndex = (index + total) % total;
        viewerImg.src = viewerPhotos[viewerIndex];
        viewerImg.alt = `${viewerTitle} – photo ${viewerIndex + 1} of ${total}`;
        viewerCaption.textContent = total > 1
            ? `${viewerTitle} · ${viewerIndex + 1} / ${total}`
            : viewerTitle;

        // Preload neighbours so arrows feel instant
        if (total > 1) {
            new Image().src = viewerPhotos[(viewerIndex + 1) % total];
            new Image().src = viewerPhotos[(viewerIndex - 1 + total) % total];
        }
    };

    const openPhotoViewer = (button) => {
        viewerPhotos = parsePhotos(button);
        if (!viewerPhotos.length) return;
        const card = button.closest('.bento-card');
        viewerTitle = card ? card.querySelector('h3').textContent.trim() : '';
        viewerOpener = button;
        photoViewer.classList.toggle('single', viewerPhotos.length === 1);
        showViewerPhoto(0);
        photoViewer.classList.add('active');
        photoViewer.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        viewerClose.focus();
    };

    const closePhotoViewer = () => {
        photoViewer.classList.remove('active');
        photoViewer.setAttribute('aria-hidden', 'true');
        viewerImg.removeAttribute('src');
        document.body.style.overflow = 'auto';
        if (viewerOpener) viewerOpener.focus();
    };

    // Cover photos: add a "+N photos" badge and open the viewer on click
    document.querySelectorAll('.side-quest-photo-btn').forEach(button => {
        const count = parsePhotos(button).length;
        if (count > 1) {
            const badge = document.createElement('span');
            badge.className = 'photo-count';
            badge.innerHTML = `<i class="fas fa-images"></i> ${count}`;
            button.appendChild(badge);
        }
        button.addEventListener('click', () => openPhotoViewer(button));
    });

    viewerPrev.addEventListener('click', () => showViewerPhoto(viewerIndex - 1));
    viewerNext.addEventListener('click', () => showViewerPhoto(viewerIndex + 1));
    viewerClose.addEventListener('click', closePhotoViewer);
    viewerOverlay.addEventListener('click', closePhotoViewer);

    // Keyboard: Esc closes, arrows navigate, Tab stays inside the viewer
    document.addEventListener('keydown', (e) => {
        if (!photoViewer.classList.contains('active')) return;
        const multiple = viewerPhotos.length > 1;

        if (e.key === 'Escape') {
            closePhotoViewer();
        } else if (e.key === 'ArrowLeft' && multiple) {
            showViewerPhoto(viewerIndex - 1);
        } else if (e.key === 'ArrowRight' && multiple) {
            showViewerPhoto(viewerIndex + 1);
        } else if (e.key === 'Tab') {
            const focusable = [viewerClose, viewerPrev, viewerNext].filter(b => b.offsetParent !== null);
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
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
