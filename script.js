// ============================================
// TOKYO FAMILY ADVENTURE - ENHANCED MOBILE UX
// ============================================

// Currency conversion rate (approximate)
const RATE = 100; // 100 JPY = 1 AUD

// Current currency state
let currentCurrency = 'jpy';

// Bookmarked activities (persisted in localStorage)
let bookmarks = JSON.parse(localStorage.getItem('tokyoBookmarks') || '[]');

// Dark mode preference
let isDarkMode = localStorage.getItem('tokyoDarkMode') === 'true';

// Format number with commas
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Convert JPY to AUD
function jpyToAud(jpy) {
    return (jpy / RATE).toFixed(2);
}

// Convert AUD to JPY
function audToJpy(aud) {
    return Math.round(aud * RATE);
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function showToast(message, type = 'default', duration = 2500) {
    const toast = document.getElementById('toast');
    const toastMessage = toast.querySelector('.toast-message');
    const toastIcon = toast.querySelector('.toast-icon');
    
    // Set icon based on type
    const icons = {
        success: '✓',
        info: 'ℹ️',
        default: '✓',
        bookmark: '⭐',
        copy: '📋',
        dark: '🌙',
        light: '☀️'
    };
    
    toastIcon.textContent = icons[type] || icons.default;
    toastMessage.textContent = message;
    
    // Remove all type classes
    toast.classList.remove('success', 'info');
    if (type === 'success' || type === 'bookmark') {
        toast.classList.add('success');
    } else if (type === 'info') {
        toast.classList.add('info');
    }
    
    toast.classList.add('visible');
    
    // Haptic feedback
    triggerHaptic('light');
    
    setTimeout(() => {
        toast.classList.remove('visible');
    }, duration);
}

// ============================================
// HAPTIC FEEDBACK
// ============================================

function triggerHaptic(intensity = 'light') {
    if ('vibrate' in navigator) {
        const patterns = {
            light: [10],
            medium: [20],
            heavy: [30],
            double: [10, 50, 10],
            success: [10, 30, 20]
        };
        navigator.vibrate(patterns[intensity] || patterns.light);
    }
}

// ============================================
// DARK MODE
// ============================================

function initDarkMode() {
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
        updateDarkModeIcon();
    }
}

function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('tokyoDarkMode', isDarkMode);
    updateDarkModeIcon();
    showToast(isDarkMode ? 'Dark mode enabled' : 'Light mode enabled', isDarkMode ? 'dark' : 'light');
    triggerHaptic('medium');
}

function updateDarkModeIcon() {
    const icon = document.querySelector('.dark-mode-icon');
    if (icon) {
        icon.textContent = isDarkMode ? '☀️' : '🌙';
    }
}

// ============================================
// CURRENCY SYSTEM
// ============================================

// Update all price displays
function updateAllPrices(currency) {
    const priceDisplays = document.querySelectorAll('.price-display');
    
    priceDisplays.forEach(el => {
        el.classList.add('switching');
        
        setTimeout(() => {
            const jpy = parseInt(el.dataset.jpy);
            const jpyEnd = el.dataset.jpyEnd ? parseInt(el.dataset.jpyEnd) : null;
            const isRange = el.dataset.range === 'true';
            
            if (currency === 'jpy') {
                if (isRange && jpyEnd) {
                    el.textContent = `¥${formatNumber(jpy)}-${formatNumber(jpyEnd)}`;
                } else {
                    el.textContent = `¥${formatNumber(jpy)}`;
                }
            } else {
                const aud = jpyToAud(jpy);
                if (isRange && jpyEnd) {
                    const audEnd = jpyToAud(jpyEnd);
                    el.textContent = `$${aud}-${audEnd}`;
                } else {
                    el.textContent = `$${aud}`;
                }
            }
            
            el.classList.remove('switching');
        }, 150);
    });

    // Update the AUD note in budget
    const audNote = document.querySelector('.price-display-aud-note');
    if (audNote) {
        if (currency === 'aud') {
            audNote.style.display = 'none';
        } else {
            audNote.style.display = 'inline';
        }
    }
}

// Currency Toggle
const toggleBtns = document.querySelectorAll('.toggle-btn');
toggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        toggleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCurrency = btn.dataset.currency;
        updateAllPrices(currentCurrency);
        triggerHaptic('light');
    });
});

// Mini Converter
const convertInput = document.getElementById('convertInput');
const convertDirection = document.getElementById('convertDirection');
const convertResult = document.getElementById('convertResult');

function updateMiniConverter() {
    const value = parseFloat(convertInput.value) || 0;
    const direction = convertDirection.value;
    
    if (direction === 'jpy-to-aud') {
        const aud = jpyToAud(value);
        convertResult.textContent = `= $${formatNumber(parseFloat(aud))} AUD`;
    } else {
        const jpy = audToJpy(value);
        convertResult.textContent = `= ¥${formatNumber(jpy)}`;
    }
}

