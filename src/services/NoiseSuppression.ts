import { createRNNWasmModule } from '@jitsi/rnnoise-wasm';

export class NoiseSuppressionService {
    private static instance: NoiseSuppressionService;
    private rnnoise: any = null;
    private isLoaded = false;
    private loadingPromise: Promise<void> | null = null;
    private audioContext: AudioContext | null = null;

    private constructor() { }

    public static getInstance(): NoiseSuppressionService {
        if (!NoiseSuppressionService.instance) {
            NoiseSuppressionService.instance = new NoiseSuppressionService();
        }
        return NoiseSuppressionService.instance;
    }

    public async load(): Promise<void> {
        if (this.isLoaded) return;
        if (this.loadingPromise) return this.loadingPromise;

        this.loadingPromise = (async () => {
            console.log('[NoiseSuppression] Loading WASM...');
            try {
                this.rnnoise = await createRNNWasmModule();
                this.isLoaded = true;
                console.log('[NoiseSuppression] WASM Loaded successfully');
            } catch (error) {
                console.error('[NoiseSuppression] Failed to load RNNoise WASM:', error);
                this.loadingPromise = null;
                throw error;
            }
        })();

        return this.loadingPromise;
    }

    public async processStream(stream: MediaStream): Promise<MediaStream> {
        await this.load();

        if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = new AudioContext({ sampleRate: 44100 });
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const audioContext = this.audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const destination = audioContext.createMediaStreamDestination();

        const Module = this.rnnoise;
        const rnnState = Module._rnnoise_create(0);

        // Allocate WASM buffers
        const inputPtr = Module._malloc(480 * 4);
        const outputPtr = Module._malloc(480 * 4);
        const inputHeap = new Float32Array(Module.HEAPF32.buffer, inputPtr, 480);
        const outputHeap = new Float32Array(Module.HEAPF32.buffer, outputPtr, 480);

        // Circular Buffer Logic (Stable & Low-Latency)
        const circularSize = 32768;
        const jsInputBuf = new Float32Array(circularSize);
        const jsOutputBuf = new Float32Array(circularSize);
        let inWrite = 0, inRead = 0;
        let outWrite = 0, outRead = 0;

        const bufferSize = 1024;
        const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

        // Gating Parameters
        let frameCount = 0;
        let smoothedVad = 0;

        processor.onaudioprocess = (event) => {
            const input = event.inputBuffer.getChannelData(0);
            const output = event.outputBuffer.getChannelData(0);

            // 1. Push input
            for (let i = 0; i < input.length; i++) {
                jsInputBuf[inWrite] = input[i];
                inWrite = (inWrite + 1) % circularSize;
            }

            // 2. Process available 480-blocks
            let available = (inWrite - inRead + circularSize) % circularSize;
            while (available >= 480) {
                // Prepare frame
                for (let i = 0; i < 480; i++) {
                    inputHeap[i] = jsInputBuf[(inRead + i) % circularSize] * 32768;
                }

                // AI Processing - Extract VAD score (speech probability)
                const vadScore = Module._rnnoise_process_frame(rnnState, outputPtr, inputPtr);

                // Low-pass filter for VAD to avoid sudden cuts
                smoothedVad = smoothedVad * 0.7 + vadScore * 0.3;

                // Push to output with Gating
                // If smoothedVad < 0.1, it's likely noise (keyboard)
                const gateGain = smoothedVad < 0.05 ? 0 : (smoothedVad < 0.15 ? 0.3 : 1.0);

                for (let i = 0; i < 480; i++) {
                    // Re-scale and apply gate + safety gain
                    let sample = (outputHeap[i] / 32768) * 1.2;
                    sample *= gateGain;
                    jsOutputBuf[(outWrite + i) % circularSize] = sample;
                }

                inRead = (inRead + 480) % circularSize;
                outWrite = (outWrite + 480) % circularSize;
                available = (inWrite - inRead + circularSize) % circularSize;
                frameCount++;
            }

            // 3. Output logic - Ensure we never play "empty" buffer
            // We use a fixed 1024 sample delay to be safe
            const outAvailable = (outWrite - outRead + circularSize) % circularSize;
            if (outAvailable >= input.length) {
                for (let i = 0; i < input.length; i++) {
                    output[i] = jsOutputBuf[outRead];
                    outRead = (outRead + 1) % circularSize;
                }
            } else {
                // If we don't have enough yet, output silence or passthrough (here silence to avoid clicks)
                for (let i = 0; i < input.length; i++) output[i] = 0;
            }

            // Debug Heartbeat
            if (frameCount % 1000 === 0) {
                console.log(`[NoiseSuppression] VAD: ${smoothedVad.toFixed(3)}, Buf: ${outAvailable}`);
            }
        };

        source.connect(processor);
        processor.connect(destination);

        const stopSuppression = () => {
            console.log('[NoiseSuppression] Cleaning up');
            try {
                source.disconnect();
                processor.disconnect();
                Module._rnnoise_destroy(rnnState);
                Module._free(inputPtr);
                Module._free(outputPtr);
            } catch (e) {
                console.warn('[NoiseSuppression] Cleanup err:', e);
            }
        };

        (destination.stream as any).stopSuppression = stopSuppression;
        return destination.stream;
    }
}

export const noiseSuppressionService = NoiseSuppressionService.getInstance();
