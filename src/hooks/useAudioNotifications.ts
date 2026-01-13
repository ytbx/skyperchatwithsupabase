import { useCallback, useRef } from 'react';

export const useAudioNotifications = () => {
    const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});

    const playSound = useCallback((path: string, volume: number = 0.5) => {
        try {
            if (!audioRefs.current[path]) {
                audioRefs.current[path] = new Audio(path);
            }

            const audio = audioRefs.current[path];
            audio.volume = volume;
            audio.currentTime = 0;
            audio.play().catch(e => console.error(`Error playing sound ${path}:`, e));
        } catch (error) {
            console.error(`Failed to play sound ${path}:`, error);
        }
    }, []);

    const playStreamStarted = useCallback(() => {
        playSound('sounds/openlive.mp3');
    }, [playSound]);

    const playStreamStopped = useCallback(() => {
        playSound('sounds/closedliveend.mp3');
    }, [playSound]);

    const playCallEnded = useCallback(() => {
        playSound('sounds/logout.mp3');
    }, [playSound]);

    return {
        playStreamStarted,
        playStreamStopped,
        playCallEnded
    };
};
