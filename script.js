// ===========================================
// TOKYO ADVENTURE - Clean Mobile-First Script
// ===========================================

// Currency conversion rate (¥100 = $1 AUD)
const RATE = 100;

// Current currency display mode
let currentCurrency = 'jpy';

// Dark mode state
let isDarkMode = localStorage.getItem('tokyoDarkMode') === 'true';

// Activity suggestions (stored in localStorage)
let activitySuggestions = JSON.parse(localStorage.getItem('tokyoSuggestions') || '{}');

// Current suggestion being made
let pendingSuggestion = null;

// ===========================================
// UTILITY FUNCTIONS
// ===========================================

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function jpyToAud(jpy) {
    return (jpy / RATE).toFixed(2);
}

function audToJpy(aud) {
    return Math.round(aud * RATE);
}

// ===========================================
// TOAST NOTIFICATIONS
// ===========================================

function showToast(message, icon = '✓') {
    const toast = document.getElementById('toast');
    const toastText = toast.querySelector('.toast-text');
    const toastIcon = toast.querySelector('.toast-icon');
    
    toastIcon.textContent = icon;
    toastText.textContent = message;
    
    toast.classList.add('visible');
    
    // Haptic feedback
    if ('vibrate' in navigator) {
        navigator.vibrate(10);
    }
    
    setTimeout(() => {
        toast.classList.remove('visible');
    }, 2000);
}

// ===========================================
// DARK MODE
// ===========================================

function initDarkMode() {
    if (isDarkMode) {
        document.body.classList.add('dark-mode');
    }
}

function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('tokyoDarkMode', isDarkMode);
    showToast(isDarkMode ? 'Dark mode' : 'Light mode', isDarkMode ? '🌙' : '☀️');
}

// ===========================================
// CURRENCY SYSTEM
// ===========================================

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
}

function toggleCurrency() {
    currentCurrency = currentCurrency === 'jpy' ? 'aud' : 'jpy';
    updateAllPrices(currentCurrency);
    showToast(currentCurrency === 'jpy' ? 'Showing ¥ JPY' : 'Showing $ AUD', '💱');
}

// ===========================================
// CONVERTER MODAL
// ===========================================

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

// Quick amount buttons
document.querySelectorAll('.amount-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const yen = parseInt(btn.dataset.yen);
        if (yenInput) yenInput.value = yen;
        if (audInput) audInput.value = jpyToAud(yen);
    });
});

// ===========================================
// DAY TAB NAVIGATION
// ===========================================

const dayTabs = document.getElementById('dayTabs');
const tabs = document.querySelectorAll('.tab');
const sections = document.querySelectorAll('.day-section');

let currentSection = 'day1';

function updateActiveTab() {
    const scrollPos = window.scrollY;
    let current = 'day1';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        if (scrollPos >= sectionTop - 150) {
            current = section.id;
        }
    });
    
    if (current !== currentSection) {
        currentSection = current;
        
        tabs.forEach(tab => {
            const href = tab.getAttribute('href');
            if (href === `#${current}`) {
                tab.classList.add('active');
                // Scroll tab into view
                tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else {
                tab.classList.remove('active');
            }
        });
    }
}

// Smooth scroll for tabs
tabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = tab.getAttribute('href');
        const target = document.querySelector(targetId);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

window.addEventListener('scroll', updateActiveTab, { passive: true });

// ===========================================
// LOCATION TAG - COPY ADDRESS
// ===========================================

document.querySelectorAll('.tag.location').forEach(tag => {
    tag.addEventListener('click', async () => {
        const address = tag.dataset.address;
        if (!address) return;
        
        try {
            await navigator.clipboard.writeText(address);
            showToast('Address copied!', '📍');
        } catch (err) {
            // Fallback
            const textArea = document.createElement('textarea');
            textArea.value = address;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('Address copied!', '📍');
        }
    });
});

// ===========================================
// THEME TOGGLE
// ===========================================

const themeBtn = document.getElementById('toggleTheme');
if (themeBtn) {
    themeBtn.addEventListener('click', toggleDarkMode);
}

// ===========================================
// SHARE BUTTON
// ===========================================

const shareBtn = document.getElementById('fabShare');
if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'Tokyo Adventure - 4 Day Itinerary',
                    text: 'Check out this Tokyo family itinerary!',
                    url: window.location.href
                });
            } catch (err) {
                if (err.name !== 'AbortError') {
                    copyLink();
                }
            }
        } else {
            copyLink();
        }
    });
}

