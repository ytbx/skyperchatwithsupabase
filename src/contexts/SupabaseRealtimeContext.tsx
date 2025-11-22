import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import type { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js';

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
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
    const [presenceChannel, setPresenceChannel] = useState<RealtimeChannel | null>(null);

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

        // Update last_seen on window close/refresh
        const updateLastSeen = async () => {
            if (user?.id) {
                await supabase.rpc('update_user_last_seen', { user_id: user.id });
            }
        };

        window.addEventListener('beforeunload', updateLastSeen);

        return () => {
            console.log('[SupabaseRealtime] Cleaning up subscriptions');

            // Update last_seen before cleanup
            updateLastSeen();

            // Untrack presence
            if (channel) {
                channel.untrack();
                channel.unsubscribe();
            }

            messagesChannel.unsubscribe();
            friendRequestsChannel.unsubscribe();
            window.removeEventListener('beforeunload', updateLastSeen);
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

