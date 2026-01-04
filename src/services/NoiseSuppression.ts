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
            this.audioContext = new AudioContext();
        }

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        const audioContext = this.audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const destination = audioContext.createMediaStreamDestination();

        // 1. High-pass Filter (Native node, zero CPU lag)
        const filter = audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 100; // Increased to 100Hz to remove more low-end noise

        // 2. Gain Node (The Gate)
        const gateNode = audioContext.createGain();
        gateNode.gain.value = 0;

        // 3. Side-chain Analyser (Bigger window to avoid missing signal)
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048; // ~42ms window
        const dataArray = new Float32Array(analyser.fftSize);

        // Connections
        source.connect(filter);
        filter.connect(gateNode);
        gateNode.connect(destination);
        filter.connect(analyser);

        // Gate Logic
        let isGateOpen = false;
        let holdTimer = 0;

        // Refined thresholds for clear distinction
        const openThreshold = 0.025;  // Slightly higher to ignore keyboard far away
        const closeThreshold = 0.015;
        const holdTimeMs = 350;

        const intervalId = setInterval(() => {
            analyser.getFloatTimeDomainData(dataArray);

            // Calculate RMS (Volume) instead of Peak for more stability
            let sumSquare = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sumSquare += dataArray[i] * dataArray[i];
            }
            const rms = Math.sqrt(sumSquare / dataArray.length);

            const now = Date.now();

            if (rms > openThreshold) {
                isGateOpen = true;
                holdTimer = now + holdTimeMs;
            } else if (rms < closeThreshold) {
                if (now > holdTimer && isGateOpen) {
                    isGateOpen = false;
                }
            }

            const targetGain = isGateOpen ? 1.0 : 0.0;
            // setTargetAtTime for click-free automation
            const timeConstant = isGateOpen ? 0.015 : 0.06;
            gateNode.gain.setTargetAtTime(targetGain, audioContext.currentTime, timeConstant);
        }, 15); // Faster check (15ms) with 42ms overlap window = no signal missed

        (destination.stream as any).stopSuppression = () => {
            clearInterval(intervalId);
            try {
                source.disconnect();
                filter.disconnect();
                gateNode.disconnect();
                analyser.disconnect();
            } catch (e) { }
        };

        return destination.stream;
    }
}

export const noiseSuppressionService = NoiseSuppressionService.getInstance();