async function copyLink() {
    try {
        await navigator.clipboard.writeText(window.location.href);
        showToast('Link copied!', '🔗');
    } catch (err) {
        showToast('Share via browser menu', '📤');
    }
}

// ===========================================
// KEYBOARD SHORTCUTS
// ===========================================

document.addEventListener('keydown', (e) => {
    // ESC to close modals
    if (e.key === 'Escape') {
        if (suggestModal?.classList.contains('active')) {
            closeSuggestModalFn();
        } else if (activityModal?.classList.contains('active')) {
            activityModal.classList.remove('active');
        } else if (modal?.classList.contains('active')) {
            modal.classList.remove('active');
        }
    }
    
    // Ctrl/Cmd + D for dark mode
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        toggleDarkMode();
    }
});

// ===========================================
// ACTIVITY DATABASE
// ===========================================

const activityDatabase = {
    'sensoji': {
        name: 'Senso-ji Temple & Nakamise Street',
        emoji: '⛩️',
        time: 'Day 1 • Morning',
        website: 'https://www.senso-ji.jp/english/',
        websiteName: 'Senso-ji Official Website',
        address: '2-3-1 Asakusa, Taito City, Tokyo',
        hours: 'Temple: 6:00 AM - 5:00 PM',
        tips: 'Go before 8 AM for empty photos. Free entry.',
        alternatives: ['meiji', 'nezu-shrine']
    },
    'kimono': {
        name: 'Kimono Rental Experience',
        emoji: '👘',
        time: 'Day 1 • Optional',
        website: 'https://www.klook.com/en-AU/activity/6925-kimono-rental-tokyo/',
        websiteName: 'Book Kimono on Klook',
        address: 'Various locations in Asakusa',
        hours: 'Typically 9:00 AM - 6:00 PM',
        tips: 'Miyabi Asakusa is highly rated. Book 2-3 days ahead.',
        alternatives: ['tea-ceremony', 'calligraphy']
    },
    'mipig': {
        name: 'Mipig Cafe Asakusa',
        emoji: '🐷',
        time: 'Day 1 • Afternoon',
        website: 'https://mipig.cafe/en/',
        websiteName: 'Mipig Cafe Official',
        address: 'Chateau Amour 2F, 3-1-1 Asakusa',
        hours: '9:00 AM - 7:00 PM daily',
        tips: 'Book online 1+ week ahead.',
        alternatives: ['owl-cafe', 'cat-cafe', 'hedgehog-cafe']
    },
    'kintsugi': {
        name: 'Kintsugi Workshop',
        emoji: '✨',
        time: 'Day 1 • Afternoon',
        website: 'https://kintsugi-kit.com/pages/kintsugi-workshops-in-tokyo',
        websiteName: 'Tsugu Tsugu Kintsugi',
        address: '1-1-2 Kaminarimon, Taito-ku',
        hours: 'By reservation only',
        tips: 'Check English interpreter availability.',
        alternatives: ['pottery-class', 'origami-workshop']
    },
    'skytree': {
        name: 'Tokyo Skytree',
        emoji: '🗼',
        time: 'Day 2 • Morning',
        website: 'https://www.tokyo-skytree.jp/en/',
        websiteName: 'Tokyo Skytree Official',
        address: '1-1-2 Oshiage, Sumida City',
        hours: '10:00 AM - 9:00 PM',
        tips: 'Book timed tickets online. Weekdays less crowded.',
        alternatives: ['shibuya-sky', 'tokyo-tower']
    },
    'sumida-aquarium': {
        name: 'Sumida Aquarium',
        emoji: '🐠',
        time: 'Day 2 • Late Morning',
        website: 'https://www.sumida-aquarium.com/en/',
        websiteName: 'Sumida Aquarium Official',
        address: 'Tokyo Skytree Town, 5F-6F',
        hours: '10:00 AM - 8:00 PM',
        tips: 'Combo ticket with Skytree saves money.',
        alternatives: ['sunshine-aquarium', 'art-aquarium']
    },
    'origami': {
        name: 'Origami Kaikan',
        emoji: '🦢',
        time: 'Day 2 • Afternoon',
        website: 'https://www.origamikaikan.co.jp/eng/',
        websiteName: 'Origami Kaikan Official',
        address: '1-7-14 Yushima, Bunkyo City',
        hours: '9:30 AM - 6:00 PM (closed Sundays)',
        tips: 'Free entry. Great paper souvenirs.',
        alternatives: ['paper-museum', 'craft-workshop']
    },
    'akihabara': {
        name: 'Akihabara Electric Town',
        emoji: '🤖',
        time: 'Day 3 • Morning',
        website: 'https://www.gotokyo.org/en/destinations/eastern-tokyo/akihabara/',
        websiteName: 'GO TOKYO - Akihabara Guide',
        address: 'Akihabara, Chiyoda City',
        hours: 'Most shops 10:00 AM - 8:00 PM',
        tips: 'Yodobashi opens 9:30 AM. Bring passport for tax-free.',
        alternatives: ['nakano-broadway', 'ikebukuro-otome']
    },
    'teamlab': {
        name: 'teamLab Planets',
        emoji: '🌊',
        time: 'Day 3 • Afternoon',
        website: 'https://www.teamlab.art/e/planets/',
        websiteName: 'teamLab Planets Official',
        address: '6-1-16 Toyosu, Koto City',
        hours: '9:00 AM - 10:00 PM (varies)',
        tips: 'Wear shorts/roll-up pants. Book 1+ month ahead!',
        alternatives: ['teamlab-borderless', 'mori-art-museum']
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
        alternatives: ['sensoji', 'nezu-shrine']
    },
    'harajuku': {
        name: 'Harajuku & Takeshita Street',
        emoji: '🌈',
        time: 'Day 4 • Late Morning',
        website: 'https://www.gotokyo.org/en/destinations/western-tokyo/harajuku/',
        websiteName: 'GO TOKYO - Harajuku Guide',
        address: 'Jingumae, Shibuya City',
        hours: 'Shops typically 10:00 AM - 8:00 PM',
        tips: 'Try rainbow cotton candy & giant crepes!',
        alternatives: ['shimokitazawa', 'daikanyama']
    },
    'shibuya': {
        name: 'Shibuya Crossing & Shibuya Sky',
        emoji: '🚶',
        time: 'Day 4 • Afternoon',
        website: 'https://www.shibuya-scramble-square.com/sky/en/',
        websiteName: 'Shibuya Sky Official',
        address: 'Shibuya Scramble Square',
        hours: '10:00 AM - 10:30 PM',
        tips: 'Sunset views are spectacular. Book 4-5 PM slot.',
        alternatives: ['skytree', 'tokyo-tower']
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
        alternatives: ['disneysea', 'sanrio-puroland']
    }
};

