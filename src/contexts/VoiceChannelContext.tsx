import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { supabase, supabaseUrl } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { useCall } from './CallContext';
import { Profile } from '@/lib/types';
import { ScreenSharePickerModal } from '@/components/modals/ScreenSharePickerModal';
import { ScreenShareQualityModal } from '@/components/modals/ScreenShareQualityModal';
import { PCMAudioProcessor } from '@/utils/audioProcessor';

import { useDeviceSettings } from './DeviceSettingsContext';
import { useNoiseSuppression } from './NoiseSuppressionContext';
import { noiseSuppressionService } from '@/services/NoiseSuppression';
import { useAudioNotifications } from '@/hooks/useAudioNotifications';

// LiveKit imports
import {
    Room,
    RoomEvent,
    LocalParticipant,
    RemoteParticipant,
    Track,
    LocalTrackPublication,
    RemoteTrackPublication,
    ConnectionState,
    Participant,
    TrackPublication,
    createLocalAudioTrack,
    createLocalVideoTrack,
    LocalTrack,
    VideoPresets,
} from 'livekit-client';

// LiveKit WebSocket URL
const LIVEKIT_WS_URL = import.meta.env.VITE_LIVEKIT_URL || 'wss://ovox2-0yrakl4s.livekit.cloud';

interface VoiceParticipant {
    user_id: string;
    profile: Profile;
    is_muted: boolean;
    is_deafened: boolean;
    is_video_enabled: boolean;
    is_screen_sharing: boolean;
    stream?: MediaStream;           // Voice/mic stream
    soundpadStream?: MediaStream;   // Separate soundpad stream
    screenStream?: MediaStream;
    cameraStream?: MediaStream;
}

interface VoiceChannelContextType {
    activeChannelId: number | null;
    participants: VoiceParticipant[];
    isConnected: boolean;
    isMuted: boolean;
    isDeafened: boolean;
    isScreenSharing: boolean;
    isCameraEnabled: boolean;
    joinChannel: (channelId: number) => Promise<void>;
    leaveChannel: () => Promise<void>;
    toggleMute: () => void;
    toggleDeafen: () => void;
    toggleScreenShare: () => Promise<void>;
    toggleCamera: () => Promise<void>;
    playSoundboardAudio: (audioBuffer: AudioBuffer) => void;
}

const VoiceChannelContext = createContext<VoiceChannelContextType | undefined>(undefined);

