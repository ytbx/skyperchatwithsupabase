import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import type { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';
import { useCall } from './CallContext';
import { useVoiceChannel } from './VoiceChannelContext';

interface PresenceUser {
    user_id: string;
    online_at: string;
}

interface SupabaseRealtimeContextType {
    onlineUsers: Set<string>;
    isUserOnline: (userId: string) => boolean;
}

const SupabaseRealtimeContext = createContext<SupabaseRealtimeContextType | undefined>(undefined);

export function SupabaseRealtimeProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const { activeCall, endCall } = useCall();
    const { activeChannelId, leaveChannel } = useVoiceChannel();
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
    const [presenceChannel, setPresenceChannel] = useState<RealtimeChannel | null>(null);

    // Keep refs to current state to access in channel callback without re-subscribing
    const cleanupRefs = useRef({ activeCall, activeChannelId, endCall, leaveChannel });
    useEffect(() => {
        cleanupRefs.current = { activeCall, activeChannelId, endCall, leaveChannel };
    }, [activeCall, activeChannelId, endCall, leaveChannel]);

    useEffect(() => {
        if (!user) {
            // Cleanup when user logs out
            if (presenceChannel) {
                presenceChannel.unsubscribe();
                setPresenceChannel(null);
            }
            setOnlineUsers(new Set());
            return;
        }

        console.log('[SupabaseRealtime] Initializing realtime subscriptions for user:', user.id);

        // Create a global presence channel for all users
        const channel = supabase.channel('online-users', {
            config: {
                presence: {
                    key: user.id,
                },
            },
        });

        // Track presence state changes
        channel
            .on('presence', { event: 'sync' }, () => {
                const state: RealtimePresenceState<PresenceUser> = channel.presenceState();
                const online = new Set<string>();

                Object.values(state).forEach((presences) => {
                    presences.forEach((presence) => {
                        if (presence.user_id) {
                            online.add(presence.user_id);
                        }
                    });
                });

                console.log('[SupabaseRealtime] Presence sync - Online users:', online.size);
                setOnlineUsers(online);
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                console.log('[SupabaseRealtime] User joined:', key, newPresences);
                setOnlineUsers((prev) => {
                    const updated = new Set(prev);
                    newPresences.forEach((presence) => {
                        const presenceData = presence as unknown as PresenceUser;
                        if (presenceData.user_id) {
                            updated.add(presenceData.user_id);
                        }
                    });
                    return updated;
                });
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                console.log('[SupabaseRealtime] User left:', key, leftPresences);
                setOnlineUsers((prev) => {
                    const updated = new Set(prev);
                    leftPresences.forEach((presence) => {
                        const presenceData = presence as unknown as PresenceUser;
                        if (presenceData.user_id) {
                            updated.delete(presenceData.user_id);
                        }
                    });
                    return updated;
                });
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('[SupabaseRealtime] Presence channel subscribed');

                    // Track this user's presence
                    await channel.track({
                        user_id: user.id,
                        online_at: new Date().toISOString(),
                    });

                    console.log('[SupabaseRealtime] User presence tracked');
                }

                // Handle disconnection
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.log(`[SupabaseRealtime] Connection issue detected: ${status}`);
                    const { activeCall, endCall, activeChannelId, leaveChannel } = cleanupRefs.current;

                    if (activeCall) {
                        console.log('[SupabaseRealtime] Ending call due to connection loss');
                        endCall();
                    }
                    if (activeChannelId) {
                        console.log('[SupabaseRealtime] Leaving voice channel due to connection loss');
                        leaveChannel();
                    }
                }
            });

        setPresenceChannel(channel);

        // Subscribe to messages in channels the user is a member of
        const messagesChannel = supabase
            .channel('messages-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'messages'
                },
                (payload) => {
                    console.log('[SupabaseRealtime] Message change:', payload);
                }
            )
            .subscribe();

        // Subscribe to friend requests
        const friendRequestsChannel = supabase
            .channel('friend-requests-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'friend_requests',
                    filter: `to_user_id=eq.${user.id}`
                },
                (payload) => {
                    console.log('[SupabaseRealtime] Friend request change:', payload);
                }
            )
            .subscribe();

        // Heartbeat logic to keep user online and cleanup stale sessions
        const sendHeartbeat = async () => {
            if (user?.id) {
                try {
                    await supabase.rpc('update_user_heartbeat', { uid: user.id });
                    console.log('[SupabaseRealtime] Heartbeat sent');
                } catch (error) {
                    console.error('[SupabaseRealtime] Error sending heartbeat:', error);
                }
            }
        };

        // Send initial heartbeat
        sendHeartbeat();

        // Set up heartbeat interval (every 30 seconds)
        const heartbeatInterval = setInterval(sendHeartbeat, 30000);

        // Only add listener, don't call immediately
        window.addEventListener('beforeunload', sendHeartbeat);

        return () => {
            console.log('[SupabaseRealtime] Cleaning up subscriptions');

            // Clear heartbeat interval
            clearInterval(heartbeatInterval);

            // Untrack presence
            if (channel) {
                channel.untrack();
                channel.unsubscribe();
            }

            messagesChannel.unsubscribe();
            friendRequestsChannel.unsubscribe();
            window.removeEventListener('beforeunload', sendHeartbeat);
        };
    }, [user?.id]);

    const isUserOnline = useCallback((userId: string): boolean => {
        return onlineUsers.has(userId);
    }, [onlineUsers]);

    const value: SupabaseRealtimeContextType = {
        onlineUsers,
        isUserOnline,
    };

    return (
        <SupabaseRealtimeContext.Provider value={value}>
            {children}
        </SupabaseRealtimeContext.Provider>
    );
}

export function useSupabaseRealtime() {
    const context = useContext(SupabaseRealtimeContext);
    if (context === undefined) {
        throw new Error('useSupabaseRealtime must be used within a SupabaseRealtimeProvider');
    }
    return context;
}

