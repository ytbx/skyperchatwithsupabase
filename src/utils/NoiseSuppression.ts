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
    console.log('[NoiseSuppression] Creating AI processor for stream...');

    try {
        // Initialize RNNoise Module
        // Use sync version which has WASM inlined
        const rnnModule = await createRNNWasmModuleSync();

        // Emscripten API helpers
        const _rnnoise_create = rnnModule._rnnoise_create;
        const _rnnoise_destroy = rnnModule._rnnoise_destroy;
        const _rnnoise_process_frame = rnnModule._rnnoise_process_frame;
        const _malloc = rnnModule._malloc;
        const _free = rnnModule._free;
        const HEAPF32 = rnnModule.HEAPF32;

        // Create RNNoise context
        // Argument null means use the default embedded model
        const contextState = _rnnoise_create(null);

        // Allocate memory for input and output chunks (float arrays)
        // 4 bytes per float
        const inputPtr = _malloc(FRAME_SIZE * 4);
        const outputPtr = _malloc(FRAME_SIZE * 4);

        // Create Audio Context forced to 48kHz for RNNoise compatibility
        const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });

        if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        const source = audioContext.createMediaStreamSource(stream);
        const destination = audioContext.createMediaStreamDestination();

        // Use ScriptProcessorNode (bufferSize, inputChannels, outputChannels)
        // 4096 gives ~85ms latency but is safer for main thread performance
        const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);

        // Circular buffer to handle mismatch between script node buffer size and RNNoise frame size
        const circularBuffer = new Float32Array(8192); // Plenty of space
        let writeIndex = 0;
        let readIndex = 0;
        let bufferCount = 0;

        let processorEnabled = isEnabled;

        scriptNode.onaudioprocess = (audioProcessingEvent) => {
            const inputBuffer = audioProcessingEvent.inputBuffer;
            const outputBuffer = audioProcessingEvent.outputBuffer;
            const inputData = inputBuffer.getChannelData(0);
            const outputData = outputBuffer.getChannelData(0);

            // Bypass if disabled
            if (!processorEnabled) {
                outputData.set(inputData);
                return;
            }

            // Write input to circular buffer
            for (let i = 0; i < inputData.length; i++) {
                circularBuffer[writeIndex] = inputData[i];
                writeIndex = (writeIndex + 1) % circularBuffer.length;
                bufferCount++;
            }

            // Process as many 480-sample frames as possible
            let outputWriteIndex = 0;

            // Using a temporary output buffer for the script processor cycle
            // We fill the script processor's output buffer from our processed results
            // Note: This logic assumes we can process enough data to fill the output. 
            // ScriptProcessor requires synchronously filling outputData. 
            // If we don't have enough data (latency startup), we write zeros.

            // However, complicating this with a read/write pointer for output is tricky.
            // Simplified Ring Buffer Logic:
            // 1. We just process chunks from the circular buffer and write them back to a "processed" circular buffer? 
            //    Or just write directly to outputData?
            //    Problem: inputData.length (e.g. 4096) is not a multiple of 480 (480 * 8 = 3840).
            //    So we will have leftovers.

            // Let's use a simpler approach:
            // Just maintain a persistent buffer of input, process 480 chunks, store in a persistent buffer of output, 
            // and pull from output buffer to fill the current request.

            // Resetting for safety if buffer is strangely huge/small? No, just rely on math.
        };

        // Redefining the processing logic with proper buffering
        // We need:
        // 1. Input FIFO (stores raw samples)
        // 2. Output FIFO (stores processed samples)

        const inputFifo = new Float32Array(16384);
        let inputFifoHead = 0;
        let inputFifoTail = 0;

        const outputFifo = new Float32Array(16384);
        let outputFifoHead = 0;
        let outputFifoTail = 0;

        const pushToFifo = (fifo: Float32Array, headRef: { val: number }, data: Float32Array) => {
            for (let i = 0; i < data.length; i++) {
                fifo[headRef.val] = data[i];
                headRef.val = (headRef.val + 1) % fifo.length;
            }
        };

        const popFromFifo = (fifo: Float32Array, tailRef: { val: number }, length: number, outData: Float32Array | null) => {
            // Check availability? Caller should check.
            for (let i = 0; i < length; i++) {
                const val = fifo[tailRef.val];
                if (outData) outData[i] = val;
                tailRef.val = (tailRef.val + 1) % fifo.length;
            }
        };

        const getFifoCount = (head: number, tail: number, length: number) => {
            if (head >= tail) return head - tail;
            return length - (tail - head);
        };

        // Refs for closure access
        const ptrs = {
            inHead: 0, inTail: 0,
            outHead: 0, outTail: 0
        };

        scriptNode.onaudioprocess = (e) => {
            const input = e.inputBuffer.getChannelData(0);
            const output = e.outputBuffer.getChannelData(0);

            if (!processorEnabled) {
                output.set(input);
                return;
            }

            // 1. Push new audio to Input FIFO
            for (let i = 0; i < input.length; i++) {
                inputFifo[ptrs.inHead] = input[i];
                ptrs.inHead = (ptrs.inHead + 1) % inputFifo.length;
            }

            // 2. Process as many 480 frames as available
            let availableSamples = getFifoCount(ptrs.inHead, ptrs.inTail, inputFifo.length);

            while (availableSamples >= FRAME_SIZE) {
                // Copy 480 samples to WASM input memory
                for (let i = 0; i < FRAME_SIZE; i++) {
                    const sample = inputFifo[ptrs.inTail];
                    ptrs.inTail = (ptrs.inTail + 1) % inputFifo.length;
                    HEAPF32[(inputPtr >> 2) + i] = sample;
                }

                // Call RNNoise
                _rnnoise_process_frame(contextState, outputPtr, inputPtr);

                // Copy 480 samples from WASM output memory to Output FIFO
                for (let i = 0; i < FRAME_SIZE; i++) {
                    const sample = HEAPF32[(outputPtr >> 2) + i];
                    outputFifo[ptrs.outHead] = sample;
                    ptrs.outHead = (ptrs.outHead + 1) % outputFifo.length;
                }

                availableSamples -= FRAME_SIZE;
            }

            // 3. Fill the script processor output buffer from Output FIFO
            // Ensure we have enough data, otherwise pad with silence (latency fill)
            const needed = output.length;
            const availableOutput = getFifoCount(ptrs.outHead, ptrs.outTail, outputFifo.length);

            if (availableOutput >= needed) {
                for (let i = 0; i < needed; i++) {
                    output[i] = outputFifo[ptrs.outTail];
                    ptrs.outTail = (ptrs.outTail + 1) % outputFifo.length;
                }
            } else {
                // Not enough processed data yet (startup latency)
                // Output silence or setup passthrough? Silence is better than glitch.
                // Or just output whatever we have and 0 the rest.
                let i = 0;
                while (ptrs.outTail !== ptrs.outHead && i < needed) {
                    output[i] = outputFifo[ptrs.outTail];
                    ptrs.outTail = (ptrs.outTail + 1) % outputFifo.length;
                    i++;
                }
                while (i < needed) {
                    output[i] = 0;
                    i++;
                }
            }
        };

        source.connect(scriptNode);
        scriptNode.connect(destination);

        // Control object
        const controller = {
            setEnabled: (enabled: boolean) => {
                console.log('[NoiseSuppression] AI Processor enabled:', enabled);
                processorEnabled = enabled;
            }
        };

        activeProcessors.add(controller);
        console.log('[NoiseSuppression] ✓ AI Processor created successfully');

        return {
            outputStream: destination.stream,
            setEnabled: controller.setEnabled,
            cleanup: () => {
                console.log('[NoiseSuppression] Cleaning up AI processor');
                activeProcessors.delete(controller);

                try {
                    source.disconnect();
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
        // Fallback to passthrough if AI fails
        return {
            outputStream: stream,
            setEnabled: () => { },
            cleanup: () => { }
        };
    }
}

/**
 * Cleanup all noise suppression resources
 */
export function cleanupNoiseSuppression() {
    console.log('[NoiseSuppression] Cleaning up all processors');
    activeProcessors.clear();
}

