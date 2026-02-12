export class PCMAudioProcessor {
    private audioContext: AudioContext;
    private destination: MediaStreamAudioDestinationNode;
    private nextStartTime: number = 0;
    private scheduledSources: Set<AudioBufferSourceNode> = new Set();

    constructor() {
        this.audioContext = new AudioContext({ sampleRate: 48000 });
        this.destination = this.audioContext.createMediaStreamDestination();
        this.nextStartTime = this.audioContext.currentTime;
    }

    /**
     * Processes a chunk of raw 16-bit PCM audio data and schedules it for playback.
     * @param chunk Raw Uint8Array containing 16-bit PCM audio data (stereo, interleaved)
     */
    public processChunk(chunk: Uint8Array) {
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }

        // Convert byte array to Int16 array
        const int16Array = new Int16Array(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));

        // Prepare Float32 array for Web Audio API
        const channelCount = 2;
        const frameCount = int16Array.length / channelCount;

        const audioBuffer = this.audioContext.createBuffer(channelCount, frameCount, 48000);
        const leftChannel = audioBuffer.getChannelData(0);
        const rightChannel = audioBuffer.getChannelData(1);

        // De-interleave and convert to float (-1.0 to 1.0)
        for (let i = 0; i < frameCount; i++) {
            leftChannel[i] = int16Array[i * 2] / 32768.0;
            rightChannel[i] = int16Array[i * 2 + 1] / 32768.0;
        }

        // SYNC FIX: 
        // We want to keep audio slightly behind or exactly at "live" to match video latency.
        // If nextStartTime is too far in the future (buffer buildup > 60ms), 
        // it means audio is accumulating too much delay.
        const MAX_BUFFER_OFFSET = 0.035; // 35ms - even tighter for better sync
        const currentTime = this.audioContext.currentTime;
        const drift = this.nextStartTime - currentTime;

        if (drift > MAX_BUFFER_OFFSET) {
            console.warn(`[PCMAudioProcessor] Sync drift detected (${drift.toFixed(3)}s). Clearing buffer to catch up.`);

            // 1. Stop all previously scheduled sources
            this.scheduledSources.forEach(source => {
                try {
                    source.stop();
                } catch (e) { /* ignore */ }
            });
            this.scheduledSources.clear();

            // 2. Reset nextStartTime to jump to the present (plus a tiny safety buffer)
            this.nextStartTime = currentTime + 0.005; // 5ms safety buffer
        }

        // If nextStartTime is in the past (buffer underflow), reset to now
        if (this.nextStartTime < currentTime) {
            this.nextStartTime = currentTime + 0.002; // 2ms lead
        }

        // Create source and connect to destination
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.destination);

        // Track the source
        this.scheduledSources.add(source);
        source.onended = () => {
            this.scheduledSources.delete(source);
        };

        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
    }

    public getStream(): MediaStream {
        return this.destination.stream;
    }

    public close() {
        this.scheduledSources.forEach(s => {
            try { s.stop(); } catch (e) { }
        });
        this.scheduledSources.clear();
        this.audioContext.close();
    }
}