export function VoiceChannelProvider({ children }: { children: ReactNode }) {
    const { user, profile } = useAuth();
    const { activeCall, endCall, callStatus } = useCall();

    const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
    const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isCameraEnabled, setIsCameraEnabled] = useState(false);
    const [isScreenShareModalOpen, setIsScreenShareModalOpen] = useState(false);
    const [isQualityModalOpen, setIsQualityModalOpen] = useState(false);

    const { isEnabled: isNoiseSuppressionEnabled } = useNoiseSuppression();
    const { playStreamStarted, playStreamStopped, playMicOpen, playMicClosed } = useAudioNotifications();

    // LiveKit Room reference
    const roomRef = useRef<Room | null>(null);
    const activeChannelIdRef = useRef<number | null>(null);

    // Soundboard audio
    const audioContextRef = useRef<AudioContext | null>(null);
    const soundpadDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

    // Native audio capture (Electron)
    const nativeAudioProcessorRef = useRef<PCMAudioProcessor | null>(null);
    const nativeAudioUnsubscribeRef = useRef<(() => void) | null>(null);
    const activeNativeAudioPidRef = useRef<string | null>(null);

    useEffect(() => {
        activeChannelIdRef.current = activeChannelId;
    }, [activeChannelId]);

    // Track participant stream states to play sounds
    const prevStreamStatesRef = useRef<Map<string, { screen: boolean; video: boolean }>>(new Map());

    useEffect(() => {
        participants.forEach(p => {
            const prevState = prevStreamStatesRef.current.get(p.user_id);

            if (prevState) {
                if (p.is_screen_sharing && !prevState.screen) {
                    playStreamStarted();
                } else if (!p.is_screen_sharing && prevState.screen) {
                    playStreamStopped();
                }

                if (p.is_video_enabled && !prevState.video) {
                    playStreamStarted();
                } else if (!p.is_video_enabled && prevState.video) {
                    playStreamStopped();
                }
            }

            prevStreamStatesRef.current.set(p.user_id, {
                screen: !!p.is_screen_sharing,
                video: !!p.is_video_enabled
            });
        });

        const currentIds = new Set(participants.map(p => p.user_id));
        for (const userId of Array.from(prevStreamStatesRef.current.keys())) {
            if (!currentIds.has(userId)) {
                prevStreamStatesRef.current.delete(userId);
            }
        }
    }, [participants, playStreamStarted, playStreamStopped]);

    const playJoinSound = useCallback(() => {
        const audio = new Audio('sounds/joinovox.mp3');
        audio.volume = 0.5;
        audio.play().catch(e => console.error('Error playing join sound:', e));
    }, []);

    const playLeaveSound = useCallback(() => {
        const audio = new Audio('sounds/logout.mp3');
        audio.volume = 0.5;
        audio.play().catch(e => console.error('Error playing leave sound:', e));
    }, []);

    // Get LiveKit token from Supabase Edge Function
    const getLiveKitToken = async (channelId: number): Promise<{ token: string; wsUrl: string; roomName: string }> => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch(`${supabaseUrl}/functions/v1/livekit-token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ channelId }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get LiveKit token');
        }

        return response.json();
    };

    // Update participants from LiveKit room
    const updateParticipantsFromRoom = useCallback(() => {
        const room = roomRef.current;
        if (!room) return;

        const allParticipants: VoiceParticipant[] = [];

        // Add local participant
        const localParticipant = room.localParticipant;
        if (localParticipant && user && profile) {
            const metadata = localParticipant.metadata ? JSON.parse(localParticipant.metadata) : {};

            let localAudioStream: MediaStream | undefined;
            let localCameraStream: MediaStream | undefined;
            let localScreenStream: MediaStream | undefined;

            localParticipant.trackPublications.forEach((pub) => {
                if (pub.track) {
                    if (pub.source === Track.Source.Microphone && pub.track.kind === 'audio') {
                        localAudioStream = new MediaStream([pub.track.mediaStreamTrack]);
                    } else if (pub.source === Track.Source.Camera && pub.track.kind === 'video') {
                        localCameraStream = new MediaStream([pub.track.mediaStreamTrack]);
                    } else if (pub.source === Track.Source.ScreenShare) {
                        if (!localScreenStream) localScreenStream = new MediaStream();
                        localScreenStream.addTrack(pub.track.mediaStreamTrack);
                    } else if (pub.source === Track.Source.ScreenShareAudio) {
                        if (!localScreenStream) localScreenStream = new MediaStream();
                        localScreenStream.addTrack(pub.track.mediaStreamTrack);
                    }
                }
            });

            allParticipants.push({
                user_id: user.id,
                profile: profile,
                is_muted: !localParticipant.isMicrophoneEnabled,
                is_deafened: isDeafened,
                is_video_enabled: localParticipant.isCameraEnabled,
                is_screen_sharing: localParticipant.isScreenShareEnabled,
                stream: localAudioStream,
                cameraStream: localCameraStream,
                screenStream: localScreenStream,
            });
        }

        // Add remote participants
        room.remoteParticipants.forEach((participant) => {
            const metadata = participant.metadata ? JSON.parse(participant.metadata) : {};

            let audioStream: MediaStream | undefined;
            let cameraStream: MediaStream | undefined;
            let screenStream: MediaStream | undefined;

            participant.trackPublications.forEach((pub) => {
                if (pub.track && pub.isSubscribed) {
                    if (pub.source === Track.Source.Microphone && pub.track.kind === 'audio') {
                        audioStream = new MediaStream([pub.track.mediaStreamTrack]);
                    } else if (pub.source === Track.Source.Camera && pub.track.kind === 'video') {
                        cameraStream = new MediaStream([pub.track.mediaStreamTrack]);
                    } else if (pub.source === Track.Source.ScreenShare) {
                        if (!screenStream) screenStream = new MediaStream();
                        screenStream.addTrack(pub.track.mediaStreamTrack);
                    } else if (pub.source === Track.Source.ScreenShareAudio) {
                        if (!screenStream) screenStream = new MediaStream();
                        screenStream.addTrack(pub.track.mediaStreamTrack);
                    }
                }
            });

            allParticipants.push({
                user_id: participant.identity,
                profile: {
                    id: participant.identity,
                    username: metadata.username || 'Unknown',
                    display_name: metadata.displayName || metadata.username || 'Unknown',
                    avatar_url: metadata.avatarUrl || null,
                    email: '',
                    profile_image_url: metadata.avatarUrl || null,
                    created_at: new Date().toISOString(),
                } as Profile,
                is_muted: !participant.isMicrophoneEnabled,
                is_deafened: false,
                is_video_enabled: participant.isCameraEnabled,
                is_screen_sharing: participant.isScreenShareEnabled,
                stream: audioStream,
                cameraStream: cameraStream,
                screenStream: screenStream,
            });
        });

        setParticipants(allParticipants);
    }, [user, profile, isDeafened]);

    // Leave channel
    const leaveChannel = useCallback(async () => {
        if (!user) return;

        console.log('[VoiceChannelContext] Leaving channel...');
        playLeaveSound();

        // Disconnect from LiveKit room
        if (roomRef.current) {
            roomRef.current.disconnect();
            roomRef.current = null;
        }

        // Stop native audio capture
        if (nativeAudioUnsubscribeRef.current) {
            nativeAudioUnsubscribeRef.current();
            nativeAudioUnsubscribeRef.current = null;
        }
        if (nativeAudioProcessorRef.current) {
            if (activeNativeAudioPidRef.current) {
                window.electron?.nativeAudio?.stopCapture(activeNativeAudioPidRef.current);
                activeNativeAudioPidRef.current = null;
            }
            nativeAudioProcessorRef.current = null;
        }

        // Update database
        if (activeChannelIdRef.current) {
            await supabase
                .from('voice_channel_users')
                .delete()
                .eq('channel_id', activeChannelIdRef.current)
                .eq('user_id', user.id);
        }

        setIsConnected(false);
        setActiveChannelId(null);
        setIsScreenSharing(false);
        setIsCameraEnabled(false);
        setParticipants([]);
    }, [user, playLeaveSound]);

    // Join channel
    const joinChannel = useCallback(async (channelId: number) => {
        if (!user || !profile) return;

        console.log('[VoiceChannelContext] Request to join channel:', channelId);

        // Cooperative cleanup
        try {
            await supabase.rpc('cleanup_stale_users');
        } catch (e) {
            console.error('[VoiceChannelContext] Error during cooperative cleanup:', e);
        }

        // Handle existing connections
        if (activeCall) {
            console.log('[VoiceChannelContext] Active direct call detected. Ending it...');
            await endCall();
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (activeChannelIdRef.current) {
            if (activeChannelIdRef.current === channelId) {
                console.log('[VoiceChannelContext] Already in this channel.');
                return;
            }
            console.log('[VoiceChannelContext] Already in another channel. Leaving...');
            await leaveChannel();
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        try {
            setActiveChannelId(channelId);

            // Get LiveKit token
            console.log('[VoiceChannelContext] Getting LiveKit token...');
            const { token, wsUrl, roomName } = await getLiveKitToken(channelId);
            console.log('[VoiceChannelContext] Got token for room:', roomName);

            // Create and configure Room
            const room = new Room({
                adaptiveStream: true,
                dynacast: true,
                videoCaptureDefaults: {
                    resolution: VideoPresets.h720.resolution,
                },
                audioCaptureDefaults: {
                    echoCancellation: true,
                    autoGainControl: true,
                    noiseSuppression: isNoiseSuppressionEnabled,
                },
            });

            roomRef.current = room;

            // Set up room event handlers
            room.on(RoomEvent.Connected, () => {
                console.log('[VoiceChannelContext] Connected to LiveKit room');
                setIsConnected(true);
                playJoinSound();
                updateParticipantsFromRoom();
            });

            room.on(RoomEvent.Disconnected, () => {
                console.log('[VoiceChannelContext] Disconnected from LiveKit room');
                setIsConnected(false);
            });

            room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
                console.log('[VoiceChannelContext] Participant joined:', participant.identity);
                playJoinSound();
                updateParticipantsFromRoom();
            });

            room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
                console.log('[VoiceChannelContext] Participant left:', participant.identity);
                playLeaveSound();
                updateParticipantsFromRoom();
            });

            room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
                console.log('[VoiceChannelContext] Track subscribed:', track.kind, 'from', participant.identity);
                updateParticipantsFromRoom();
            });

            room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
                console.log('[VoiceChannelContext] Track unsubscribed:', track.kind, 'from', participant.identity);
                updateParticipantsFromRoom();
            });

            room.on(RoomEvent.TrackMuted, (publication, participant) => {
                console.log('[VoiceChannelContext] Track muted:', publication.source, 'from', participant.identity);
                updateParticipantsFromRoom();
            });

            room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
                console.log('[VoiceChannelContext] Track unmuted:', publication.source, 'from', participant.identity);
                updateParticipantsFromRoom();
            });

            room.on(RoomEvent.LocalTrackPublished, (publication, participant) => {
                console.log('[VoiceChannelContext] Local track published:', publication.source);
                updateParticipantsFromRoom();
            });

            room.on(RoomEvent.LocalTrackUnpublished, (publication, participant) => {
                console.log('[VoiceChannelContext] Local track unpublished:', publication.source);
                updateParticipantsFromRoom();
            });

            // Connect to room
            console.log('[VoiceChannelContext] Connecting to LiveKit room...');
            await room.connect(wsUrl || LIVEKIT_WS_URL, token);

            // Enable microphone
            await room.localParticipant.setMicrophoneEnabled(!isMuted);

            // Update database
            await supabase
                .from('voice_channel_users')
                .upsert({
                    channel_id: channelId,
                    user_id: user.id,
                    is_muted: isMuted,
                    is_deafened: isDeafened,
                    joined_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            // Setup soundpad stream
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new AudioContext();
            }
            const ctx = audioContextRef.current;
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }
            soundpadDestinationRef.current = ctx.createMediaStreamDestination();

        } catch (error) {
            console.error('[VoiceChannelContext] Error joining voice channel:', error);
            await leaveChannel();
        }
    }, [activeCall, endCall, user, profile, isMuted, isDeafened, leaveChannel, isNoiseSuppressionEnabled, playJoinSound, playLeaveSound, updateParticipantsFromRoom]);

    // Reactive Device Switching
    const { audioInputDeviceId, videoInputDeviceId } = useDeviceSettings();

    // Handle microphone device change
    useEffect(() => {
        if (isConnected && roomRef.current) {
            const room = roomRef.current;
            console.log('[VoiceChannelContext] Microphone change detected');

            room.switchActiveDevice('audioinput', audioInputDeviceId || 'default').catch(e => {
                console.error('[VoiceChannelContext] Failed to switch microphone:', e);
            });
        }
    }, [audioInputDeviceId, isConnected]);

    // Handle camera device change
    useEffect(() => {
        if (isConnected && isCameraEnabled && roomRef.current) {
            const room = roomRef.current;
            console.log('[VoiceChannelContext] Camera change detected');

            room.switchActiveDevice('videoinput', videoInputDeviceId || 'default').catch(e => {
                console.error('[VoiceChannelContext] Failed to switch camera:', e);
            });
        }
    }, [videoInputDeviceId, isConnected, isCameraEnabled]);

    // Track previous mute state
    const prevMuteRef = useRef(isMuted);

    // Handle mute toggle
    useEffect(() => {
        if (prevMuteRef.current !== isMuted) {
            if (isMuted) {
                playMicClosed();
            } else {
                playMicOpen();
            }
        }
        prevMuteRef.current = isMuted;

        if (roomRef.current && isConnected) {
            roomRef.current.localParticipant.setMicrophoneEnabled(!isMuted).catch(e => {
                console.error('[VoiceChannelContext] Failed to toggle mute:', e);
            });

            // Update database
            if (activeChannelId && user) {
                supabase
                    .from('voice_channel_users')
                    .update({ is_muted: isMuted })
                    .eq('channel_id', activeChannelId)
                    .eq('user_id', user.id)
                    .then(({ error }) => {
                        if (error) console.error('Error updating mute state:', error);
                    });
            }
        }
    }, [isMuted, activeChannelId, user?.id, isConnected, playMicClosed, playMicOpen]);

    // Handle deafen toggle
    useEffect(() => {
        // Deafen mutes incoming audio by setting remote track volume to 0
        // Handled in audio rendering components

        if (activeChannelId && user && isConnected) {
            supabase
                .from('voice_channel_users')
                .update({ is_deafened: isDeafened })
                .eq('channel_id', activeChannelId)
                .eq('user_id', user.id)
                .then(({ error }) => {
                    if (error) console.error('Error updating deafen state:', error);
                });
        }
    }, [isDeafened, activeChannelId, user?.id, isConnected]);

    // Toggle screen share
    const toggleScreenShare = useCallback(async () => {
        if (!user || !activeChannelId || !isConnected || !roomRef.current) return;

        try {
            if (isScreenSharing) {
                // Stop screen sharing
                await roomRef.current.localParticipant.setScreenShareEnabled(false);

                // Stop native audio capture
                if (nativeAudioUnsubscribeRef.current) {
                    nativeAudioUnsubscribeRef.current();
                    nativeAudioUnsubscribeRef.current = null;
                }
                if (activeNativeAudioPidRef.current && window.electron?.nativeAudio) {
                    window.electron.nativeAudio.stopCapture(activeNativeAudioPidRef.current);
                    activeNativeAudioPidRef.current = null;
                }

                await supabase
                    .from('voice_channel_users')
                    .update({ is_screen_sharing: false })
                    .eq('channel_id', activeChannelId)
                    .eq('user_id', user.id);

                setIsScreenSharing(false);
            } else {
                // Check if Electron
                const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

                if (isElectron) {
                    setIsScreenShareModalOpen(true);
                } else {
                    setIsQualityModalOpen(true);
                }
            }
        } catch (error) {
            console.error('Error toggling screen share:', error);
        }
    }, [isScreenSharing, user, activeChannelId, isConnected]);

    // Handle web quality selection for screen share
    const handleWebScreenShareSelect = async (quality: 'standard' | 'fullhd') => {
        setIsQualityModalOpen(false);

        if (!roomRef.current) return;

        try {
            await roomRef.current.localParticipant.setScreenShareEnabled(true, {
                audio: true,
            });

            await supabase
                .from('voice_channel_users')
                .update({ is_screen_sharing: true })
                .eq('channel_id', activeChannelId!)
                .eq('user_id', user!.id);

            setIsScreenSharing(true);
        } catch (error) {
            console.error('[VoiceChannelContext] Error starting web screen share:', error);
        }
    };

    // Handle Electron screen share selection
    const handleScreenShareSelect = async (sourceId: string, quality: 'standard' | 'fullhd', shareAudio: boolean) => {
        setIsScreenShareModalOpen(false);

        if (!roomRef.current || !user) return;

        try {
            console.log('[VoiceChannelContext] Starting Electron screen share:', sourceId, quality, shareAudio);

            // Get video stream from Electron
            const videoStream = await (navigator.mediaDevices as any).getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        maxWidth: quality === 'fullhd' ? 1920 : 1280,
                        maxHeight: quality === 'fullhd' ? 1080 : 720,
                        maxFrameRate: quality === 'standard' ? 30 : 60
                    }
                }
            });

            const videoTrack = videoStream.getVideoTracks()[0];

            // Publish the screen share track
            await roomRef.current.localParticipant.publishTrack(videoTrack, {
                source: Track.Source.ScreenShare,
                name: 'screen',
            });

            // Handle native audio capture for Electron
            if (shareAudio && window.electron?.nativeAudio) {
                try {
                    let targetPid: string | null = null;
                    let captureMode: 'include' | 'exclude' = 'exclude';

                    if (sourceId.startsWith('window:')) {
                        const hwnd = sourceId.split(':')[1];
                        targetPid = await window.electron.nativeAudio.getWindowPid(hwnd);
                        captureMode = 'include';
                    }

                    if (!targetPid) {
                        const appPid = await window.electron.nativeAudio.getAppPid();
                        targetPid = appPid.toString();
                        captureMode = 'exclude';
                    }

                    const started = await window.electron.nativeAudio.startCapture(targetPid, captureMode);

                    if (started) {
                        activeNativeAudioPidRef.current = targetPid;
                        nativeAudioProcessorRef.current = new PCMAudioProcessor();
                        nativeAudioUnsubscribeRef.current = window.electron.nativeAudio.onAudioData((chunk: any) => {
                            if (nativeAudioProcessorRef.current) {
                                nativeAudioProcessorRef.current.processChunk(chunk);
                            }
                        });

                        const audioStream = nativeAudioProcessorRef.current.getStream();
                        const audioTrack = audioStream.getAudioTracks()[0];

                        if (audioTrack) {
                            await roomRef.current!.localParticipant.publishTrack(audioTrack, {
                                source: Track.Source.ScreenShareAudio,
                                name: 'screen-audio',
                            });
                        }
                    }
                } catch (err) {
                    console.error('[VoiceChannelContext] Failed to start native audio:', err);
                }
            }

            await supabase
                .from('voice_channel_users')
                .update({ is_screen_sharing: true })
                .eq('channel_id', activeChannelId!)
                .eq('user_id', user.id);

            setIsScreenSharing(true);
        } catch (e) {
            console.error('Error starting Electron screen share:', e);
        }
    };

    // Toggle camera
    const toggleCamera = useCallback(async () => {
        if (!user || !activeChannelId || !isConnected || !roomRef.current) return;

        try {
            if (isCameraEnabled) {
                await roomRef.current.localParticipant.setCameraEnabled(false);

                await supabase
                    .from('voice_channel_users')
                    .update({ is_video_enabled: false })
                    .eq('channel_id', activeChannelId)
                    .eq('user_id', user.id);

                setIsCameraEnabled(false);
            } else {
                await roomRef.current.localParticipant.setCameraEnabled(true);

                await supabase
                    .from('voice_channel_users')
                    .update({ is_video_enabled: true })
                    .eq('channel_id', activeChannelId)
                    .eq('user_id', user.id);

                setIsCameraEnabled(true);
            }
        } catch (error) {
            console.error('Error toggling camera:', error);
        }
    }, [isCameraEnabled, user, activeChannelId, isConnected]);

    // Auto-leave channel when active call starts
    useEffect(() => {
        const shouldLeave = activeCall && activeChannelId && (callStatus === 'active' || callStatus === 'connecting');

        if (shouldLeave) {
            console.log('[VoiceChannelContext] Active call detected (status:', callStatus, '), leaving voice channel...');
            leaveChannel();
        }
    }, [activeCall, activeChannelId, callStatus, leaveChannel]);

    // Play soundboard audio
    const playSoundboardAudio = useCallback((audioBuffer: AudioBuffer) => {
        console.log('[VoiceChannelContext] Playing soundboard audio, duration:', audioBuffer.duration, 's');

        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new AudioContext();
        }
        const ctx = audioContextRef.current;

        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        // Play locally
        const localSource = ctx.createBufferSource();
        localSource.buffer = audioBuffer;
        localSource.connect(ctx.destination);
        localSource.start();

        // TODO: Publish soundpad audio to LiveKit room if needed
        // This would require creating a separate audio track for soundpad
    }, []);

    const value: VoiceChannelContextType = {
        activeChannelId,
        participants,
        isConnected,
        isMuted,
        isDeafened,
        isScreenSharing,
        isCameraEnabled,
        joinChannel,
        leaveChannel,
        toggleMute: () => setIsMuted(!isMuted),
        toggleDeafen: () => setIsDeafened(!isDeafened),
        toggleScreenShare,
        toggleCamera,
        playSoundboardAudio
    };

    return (
        <VoiceChannelContext.Provider value={value}>
            {children}
            <ScreenSharePickerModal
                isOpen={isScreenShareModalOpen}
                onClose={() => setIsScreenShareModalOpen(false)}
                onSelect={handleScreenShareSelect}
            />
            <ScreenShareQualityModal
                isOpen={isQualityModalOpen}
                onClose={() => setIsQualityModalOpen(false)}
                onSelect={handleWebScreenShareSelect}
            />
        </VoiceChannelContext.Provider>
    );
}

export function useVoiceChannel() {
    const context = useContext(VoiceChannelContext);
    if (context === undefined) {
        throw new Error('useVoiceChannel must be used within a VoiceChannelProvider');
    }
    return context;
}
