/**
 * Translation Module
 * Handles Japanese to English translation with multiple API fallbacks
 * Includes caching for performance and offline capability
 */

const TranslationModule = (function() {
    'use strict';

    // Private state
    let isInitialized = false;
    let activeProvider = null;
    let translationCache = new Map();
    let pendingTranslations = new Map();

    // Configuration
    const config = {
        maxCacheSize: 500,
        cacheKey: 'tokyoTranslationCache',
        timeout: 10000, // 10 second timeout
        retryAttempts: 2,
        retryDelay: 1000
    };

    // Translation providers in order of preference
    const providers = {
        // MyMemory - Free, no API key needed, 1000 words/day
        mymemory: {
            name: 'MyMemory',
            async translate(text) {
                const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ja|en`;
                const response = await fetchWithTimeout(url, config.timeout);
                const data = await response.json();
                
                if (data.responseStatus === 200 && data.responseData) {
                    return {
                        success: true,
                        translation: data.responseData.translatedText,
                        confidence: data.responseData.match || 0.5,
                        provider: 'MyMemory'
                    };
                }
                throw new Error(data.responseDetails || 'Translation failed');
            }
        },

        // LibreTranslate - Open source, some instances are free
        libretranslate: {
            name: 'LibreTranslate',
            async translate(text) {
                // Use a public LibreTranslate instance
                const url = 'https://libretranslate.com/translate';
                const response = await fetchWithTimeout(url, config.timeout, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        q: text,
                        source: 'ja',
                        target: 'en',
                        format: 'text'
                    })
                });
                const data = await response.json();
                
                if (data.translatedText) {
                    return {
                        success: true,
                        translation: data.translatedText,
                        confidence: 0.7,
                        provider: 'LibreTranslate'
                    };
                }
                throw new Error(data.error || 'Translation failed');
            }
        },

        // Lingva Translate - Google Translate scraper (free)
        lingva: {
            name: 'Lingva',
            async translate(text) {
                const url = `https://lingva.ml/api/v1/ja/en/${encodeURIComponent(text)}`;
                const response = await fetchWithTimeout(url, config.timeout);
                const data = await response.json();
                
                if (data.translation) {
                    return {
                        success: true,
                        translation: data.translation,
                        confidence: 0.85,
                        provider: 'Lingva'
                    };
                }
                throw new Error('Translation failed');
            }
        }
    };

    /**
     * Fetch with timeout
     * @param {string} url - URL to fetch
     * @param {number} timeout - Timeout in ms
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>}
     */
    async function fetchWithTimeout(url, timeout, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    }

    /**
     * Initialize the translation module
     * @returns {Promise<boolean>}
     */
    async function init() {
        try {
            // Load cached translations from localStorage
            loadCache();
            
            // Test providers to find the best one
            activeProvider = await findWorkingProvider();
            
            if (activeProvider) {
                isInitialized = true;
                console.log('[Translation] Initialized with provider:', activeProvider);
                return true;
            }
            
            console.warn('[Translation] No working provider found, using cache only');
            isInitialized = true;
            return true;
            
        } catch (error) {
            console.error('[Translation] Initialization error:', error);
            isInitialized = true; // Still allow cached translations
            return true;
        }
    }

    /**
     * Find a working translation provider
     * @returns {Promise<string|null>}
     */
    async function findWorkingProvider() {
        const testText = 'こんにちは'; // "Hello" in Japanese
        
        for (const [name, provider] of Object.entries(providers)) {
            try {
                console.log('[Translation] Testing provider:', name);
                const result = await provider.translate(testText);
                if (result.success && result.translation) {
                    console.log('[Translation] Provider working:', name);
                    return name;
                }
            } catch (error) {
                console.warn('[Translation] Provider failed:', name, error.message);
            }
        }
        
        return null;
    }

    /**
     * Translate Japanese text to English
     * @param {string} text - Japanese text to translate
     * @param {Object} options - Translation options
     * @returns {Promise<Object>} - Translation result
     */
    async function translate(text, options = {}) {
        // Validate input
        if (!text || typeof text !== 'string') {
            return { success: false, error: 'Invalid input text' };
        }

        const cleanText = text.trim();
        if (cleanText.length === 0) {
            return { success: false, error: 'Empty text' };
        }

        // Check cache first
        const cached = getFromCache(cleanText);
        if (cached && !options.skipCache) {
            console.log('[Translation] Cache hit');
            return { ...cached, fromCache: true };
        }

        // Check if already translating this text
        if (pendingTranslations.has(cleanText)) {
            return pendingTranslations.get(cleanText);
        }

        // Create promise for this translation
        const translationPromise = performTranslation(cleanText, options);
        pendingTranslations.set(cleanText, translationPromise);

        try {
            const result = await translationPromise;
            pendingTranslations.delete(cleanText);
            return result;
        } catch (error) {
            pendingTranslations.delete(cleanText);
            throw error;
        }
    }

    /**
     * Perform the actual translation with fallbacks
     * @param {string} text - Text to translate
     * @param {Object} options - Options
     * @returns {Promise<Object>}
     */
    async function performTranslation(text, options = {}) {
        const providerOrder = options.preferredProvider 
            ? [options.preferredProvider, ...Object.keys(providers).filter(p => p !== options.preferredProvider)]
            : (activeProvider ? [activeProvider, ...Object.keys(providers).filter(p => p !== activeProvider)] : Object.keys(providers));

        let lastError = null;

        for (const providerName of providerOrder) {
            const provider = providers[providerName];
            if (!provider) continue;

            for (let attempt = 0; attempt < config.retryAttempts; attempt++) {
                try {
                    console.log(`[Translation] Trying ${providerName} (attempt ${attempt + 1})`);
                    const result = await provider.translate(text);
                    
                    if (result.success) {
                        // Cache successful translation
                        addToCache(text, result);
                        
                        // Update active provider if this one worked
                        activeProvider = providerName;
                        
                        return result;
                    }
                } catch (error) {
                    console.warn(`[Translation] ${providerName} failed:`, error.message);
                    lastError = error;
                    
                    // Wait before retry
                    if (attempt < config.retryAttempts - 1) {
                        await sleep(config.retryDelay);
                    }
                }
            }
        }

        // All providers failed
        return {
            success: false,
            error: lastError?.message || 'All translation services unavailable',
            translation: null
        };
    }

    /**
     * Batch translate multiple texts
     * @param {string[]} texts - Array of texts to translate
     * @returns {Promise<Object[]>} - Array of translation results
     */
    async function translateBatch(texts) {
        if (!Array.isArray(texts)) {
            return [{ success: false, error: 'Invalid input' }];
        }

        // Process in parallel with some concurrency limit
        const concurrencyLimit = 3;
        const results = [];

        for (let i = 0; i < texts.length; i += concurrencyLimit) {
            const batch = texts.slice(i, i + concurrencyLimit);
            const batchResults = await Promise.all(
                batch.map(text => translate(text))
            );
            results.push(...batchResults);
        }

        return results;
    }

    /**
     * Get translation from cache
     * @param {string} text - Source text
     * @returns {Object|null}
     */
    function getFromCache(text) {
        return translationCache.get(text) || null;
    }

    /**
     * Add translation to cache
     * @param {string} text - Source text
     * @param {Object} result - Translation result
     */
    function addToCache(text, result) {
        // Enforce cache size limit
        if (translationCache.size >= config.maxCacheSize) {
            // Remove oldest entries
            const keysToDelete = Array.from(translationCache.keys())
                .slice(0, Math.floor(config.maxCacheSize / 4));
            keysToDelete.forEach(key => translationCache.delete(key));
        }

        translationCache.set(text, {
            translation: result.translation,
            confidence: result.confidence,
            provider: result.provider,
            timestamp: Date.now()
        });

        // Persist to localStorage
        saveCache();
    }

    /**
     * Load cache from localStorage
     */
    function loadCache() {
        try {
            const stored = localStorage.getItem(config.cacheKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                translationCache = new Map(parsed);
                console.log('[Translation] Loaded', translationCache.size, 'cached translations');
            }
        } catch (error) {
            console.warn('[Translation] Failed to load cache:', error);
            translationCache = new Map();
        }
    }

    /**
     * Save cache to localStorage
     */
    function saveCache() {
        try {
            const data = Array.from(translationCache.entries());
            localStorage.setItem(config.cacheKey, JSON.stringify(data));
        } catch (error) {
            console.warn('[Translation] Failed to save cache:', error);
        }
    }

    /**
     * Clear the translation cache
     */
    function clearCache() {
        translationCache.clear();
        localStorage.removeItem(config.cacheKey);
        console.log('[Translation] Cache cleared');
    }

    /**
     * Get cache statistics
     * @returns {Object}
     */
    function getCacheStats() {
        return {
            size: translationCache.size,
            maxSize: config.maxCacheSize,
            provider: activeProvider
        };
    }

    /**
     * Sleep helper
     * @param {number} ms - Milliseconds to sleep
     * @returns {Promise}
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Check if module is ready
     * @returns {boolean}
     */
    function isReady() {
        return isInitialized;
    }

    /**
     * Get current active provider
     * @returns {string|null}
     */
    function getProvider() {
        return activeProvider;
    }

    /**
     * Set preferred provider
     * @param {string} providerName
     */
    function setProvider(providerName) {
        if (providers[providerName]) {
            activeProvider = providerName;
        }
    }

    /**
     * Get list of available providers
     * @returns {string[]}
     */
    function getAvailableProviders() {
        return Object.keys(providers);
    }

    // Romanization helpers for additional context
    const commonPhrases = {
        '駅': { romaji: 'eki', meaning: 'station' },
        '出口': { romaji: 'deguchi', meaning: 'exit' },
        '入口': { romaji: 'iriguchi', meaning: 'entrance' },
        '北': { romaji: 'kita', meaning: 'north' },
        '南': { romaji: 'minami', meaning: 'south' },
        '東': { romaji: 'higashi', meaning: 'east' },
        '西': { romaji: 'nishi', meaning: 'west' },
        'トイレ': { romaji: 'toire', meaning: 'toilet/restroom' },
        '改札': { romaji: 'kaisatsu', meaning: 'ticket gate' },
        '切符': { romaji: 'kippu', meaning: 'ticket' },
        '乗り換え': { romaji: 'norikae', meaning: 'transfer' },
        '禁煙': { romaji: 'kinen', meaning: 'no smoking' },
        '危険': { romaji: 'kiken', meaning: 'danger' },
        '注意': { romaji: 'chūi', meaning: 'caution' },
        '止まれ': { romaji: 'tomare', meaning: 'stop' },
        '押す': { romaji: 'osu', meaning: 'push' },
        '引く': { romaji: 'hiku', meaning: 'pull' },
        '営業中': { romaji: 'eigyō-chū', meaning: 'open for business' },
        '準備中': { romaji: 'junbi-chū', meaning: 'preparing/closed' },
        '円': { romaji: 'en', meaning: 'yen' }
    };

    /**
     * Get quick translation for common phrases
     * @param {string} text - Text to check
     * @returns {Object|null}
     */
    function getQuickTranslation(text) {
        for (const [japanese, info] of Object.entries(commonPhrases)) {
            if (text.includes(japanese)) {
                return {
                    japanese,
                    ...info
                };
            }
        }
        return null;
    }

    /**
     * Find all common phrases in text
     * @param {string} text - Text to search
     * @returns {Object[]}
     */
    function findCommonPhrases(text) {
        const found = [];
        for (const [japanese, info] of Object.entries(commonPhrases)) {
            if (text.includes(japanese)) {
                found.push({ japanese, ...info });
            }
        }
        return found;
    }

    // Public API
    return {
        init,
        translate,
        translateBatch,
        getFromCache,
        clearCache,
        getCacheStats,
        isReady,
        getProvider,
        setProvider,
        getAvailableProviders,
        getQuickTranslation,
        findCommonPhrases
    };

})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TranslationModule;
}



