/**
 * Camera Module
 * Handles all camera-related functionality including:
 * - Camera initialization and permissions
 * - Front/back camera switching
 * - Video stream management
 * - Frame capture for OCR processing
 */

const CameraModule = (function() {
    'use strict';

    // Private state
    let videoElement = null;
    let canvasElement = null;
    let canvasContext = null;
    let currentStream = null;
    let currentFacingMode = 'environment'; // 'environment' = back, 'user' = front
    let isInitialized = false;
    let onFrameCaptureCallback = null;
    let captureInterval = null;
    let isPaused = false;

    // Configuration
    const config = {
        idealWidth: 1280,
        idealHeight: 720,
        maxWidth: 1920,
        maxHeight: 1080,
        frameRate: 30,
        captureIntervalMs: 2000 // How often to capture frames for OCR
    };

    /**
     * Initialize the camera module
     * @param {HTMLVideoElement} video - Video element to display camera feed
     * @param {HTMLCanvasElement} canvas - Canvas element for frame capture
     * @returns {Promise<boolean>} - Success status
     */
    async function init(video, canvas) {
        if (!video || !canvas) {
            console.error('[Camera] Video or canvas element not provided');
            return false;
        }

        videoElement = video;
        canvasElement = canvas;
        canvasContext = canvas.getContext('2d', { willReadFrequently: true });

        // Check for camera support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('[Camera] getUserMedia not supported');
            return false;
        }

        isInitialized = true;
        console.log('[Camera] Module initialized');
        return true;
    }

    /**
     * Start the camera stream
     * @returns {Promise<boolean>} - Success status
     */
    async function start() {
        if (!isInitialized) {
            console.error('[Camera] Module not initialized');
            return false;
        }

        try {
            // Stop any existing stream
            stop();

            const constraints = {
                video: {
                    facingMode: currentFacingMode,
                    width: { ideal: config.idealWidth, max: config.maxWidth },
                    height: { ideal: config.idealHeight, max: config.maxHeight },
                    frameRate: { ideal: config.frameRate }
                },
                audio: false
            };

            console.log('[Camera] Requesting camera access...');
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            videoElement.srcObject = currentStream;
            
            // Wait for video to be ready
            await new Promise((resolve, reject) => {
                videoElement.onloadedmetadata = () => {
                    videoElement.play()
                        .then(resolve)
                        .catch(reject);
                };
                videoElement.onerror = reject;
            });

            // Update canvas dimensions to match video
            updateCanvasDimensions();

            isPaused = false;
            console.log('[Camera] Camera started successfully');
            return true;

        } catch (error) {
            console.error('[Camera] Failed to start camera:', error);
            handleCameraError(error);
            return false;
        }
    }

    /**
     * Stop the camera stream
     */
    function stop() {
        stopAutomaticCapture();
        
        if (currentStream) {
            currentStream.getTracks().forEach(track => {
                track.stop();
            });
            currentStream = null;
        }

        if (videoElement) {
            videoElement.srcObject = null;
        }

        isPaused = true;
        console.log('[Camera] Camera stopped');
    }

    /**
     * Switch between front and back cameras
     * @returns {Promise<boolean>} - Success status
     */
    async function switchCamera() {
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        console.log('[Camera] Switching to:', currentFacingMode);
        return await start();
    }

    /**
     * Get current facing mode
     * @returns {string} - 'environment' or 'user'
     */
    function getFacingMode() {
        return currentFacingMode;
    }

    /**
     * Capture a single frame from the video
     * @returns {ImageData|null} - Captured frame data
     */
    function captureFrame() {
        if (!videoElement || !canvasContext || isPaused) {
            return null;
        }

        if (videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
            return null;
        }

        try {
            // Draw video frame to canvas
            canvasContext.drawImage(
                videoElement,
                0, 0,
                canvasElement.width,
                canvasElement.height
            );

            // Get image data
            const imageData = canvasContext.getImageData(
                0, 0,
                canvasElement.width,
                canvasElement.height
            );

            return imageData;

        } catch (error) {
            console.error('[Camera] Frame capture failed:', error);
            return null;
        }
    }

    /**
     * Capture frame as data URL (for OCR libraries that prefer this format)
     * @param {number} quality - JPEG quality (0-1)
     * @returns {string|null} - Data URL of captured frame
     */
    function captureFrameAsDataURL(quality = 0.8) {
        if (!videoElement || !canvasContext || isPaused) {
            return null;
        }

        if (videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
            return null;
        }

        try {
            canvasContext.drawImage(
                videoElement,
                0, 0,
                canvasElement.width,
                canvasElement.height
            );

            return canvasElement.toDataURL('image/jpeg', quality);

        } catch (error) {
            console.error('[Camera] Frame capture as URL failed:', error);
            return null;
        }
    }

    /**
     * Capture a specific region of the frame
     * @param {Object} region - {x, y, width, height} relative to video dimensions
     * @returns {string|null} - Data URL of captured region
     */
    function captureRegion(region) {
        if (!videoElement || !canvasContext || isPaused) {
            return null;
        }

        try {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = region.width;
            tempCanvas.height = region.height;
            const tempCtx = tempCanvas.getContext('2d');

            tempCtx.drawImage(
                videoElement,
                region.x, region.y, region.width, region.height,
                0, 0, region.width, region.height
            );

            return tempCanvas.toDataURL('image/jpeg', 0.9);

        } catch (error) {
            console.error('[Camera] Region capture failed:', error);
            return null;
        }
    }

    /**
     * Start automatic frame capture at intervals
     * @param {Function} callback - Function to call with each captured frame
     * @param {number} intervalMs - Interval between captures (optional)
     */
    function startAutomaticCapture(callback, intervalMs = config.captureIntervalMs) {
        if (!callback || typeof callback !== 'function') {
            console.error('[Camera] Invalid callback for automatic capture');
            return;
        }

        stopAutomaticCapture();
        onFrameCaptureCallback = callback;

        captureInterval = setInterval(() => {
            if (!isPaused) {
                const frameData = captureFrameAsDataURL(0.85);
                if (frameData) {
                    onFrameCaptureCallback(frameData);
                }
            }
        }, intervalMs);

        console.log('[Camera] Automatic capture started at', intervalMs, 'ms intervals');
    }

    /**
     * Stop automatic frame capture
     */
    function stopAutomaticCapture() {
        if (captureInterval) {
            clearInterval(captureInterval);
            captureInterval = null;
        }
        onFrameCaptureCallback = null;
        console.log('[Camera] Automatic capture stopped');
    }

    /**
     * Pause/resume the camera (without releasing it)
     * @param {boolean} pause - True to pause, false to resume
     */
    function setPaused(pause) {
        isPaused = pause;
        if (videoElement) {
            if (pause) {
                videoElement.pause();
            } else {
                videoElement.play();
            }
        }
    }

    /**
     * Check if camera is currently active
     * @returns {boolean}
     */
    function isActive() {
        return currentStream !== null && !isPaused;
    }

    /**
     * Update canvas dimensions to match video
     */
    function updateCanvasDimensions() {
        if (videoElement && canvasElement) {
            canvasElement.width = videoElement.videoWidth || config.idealWidth;
            canvasElement.height = videoElement.videoHeight || config.idealHeight;
        }
    }

    /**
     * Handle camera errors with user-friendly messages
     * @param {Error} error
     */
    function handleCameraError(error) {
        let message = 'Camera error occurred';

        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            message = 'Camera permission denied. Please allow camera access and try again.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            message = 'No camera found on this device.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            message = 'Camera is already in use by another application.';
        } else if (error.name === 'OverconstrainedError') {
            message = 'Camera does not support the requested settings.';
        } else if (error.name === 'TypeError') {
            message = 'Invalid camera configuration.';
        }

        // Dispatch custom event for UI to handle
        window.dispatchEvent(new CustomEvent('cameraError', {
            detail: { message, originalError: error }
        }));
    }

    /**
     * Get video dimensions
     * @returns {Object} - {width, height}
     */
    function getVideoDimensions() {
        if (videoElement) {
            return {
                width: videoElement.videoWidth,
                height: videoElement.videoHeight
            };
        }
        return { width: 0, height: 0 };
    }

    /**
     * Apply torch/flashlight if available
     * @param {boolean} enabled
     * @returns {Promise<boolean>}
     */
    async function setTorch(enabled) {
        if (!currentStream) return false;

        try {
            const track = currentStream.getVideoTracks()[0];
            const capabilities = track.getCapabilities();

            if (capabilities.torch) {
                await track.applyConstraints({
                    advanced: [{ torch: enabled }]
                });
                console.log('[Camera] Torch set to:', enabled);
                return true;
            }
        } catch (error) {
            console.warn('[Camera] Torch not supported:', error);
        }
        return false;
    }

    /**
     * Check if torch is available
     * @returns {boolean}
     */
    function hasTorch() {
        if (!currentStream) return false;
        
        try {
            const track = currentStream.getVideoTracks()[0];
            const capabilities = track.getCapabilities();
            return !!capabilities.torch;
        } catch {
            return false;
        }
    }

    // Public API
    return {
        init,
        start,
        stop,
        switchCamera,
        getFacingMode,
        captureFrame,
        captureFrameAsDataURL,
        captureRegion,
        startAutomaticCapture,
        stopAutomaticCapture,
        setPaused,
        isActive,
        getVideoDimensions,
        setTorch,
        hasTorch
    };

})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CameraModule;
}


