import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { useCall } from './CallContext';
import { WebRTCManager } from '@/services/WebRTCManager';
import { Profile } from '@/lib/types';
import { ScreenSharePickerModal } from '@/components/modals/ScreenSharePickerModal';
import { ScreenShareQualityModal } from '@/components/modals/ScreenShareQualityModal';
import { useNoiseSuppression } from './NoiseSuppressionContext';
import { useDeviceSettings } from './DeviceSettingsContext';

interface VoiceParticipant {
    user_id: string;
    profile: Profile;
    is_muted: boolean;
    is_deafened: boolean;
    is_video_enabled: boolean;
    is_screen_sharing: boolean;
    peerConnection?: RTCPeerConnection;
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
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [isScreenShareModalOpen, setIsScreenShareModalOpen] = useState(false);
    const [isQualityModalOpen, setIsQualityModalOpen] = useState(false);

    // Map of userId -> WebRTCManager
    const peerManagers = useRef<Map<string, WebRTCManager>>(new Map());
    const peerMetadata = useRef<Map<string, { joined_at: string }>>(new Map());
    const localStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);

    const activeChannelIdRef = useRef<number | null>(null);

    // Soundboard audio - SEPARATE TRACK for independent volume control
    const audioContextRef = useRef<AudioContext | null>(null);
    const soundpadDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const soundpadStreamRef = useRef<MediaStream | null>(null);  // Persistent soundpad stream

    useEffect(() => {
        activeChannelIdRef.current = activeChannelId;
    }, [activeChannelId]);

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

    const sendSignal = async (toUserId: string, type: string, payload: any) => {
        if (!user || !activeChannelIdRef.current) return;

        await supabase.from('webrtc_signals').insert({
            channel_id: activeChannelIdRef.current,
            from_user_id: user.id,
            to_user_id: toUserId,
            signal_type: type,
            payload
        });
    };

    // Cleanup peer connections without stopping local media
    const cleanupPeerConnections = useCallback(() => {
        peerManagers.current.forEach(manager => manager.cleanup());
        peerManagers.current.clear();
        peerMetadata.current.clear();
        setParticipants([]);
    }, []);

    // Leave channel
    const leaveChannel = useCallback(async () => {
        if (!user) return;

        console.log('[VoiceChannelContext] Leaving channel...');
        playLeaveSound();

        // First, stop screen share if active (this will signal peers)
        if (isScreenSharing && screenStreamRef.current) {
            console.log('[VoiceChannelContext] Stopping screen share before leaving...');
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;

            // Notify peers about screen share stop
            for (const [peerId, manager] of peerManagers.current.entries()) {
                try {
                    await manager.stopScreenShare();
                    const offer = await manager.createOffer();
                    await supabase.from('webrtc_signals').insert({
                        channel_id: activeChannelIdRef.current,
                        from_user_id: user.id,
                        to_user_id: peerId,
                        signal_type: 'offer',
                        payload: offer
                    });
                } catch (e) {
                    console.log('[VoiceChannelContext] Error stopping screen share for peer:', e);
                }
            }

            if (activeChannelIdRef.current) {
                await supabase
                    .from('voice_channel_users')
                    .update({ is_screen_sharing: false })
                    .eq('channel_id', activeChannelIdRef.current)
                    .eq('user_id', user.id);
            }
        }

        // Then, stop camera if active
        if (isCameraEnabled && cameraStreamRef.current) {
            console.log('[VoiceChannelContext] Stopping camera before leaving...');
            cameraStreamRef.current.getTracks().forEach(track => track.stop());
            cameraStreamRef.current = null;

            if (activeChannelIdRef.current) {
                await supabase
                    .from('voice_channel_users')
                    .update({ is_video_enabled: false })
                    .eq('channel_id', activeChannelIdRef.current)
                    .eq('user_id', user.id);
            }
        }

        // Stop local audio stream
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
            setLocalStream(null);
        }

        cleanupPeerConnections();

        if (activeChannelIdRef.current && isConnected) {
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
        // We keep mute/deafen state as user preference
    }, [user, isConnected, isScreenSharing, isCameraEnabled, cleanupPeerConnections]);

    // Join channel
    const joinChannel = useCallback(async (channelId: number) => {
        if (!user || !profile) return;

        console.log('[VoiceChannelContext] Request to join channel:', channelId);

        // Cooperative cleanup: trigger cleanup of stale users before joining
        try {
            await supabase.rpc('cleanup_stale_users');
        } catch (e) {
            console.error('[VoiceChannelContext] Error during cooperative cleanup:', e);
        }

        // 1. Handle existing connections
        if (activeCall) {
            console.log('[VoiceChannelContext] Active direct call detected. Ending it...');
            await endCall();
            // Give a small buffer for cleanup
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (activeChannelIdRef.current) {
            if (activeChannelIdRef.current === channelId) {
                console.log('[VoiceChannelContext] Already in this channel.');
                return;
            }
            console.log('[VoiceChannelContext] Already in another channel. Leaving...');
            await leaveChannel();
            // Give a small buffer for cleanup
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        try {
            setActiveChannelId(channelId);

            // 2. Get local media (microphone)
            let stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

            // Apply noise suppression processor (can be toggled live)
            try {
                console.log('[VoiceChannelContext] Creating noise suppression processor');
                const { createNoiseSuppressionProcessor } = await import('@/utils/NoiseSuppression');
                const processor = await createNoiseSuppressionProcessor(stream);
                stream = processor.outputStream;
                console.log('[VoiceChannelContext] Noise suppression processor created (live toggle enabled)');
            } catch (e) {
                console.log('[VoiceChannelContext] Noise suppression not available:', e);
            }

            setLocalStream(stream);
            localStreamRef.current = stream;

            // Apply mute state
            stream.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });

            // 3. Create persistent soundpad stream for separate audio track
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new AudioContext();
            }
            const ctx = audioContextRef.current;
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }

            // Create a persistent destination for soundpad audio
            soundpadDestinationRef.current = ctx.createMediaStreamDestination();
            soundpadStreamRef.current = soundpadDestinationRef.current.stream;
            console.log('[VoiceChannelContext] Created separate soundpad stream');

            // 3. Add user to voice_channel_users (Use upsert to handle unique constraint)
            const { error } = await supabase
                .from('voice_channel_users')
                .upsert({
                    channel_id: channelId,
                    user_id: user.id,
                    is_muted: isMuted,
                    is_deafened: isDeafened,
                    joined_at: new Date().toISOString()
                }, { onConflict: 'user_id' });

            if (error) throw error;

            setIsConnected(true);
            playJoinSound();

            // 4. Fetch existing participants
            const { data: existingUsers } = await supabase
                .from('voice_channel_users')
                .select('*, profile:profiles(*)')
                .eq('channel_id', channelId)
                .neq('user_id', user.id);

            if (existingUsers) {
                // Initialize connections with existing users
                existingUsers.forEach(participant => {
                    initiateConnection(participant.user_id, channelId);
                });
            }

        } catch (error) {
            console.error('[VoiceChannelContext] Error joining voice channel:', error);
            await leaveChannel();
        }
    }, [activeCall, endCall, user, profile, isMuted, isDeafened, leaveChannel, callStatus]);

    // Initialize WebRTC connection with a peer
    const initiateConnection = async (peerId: string, channelId: number) => {
        if (peerManagers.current.has(peerId)) return;

        const manager = new WebRTCManager();
        peerManagers.current.set(peerId, manager);

        // Setup peer connection with soundpad callback
        manager.createPeerConnection(
            (remoteStream) => {
                console.log('[VoiceChannelContext] Received VOICE stream from', peerId);
                setParticipants(prev => prev.map(p =>
                    p.user_id === peerId ? { ...p, stream: remoteStream } : p
                ));
            },
            (candidate) => {
                // We need to pass channelId because activeChannelId state might not be updated in this closure if called immediately
                if (user) {
                    supabase.from('webrtc_signals').insert({
                        channel_id: channelId,
                        from_user_id: user.id,
                        to_user_id: peerId,
                        signal_type: 'ice-candidate',
                        payload: candidate
                    }).then();
                }
            },
            undefined,
            undefined,
            (screenStream) => {
                console.log('[VoiceChannelContext] Received screen share from', peerId);
                setParticipants(prev => prev.map(p =>
                    p.user_id === peerId ? { ...p, screenStream: screenStream } : p
                ));
            },
            (cameraStream) => {
                console.log('[VoiceChannelContext] Received camera from', peerId);
                setParticipants(prev => prev.map(p =>
                    p.user_id === peerId ? { ...p, cameraStream: cameraStream } : p
                ));
            },
            // NEW: Soundpad callback - separate stream
            (soundpadStream) => {
                console.log('[VoiceChannelContext] Received SOUNDPAD stream from', peerId);
                setParticipants(prev => prev.map(p =>
                    p.user_id === peerId ? { ...p, soundpadStream: soundpadStream } : p
                ));
            }
        );

        // Add voice (mic) stream first
        if (localStreamRef.current) {
            manager.addLocalStream(localStreamRef.current);
        }

        // Add soundpad stream second (separate track)
        if (soundpadStreamRef.current) {
            console.log('[VoiceChannelContext] Adding soundpad stream to peer:', peerId);
            manager.addSoundpadStream(soundpadStreamRef.current);
        }

        // If already screen sharing, add screen share to this new peer
        if (screenStreamRef.current) {
            console.log('[VoiceChannelContext] Adding existing screen share to new peer:', peerId);
            await manager.startScreenShare(screenStreamRef.current);
        }

        // If already camera enabled, add camera to this new peer
        if (cameraStreamRef.current) {
            console.log('[VoiceChannelContext] Adding existing camera to new peer:', peerId);
            const videoTrack = cameraStreamRef.current.getVideoTracks()[0];
            manager.addVideoTrack(videoTrack, cameraStreamRef.current);
        }

        // Create offer
        const offer = await manager.createOffer();
        if (user) {
            await supabase.from('webrtc_signals').insert({
                channel_id: channelId,
                from_user_id: user.id,
                to_user_id: peerId,
                signal_type: 'offer',
                payload: offer
            });
        }
    };

    // Handle incoming signals
    const handleSignal = async (payload: any) => {
        const { from_user_id, signal_type, payload: signalPayload, channel_id } = payload;

        // CRITICAL FIX: Ignore signals that don't belong to the active channel
        // Use ref to avoid stale closure issues
        if (!activeChannelIdRef.current || channel_id !== activeChannelIdRef.current) {
            // console.log('[VoiceChannelContext] Ignoring signal for different channel/context:', channel_id, 'Active:', activeChannelIdRef.current);
            return;
        }

        let manager = peerManagers.current.get(from_user_id);

        if (!manager) {
            manager = new WebRTCManager();
            peerManagers.current.set(from_user_id, manager);

            manager.createPeerConnection(
                (remoteStream) => {
                    console.log('[VoiceChannelContext] Received VOICE stream from', from_user_id);
                    setParticipants(prev => prev.map(p =>
                        p.user_id === from_user_id ? { ...p, stream: remoteStream } : p
                    ));
                },
                (candidate) => {
                    sendSignal(from_user_id, 'ice-candidate', candidate);
                },
                undefined,
                undefined,
                (screenStream) => {
                    console.log('[VoiceChannelContext] Received screen share from', from_user_id);
                    setParticipants(prev => prev.map(p =>
                        p.user_id === from_user_id ? { ...p, screenStream: screenStream } : p
                    ));
                },
                (cameraStream) => {
                    console.log('[VoiceChannelContext] Received camera from', from_user_id);
                    setParticipants(prev => prev.map(p =>
                        p.user_id === from_user_id ? { ...p, cameraStream: cameraStream } : p
                    ));
                },
                // NEW: Soundpad callback
                (soundpadStream) => {
                    console.log('[VoiceChannelContext] Received SOUNDPAD stream from', from_user_id);
                    setParticipants(prev => prev.map(p =>
                        p.user_id === from_user_id ? { ...p, soundpadStream: soundpadStream } : p
                    ));
                }
            );

            // Add voice (mic) stream first
            if (localStreamRef.current) {
                manager.addLocalStream(localStreamRef.current);
            }

            // Add soundpad stream second (separate track)
            if (soundpadStreamRef.current) {
                console.log('[VoiceChannelContext] Adding soundpad stream to peer from signal:', from_user_id);
                manager.addSoundpadStream(soundpadStreamRef.current);
            }

            if (screenStreamRef.current) {
                await manager.startScreenShare(screenStreamRef.current);
            }

            if (cameraStreamRef.current) {
                const videoTrack = cameraStreamRef.current.getVideoTracks()[0];
                manager.addVideoTrack(videoTrack, cameraStreamRef.current);
            }
        }

        if (signal_type === 'offer') {
            await manager.setRemoteDescription(signalPayload);
            const answer = await manager.createAnswer();
            await sendSignal(from_user_id, 'answer', answer);
        } else if (signal_type === 'answer') {
            await manager.setRemoteDescription(signalPayload);
        } else if (signal_type === 'ice-candidate') {
            await manager.addICECandidate(signalPayload);
        }
    };

    const fetchParticipants = async (channelId: number) => {
        const { data } = await supabase
            .from('voice_channel_users')
            .select('*, profile:profiles(*)')
            .eq('channel_id', channelId)
            .order('joined_at', { ascending: true });

        if (data) {
            console.log('[VoiceChannelContext] Fetched participants:', data.length);

            // Cleanup stale peer connections
            const currentParticipantIds = new Set(data.map((p: any) => p.user_id));

            // 1. Cleanup removed users
            for (const [peerId, manager] of peerManagers.current.entries()) {
                if (!currentParticipantIds.has(peerId)) {
                    console.log('[VoiceChannelContext] User no longer in channel, cleaning up peer connection:', peerId);
                    try {
                        manager.cleanup();
                    } catch (e) {
                        console.error('[VoiceChannelContext] Error cleaning up peer manager:', e);
                    }
                    peerManagers.current.delete(peerId);
                    peerMetadata.current.delete(peerId);
                }
            }

            // 2. Cleanup rejoined users (new session)
            data.forEach((p: any) => {
                const meta = peerMetadata.current.get(p.user_id);
                // If we have metadata and the joined_at timestamp changed, it's a new session
                // We must cleanup the old connection to allow a new one
                if (meta && meta.joined_at !== p.joined_at) {
                    console.log('[VoiceChannelContext] User session changed (rejoin), cleaning up old manager:', p.user_id);
                    if (peerManagers.current.has(p.user_id)) {
                        try {
                            peerManagers.current.get(p.user_id)?.cleanup();
                        } catch (e) {
                            console.error('[VoiceChannelContext] Error cleaning up peer manager on rejoin:', e);
                        }
                        peerManagers.current.delete(p.user_id);
                    }
                }
                // Update metadata
                peerMetadata.current.set(p.user_id, { joined_at: p.joined_at });
            });

            setParticipants(prev => {
                // Merge existing streams with new data
                return data.map((p: any) => {
                    const existing = prev.find(prevP => prevP.user_id === p.user_id);
                    // If this is the local user, use the local stream
                    const stream = p.user_id === user?.id ? localStreamRef.current : existing?.stream;
                    return {
                        ...p,
                        stream: stream,
                        screenStream: existing?.screenStream,
                        cameraStream: existing?.cameraStream,
                        soundpadStream: existing?.soundpadStream
                    };
                });
            });
        }
    };

    // Subscription for channel participants (depends on activeChannelId)
    useEffect(() => {
        if (!user || !activeChannelId) return;

        console.log('[VoiceChannelContext] Subscribing to channel updates:', activeChannelId);

        const channelSub = supabase.channel(`voice_${activeChannelId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'voice_channel_users',
                filter: `channel_id=eq.${activeChannelId}`
            }, (payload) => {
                // Handle sound effects for other users
                if (payload.eventType === 'INSERT') {
                    // Only play if it's not the local user (already played in joinChannel)
                    if (payload.new && payload.new.user_id !== user.id) {
                        playJoinSound();
                    }
                } else if (payload.eventType === 'DELETE') {
                    // Only play if it's not the local user (already played in leaveChannel)
                    // Note: payload.old might not have user_id if not in RLS identity, but we can assume
                    // if we are still connected and receive a delete, it's someone else.
                    if (payload.old && payload.old.user_id !== user.id) {
                        playLeaveSound();
                    } else if (payload.old && !payload.old.user_id) {
                        // Fallback if user_id is missing in old payload (depends on table replica identity)
                        // If we are still strictly connected and it's a delete event on this channel, 
                        // it's likely someone else leaving.
                        playLeaveSound();
                    }
                }

                // Handle participant list updates
                fetchParticipants(activeChannelId);
            })
            .subscribe();

        fetchParticipants(activeChannelId);

        return () => {
            console.log('[VoiceChannelContext] Unsubscribing from channel updates');
            channelSub.unsubscribe();
        };
    }, [activeChannelId, user?.id]);

    // Subscription for signals and user movement (STABLE - depends only on user)
    useEffect(() => {
        if (!user) return;

        console.log('[VoiceChannelContext] Setting up stable signal subscription for user:', user.id);

        // Subscription for signals (always active)
        const signalSub = supabase.channel(`signals_${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'webrtc_signals',
                filter: `to_user_id=eq.${user.id}`
            }, (payload) => {
                handleSignal(payload.new);
            })
            .subscribe();

        // Subscription for user movement (remote moves)
        const userSub = supabase.channel(`user_voice_${user.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'voice_channel_users',
                filter: `user_id=eq.${user.id}`
            }, async (payload) => {
                const newChannelId = payload.new.channel_id;
                const oldChannelId = payload.old.channel_id;

                // Use ref for current active channel to check if we need to update
                if (newChannelId !== activeChannelIdRef.current) {
                    console.log('[VoiceChannelContext] Remote move detected:', oldChannelId, '->', newChannelId);

                    // Cleanup old connections
                    cleanupPeerConnections();

                    // Update state
                    setActiveChannelId(newChannelId);
                    setIsConnected(true);

                    // Connect to new channel peers
                    const { data: existingUsers } = await supabase
                        .from('voice_channel_users')
                        .select('*, profile:profiles(*)')
                        .eq('channel_id', newChannelId)
                        .neq('user_id', user.id);

                    if (existingUsers) {
                        existingUsers.forEach(participant => {
                            initiateConnection(participant.user_id, newChannelId);
                        });
                    }
                }
            })
            .subscribe();

        return () => {
            console.log('[VoiceChannelContext] Cleaning up signal subscriptions');
            signalSub.unsubscribe();
            userSub.unsubscribe();
        };
    }, [user?.id, cleanupPeerConnections]);

    // Reactive Device Switching
    const { audioInputDeviceId, videoInputDeviceId } = useDeviceSettings();

    // Handle microphone change
    useEffect(() => {
        if (isConnected && localStreamRef.current) {
            console.log('[VoiceChannelContext] Microphone change detected, replacing track for all peers');

            // Replace for all active peer managers
            const replaceTrackOnPeers = async () => {
                let updatedStream: MediaStream | null = null;
                for (const [peerId, manager] of peerManagers.current.entries()) {
                    try {
                        const s = await manager.replaceAudioTrack(audioInputDeviceId);
                        if (s) updatedStream = s;
                        console.log(`[VoiceChannelContext] ✓ Replaced audio track for peer: ${peerId}`);
                    } catch (e) {
                        console.error(`[VoiceChannelContext] Error replacing audio track for peer ${peerId}:`, e);
                    }
                }

                if (updatedStream) {
                    setLocalStream(new MediaStream(updatedStream.getTracks()));
                }
            };

            replaceTrackOnPeers();
        }
    }, [audioInputDeviceId, isConnected]);

    // Handle camera change
    useEffect(() => {
        if (isConnected && isCameraEnabled) {
            console.log('[VoiceChannelContext] Camera change detected, replacing track for all peers');

            const replaceTrackOnPeers = async () => {
                let updatedStream: MediaStream | null = null;
                for (const [peerId, manager] of peerManagers.current.entries()) {
                    try {
                        const s = await manager.replaceVideoTrack(videoInputDeviceId);
                        if (s) updatedStream = s;
                        console.log(`[VoiceChannelContext] ✓ Replaced video track for peer: ${peerId}`);
                    } catch (e) {
                        console.error(`[VoiceChannelContext] Error replacing video track for peer ${peerId}:`, e);
                    }
                }

                if (updatedStream) {
                    setLocalStream(new MediaStream(updatedStream.getTracks()));
                }
            };

            replaceTrackOnPeers();
        }
    }, [videoInputDeviceId, isConnected, isCameraEnabled]);

    // Update local user's stream in participants when localStream changes
    useEffect(() => {
        if (localStream && user && activeChannelId) {
            setParticipants(prev => prev.map(p =>
                p.user_id === user.id ? { ...p, stream: localStream } : p
            ));
        }
    }, [localStream, user, activeChannelId]);

    // Handle mute toggle
    useEffect(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });
        }

        if (activeChannelId && user && isConnected) {
            supabase
                .from('voice_channel_users')
                .update({ is_muted: isMuted })
                .eq('channel_id', activeChannelId)
                .eq('user_id', user.id)
                .then(({ error }) => {
                    if (error) console.error('Error updating mute state:', error);
                });
        }
    }, [isMuted, activeChannelId, user?.id, isConnected]);

    // Handle deafen toggle
    useEffect(() => {
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

    // Start screen share with a specific stream
    const startScreenShareWithStream = async (screenStream: MediaStream) => {
        screenStreamRef.current = screenStream;

        screenStream.getVideoTracks()[0].onended = () => {
            toggleScreenShare();
        };

        for (const [peerId, manager] of peerManagers.current.entries()) {
            await manager.startScreenShare(screenStream);
            const offer = await manager.createOffer();
            await sendSignal(peerId, 'offer', offer);
        }

        await supabase
            .from('voice_channel_users')
            .update({ is_screen_sharing: true })
            .eq('channel_id', activeChannelId!)
            .eq('user_id', user!.id);

        setParticipants(prev => prev.map(p =>
            p.user_id === user!.id ? { ...p, screenStream: screenStream } : p
        ));

        setIsScreenSharing(true);
    };

    // Toggle screen share
    const toggleScreenShare = useCallback(async () => {
        if (!user || !activeChannelId || !isConnected) return;

        try {
            if (isScreenSharing) {
                // Stop screen sharing
                if (screenStreamRef.current) {
                    screenStreamRef.current.getTracks().forEach(track => track.stop());
                    screenStreamRef.current = null;
                }

                // Stop screen share for all peers and trigger renegotiation
                for (const [peerId, manager] of peerManagers.current.entries()) {
                    await manager.stopScreenShare();
                    const offer = await manager.createOffer();
                    await sendSignal(peerId, 'offer', offer);
                }

                await supabase
                    .from('voice_channel_users')
                    .update({ is_screen_sharing: false })
                    .eq('channel_id', activeChannelId)
                    .eq('user_id', user.id);

                setParticipants(prev => prev.map(p =>
                    p.user_id === user.id ? { ...p, screenStream: undefined } : p
                ));

                setIsScreenSharing(false);
            } else {
                // Check if Electron
                const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

                if (isElectron) {
                    setIsScreenShareModalOpen(true);
                } else {
                    // Web implementation - show quality picker first
                    setIsQualityModalOpen(true);
                }
            }
        } catch (error) {
            console.error('Error toggling screen share:', error);
        }
    }, [isScreenSharing, user, activeChannelId, isConnected]);

    // Handle web quality selection
    const handleWebScreenShareSelect = async (quality: 'standard' | 'fullhd') => {
        setIsQualityModalOpen(false);
        try {
            // Type assertion needed because suppressLocalAudioPlayback is not in standard TS definitions yet
            const constraints = {
                video: {
                    width: quality === 'fullhd' ? { ideal: 1920 } : { ideal: 1280 },
                    height: quality === 'fullhd' ? { ideal: 1080 } : { ideal: 720 },
                    frameRate: quality === 'fullhd' ? { ideal: 60 } : { ideal: 30 }
                },
                audio: true,
                selfBrowserSurface: 'exclude' as any
            };

            const screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
            await startScreenShareWithStream(screenStream);
        } catch (error) {
            console.error('[VoiceChannelContext] Error starting web screen share:', error);
        }
    };

    // Handle screen share selection from modal
    const handleScreenShareSelect = async (sourceId: string, withAudio: boolean, quality: 'standard' | 'fullhd') => {
        setIsScreenShareModalOpen(false);
        try {
            console.log('[VoiceChannelContext] getUserMedia request - sourceId:', sourceId, 'audio:', withAudio, 'quality:', quality);
            const stream = await (navigator.mediaDevices as any).getUserMedia({
                audio: withAudio ? {
                    mandatory: {
                        chromeMediaSource: 'desktop'
                    }
                } : false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        minWidth: quality === 'fullhd' ? 1920 : 1280,
                        maxWidth: quality === 'fullhd' ? 1920 : 1280,
                        minHeight: quality === 'fullhd' ? 1080 : 720,
                        maxHeight: quality === 'fullhd' ? 1080 : 720,
                        minFrameRate: quality === 'fullhd' ? 60 : 30,
                        maxFrameRate: quality === 'fullhd' ? 60 : 30
                    }
                }
            });

            console.log('[VoiceChannelContext] Got screen stream:', stream.id);
            console.log('[VoiceChannelContext] Audio tracks found:', stream.getAudioTracks().length);
            stream.getAudioTracks().forEach(t => console.log('[VoiceChannelContext] Audio track:', t.label, t.enabled, t.readyState));
            console.log('[VoiceChannelContext] Video tracks found:', stream.getVideoTracks().length);

            await startScreenShareWithStream(stream);
        } catch (e) {
            console.error('Error getting electron screen stream:', e);
        }
    };

    // Toggle camera
    const toggleCamera = useCallback(async () => {
        if (!user || !activeChannelId || !isConnected) return;

        try {
            if (isCameraEnabled) {
                if (cameraStreamRef.current) {
                    cameraStreamRef.current.getTracks().forEach(track => track.stop());
                    cameraStreamRef.current = null;
                }

                await supabase
                    .from('voice_channel_users')
                    .update({ is_video_enabled: false })
                    .eq('channel_id', activeChannelId)
                    .eq('user_id', user.id);

                setParticipants(prev => prev.map(p =>
                    p.user_id === user.id ? { ...p, cameraStream: undefined } : p
                ));

                setIsCameraEnabled(false);
            } else {
                const cameraStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });

                cameraStreamRef.current = cameraStream;

                for (const [peerId, manager] of peerManagers.current.entries()) {
                    const videoTrack = cameraStream.getVideoTracks()[0];
                    manager.addVideoTrack(videoTrack, cameraStream);
                    const offer = await manager.createOffer();
                    await sendSignal(peerId, 'offer', offer);
                }

                await supabase
                    .from('voice_channel_users')
                    .update({ is_video_enabled: true })
                    .eq('channel_id', activeChannelId)
                    .eq('user_id', user.id);

                setParticipants(prev => prev.map(p =>
                    p.user_id === user.id ? { ...p, cameraStream: cameraStream } : p
                ));

                setIsCameraEnabled(true);
            }
        } catch (error) {
            console.error('Error toggling camera:', error);
        }
    }, [isCameraEnabled, user, activeChannelId, isConnected]);

    // Auto-leave channel when active call starts (Status is active or connecting)
    useEffect(() => {
        // We leave the voice channel ONLY if the call is actually connecting or active.
        // We do NOT leave if it is just ringing (incoming or outgoing).
        // This allows the user to decide whether to accept/initiated call without losing context immediately.
        const shouldLeave = activeCall && activeChannelId && (callStatus === 'active' || callStatus === 'connecting');

        if (shouldLeave) {
            console.log('[VoiceChannelContext] Active call detected (status:', callStatus, '), leaving voice channel...');
            leaveChannel();
        }
    }, [activeCall, activeChannelId, callStatus, leaveChannel]);


    // Play soundboard audio - plays locally AND to separate soundpad track
    const playSoundboardAudio = useCallback((audioBuffer: AudioBuffer) => {
        console.log('[VoiceChannelContext] Playing soundboard audio, duration:', audioBuffer.duration, 's');
        console.log('[VoiceChannelContext] Connected:', isConnected, 'Peer count:', peerManagers.current.size);

        // Create or get audio context
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new AudioContext();
        }
        const ctx = audioContextRef.current;

        // Resume context if suspended (browser autoplay policy)
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        // Play locally through speakers
        const localSource = ctx.createBufferSource();
        localSource.buffer = audioBuffer;
        localSource.connect(ctx.destination);
        localSource.start();

        // Send to soundpad destination (separate track)
        if (soundpadDestinationRef.current) {
            console.log('[VoiceChannelContext] Sending soundboard to SEPARATE soundpad track');

            // Create buffer source for WebRTC transmission
            const remoteSource = ctx.createBufferSource();
            remoteSource.buffer = audioBuffer;

            // Create gain node for volume boost
            const soundGain = ctx.createGain();
            soundGain.gain.value = 1.5; // Slightly boost soundboard volume

            // Connect: source -> gain -> soundpad destination
            remoteSource.connect(soundGain);
            soundGain.connect(soundpadDestinationRef.current);
            remoteSource.start();

            console.log('[VoiceChannelContext] ✓ Soundboard audio routed to soundpad track');
        } else {
            console.log('[VoiceChannelContext] No soundpad destination, playing locally only');
        }
    }, [isConnected]);

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
