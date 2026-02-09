import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import type { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';
import { useCall } from './CallContext';
import { useVoiceChannel } from './VoiceChannelContext';

interface PresenceUser {
    user_id: string;
    online_at: string;
    status?: 'online' | 'idle';
}

type UserStatus = 'online' | 'idle' | 'offline';

interface SupabaseRealtimeContextType {
    isIdle: boolean;
    onlineUsers: Set<string>;
    isUserOnline: (userId: string) => boolean;
    getUserStatus: (userId: string) => UserStatus;
}

const SupabaseRealtimeContext = createContext<SupabaseRealtimeContextType | undefined>(undefined);

export function SupabaseRealtimeProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const { activeCall, endCall } = useCall();
    const { activeChannelId, leaveChannel } = useVoiceChannel();
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
    const [userStatuses, setUserStatuses] = useState<Map<string, UserStatus>>(new Map());
    const [presenceChannel, setPresenceChannel] = useState<RealtimeChannel | null>(null);
    const [isIdle, setIsIdle] = useState(false);
    const disconnectionTimerRef = useRef<NodeJS.Timeout | null>(null);
    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

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
                const statuses = new Map<string, UserStatus>();

                Object.values(state).forEach((presences) => {
                    presences.forEach((presence) => {
                        if (presence.user_id) {
                            online.add(presence.user_id);
                            // Highest status wins (online > idle)
                            const current = statuses.get(presence.user_id);
                            if (presence.status === 'online' || !current) {
                                statuses.set(presence.user_id, presence.status || 'online');
                            }
                        }
                    });
                });

                console.log('[SupabaseRealtime] Presence sync - Online users:', online.size);
                setOnlineUsers(online);
                setUserStatuses(statuses);
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
                console.log('[SupabaseRealtime] Subscription status change:', status);

                if (status === 'SUBSCRIBED') {
                    console.log('[SupabaseRealtime] Presence channel subscribed');

                    // Clear any pending disconnection cleanup if we recover
                    if (disconnectionTimerRef.current) {
                        console.log('[SupabaseRealtime] Connection recovered, cancelling cleanup');
                        clearTimeout(disconnectionTimerRef.current);
                        disconnectionTimerRef.current = null;
                    }

                    // Track this user's presence
                    await channel.track({
                        user_id: user.id,
                        online_at: new Date().toISOString(),
                        status: 'online', // Initial status
                    });

                    console.log('[SupabaseRealtime] User presence tracked');
                }

                // Handle disconnection with a grace period
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    console.warn(`[SupabaseRealtime] Connection issue detected: ${status}. Waiting 15s before ending calls.`);

                    if (!disconnectionTimerRef.current) {
                        disconnectionTimerRef.current = setTimeout(() => {
                            console.error(`[SupabaseRealtime] Connection recovery timed out (${status}) - Cleanly ending sessions`);
                            const { activeCall, endCall, activeChannelId, leaveChannel } = cleanupRefs.current;

                            if (activeCall) {
                                console.log('[SupabaseRealtime] Grace period over: Ending call');
                                endCall();
                            }
                            if (activeChannelId) {
                                console.log('[SupabaseRealtime] Grace period over: Leaving voice channel');
                                leaveChannel();
                            }
                            disconnectionTimerRef.current = null;
                        }, 15000); // 15s grace period
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

        // Set up heartbeat interval (every 45 seconds for better presence accuracy)
        const heartbeatInterval = setInterval(sendHeartbeat, 45000);

        // Only add listener, don't call immediately
        window.addEventListener('beforeunload', sendHeartbeat);

        return () => {
            console.log('[SupabaseRealtime] Cleaning up subscriptions');

            // Clear timers
            clearInterval(heartbeatInterval);
            if (disconnectionTimerRef.current) {
                clearTimeout(disconnectionTimerRef.current);
            }
            if (idleTimerRef.current) {
                clearTimeout(idleTimerRef.current);
            }

            // Untrack presence
            if (channel) {
                channel.untrack();
                channel.unsubscribe();
            }

            messagesChannel.unsubscribe();
            friendRequestsChannel.unsubscribe();
            window.removeEventListener('beforeunload', sendHeartbeat);
        };
    }, [user?.id]); // REMOVED isIdle from here to prevent full channel re-subscription

    // Handle status updates separately to avoid re-subscribing the entire channel
    useEffect(() => {
        if (!presenceChannel || !user) return;

        console.log('[SupabaseRealtime] Status changed, updating presence tracking:', isIdle ? 'idle' : 'online');
        presenceChannel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
            status: isIdle ? 'idle' : 'online',
        });
    }, [isIdle, presenceChannel, user]);

    // Strengthen connection: Refresh on visibility change (recovers from tab backgrounding/sleep)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                console.log('[SupabaseRealtime] Tab became visible, checking connection...');
                // @ts-ignore - RealtimeChannel state property exists but might not be in basic types
                if (presenceChannel && (presenceChannel.state === 'closed' || presenceChannel.state === 'errored')) {
                    console.log('[SupabaseRealtime] Channel not active, re-subscribing');
                    presenceChannel.subscribe();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [presenceChannel]);

    // Idle detection logic
    useEffect(() => {
        if (!user || !presenceChannel) return;

        const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

        const resetIdleTimer = () => {
            if (isIdle) {
                console.log('[SupabaseRealtime] User active again');
                setIsIdle(false);
            }
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            idleTimerRef.current = setTimeout(() => {
                console.log('[SupabaseRealtime] User is now idle');
                setIsIdle(true);
            }, IDLE_TIMEOUT);
        };

        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
        events.forEach(event => window.addEventListener(event, resetIdleTimer));

        resetIdleTimer();

        return () => {
            events.forEach(event => window.removeEventListener(event, resetIdleTimer));
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        };
    }, [user, presenceChannel, isIdle]);

    const isUserOnline = useCallback((userId: string): boolean => {
        return onlineUsers.has(userId);
    }, [onlineUsers]);

    const getUserStatus = useCallback((userId: string): UserStatus => {
        if (!onlineUsers.has(userId)) return 'offline';
        return userStatuses.get(userId) || 'online';
    }, [onlineUsers, userStatuses]);

    const value: SupabaseRealtimeContextType = {
        isIdle,
        onlineUsers,
        isUserOnline,
        getUserStatus,
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

