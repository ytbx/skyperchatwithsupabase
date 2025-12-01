import { useEffect, useState, useRef } from 'react';

/**
 * Hook to detect voice activity from an audio stream
 * Returns true when the user is speaking (audio level above threshold)
 */
export function useVoiceActivity(stream: MediaStream | null | undefined, threshold: number = 0.01): boolean {
    const [isSpeaking, setIsSpeaking] = useState(false);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const animationFrameRef = useRef<number>();

    useEffect(() => {
        if (!stream) {
            setIsSpeaking(false);
            return;
        }

        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
            setIsSpeaking(false);
            return;
        }

        try {
            // Create audio context and analyser
            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            const microphone = audioContext.createMediaStreamSource(stream);

            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.8;
            microphone.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const checkAudioLevel = () => {
                if (!analyserRef.current) return;

                analyserRef.current.getByteFrequencyData(dataArray);

                // Calculate average volume
                const average = dataArray.reduce((sum, value) => sum + value, 0) / dataArray.length;
                const normalizedVolume = average / 255;

                setIsSpeaking(normalizedVolume > threshold);

                animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
            };

            checkAudioLevel();

        } catch (error) {
            console.error('[useVoiceActivity] Error setting up audio analysis:', error);
        }

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, [stream, threshold]);

    return isSpeaking;
}
