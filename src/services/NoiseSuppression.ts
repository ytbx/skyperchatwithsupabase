export class NoiseSuppressionService {
    private static instance: NoiseSuppressionService;
    private audioContext: AudioContext | null = null;

    private constructor() { }

    public static getInstance(): NoiseSuppressionService {
        if (!NoiseSuppressionService.instance) {
            NoiseSuppressionService.instance = new NoiseSuppressionService();
        }
        return NoiseSuppressionService.instance;
    }

    public async processStream(stream: MediaStream): Promise<MediaStream> {
        if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = new AudioContext({ sampleRate: 44100 });
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const audioContext = this.audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const destination = audioContext.createMediaStreamDestination();

        // 1. High-pass Filter (Remove low-end rumble)
        const filter = audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 100;

        // 2. Smart Gate
        const processor = audioContext.createScriptProcessor(1024, 1, 1);
        let smoothedLevel = 0;
        let currentGain = 0;
        const threshold = 0.012;

        processor.onaudioprocess = (event) => {
            const input = event.inputBuffer.getChannelData(0);
            const output = event.outputBuffer.getChannelData(0);

            let sumSquare = 0;
            for (let i = 0; i < input.length; i++) {
                sumSquare += input[i] * input[i];
            }
            const rms = Math.sqrt(sumSquare / input.length);
            smoothedLevel = smoothedLevel * 0.8 + rms * 0.2;

            const targetGain = smoothedLevel > threshold ? 1.0 : 0.0;

            for (let i = 0; i < input.length; i++) {
                // Slew rate limited gain change to prevent clicks
                if (currentGain < targetGain) {
                    currentGain = Math.min(targetGain, currentGain + 0.04);
                } else if (currentGain > targetGain) {
                    currentGain = Math.max(targetGain, currentGain - 0.01);
                }
                output[i] = input[i] * currentGain;
            }
        };

        source.connect(filter);
        filter.connect(processor);
        processor.connect(destination);

        (destination.stream as any).stopSuppression = () => {
            console.log('[NoiseSuppression] Disconnecting lightweight service');
            try {
                source.disconnect();
                filter.disconnect();
                processor.disconnect();
            } catch (e) { }
        };

        return destination.stream;
    }
}

export const noiseSuppressionService = NoiseSuppressionService.getInstance();