if (convertInput && convertDirection) {
    convertInput.addEventListener('input', updateMiniConverter);
    convertDirection.addEventListener('change', updateMiniConverter);
}

// Modal Converter
const modal = document.getElementById('converterModal');
const openBtn = document.getElementById('openConverter');
const closeBtn = document.getElementById('closeModal');
const yenInput = document.getElementById('yenInput');
const audInput = document.getElementById('audInput');

if (openBtn) {
    openBtn.addEventListener('click', () => {
        modal.classList.add('active');
    });
}

if (closeBtn) {
    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });
}

if (modal) {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
}

// Sync converter inputs
let isUpdating = false;

if (yenInput) {
    yenInput.addEventListener('input', () => {
        if (isUpdating) return;
        isUpdating = true;
        const yen = parseFloat(yenInput.value) || 0;
        audInput.value = jpyToAud(yen);
        isUpdating = false;
    });
}

if (audInput) {
    audInput.addEventListener('input', () => {
        if (isUpdating) return;
        isUpdating = true;
        const aud = parseFloat(audInput.value) || 0;
        yenInput.value = audToJpy(aud);
        isUpdating = false;
    });
}

// Quick amount chips
const amountChips = document.querySelectorAll('.amount-chip');
amountChips.forEach(chip => {
    chip.addEventListener('click', () => {
        const yen = parseInt(chip.dataset.yen);
        if (yenInput) yenInput.value = yen;
        if (audInput) audInput.value = jpyToAud(yen);
        triggerHaptic('light');
    });
});

// ============================================
// NAVIGATION & SCROLL TRACKING
// ============================================

const sections = document.querySelectorAll('.day-section');
const navLinks = document.querySelectorAll('.day-nav a');
const bottomNavItems = document.querySelectorAll('.bottom-nav-item');
const progressSteps = document.querySelectorAll('.progress-step');
const progressLabels = document.querySelectorAll('.progress-label span');
const progressContainer = document.getElementById('progressContainer');

let currentSectionId = 'day1';

function updateActiveNav() {
    let current = '';
    const scrollPos = window.scrollY;
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (scrollPos >= sectionTop - 150) {
            current = section.getAttribute('id');
        }
    });
    
    if (current && current !== currentSectionId) {
        currentSectionId = current;
        
        // Update desktop nav
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
        
        // Update bottom nav
        bottomNavItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('href') === `#${current}`) {
                item.classList.add('active');
            }
        });
        
        // Update progress bar
        updateProgressBar(current);
    }
    
    // Show/hide progress bar based on scroll
    if (progressContainer) {
        if (scrollPos > 200) {
            progressContainer.classList.add('visible');
        } else {
            progressContainer.classList.remove('visible');
        }
    }
}

function updateProgressBar(current) {
    const dayOrder = ['day1', 'day2', 'day3', 'day4', 'tips', 'tech'];
    const currentIndex = dayOrder.indexOf(current);
    
    progressSteps.forEach((step, index) => {
        step.classList.remove('active', 'completed');
        if (index < currentIndex) {
            step.classList.add('completed');
        } else if (index === currentIndex) {
            step.classList.add('active');
        }
    });
    
    progressLabels.forEach((label, index) => {
        label.classList.remove('active');
        if (index === currentIndex) {
            label.classList.add('active');
        }
    });
}

window.addEventListener('scroll', updateActiveNav);
window.addEventListener('load', updateActiveNav);

// Smooth scroll for nav links (desktop)
navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        const targetSection = document.querySelector(targetId);
        if (targetSection) {
            targetSection.scrollIntoView({ behavior: 'smooth' });
            triggerHaptic('light');
        }
    });
});

// Smooth scroll for bottom nav (mobile)
bottomNavItems.forEach(item => {
    item.addEventListener('click', function(e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        const targetSection = document.querySelector(targetId);
        if (targetSection) {
            targetSection.scrollIntoView({ behavior: 'smooth' });
            triggerHaptic('medium');
        }
    });
});

// ============================================
// SWIPE NAVIGATION
// ============================================

let touchStartX = 0;
let touchEndX = 0;
const swipeThreshold = 80;

document.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}, { passive: true });

function handleSwipe() {
    const dayOrder = ['day1', 'day2', 'day3', 'day4', 'tips', 'tech'];
    const currentIndex = dayOrder.indexOf(currentSectionId);
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) < swipeThreshold) return;
    
    const swipeLeft = document.getElementById('swipeLeft');
    const swipeRight = document.getElementById('swipeRight');
    
    if (diff > swipeThreshold && currentIndex < dayOrder.length - 1) {
        // Swipe left - go to next section
        const nextSection = document.getElementById(dayOrder[currentIndex + 1]);
        if (nextSection) {
            swipeRight.classList.add('visible');
            setTimeout(() => swipeRight.classList.remove('visible'), 300);
            nextSection.scrollIntoView({ behavior: 'smooth' });
            triggerHaptic('medium');
        }
    } else if (diff < -swipeThreshold && currentIndex > 0) {
        // Swipe right - go to previous section
        const prevSection = document.getElementById(dayOrder[currentIndex - 1]);
        if (prevSection) {
            swipeLeft.classList.add('visible');
            setTimeout(() => swipeLeft.classList.remove('visible'), 300);
            prevSection.scrollIntoView({ behavior: 'smooth' });
            triggerHaptic('medium');
        }
    }
}

