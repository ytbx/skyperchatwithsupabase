import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
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
}

export function useVoiceChannel(channelId: number | null) {
    const { user, profile } = useAuth();
    const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);

    // Map of userId -> WebRTCManager
    const peerManagers = useRef<Map<string, WebRTCManager>>(new Map());
    const localStreamRef = useRef<MediaStream | null>(null);

    const sendSignal = async (toUserId: string, type: string, payload: any) => {
        if (!user || !channelId) return;

        await supabase.from('webrtc_signals').insert({
            channel_id: channelId,
            from_user_id: user.id,
            to_user_id: toUserId,
            signal_type: type,
            payload
        });
    };

    // Join channel
    const joinChannel = useCallback(async () => {
        if (!channelId || !user || !profile) return;

        try {
            // 1. Get local media
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            setLocalStream(stream);
            localStreamRef.current = stream;

            // 2. Add user to voice_channel_users
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

            // 3. Fetch existing participants
            const { data: existingUsers } = await supabase
                .from('voice_channel_users')
                .select('*, profile:profiles(*)')
                .eq('channel_id', channelId)
                .neq('user_id', user.id);

            if (existingUsers) {
                // Initialize connections with existing users
                existingUsers.forEach(participant => {
                    initiateConnection(participant.user_id);
                });
            }

        } catch (error) {
            console.error('Error joining voice channel:', error);
            leaveChannel();
        }
    }, [channelId, user, profile, isMuted, isDeafened]);

    // Leave channel
    const leaveChannel = useCallback(async () => {
        if (!user) return;

        // Stop local stream
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
            setLocalStream(null);
        }

        // Close all peer connections
        peerManagers.current.forEach(manager => manager.cleanup());
        peerManagers.current.clear();

        if (channelId && isConnected) {
            await supabase
                .from('voice_channel_users')
                .delete()
                .eq('channel_id', channelId)
                .eq('user_id', user.id);
        }

        setIsConnected(false);
        setParticipants([]);
    }, [channelId, user, isConnected]);

    // Initialize WebRTC connection with a peer
    const initiateConnection = async (peerId: string) => {
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
                sendSignal(peerId, 'ice-candidate', candidate);
            }
        );

        if (localStreamRef.current) {
            manager.addLocalStream(localStreamRef.current);
        }

        // Create offer
        const offer = await manager.createOffer();
        await sendSignal(peerId, 'offer', offer);
    };

    // Handle incoming signals
    const handleSignal = async (payload: any) => {
        const { from_user_id, signal_type, payload: signalPayload } = payload;

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
                }
            );

            if (localStreamRef.current) {
                manager.addLocalStream(localStreamRef.current);
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

    // Subscribe to channel changes and signals
    useEffect(() => {
        if (!channelId || !user || !isConnected) return;

        const channel = supabase.channel(`voice_${channelId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'voice_channel_users',
                filter: `channel_id=eq.${channelId}`
            }, (payload) => {
                // Handle participant list updates
                fetchParticipants();
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'webrtc_signals',
                filter: `to_user_id=eq.${user.id}`
            }, (payload) => {
                handleSignal(payload.new);
            })
            .subscribe();

        fetchParticipants();

        return () => {
            channel.unsubscribe();
        };
    }, [channelId, user, isConnected]);

    // Handle mute toggle
    useEffect(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });
        }

        if (channelId && user && isConnected) {
            supabase
                .from('voice_channel_users')
                .update({ is_muted: isMuted })
                .eq('channel_id', channelId)
                .eq('user_id', user.id)
                .then(({ error }) => {
                    if (error) console.error('Error updating mute state:', error);
                });
        }
    }, [isMuted, channelId, user, isConnected]);

    // Handle deafen toggle
    useEffect(() => {
        // Deafen usually means muting incoming audio
        participants.forEach(p => {
            if (p.stream) {
                p.stream.getAudioTracks().forEach(track => {
                    track.enabled = !isDeafened;
                });
            }
        });

        if (channelId && user && isConnected) {
            supabase
                .from('voice_channel_users')
                .update({ is_deafened: isDeafened })
                .eq('channel_id', channelId)
                .eq('user_id', user.id)
                .then(({ error }) => {
                    if (error) console.error('Error updating deafen state:', error);
                });
        }
    }, [isDeafened, channelId, user, isConnected, participants]);

    const fetchParticipants = async () => {
        if (!channelId) return;

        const { data } = await supabase
            .from('voice_channel_users')
            .select('*, profile:profiles(*)')
            .eq('channel_id', channelId);

        if (data) {
            setParticipants(prev => {
                // Merge existing streams with new data
                return data.map((p: any) => {
                    const existing = prev.find(prevP => prevP.user_id === p.user_id);
                    return {
                        ...p,
                        stream: existing?.stream
                    };
                });
            });
        }
    };

    return {
        participants,
        isConnected,
        isMuted,
        isDeafened,
        joinChannel,
        leaveChannel,
        toggleMute: () => setIsMuted(!isMuted),
        toggleDeafen: () => setIsDeafened(!isDeafened)
    };
}
