// Noise Suppression Utility using RNNoise WASM
// Supports live toggle - can enable/disable during active calls

// @ts-ignore - Using dynamic import to avoid bundler issues
let rnnoiseModule: any = null;

// Global state for live toggle
let isEnabled = false;
let activeProcessors: Set<{ setEnabled: (enabled: boolean) => void }> = new Set();

/**
 * Set the global noise suppression enabled state
 * This will affect all active audio streams
 */
export function setNoiseSuppressionEnabled(enabled: boolean) {
    console.log('[NoiseSuppression] Setting enabled:', enabled);
    isEnabled = enabled;

    // Update all active processors
    activeProcessors.forEach(processor => {
        processor.setEnabled(enabled);
    });
}

/**
 * Get current noise suppression state
 */
export function getNoiseSuppressionEnabled(): boolean {
    return isEnabled;
}

/**
 * Initialize RNNoise module dynamically
 */
async function initRnnoise() {
    if (rnnoiseModule) return rnnoiseModule;

    try {
        // Dynamic import to avoid bundler issues
        rnnoiseModule = await import('@jitsi/rnnoise-wasm');
        console.log('[NoiseSuppression] RNNoise module loaded:', rnnoiseModule);
        return rnnoiseModule;
    } catch (e) {
        console.error('[NoiseSuppression] Failed to load RNNoise:', e);
        return null;
    }
}

/**
 * Create a noise suppression processor for a MediaStream
 * Returns a new MediaStream that can be dynamically toggled
 */
export async function createNoiseSuppressionProcessor(stream: MediaStream): Promise<{
    outputStream: MediaStream;
    setEnabled: (enabled: boolean) => void;
    cleanup: () => void;
}> {
    console.log('[NoiseSuppression] Creating processor for stream...');

    // Create audio context (48kHz for RNNoise)
    const audioContext = new AudioContext({ sampleRate: 48000 });

    // Resume if suspended
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    // Initialize RNNoise module
    const module = await initRnnoise();
    let localRnnoiseProcessor: any = null;

    if (module) {
        try {
            // Try different ways to create the processor
            if (typeof module.default?.create === 'function') {
                localRnnoiseProcessor = await module.default.create();
            } else if (typeof module.create === 'function') {
                localRnnoiseProcessor = await module.create();
            } else if (typeof module.RnnoiseProcessor?.create === 'function') {
                localRnnoiseProcessor = await module.RnnoiseProcessor.create();
            }

            if (localRnnoiseProcessor) {
                console.log('[NoiseSuppression] RNNoise processor created for this stream');
            }
        } catch (e) {
            console.error('[NoiseSuppression] Error creating processor:', e);
        }
    }

    // Create source from input stream
    const source = audioContext.createMediaStreamSource(stream);

    // Create destination for processed audio
    const destination = audioContext.createMediaStreamDestination();

    // Create ScriptProcessorNode for RNNoise processing
    // 480 samples = 10ms at 48kHz (RNNoise frame size)
    const bufferSize = 480;
    const scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);

    // Local enabled state for this processor
    let processorEnabled = isEnabled; // Start with global state

    scriptProcessor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const outputData = event.outputBuffer.getChannelData(0);

        // If disabled or no RNNoise, pass through original audio
        if (!processorEnabled || !localRnnoiseProcessor) {
            outputData.set(inputData);
            return;
        }

        // RNNoise expects 480 samples (10ms at 48kHz)
        if (inputData.length === 480) {
            try {
                // Create Float32Array for processing
                const inputFrame = new Float32Array(480);
                inputFrame.set(inputData);

                // Process with RNNoise - this modifies inputFrame in-place
                const vadProb = localRnnoiseProcessor.processFrame(inputFrame);

                // Copy processed data to output
                outputData.set(inputFrame);

                // Apply soft gate based on VAD probability for extra noise reduction
                if (vadProb < 0.2) {
                    // Very likely noise, reduce volume significantly
                    for (let i = 0; i < outputData.length; i++) {
                        outputData[i] *= vadProb * 2;
                    }
                }
            } catch (e) {
                // On error, pass through original audio
                outputData.set(inputData);
            }
        } else {
            // Pass through if buffer size doesn't match
            for (let i = 0; i < outputData.length && i < inputData.length; i++) {
                outputData[i] = inputData[i];
            }
        }
    };

    // Connect the audio graph
    source.connect(scriptProcessor);
    scriptProcessor.connect(destination);

    // Keep a reference to prevent garbage collection
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    scriptProcessor.connect(silentGain);
    silentGain.connect(audioContext.destination);

    // Create control object
    const controller = {
        setEnabled: (enabled: boolean) => {
            console.log('[NoiseSuppression] Processor enabled:', enabled);
            processorEnabled = enabled;
        }
    };

    // Register this processor
    activeProcessors.add(controller);

    console.log('[NoiseSuppression] ✓ Processor created and registered');

    return {
        outputStream: destination.stream,
        setEnabled: controller.setEnabled,
        cleanup: () => {
            console.log('[NoiseSuppression] Cleaning up processor');

            // Unregister
            activeProcessors.delete(controller);

            // Disconnect audio nodes
            try {
                source.disconnect();
                scriptProcessor.disconnect();
                silentGain.disconnect();
            } catch (e) {
                // Ignore disconnect errors
            }

            // Destroy RNNoise processor
            if (localRnnoiseProcessor) {
                try {
                    localRnnoiseProcessor.destroy();
                } catch (e) {
                    // Ignore
                }
            }

            // Close audio context
            if (audioContext.state !== 'closed') {
                try {
                    audioContext.close();
                } catch (e) {
                    // Ignore
                }
            }
        }
    };
}

/**
 * Simple wrapper for one-time stream processing (legacy support)
 * Note: For live toggle support, use createNoiseSuppressionProcessor instead
 */
export async function applyNoiseSuppressionToStream(stream: MediaStream): Promise<MediaStream> {
    const result = await createNoiseSuppressionProcessor(stream);
    return result.outputStream;
}

/**
 * Cleanup all noise suppression resources
 */
export function cleanupNoiseSuppression() {
    console.log('[NoiseSuppression] Cleaning up all processors');
    activeProcessors.clear();
}
