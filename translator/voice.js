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
        continuous: false, // Changed to false - works better on mobile
        interimResults: true,
        waveformBars: 20 // Number of bars in waveform visualization
    };
    
    // Accumulated transcript for the session
    let sessionTranscript = '';

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
            // Check if page is served over HTTPS (required for microphone)
            const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
            if (!isSecure) {
                console.error('[Voice] Page must be served over HTTPS for microphone access');
                console.error('[Voice] Current protocol:', location.protocol);
            }
            
            // Check for Web Speech API support
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            
            if (!SpeechRecognition) {
                console.error('[Voice] Speech recognition not supported');
                return false;
            }
            
            console.log('[Voice] SpeechRecognition available:', !!SpeechRecognition);
            console.log('[Voice] Using:', window.SpeechRecognition ? 'SpeechRecognition' : 'webkitSpeechRecognition');

            // Initialize speech recognition
            recognition = new SpeechRecognition();
            recognition.continuous = config.continuous;
            recognition.interimResults = config.interimResults;
            recognition.maxAlternatives = config.maxAlternatives;
            
            console.log('[Voice] Recognition config:', {
                continuous: recognition.continuous,
                interimResults: recognition.interimResults,
                maxAlternatives: recognition.maxAlternatives
            });

            // Set up event handlers
            setupRecognitionHandlers();

            // Initialize speech synthesis
            synthesis = window.speechSynthesis;

            // Check initial permission state (non-blocking)
            checkPermission();

            isInitialized = true;
            console.log('[Voice] Module initialized successfully');
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
            reportStatus('listening', 'Mic active - speak now!');
            startVolumeMonitoring();
            startNoSpeechTimeout();
        };

        recognition.onend = () => {
            console.log('[Voice] Recognition ended');
            console.log('[Voice] - isListening:', isListening);
            console.log('[Voice] - hasReceivedResult:', hasReceivedResult);
            console.log('[Voice] - sessionTranscript:', sessionTranscript);
            clearNoSpeechTimeout();
            
            // If user is still in "listening" mode, restart recognition
            // This is especially important when continuous=false (mobile)
            if (isListening) {
                restartAttempts++;
                console.log('[Voice] Auto-restarting, attempt:', restartAttempts);
                
                if (restartAttempts < maxRestartAttempts) {
                    setTimeout(() => {
                        if (isListening) {
                            try {
                                recognition.start();
                                reportStatus('hint', 'Still listening...');
                            } catch (e) {
                                console.error('[Voice] Restart failed:', e);
                                // Don't stop - might just be already running
                                if (e.message && !e.message.includes('already started')) {
                                    isListening = false;
                                    reportStatus('error', 'Restart failed');
                                    stopVolumeMonitoring();
                                }
                            }
                        }
                    }, 100);
                } else {
                    console.log('[Voice] Max restart attempts reached');
                    reportStatus('hint', 'Tap Finish when done');
                }
            } else {
                stopVolumeMonitoring();
            }
        };

        recognition.onerror = (event) => {
            console.error('[Voice] Recognition error:', event.error, event);
            clearNoSpeechTimeout();
            
            let message = 'Error occurred';
            let shouldStop = true;
            
            switch (event.error) {
                case 'no-speech':
                    message = 'No speech heard - try speaking louder';
                    shouldStop = false;
                    restartAttempts = 0;
                    reportStatus('no-speech', message);
                    // On mobile, restart manually since continuous is off
                    if (!config.continuous && isListening) {
                        setTimeout(() => {
                            if (isListening) {
                                try {
                                    recognition.start();
                                    reportStatus('hint', 'Listening again...');
                                } catch (e) {
                                    console.log('[Voice] Restart after no-speech failed:', e);
                                }
                            }
                        }, 100);
                    }
                    return;
                case 'audio-capture':
                    message = 'Mic error - check permissions';
                    permissionState = 'denied';
                    break;
                case 'not-allowed':
                    message = 'Mic blocked - tap lock icon in browser';
                    permissionState = 'denied';
                    break;
                case 'network':
                    message = 'Need internet for voice recognition';
                    break;
                case 'aborted':
                    console.log('[Voice] Recognition aborted by user');
                    return;
                case 'service-not-allowed':
                    message = 'Voice service blocked - refresh page';
                    permissionState = 'denied';
                    break;
                default:
                    message = 'Error: ' + event.error;
            }
            
            if (shouldStop) {
                reportStatus('error', message);
                isListening = false;
                stopVolumeMonitoring();
            }
        };

        recognition.onresult = (event) => {
            console.log('[Voice] *** GOT RESULT EVENT ***');
            console.log('[Voice] Results count:', event.results.length);
            console.log('[Voice] Result index:', event.resultIndex);
            
            // Log each result
            for (let i = 0; i < event.results.length; i++) {
                const result = event.results[i];
                console.log(`[Voice] Result[${i}]: "${result[0].transcript}" (final: ${result.isFinal}, confidence: ${result[0].confidence})`);
            }
            
            hasReceivedResult = true;
            restartAttempts = 0;
            clearNoSpeechTimeout();
            
            // Immediately show we got something
            const latestText = event.results[event.results.length - 1][0].transcript;
            reportStatus('transcript', latestText);
            
            handleRecognitionResult(event);
        };

        recognition.onsoundstart = () => {
            console.log('[Voice] Sound detected');
            clearNoSpeechTimeout();
            reportStatus('detecting', '🔊 Sound detected...');
        };

        recognition.onspeechstart = () => {
            console.log('[Voice] Speech detected');
            clearNoSpeechTimeout();
            reportStatus('speaking', '🗣️ Voice detected!');
            clearSilenceTimeout();
        };

        recognition.onspeechend = () => {
            console.log('[Voice] Speech ended');
            reportStatus('hint', '⏳ Processing...');
            startSilenceTimeout();
        };
        
        recognition.onaudiostart = () => {
            console.log('[Voice] Audio capture started');
            reportStatus('hint', '🎧 Audio capture active');
        };
        
        recognition.onaudioend = () => {
            console.log('[Voice] Audio capture ended');
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
                console.log('[Voice] FINAL result:', transcript);
            } else {
                interimTranscript += transcript;
                console.log('[Voice] INTERIM result:', transcript);
            }
        }

        // Update interim results for UI - show live transcription
        if (interimTranscript) {
            interimResults = interimTranscript;
            // Show full session transcript + current interim
            const displayText = sessionTranscript + (sessionTranscript ? ' ' : '') + interimTranscript;
            console.log('[Voice] Display (interim):', displayText);
            // Report as transcript type for live display
            reportStatus('transcript', displayText);
        }

        // Process final results - accumulate but DON'T stop listening
        if (finalTranscript) {
            // Add to session transcript
            if (sessionTranscript) {
                sessionTranscript += ' ' + finalTranscript.trim();
            } else {
                sessionTranscript = finalTranscript.trim();
            }
            
            lastTranscript = sessionTranscript;
            interimResults = '';
            
            // Use the language we're listening in as the detected language
            detectedLanguage = currentLanguage === 'ja' ? 'ja' : 'en';
            
            // Check if the text contains the opposite language characters
            const hasJapaneseChars = japaneseRegex.test(sessionTranscript);
            if (currentLanguage === 'en' && hasJapaneseChars) {
                detectedLanguage = 'ja';
            }
            
            const confidence = event.results[event.results.length - 1][0].confidence;
            console.log('[Voice] Session transcript:', sessionTranscript);
            console.log('[Voice] Language:', detectedLanguage, 'Confidence:', confidence);

            // Report the accumulated text (for live display)
            reportStatus('transcript', sessionTranscript);
            
            // NOTE: We do NOT stop listening here anymore!
            // User must click "Finish Talking" button to stop and process
        }
    }
    
    /**
     * Get the full session transcript
     * @returns {string}
     */
    function getSessionTranscript() {
        return sessionTranscript;
    }
    
    /**
     * Finalize and return the transcript, then stop listening
     * Called when user clicks "Finish Talking"
     * @returns {Object} - The final result
     */
    function finishListening() {
        // Try to get text from session transcript, last transcript, OR interim results
        // (user might click finish before speech recognition marked it as "final")
        const finalText = sessionTranscript.trim() || lastTranscript.trim() || interimResults.trim();
        const language = detectedLanguage || (currentLanguage === 'ja' ? 'ja' : 'en');
        
        console.log('[Voice] Finishing listening...');
        console.log('[Voice] - sessionTranscript:', sessionTranscript);
        console.log('[Voice] - lastTranscript:', lastTranscript);
        console.log('[Voice] - interimResults:', interimResults);
        console.log('[Voice] - Final text:', finalText);
        
        // Stop listening
        stopListening();
        
        // Reset for next time
        const result = finalText ? {
            success: true,
            text: finalText,
            language: language,
            confidence: 0.8
        } : {
            success: false,
            text: '',
            language: language,
            error: 'No speech detected'
        };
        
        // Reset state
        sessionTranscript = '';
        lastTranscript = '';
        interimResults = '';
        
        return result;
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
            sessionTranscript = ''; // Reset accumulated transcript
            detectedLanguage = null;
            hasReceivedResult = false;
            restartAttempts = 0;

            console.log('[Voice] Starting recognition...');
            console.log('[Voice] - Language:', recognition.lang);
            console.log('[Voice] - Continuous:', recognition.continuous);
            console.log('[Voice] - InterimResults:', recognition.interimResults);
            
            // Try starting recognition
            try {
                recognition.start();
                console.log('[Voice] recognition.start() called');
                reportStatus('hint', 'Speech engine starting...');
            } catch (startError) {
                console.error('[Voice] recognition.start() error:', startError);
                reportStatus('error', 'Start failed: ' + startError.message);
                return false;
            }
            
            console.log('[Voice] Recognition start initiated');
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
     * Provides waveform data for visualization
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
            analyser.fftSize = 128; // Smaller for more responsive waveform
            analyser.smoothingTimeConstant = 0.5;
            source.connect(analyser);

            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            const numBars = config.waveformBars;

            volumeInterval = setInterval(() => {
                if (!analyser) return;
                
                analyser.getByteFrequencyData(dataArray);
                
                // Calculate average volume
                const sum = dataArray.reduce((a, b) => a + b, 0);
                const avgVolume = Math.min(100, Math.round((sum / bufferLength) / 128 * 100));
                
                // Create waveform data - sample dataArray into numBars values
                const waveformData = [];
                const step = Math.floor(bufferLength / numBars);
                
                for (let i = 0; i < numBars; i++) {
                    const start = i * step;
                    const end = start + step;
                    let barSum = 0;
                    for (let j = start; j < end && j < bufferLength; j++) {
                        barSum += dataArray[j];
                    }
                    // Normalize to 0-100 range with some amplification
                    const barValue = Math.min(100, Math.round((barSum / step) / 180 * 100) * 1.5);
                    waveformData.push(barValue);
                }
                
                if (onVolumeCallback) {
                    onVolumeCallback({
                        volume: avgVolume,
                        waveform: waveformData
                    });
                }
            }, 50); // 20fps for smooth animation

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
        // Send zeroed waveform
        if (onVolumeCallback) {
            onVolumeCallback({
                volume: 0,
                waveform: new Array(config.waveformBars).fill(0)
            });
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
        finishListening,  // New - call this when user clicks "Finish Talking"
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
        getSessionTranscript,  // New - get accumulated transcript
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