// ============================================
// COLLAPSIBLE ACTIVITY CARDS
// ============================================

function initCollapsibleCards() {
    const collapsibleCards = document.querySelectorAll('.activity.collapsible');
    
    collapsibleCards.forEach(card => {
        card.addEventListener('click', function(e) {
            // Don't toggle if clicking bookmark, link, or copy button
            if (e.target.closest('.bookmark-btn') || 
                e.target.closest('a') || 
                e.target.closest('.address-copy')) {
                return;
            }
            
            // Check if we're on mobile
            if (window.innerWidth <= 768) {
                this.classList.toggle('expanded');
                triggerHaptic('light');
            } else {
                // On desktop, open the activity modal
                const activityId = findActivityId(card);
                if (activityId) {
                    openActivityModal(activityId);
                }
            }
        });
    });
    
    // Start with first card of each day expanded on mobile
    if (window.innerWidth <= 768) {
        document.querySelectorAll('.day-section').forEach(section => {
            const firstCard = section.querySelector('.activity.collapsible');
            if (firstCard) {
                firstCard.classList.add('expanded');
            }
        });
    }
}

// ============================================
// ADDRESS COPY FUNCTIONALITY
// ============================================

function initAddressCopy() {
    const copyButtons = document.querySelectorAll('.address-copy');
    
    copyButtons.forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            const address = this.dataset.address;
            
            try {
                await navigator.clipboard.writeText(address);
                this.classList.add('copied');
                this.querySelector('.copy-icon').textContent = '✓';
                showToast('Address copied! Paste in Maps', 'copy');
                triggerHaptic('success');
                
                setTimeout(() => {
                    this.classList.remove('copied');
                    this.querySelector('.copy-icon').textContent = '📋';
                }, 2000);
            } catch (err) {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = address;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                showToast('Address copied!', 'copy');
            }
        });
    });
}

// ============================================
// BOOKMARKS / FAVORITES
// ============================================

function initBookmarks() {
    const bookmarkBtns = document.querySelectorAll('.bookmark-btn');
    
    bookmarkBtns.forEach(btn => {
        const id = btn.dataset.id;
        if (bookmarks.includes(id)) {
            btn.classList.add('bookmarked');
            btn.textContent = '★';
        }
        
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleBookmark(this);
        });
    });
    
    updateFavoritesList();
}

function toggleBookmark(btn) {
    const id = btn.dataset.id;
    const isBookmarked = bookmarks.includes(id);
    
    if (isBookmarked) {
        bookmarks = bookmarks.filter(b => b !== id);
        btn.classList.remove('bookmarked');
        btn.textContent = '☆';
        showToast('Removed from favorites', 'info');
    } else {
        bookmarks.push(id);
        btn.classList.add('bookmarked');
        btn.textContent = '★';
        showToast('Added to favorites!', 'bookmark');
    }
    
    localStorage.setItem('tokyoBookmarks', JSON.stringify(bookmarks));
    triggerHaptic('medium');
    updateFavoritesList();
}

function updateFavoritesList() {
    const list = document.getElementById('favoritesList');
    if (!list) return;
    
    if (bookmarks.length === 0) {
        list.innerHTML = `
            <div class="favorites-empty">
                <div class="empty-icon">☆</div>
                <p>No saved activities yet</p>
                <p style="font-size: 0.8rem; opacity: 0.7;">Tap the star on any activity to save it here</p>
            </div>
        `;
        return;
    }
    
    list.innerHTML = bookmarks.map(id => {
        const activity = activityDatabase[id];
        if (!activity) return '';
        return `
            <div class="favorite-item" data-id="${id}">
                <span class="fav-emoji">${activity.emoji}</span>
                <div class="fav-details">
                    <div class="fav-name">${activity.name}</div>
                    <div class="fav-day">${activity.time}</div>
                </div>
                <button class="fav-remove" data-id="${id}">&times;</button>
            </div>
        `;
    }).join('');
    
    // Add click handlers
    list.querySelectorAll('.favorite-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.fav-remove')) {
                const id = e.target.dataset.id;
                const btn = document.querySelector(`.bookmark-btn[data-id="${id}"]`);
                if (btn) toggleBookmark(btn);
                return;
            }
            const id = item.dataset.id;
            closeFavoritesPanel();
            openActivityModal(id);
        });
    });
}

