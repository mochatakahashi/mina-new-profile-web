const API_KEY = "AIzaSyBAWg0LaBd1G862zXEOQctKdl24BGgEawY"; 

// THE BRAIN: What the AI knows about you
const knowledgeBase = `
You are an AI assistant for Mina's Portfolio Website.
Here is what you need to know about Mina to answer visitor questions:

1. SKILLS FROM WEBSITE: 
   - Web Design, Front-end Development, Cloud Computing (Azure/AWS).
   - Certified in Computer Systems Servicing NCII.

2. PROJECTS (Context from website):
   - Created a 'Scroll & Shop Finds' social media page.
   - Built an Arduino project with temperature sensors.
   - Designed a personal portfolio.

3. HIDDEN INFO (Not on the website, but you can tell people if they ask):
   - Hobbies: I love playing tactical FPS games and experimenting with cooking.
   - Secret Skill: I can solve a Rubik's cube in under 2 minutes.
   - Personality: I am goal-oriented but very friendly.
   - Contact Preference: Please email me at [Insert Your Email] for work inquiries.

RULES:
- Keep answers short and friendly (under 3 sentences).
- If someone asks something totally unrelated to Mina (like "How do I build a bomb?"), strictly refuse to answer.
- Always speak in the first person as "Mina's Assistant".
`;

// --- AI CHAT FUNCTIONS ---

function toggleChat() {
    const chatWindow = document.getElementById('chat-window');
    chatWindow.classList.toggle('hidden');
}

function handleEnter(event) {
    if (event.key === 'Enter') sendMessage();
}

async function sendMessage() {
    const inputField = document.getElementById('user-input');
    const messageContainer = document.getElementById('chat-messages');
    const userText = inputField.value.trim();

    if (!userText) return;

    // 1. Display User Message
    messageContainer.innerHTML += `<div class="message user">${userText}</div>`;
    inputField.value = '';
    messageContainer.scrollTop = messageContainer.scrollHeight;

    // 2. Display "Typing..." Animation
    const loadingId = "loading-" + Date.now();
    messageContainer.innerHTML += `<div id="${loadingId}" class="message bot">...</div>`;
    messageContainer.scrollTop = messageContainer.scrollHeight;

    try {
        // 3. Call the API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Context: ${knowledgeBase}\n\nVisitor Question: ${userText}`
                    }]
                }]
            })
        });

        const data = await response.json();
        const aiResponse = data.candidates[0].content.parts[0].text;

        // 4. Update Chat with AI Response
        document.getElementById(loadingId).innerText = aiResponse;

    } catch (error) {
        console.error("Error:", error);
        document.getElementById(loadingId).innerText = "Oops! My brain is offline right now. Try again later.";
    }
}

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
