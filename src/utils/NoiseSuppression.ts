// Noise Suppression Utility
// Uses @jitsi/rnnoise-wasm for AI-based noise suppression

// @ts-ignore
import { createRNNWasmModuleSync } from '@jitsi/rnnoise-wasm';

// Global state for live toggle
let isEnabled = false;
let activeProcessors: Set<{ setEnabled: (enabled: boolean) => void; cleanup: () => void }> = new Set();

// RNNoise operates on 480 samples per frame (10ms at 48kHz)
const FRAME_SIZE = 480;
const SAMPLE_RATE = 48000;
const HIGHPASS_FREQ = 85;

// VAD Settings
const VAD_THRESHOLD = 0.85;
const VAD_RELEASE_MS = 150;

// Singleton for WASM module
let rnnModulePromise: any = null;

async function getRNNModule() {
    if (!rnnModulePromise) {
        rnnModulePromise = createRNNWasmModuleSync();
    }
    return rnnModulePromise;
}

/**
 * Set the global noise suppression enabled state
 */
export function setNoiseSuppressionEnabled(enabled: boolean) {
    if (isEnabled === enabled) return;
    console.log('[NoiseSuppression] Global toggle:', enabled);
    isEnabled = enabled;

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
 */
export async function createNoiseSuppressionProcessor(stream: MediaStream): Promise<{
    outputStream: MediaStream;
    setEnabled: (enabled: boolean) => void;
    cleanup: () => void;
}> {
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
        return { outputStream: stream, setEnabled: () => { }, cleanup: () => { } };
    }

    console.log('[NoiseSuppression] Creating VAD processor...');

    try {
        const rnnModule = await getRNNModule();

        const _rnnoise_create = rnnModule._rnnoise_create;
        const _rnnoise_destroy = rnnModule._rnnoise_destroy;
        const _rnnoise_process_frame = rnnModule._rnnoise_process_frame;
        const _malloc = rnnModule._malloc;
        const _free = rnnModule._free;
        const HEAPF32 = rnnModule.HEAPF32;

        const contextState = _rnnoise_create(null);
        const inputPtr = _malloc(FRAME_SIZE * 4);
        const outputPtr = _malloc(FRAME_SIZE * 4);

        const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });

        // Auto-resume helper
        const ensureContextRunning = async () => {
            if (audioContext.state === 'suspended') {
                await audioContext.resume().catch(e => console.error('Failed to resume context:', e));
            }
        };

        await ensureContextRunning();

        const source = audioContext.createMediaStreamSource(stream);
        const destination = audioContext.createMediaStreamDestination();

        // Highpass Filter
        const highpass = audioContext.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = HIGHPASS_FREQ;
        highpass.Q.value = 0.7;

        // Script Processor
        const scriptNode = audioContext.createScriptProcessor(2048, 1, 1);

        // Circular Buffers
        const BUFFER_MASK = 16383;
        const inputFifo = new Float32Array(16384);
        const outputFifo = new Float32Array(16384);

        let inHead = 0, inTail = 0, outHead = 0, outTail = 0;
        let processorEnabled = isEnabled;
        let hasPrefilled = false;
        const PREFILL_SIZE = 2048;

        // VAD State
        let currentVadGain = isEnabled ? 0.0 : 1.0;
        let framesBelowThreshold = 0;
        const MAX_FRAMES_SILENCE = Math.ceil(VAD_RELEASE_MS / 10);

        scriptNode.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const output = e.outputBuffer.getChannelData(0);

            if (!processorEnabled) {
                output.set(input);
                inHead = 0; inTail = 0; outHead = 0; outTail = 0;
                hasPrefilled = false;
                currentVadGain = 1.0;
                return;
            }

            // Write Input
            for (let i = 0; i < input.length; i++) {
                inputFifo[inHead] = input[i];
                inHead = (inHead + 1) & BUFFER_MASK;
            }

            let availableIn = (inHead - inTail) & BUFFER_MASK;

            while (availableIn >= FRAME_SIZE) {
                for (let i = 0; i < FRAME_SIZE; i++) {
                    const sample = inputFifo[inTail];
                    inTail = (inTail + 1) & BUFFER_MASK;
                    HEAPF32[(inputPtr >> 2) + i] = sample;
                }
                availableIn -= FRAME_SIZE;

                const vadScore = _rnnoise_process_frame(contextState, outputPtr, inputPtr);

                let targetGain = 0.0;
                if (vadScore > VAD_THRESHOLD) {
                    targetGain = 1.0;
                    framesBelowThreshold = 0;
                } else {
                    framesBelowThreshold++;
                    targetGain = (framesBelowThreshold < MAX_FRAMES_SILENCE) ? 1.0 : 0.0;
                }

                for (let i = 0; i < FRAME_SIZE; i++) {
                    currentVadGain = currentVadGain * 0.998 + targetGain * 0.002;
                    const sample = HEAPF32[(outputPtr >> 2) + i];
                    outputFifo[outHead] = sample * currentVadGain;
                    outHead = (outHead + 1) & BUFFER_MASK;
                }
            }

            // Output
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
                let i = 0;
                while (outTail !== outHead && i < output.length) {
                    output[i] = outputFifo[outTail];
                    outTail = (outTail + 1) & BUFFER_MASK;
                    i++;
                }
                while (i < output.length) { output[i] = 0; i++; }
                hasPrefilled = false;
            }
        };

        // Create a silent destination to keep the clock ticking 
        // Some browsers suspend script processors if they don't reach a destination with actual audio hardware
        scriptNode.connect(destination);
        source.connect(highpass);
        highpass.connect(scriptNode);

        const controller = {
            setEnabled: (enabled: boolean) => {
                processorEnabled = enabled;
                ensureContextRunning();
            },
            cleanup: () => {
                activeProcessors.delete(controller);
                try {
                    source.disconnect();
                    highpass.disconnect();
                    scriptNode.disconnect();
                    _free(inputPtr);
                    _free(outputPtr);
                    _rnnoise_destroy(contextState);
                    if (audioContext.state !== 'closed') audioContext.close();
                } catch (e) { }
            }
        };

        activeProcessors.add(controller);
        return {
            outputStream: destination.stream,
            setEnabled: controller.setEnabled,
            cleanup: controller.cleanup
        };

    } catch (error) {
        console.error('[NoiseSuppression] Init failure:', error);
        return { outputStream: stream, setEnabled: () => { }, cleanup: () => { } };
    }
}

/**
 * Helper to wrap a stream if NS is enabled
 */
export async function wrapStreamWithNoiseSuppression(stream: MediaStream): Promise<{
    stream: MediaStream;
    cleanup: () => void;
}> {
    if (!isEnabled) {
        return { stream, cleanup: () => { } };
    }
    const proc = await createNoiseSuppressionProcessor(stream);
    return { stream: proc.outputStream, cleanup: proc.cleanup };
}

export function cleanupNoiseSuppression() {
    activeProcessors.forEach(p => p.cleanup());
    activeProcessors.clear();
}