// Favorites Panel
const favoritesPanel = document.getElementById('favoritesPanel');
const favoritesOverlay = document.getElementById('favoritesOverlay');
const closeFavoritesBtn = document.getElementById('closeFavorites');

function openFavoritesPanel() {
    favoritesPanel.classList.add('open');
    favoritesOverlay.classList.add('visible');
    triggerHaptic('light');
}

function closeFavoritesPanel() {
    favoritesPanel.classList.remove('open');
    favoritesOverlay.classList.remove('visible');
}

if (closeFavoritesBtn) {
    closeFavoritesBtn.addEventListener('click', closeFavoritesPanel);
}

if (favoritesOverlay) {
    favoritesOverlay.addEventListener('click', closeFavoritesPanel);
}

// ============================================
// FLOATING ACTION BUTTON (FAB) MENU
// ============================================

const fabMain = document.getElementById('fabMain');
const fabMenu = document.getElementById('fabMenu');
const fabCurrency = document.getElementById('fabCurrency');
const fabDarkMode = document.getElementById('fabDarkMode');
const fabFavorites = document.getElementById('fabFavorites');
const fabShare = document.getElementById('fabShare');
const fabTranslator = document.getElementById('fabTranslator');

let fabOpen = false;

if (fabMain) {
    fabMain.addEventListener('click', () => {
        fabOpen = !fabOpen;
        fabMain.classList.toggle('active', fabOpen);
        fabMenu.classList.toggle('visible', fabOpen);
        triggerHaptic('light');
    });
}

if (fabCurrency) {
    fabCurrency.addEventListener('click', () => {
        closeFab();
        modal.classList.add('active');
    });
}

if (fabDarkMode) {
    fabDarkMode.addEventListener('click', () => {
        closeFab();
        toggleDarkMode();
    });
}

if (fabFavorites) {
    fabFavorites.addEventListener('click', () => {
        closeFab();
        openFavoritesPanel();
    });
}

if (fabShare) {
    fabShare.addEventListener('click', async () => {
        closeFab();
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Tokyo Family Adventure - 4 Day Itinerary',
                    text: 'Check out this amazing Tokyo itinerary!',
                    url: window.location.href
                });
                showToast('Thanks for sharing!', 'success');
            } catch (err) {
                if (err.name !== 'AbortError') {
                    copyToClipboard(window.location.href);
                    showToast('Link copied to clipboard!', 'copy');
                }
            }
        } else {
            copyToClipboard(window.location.href);
            showToast('Link copied to clipboard!', 'copy');
        }
    });
}

if (fabTranslator) {
    fabTranslator.addEventListener('click', () => {
        closeFab();
        window.location.href = 'translator/index.html';
    });
}

function closeFab() {
    fabOpen = false;
    fabMain.classList.remove('active');
    fabMenu.classList.remove('visible');
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }
}

// Close FAB when clicking outside
document.addEventListener('click', (e) => {
    if (fabOpen && !e.target.closest('.fab-container')) {
        closeFab();
    }
});

// ============================================
// SCROLL ANIMATIONS
// ============================================

const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

document.querySelectorAll('.activity').forEach(activity => {
    activity.style.opacity = '0';
    activity.style.transform = 'translateY(20px)';
    activity.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(activity);
});

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (modal && modal.classList.contains('active')) {
            modal.classList.remove('active');
        }
        if (activityModal && activityModal.classList.contains('active')) {
            activityModal.classList.remove('active');
        }
        if (favoritesPanel && favoritesPanel.classList.contains('open')) {
            closeFavoritesPanel();
        }
        if (fabOpen) {
            closeFab();
        }
    }
    
    // Dark mode toggle: Ctrl/Cmd + D
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        toggleDarkMode();
    }
});

// ============================================
// ACTIVITY DATABASE & MODAL FUNCTIONALITY
// ============================================

