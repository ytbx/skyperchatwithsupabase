import { useEffect, RefObject } from 'react';
import { useDeviceSettings } from '@/contexts/DeviceSettingsContext';

/**
 * Hook to automatically apply audio output device (sinkId) to a media element
 * @param mediaRef Ref to the HTMLAudioElement or HTMLVideoElement
 */
export function useAudioSink(mediaRef: RefObject<HTMLAudioElement | HTMLVideoElement | null>) {
    const { audioOutputDeviceId } = useDeviceSettings();

    useEffect(() => {
        const element = mediaRef.current;
        if (!element) return;

        // Check if setSinkId is supported (Chrome/Edge/Electron)
        if ('setSinkId' in element) {
            const sinkId = audioOutputDeviceId === 'default' ? '' : audioOutputDeviceId;

            (element as any).setSinkId(sinkId)
                .then(() => {
                    console.log(`[useAudioSink] Successfully set sinkId to: ${sinkId || 'default'}`);
                })
                .catch((error: any) => {
                    console.error('[useAudioSink] Error setting sinkId:', error);
                });
        } else {
            console.warn('[useAudioSink] setSinkId is not supported in this browser');
        }
    }, [audioOutputDeviceId, mediaRef.current]);
}
