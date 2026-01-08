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

        // Scheduling logic
        const currentTime = this.audioContext.currentTime;

        // SYNC FIX: 
        // If nextStartTime is too far in the future (buffer buildup > 100ms), 
        // it means we've had stutters and the audio is now lagging behind "live".
        const MAX_BUFFER_OFFSET = 0.1; // 100ms
        const drift = this.nextStartTime - currentTime;

        if (drift > MAX_BUFFER_OFFSET) {
            console.warn(`[PCMAudioProcessor] Sync drift detected (${drift.toFixed(3)}s). Clearing buffer to catch up.`);

            // 1. Stop all previously scheduled sources to clear the backlog in AudioContext
            this.scheduledSources.forEach(source => {
                try {
                    source.stop();
                } catch (e) {
                    // Ignore errors if source already stopped
                }
            });
            this.scheduledSources.clear();

            // 2. Reset nextStartTime to jump to the present
            this.nextStartTime = currentTime;
        }

        // If nextStartTime is in the past (buffer underflow), reset to now
        if (this.nextStartTime < currentTime) {
            this.nextStartTime = currentTime;
        }

        // Create source and connect to destination
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.destination);

        // Track the source so we can cancel it if sync is lost
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