const activityDatabase = {
    'sensoji': {
        name: 'Senso-ji Temple & Nakamise Street',
        emoji: '⛩️',
        time: 'Day 1 • Morning',
        website: 'https://www.senso-ji.jp/english/',
        websiteName: 'Senso-ji Official Website',
        address: '2-3-1 Asakusa, Taito City, Tokyo',
        hours: 'Temple: 6:00 AM - 5:00 PM, Nakamise: ~9:00 AM - 7:00 PM',
        tips: 'Go before 8 AM for empty photos. Free entry.',
        category: 'temple',
        alternatives: ['meiji', 'ueno-park', 'nezu-shrine']
    },
    'kimono': {
        name: 'Kimono Rental Experience',
        emoji: '👘',
        time: 'Day 1 • Optional Add-on',
        website: 'https://www.klook.com/en-AU/activity/6925-kimono-rental-tokyo/',
        websiteName: 'Book Kimono on Klook',
        address: 'Various locations in Asakusa',
        hours: 'Typically 9:00 AM - 6:00 PM',
        tips: 'Miyabi Asakusa is highly rated. Book 2-3 days ahead.',
        category: 'cultural',
        alternatives: ['tea-ceremony', 'calligraphy', 'samurai-experience']
    },
    'mipig': {
        name: 'Mipig Cafe Asakusa',
        emoji: '🐷',
        time: 'Day 1 • Afternoon',
        website: 'https://mipig.cafe/en/',
        websiteName: 'Mipig Cafe Official',
        address: 'Chateau Amour 2F, 3-1-1 Asakusa, Taito-ku',
        hours: '9:00 AM - 7:00 PM daily',
        tips: 'Book online 1+ week ahead. No entry if unwell.',
        category: 'animal-cafe',
        alternatives: ['owl-cafe', 'cat-cafe', 'hedgehog-cafe']
    },
    'kintsugi': {
        name: 'Kintsugi Workshop',
        emoji: '✨',
        time: 'Day 1 • Afternoon',
        website: 'https://kintsugi-kit.com/pages/kintsugi-workshops-in-tokyo',
        websiteName: 'Tsugu Tsugu Kintsugi',
        address: '1-1-2 Kaminarimon, Taito-ku (Asakusa Studio)',
        hours: 'By reservation only',
        tips: 'Check English interpreter availability. Book 1 week ahead.',
        category: 'workshop',
        alternatives: ['pottery-class', 'origami-workshop', 'sushi-making']
    },
    'tsukiji': {
        name: 'Tsukiji Outer Market',
        emoji: '🏮',
        time: 'Day 1 • Evening',
        website: 'https://www.tsukiji.or.jp/english/',
        websiteName: 'Tsukiji Market Official',
        address: '4-16-2 Tsukiji, Chuo City, Tokyo',
        hours: '5:00 AM - 2:00 PM (most stalls)',
        tips: 'Avoid obvious tourist traps. Look for local queues.',
        category: 'food',
        alternatives: ['toyosu-market', 'ameyoko', 'yanaka-ginza']
    },
    'skytree': {
        name: 'Tokyo Skytree',
        emoji: '🗼',
        time: 'Day 2 • Morning',
        website: 'https://www.tokyo-skytree.jp/en/',
        websiteName: 'Tokyo Skytree Official',
        address: '1-1-2 Oshiage, Sumida City, Tokyo',
        hours: '10:00 AM - 9:00 PM',
        tips: 'Book timed tickets online. Weekdays less crowded.',
        category: 'observation',
        alternatives: ['shibuya-sky', 'tokyo-tower', 'government-building']
    },
    'sumida-aquarium': {
        name: 'Sumida Aquarium',
        emoji: '🐠',
        time: 'Day 2 • Late Morning',
        website: 'https://www.sumida-aquarium.com/en/',
        websiteName: 'Sumida Aquarium Official',
        address: 'Tokyo Skytree Town, 5F-6F',
        hours: '10:00 AM - 8:00 PM',
        tips: 'Combo ticket with Skytree saves money. Penguin feeding times vary.',
        category: 'aquarium',
        alternatives: ['maxell-aqua-park', 'sunshine-aquarium', 'art-aquarium']
    },
    'origami': {
        name: 'Origami Kaikan',
        emoji: '🦢',
        time: 'Day 2 • Afternoon',
        website: 'https://www.origamikaikan.co.jp/eng/',
        websiteName: 'Origami Kaikan Official',
        address: '1-7-14 Yushima, Bunkyo City, Tokyo',
        hours: '9:30 AM - 6:00 PM (closed Sundays)',
        tips: 'Free entry. Workshops available. Great paper souvenirs.',
        category: 'museum',
        alternatives: ['paper-museum', 'craft-workshop', 'stationery-tour']
    },
    'akihabara': {
        name: 'Akihabara Electric Town',
        emoji: '🤖',
        time: 'Day 3 • Morning',
        website: 'https://www.gotokyo.org/en/destinations/eastern-tokyo/akihabara/index.html',
        websiteName: 'GO TOKYO - Akihabara Guide',
        address: 'Akihabara, Taito/Chiyoda City, Tokyo',
        hours: 'Most shops 10:00 AM - 8:00 PM',
        tips: 'Yodobashi opens 9:30 AM. Bring passport for tax-free.',
        category: 'shopping',
        alternatives: ['nakano-broadway', 'ikebukuro-otome', 'shibuya-tech']
    },
    'teamlab': {
        name: 'teamLab Planets',
        emoji: '🌊',
        time: 'Day 3 • Afternoon',
        website: 'https://www.teamlab.art/e/planets/',
        websiteName: 'teamLab Planets Official',
        address: '6-1-16 Toyosu, Koto City, Tokyo',
        hours: '9:00 AM - 10:00 PM (varies)',
        tips: 'Wear shorts/roll-up pants. Book 1+ month ahead!',
        category: 'digital-art',
        alternatives: ['teamlab-borderless', 'mori-art-museum', 'naked-exhibition']
    },
    'meiji': {
        name: 'Meiji Shrine',
        emoji: '🌲',
        time: 'Day 4 • Morning',
        website: 'https://www.meijijingu.or.jp/en/',
        websiteName: 'Meiji Jingu Official',
        address: '1-1 Yoyogikamizonocho, Shibuya City',
        hours: 'Sunrise to Sunset',
        tips: 'More peaceful than Senso-ji. Beautiful forested walk.',
        category: 'shrine',
        alternatives: ['sensoji', 'nezu-shrine', 'zojoji']
    },
    'harajuku': {
        name: 'Harajuku & Takeshita Street',
        emoji: '🌈',
        time: 'Day 4 • Late Morning',
        website: 'https://www.gotokyo.org/en/destinations/western-tokyo/harajuku/index.html',
        websiteName: 'GO TOKYO - Harajuku Guide',
        address: 'Jingumae, Shibuya City, Tokyo',
        hours: 'Shops typically 10:00 AM - 8:00 PM',
        tips: 'Try rainbow cotton candy & giant crepes!',
        category: 'shopping',
        alternatives: ['shimokitazawa', 'koenji', 'daikanyama']
    },
    'shibuya': {
        name: 'Shibuya Crossing & Shibuya Sky',
        emoji: '🚶',
        time: 'Day 4 • Afternoon',
        website: 'https://www.shibuya-scramble-square.com/sky/en/',
        websiteName: 'Shibuya Sky Official',
        address: 'Shibuya Scramble Square, Shibuya',
        hours: '10:00 AM - 10:30 PM',
        tips: 'Sunset views are spectacular. Book 4-5 PM slot.',
        category: 'observation',
        alternatives: ['skytree', 'tokyo-tower', 'roppongi-hills']
    },
    'disney': {
        name: 'Tokyo Disneyland',
        emoji: '🏰',
        time: 'Day 4 • Full Day Alternative',
        website: 'https://www.tokyodisneyresort.jp/en/tdl/',
        websiteName: 'Tokyo Disney Resort Official',
        address: '1-1 Maihama, Urayasu, Chiba',
        hours: 'Typically 9:00 AM - 9:00 PM',
        tips: 'Book tickets well ahead. Download app for wait times.',
        category: 'theme-park',
        alternatives: ['disneysea', 'sanrio-puroland', 'legoland']
    }
};