const alternativesDatabase = {
    'meiji': { name: 'Meiji Shrine', emoji: '🌲', desc: 'Peaceful forested shrine', cost: 'Free', time: '1-2 hours' },
    'nezu-shrine': { name: 'Nezu Shrine', emoji: '⛩️', desc: 'Beautiful torii tunnel', cost: 'Free', time: '1 hour' },
    'tea-ceremony': { name: 'Tea Ceremony', emoji: '🍵', desc: 'Traditional tea experience', cost: '¥3-5k', time: '1-2 hours' },
    'calligraphy': { name: 'Calligraphy Class', emoji: '✍️', desc: 'Learn brush calligraphy', cost: '¥3-4k', time: '1-2 hours' },
    'owl-cafe': { name: 'Owl Cafe', emoji: '🦉', desc: 'Pet owls in Harajuku', cost: '¥1.5-2k', time: '1 hour' },
    'cat-cafe': { name: 'Cat Cafe', emoji: '🐱', desc: 'Relax with cats', cost: '¥1-1.5k', time: '1 hour' },
    'hedgehog-cafe': { name: 'Hedgehog Cafe', emoji: '🦔', desc: 'Cute hedgehog interaction', cost: '¥1.4-1.8k', time: '30-60 min' },
    'pottery-class': { name: 'Pottery Workshop', emoji: '🏺', desc: 'Make your own ceramics', cost: '¥3.5-5k', time: '2 hours' },
    'origami-workshop': { name: 'Origami Workshop', emoji: '📄', desc: 'Hands-on origami class', cost: '¥1.5-3k', time: '1-2 hours' },
    'shibuya-sky': { name: 'Shibuya Sky', emoji: '🌃', desc: '360° rooftop observation', cost: '¥2,200', time: '1 hour' },
    'tokyo-tower': { name: 'Tokyo Tower', emoji: '🗼', desc: 'Iconic red tower', cost: '¥1.2-3k', time: '1-2 hours' },
    'sunshine-aquarium': { name: 'Sunshine Aquarium', emoji: '🦭', desc: 'Rooftop aquarium', cost: '¥2,600', time: '2 hours' },
    'art-aquarium': { name: 'Art Aquarium', emoji: '🐠', desc: 'Goldfish art in Ginza', cost: '¥2,400', time: '1-2 hours' },
    'paper-museum': { name: 'Paper Museum', emoji: '📜', desc: 'Japanese paper history', cost: '¥400', time: '1-2 hours' },
    'craft-workshop': { name: 'Craft Workshop', emoji: '🎨', desc: 'Traditional crafts', cost: '¥2-5k', time: '1-2 hours' },
    'nakano-broadway': { name: 'Nakano Broadway', emoji: '🎌', desc: 'Vintage collectibles', cost: 'Free', time: '2-3 hours' },
    'ikebukuro-otome': { name: 'Ikebukuro Otome Road', emoji: '💖', desc: 'Anime shops', cost: 'Free', time: '2-3 hours' },
    'teamlab-borderless': { name: 'teamLab Borderless', emoji: '✨', desc: 'Digital art museum', cost: '¥3.8-5.4k', time: '2-3 hours' },
    'mori-art-museum': { name: 'Mori Art Museum', emoji: '🖼️', desc: 'Contemporary art', cost: '¥2,000', time: '2-3 hours' },
    'shimokitazawa': { name: 'Shimokitazawa', emoji: '🎸', desc: 'Bohemian vintage area', cost: 'Free', time: '2-3 hours' },
    'daikanyama': { name: 'Daikanyama', emoji: '☕', desc: 'Upscale T-Site bookstore', cost: 'Free', time: '2 hours' },
    'disneysea': { name: 'Tokyo DisneySea', emoji: '🚢', desc: 'Unique nautical Disney', cost: '¥8.4-9.4k', time: 'Full day' },
    'sanrio-puroland': { name: 'Sanrio Puroland', emoji: '🎀', desc: 'Hello Kitty theme park', cost: '¥3.6-4.9k', time: '4-6 hours' }
};

