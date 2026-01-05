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
        
        // Voice mode elements - redesigned
        voiceContainer: document.getElementById('voiceContainer'),
        voiceLangToggle: document.getElementById('voiceLangToggle'),
        langEnBtn: document.getElementById('langEnBtn'),
        langJaBtn: document.getElementById('langJaBtn'),
        voiceMainStatus: document.getElementById('voiceMainStatus'),
        voiceStatusIcon: document.getElementById('voiceStatusIcon'),
        voiceStatusMessage: document.getElementById('voiceStatusMessage'),
        voiceWaveformContainer: document.getElementById('voiceWaveformContainer'),
        waveformBars: document.getElementById('waveformBars'),
        voiceLiveText: document.getElementById('voiceLiveText'),
        liveTranscript: document.getElementById('liveTranscript'),
        voiceConversation: document.getElementById('voiceConversation'),
        youSaidBubble: document.getElementById('youSaidBubble'),
        youSaidText: document.getElementById('youSaidText'),
        translationBubble: document.getElementById('translationBubble'),
        translationText: document.getElementById('translationText'),
        replaySourceBtn: document.getElementById('replaySourceBtn'),
        replayTranslationBtn: document.getElementById('replayTranslationBtn'),
        voiceActionBtn: document.getElementById('voiceActionBtn'),
        debugStatus: document.getElementById('debugStatus'),
        actionBtnIcon: document.getElementById('actionBtnIcon'),
        actionBtnText: document.getElementById('actionBtnText'),
        voicePermissionPrompt: document.getElementById('voicePermissionPrompt'),
        grantMicPermission: document.getElementById('grantMicPermission')
    };

    // ==========================================
    // INITIALIZATION
    // ==========================================

    async function init() {
        console.log('[App] Starting initialization...');
        
        try {
            // Load history from localStorage
            loadHistory();
            
            // Initialize translation module first (can work without camera)
            updateLoadingStatus('Initializing translation service...', 10);
            await TranslationModule.init();
            console.log('[App] Translation module ready');
            
            // Initialize OCR module
            updateLoadingStatus('Loading OCR engine...', 30);
            const ocrReady = await OCRModule.init(handleOCRProgress);
            console.log('[App] OCR module ready:', ocrReady);
            
            if (!ocrReady) {
                showStatus('OCR initialization failed', 'error');
            }
            
            // Initialize voice module
            updateLoadingStatus('Setting up voice recognition...', 70);
            const voiceReady = await initVoiceModule();
            console.log('[App] Voice module ready:', voiceReady);
            
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
            console.log('[App] Initializing camera...');
            const cameraReady = await CameraModule.init(elements.cameraVideo, elements.cameraCanvas);
            console.log('[App] Camera init result:', cameraReady);
            
            if (!cameraReady) {
                console.log('[App] Camera not ready, showing permission screen');
                showPermissionScreen();
                return;
            }
            
            // Try to start camera
            console.log('[App] Starting camera...');
            const cameraStarted = await CameraModule.start();
            console.log('[App] Camera start result:', cameraStarted);
            
            if (!cameraStarted) {
                console.log('[App] Camera failed to start, showing permission screen');
                showPermissionScreen();
                return;
            }
            
            // Setup event listeners
            console.log('[App] Setting up event listeners...');
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
            
        } catch (error) {
            console.error('[App] Initialization error:', error);
            showStatus('Failed to initialize: ' + error.message, 'error');
            // Still try to show the app
            elements.loadingScreen?.classList.add('hidden');
        }
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
        
        // Set up voice callbacks (no result callback - we use finishListening() instead)
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
            updateVoiceStatus('🚫', 'Microphone access denied');
            // Show permission prompt if in voice mode
            if (state.mainMode === 'voice') {
                elements.voicePermissionPrompt?.classList.remove('hidden');
            }
        } else if (permState === 'granted') {
            // Hide permission prompt
            elements.voicePermissionPrompt?.classList.add('hidden');
            updateVoiceStatus('🎤', 'Press button to start');
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
        
        // Voice mode - SINGLE action button
        if (elements.voiceActionBtn) {
            elements.voiceActionBtn.addEventListener('click', handleVoiceActionClick);
        }
        
        // Voice language toggle (EN→JP or JP→EN)
        if (elements.langEnBtn) {
            elements.langEnBtn.addEventListener('click', () => setVoiceLanguage('en'));
        }
        if (elements.langJaBtn) {
            elements.langJaBtn.addEventListener('click', () => setVoiceLanguage('ja'));
        }
        
        // Replay buttons
        if (elements.replaySourceBtn) {
            elements.replaySourceBtn.addEventListener('click', () => speakVoiceSource());
        }
        if (elements.replayTranslationBtn) {
            elements.replayTranslationBtn.addEventListener('click', () => speakVoiceTarget());
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
                updateVoiceStatus('🎤', 'Press button to start');
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
            
            // Initialize voice mode UI
            setVoiceState('idle');
            
            // Reset conversation display
            if (elements.youSaidText) elements.youSaidText.textContent = '-';
            if (elements.translationText) elements.translationText.textContent = '-';
            if (elements.liveTranscript) elements.liveTranscript.textContent = '...';
            
            // Check permission state
            const permState = VoiceModule.getPermissionState();
            if (permState === 'denied') {
                showVoicePermissionPrompt();
                updateVoiceStatus('🚫', 'Microphone access required');
            } else if (permState === 'granted') {
                hideVoicePermissionPrompt();
                updateVoiceStatus('🎤', 'Press button to start');
            } else {
                hideVoicePermissionPrompt();
                updateVoiceStatus('🎤', 'Press button to start');
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
                VoiceModule.stopListening();
                state.isVoiceListening = false;
            }
            
            showStatus('Point camera at Japanese text', 'info');
        }
    }

    // ==========================================
    // VOICE TRANSLATION - Simplified Flow
    // ==========================================
    
    // Voice states: 'idle' | 'listening' | 'processing' | 'speaking'
    
    /**
     * Handle the main voice action button click
     * This is the ONLY button - toggles between start/finish
     */
    async function handleVoiceActionClick() {
        const currentState = elements.voiceActionBtn?.dataset.state || 'idle';
        console.log('[App] Voice action clicked, current state:', currentState);
        
        switch (currentState) {
            case 'idle':
                await startVoiceListening();
                break;
            case 'listening':
                await finishVoiceListening();
                break;
            case 'processing':
            case 'speaking':
                // Ignore clicks while processing or speaking
                break;
        }
    }

    /**
     * Start listening for voice input
     */
    async function startVoiceListening() {
        // Debug
        if (elements.debugStatus) {
            elements.debugStatus.textContent = 'Starting...';
        }
        
        if (!VoiceModule.isSupported()) {
            showToast('Voice not supported in this browser', 'error');
            if (elements.debugStatus) elements.debugStatus.textContent = 'ERROR: Not supported';
            return;
        }
        
        // Hide permission prompt if showing
        hideVoicePermissionPrompt();
        
        // Update UI to show we're starting
        setVoiceState('idle');
        const langLabel = state.voiceLanguage === 'ja' ? 'Japanese' : 'English';
        updateVoiceStatus('🎤', `Starting (${langLabel})...`);
        
        try {
            if (elements.debugStatus) elements.debugStatus.textContent = `Requesting ${langLabel}...`;
            
            const started = await VoiceModule.startListening(state.voiceLanguage);
            if (started) {
                state.isVoiceListening = true;
                setVoiceState('listening');
                updateVoiceStatus('🎙️', `Speak ${langLabel} now!`);
                if (elements.debugStatus) elements.debugStatus.textContent = `ACTIVE: Listening for ${langLabel}`;
                
                // Reset displays
                if (elements.liveTranscript) {
                    elements.liveTranscript.textContent = '(waiting for speech...)';
                }
                if (elements.youSaidText) {
                    elements.youSaidText.textContent = '(listening...)';
                }
            } else {
                // Permission likely denied
                state.isVoiceListening = false;
                setVoiceState('idle');
                const permState = VoiceModule.getPermissionState();
                if (permState === 'denied') {
                    showVoicePermissionPrompt();
                    updateVoiceStatus('🚫', 'Microphone access denied');
                    if (elements.debugStatus) elements.debugStatus.textContent = 'ERROR: Permission denied';
                } else {
                    updateVoiceStatus('❌', 'Could not start - try again');
                    if (elements.debugStatus) elements.debugStatus.textContent = 'ERROR: Start failed';
                }
                showToast('Microphone access required', 'error');
            }
        } catch (error) {
            console.error('[App] Voice start error:', error);
            state.isVoiceListening = false;
            setVoiceState('idle');
            updateVoiceStatus('❌', 'Error - try again');
            if (elements.debugStatus) elements.debugStatus.textContent = 'ERROR: ' + error.message;
            showToast('Failed to start: ' + error.message, 'error');
        }
    }

    /**
     * Finish listening and process the speech
     */
    async function finishVoiceListening() {
        console.log('[App] Finishing voice listening');
        if (elements.debugStatus) elements.debugStatus.textContent = 'Finishing...';
        
        // Get the final transcript before stopping
        const result = VoiceModule.finishListening();
        state.isVoiceListening = false;
        
        console.log('[App] Finish result:', result);
        if (elements.debugStatus) {
            elements.debugStatus.textContent = result.success 
                ? `GOT: "${result.text?.substring(0, 30)}"` 
                : `NO TEXT: ${result.error || 'empty'}`;
        }
        
        if (!result.success || !result.text) {
            setVoiceState('idle');
            updateVoiceStatus('🤔', 'No speech detected - try again');
            showToast('No speech detected', 'info');
            return;
        }
        
        // Update UI to processing state
        setVoiceState('processing');
        updateVoiceStatus('⏳', 'Processing...');
        
        // Show what they said
        if (elements.youSaidText) {
            elements.youSaidText.textContent = result.text;
        }
        
        // Store the source
        state.voiceTranslation = {
            source: result.text,
            sourceLanguage: result.language
        };
        
        // Translate
        try {
            updateVoiceStatus('🔄', 'Translating...');
            
            let translation;
            let targetLang;
            
            if (result.language === 'ja') {
                targetLang = 'en';
                translation = await TranslationModule.translate(result.text);
            } else {
                targetLang = 'ja';
                translation = await translateEnglishToJapanese(result.text);
            }
            
            if (translation.success) {
                state.voiceTranslation.target = translation.translation;
                state.voiceTranslation.targetLanguage = targetLang;
                
                // Show translation
                if (elements.translationText) {
                    elements.translationText.textContent = translation.translation;
                }
                
                // Add to history
                addToHistory({
                    japanese: result.language === 'ja' ? result.text : translation.translation,
                    english: result.language === 'en' ? result.text : translation.translation,
                    timestamp: Date.now(),
                    source: 'voice'
                });
                
                // Speak the translation
                setVoiceState('speaking');
                updateVoiceStatus('🔊', 'Speaking translation...');
                
                try {
                    await VoiceModule.speak(translation.translation, targetLang);
                } catch (speakError) {
                    console.warn('[App] Speech failed:', speakError);
                }
                
                // Done - ready for next
                setVoiceState('idle');
                updateVoiceStatus('✅', 'Done! Tap to speak again');
                
            } else {
                setVoiceState('idle');
                updateVoiceStatus('❌', 'Translation failed - try again');
                if (elements.translationText) {
                    elements.translationText.textContent = 'Translation failed';
                }
            }
            
        } catch (error) {
            console.error('[App] Translation error:', error);
            setVoiceState('idle');
            updateVoiceStatus('❌', 'Error - try again');
            if (elements.translationText) {
                elements.translationText.textContent = 'Error: ' + error.message;
            }
        }
    }

    /**
     * Set the voice UI state
     */
    function setVoiceState(newState) {
        state.voiceState = newState;
        
        const btn = elements.voiceActionBtn;
        if (!btn) return;
        
        btn.dataset.state = newState;
        const isListening = newState === 'listening';
        elements.voiceContainer?.classList.toggle('listening', isListening);
        
        // Debug info
        console.log('[App] Voice state:', newState, '| Container listening class:', isListening);
        
        // Update button text and icon
        const btnText = elements.actionBtnText;
        const btnIcon = elements.actionBtnIcon;
        
        switch (newState) {
            case 'idle':
                if (btnText) btnText.textContent = 'Start Listening';
                if (btnIcon) btnIcon.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>`;
                break;
            case 'listening':
                if (btnText) btnText.textContent = 'Finish Talking';
                if (btnIcon) btnIcon.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                </svg>`;
                break;
            case 'processing':
                if (btnText) btnText.textContent = 'Processing...';
                if (btnIcon) btnIcon.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" class="spin">
                    <path d="M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-7.07l-2.83 2.83M9.76 14.24l-2.83 2.83m12.14 0l-2.83-2.83M9.76 9.76L6.93 6.93"/>
                </svg>`;
                break;
            case 'speaking':
                if (btnText) btnText.textContent = 'Playing...';
                if (btnIcon) btnIcon.innerHTML = `<svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>`;
                break;
        }
    }

    /**
     * Update the voice status display
     */
    function updateVoiceStatus(icon, message) {
        if (elements.voiceStatusIcon) {
            elements.voiceStatusIcon.textContent = icon;
        }
        if (elements.voiceStatusMessage) {
            elements.voiceStatusMessage.textContent = message;
        }
    }

    /**
     * Handle voice status updates from VoiceModule
     */
    function handleVoiceStatus(status) {
        const { type, message } = status;
        console.log('[App] Voice status:', type, message);
        
        // Update debug display for mobile testing
        if (elements.debugStatus) {
            elements.debugStatus.textContent = `${type}: ${message?.substring(0, 40) || ''}`;
        }
        
        switch (type) {
            case 'listening':
                updateVoiceStatus('🎙️', 'Talk now!');
                break;
            case 'detecting':
                updateVoiceStatus('👂', 'Hearing sound...');
                break;
            case 'speaking':
                updateVoiceStatus('🗣️', 'Voice detected!');
                break;
            case 'interim':
            case 'transcript':
                // Update live transcript AND show on screen
                if (elements.liveTranscript) {
                    elements.liveTranscript.textContent = message || '...';
                }
                // Also update the "You Said" box for visibility
                if (elements.youSaidText && message) {
                    elements.youSaidText.textContent = message;
                }
                // Update status to show we're getting text
                if (message) {
                    updateVoiceStatus('📝', message.length > 30 ? message.substring(0, 30) + '...' : message);
                }
                break;
            case 'no-speech':
                updateVoiceStatus('🤔', 'No speech - speak louder!');
                break;
            case 'hint':
                updateVoiceStatus('💡', message);
                break;
            case 'error':
                state.isVoiceListening = false;
                setVoiceState('idle');
                updateVoiceStatus('❌', message);
                showToast(message, 'error');
                break;
        }
    }

    /**
     * Handle voice volume updates for waveform visualization
     */
    function handleVoiceVolume(data) {
        const { volume, waveform } = data;
        
        // Update waveform bars with actual audio data
        const bars = elements.waveformBars?.querySelectorAll('.waveform-bar');
        if (bars && waveform) {
            bars.forEach((bar, index) => {
                if (index < waveform.length) {
                    // Map volume (0-100) to height (8-100px)
                    const height = 8 + (waveform[index] * 0.92);
                    bar.style.height = `${Math.max(8, Math.min(100, height))}px`;
                }
            });
        }
    }

    /**
     * Set voice language
     */
    function setVoiceLanguage(lang) {
        state.voiceLanguage = lang;
        VoiceModule.setLanguage(lang);
        
        // Update language buttons
        elements.langEnBtn?.classList.toggle('active', lang === 'en');
        elements.langJaBtn?.classList.toggle('active', lang === 'ja');
        
        // Show feedback
        const langNames = { en: 'English → Japanese', ja: 'Japanese → English' };
        showToast(`Mode: ${langNames[lang]}`, 'info');
        
        // Reset conversation display
        if (elements.youSaidText) elements.youSaidText.textContent = '-';
        if (elements.translationText) elements.translationText.textContent = '-';
    }

    /**
     * Translate English to Japanese
     */
    async function translateEnglishToJapanese(text) {
        try {
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
     * Speak the source text
     */
    function speakVoiceSource() {
        if (state.voiceTranslation?.source) {
            const lang = state.voiceTranslation.sourceLanguage || 'en';
            VoiceModule.speak(state.voiceTranslation.source, lang);
        }
    }

    /**
     * Speak the translated text
     */
    function speakVoiceTarget() {
        if (state.voiceTranslation?.target) {
            const lang = state.voiceTranslation.targetLanguage || 'ja';
            VoiceModule.speak(state.voiceTranslation.target, lang);
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


