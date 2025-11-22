import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Profile } from '../../lib/types';
import { UserPlus, Users, UserMinus, Check, X, Search } from 'lucide-react';

interface Friend {
  id: string;
  username: string;
  profile_image_url: string | null;
  isOnline: boolean;
  status: 'online' | 'away' | 'busy' | 'offline';
}

interface FriendRequest {
  id: string;
  requester_id: string;
  requested_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  requester: Profile;
  requested?: Profile;
}

interface FriendsListProps {
  onStartDM: (friendId: string, friendName: string) => void;
}

export const FriendsList: React.FC<FriendsListProps> = ({
  onStartDM
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'friends' | 'pending' | 'add'>('friends');
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [newFriendUsername, setNewFriendUsername] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);

  useEffect(() => {
    if (user) {
      loadFriends();
      loadFriendRequests();
      loadSentRequests();
    }
  }, [user]);

  const loadFriends = async () => {
    if (!user) return;

    try {
      // Get accepted friend relationships
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

      const friendsList: Friend[] = [];

      for (const friendship of friendships || []) {
        const friend = friendship.requester_id === user.id
          ? friendship.requested
          : friendship.requester;

        friendsList.push({
          id: friend.id,
          username: friend.username,
          profile_image_url: friend.profile_image_url,
          isOnline: false, // Will be updated by presence
          status: 'offline'
        });
      }

      setFriends(friendsList);
    } catch (error) {
      console.error('Error loading friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFriendRequests = async () => {
    if (!user) return;

    try {
      // Get pending friend requests sent to current user
      const { data: requests, error } = await supabase
        .from('friend_requests')
        .select(`
          *,
          requester:profiles!friend_requests_requester_id_fkey(id, username, profile_image_url)
        `)
        .eq('requested_id', user.id)
        .eq('status', 'pending');

      if (error) throw error;

      setFriendRequests(requests || []);
    } catch (error) {
      console.error('Error loading friend requests:', error);
    }
  };

  const loadSentRequests = async () => {
    if (!user) return;

    try {
      // Get pending friend requests sent by current user
      const { data: requests, error } = await supabase
        .from('friend_requests')
        .select(`
          *,
          requested:profiles!friend_requests_requested_id_fkey(id, username, profile_image_url)
        `)
        .eq('requester_id', user.id)
        .eq('status', 'pending');

      if (error) throw error;

      setSentRequests(requests || []);
    } catch (error) {
      console.error('Error loading sent requests:', error);
    }
  };

  // Search users
  const searchUsers = async (query: string) => {
    if (!user || !query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearchingUsers(true);
    try {
      const { data: users, error } = await supabase
        .from('profiles')
        .select('id, username, profile_image_url')
        .ilike('username', `%${query.trim()}%`)
        .limit(10);

      if (error) throw error;

      // Get all pending requests (both directions) and existing friends
      const { data: pendingRequests } = await supabase
        .from('friend_requests')
        .select('requester_id, requested_id')
        .eq('status', 'pending')
        .or(`requester_id.eq.${user.id},requested_id.eq.${user.id}`);

      const pendingUserIds = new Set();
      (pendingRequests || []).forEach(request => {
        if (request.requester_id === user.id) {
          pendingUserIds.add(request.requested_id);
        } else {
          pendingUserIds.add(request.requester_id);
        }
      });

      // Filter out current user, existing friends, and users with pending requests
      const filteredUsers = (users || []).filter(profile => {
        if (profile.id === user.id) return false;

        // Check if already friends
        if (friends.some(friend => friend.id === profile.id)) return false;

        // Check if there's a pending request
        if (pendingUserIds.has(profile.id)) return false;

        return true;
      });

      setSearchResults(filteredUsers);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearchingUsers(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (newFriendUsername.trim()) {
        searchUsers(newFriendUsername);
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [newFriendUsername]);

  const handleFriendRequestByUsername = async (username: string) => {
    if (!user || !username.trim() || sendingRequest) return;

    try {
      setSendingRequest(true);

      // Find user by username
      const { data: targetUser, error: userError } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('username', username.trim())
        .single();

      if (userError || !targetUser) {
        alert('Kullanıcı bulunamadı');
        return;
      }

      if (targetUser.id === user.id) {
        alert('Kendinize arkadaş isteği gönderemezsiniz');
        return;
      }

      // Check if already friends
      const { data: existingFriendship } = await supabase
        .from('friends')
        .select('*')
        .eq('status', 'accepted')
        .or(`
          and(requester_id.eq.${user.id},requested_id.eq.${targetUser.id}),
          and(requester_id.eq.${targetUser.id},requested_id.eq.${user.id})
        `);

      if (existingFriendship && existingFriendship.length > 0) {
        alert('Bu kullanıcı zaten arkadaşınız');
        return;
      }

      // Check if request already exists (both directions)
      const { data: existingRequest } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('status', 'pending')
        .or(`
          and(requester_id.eq.${user.id},requested_id.eq.${targetUser.id}),
          and(requester_id.eq.${targetUser.id},requested_id.eq.${user.id})
        `);

      if (existingRequest && existingRequest.length > 0) {
        alert('Bu kullanıcıyla zaten bekleyen bir arkadaş isteği var');
        return;
      }

      // Send friend request
      const { error: requestError } = await supabase
        .from('friend_requests')
        .insert({
          requester_id: user.id,
          requested_id: targetUser.id,
          status: 'pending'
        });

      if (requestError) throw requestError;

      setNewFriendUsername('');
      setSearchResults([]);
      alert('Arkadaş isteği gönderildi!');
    } catch (error) {
      console.error('Error sending friend request:', error);
      alert('Arkadaş isteği gönderilemedi');
    } finally {
      setSendingRequest(false);
    }
  };

  const handleFriendRequest = async (requestId: string, action: 'accept' | 'decline') => {
    try {
      if (action === 'accept') {
        // Update request status
        const { error: updateError } = await supabase
          .from('friend_requests')
          .update({ status: 'accepted' })
          .eq('id', requestId);

        if (updateError) throw updateError;

        // Check if friendship already exists before creating
        const request = friendRequests.find(r => r.id === requestId);
        if (request) {
          const { data: existingFriendship } = await supabase
            .from('friends')
            .select('*')
            .eq('status', 'accepted')
            .or(`
              and(requester_id.eq.${request.requester_id},requested_id.eq.${request.requested_id}),
              and(requester_id.eq.${request.requested_id},requested_id.eq.${request.requester_id})
            `);

          if (!existingFriendship || existingFriendship.length === 0) {
            const { error: friendshipError } = await supabase
              .from('friends')
              .insert({
                requester_id: request.requester_id,
                requested_id: request.requested_id,
                status: 'accepted'
              });

            if (friendshipError) throw friendshipError;
          }
        }
      } else {
        // Decline request
        const { error: updateError } = await supabase
          .from('friend_requests')
          .update({ status: 'declined' })
          .eq('id', requestId);

        if (updateError) throw updateError;
      }

      // Reload data
      loadFriends();
      loadFriendRequests();
      loadSentRequests();
    } catch (error) {
      console.error('Error handling friend request:', error);
    }
  };

  const removeFriend = async (friendId: string) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('friends')
        .delete()
        .or(`
          and(requester_id.eq.${user.id},requested_id.eq.${friendId}),
          and(requester_id.eq.${friendId},requested_id.eq.${user.id})
        `);

      if (error) throw error;

      loadFriends();
    } catch (error) {
      console.error('Error removing friend:', error);
    }
  };

  const filteredFriends = friends.filter(friend =>
    friend.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'busy': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return 'Çevrimiçi';
      case 'away': return 'Uzakta';
      case 'busy': return 'Meşgul';
      default: return 'Çevrimdışı';
    }
  };

  return (
    <div className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-white font-semibold mb-4 flex items-center">
          <Users size={20} className="mr-2" />
          Arkadaşlar
        </h2>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-2 px-3 rounded-md text-sm transition-colors ${activeTab === 'friends'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            Arkadaşlar
          </button>
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 py-2 px-3 rounded-md text-sm transition-colors relative ${activeTab === 'pending'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            Bekleyen
            {friendRequests.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {friendRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('add')}
            className={`flex-1 py-2 px-3 rounded-md text-sm transition-colors ${activeTab === 'add'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white'
              }`}
          >
            Ekle
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'friends' && (
          <>
            {/* Search */}
            <div className="p-4">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Arkadaş ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 text-sm"
                />
              </div>
            </div>

            {/* Friends List */}
            <div className="px-2 pb-4">
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-pulse text-gray-400">Yükleniyor...</div>
                </div>
              ) : filteredFriends.length === 0 ? (
                <div className="text-center py-8">
                  <Users size={48} className="text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 text-sm">
                    {searchQuery ? 'Arama sonucu bulunamadı' : 'Henüz arkadaşınız yok'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredFriends.map((friend) => (
                    <div
                      key={friend.id}
                      className="p-3 rounded-lg hover:bg-gray-800 transition-colors group cursor-pointer"
                      onClick={() => onStartDM(friend.id, friend.username)}
                    >
                      <div className="flex items-center space-x-3">
                        {/* Avatar */}
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-medium">
                            {friend.username.charAt(0).toUpperCase()}
                          </span>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-white font-medium text-sm truncate">
                            {friend.username}
                          </h3>
                          <p className="text-xs text-gray-400 truncate">
                            Arkadaş
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFriend(friend.id);
                            }}
                            className="p-1 hover:bg-gray-700 rounded"
                            title="Arkadaşlıktan çıkar"
                          >
                            <UserMinus size={14} className="text-red-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'pending' && (
          <div className="p-4">
            {/* Incoming Requests */}
            {friendRequests.length > 0 && (
              <div className="mb-6">
                <h3 className="text-white font-medium mb-3">Gelen İstekler</h3>
                <div className="space-y-3">
                  {friendRequests.map((request) => (
                    <div
                      key={request.id}
                      className="p-3 bg-gray-800 rounded-lg border border-gray-800"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-medium">
                            {request.requester.username.charAt(0).toUpperCase()}
                          </span>
                        </div>

                        <div className="flex-1">
                          <h3 className="text-white font-medium text-sm">
                            {request.requester.username}
                          </h3>
                          <p className="text-gray-400 text-xs">
                            Arkadaş isteği gönderdi
                          </p>
                        </div>
                      </div>

                      <div className="flex space-x-2 mt-3">
                        <button
                          onClick={() => handleFriendRequest(request.id, 'accept')}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded text-sm transition-colors flex items-center justify-center"
                        >
                          <Check size={14} className="mr-1" />
                          Kabul Et
                        </button>
                        <button
                          onClick={() => handleFriendRequest(request.id, 'decline')}
                          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded text-sm transition-colors flex items-center justify-center"
                        >
                          <X size={14} className="mr-1" />
                          Reddet
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sent Requests */}
            {sentRequests.length > 0 && (
              <div>
                <h3 className="text-white font-medium mb-3">Gönderilen İstekler</h3>
                <div className="space-y-3">
                  {sentRequests.map((request) => (
                    <div
                      key={request.id}
                      className="p-3 bg-gray-800 rounded-lg border border-gray-800"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-medium">
                            {request.requested.username.charAt(0).toUpperCase()}
                          </span>
                        </div>

                        <div className="flex-1">
                          <h3 className="text-white font-medium text-sm">
                            {request.requested.username}
                          </h3>
                          <p className="text-gray-400 text-xs">
                            İstek gönderildi, bekliyor
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {friendRequests.length === 0 && sentRequests.length === 0 && (
              <div className="text-center py-8">
                <UserPlus size={48} className="text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 text-sm">Bekleyen arkadaş isteği yok</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'add' && (
          <div className="p-4">
            <div className="text-center mb-6">
              <UserPlus size={48} className="text-gray-600 mx-auto mb-4" />
              <h3 className="text-white font-semibold mb-2">Arkadaş Ekle</h3>
              <p className="text-gray-400 text-sm">
                Kullanıcı adını girerek arkadaş isteği gönder
              </p>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Kullanıcı adı ara..."
                value={newFriendUsername}
                onChange={(e) => setNewFriendUsername(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />

              {/* Search Results */}
              {newFriendUsername.trim() && (
                <div className="max-h-60 overflow-y-auto">
                  {searchingUsers ? (
                    <div className="text-center py-4">
                      <div className="animate-pulse text-gray-400 text-sm">Aranıyor...</div>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-gray-400 text-sm">Kullanıcı bulunamadı</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {searchResults.map((user) => (
                        <div
                          key={user.id}
                          className="flex items-center space-x-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                        >
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                            <span className="text-white text-sm font-medium">
                              {user.username.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-white font-medium text-sm truncate">
                              {user.username}
                            </h4>
                          </div>
                          <button
                            onClick={() => {
                              setNewFriendUsername(user.username);
                              setSearchResults([]);
                            }}
                            className="p-1 hover:bg-green-600 rounded transition-colors"
                            title="Seç"
                          >
                            <UserPlus size={14} className="text-green-400" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  if (searchResults.length > 0) {
                    // Use first search result if available
                    const selectedUser = searchResults[0];
                    handleFriendRequestByUsername(selectedUser.username);
                  } else {
                    // Try to send request with entered username
                    handleFriendRequestByUsername(newFriendUsername.trim());
                  }
                }}
                disabled={!newFriendUsername.trim() || sendingRequest || searchingUsers}
                className={`w-full py-3 rounded-lg text-sm font-medium transition-colors ${newFriendUsername.trim() && !sendingRequest && !searchingUsers
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  }`}
              >
                {sendingRequest ? 'Gönderiliyor...' : 'Arkadaş İsteği Gönder'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
