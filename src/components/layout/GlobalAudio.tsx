import React, { useEffect, useRef } from 'react';
import { useVoiceChannel } from '@/contexts/VoiceChannelContext';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserAudio } from '@/contexts/UserAudioContext';
import { useDeviceSettings } from '@/contexts/DeviceSettingsContext';

export const GlobalAudio: React.FC = () => {
    const { participants: voiceParticipants, isDeafened: isVoiceChannelDeafened } = useVoiceChannel();
    const { remoteStream: callRemoteStream, remoteSoundpadStream: callSoundpadStream, activeCall, isDeafened: isCallDeafened } = useCall();
    const { user } = useAuth();
    const { getEffectiveVoiceVolume, getEffectiveSoundpadVolume, isGlobalMuted } = useUserAudio();
    const { audioOutputDeviceId } = useDeviceSettings();

    // Refs to keep track of audio elements
    const voiceAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
    const soundpadAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
    const callAudioRef = useRef<HTMLAudioElement | null>(null);
    const callSoundpadAudioRef = useRef<HTMLAudioElement | null>(null);  // NEW: Direct call soundpad

    // Get remote user ID from active call
    const getRemoteUserId = (): string | null => {
        if (!activeCall || !user) return null;
        return activeCall.caller_id === user.id ? activeCall.callee_id : activeCall.caller_id;
    };

    // Helper to ensure volume is within safe bounds (0-1) to prevent crashes
    // HTMLMediaElement.volume throws an error if set outside 0-1 range
    const safeVolume = (volume: number): number => {
        if (typeof volume !== 'number' || isNaN(volume)) return 0;
        return Math.min(1.0, Math.max(0.0, volume));
    };

    // Handle Voice Channel Participants Audio (Voice + Soundpad)
    useEffect(() => {
        // Cleanup old refs
        const currentIds = new Set(voiceParticipants.map(p => p.user_id));

        // Cleanup voice audio refs
        for (const [id, audio] of voiceAudioRefs.current.entries()) {
            if (!currentIds.has(id)) {
                audio.srcObject = null;
                voiceAudioRefs.current.delete(id);
            }
        }

        // Cleanup soundpad audio refs
        for (const [id, audio] of soundpadAudioRefs.current.entries()) {
            if (!currentIds.has(id)) {
                audio.srcObject = null;
                soundpadAudioRefs.current.delete(id);
            }
        }

        // Update/Create audio for participants (EXCEPT local user)
        voiceParticipants.forEach(participant => {
            // CRITICAL FIX: Don't play your own audio stream
            if (participant.user_id === user?.id) {
                return;
            }

            // Handle VOICE stream
            if (participant.stream) {
                let audio = voiceAudioRefs.current.get(participant.user_id);

                if (!audio) {
                    audio = new Audio();
                    audio.autoplay = true;
                    voiceAudioRefs.current.set(participant.user_id, audio);
                }

                // Apply VOICE volume from user audio settings
                // Check for voice channel deafen and global mute
                let voiceVolume = 0;
                if (!isVoiceChannelDeafened && !isGlobalMuted) {
                    voiceVolume = getEffectiveVoiceVolume(participant.user_id);
                }
                const safeVoiceVolume = safeVolume(voiceVolume);
                audio.volume = safeVoiceVolume;

                if (audio.srcObject !== participant.stream) {
                    console.log(`[GlobalAudio] Setting VOICE stream for ${participant.user_id} with volume ${safeVoiceVolume}`);
                    audio.srcObject = participant.stream;
                    audio.play().catch(e => console.error('Error playing voice audio:', e));
                }
            }

            // Handle SOUNDPAD stream (separate)
            if (participant.soundpadStream) {
                let audio = soundpadAudioRefs.current.get(participant.user_id);

                if (!audio) {
                    audio = new Audio();
                    audio.autoplay = true;
                    soundpadAudioRefs.current.set(participant.user_id, audio);
                }

                // Apply SOUNDPAD volume from user audio settings
                // Check for voice channel deafen and global mute
                let soundpadVolume = 0;
                if (!isVoiceChannelDeafened && !isGlobalMuted) {
                    soundpadVolume = getEffectiveSoundpadVolume(participant.user_id);
                }
                const safeSoundpadVolume = safeVolume(soundpadVolume);
                audio.volume = safeSoundpadVolume;

                if (audio.srcObject !== participant.soundpadStream) {
                    console.log(`[GlobalAudio] Setting SOUNDPAD stream for ${participant.user_id} with volume ${safeSoundpadVolume}`);
                    audio.srcObject = participant.soundpadStream;
                    audio.play().catch(e => console.error('Error playing soundpad audio:', e));
                }
            }
        });

        // Cleanup on unmount
        return () => {
            // We don't stop tracks here, just clear refs, as context manages streams
        };
    }, [voiceParticipants, user, getEffectiveVoiceVolume, getEffectiveSoundpadVolume, isVoiceChannelDeafened, isGlobalMuted]);

    // Update volumes when they change (separate effect to avoid recreating audio elements)
    useEffect(() => {
        // Update voice volumes
        voiceAudioRefs.current.forEach((audio, participantId) => {
            let effectiveVolume = 0;
            if (!isVoiceChannelDeafened && !isGlobalMuted) {
                effectiveVolume = getEffectiveVoiceVolume(participantId);
            }
            const safeVol = safeVolume(effectiveVolume);
            if (audio.volume !== safeVol) {
                audio.volume = safeVol;
                console.log(`[GlobalAudio] Updated VOICE volume for ${participantId} to ${safeVol}`);
            }
        });

        // Update soundpad volumes
        soundpadAudioRefs.current.forEach((audio, participantId) => {
            let effectiveVolume = 0;
            if (!isVoiceChannelDeafened && !isGlobalMuted) {
                effectiveVolume = getEffectiveSoundpadVolume(participantId);
            }
            const safeVol = safeVolume(effectiveVolume);
            if (audio.volume !== safeVol) {
                audio.volume = safeVol;
                console.log(`[GlobalAudio] Updated SOUNDPAD volume for ${participantId} to ${safeVol}`);
            }
        });
    }, [getEffectiveVoiceVolume, getEffectiveSoundpadVolume, isVoiceChannelDeafened, isGlobalMuted]);

    // Handle Direct Call VOICE Audio - apply user volume settings
    useEffect(() => {
        if (!callAudioRef.current) {
            callAudioRef.current = new Audio();
            callAudioRef.current.autoplay = true;
        }

        const audio = callAudioRef.current;
        const remoteUserId = getRemoteUserId();

        if (callRemoteStream) {
            // Apply volume settings for the remote user
            // Check for call deafen and global mute
            let effectiveVolume = 0;
            if (!isCallDeafened && !isGlobalMuted && remoteUserId) {
                effectiveVolume = getEffectiveVoiceVolume(remoteUserId);
            }
            const safeVol = safeVolume(effectiveVolume);
            audio.volume = safeVol;
            console.log(`[GlobalAudio] Setting direct call VOICE volume to ${safeVol} (deafened: ${isCallDeafened})`);

            if (audio.srcObject !== callRemoteStream) {
                console.log('[GlobalAudio] Setting direct call remote VOICE stream');
                audio.srcObject = callRemoteStream;
                audio.play().catch(e => console.error('Error playing call audio:', e));
            }
        } else {
            if (audio.srcObject) {
                audio.srcObject = null;
            }
        }
    }, [callRemoteStream, activeCall, user, getEffectiveVoiceVolume, isCallDeafened, isGlobalMuted]);

    // Handle Direct Call SOUNDPAD Audio - separate stream with independent volume
    useEffect(() => {
        if (!callSoundpadAudioRef.current) {
            callSoundpadAudioRef.current = new Audio();
            callSoundpadAudioRef.current.autoplay = true;
        }

        const audio = callSoundpadAudioRef.current;
        const remoteUserId = getRemoteUserId();

        if (callSoundpadStream) {
            // Apply SOUNDPAD volume settings for the remote user
            // Check for call deafen and global mute
            let effectiveVolume = 0;
            if (!isCallDeafened && !isGlobalMuted && remoteUserId) {
                effectiveVolume = getEffectiveSoundpadVolume(remoteUserId);
            }
            const safeVol = safeVolume(effectiveVolume);
            audio.volume = safeVol;
            console.log(`[GlobalAudio] Setting direct call SOUNDPAD volume to ${safeVol} (deafened: ${isCallDeafened})`);

            if (audio.srcObject !== callSoundpadStream) {
                console.log('[GlobalAudio] Setting direct call remote SOUNDPAD stream');
                audio.srcObject = callSoundpadStream;
                audio.play().catch(e => console.error('Error playing call soundpad audio:', e));
            }
        } else {
            if (audio.srcObject) {
                audio.srcObject = null;
            }
        }
    }, [callSoundpadStream, activeCall, user, getEffectiveSoundpadVolume, isCallDeafened, isGlobalMuted]);

    // Update direct call volumes when settings change (including deafen state)
    useEffect(() => {
        const remoteUserId = getRemoteUserId();
        if (!remoteUserId) return;

        // Update voice volume
        if (callAudioRef.current && callRemoteStream) {
            let effectiveVolume = 0;
            if (!isCallDeafened && !isGlobalMuted) {
                effectiveVolume = getEffectiveVoiceVolume(remoteUserId);
            }
            const safeVol = safeVolume(effectiveVolume);
            if (callAudioRef.current.volume !== safeVol) {
                callAudioRef.current.volume = safeVol;
                console.log(`[GlobalAudio] Updated direct call VOICE volume to ${safeVol} (deafened: ${isCallDeafened})`);
            }
        }

        // Update soundpad volume
        if (callSoundpadAudioRef.current && callSoundpadStream) {
            let effectiveVolume = 0;
            if (!isCallDeafened && !isGlobalMuted) {
                effectiveVolume = getEffectiveSoundpadVolume(remoteUserId);
            }
            const safeVol = safeVolume(effectiveVolume);
            if (callSoundpadAudioRef.current.volume !== safeVol) {
                callSoundpadAudioRef.current.volume = safeVol;
                console.log(`[GlobalAudio] Updated direct call SOUNDPAD volume to ${safeVol} (deafened: ${isCallDeafened})`);
            }
        }
    }, [getEffectiveVoiceVolume, getEffectiveSoundpadVolume, callRemoteStream, callSoundpadStream, activeCall, user, isCallDeafened, isGlobalMuted]);

    // Handle Output Device Change (sinkId)
    useEffect(() => {
        const sinkId = audioOutputDeviceId === 'default' ? '' : audioOutputDeviceId;
        console.log(`[GlobalAudio] Applying output device change: ${sinkId || 'default'}`);

        const applySinkId = (audio: any) => {
            if (audio && 'setSinkId' in audio) {
                audio.setSinkId(sinkId).catch((e: any) => console.error('[GlobalAudio] Error setting sinkId:', e));
            }
        };

        // Apply to all active audio elements
        voiceAudioRefs.current.forEach(applySinkId);
        soundpadAudioRefs.current.forEach(applySinkId);
        applySinkId(callAudioRef.current);
        applySinkId(callSoundpadAudioRef.current);

    }, [audioOutputDeviceId]);

    return null; // This component does not render anything visual
};
