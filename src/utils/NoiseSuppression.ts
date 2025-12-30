// Noise Suppression Utility
// Uses @jitsi/rnnoise-wasm for AI-based noise suppression

// We need to use 'any' for the module imports since we don't have types for this specific package
// @ts-ignore
import { createRNNWasmModuleSync } from '@jitsi/rnnoise-wasm';

// Global state for live toggle
let isEnabled = false;
let activeProcessors: Set<{ setEnabled: (enabled: boolean) => void }> = new Set();

// RNNoise operates on 480 samples per frame (10ms at 48kHz)
const FRAME_SIZE = 480;
const SAMPLE_RATE = 48000;
const HIGHPASS_FREQ = 85;

// VAD Settings
const VAD_THRESHOLD = 0.85; // Probability threshold for speech
const VAD_RELEASE_MS = 150; // How long to stay open after speech ends
const VAD_SAMPLES_SMOOTH = (SAMPLE_RATE / 1000) * VAD_RELEASE_MS;

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
 * Create a noise suppression processor for a MediaStream
 * Returns a new MediaStream that can be dynamically toggled
 */
export async function createNoiseSuppressionProcessor(stream: MediaStream): Promise<{
    outputStream: MediaStream;
    setEnabled: (enabled: boolean) => void;
    cleanup: () => void;
}> {
    console.log('[NoiseSuppression] Creating VAD-Gated AI processor for stream...');

    try {
        // Initialize RNNoise Module
        const rnnModule = await createRNNWasmModuleSync();

        // Emscripten API helpers
        const _rnnoise_create = rnnModule._rnnoise_create;
        const _rnnoise_destroy = rnnModule._rnnoise_destroy;
        const _rnnoise_process_frame = rnnModule._rnnoise_process_frame;
        const _malloc = rnnModule._malloc;
        const _free = rnnModule._free;
        const HEAPF32 = rnnModule.HEAPF32;

        // Create RNNoise context
        const contextState = _rnnoise_create(null);

        // Allocate memory for input and output chunks
        const inputPtr = _malloc(FRAME_SIZE * 4);
        const outputPtr = _malloc(FRAME_SIZE * 4);

        // Create Audio Context forced to 48kHz
        const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        const source = audioContext.createMediaStreamSource(stream);
        const destination = audioContext.createMediaStreamDestination();

        // 1. Highpass Filter (Remove rumble/thuds before AI processing)
        const highpass = audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = HIGHPASS_FREQ;
        highpass.Q.value = 0.7;

        // 2. Script Processor
        const scriptNode = audioContext.createScriptProcessor(2048, 1, 1);

        // Circular Buffers
        const BUFFER_MASK = 16383; // 16384 size
        const inputFifo = new Float32Array(16384);
        const outputFifo = new Float32Array(16384);

        // Pointers
        let inHead = 0;
        let inTail = 0;
        let outHead = 0;
        let outTail = 0;

        let processorEnabled = isEnabled;

        // Pre-fill state
        let hasPrefilled = false;
        const PREFILL_SIZE = 2048;

        // VAD State
        let currentVadGain = 0.0;
        let framesBelowThreshold = 0;
        const MAX_FRAMES_SILENCE = Math.ceil(VAD_RELEASE_MS / 10); // 10ms per frame

        scriptNode.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const output = e.outputBuffer.getChannelData(0);

            // Bypass Check
            if (!processorEnabled) {
                output.set(input);
                inHead = 0; inTail = 0;
                outHead = 0; outTail = 0;
                hasPrefilled = false;
                currentVadGain = 1.0;
                return;
            }

            // 1. Write Input to Circular Buffer
            for (let i = 0; i < input.length; i++) {
                inputFifo[inHead] = input[i];
                inHead = (inHead + 1) & BUFFER_MASK;
            }

            // 2. Process Data
            let availableIn = (inHead - inTail) & BUFFER_MASK;

            while (availableIn >= FRAME_SIZE) {
                // Copy to WASM
                for (let i = 0; i < FRAME_SIZE; i++) {
                    const sample = inputFifo[inTail];
                    inTail = (inTail + 1) & BUFFER_MASK;
                    HEAPF32[(inputPtr >> 2) + i] = sample;
                }
                availableIn -= FRAME_SIZE;

                // Process (returns VAD score)
                const vadScore = _rnnoise_process_frame(contextState, outputPtr, inputPtr);

                // Determine VAD target gain
                let targetGain = 0.0;
                if (vadScore > VAD_THRESHOLD) {
                    targetGain = 1.0;
                    framesBelowThreshold = 0;
                } else {
                    framesBelowThreshold++;
                    if (framesBelowThreshold < MAX_FRAMES_SILENCE) {
                        targetGain = 1.0; // Hangover: stay open
                    } else {
                        targetGain = 0.0; // Hard close
                    }
                }

                // Copy from WASM AND Apply VAD Smoothing
                for (let i = 0; i < FRAME_SIZE; i++) {
                    // Simple linear smoothing per sample to avoid pops
                    currentVadGain = currentVadGain * 0.998 + targetGain * 0.002;

                    const sample = HEAPF32[(outputPtr >> 2) + i];
                    outputFifo[outHead] = sample * currentVadGain;
                    outHead = (outHead + 1) & BUFFER_MASK;
                }
            }

            // 3. Output Logic
            let availableOut = (outHead - outTail) & BUFFER_MASK;

            if (!hasPrefilled) {
                if (availableOut >= PREFILL_SIZE) {
                    hasPrefilled = true;
                } else {
                    output.fill(0);
                    return;
                }
            }

            if (availableOut >= output.length) {
                for (let i = 0; i < output.length; i++) {
                    output[i] = outputFifo[outTail];
                    outTail = (outTail + 1) & BUFFER_MASK;
                }
            } else {
                // Underrun
                let i = 0;
                while (outTail !== outHead && i < output.length) {
                    output[i] = outputFifo[outTail];
                    outTail = (outTail + 1) & BUFFER_MASK;
                    i++;
                }
                while (i < output.length) {
                    output[i] = 0;
                    i++;
                }
                hasPrefilled = false;
            }
        };

        // Connect graph
        source.connect(highpass);
        highpass.connect(scriptNode);
        scriptNode.connect(destination);

        const controller = {
            setEnabled: (enabled: boolean) => {
                console.log('[NoiseSuppression] VAD Processor enabled:', enabled);
                processorEnabled = enabled;
            }
        };

        activeProcessors.add(controller);
        console.log('[NoiseSuppression] ✓ VAD-Gated Advanced Processor created');

        return {
            outputStream: destination.stream,
            setEnabled: controller.setEnabled,
            cleanup: () => {
                console.log('[NoiseSuppression] Cleaning up AI processor');
                activeProcessors.delete(controller);

                try {
                    source.disconnect();
                    highpass.disconnect();
                    scriptNode.disconnect();
                    _free(inputPtr);
                    _free(outputPtr);
                    _rnnoise_destroy(contextState);
                    if (audioContext.state !== 'closed') {
                        audioContext.close();
                    }
                } catch (e) {
                    console.error('Error cleaning up noise suppression:', e);
                }
            }
        };

    } catch (error) {
        console.error('[NoiseSuppression] Failed to initialize RNNoise:', error);
        return {
            outputStream: stream,
            setEnabled: () => { },
            cleanup: () => { }
        };
    }
}

/**
 * Simple wrapper for one-time stream processing
 */
export async function applyNoiseSuppressionToStream(stream: MediaStream): Promise<MediaStream> {
    const result = await createNoiseSuppressionProcessor(stream);
    return result.outputStream;
}

/**
 * Cleanup all noise suppression resources
 */
export function cleanupNoiseSuppression() {
    activeProcessors.clear();
}