// Alternative activities database
const alternativesDatabase = {
    'meiji': { name: 'Meiji Shrine', emoji: '🌲', desc: 'Peaceful forested shrine in Harajuku', cost: 'Free', time: '1-2 hours' },
    'ueno-park': { name: 'Ueno Park & Museums', emoji: '🏛️', desc: 'Beautiful park with multiple museums, zoo, temples', cost: '¥600-1,000', time: '2-4 hours' },
    'nezu-shrine': { name: 'Nezu Shrine', emoji: '⛩️', desc: 'Less crowded shrine with beautiful torii tunnel', cost: 'Free', time: '1 hour' },
    'tea-ceremony': { name: 'Tea Ceremony Experience', emoji: '🍵', desc: 'Traditional Japanese tea ceremony class', cost: '¥3,000-5,000', time: '1-2 hours' },
    'calligraphy': { name: 'Calligraphy Class', emoji: '✍️', desc: 'Learn Japanese brush calligraphy basics', cost: '¥3,000-4,000', time: '1-2 hours' },
    'samurai-experience': { name: 'Samurai Experience', emoji: '⚔️', desc: 'Dress as samurai and learn sword basics', cost: '¥8,000-12,000', time: '1-2 hours' },
    'owl-cafe': { name: 'Owl Cafe', emoji: '🦉', desc: 'Pet and photograph owls in Harajuku/Akihabara', cost: '¥1,500-2,000', time: '1 hour' },
    'cat-cafe': { name: 'Cat Cafe', emoji: '🐱', desc: 'Relax with friendly cats, many in Ikebukuro', cost: '¥1,000-1,500', time: '1 hour' },
    'hedgehog-cafe': { name: 'Hedgehog Cafe', emoji: '🦔', desc: 'Adorable hedgehog interaction in Harajuku', cost: '¥1,400-1,800', time: '30-60 min' },
    'pottery-class': { name: 'Pottery Workshop', emoji: '🏺', desc: 'Make your own ceramics at Shirokane', cost: '¥3,500-5,000', time: '2 hours' },
    'origami-workshop': { name: 'Origami Workshop', emoji: '📄', desc: 'Hands-on origami class at Origami Kaikan', cost: '¥1,500-3,000', time: '1-2 hours' },
    'sushi-making': { name: 'Sushi Making Class', emoji: '🍣', desc: 'Learn to make sushi and eat your creations', cost: '¥5,000-8,000', time: '2-3 hours' },
    'toyosu-market': { name: 'Toyosu Fish Market', emoji: '🐟', desc: 'Modern fish market with tuna auction viewing', cost: 'Free (food extra)', time: '2-3 hours' },
    'ameyoko': { name: 'Ameyoko Market', emoji: '🛒', desc: 'Bustling street market near Ueno', cost: 'Free', time: '1-2 hours' },
    'yanaka-ginza': { name: 'Yanaka Ginza', emoji: '🏘️', desc: 'Old-school shopping street with retro vibes', cost: 'Free', time: '1-2 hours' },
    'shibuya-sky': { name: 'Shibuya Sky', emoji: '🌃', desc: 'Stunning 360° rooftop observation deck', cost: '¥2,200', time: '1 hour' },
    'tokyo-tower': { name: 'Tokyo Tower', emoji: '🗼', desc: 'Iconic red tower with observation decks', cost: '¥1,200-3,000', time: '1-2 hours' },
    'government-building': { name: 'Tokyo Metropolitan Govt Building', emoji: '🏢', desc: 'Free observation deck in Shinjuku', cost: 'Free', time: '30-60 min' },
    'maxell-aqua-park': { name: 'Maxell Aqua Park Shinagawa', emoji: '🐬', desc: 'Modern aquarium with dolphin shows', cost: '¥2,500', time: '2-3 hours' },
    'sunshine-aquarium': { name: 'Sunshine Aquarium', emoji: '🦭', desc: 'Rooftop aquarium in Ikebukuro', cost: '¥2,600', time: '2 hours' },
    'art-aquarium': { name: 'Art Aquarium Museum', emoji: '🐠', desc: 'Goldfish art installation in Ginza', cost: '¥2,400', time: '1-2 hours' },
    'paper-museum': { name: 'Paper Museum', emoji: '📜', desc: 'History of Japanese paper-making', cost: '¥400', time: '1-2 hours' },
    'craft-workshop': { name: 'Traditional Craft Workshop', emoji: '🎨', desc: 'Various traditional crafts in Asakusa', cost: '¥2,000-5,000', time: '1-2 hours' },
    'stationery-tour': { name: 'Itoya Stationery Store', emoji: '✏️', desc: '12-floor stationery paradise in Ginza', cost: 'Free (shopping)', time: '1-2 hours' },
    'nakano-broadway': { name: 'Nakano Broadway', emoji: '🎌', desc: 'Otaku paradise with vintage collectibles', cost: 'Free', time: '2-3 hours' },
    'ikebukuro-otome': { name: 'Ikebukuro Otome Road', emoji: '💖', desc: 'Anime shops focused on female fans', cost: 'Free', time: '2-3 hours' },
    'shibuya-tech': { name: 'Shibuya Tech Shops', emoji: '📱', desc: 'Tech and gadget shops around Shibuya', cost: 'Free', time: '1-2 hours' },
    'teamlab-borderless': { name: 'teamLab Borderless', emoji: '✨', desc: 'Permanent digital art museum in Azabudai', cost: '¥3,800-5,400', time: '2-3 hours' },
    'mori-art-museum': { name: 'Mori Art Museum', emoji: '🖼️', desc: 'Contemporary art with city views', cost: '¥2,000', time: '2-3 hours' },
    'naked-exhibition': { name: 'NAKED Digital Art', emoji: '🌸', desc: 'Seasonal digital art exhibitions', cost: '¥1,600-2,200', time: '1 hour' },
    'zojoji': { name: 'Zojo-ji Temple', emoji: '🛕', desc: 'Historic temple with Tokyo Tower views', cost: 'Free', time: '1 hour' },
    'shimokitazawa': { name: 'Shimokitazawa', emoji: '🎸', desc: 'Bohemian neighborhood with vintage shops', cost: 'Free', time: '2-3 hours' },
    'koenji': { name: 'Koenji', emoji: '👗', desc: 'Vintage clothing and indie music scene', cost: 'Free', time: '2-3 hours' },
    'daikanyama': { name: 'Daikanyama', emoji: '☕', desc: 'Upscale area with T-Site bookstore', cost: 'Free', time: '2 hours' },
    'roppongi-hills': { name: 'Roppongi Hills', emoji: '🌆', desc: 'Shopping, art, and Tokyo City View', cost: '¥2,000', time: '2-3 hours' },
    'disneysea': { name: 'Tokyo DisneySea', emoji: '🚢', desc: 'Unique nautical Disney park, more adult', cost: '¥8,400-9,400', time: 'Full day' },
    'sanrio-puroland': { name: 'Sanrio Puroland', emoji: '🎀', desc: 'Hello Kitty indoor theme park', cost: '¥3,600-4,900', time: '4-6 hours' },
    'legoland': { name: 'Legoland Discovery Tokyo', emoji: '🧱', desc: 'Indoor Lego attraction in Odaiba', cost: '¥2,800-3,200', time: '2-3 hours' }
};

