/**
 * OCR Module
 * Handles optical character recognition using Tesseract.js
 * Optimized for Japanese text detection with fallback support
 */

const OCRModule = (function() {
    'use strict';

    // Private state
    let worker = null;
    let isInitialized = false;
    let isProcessing = false;
    let initializationPromise = null;
    let onProgressCallback = null;
    let lastProcessedText = '';
    let processingQueue = [];
    let isQueueProcessing = false;

    // Configuration
    const config = {
        languages: ['jpn', 'jpn_vert', 'eng'], // Japanese horizontal, vertical, and English
        workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core.wasm.js',
        langPath: 'https://tessdata.projectnaptha.com/4.0.0',
        cacheMethod: 'localStorage',
        errorCorrectionLevel: 3,
        preserveInterwordSpaces: true,
        minConfidence: 40 // Minimum confidence threshold (0-100)
    };

    // Japanese character detection regex
    const japaneseRegex = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/;

    /**
     * Initialize the OCR worker
     * @param {Function} progressCallback - Callback for initialization progress
     * @returns {Promise<boolean>} - Success status
     */
    async function init(progressCallback = null) {
        // Return existing promise if already initializing
        if (initializationPromise) {
            return initializationPromise;
        }

        // Return true if already initialized
        if (isInitialized && worker) {
            return true;
        }

        onProgressCallback = progressCallback;

        initializationPromise = new Promise(async (resolve) => {
            try {
                console.log('[OCR] Initializing Tesseract.js...');
                
                reportProgress('loading', 0, 'Loading OCR engine...');

                // Check if Tesseract is available
                if (typeof Tesseract === 'undefined') {
                    console.error('[OCR] Tesseract.js not loaded');
                    reportProgress('error', 0, 'OCR library not loaded');
                    resolve(false);
                    return;
                }

                // Create worker
                worker = await Tesseract.createWorker('jpn+eng', 1, {
                    workerPath: config.workerPath,
                    corePath: config.corePath,
                    langPath: config.langPath,
                    cacheMethod: config.cacheMethod,
                    logger: (m) => {
                        if (m.status === 'loading tesseract core') {
                            reportProgress('loading', m.progress * 30, 'Loading OCR core...');
                        } else if (m.status === 'initializing tesseract') {
                            reportProgress('loading', 30 + m.progress * 20, 'Initializing...');
                        } else if (m.status === 'loading language traineddata') {
                            reportProgress('loading', 50 + m.progress * 40, 'Loading Japanese language data...');
                        } else if (m.status === 'initializing api') {
                            reportProgress('loading', 90 + m.progress * 10, 'Finalizing...');
                        }
                    }
                });

                // Set optimal parameters for Japanese text
                await worker.setParameters({
                    tessedit_pageseg_mode: Tesseract.PSM.AUTO, // Automatic page segmentation
                    preserve_interword_spaces: '1',
                    tessedit_char_blacklist: ''
                });

                isInitialized = true;
                reportProgress('ready', 100, 'OCR ready');
                console.log('[OCR] Initialization complete');
                resolve(true);

            } catch (error) {
                console.error('[OCR] Initialization failed:', error);
                reportProgress('error', 0, 'Failed to initialize OCR');
                resolve(false);
            } finally {
                initializationPromise = null;
            }
        });

        return initializationPromise;
    }

    /**
     * Report progress to callback
     * @param {string} status - Current status
     * @param {number} progress - Progress percentage (0-100)
     * @param {string} message - Human-readable message
     */
    function reportProgress(status, progress, message) {
        if (onProgressCallback && typeof onProgressCallback === 'function') {
            onProgressCallback({ status, progress, message });
        }
    }

    /**
     * Process an image for text recognition
     * @param {string|HTMLImageElement|HTMLCanvasElement|File|Blob} image - Image to process
     * @param {Object} options - Processing options
     * @returns {Promise<Object>} - Recognition results
     */
    async function recognize(image, options = {}) {
        if (!isInitialized || !worker) {
            console.error('[OCR] Worker not initialized');
            return { success: false, error: 'OCR not initialized' };
        }

        if (isProcessing) {
            // Add to queue instead of rejecting
            return new Promise((resolve) => {
                processingQueue.push({ image, options, resolve });
                processQueue();
            });
        }

        isProcessing = true;

        try {
            console.log('[OCR] Starting recognition...');
            const startTime = performance.now();

            // Preprocess image if needed
            const processedImage = await preprocessImage(image, options);

            // Perform recognition
            const result = await worker.recognize(processedImage, {
                rotateAuto: options.rotateAuto !== false
            });

            const endTime = performance.now();
            const processingTime = Math.round(endTime - startTime);

            // Parse and filter results
            const parsedResult = parseResult(result, options);
            parsedResult.processingTime = processingTime;

            console.log('[OCR] Recognition complete in', processingTime, 'ms');
            console.log('[OCR] Text found:', parsedResult.text.substring(0, 100) + '...');

            lastProcessedText = parsedResult.text;
            isProcessing = false;

            // Process next in queue
            processQueue();

            return parsedResult;

        } catch (error) {
            console.error('[OCR] Recognition failed:', error);
            isProcessing = false;
            processQueue();
            return { success: false, error: error.message };
        }
    }

    /**
     * Process the recognition queue
     */
    function processQueue() {
        if (isQueueProcessing || processingQueue.length === 0 || isProcessing) {
            return;
        }

        isQueueProcessing = true;
        const { image, options, resolve } = processingQueue.shift();
        
        recognize(image, options).then((result) => {
            resolve(result);
            isQueueProcessing = false;
            processQueue();
        });
    }

    /**
     * Preprocess image for better OCR results
     * @param {string} imageSource - Image data URL or element
     * @param {Object} options - Preprocessing options
     * @returns {Promise<string>} - Processed image data URL
     */
    async function preprocessImage(imageSource, options = {}) {
        return new Promise((resolve) => {
            // If preprocessing is disabled, return original
            if (options.skipPreprocess) {
                resolve(imageSource);
                return;
            }

            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // Scale down very large images
                let width = img.width;
                let height = img.height;
                const maxDimension = options.maxDimension || 2000;

                if (width > maxDimension || height > maxDimension) {
                    const ratio = Math.min(maxDimension / width, maxDimension / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                canvas.width = width;
                canvas.height = height;

                // Draw image
                ctx.drawImage(img, 0, 0, width, height);

                // Apply preprocessing filters if requested
                if (options.enhanceContrast) {
                    enhanceContrast(ctx, width, height);
                }

                if (options.grayscale) {
                    convertToGrayscale(ctx, width, height);
                }

                if (options.sharpen) {
                    sharpenImage(ctx, width, height);
                }

                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };

            img.onerror = () => {
                console.warn('[OCR] Image preprocessing failed, using original');
                resolve(imageSource);
            };

            img.src = imageSource;
        });
    }

    /**
     * Enhance image contrast
     */
    function enhanceContrast(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const factor = 1.3; // Contrast factor

        for (let i = 0; i < data.length; i += 4) {
            data[i] = clamp(factor * (data[i] - 128) + 128);     // R
            data[i + 1] = clamp(factor * (data[i + 1] - 128) + 128); // G
            data[i + 2] = clamp(factor * (data[i + 2] - 128) + 128); // B
        }

        ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Convert image to grayscale
     */
    function convertToGrayscale(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            data[i] = data[i + 1] = data[i + 2] = gray;
        }

        ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Simple sharpen filter
     */
    function sharpenImage(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const weights = [0, -1, 0, -1, 5, -1, 0, -1, 0]; // Sharpen kernel
        
        const side = Math.round(Math.sqrt(weights.length));
        const halfSide = Math.floor(side / 2);
        const output = ctx.createImageData(width, height);
        const dst = output.data;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const dstOff = (y * width + x) * 4;
                let r = 0, g = 0, b = 0;

                for (let cy = 0; cy < side; cy++) {
                    for (let cx = 0; cx < side; cx++) {
                        const scy = y + cy - halfSide;
                        const scx = x + cx - halfSide;

                        if (scy >= 0 && scy < height && scx >= 0 && scx < width) {
                            const srcOff = (scy * width + scx) * 4;
                            const wt = weights[cy * side + cx];
                            r += data[srcOff] * wt;
                            g += data[srcOff + 1] * wt;
                            b += data[srcOff + 2] * wt;
                        }
                    }
                }

                dst[dstOff] = clamp(r);
                dst[dstOff + 1] = clamp(g);
                dst[dstOff + 2] = clamp(b);
                dst[dstOff + 3] = 255;
            }
        }

        ctx.putImageData(output, 0, 0);
    }

    /**
     * Clamp value to 0-255 range
     */
    function clamp(value) {
        return Math.max(0, Math.min(255, Math.round(value)));
    }

    /**
     * Parse OCR result and extract relevant information
     * @param {Object} result - Raw Tesseract result
     * @param {Object} options - Parsing options
     * @returns {Object} - Parsed result
     */
    function parseResult(result, options = {}) {
        if (!result || !result.data) {
            return {
                success: false,
                text: '',
                confidence: 0,
                hasJapanese: false,
                words: [],
                lines: [],
                blocks: []
            };
        }

        const data = result.data;
        const text = data.text.trim();
        const confidence = data.confidence;
        const hasJapanese = japaneseRegex.test(text);

        // Filter words by confidence
        const minConf = options.minConfidence || config.minConfidence;
        const words = (data.words || [])
            .filter(w => w.confidence >= minConf)
            .map(w => ({
                text: w.text,
                confidence: w.confidence,
                bbox: w.bbox,
                isJapanese: japaneseRegex.test(w.text)
            }));

        // Extract lines
        const lines = (data.lines || [])
            .filter(l => l.confidence >= minConf)
            .map(l => ({
                text: l.text.trim(),
                confidence: l.confidence,
                bbox: l.bbox
            }));

        // Extract blocks (paragraphs)
        const blocks = (data.blocks || [])
            .filter(b => b.confidence >= minConf)
            .map(b => ({
                text: b.text.trim(),
                confidence: b.confidence,
                bbox: b.bbox
            }));

        // Get only Japanese text
        const japaneseText = extractJapaneseText(text);

        return {
            success: text.length > 0,
            text: text,
            japaneseText: japaneseText,
            confidence: confidence,
            hasJapanese: hasJapanese,
            words: words,
            lines: lines,
            blocks: blocks
        };
    }

    /**
     * Extract only Japanese characters from text
     * @param {string} text - Input text
     * @returns {string} - Japanese text only
     */
    function extractJapaneseText(text) {
        if (!text) return '';
        
        // Match Japanese character sequences
        const matches = text.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf\uff00-\uffef]+/g);
        return matches ? matches.join(' ') : '';
    }

    /**
     * Check if text contains Japanese characters
     * @param {string} text - Text to check
     * @returns {boolean}
     */
    function containsJapanese(text) {
        return japaneseRegex.test(text);
    }

    /**
     * Terminate the OCR worker
     */
    async function terminate() {
        if (worker) {
            await worker.terminate();
            worker = null;
        }
        isInitialized = false;
        isProcessing = false;
        processingQueue = [];
        console.log('[OCR] Worker terminated');
    }

    /**
     * Check if OCR is ready
     * @returns {boolean}
     */
    function isReady() {
        return isInitialized && worker !== null;
    }

    /**
     * Check if currently processing
     * @returns {boolean}
     */
    function isBusy() {
        return isProcessing;
    }

    /**
     * Get last processed text
     * @returns {string}
     */
    function getLastText() {
        return lastProcessedText;
    }

    /**
     * Clear the processing queue
     */
    function clearQueue() {
        processingQueue = [];
    }

    // Public API
    return {
        init,
        recognize,
        terminate,
        isReady,
        isBusy,
        getLastText,
        containsJapanese,
        extractJapaneseText,
        clearQueue
    };

})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OCRModule;
}


