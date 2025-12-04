import { useRef, useCallback } from 'react';

/**
 * Hook to handle soundboard audio mixing with microphone for WebRTC transmission
 */
export function useSoundboardAudio() {
    const audioContextRef = useRef<AudioContext | null>(null);
    const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const soundGainRef = useRef<GainNode | null>(null);
    const micGainRef = useRef<GainNode | null>(null);

    /**
     * Initialize or get the audio context and destination
     */
    const getAudioContext = useCallback(() => {
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new AudioContext();
        }
        return audioContextRef.current;
    }, []);

    /**
     * Setup the audio mixing pipeline with microphone
     * Returns a new MediaStream that contains both mic and soundboard audio
     */
    const setupMixedStream = useCallback((micStream: MediaStream): MediaStream => {
        const ctx = getAudioContext();

        // Create destination (this creates a MediaStream we can use for WebRTC)
        destinationRef.current = ctx.createMediaStreamDestination();

        // Create gain nodes for volume control
        soundGainRef.current = ctx.createGain();
        soundGainRef.current.gain.value = 1.0;
        soundGainRef.current.connect(destinationRef.current);

        micGainRef.current = ctx.createGain();
        micGainRef.current.gain.value = 1.0;
        micGainRef.current.connect(destinationRef.current);

        // Connect microphone to the mixer
        micSourceRef.current = ctx.createMediaStreamSource(micStream);
        micSourceRef.current.connect(micGainRef.current);

        console.log('[useSoundboardAudio] Mixed stream setup complete');
        return destinationRef.current.stream;
    }, [getAudioContext]);

    /**
     * Play a sound through both local speakers and mix into the WebRTC stream
     */
    const playSound = useCallback(async (audioBuffer: AudioBuffer) => {
        const ctx = getAudioContext();

        console.log('[useSoundboardAudio] Playing sound, duration:', audioBuffer.duration, 's');

        // Play locally through speakers
        const localSource = ctx.createBufferSource();
        localSource.buffer = audioBuffer;
        localSource.connect(ctx.destination);
        localSource.start();

        // Also send through the mixed stream (if setup)
        if (destinationRef.current && soundGainRef.current) {
            const mixSource = ctx.createBufferSource();
            mixSource.buffer = audioBuffer;
            mixSource.connect(soundGainRef.current);
            mixSource.start();
            console.log('[useSoundboardAudio] Sound mixed into WebRTC stream');
        } else {
            console.log('[useSoundboardAudio] No mixed stream destination, playing locally only');
        }
    }, [getAudioContext]);

    /**
     * Set the microphone mute state
     */
    const setMicMuted = useCallback((muted: boolean) => {
        if (micGainRef.current) {
            micGainRef.current.gain.value = muted ? 0 : 1.0;
        }
    }, []);

    /**
     * Set the soundboard volume
     */
    const setSoundVolume = useCallback((volume: number) => {
        if (soundGainRef.current) {
            soundGainRef.current.gain.value = volume;
        }
    }, []);

    /**
     * Get the current audio context (for passing to SoundPanel)
     */
    const getContext = useCallback(() => {
        return audioContextRef.current;
    }, []);

    /**
     * Cleanup all audio resources
     */
    const cleanup = useCallback(() => {
        if (micSourceRef.current) {
            micSourceRef.current.disconnect();
            micSourceRef.current = null;
        }
        if (soundGainRef.current) {
            soundGainRef.current.disconnect();
            soundGainRef.current = null;
        }
        if (micGainRef.current) {
            micGainRef.current.disconnect();
            micGainRef.current = null;
        }
        if (destinationRef.current) {
            destinationRef.current = null;
        }
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        console.log('[useSoundboardAudio] Cleanup complete');
    }, []);

    return {
        setupMixedStream,
        playSound,
        setMicMuted,
        setSoundVolume,
        getContext,
        cleanup
    };
}
