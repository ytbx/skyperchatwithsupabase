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

export type UserStatus = 'online' | 'idle' | 'offline' | 'away' | 'busy';

interface SupabaseRealtimeContextType {
    isIdle: boolean;
    onlineUsers: Set<string>;
    isUserOnline: (userId: string) => boolean;
    getUserStatus: (userId: string) => UserStatus;
    getStatusColor: (status: string) => string;
    getStatusTextColor: (status: string) => string;
    getStatusText: (status: string) => string;
}

const SupabaseRealtimeContext = createContext<SupabaseRealtimeContextType | undefined>(undefined);

export function SupabaseRealtimeProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const { activeCall, endCall } = useCall();
    const { activeChannelId, leaveChannel } = useVoiceChannel();
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
    const [presenceStatuses, setPresenceStatuses] = useState<Map<string, UserStatus>>(new Map());
    const [isIdle, setIsIdle] = useState(false);
    const disconnectionTimerRef = useRef<NodeJS.Timeout | null>(null);
    const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isIdleRef = useRef(false);
    const presenceChannelRef = useRef<RealtimeChannel | null>(null);
    const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const trackingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const isSubscribedRef = useRef(false);

    // Keep refs to current state to access in channel callback without re-subscribing
    const cleanupRefs = useRef({ activeCall, activeChannelId, endCall, leaveChannel });
    useEffect(() => {
        cleanupRefs.current = { activeCall, activeChannelId, endCall, leaveChannel };
    }, [activeCall, activeChannelId, endCall, leaveChannel]);

    // Keep isIdleRef in sync
    useEffect(() => {
        isIdleRef.current = isIdle;
    }, [isIdle]);

    /**
     * Rebuild the full presence state from the channel's presenceState()
     * This is the SINGLE SOURCE OF TRUTH for who is online.
     */
    const rebuildPresenceState = useCallback((channel: RealtimeChannel) => {
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

        console.log('[SupabaseRealtime] Presence rebuilt - Online users:', online.size, 
            'Users:', Array.from(online).join(', '));
        setOnlineUsers(online);
        setPresenceStatuses(statuses);
    }, []);

    /**
     * Track this user's presence on the channel with retry logic
     */
    const trackPresence = useCallback(async (channel: RealtimeChannel, userId: string, retries = 3) => {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const result = await channel.track({
                    user_id: userId,
                    online_at: new Date().toISOString(),
                    status: isIdleRef.current ? 'idle' : 'online',
                });

                if (result === 'ok') {
                    console.log(`[SupabaseRealtime] ✓ Presence tracked (attempt ${attempt})`);
                    return true;
                } else {
                    console.warn(`[SupabaseRealtime] Track returned: ${result} (attempt ${attempt})`);
                }
            } catch (err) {
                console.error(`[SupabaseRealtime] Track failed (attempt ${attempt}):`, err);
            }

            // Wait before retry
            if (attempt < retries) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
        console.error('[SupabaseRealtime] ✗ All track attempts failed');
        return false;
    }, []);

    /**
     * Send heartbeat to keep DB-side status in sync
     */
    const sendHeartbeat = useCallback(async (userId: string) => {
        try {
            await supabase.rpc('update_user_heartbeat', { uid: userId });
        } catch (error) {
            console.error('[SupabaseRealtime] Heartbeat error:', error);
        }
    }, []);

    /**
     * Run periodic cleanup of stale data (called less frequently)
     */
    const runPeriodicCleanup = useCallback(async () => {
        try {
            await supabase.rpc('periodic_cleanup');
            console.log('[SupabaseRealtime] Periodic cleanup executed');
        } catch (error) {
            // periodic_cleanup may not exist on older deployments, that's ok
            console.warn('[SupabaseRealtime] Periodic cleanup error (non-critical):', error);
        }
    }, []);

    /**
     * Set user offline in DB
     */
    const goOffline = useCallback(async (userId: string) => {
        try {
            console.log('[SupabaseRealtime] Setting user offline');
            await supabase.rpc('set_user_offline', { uid: userId });
        } catch (error) {
            console.error('[SupabaseRealtime] Error setting offline:', error);
        }
    }, []);

    // Main presence effect
    useEffect(() => {
        if (!user) {
            // Cleanup when user logs out
            if (presenceChannelRef.current) {
                presenceChannelRef.current.untrack();
                presenceChannelRef.current.unsubscribe();
                presenceChannelRef.current = null;
            }
            isSubscribedRef.current = false;
            setOnlineUsers(new Set());
            setPresenceStatuses(new Map());
            return;
        }

        const userId = user.id;
        console.log('[SupabaseRealtime] Initializing realtime subscriptions for user:', userId);

        // Create a global presence channel for all users
        const channel = supabase.channel('online-users', {
            config: {
                presence: {
                    key: userId,
                },
            },
        });

        // Track presence state changes - SYNC is the authoritative event
        channel
            .on('presence', { event: 'sync' }, () => {
                rebuildPresenceState(channel);
            })
            .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                console.log('[SupabaseRealtime] User joined:', key);
                // Immediately add to online set for responsiveness
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
                setPresenceStatuses((prev) => {
                    const updated = new Map(prev);
                    newPresences.forEach((presence) => {
                        const presenceData = presence as unknown as PresenceUser;
                        if (presenceData.user_id) {
                            updated.set(presenceData.user_id, presenceData.status || 'online');
                        }
                    });
                    return updated;
                });
            })
            .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                console.log('[SupabaseRealtime] User left:', key);
                // Check if user has any remaining presences before removing
                // The sync event will correct this, but we do immediate update for responsiveness
                const state: RealtimePresenceState<PresenceUser> = channel.presenceState();
                
                leftPresences.forEach((presence) => {
                    const presenceData = presence as unknown as PresenceUser;
                    if (presenceData.user_id) {
                        // Check if the user still has other presence entries
                        const remainingPresences = Object.values(state).flat().filter(
                            (p) => (p as unknown as PresenceUser).user_id === presenceData.user_id
                        );
                        
                        if (remainingPresences.length === 0) {
                            // Actually gone - remove from sets
                            setOnlineUsers((prev) => {
                                const updated = new Set(prev);
                                updated.delete(presenceData.user_id);
                                return updated;
                            });
                            setPresenceStatuses((prev) => {
                                const updated = new Map(prev);
                                updated.delete(presenceData.user_id);
                                return updated;
                            });
                        }
                    }
                });
            })
            .subscribe(async (status) => {
                console.log('[SupabaseRealtime] Subscription status:', status);

                if (status === 'SUBSCRIBED') {
                    console.log('[SupabaseRealtime] ✓ Presence channel subscribed');
                    isSubscribedRef.current = true;

                    // Clear any pending disconnection cleanup
                    if (disconnectionTimerRef.current) {
                        console.log('[SupabaseRealtime] Connection recovered, cancelling cleanup');
                        clearTimeout(disconnectionTimerRef.current);
                        disconnectionTimerRef.current = null;
                    }

                    // Track this user's presence with retry
                    await trackPresence(channel, userId);
                    
                    // Send initial heartbeat
                    await sendHeartbeat(userId);
                }

                // Handle disconnection with a grace period
                if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    console.warn(`[SupabaseRealtime] Connection issue: ${status}`);
                    isSubscribedRef.current = false;

                    if (!disconnectionTimerRef.current) {
                        disconnectionTimerRef.current = setTimeout(() => {
                            console.error(`[SupabaseRealtime] Connection recovery timed out (${status})`);
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

                    // Try to re-subscribe after a delay
                    setTimeout(() => {
                        if (!isSubscribedRef.current && presenceChannelRef.current) {
                            console.log('[SupabaseRealtime] Attempting re-subscribe...');
                            presenceChannelRef.current.subscribe();
                        }
                    }, 3000);
                }
            });

        presenceChannelRef.current = channel;

        // ---- HYBRID FALLBACK: Fetch online users from database every 15 seconds ----
        // This ensures the frontend stays correct even if Realtime WebSocket completely fails
        const fetchDBPresence = async () => {
            try {
                const { data, error } = await supabase
                    .from('user_activity')
                    .select('user_id, status');
                
                if (error) throw error;
                
                if (data) {
                    setOnlineUsers((prev) => {
                        const updated = new Set(prev);
                        let changed = false;
                        data.forEach((u: any) => {
                            // Consider 'idle' as online for connection tracking purposes
                            if (u.status === 'online' || u.status === 'idle') {
                                if (!updated.has(u.user_id)) {
                                    updated.add(u.user_id);
                                    changed = true;
                                }
                            } else {
                                if (updated.has(u.user_id)) {
                                    updated.delete(u.user_id);
                                    changed = true;
                                }
                            }
                        });
                        return changed ? updated : prev;
                    });

                    setPresenceStatuses((prev) => {
                        const updated = new Map(prev);
                        let changed = false;
                        data.forEach((u: any) => {
                            if (u.status === 'online' || u.status === 'idle') {
                                if (updated.get(u.user_id) !== u.status) {
                                    updated.set(u.user_id, u.status);
                                    changed = true;
                                }
                            } else {
                                if (updated.has(u.user_id)) {
                                    updated.delete(u.user_id);
                                    changed = true;
                                }
                            }
                        });
                        return changed ? updated : prev;
                    });
                }
            } catch (err) {
                // Ignore silent errors for fallback
            }
        };

        // Fetch immediately and then poll
        fetchDBPresence();
        fallbackIntervalRef.current = setInterval(fetchDBPresence, 15000);

        // ---- HEARTBEAT: Send every 30 seconds ----
        heartbeatIntervalRef.current = setInterval(() => sendHeartbeat(userId), 30000);

        // ---- RE-TRACK: Re-announce presence every 25 seconds ----
        // This ensures we stay visible even if Supabase drops our presence silently
        trackingIntervalRef.current = setInterval(() => {
            if (isSubscribedRef.current && presenceChannelRef.current) {
                trackPresence(presenceChannelRef.current, userId, 1); // Single attempt for periodic
            }
        }, 25000);

        // ---- PERIODIC CLEANUP: Run every 2 minutes ----
        cleanupIntervalRef.current = setInterval(runPeriodicCleanup, 120000);
        // Run first cleanup after 30 seconds
        setTimeout(runPeriodicCleanup, 30000);

        // ---- BEFOREUNLOAD: Set offline when leaving ----
        const handleBeforeUnload = () => goOffline(userId);
        window.addEventListener('beforeunload', handleBeforeUnload);

        // Cleanup
        return () => {
            console.log('[SupabaseRealtime] Cleaning up subscriptions');

            // Clear all timers
            if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
            if (trackingIntervalRef.current) clearInterval(trackingIntervalRef.current);
            if (cleanupIntervalRef.current) clearInterval(cleanupIntervalRef.current);
            if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
            if (disconnectionTimerRef.current) clearTimeout(disconnectionTimerRef.current);
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

            heartbeatIntervalRef.current = null;
            trackingIntervalRef.current = null;
            cleanupIntervalRef.current = null;
            fallbackIntervalRef.current = null;
            disconnectionTimerRef.current = null;

            // Untrack and unsubscribe presence
            if (channel) {
                channel.untrack();
                channel.unsubscribe();
            }
            presenceChannelRef.current = null;
            isSubscribedRef.current = false;

            window.removeEventListener('beforeunload', handleBeforeUnload);

            // Set offline on cleanup
            goOffline(userId);
        };
    }, [user?.id]); // ONLY depend on user.id

    // Handle idle status updates separately to avoid full re-subscribe
    useEffect(() => {
        if (!presenceChannelRef.current || !user || !isSubscribedRef.current) return;

        console.log('[SupabaseRealtime] Status changed:', isIdle ? 'idle' : 'online');
        presenceChannelRef.current.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
            status: isIdle ? 'idle' : 'online',
        });
    }, [isIdle, user]);

    // Recover on tab visibility change
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && user?.id) {
                console.log('[SupabaseRealtime] Tab visible, checking connection...');
                const ch = presenceChannelRef.current;

                if (!ch) return;

                // Re-track presence immediately
                trackPresence(ch, user.id, 2);
                // Re-send heartbeat
                sendHeartbeat(user.id);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, [user?.id, trackPresence, sendHeartbeat]);

    // Idle detection
    useEffect(() => {
        if (!user) return;

        const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes

        const resetIdleTimer = () => {
            if (isIdleRef.current) {
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
    }, [user?.id]);

    const isUserOnline = useCallback((userId: string): boolean => {
        return onlineUsers.has(userId);
    }, [onlineUsers]);

    const getUserStatus = useCallback((userId: string): UserStatus => {
        const presenceStatus = presenceStatuses.get(userId);
        if (presenceStatus) return presenceStatus;
        return 'offline';
    }, [presenceStatuses]);

    const getStatusColor = useCallback((status: string): string => {
        switch (status) {
            case 'online': return 'bg-green-500';
            case 'idle': return 'bg-blue-500';
            case 'away': return 'bg-yellow-500';
            case 'busy': return 'bg-red-500';
            default: return 'bg-gray-500';
        }
    }, []);

    const getStatusTextColor = useCallback((status: string): string => {
        switch (status) {
            case 'online': return 'text-green-400';
            case 'idle': return 'text-blue-400';
            case 'away': return 'text-yellow-400';
            case 'busy': return 'text-red-400';
            default: return 'text-gray-400';
        }
    }, []);

    const getStatusText = useCallback((status: string): string => {
        switch (status) {
            case 'online': return 'Çevrimiçi';
            case 'idle': return 'Boşta';
            case 'away': return 'Uzakta';
            case 'busy': return 'Meşgul';
            default: return 'Çevrimdışı';
        }
    }, []);

    const value: SupabaseRealtimeContextType = {
        isIdle,
        onlineUsers,
        isUserOnline,
        getUserStatus,
        getStatusColor,
        getStatusTextColor,
        getStatusText,
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