// Activity Modal Elements
const activityModal = document.getElementById('activityModal');
const closeActivityBtn = document.getElementById('closeActivityModal');
const activityModalTitle = document.getElementById('activityModalTitle');
const activityModalTime = document.getElementById('activityModalTime');
const venueLink = document.getElementById('venueLink');
const venueLinkText = document.getElementById('venueLinkText');
const venueInfo = document.getElementById('venueInfo');
const alternativesList = document.getElementById('alternativesList');

// Find activity ID from card content
function findActivityId(card) {
    // First check data attribute
    if (card.dataset.activity) {
        return card.dataset.activity;
    }
    
    const title = card.querySelector('h3').textContent.toLowerCase();
    
    const mappings = [
        { keywords: ['senso-ji', 'sensoji', 'nakamise'], id: 'sensoji' },
        { keywords: ['kimono'], id: 'kimono' },
        { keywords: ['mipig', 'pig cafe'], id: 'mipig' },
        { keywords: ['kintsugi'], id: 'kintsugi' },
        { keywords: ['night walk', 'tsukiji'], id: 'tsukiji' },
        { keywords: ['skytree'], id: 'skytree' },
        { keywords: ['sumida aquarium'], id: 'sumida-aquarium' },
        { keywords: ['origami'], id: 'origami' },
        { keywords: ['akihabara', 'electric town'], id: 'akihabara' },
        { keywords: ['teamlab', 'planets'], id: 'teamlab' },
        { keywords: ['meiji'], id: 'meiji' },
        { keywords: ['harajuku', 'takeshita'], id: 'harajuku' },
        { keywords: ['shibuya crossing', 'shibuya sky'], id: 'shibuya' },
        { keywords: ['disneyland', 'disney'], id: 'disney' }
    ];

    for (const mapping of mappings) {
        if (mapping.keywords.some(kw => title.includes(kw))) {
            return mapping.id;
        }
    }
    return null;
}

