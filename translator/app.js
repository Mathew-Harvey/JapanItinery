/**
 * Translator App - Main Controller
 * Coordinates Camera, OCR, and Translation modules
 * Manages UI state and user interactions
 */

(function() {
    'use strict';

    // ==========================================
    // STATE MANAGEMENT
    // ==========================================

    const state = {
        isInitialized: false,
        isScanning: false,
        scanMode: 'manual', // 'manual' or 'auto'
        torchEnabled: false,
        isFrontCamera: false,
        translationHistory: [],
        currentTranslation: null,
        historyKey: 'tokyoTranslatorHistory',
        maxHistory: 50,
        // Voice mode state
        mainMode: 'camera', // 'camera' or 'voice'
        voiceLanguage: 'en', // 'ja' or 'en' - language you'll SPEAK
        isVoiceListening: false,
        voiceTranslation: null
    };

    // ==========================================
    // DOM ELEMENTS
    // ==========================================

    const elements = {
        // Screens
        loadingScreen: document.getElementById('loadingScreen'),
        loadingStatus: document.getElementById('loadingStatus'),
        loadingProgress: document.getElementById('loadingProgress'),
        permissionScreen: document.getElementById('permissionScreen'),
        translatorApp: document.getElementById('translatorApp'),
        
        // Camera
        cameraVideo: document.getElementById('cameraVideo'),
        cameraCanvas: document.getElementById('cameraCanvas'),
        viewfinder: document.getElementById('viewfinder'),
        viewfinderFrame: document.getElementById('viewfinderFrame'),
        viewfinderHint: document.getElementById('viewfinderHint'),
        
        // Controls
        backBtn: document.getElementById('backBtn'),
        historyBtn: document.getElementById('historyBtn'),
        torchBtn: document.getElementById('torchBtn'),
        captureBtn: document.getElementById('captureBtn'),
        switchCameraBtn: document.getElementById('switchCameraBtn'),
        galleryBtn: document.getElementById('galleryBtn'),
        manualModeBtn: document.getElementById('manualModeBtn'),
        autoModeBtn: document.getElementById('autoModeBtn'),
        requestPermission: document.getElementById('requestPermission'),
        fileInput: document.getElementById('fileInput'),
        
        // Status
        statusPill: document.getElementById('statusPill'),
        statusIcon: document.getElementById('statusIcon'),
        statusText: document.getElementById('statusText'),
        
        // Translation overlay
        translationOverlay: document.getElementById('translationOverlay'),
        translationDot: document.getElementById('translationDot'),
        providerName: document.getElementById('providerName'),
        detectedText: document.getElementById('detectedText'),
        translatedText: document.getElementById('translatedText'),
        confidenceFill: document.getElementById('confidenceFill'),
        confidenceValue: document.getElementById('confidenceValue'),
        quickPhrases: document.getElementById('quickPhrases'),
        phraseChips: document.getElementById('phraseChips'),
        copyBtn: document.getElementById('copyBtn'),
        speakBtn: document.getElementById('speakBtn'),
        speakOriginalBtn: document.getElementById('speakOriginalBtn'),
        dismissBtn: document.getElementById('dismissBtn'),
        
        // History
        historyOverlay: document.getElementById('historyOverlay'),
        historyPanel: document.getElementById('historyPanel'),
        historyList: document.getElementById('historyList'),
        closeHistory: document.getElementById('closeHistory'),
        
        // Toast
        toast: document.getElementById('toast'),
        toastIcon: document.getElementById('toastIcon'),
        toastText: document.getElementById('toastText'),
        
        // Main mode toggle
        mainModeToggle: document.getElementById('mainModeToggle'),
        cameraModeBtn: document.getElementById('cameraModeBtn'),
        voiceModeBtn: document.getElementById('voiceModeBtn'),
        headerIcon: document.getElementById('headerIcon'),
        headerText: document.getElementById('headerText'),
        
        // Voice mode elements
        voiceContainer: document.getElementById('voiceContainer'),
        voiceOrb: document.getElementById('voiceOrb'),
        orbCore: document.getElementById('orbCore'),
        orbIcon: document.getElementById('orbIcon'),
        voiceWaveform: document.getElementById('voiceWaveform'),
        voiceStatus: document.getElementById('voiceStatus'),
        voiceTranscriptionPanel: document.getElementById('voiceTranscriptionPanel'),
        voiceSourceBubble: document.getElementById('voiceSourceBubble'),
        voiceTargetBubble: document.getElementById('voiceTargetBubble'),
        sourceLangLabel: document.getElementById('sourceLangLabel'),
        targetLangLabel: document.getElementById('targetLangLabel'),
        interimText: document.getElementById('interimText'),
        finalSourceText: document.getElementById('finalSourceText'),
        voiceTargetText: document.getElementById('voiceTargetText'),
        speakSourceBtn: document.getElementById('speakSourceBtn'),
        speakTargetBtn: document.getElementById('speakTargetBtn'),
        voiceLangToggle: document.getElementById('voiceLangToggle'),
        langEnBtn: document.getElementById('langEnBtn'),
        langJaBtn: document.getElementById('langJaBtn'),
        voiceMicBtn: document.getElementById('voiceMicBtn'),
        voicePermissionPrompt: document.getElementById('voicePermissionPrompt'),
        grantMicPermission: document.getElementById('grantMicPermission')
    };

    // ==========================================
    // INITIALIZATION
    // ==========================================

    async function init() {
        console.log('[App] Starting initialization...');
        
        // Load history from localStorage
        loadHistory();
        
        // Initialize translation module first (can work without camera)
        updateLoadingStatus('Initializing translation service...', 10);
        await TranslationModule.init();
        
        // Initialize OCR module
        updateLoadingStatus('Loading OCR engine...', 30);
        const ocrReady = await OCRModule.init(handleOCRProgress);
        
        if (!ocrReady) {
            showStatus('OCR initialization failed', 'error');
        }
        
        // Initialize voice module
        updateLoadingStatus('Setting up voice recognition...', 70);
        const voiceReady = await initVoiceModule();
        if (!voiceReady) {
            console.warn('[App] Voice module not available');
            // Disable voice mode button if not supported
            if (elements.voiceModeBtn) {
                elements.voiceModeBtn.style.opacity = '0.5';
                elements.voiceModeBtn.title = 'Voice not supported in this browser';
            }
        }
        
        // Initialize camera module
        updateLoadingStatus('Setting up camera...', 90);
        const cameraReady = CameraModule.init(elements.cameraVideo, elements.cameraCanvas);
        
        if (!cameraReady) {
            showPermissionScreen();
            return;
        }
        
        // Try to start camera
        const cameraStarted = await CameraModule.start();
        
        if (!cameraStarted) {
            showPermissionScreen();
            return;
        }
        
        // Setup event listeners
        setupEventListeners();
        
        // Update UI
        updateTorchButton();
        
        // Hide loading screen
        updateLoadingStatus('Ready!', 100);
        setTimeout(() => {
            elements.loadingScreen.classList.add('hidden');
            state.isInitialized = true;
            showStatus('Point camera at Japanese text', 'info');
        }, 500);
        
        console.log('[App] Initialization complete');
    }
    
    /**
     * Initialize voice module and set up callbacks
     */
    async function initVoiceModule() {
        if (!VoiceModule.isSupported()) {
            console.warn('[App] Voice recognition not supported');
            return false;
        }
        
        const initialized = await VoiceModule.init();
        if (!initialized) return false;
        
        // Set up voice callbacks
        VoiceModule.setResultCallback(handleVoiceResult);
        VoiceModule.setStatusCallback(handleVoiceStatus);
        VoiceModule.setVolumeCallback(handleVoiceVolume);
        VoiceModule.setPermissionCallback(handleVoicePermission);
        
        return true;
    }
    
    /**
     * Handle voice permission changes
     */
    function handleVoicePermission(permState) {
        console.log('[App] Voice permission state:', permState);
        
        if (permState === 'denied') {
            showToast('Microphone access denied. Please enable in browser settings.', 'error');
            updateVoiceStatusText('Microphone access denied');
            // Show permission prompt if in voice mode
            if (state.mainMode === 'voice') {
                elements.voicePermissionPrompt?.classList.remove('hidden');
            }
        } else if (permState === 'granted') {
            // Hide permission prompt
            elements.voicePermissionPrompt?.classList.add('hidden');
            updateVoiceStatusText('Tap microphone to start');
        }
    }
    
    /**
     * Show voice permission prompt
     */
    function showVoicePermissionPrompt() {
        elements.voicePermissionPrompt?.classList.remove('hidden');
    }
    
    /**
     * Hide voice permission prompt
     */
    function hideVoicePermissionPrompt() {
        elements.voicePermissionPrompt?.classList.add('hidden');
    }

    function handleOCRProgress(progress) {
        const percentage = Math.round(progress.progress);
        updateLoadingStatus(progress.message, 30 + (percentage * 0.6));
    }

    function updateLoadingStatus(message, progress) {
        if (elements.loadingStatus) {
            elements.loadingStatus.textContent = message;
        }
        if (elements.loadingProgress) {
            elements.loadingProgress.style.width = `${progress}%`;
        }
    }

    function showPermissionScreen() {
        elements.loadingScreen.classList.add('hidden');
        elements.permissionScreen.classList.remove('hidden');
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================

    function setupEventListeners() {
        // Back button
        elements.backBtn.addEventListener('click', () => {
            cleanup();
            window.location.href = '../index.html';
        });

        // Permission request
        elements.requestPermission.addEventListener('click', async () => {
            elements.permissionScreen.classList.add('hidden');
            elements.loadingScreen.classList.remove('hidden');
            updateLoadingStatus('Requesting camera access...', 50);
            
            const started = await CameraModule.start();
            if (started) {
                elements.loadingScreen.classList.add('hidden');
                state.isInitialized = true;
                showStatus('Camera ready!', 'success');
            } else {
                showPermissionScreen();
            }
        });

        // Capture button
        elements.captureBtn.addEventListener('click', () => {
            if (state.scanMode === 'manual') {
                captureAndTranslate();
            } else {
                // In auto mode, this toggles scanning
                toggleAutoScan();
            }
        });

        // Switch camera
        elements.switchCameraBtn.addEventListener('click', async () => {
            showStatus('Switching camera...', 'info');
            const switched = await CameraModule.switchCamera();
            if (switched) {
                state.isFrontCamera = CameraModule.getFacingMode() === 'user';
                elements.cameraVideo.classList.toggle('mirror', state.isFrontCamera);
                showStatus(state.isFrontCamera ? 'Front camera' : 'Back camera', 'success');
                updateTorchButton();
            }
        });

        // Torch toggle
        elements.torchBtn.addEventListener('click', async () => {
            state.torchEnabled = !state.torchEnabled;
            const result = await CameraModule.setTorch(state.torchEnabled);
            if (result) {
                elements.torchBtn.classList.toggle('active', state.torchEnabled);
                showStatus(state.torchEnabled ? 'Flashlight on' : 'Flashlight off', 'info');
            } else {
                state.torchEnabled = false;
                showStatus('Flashlight not available', 'error');
            }
        });

        // Mode toggle
        elements.manualModeBtn.addEventListener('click', () => setMode('manual'));
        elements.autoModeBtn.addEventListener('click', () => setMode('auto'));

        // Gallery button
        elements.galleryBtn.addEventListener('click', () => {
            elements.fileInput.click();
        });

        // File input change
        elements.fileInput.addEventListener('change', handleFileSelect);

        // History button
        elements.historyBtn.addEventListener('click', openHistory);
        elements.closeHistory.addEventListener('click', closeHistory);
        elements.historyOverlay.addEventListener('click', closeHistory);

        // Translation overlay actions
        elements.copyBtn.addEventListener('click', copyTranslation);
        elements.speakBtn.addEventListener('click', speakTranslation);
        if (elements.speakOriginalBtn) {
            elements.speakOriginalBtn.addEventListener('click', speakOriginalText);
        }
        elements.dismissBtn.addEventListener('click', dismissTranslation);

        // Camera error handler
        window.addEventListener('cameraError', (e) => {
            showStatus(e.detail.message, 'error');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (elements.historyPanel.classList.contains('open')) {
                    closeHistory();
                } else {
                    dismissTranslation();
                }
            }
            if (e.key === ' ' || e.key === 'Enter') {
                if (state.isInitialized && !state.isScanning) {
                    captureAndTranslate();
                }
            }
        });

        // Handle page visibility
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                CameraModule.setPaused(true);
                if (state.scanMode === 'auto') {
                    stopAutoScan();
                }
                // Stop voice listening when page is hidden
                if (state.isVoiceListening) {
                    stopVoiceListening();
                }
            } else if (state.isInitialized) {
                if (state.mainMode === 'camera') {
                    CameraModule.setPaused(false);
                }
            }
        });
        
        // Main mode toggle (Camera/Voice)
        if (elements.cameraModeBtn) {
            elements.cameraModeBtn.addEventListener('click', () => setMainMode('camera'));
        }
        if (elements.voiceModeBtn) {
            elements.voiceModeBtn.addEventListener('click', () => setMainMode('voice'));
        }
        
        // Voice mode controls
        if (elements.voiceMicBtn) {
            elements.voiceMicBtn.addEventListener('click', toggleVoiceListening);
        }
        
        // Voice language toggle (EN→JP or JP→EN)
        if (elements.langEnBtn) {
            elements.langEnBtn.addEventListener('click', () => setVoiceLanguage('en'));
        }
        if (elements.langJaBtn) {
            elements.langJaBtn.addEventListener('click', () => setVoiceLanguage('ja'));
        }
        
        // Voice speak buttons
        if (elements.speakSourceBtn) {
            elements.speakSourceBtn.addEventListener('click', speakVoiceSource);
        }
        if (elements.speakTargetBtn) {
            elements.speakTargetBtn.addEventListener('click', speakVoiceTarget);
        }
        
        // Voice permission grant button
        if (elements.grantMicPermission) {
            elements.grantMicPermission.addEventListener('click', handleGrantPermission);
        }
    }
    
    /**
     * Handle grant permission button click
     */
    async function handleGrantPermission() {
        try {
            const granted = await VoiceModule.requestPermission();
            if (granted) {
                // Hide permission prompt
                elements.voicePermissionPrompt?.classList.add('hidden');
                showToast('Microphone access granted!', 'success');
                updateVoiceStatusText('Tap microphone to start');
            } else {
                showToast('Microphone access denied. Check browser settings.', 'error');
            }
        } catch (error) {
            console.error('[App] Permission request error:', error);
            showToast('Could not request permission. Try refreshing.', 'error');
        }
    }

    // ==========================================
    // CAPTURE & TRANSLATE
    // ==========================================

    async function captureAndTranslate() {
        if (state.isScanning || !state.isInitialized) return;

        state.isScanning = true;
        elements.captureBtn.classList.add('processing');
        elements.viewfinderFrame.classList.add('scanning');
        showStatus('Scanning...', 'info');

        try {
            // Capture frame
            const frameData = CameraModule.captureFrameAsDataURL(0.9);
            if (!frameData) {
                throw new Error('Failed to capture frame');
            }

            // Process with OCR
            updateViewfinderHint('Detecting text...');
            const ocrResult = await OCRModule.recognize(frameData, {
                enhanceContrast: true,
                grayscale: false
            });

            if (!ocrResult.success || !ocrResult.hasJapanese) {
                showStatus('No Japanese text detected', 'info');
                updateViewfinderHint('No Japanese text found');
                resetScanState();
                return;
            }

            // Get Japanese text
            const japaneseText = ocrResult.japaneseText || ocrResult.text;
            console.log('[App] Detected text:', japaneseText);

            // Translate
            updateViewfinderHint('Translating...');
            showStatus('Translating...', 'info');
            
            const translationResult = await TranslationModule.translate(japaneseText);

            if (translationResult.success) {
                // Show translation
                showTranslation({
                    japanese: japaneseText,
                    english: translationResult.translation,
                    confidence: ocrResult.confidence,
                    provider: translationResult.provider || 'Cache',
                    fromCache: translationResult.fromCache
                });

                // Check for common phrases
                const commonPhrases = TranslationModule.findCommonPhrases(japaneseText);
                if (commonPhrases.length > 0) {
                    showQuickPhrases(commonPhrases);
                }

                // Add to history
                addToHistory({
                    japanese: japaneseText,
                    english: translationResult.translation,
                    timestamp: Date.now()
                });

                showStatus('Translation complete!', 'success');
            } else {
                showStatus('Translation failed: ' + (translationResult.error || 'Unknown error'), 'error');
            }

        } catch (error) {
            console.error('[App] Capture/translate error:', error);
            showStatus('Error: ' + error.message, 'error');
        } finally {
            resetScanState();
        }
    }

    function resetScanState() {
        state.isScanning = false;
        elements.captureBtn.classList.remove('processing');
        elements.viewfinderFrame.classList.remove('scanning');
        updateViewfinderHint('Point at Japanese text');
    }

    // ==========================================
    // AUTO SCAN MODE
    // ==========================================

    function setMode(mode) {
        state.scanMode = mode;
        
        elements.manualModeBtn.classList.toggle('active', mode === 'manual');
        elements.autoModeBtn.classList.toggle('active', mode === 'auto');
        
        if (mode === 'manual') {
            stopAutoScan();
            updateViewfinderHint('Tap button to scan');
        } else {
            updateViewfinderHint('Auto-scanning...');
            startAutoScan();
        }
    }

    function startAutoScan() {
        if (!state.isInitialized) return;
        
        CameraModule.startAutomaticCapture(async (frameData) => {
            if (state.isScanning || state.scanMode !== 'auto') return;
            
            state.isScanning = true;
            elements.viewfinderFrame.classList.add('scanning');
            
            try {
                const ocrResult = await OCRModule.recognize(frameData, {
                    enhanceContrast: true,
                    minConfidence: 50
                });
                
                if (ocrResult.success && ocrResult.hasJapanese) {
                    const japaneseText = ocrResult.japaneseText || ocrResult.text;
                    
                    // Skip if same as last translation
                    if (state.currentTranslation && 
                        state.currentTranslation.japanese === japaneseText) {
                        state.isScanning = false;
                        return;
                    }
                    
                    const translationResult = await TranslationModule.translate(japaneseText);
                    
                    if (translationResult.success) {
                        showTranslation({
                            japanese: japaneseText,
                            english: translationResult.translation,
                            confidence: ocrResult.confidence,
                            provider: translationResult.provider || 'Cache',
                            fromCache: translationResult.fromCache
                        });
                        
                        const commonPhrases = TranslationModule.findCommonPhrases(japaneseText);
                        if (commonPhrases.length > 0) {
                            showQuickPhrases(commonPhrases);
                        }
                        
                        addToHistory({
                            japanese: japaneseText,
                            english: translationResult.translation,
                            timestamp: Date.now()
                        });
                    }
                }
            } catch (error) {
                console.warn('[App] Auto-scan error:', error);
            } finally {
                state.isScanning = false;
                elements.viewfinderFrame.classList.remove('scanning');
            }
        }, 3000); // Scan every 3 seconds
    }

    function stopAutoScan() {
        CameraModule.stopAutomaticCapture();
        elements.viewfinderFrame.classList.remove('scanning');
    }

    function toggleAutoScan() {
        if (state.scanMode === 'auto') {
            // Toggle between scanning and paused
            if (CameraModule.isActive()) {
                stopAutoScan();
                showStatus('Auto-scan paused', 'info');
            } else {
                startAutoScan();
                showStatus('Auto-scan resumed', 'info');
            }
        }
    }

    // ==========================================
    // MAIN MODE SWITCHING (Camera/Voice)
    // ==========================================

    async function setMainMode(mode) {
        if (mode === state.mainMode) return;
        
        state.mainMode = mode;
        console.log('[App] Switching to mode:', mode);
        
        // Update mode buttons
        elements.cameraModeBtn?.classList.toggle('active', mode === 'camera');
        elements.voiceModeBtn?.classList.toggle('active', mode === 'voice');
        
        // Update header
        if (mode === 'voice') {
            if (elements.headerIcon) elements.headerIcon.textContent = '🎙️';
            if (elements.headerText) elements.headerText.textContent = 'Voice';
        } else {
            if (elements.headerIcon) elements.headerIcon.textContent = '📷';
            if (elements.headerText) elements.headerText.textContent = 'Scan';
        }
        
        // Toggle containers
        if (mode === 'voice') {
            // Switch to voice mode
            document.querySelector('.camera-container')?.classList.add('hidden');
            document.querySelector('.control-bar')?.classList.add('hidden');
            elements.voiceContainer?.classList.remove('hidden');
            elements.translatorApp?.classList.add('voice-mode');
            
            // Pause camera to save resources
            CameraModule.setPaused(true);
            stopAutoScan();
            
            // Initialize voice mode UI with proper labels
            const langLabels = {
                en: { source: '🇺🇸 Speak English', target: '🇯🇵 Japanese Translation' },
                ja: { source: '🇯🇵 Speak Japanese', target: '🇺🇸 English Translation' }
            };
            const labels = langLabels[state.voiceLanguage] || langLabels.en;
            
            if (elements.sourceLangLabel) {
                elements.sourceLangLabel.textContent = labels.source;
            }
            if (elements.targetLangLabel) {
                elements.targetLangLabel.textContent = labels.target;
            }
            if (elements.finalSourceText) {
                elements.finalSourceText.textContent = 'Tap the microphone and start speaking...';
            }
            if (elements.voiceTargetText) {
                elements.voiceTargetText.textContent = 'Your translation will appear here';
            }
            
            // Check permission state
            const permState = VoiceModule.getPermissionState();
            if (permState === 'denied') {
                // Show permission prompt
                showVoicePermissionPrompt();
                updateVoiceStatusText('Microphone access required');
            } else if (permState === 'granted') {
                hideVoicePermissionPrompt();
                updateVoiceStatusText('Tap microphone to start speaking');
            } else {
                // Permission unknown/prompt - hide the overlay, will request on mic click
                hideVoicePermissionPrompt();
                updateVoiceStatusText('Tap microphone to start speaking');
            }
        } else {
            // Switch to camera mode
            elements.voiceContainer?.classList.add('hidden');
            document.querySelector('.camera-container')?.classList.remove('hidden');
            document.querySelector('.control-bar')?.classList.remove('hidden');
            elements.translatorApp?.classList.remove('voice-mode');
            
            // Resume camera
            CameraModule.setPaused(false);
            
            // Stop voice if listening
            if (state.isVoiceListening) {
                stopVoiceListening();
            }
            
            showStatus('Point camera at Japanese text', 'info');
        }
    }

    // ==========================================
    // VOICE TRANSLATION
    // ==========================================

    async function toggleVoiceListening() {
        if (state.isVoiceListening) {
            stopVoiceListening();
        } else {
            await startVoiceListening();
        }
    }

    async function startVoiceListening() {
        if (!VoiceModule.isSupported()) {
            showToast('Voice not supported in this browser', 'error');
            return;
        }
        
        // Hide permission prompt if showing
        hideVoicePermissionPrompt();
        
        // Update UI to show we're preparing
        updateVoiceUI(false);
        updateVoiceStatusText('Starting microphone...');
        
        // Reset the source text to show we're ready for new input
        if (elements.finalSourceText) {
            elements.finalSourceText.textContent = 'Listening...';
        }
        if (elements.interimText) {
            elements.interimText.textContent = '';
        }
        
        // Update labels based on current language selection
        const langLabels = {
            en: { source: '🇺🇸 Speak English', target: '🇯🇵 Japanese Translation' },
            ja: { source: '🇯🇵 Speak Japanese', target: '🇺🇸 English Translation' }
        };
        const labels = langLabels[state.voiceLanguage] || langLabels.en;
        if (elements.sourceLangLabel) {
            elements.sourceLangLabel.textContent = labels.source;
        }
        if (elements.targetLangLabel) {
            elements.targetLangLabel.textContent = labels.target;
        }
        
        try {
            const started = await VoiceModule.startListening(state.voiceLanguage);
            if (started) {
                state.isVoiceListening = true;
                updateVoiceUI(true);
                // Status will be updated by the callback
            } else {
                // Permission likely denied
                state.isVoiceListening = false;
                updateVoiceUI(false);
                const permState = VoiceModule.getPermissionState();
                if (permState === 'denied') {
                    showVoicePermissionPrompt();
                    updateVoiceStatusText('Microphone access denied');
                } else {
                    updateVoiceStatusText('Could not start - tap to retry');
                }
                showToast('Microphone access required', 'error');
            }
        } catch (error) {
            console.error('[App] Voice start error:', error);
            state.isVoiceListening = false;
            updateVoiceUI(false);
            updateVoiceStatusText('Error - tap to retry');
            showToast('Failed to start voice: ' + error.message, 'error');
        }
    }

    function stopVoiceListening() {
        console.log('[App] Stopping voice listening');
        VoiceModule.stopListening();
        state.isVoiceListening = false;
        updateVoiceUI(false);
        updateVoiceStatusText('Tap microphone to start');
    }

    async function setVoiceLanguage(lang) {
        state.voiceLanguage = lang;
        VoiceModule.setLanguage(lang);
        
        // Update language buttons
        elements.langEnBtn?.classList.toggle('active', lang === 'en');
        elements.langJaBtn?.classList.toggle('active', lang === 'ja');
        
        // Show feedback with better descriptions
        const langNames = { 
            en: 'English → Japanese', 
            ja: 'Japanese → English' 
        };
        showToast(`Mode: ${langNames[lang]}`, 'info');
        
        // Update source label to show what language to speak
        if (elements.sourceLangLabel) {
            const sourceLabels = {
                en: '🇺🇸 Speak English',
                ja: '🇯🇵 Speak Japanese'
            };
            elements.sourceLangLabel.textContent = sourceLabels[lang];
        }
        
        // Update target label
        if (elements.targetLangLabel) {
            const targetLabels = {
                en: '🇯🇵 Japanese Translation',
                ja: '🇺🇸 English Translation'
            };
            elements.targetLangLabel.textContent = targetLabels[lang];
        }
        
        // Reset the bubbles
        if (elements.finalSourceText) {
            elements.finalSourceText.textContent = 'Tap the microphone and start speaking...';
        }
        if (elements.voiceTargetText) {
            elements.voiceTargetText.textContent = 'Your translation will appear here';
        }
        
        // Restart listening if currently active
        if (state.isVoiceListening) {
            VoiceModule.stopListening();
            state.isVoiceListening = false;
            updateVoiceUI(false);
            setTimeout(async () => {
                await startVoiceListening();
            }, 200);
        }
    }

    /**
     * Handle voice recognition results
     */
    async function handleVoiceResult(result) {
        console.log('[App] Voice result:', result);
        
        const { text, language, confidence } = result;
        
        // Voice module has stopped listening after getting result
        // Update our state to match
        state.isVoiceListening = false;
        updateVoiceUI(false);
        
        // Update source bubble with the recognized text
        if (elements.finalSourceText) {
            elements.finalSourceText.textContent = text;
        }
        if (elements.interimText) {
            elements.interimText.textContent = '';
        }
        
        // Update language label to show what was detected
        const langLabels = { ja: '🇯🇵 Japanese (detected)', en: '🇺🇸 English (detected)', unknown: '🌐 Unknown' };
        if (elements.sourceLangLabel) {
            elements.sourceLangLabel.textContent = langLabels[language] || langLabels.unknown;
        }
        
        // Store current voice translation
        state.voiceTranslation = {
            source: text,
            sourceLanguage: language
        };
        
        // Translate based on detected language
        try {
            updateVoiceStatusText('Translating...');
            
            let translation;
            let targetLang;
            
            if (language === 'ja') {
                // Japanese to English
                targetLang = 'en';
                if (elements.targetLangLabel) {
                    elements.targetLangLabel.textContent = '🇺🇸 English Translation';
                }
                translation = await TranslationModule.translate(text);
            } else {
                // English to Japanese - need reverse translation
                targetLang = 'ja';
                if (elements.targetLangLabel) {
                    elements.targetLangLabel.textContent = '🇯🇵 Japanese Translation';
                }
                // Use a different endpoint for EN->JA
                translation = await translateEnglishToJapanese(text);
            }
            
            if (translation.success) {
                state.voiceTranslation.target = translation.translation;
                state.voiceTranslation.targetLanguage = targetLang;
                
                if (elements.voiceTargetText) {
                    elements.voiceTargetText.textContent = translation.translation;
                }
                
                // Add to history
                addToHistory({
                    japanese: language === 'ja' ? text : translation.translation,
                    english: language === 'en' ? text : translation.translation,
                    timestamp: Date.now(),
                    source: 'voice'
                });
                
                updateVoiceStatusText('✓ Tap mic to speak again');
                showToast('Translation complete!', 'success');
                
                // Auto-speak the translation after a short delay
                setTimeout(() => {
                    if (state.mainMode === 'voice') {
                        VoiceModule.speak(translation.translation, targetLang);
                    }
                }, 500);
                
            } else {
                if (elements.voiceTargetText) {
                    elements.voiceTargetText.textContent = 'Translation failed. Tap mic to try again.';
                }
                updateVoiceStatusText('Translation failed - tap mic to retry');
            }
            
        } catch (error) {
            console.error('[App] Voice translation error:', error);
            if (elements.voiceTargetText) {
                elements.voiceTargetText.textContent = 'Error: ' + error.message;
            }
            updateVoiceStatusText('Error - tap mic to retry');
        }
    }

    /**
     * Translate English to Japanese
     * Uses reverse translation API
     */
    async function translateEnglishToJapanese(text) {
        try {
            // Try MyMemory with reverse direction
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ja`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.responseStatus === 200 && data.responseData) {
                return {
                    success: true,
                    translation: data.responseData.translatedText,
                    provider: 'MyMemory'
                };
            }
            throw new Error(data.responseDetails || 'Translation failed');
        } catch (error) {
            console.error('[App] EN->JA translation error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle voice status updates
     */
    function handleVoiceStatus(status) {
        const { type, message } = status;
        console.log('[App] Voice status:', type, message);
        
        switch (type) {
            case 'requesting':
                updateVoiceStatusText('Requesting microphone access...');
                break;
            case 'listening':
                state.isVoiceListening = true;
                updateVoiceUI(true);
                updateVoiceStatusText(message || 'Listening... Speak now!');
                // Clear any previous interim text
                if (elements.interimText) {
                    elements.interimText.textContent = '';
                }
                break;
            case 'detecting':
                updateVoiceStatusText(message || 'Hearing something...');
                break;
            case 'speaking':
                updateVoiceStatusText(message || 'Listening to you...');
                break;
            case 'processing':
                updateVoiceStatusText(message || 'Processing your speech...');
                break;
            case 'interim':
                // Show live transcription as user speaks
                if (elements.interimText) {
                    elements.interimText.textContent = message;
                }
                // Also update status to show we're actively hearing
                updateVoiceStatusText('Hearing: "' + (message.substring(0, 30) + (message.length > 30 ? '...' : '')) + '"');
                break;
            case 'result':
                updateVoiceStatusText('Got it! Translating...');
                // Clear interim text since we got final result
                if (elements.interimText) {
                    elements.interimText.textContent = '';
                }
                break;
            case 'stopped':
                state.isVoiceListening = false;
                updateVoiceUI(false);
                updateVoiceStatusText('Tap microphone to start');
                break;
            case 'no-speech':
                // Show helpful message but don't stop
                updateVoiceStatusText(message || 'No speech detected. Try speaking louder.');
                showToast('Speak louder or closer to mic', 'info');
                break;
            case 'hint':
                // Helpful hint after waiting
                updateVoiceStatusText(message);
                break;
            case 'info':
                updateVoiceStatusText(message);
                state.isVoiceListening = false;
                updateVoiceUI(false);
                break;
            case 'error':
                state.isVoiceListening = false;
                updateVoiceUI(false);
                updateVoiceStatusText(message);
                showToast(message, 'error');
                break;
        }
    }

    /**
     * Handle voice volume updates for visualization
     */
    function handleVoiceVolume(volume) {
        // Update waveform bars
        const bars = elements.voiceWaveform?.querySelectorAll('.wave-bar');
        if (bars) {
            bars.forEach((bar, index) => {
                const offset = Math.abs(index - 4) * 0.15;
                const height = 8 + (volume * 0.32) * (1 - offset);
                bar.style.height = `${Math.max(8, height)}px`;
            });
        }
    }

    /**
     * Update voice UI state
     */
    function updateVoiceUI(isListening) {
        elements.voiceOrb?.classList.toggle('listening', isListening);
        elements.voiceMicBtn?.classList.toggle('listening', isListening);
        elements.voiceStatus?.classList.toggle('active', isListening);
        elements.voiceContainer?.classList.toggle('listening', isListening);
    }

    /**
     * Update voice status text
     */
    function updateVoiceStatusText(text) {
        const statusEl = elements.voiceStatus?.querySelector('.voice-status-text');
        if (statusEl) {
            statusEl.textContent = text;
        }
    }

    /**
     * Speak the source text
     */
    function speakVoiceSource() {
        if (state.voiceTranslation?.source) {
            const lang = state.voiceTranslation.sourceLanguage || 'ja';
            VoiceModule.speak(state.voiceTranslation.source, lang);
            showToast('Speaking...', 'info');
        }
    }

    /**
     * Speak the translated text
     */
    function speakVoiceTarget() {
        if (state.voiceTranslation?.target) {
            const lang = state.voiceTranslation.targetLanguage || 'en';
            VoiceModule.speak(state.voiceTranslation.target, lang);
            showToast('Speaking...', 'info');
        }
    }

    // ==========================================
    // FILE HANDLING
    // ==========================================

    async function handleFileSelect(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        // Reset input
        e.target.value = '';

        // Validate file
        if (!file.type.startsWith('image/')) {
            showStatus('Please select an image file', 'error');
            return;
        }

        state.isScanning = true;
        showStatus('Processing image...', 'info');

        try {
            // Convert file to data URL
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            // Process with OCR
            const ocrResult = await OCRModule.recognize(dataUrl, {
                enhanceContrast: true
            });

            if (!ocrResult.success || !ocrResult.hasJapanese) {
                showStatus('No Japanese text found in image', 'info');
                state.isScanning = false;
                return;
            }

            const japaneseText = ocrResult.japaneseText || ocrResult.text;
            const translationResult = await TranslationModule.translate(japaneseText);

            if (translationResult.success) {
                showTranslation({
                    japanese: japaneseText,
                    english: translationResult.translation,
                    confidence: ocrResult.confidence,
                    provider: translationResult.provider || 'Cache',
                    fromCache: translationResult.fromCache
                });

                const commonPhrases = TranslationModule.findCommonPhrases(japaneseText);
                if (commonPhrases.length > 0) {
                    showQuickPhrases(commonPhrases);
                }

                addToHistory({
                    japanese: japaneseText,
                    english: translationResult.translation,
                    timestamp: Date.now()
                });

                showStatus('Translation complete!', 'success');
            } else {
                showStatus('Translation failed', 'error');
            }

        } catch (error) {
            console.error('[App] File processing error:', error);
            showStatus('Failed to process image', 'error');
        } finally {
            state.isScanning = false;
        }
    }

    // ==========================================
    // UI UPDATES
    // ==========================================

    function showTranslation(data) {
        state.currentTranslation = data;
        
        elements.detectedText.textContent = data.japanese;
        elements.translatedText.textContent = data.english;
        
        const confidencePercent = Math.round(data.confidence);
        elements.confidenceFill.style.width = `${confidencePercent}%`;
        elements.confidenceValue.textContent = `${confidencePercent}%`;
        
        const statusText = data.fromCache ? 'From cache' : `via ${data.provider}`;
        elements.providerName.textContent = statusText;
        
        elements.translationOverlay.classList.add('visible');
    }

    function showQuickPhrases(phrases) {
        if (!phrases || phrases.length === 0) {
            elements.quickPhrases.style.display = 'none';
            return;
        }

        elements.phraseChips.innerHTML = phrases.map(p => `
            <div class="phrase-chip">
                ${p.japanese} <span class="meaning">(${p.meaning})</span>
            </div>
        `).join('');
        
        elements.quickPhrases.style.display = 'block';
    }

    function dismissTranslation() {
        elements.translationOverlay.classList.remove('visible');
        elements.quickPhrases.style.display = 'none';
        state.currentTranslation = null;
    }

    async function copyTranslation() {
        if (!state.currentTranslation) return;

        const text = `${state.currentTranslation.japanese}\n${state.currentTranslation.english}`;
        
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard!', 'success');
        } catch (error) {
            // Fallback
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('Copied!', 'success');
        }
    }

    function speakTranslation() {
        if (!state.currentTranslation) return;

        if ('speechSynthesis' in window) {
            // Cancel any ongoing speech
            speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(state.currentTranslation.english);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            speechSynthesis.speak(utterance);
            showToast('Speaking English...', 'info');
        } else {
            showToast('Speech not supported', 'error');
        }
    }
    
    /**
     * Speak the original Japanese text
     */
    function speakOriginalText() {
        if (!state.currentTranslation) return;

        if ('speechSynthesis' in window) {
            // Cancel any ongoing speech
            speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(state.currentTranslation.japanese);
            utterance.lang = 'ja-JP';
            utterance.rate = 0.85;
            speechSynthesis.speak(utterance);
            showToast('Speaking Japanese...', 'info');
        } else {
            showToast('Speech not supported', 'error');
        }
    }

    function showStatus(message, type = 'info') {
        const icons = {
            info: 'ℹ️',
            success: '✓',
            error: '⚠️'
        };
        
        elements.statusIcon.textContent = icons[type] || icons.info;
        elements.statusText.textContent = message;
        elements.statusPill.classList.remove('error', 'success');
        
        if (type === 'error') {
            elements.statusPill.classList.add('error');
        } else if (type === 'success') {
            elements.statusPill.classList.add('success');
        }
        
        elements.statusPill.classList.add('visible');
        
        // Auto-hide after delay
        setTimeout(() => {
            elements.statusPill.classList.remove('visible');
        }, 3000);
    }

    function showToast(message, type = 'info') {
        const icons = {
            info: 'ℹ️',
            success: '✓',
            error: '⚠️'
        };
        
        elements.toastIcon.textContent = icons[type] || icons.info;
        elements.toastText.textContent = message;
        elements.toast.classList.remove('success');
        
        if (type === 'success') {
            elements.toast.classList.add('success');
        }
        
        elements.toast.classList.add('visible');
        
        setTimeout(() => {
            elements.toast.classList.remove('visible');
        }, 2000);
    }

    function updateViewfinderHint(text) {
        elements.viewfinderHint.textContent = text;
    }

    function updateTorchButton() {
        const hasTorch = CameraModule.hasTorch();
        elements.torchBtn.disabled = !hasTorch;
        elements.torchBtn.style.opacity = hasTorch ? '1' : '0.3';
    }

    // ==========================================
    // HISTORY MANAGEMENT
    // ==========================================

    function addToHistory(item) {
        // Check for duplicates
        const isDuplicate = state.translationHistory.some(
            h => h.japanese === item.japanese && h.english === item.english
        );
        
        if (!isDuplicate) {
            state.translationHistory.unshift(item);
            
            // Limit history size
            if (state.translationHistory.length > state.maxHistory) {
                state.translationHistory = state.translationHistory.slice(0, state.maxHistory);
            }
            
            saveHistory();
        }
    }

    function loadHistory() {
        try {
            const stored = localStorage.getItem(state.historyKey);
            if (stored) {
                state.translationHistory = JSON.parse(stored);
            }
        } catch (error) {
            console.warn('[App] Failed to load history:', error);
            state.translationHistory = [];
        }
    }

    function saveHistory() {
        try {
            localStorage.setItem(state.historyKey, JSON.stringify(state.translationHistory));
        } catch (error) {
            console.warn('[App] Failed to save history:', error);
        }
    }

    function openHistory() {
        renderHistory();
        elements.historyPanel.classList.add('open');
        elements.historyOverlay.classList.add('visible');
    }

    function closeHistory() {
        elements.historyPanel.classList.remove('open');
        elements.historyOverlay.classList.remove('visible');
    }

    function renderHistory() {
        if (state.translationHistory.length === 0) {
            elements.historyList.innerHTML = `
                <div class="history-empty">
                    <div class="history-empty-icon">📜</div>
                    <p>No translations yet</p>
                    <p style="font-size: 0.8rem; opacity: 0.7;">Scan some Japanese text to get started</p>
                </div>
            `;
            return;
        }

        elements.historyList.innerHTML = state.translationHistory.map((item, index) => `
            <div class="history-item" data-index="${index}">
                <div class="history-japanese">${item.japanese}</div>
                <div class="history-english">${item.english}</div>
                <div class="history-meta">
                    <span>${formatTime(item.timestamp)}</span>
                </div>
            </div>
        `).join('');

        // Add click handlers
        elements.historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                const historyItem = state.translationHistory[index];
                if (historyItem) {
                    showTranslation({
                        japanese: historyItem.japanese,
                        english: historyItem.english,
                        confidence: 100,
                        provider: 'History',
                        fromCache: true
                    });
                    closeHistory();
                }
            });
        });
    }

    function formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return date.toLocaleDateString();
    }

    // ==========================================
    // CLEANUP
    // ==========================================

    function cleanup() {
        stopAutoScan();
        CameraModule.stop();
        OCRModule.terminate();
        if (VoiceModule && typeof VoiceModule.cleanup === 'function') {
            VoiceModule.cleanup();
        }
    }

    // Handle page unload
    window.addEventListener('beforeunload', cleanup);

    // ==========================================
    // START APP
    // ==========================================

    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();


