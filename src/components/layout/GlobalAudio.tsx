import React, { useEffect, useRef } from 'react';
import { useVoiceChannel } from '@/contexts/VoiceChannelContext';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { useUserAudio } from '@/contexts/UserAudioContext';
import { useDeviceSettings } from '@/contexts/DeviceSettingsContext';

export const GlobalAudio: React.FC = () => {
    const { participants: voiceParticipants, isDeafened: isVoiceChannelDeafened } = useVoiceChannel();
    const {
        remoteStream: callRemoteStream,
        remoteSoundpadStream: callSoundpadStream,
        remoteScreenStream: callScreenStream, // NEW
        activeCall,
        isDeafened: isCallDeafened
    } = useCall();
    const { user } = useAuth();
    const { getEffectiveVoiceVolume, getEffectiveSoundpadVolume, getEffectiveScreenVolume, isGlobalMuted } = useUserAudio();
    const { audioOutputDeviceId } = useDeviceSettings();

    // Refs to keep track of audio elements
    const voiceAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
    const soundpadAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
    const screenAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map()); //Persistent screen audio
    const callAudioRef = useRef<HTMLAudioElement | null>(null);
    const callSoundpadAudioRef = useRef<HTMLAudioElement | null>(null);
    const callScreenAudioRef = useRef<HTMLAudioElement | null>(null); // NEW: Screen audio for calls

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

    // Handle Voice Channel Participants Audio (Voice + Soundpad + Screen)
    useEffect(() => {
        // Cleanup old refs
        const currentIds = new Set(voiceParticipants.map(p => p.user_id));

        // Cleanup audio refs
        const cleanup = (map: Map<string, HTMLAudioElement>) => {
            for (const [id, audio] of map.entries()) {
                if (!currentIds.has(id)) {
                    audio.srcObject = null;
                    map.delete(id);
                }
            }
        };

        cleanup(voiceAudioRefs.current);
        cleanup(soundpadAudioRefs.current);
        cleanup(screenAudioRefs.current);

        // Update/Create audio for participants (EXCEPT local user)
        voiceParticipants.forEach(participant => {
            // CRITICAL FIX: Don't play your own audio streams
            if (participant.user_id === user?.id) {
                return;
            }

            // Helper to manage audio element
            const manageAudio = (stream: MediaStream | undefined, map: Map<string, HTMLAudioElement>, volumeLabel: string, getVolume: (id: string) => number) => {
                if (!stream || stream.getAudioTracks().length === 0) {
                    const audio = map.get(participant.user_id);
                    if (audio) {
                        console.log(`[GlobalAudio] Removing ${volumeLabel} stream for ${participant.user_id} (no audio tracks)`);
                        audio.srcObject = null;
                    }
                    return;
                }

                let audio = map.get(participant.user_id);
                if (!audio) {
                    audio = new Audio();
                    audio.autoplay = true;
                    map.set(participant.user_id, audio);
                }

                let volume = 0;
                if (!isVoiceChannelDeafened && !isGlobalMuted) {
                    volume = getVolume(participant.user_id);
                }
                const safeVol = safeVolume(volume);
                audio.volume = safeVol;

                if (audio.srcObject !== stream) {
                    console.log(`[GlobalAudio] Setting ${volumeLabel} stream for ${participant.user_id} with volume ${safeVol}`);
                    audio.srcObject = stream;
                    audio.play().catch(e => console.error(`Error playing ${volumeLabel} audio:`, e));
                }
            };

            manageAudio(participant.stream, voiceAudioRefs.current, 'VOICE', getEffectiveVoiceVolume);
            manageAudio(participant.soundpadStream, soundpadAudioRefs.current, 'SOUNDPAD', getEffectiveSoundpadVolume);

            if (participant.screenStream) {
                console.log(`[GlobalAudio] Checking SCREEN stream for ${participant.user_id}: tracks=${participant.screenStream.getAudioTracks().length}`);
            }
            manageAudio(participant.screenStream, screenAudioRefs.current, 'SCREEN', getEffectiveScreenVolume);
        });

        // Cleanup on unmount
        return () => {
            // We don't stop tracks here, just clear refs, as context manages streams
        };
    }, [voiceParticipants, user, getEffectiveVoiceVolume, getEffectiveSoundpadVolume, isVoiceChannelDeafened, isGlobalMuted]);

    // Update volumes when they change (separate effect to avoid recreating audio elements)
    useEffect(() => {
        const updateVolumes = (map: Map<string, HTMLAudioElement>, getVolume: (id: string) => number) => {
            map.forEach((audio, id) => {
                let vol = 0;
                if (!isVoiceChannelDeafened && !isGlobalMuted) {
                    vol = getVolume(id);
                }
                const safeVol = safeVolume(vol);
                if (audio.volume !== safeVol) {
                    audio.volume = safeVol;
                    // console.log(`[GlobalAudio] Updated volume for ${id} to ${safeVol}`); // Too noisy
                }
            });
        };

        updateVolumes(voiceAudioRefs.current, getEffectiveVoiceVolume);
        updateVolumes(soundpadAudioRefs.current, getEffectiveSoundpadVolume);
        updateVolumes(screenAudioRefs.current, getEffectiveScreenVolume);
    }, [getEffectiveVoiceVolume, getEffectiveSoundpadVolume, getEffectiveScreenVolume, isVoiceChannelDeafened, isGlobalMuted]);

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

    // Handle Direct Call SCREEN Audio
    useEffect(() => {
        if (!callScreenAudioRef.current) {
            callScreenAudioRef.current = new Audio();
            callScreenAudioRef.current.autoplay = true;
        }

        const audio = callScreenAudioRef.current;
        const remoteUserId = getRemoteUserId();

        if (callScreenStream) {
            // Apply SCREEN volume settings for the remote user
            let effectiveVolume = 0;
            if (!isCallDeafened && !isGlobalMuted && remoteUserId) {
                effectiveVolume = getEffectiveScreenVolume(remoteUserId);
            }
            const safeVol = safeVolume(effectiveVolume);
            audio.volume = safeVol;
            console.log(`[GlobalAudio] Setting direct call SCREEN volume to ${safeVol} (deafened: ${isCallDeafened})`);

            if (audio.srcObject !== callScreenStream) {
                console.log('[GlobalAudio] Setting direct call remote SCREEN stream');
                audio.srcObject = callScreenStream;
                audio.play().catch(e => console.error('Error playing call screen audio:', e));
            }
        } else {
            if (audio.srcObject) {
                audio.srcObject = null;
            }
        }
    }, [callScreenStream, activeCall, user, getEffectiveScreenVolume, isCallDeafened, isGlobalMuted]);

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
            }
        }

        // Update screen volume
        if (callScreenAudioRef.current && callScreenStream) {
            let effectiveVolume = 0;
            if (!isCallDeafened && !isGlobalMuted) {
                effectiveVolume = getEffectiveScreenVolume(remoteUserId);
            }
            const safeVol = safeVolume(effectiveVolume);
            if (callScreenAudioRef.current.volume !== safeVol) {
                callScreenAudioRef.current.volume = safeVol;
            }
        }
    }, [getEffectiveVoiceVolume, getEffectiveSoundpadVolume, getEffectiveScreenVolume, callRemoteStream, callSoundpadStream, callScreenStream, activeCall, user, isCallDeafened, isGlobalMuted]);

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
        screenAudioRefs.current.forEach(applySinkId);
        applySinkId(callAudioRef.current);
        applySinkId(callSoundpadAudioRef.current);
        applySinkId(callScreenAudioRef.current);

    }, [audioOutputDeviceId]);

    return null; // This component does not render anything visual
};