// Open activity modal
function openActivityModal(activityId) {
    const activity = activityDatabase[activityId];
    if (!activity) return;

    // Set header
    activityModalTitle.innerHTML = `<span class="emoji">${activity.emoji}</span> ${activity.name}`;
    activityModalTime.textContent = activity.time;

    // Set venue link
    venueLink.href = activity.website;
    venueLinkText.textContent = activity.websiteName;

    // Set venue info
    venueInfo.innerHTML = `
        <div class="venue-info-item"><strong>📍 Address:</strong> ${activity.address}</div>
        <div class="venue-info-item"><strong>🕐 Hours:</strong> ${activity.hours}</div>
        <div class="venue-info-item"><strong>💡 Tip:</strong> ${activity.tips}</div>
    `;

    // Set alternatives
    if (activity.alternatives && activity.alternatives.length > 0) {
        alternativesList.innerHTML = activity.alternatives.map(altId => {
            const alt = alternativesDatabase[altId];
            if (!alt) return '';
            return `
                <div class="alternative-card" data-alt-id="${altId}">
                    <h4>${alt.emoji} ${alt.name}</h4>
                    <p>${alt.desc}</p>
                    <div class="alt-meta">
                        <span class="alt-tag cost">${alt.cost}</span>
                        <span class="alt-tag">⏱️ ${alt.time}</span>
                    </div>
                </div>
            `;
        }).join('');
    } else {
        alternativesList.innerHTML = '<div class="no-alternatives">No alternatives suggested for this activity.</div>';
    }

    activityModal.classList.add('active');
    triggerHaptic('light');
}

// Close activity modal
if (closeActivityBtn) {
    closeActivityBtn.addEventListener('click', () => {
        activityModal.classList.remove('active');
    });
}

if (activityModal) {
    activityModal.addEventListener('click', (e) => {
        if (e.target === activityModal) {
            activityModal.classList.remove('active');
        }
    });
}

// Click handler for alternative cards
document.addEventListener('click', (e) => {
    const altCard = e.target.closest('.alternative-card');
    if (altCard) {
        const altId = altCard.dataset.altId;
        const alt = alternativesDatabase[altId];
        if (alt) {
            showToast(`${alt.emoji} ${alt.name} - ${alt.cost}`, 'info', 3000);
            triggerHaptic('light');
        }
    }
});

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize all features
    initDarkMode();
    initCollapsibleCards();
    initAddressCopy();
    initBookmarks();
    updateMiniConverter();
    updateActiveNav();
    
    console.log('🗼 Tokyo Family Adventure loaded!');
    console.log('📱 Mobile optimizations active');
});

// Handle resize for collapsible cards
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const collapsibleCards = document.querySelectorAll('.activity.collapsible');
        if (window.innerWidth > 768) {
            collapsibleCards.forEach(card => card.classList.remove('expanded'));
        }
    }, 250);
});