// ===========================================
// ACTIVITY MODAL
// ===========================================

const activityModal = document.getElementById('activityModal');
const closeActivityModal = document.getElementById('closeActivityModal');
let currentActivityId = null;

function openActivityModal(activityId) {
    const activity = activityDatabase[activityId];
    if (!activity) return;
    
    currentActivityId = activityId;

    // Populate header
    document.getElementById('activityModalTitle').innerHTML = `${activity.emoji} ${activity.name}`;
    document.getElementById('activityModalTime').textContent = activity.time;

    // Populate venue link
    const venueLink = document.getElementById('venueLink');
    venueLink.href = activity.website;
    document.getElementById('venueLinkText').textContent = activity.websiteName;

    // Populate venue info
    document.getElementById('venueInfo').innerHTML = `
        <div><strong>📍 Address:</strong> ${activity.address}</div>
        <div><strong>🕐 Hours:</strong> ${activity.hours}</div>
        <div><strong>💡 Tip:</strong> ${activity.tips}</div>
    `;

    // Populate alternatives
    const altList = document.getElementById('alternativesList');
    if (activity.alternatives && activity.alternatives.length > 0) {
        altList.innerHTML = activity.alternatives.map(altId => {
            const alt = alternativesDatabase[altId];
            if (!alt) return '';
            return `
                <div class="alt-card" data-alt-id="${altId}">
                    <h5>${alt.emoji} ${alt.name}</h5>
                    <p>${alt.desc}</p>
                    <div class="alt-meta">
                        <span class="alt-tag cost">${alt.cost}</span>
                        <span class="alt-tag">⏱️ ${alt.time}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        // Add click handlers to alternatives
        altList.querySelectorAll('.alt-card').forEach(card => {
            card.addEventListener('click', () => {
                const altId = card.dataset.altId;
                openSuggestModal(currentActivityId, altId);
            });
        });
    } else {
        altList.innerHTML = '<p style="color: var(--text-tertiary); font-size: 0.875rem;">No alternatives listed.</p>';
    }

    activityModal.classList.add('active');
}

if (closeActivityModal) {
    closeActivityModal.addEventListener('click', () => {
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

// ===========================================
// SUGGEST MODAL
// ===========================================

const suggestModal = document.getElementById('suggestModal');
const closeSuggestModal = document.getElementById('closeSuggestModal');

function openSuggestModal(activityId, alternativeId) {
    const alt = alternativesDatabase[alternativeId];
    if (!alt) return;
    
    pendingSuggestion = { activityId, alternativeId };
    
    document.getElementById('suggestEmoji').textContent = alt.emoji;
    document.getElementById('suggestActivityName').textContent = alt.name;
    
    suggestModal.classList.add('active');
}

function closeSuggestModalFn() {
    suggestModal.classList.remove('active');
    pendingSuggestion = null;
}

if (closeSuggestModal) {
    closeSuggestModal.addEventListener('click', closeSuggestModalFn);
}

if (suggestModal) {
    suggestModal.addEventListener('click', (e) => {
        if (e.target === suggestModal) {
            closeSuggestModalFn();
        }
    });
}

// Who buttons
document.querySelectorAll('.who-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!pendingSuggestion) return;
        
        const who = btn.dataset.who;
        const { activityId, alternativeId } = pendingSuggestion;
        
        // Save suggestion
        activitySuggestions[activityId] = {
            alternativeId,
            suggestedBy: who,
            timestamp: Date.now()
        };
        
        localStorage.setItem('tokyoSuggestions', JSON.stringify(activitySuggestions));
        
        // Update UI
        renderSuggestionBadges();
        
        // Close modals
        closeSuggestModalFn();
        activityModal.classList.remove('active');
        
        showToast(`${who} suggested a new activity!`, '✨');
    });
});

// ===========================================
// SUGGESTION BADGES
// ===========================================

function renderSuggestionBadges() {
    // Clear existing suggestion UI
    document.querySelectorAll('.activity-card').forEach(card => {
        card.classList.remove('has-suggestion', 'mat', 'skye');
        const existingBadge = card.querySelector('.suggestion-badge');
        if (existingBadge) existingBadge.remove();
        const existingSuggested = card.querySelector('.suggested-activity');
        if (existingSuggested) existingSuggested.remove();
    });
    
    // Add badges for suggestions
    Object.entries(activitySuggestions).forEach(([activityId, suggestion]) => {
        const card = document.querySelector(`.activity-card[data-activity="${activityId}"]`);
        if (!card) return;
        
        const alt = alternativesDatabase[suggestion.alternativeId];
        if (!alt) return;
        
        const whoClass = suggestion.suggestedBy.toLowerCase();
        card.classList.add('has-suggestion', whoClass);
        
        // Add badge to header
        const header = card.querySelector('.activity-header');
        if (header) {
            const badge = document.createElement('span');
            badge.className = `suggestion-badge ${whoClass}`;
            badge.innerHTML = `${suggestion.suggestedBy === 'Mat' ? '👨' : '👩'} ${suggestion.suggestedBy}'s pick`;
            header.appendChild(badge);
        }
        
        // Add suggested activity info
        const suggestedDiv = document.createElement('div');
        suggestedDiv.className = 'suggested-activity';
        suggestedDiv.innerHTML = `
            <div class="suggested-activity-header">
                <span>Suggested instead:</span>
                <button class="clear-suggestion" data-activity="${activityId}">✕ Clear</button>
            </div>
            <div class="suggested-name">${alt.emoji} ${alt.name}</div>
        `;
        card.appendChild(suggestedDiv);
        
        // Add clear handler
        suggestedDiv.querySelector('.clear-suggestion').addEventListener('click', (e) => {
            e.stopPropagation();
            clearSuggestion(activityId);
        });
    });
}

function clearSuggestion(activityId) {
    delete activitySuggestions[activityId];
    localStorage.setItem('tokyoSuggestions', JSON.stringify(activitySuggestions));
    renderSuggestionBadges();
    showToast('Suggestion cleared', '🗑️');
}

// ===========================================
// ACTIVITY CARDS - CLICK TO OPEN MODAL
// ===========================================

document.querySelectorAll('.activity-card').forEach(card => {
    card.addEventListener('click', (e) => {
        // Don't open modal if clicking a link
        if (e.target.closest('a')) return;
        
        const activityId = card.dataset.activity;
        if (activityId) {
            openActivityModal(activityId);
        }
    });
});

// ===========================================
// SCROLL ANIMATIONS
// ===========================================

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

document.querySelectorAll('.activity-card, .tip-card, .tech-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(16px)';
    el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    observer.observe(el);
});

// ===========================================
// INITIALIZATION
// ===========================================

document.addEventListener('DOMContentLoaded', () => {
    initDarkMode();
    updateActiveTab();
    renderSuggestionBadges();
    
    console.log('🗼 Tokyo Adventure loaded!');
});
