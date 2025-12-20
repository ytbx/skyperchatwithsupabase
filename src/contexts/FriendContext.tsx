import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { Friend, FriendRequest, Profile } from '../lib/types';
import { useSupabaseRealtime } from './SupabaseRealtimeContext';

interface FriendContextType {
    friends: ExtendedFriend[];
    friendRequests: ExtendedFriendRequest[];
    sentRequests: ExtendedFriendRequest[];
    loading: boolean;
    refreshFriends: () => Promise<void>;
    acceptFriendRequest: (requestId: string) => Promise<void>;
    declineFriendRequest: (requestId: string) => Promise<void>;
    removeFriend: (friendId: string) => Promise<void>;
    sendFriendRequest: (targetUserId: string) => Promise<void>;
}

export interface ExtendedFriend {
    id: string; // The friend's User ID (not the table ID)
    username: string;
    profile_image_url: string | null;
    status: 'online' | 'away' | 'busy' | 'offline';
    isOnline: boolean;
    tableId?: string; // The friend record ID
}

export interface ExtendedFriendRequest extends FriendRequest {
    requester?: Profile;
    requested?: Profile;
}

const FriendContext = createContext<FriendContextType | undefined>(undefined);

export const FriendProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { isUserOnline } = useSupabaseRealtime();
    const [friends, setFriends] = useState<ExtendedFriend[]>([]);
    const [friendRequests, setFriendRequests] = useState<ExtendedFriendRequest[]>([]);
    const [sentRequests, setSentRequests] = useState<ExtendedFriendRequest[]>([]);
    const [loading, setLoading] = useState<boolean>(true);

    const loadData = async () => {
        if (!user) {
            setFriends([]);
            setFriendRequests([]);
            setSentRequests([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        await Promise.all([loadFriends(), loadRequests()]);
        setLoading(false);
    };

    const loadFriends = async () => {
        if (!user) return;

        try {
            const { data: friendships, error } = await supabase
                .from('friends')
                .select(`
          *,
          requester:profiles!friends_requester_id_fkey(id, username, profile_image_url),
          requested:profiles!friends_requested_id_fkey(id, username, profile_image_url)
        `)
                .eq('status', 'accepted')
                .or(`requester_id.eq.${user.id},requested_id.eq.${user.id}`);

            if (error) throw error;

            const friendsList: ExtendedFriend[] = (friendships || []).map((friendship) => {
                const friend = friendship.requester_id === user.id ? friendship.requested : friendship.requester;
                const isOnline = isUserOnline(friend.id);
                return {
                    id: friend.id,
                    username: friend.username,
                    profile_image_url: friend.profile_image_url,
                    isOnline,
                    status: isOnline ? 'online' : 'offline', // Simplified status for now
                    tableId: friendship.id
                };
            });

            setFriends(friendsList);
        } catch (error) {
            console.error('Error loading friends:', error);
        }
    };

    const loadRequests = async () => {
        if (!user) return;

        try {
            // Incoming requests
            const { data: incoming, error: incomingError } = await supabase
                .from('friend_requests')
                .select(`
          *,
          requester:profiles!friend_requests_requester_id_fkey(id, username, profile_image_url)
        `)
                .eq('requested_id', user.id)
                .eq('status', 'pending');

            if (incomingError) throw incomingError;

            // Outgoing requests
            const { data: outgoing, error: outgoingError } = await supabase
                .from('friend_requests')
                .select(`
          *,
          requested:profiles!friend_requests_requested_id_fkey(id, username, profile_image_url)
        `)
                .eq('requester_id', user.id)
                .eq('status', 'pending');

            if (outgoingError) throw outgoingError;

            setFriendRequests(incoming as ExtendedFriendRequest[] || []);
            setSentRequests(outgoing as ExtendedFriendRequest[] || []);
        } catch (error) {
            console.error('Error loading friend requests:', error);
        }
    };

    useEffect(() => {
        loadData();

        if (!user) return;

        // Real-time subscriptions
        const friendsSubscription = supabase
            .channel('public:friends')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friends', filter: `requester_id=eq.${user.id}` }, loadFriends)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friends', filter: `requested_id=eq.${user.id}` }, loadFriends)
            .subscribe();

        const requestsSubscription = supabase
            .channel('public:friend_requests')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `requester_id=eq.${user.id}` }, loadRequests)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: `requested_id=eq.${user.id}` }, loadRequests)
            .subscribe();

        return () => {
            friendsSubscription.unsubscribe();
            requestsSubscription.unsubscribe();
        };
    }, [user]);

    // Update online status when it changes (since we derive it in loading, but want it reactive)
    // Actually simpler: we can re-evaluate 'isOnline' in the component or rely on a wrapper.
    // Integrating 'isUserOnline' from SupabaseRealtimeContext directly into the list items in UI is often better,
    // but if we want 'friends' list to update, we might need to re-map.
    // For now, let's keep it simple: The UI components should check `isUserOnline(friend.id)` from global context
    // or we re-map here when `isUserOnline` changes might be expensive.
    // Let's re-map friends when the list changes.

    const acceptFriendRequest = async (requestId: string) => {
        try {
            const { error } = await supabase
                .from('friend_requests')
                .update({ status: 'accepted' })
                .eq('id', requestId);
            if (error) throw error;

            // Trigger friend creation logic is usually handled by DB triggers or manual insert:
            const request = friendRequests.find(r => r.id === requestId);
            if (request) {
                // Check if friendship exists
                const { data: keyCheck } = await supabase.from('friends').select('id').or(`and(requester_id.eq.${request.requester_id},requested_id.eq.${request.requested_id}),and(requester_id.eq.${request.requested_id},requested_id.eq.${request.requester_id})`);

                if (!keyCheck || keyCheck.length === 0) {
                    await supabase.from('friends').insert({
                        requester_id: request.requester_id,
                        requested_id: request.requested_id,
                        status: 'accepted'
                    });
                }
            }
            // loadData will be triggered by realtime
        } catch (error) {
            console.error('Error accepting friend request:', error);
            throw error;
        }
    };

    const declineFriendRequest = async (requestId: string) => {
        const { error } = await supabase
            .from('friend_requests')
            .update({ status: 'declined' })
            .eq('id', requestId);
        if (error) throw error;
    };

    const removeFriend = async (friendId: string) => {
        if (!user) return;
        const { error } = await supabase
            .from('friends')
            .delete()
            .or(`and(requester_id.eq.${user.id},requested_id.eq.${friendId}),and(requester_id.eq.${friendId},requested_id.eq.${user.id})`);
        if (error) throw error;
    };

    const sendFriendRequest = async (targetUserId: string) => {
        if (!user) return;
        const { error } = await supabase
            .from('friend_requests')
            .insert({
                requester_id: user.id,
                requested_id: targetUserId,
                status: 'pending'
            });
        if (error) throw error;
    };

    return (
        <FriendContext.Provider value={{
            friends,
            friendRequests,
            sentRequests,
            loading,
            refreshFriends: loadData,
            acceptFriendRequest,
            declineFriendRequest,
            removeFriend,
            sendFriendRequest
        }}>
            {children}
        </FriendContext.Provider>
    );
};

export const useFriend = () => {
    const context = useContext(FriendContext);
    if (context === undefined) {
        throw new Error('useFriend must be used within a FriendProvider');
    }
    return context;
};
