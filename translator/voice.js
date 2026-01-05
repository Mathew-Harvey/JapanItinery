/**
 * Voice Module
 * Handles speech recognition and text-to-speech for voice translation
 * Supports English and Japanese speech for bidirectional translation
 */

const VoiceModule = (function() {
    'use strict';

    // Private state
    let recognition = null;
    let synthesis = null;
    let isListening = false;
    let isInitialized = false;
    let currentLanguage = 'en'; // 'ja' or 'en' (auto removed - doesn't work reliably)
    let detectedLanguage = null;
    let onResultCallback = null;
    let onStatusCallback = null;
    let onVolumeCallback = null;
    let onPermissionCallback = null;
    let audioContext = null;
    let analyser = null;
    let mediaStream = null;
    let volumeInterval = null;
    let lastTranscript = '';
    let silenceTimeout = null;
    let noSpeechTimeout = null;
    let interimResults = '';
    let permissionState = 'unknown'; // 'unknown', 'prompt', 'granted', 'denied'
    let hasReceivedResult = false; // Track if we got any results this session
    let restartAttempts = 0;
    let maxRestartAttempts = 3;

    // Configuration
    const config = {
        silenceDelay: 1500, // ms of silence before processing
        noSpeechTimeout: 8000, // ms before showing "no speech detected" hint
        minConfidence: 0.5,
        maxAlternatives: 3,
        continuous: true,
        interimResults: true
    };

    // Language detection patterns
    const japaneseRegex = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/;
    const englishRegex = /^[a-zA-Z0-9\s.,!?'"()-]+$/;

    /**
     * Check microphone permission state
     * @returns {Promise<string>} - 'granted', 'denied', 'prompt', or 'unknown'
     */
    async function checkPermission() {
        try {
            // First try the Permissions API
            if (navigator.permissions && navigator.permissions.query) {
                try {
                    const result = await navigator.permissions.query({ name: 'microphone' });
                    permissionState = result.state;
                    
                    // Listen for permission changes
                    result.onchange = () => {
                        permissionState = result.state;
                        if (onPermissionCallback) {
                            onPermissionCallback(permissionState);
                        }
                    };
                    
                    return permissionState;
                } catch (e) {
                    // Permissions API not supported for microphone
                    console.log('[Voice] Permissions API not available, will check on request');
                }
            }
            
            // Fallback: check if we already have a stream
            if (mediaStream && mediaStream.active) {
                permissionState = 'granted';
                return 'granted';
            }
            
            return 'unknown';
        } catch (error) {
            console.warn('[Voice] Permission check failed:', error);
            return 'unknown';
        }
    }

    /**
     * Request microphone permission explicitly
     * This should be called from a direct user action (click)
     * @returns {Promise<boolean>} - true if permission granted
     */
    async function requestPermission() {
        try {
            console.log('[Voice] Requesting microphone permission...');
            
            // Close any existing stream first
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
                mediaStream = null;
            }
            
            // Request microphone access - this MUST be from a user gesture
            mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            permissionState = 'granted';
            console.log('[Voice] Microphone permission granted');
            
            if (onPermissionCallback) {
                onPermissionCallback('granted');
            }
            
            return true;
        } catch (error) {
            console.error('[Voice] Microphone permission denied:', error);
            
            if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                permissionState = 'denied';
            } else if (error.name === 'NotFoundError') {
                permissionState = 'denied';
                reportStatus('error', 'No microphone found');
            } else {
                permissionState = 'denied';
            }
            
            if (onPermissionCallback) {
                onPermissionCallback(permissionState);
            }
            
            return false;
        }
    }

    /**
     * Get current permission state
     * @returns {string}
     */
    function getPermissionState() {
        return permissionState;
    }

    /**
     * Set callback for permission changes
     * @param {Function} callback
     */
    function setPermissionCallback(callback) {
        onPermissionCallback = callback;
    }

    /**
     * Initialize the voice module
     * @returns {Promise<boolean>}
     */
    async function init() {
        if (isInitialized) return true;

        try {
            // Check for Web Speech API support
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            
            if (!SpeechRecognition) {
                console.error('[Voice] Speech recognition not supported');
                return false;
            }

            // Initialize speech recognition
            recognition = new SpeechRecognition();
            recognition.continuous = config.continuous;
            recognition.interimResults = config.interimResults;
            recognition.maxAlternatives = config.maxAlternatives;

            // Set up event handlers
            setupRecognitionHandlers();

            // Initialize speech synthesis
            synthesis = window.speechSynthesis;

            // Check initial permission state (non-blocking)
            checkPermission();

            isInitialized = true;
            console.log('[Voice] Module initialized');
            return true;

        } catch (error) {
            console.error('[Voice] Initialization failed:', error);
            return false;
        }
    }

    /**
     * Set up speech recognition event handlers
     */
    function setupRecognitionHandlers() {
        recognition.onstart = () => {
            console.log('[Voice] Recognition started');
            isListening = true;
            hasReceivedResult = false;
            restartAttempts = 0;
            reportStatus('listening', 'Listening... Speak now!');
            startVolumeMonitoring();
            startNoSpeechTimeout();
        };

        recognition.onend = () => {
            console.log('[Voice] Recognition ended, isListening:', isListening, 'hasReceivedResult:', hasReceivedResult);
            clearNoSpeechTimeout();
            
            if (isListening) {
                // Only restart if we haven't exceeded attempts and user wants to continue
                if (restartAttempts < maxRestartAttempts) {
                    restartAttempts++;
                    console.log('[Voice] Restarting recognition, attempt:', restartAttempts);
                    
                    // Small delay before restart to prevent rapid cycling
                    setTimeout(() => {
                        if (isListening) {
                            try {
                                recognition.start();
                            } catch (e) {
                                console.error('[Voice] Restart failed:', e);
                                isListening = false;
                                reportStatus('stopped', 'Tap microphone to start');
                                stopVolumeMonitoring();
                            }
                        }
                    }, 300);
                } else {
                    console.log('[Voice] Max restart attempts reached');
                    isListening = false;
                    reportStatus('info', 'Tap microphone to continue');
                    stopVolumeMonitoring();
                }
            } else {
                reportStatus('stopped', 'Tap microphone to start');
                stopVolumeMonitoring();
            }
        };

        recognition.onerror = (event) => {
            console.error('[Voice] Recognition error:', event.error);
            clearNoSpeechTimeout();
            
            let message = 'Error occurred';
            let shouldStop = true;
            
            switch (event.error) {
                case 'no-speech':
                    message = 'No speech detected. Speak louder or closer to mic.';
                    shouldStop = false; // Keep listening but show feedback
                    restartAttempts = 0; // Reset restart counter on no-speech
                    reportStatus('no-speech', message);
                    return; // Don't process further, recognition will restart
                case 'audio-capture':
                    message = 'Microphone not available. Check connections.';
                    permissionState = 'denied';
                    break;
                case 'not-allowed':
                    message = 'Microphone access denied. Check browser settings.';
                    permissionState = 'denied';
                    break;
                case 'network':
                    message = 'Network error. Check your connection.';
                    break;
                case 'aborted':
                    // User intentionally stopped - don't show error
                    console.log('[Voice] Recognition aborted');
                    return;
                case 'service-not-allowed':
                    message = 'Voice service blocked. Try refreshing the page.';
                    permissionState = 'denied';
                    break;
                default:
                    message = 'Voice error: ' + event.error;
            }
            
            if (shouldStop) {
                reportStatus('error', message);
                isListening = false;
                stopVolumeMonitoring();
            }
        };

        recognition.onresult = (event) => {
            hasReceivedResult = true;
            restartAttempts = 0; // Reset on successful result
            clearNoSpeechTimeout();
            handleRecognitionResult(event);
        };

        recognition.onsoundstart = () => {
            console.log('[Voice] Sound detected');
            clearNoSpeechTimeout();
            reportStatus('detecting', 'Hearing something...');
        };

        recognition.onspeechstart = () => {
            console.log('[Voice] Speech detected');
            clearNoSpeechTimeout();
            reportStatus('speaking', 'Listening to you...');
            clearSilenceTimeout();
        };

        recognition.onspeechend = () => {
            console.log('[Voice] Speech ended');
            reportStatus('processing', 'Processing your speech...');
            startSilenceTimeout();
        };
    }

    /**
     * Handle speech recognition results
     * @param {SpeechRecognitionEvent} event
     */
    function handleRecognitionResult(event) {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            const transcript = result[0].transcript;

            if (result.isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        // Update interim results for UI - show live transcription
        if (interimTranscript) {
            interimResults = interimTranscript;
            console.log('[Voice] Interim:', interimTranscript);
            reportStatus('interim', interimTranscript);
        }

        // Process final results
        if (finalTranscript) {
            lastTranscript = finalTranscript.trim();
            interimResults = '';
            
            // Use the language we're listening in as the detected language
            // This is more reliable than trying to detect after the fact
            detectedLanguage = currentLanguage === 'ja' ? 'ja' : 'en';
            
            // But still check if the text contains the opposite language characters
            // (e.g., user selected English but spoke Japanese)
            const hasJapaneseChars = japaneseRegex.test(lastTranscript);
            if (currentLanguage === 'en' && hasJapaneseChars) {
                detectedLanguage = 'ja';
            } else if (currentLanguage === 'ja' && !hasJapaneseChars) {
                // If we're in Japanese mode but got no Japanese characters, 
                // it might be English or romanized
                detectedLanguage = 'ja'; // Keep as Japanese since that's what we're listening for
            }
            
            const confidence = event.results[event.results.length - 1][0].confidence;
            console.log('[Voice] Final transcript:', lastTranscript);
            console.log('[Voice] Language:', detectedLanguage, 'Confidence:', confidence);

            // Report result
            if (onResultCallback) {
                onResultCallback({
                    text: lastTranscript,
                    language: detectedLanguage,
                    confidence: confidence || 0.8
                });
            }

            reportStatus('result', lastTranscript);
            
            // Stop listening after getting a result to process the translation
            // User can tap again to continue
            stopListening();
        }
    }

    /**
     * Detect language of text
     * @param {string} text
     * @returns {string} - 'ja', 'en', or 'unknown'
     */
    function detectLanguage(text) {
        if (!text) return 'unknown';

        // Check for Japanese characters
        if (japaneseRegex.test(text)) {
            return 'ja';
        }

        // Check if mostly English
        if (englishRegex.test(text)) {
            return 'en';
        }

        // Mixed or unknown
        const japaneseMatches = (text.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g) || []).length;
        const totalChars = text.replace(/\s/g, '').length;
        
        if (totalChars > 0 && japaneseMatches / totalChars > 0.3) {
            return 'ja';
        }

        return 'en';
    }

    /**
     * Start no-speech timeout
     * Shows helpful message if user doesn't speak for a while
     */
    function startNoSpeechTimeout() {
        clearNoSpeechTimeout();
        noSpeechTimeout = setTimeout(() => {
            if (isListening && !hasReceivedResult) {
                reportStatus('hint', 'Still listening... Try speaking clearly.');
            }
        }, config.noSpeechTimeout);
    }

    /**
     * Clear no-speech timeout
     */
    function clearNoSpeechTimeout() {
        if (noSpeechTimeout) {
            clearTimeout(noSpeechTimeout);
            noSpeechTimeout = null;
        }
    }

    /**
     * Start listening for speech
     * @param {string} language - 'ja', 'en', or specific BCP-47 code. 'auto' defaults to 'en'
     * @returns {Promise<boolean>}
     */
    async function startListening(language = 'en') {
        if (!isInitialized) {
            console.error('[Voice] Module not initialized');
            return false;
        }

        if (isListening) {
            console.log('[Voice] Already listening');
            return true;
        }

        try {
            // Check/request permission first if needed
            if (permissionState !== 'granted') {
                reportStatus('requesting', 'Requesting microphone access...');
                const hasPermission = await requestPermission();
                if (!hasPermission) {
                    reportStatus('error', 'Microphone access denied');
                    return false;
                }
            }

            // Handle 'auto' - default to English since most users will speak English
            // and want Japanese translation (or vice versa - but we need to pick one)
            if (language === 'auto') {
                language = 'en';
                console.log('[Voice] Auto mode defaulting to English');
            }
            
            currentLanguage = language;
            
            // Set recognition language
            if (language === 'ja') {
                recognition.lang = 'ja-JP';
            } else if (language === 'en') {
                recognition.lang = 'en-US';
            } else {
                recognition.lang = language;
            }

            // Reset state
            lastTranscript = '';
            interimResults = '';
            detectedLanguage = null;
            hasReceivedResult = false;
            restartAttempts = 0;

            console.log('[Voice] Starting recognition in:', recognition.lang);
            recognition.start();
            return true;

        } catch (error) {
            console.error('[Voice] Failed to start:', error);
            
            // Handle specific errors
            if (error.message && error.message.includes('already started')) {
                // Recognition already started, that's okay
                isListening = true;
                return true;
            }
            
            reportStatus('error', 'Failed to start voice recognition');
            return false;
        }
    }

    /**
     * Stop listening
     */
    function stopListening() {
        console.log('[Voice] Stopping listening...');
        isListening = false;
        clearSilenceTimeout();
        clearNoSpeechTimeout();
        stopVolumeMonitoring();

        if (recognition) {
            try {
                recognition.abort(); // Use abort() for immediate stop
            } catch (e) {
                // Ignore errors when stopping
                console.log('[Voice] Stop error (ignored):', e);
            }
        }

        // Don't report stopped status here - let the caller handle UI updates
        console.log('[Voice] Stopped listening');
    }

    /**
     * Toggle listening state
     * @returns {boolean} - New listening state
     */
    function toggleListening() {
        if (isListening) {
            stopListening();
            return false;
        } else {
            return startListening(currentLanguage);
        }
    }

    /**
     * Speak text using TTS
     * @param {string} text - Text to speak
     * @param {string} language - 'ja' or 'en'
     * @returns {Promise<void>}
     */
    function speak(text, language = 'en') {
        return new Promise((resolve, reject) => {
            if (!synthesis) {
                reject(new Error('Speech synthesis not available'));
                return;
            }

            // Cancel any ongoing speech
            synthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            
            // Set language
            if (language === 'ja') {
                utterance.lang = 'ja-JP';
                utterance.rate = 0.9;
            } else {
                utterance.lang = 'en-US';
                utterance.rate = 0.95;
            }

            utterance.pitch = 1;
            utterance.volume = 1;

            // Try to find a native voice
            const voices = synthesis.getVoices();
            const langCode = language === 'ja' ? 'ja' : 'en';
            const nativeVoice = voices.find(v => v.lang.startsWith(langCode) && v.localService);
            
            if (nativeVoice) {
                utterance.voice = nativeVoice;
            }

            utterance.onend = () => {
                resolve();
            };

            utterance.onerror = (event) => {
                reject(new Error(event.error));
            };

            synthesis.speak(utterance);
        });
    }

    /**
     * Start silence timeout
     */
    function startSilenceTimeout() {
        clearSilenceTimeout();
        silenceTimeout = setTimeout(() => {
            if (lastTranscript && onResultCallback) {
                // Final processing after silence
            }
        }, config.silenceDelay);
    }

    /**
     * Clear silence timeout
     */
    function clearSilenceTimeout() {
        if (silenceTimeout) {
            clearTimeout(silenceTimeout);
            silenceTimeout = null;
        }
    }

    /**
     * Start monitoring microphone volume
     */
    async function startVolumeMonitoring() {
        if (volumeInterval) return;

        try {
            // Create audio context if needed
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            // Resume audio context if suspended
            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }
            
            // Use existing stream or get a new one
            let stream = mediaStream;
            if (!stream || !stream.active) {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaStream = stream;
            }
            
            const source = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            volumeInterval = setInterval(() => {
                if (!analyser) return;
                
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                const volume = Math.min(100, Math.round(average / 128 * 100));
                
                if (onVolumeCallback) {
                    onVolumeCallback(volume);
                }
            }, 50);

        } catch (error) {
            console.warn('[Voice] Volume monitoring not available:', error);
        }
    }

    /**
     * Stop volume monitoring
     */
    function stopVolumeMonitoring() {
        if (volumeInterval) {
            clearInterval(volumeInterval);
            volumeInterval = null;
        }
        if (onVolumeCallback) {
            onVolumeCallback(0);
        }
    }

    /**
     * Report status to callback
     * @param {string} type - Status type
     * @param {string} message - Status message
     */
    function reportStatus(type, message) {
        if (onStatusCallback) {
            onStatusCallback({ type, message });
        }
    }

    /**
     * Set callback for recognition results
     * @param {Function} callback
     */
    function setResultCallback(callback) {
        onResultCallback = callback;
    }

    /**
     * Set callback for status updates
     * @param {Function} callback
     */
    function setStatusCallback(callback) {
        onStatusCallback = callback;
    }

    /**
     * Set callback for volume updates
     * @param {Function} callback
     */
    function setVolumeCallback(callback) {
        onVolumeCallback = callback;
    }

    /**
     * Check if currently listening
     * @returns {boolean}
     */
    function getIsListening() {
        return isListening;
    }

    /**
     * Check if voice is supported
     * @returns {boolean}
     */
    function isSupported() {
        return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    /**
     * Get available voices
     * @returns {SpeechSynthesisVoice[]}
     */
    function getVoices() {
        return synthesis ? synthesis.getVoices() : [];
    }

    /**
     * Get last detected language
     * @returns {string|null}
     */
    function getDetectedLanguage() {
        return detectedLanguage;
    }

    /**
     * Get interim results
     * @returns {string}
     */
    function getInterimResults() {
        return interimResults;
    }

    /**
     * Set recognition language
     * @param {string} lang - Language code ('en', 'ja', or 'auto' which defaults to 'en')
     */
    function setLanguage(lang) {
        // Handle 'auto' by defaulting to English
        if (lang === 'auto') {
            lang = 'en';
        }
        currentLanguage = lang;
        
        if (recognition && !isListening) {
            recognition.lang = lang === 'ja' ? 'ja-JP' : 'en-US';
            console.log('[Voice] Language set to:', recognition.lang);
        }
    }
    
    /**
     * Get current language setting
     * @returns {string}
     */
    function getCurrentLanguage() {
        return currentLanguage;
    }

    /**
     * Cleanup resources
     */
    function cleanup() {
        console.log('[Voice] Cleaning up...');
        stopListening();
        clearNoSpeechTimeout();
        clearSilenceTimeout();
        
        // Stop media stream tracks
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }
        
        if (audioContext) {
            try {
                audioContext.close();
            } catch (e) {
                // Ignore
            }
            audioContext = null;
        }
        if (synthesis) {
            synthesis.cancel();
        }
        
        isInitialized = false;
        console.log('[Voice] Cleanup complete');
    }

    // Public API
    return {
        init,
        startListening,
        stopListening,
        toggleListening,
        speak,
        setResultCallback,
        setStatusCallback,
        setVolumeCallback,
        setPermissionCallback,
        getIsListening,
        isSupported,
        getVoices,
        getDetectedLanguage,
        getInterimResults,
        setLanguage,
        getCurrentLanguage,
        detectLanguage,
        checkPermission,
        requestPermission,
        getPermissionState,
        cleanup
    };

})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VoiceModule;
}

