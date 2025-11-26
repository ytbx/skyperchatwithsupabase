import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { useCall } from './CallContext';
import { WebRTCManager } from '@/services/WebRTCManager';
import { Profile } from '@/lib/types';

interface VoiceParticipant {
    user_id: string;
    profile: Profile;
    is_muted: boolean;
    is_deafened: boolean;
    is_video_enabled: boolean;
    is_screen_sharing: boolean;
    peerConnection?: RTCPeerConnection;
    stream?: MediaStream;
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
}

const VoiceChannelContext = createContext<VoiceChannelContextType | undefined>(undefined);

export function VoiceChannelProvider({ children }: { children: ReactNode }) {
    const { user, profile } = useAuth();
    const { activeCall, endCall } = useCall();

    const [activeChannelId, setActiveChannelId] = useState<number | null>(null);
    const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isCameraEnabled, setIsCameraEnabled] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);

    // Map of userId -> WebRTCManager
    const peerManagers = useRef<Map<string, WebRTCManager>>(new Map());
    const localStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);

    const activeChannelIdRef = useRef<number | null>(null);

    useEffect(() => {
        activeChannelIdRef.current = activeChannelId;
    }, [activeChannelId]);

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
        setParticipants([]);
    }, []);

    // Leave channel
    const leaveChannel = useCallback(async () => {
        if (!user) return;

        console.log('[VoiceChannelContext] Leaving channel...');

        // Stop local stream
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
            setLocalStream(null);
        }

        // Stop screen share
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;
        }

        // Stop camera
        if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks().forEach(track => track.stop());
            cameraStreamRef.current = null;
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
    }, [user, isConnected, cleanupPeerConnections]);

    // Join channel
    const joinChannel = useCallback(async (channelId: number) => {
        if (!user || !profile) return;

        console.log('[VoiceChannelContext] Request to join channel:', channelId);

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

            // 2. Get local media
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setLocalStream(stream);
            localStreamRef.current = stream;

            // Apply mute state
            stream.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });

            // 3. Add user to voice_channel_users
            const { error } = await supabase
                .from('voice_channel_users')
                .insert({
                    channel_id: channelId,
                    user_id: user.id,
                    is_muted: isMuted,
                    is_deafened: isDeafened
                });

            if (error) throw error;

            setIsConnected(true);

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
    }, [activeCall, endCall, user, profile, isMuted, isDeafened, leaveChannel]);

    // Initialize WebRTC connection with a peer
    const initiateConnection = async (peerId: string, channelId: number) => {
        if (peerManagers.current.has(peerId)) return;

        const manager = new WebRTCManager();
        peerManagers.current.set(peerId, manager);

        // Setup peer connection
        manager.createPeerConnection(
            (remoteStream) => {
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
            }
        );

        if (localStreamRef.current) {
            manager.addLocalStream(localStreamRef.current);
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
                }
            );

            if (localStreamRef.current) {
                manager.addLocalStream(localStreamRef.current);
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
            setParticipants(prev => {
                // Merge existing streams with new data
                return data.map((p: any) => {
                    const existing = prev.find(prevP => prevP.user_id === p.user_id);
                    return {
                        ...p,
                        stream: existing?.stream,
                        screenStream: existing?.screenStream,
                        cameraStream: existing?.cameraStream
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
                // Handle participant list updates
                fetchParticipants(activeChannelId);
            })
            .subscribe();

        fetchParticipants(activeChannelId);

        return () => {
            console.log('[VoiceChannelContext] Unsubscribing from channel updates');
            channelSub.unsubscribe();
        };
    }, [activeChannelId, user]);

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
    }, [user, cleanupPeerConnections]);

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
    }, [isMuted, activeChannelId, user, isConnected]);

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
    }, [isDeafened, activeChannelId, user, isConnected]);

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
                // Start screen sharing
                const screenStream = await navigator.mediaDevices.getDisplayMedia({
                    video: true,
                    audio: false
                });

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
                    .eq('channel_id', activeChannelId)
                    .eq('user_id', user.id);

                setParticipants(prev => prev.map(p =>
                    p.user_id === user.id ? { ...p, screenStream: screenStream } : p
                ));

                setIsScreenSharing(true);
            }
        } catch (error) {
            console.error('Error toggling screen share:', error);
        }
    }, [isScreenSharing, user, activeChannelId, isConnected]);

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

    // Auto-leave channel when active call starts
    useEffect(() => {
        if (activeCall && activeChannelId) {
            console.log('[VoiceChannelContext] Active call detected, leaving voice channel...');
            leaveChannel();
        }
    }, [activeCall, activeChannelId, leaveChannel]);

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
        toggleCamera
    };

    return (
        <VoiceChannelContext.Provider value={value}>
            {children}
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
