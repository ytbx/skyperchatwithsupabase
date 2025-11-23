import React, { useEffect, useRef } from 'react';
import { useVoiceChannel } from '@/contexts/VoiceChannelContext';
import { useCall } from '@/contexts/CallContext';

export const GlobalAudio: React.FC = () => {
    const { participants: voiceParticipants } = useVoiceChannel();
    const { remoteStream: callRemoteStream } = useCall();

    // Refs to keep track of audio elements
    const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
    const callAudioRef = useRef<HTMLAudioElement | null>(null);

    // Handle Voice Channel Participants Audio
    useEffect(() => {
        // Cleanup old refs
        const currentIds = new Set(voiceParticipants.map(p => p.user_id));
        for (const [id, audio] of audioRefs.current.entries()) {
            if (!currentIds.has(id)) {
                audio.srcObject = null;
                audioRefs.current.delete(id);
            }
        }

        // Update/Create audio for participants
        voiceParticipants.forEach(participant => {
            if (participant.stream) {
                let audio = audioRefs.current.get(participant.user_id);

                if (!audio) {
                    audio = new Audio();
                    audio.autoplay = true;
                    audioRefs.current.set(participant.user_id, audio);
                }

                if (audio.srcObject !== participant.stream) {
                    console.log(`[GlobalAudio] Setting audio stream for participant ${participant.user_id}`);
                    audio.srcObject = participant.stream;
                    audio.play().catch(e => console.error('Error playing participant audio:', e));
                }
            }
        });

        // Cleanup on unmount
        return () => {
            // We don't stop tracks here, just clear refs, as context manages streams
        };
    }, [voiceParticipants]);

    // Handle Direct Call Audio
    useEffect(() => {
        if (!callAudioRef.current) {
            callAudioRef.current = new Audio();
            callAudioRef.current.autoplay = true;
        }

        const audio = callAudioRef.current;

        if (callRemoteStream) {
            if (audio.srcObject !== callRemoteStream) {
                console.log('[GlobalAudio] Setting direct call remote audio stream');
                audio.srcObject = callRemoteStream;
                audio.play().catch(e => console.error('Error playing call audio:', e));
            }
        } else {
            if (audio.srcObject) {
                audio.srcObject = null;
            }
        }
    }, [callRemoteStream]);

    return null; // This component does not render anything visual
};
