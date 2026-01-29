import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useSupabaseRealtime } from '../../contexts/SupabaseRealtimeContext';
import { Profile, Friend, FriendRequest } from '../../lib/types';
import { UserPlus, Users, UserMinus, Check, X, Search } from 'lucide-react';
import { useFriend } from '../../contexts/FriendContext';
import { UserVolumeContextMenu } from '../voice/UserVolumeContextMenu';

// Local interfaces removed in favor of FriendContext types
import { ExtendedFriend, ExtendedFriendRequest } from '../../contexts/FriendContext';

import { UserConnectionPanel } from '../layout/UserConnectionPanel';

interface FriendsListProps {
  onStartDM: (friendId: string, friendName: string, profileImageUrl: string | null) => void;
}

export const FriendsList: React.FC<FriendsListProps> = ({
  onStartDM
}) => {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  /* eslint-disable react-hooks/exhaustive-deps */
  const { user } = useAuth();
  const { isUserOnline } = useSupabaseRealtime();
  const { friends, friendRequests, sentRequests, loading, acceptFriendRequest, declineFriendRequest, removeFriend, sendFriendRequest, cancelFriendRequest } = useFriend();

  const [activeTab, setActiveTab] = useState<'friends' | 'pending' | 'add'>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [newFriendUsername, setNewFriendUsername] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [volumeContextMenu, setVolumeContextMenu] = useState<{ x: number; y: number; friend: ExtendedFriend } | null>(null);
  const [friendToRemove, setFriendToRemove] = useState<ExtendedFriend | null>(null);

  // Search users - wrapped in useCallback to prevent unnecessary re-renders
  // Note: Modified slightly to filter out friends from context
  const searchUsers = React.useCallback(async (query: string) => {
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

      // Filter locally based on context data instead of DB queries
      const friendIds = new Set(friends.map(f => f.id));
      const pendingIds = new Set([
        ...friendRequests.map(r => r.requester_id),
        ...sentRequests.map(r => r.requested_id)
      ]);

      // Filter out current user, existing friends, and users with pending requests
      const filteredUsers = (users || []).filter(profile => {
        if (profile.id === user.id) return false;
        if (friendIds.has(profile.id)) return false;
        if (pendingIds.has(profile.id)) return false;
        return true;
      });

      setSearchResults(filteredUsers);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearchingUsers(false);
    }
  }, [user, friends, friendRequests, sentRequests]);

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
  }, [newFriendUsername, searchUsers]);

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

      // Check context for existing relationships to avoid extra DB calls
      if (friends.some(f => f.id === targetUser.id)) {
        alert('Bu kullanıcı zaten arkadaşınız');
        return;
      }

      if (friendRequests.some(r => r.requester_id === targetUser.id) || sentRequests.some(r => r.requested_id === targetUser.id)) {
        alert('Bu kullanıcıyla zaten bekleyen bir arkadaş isteği var');
        return;
      }

      await sendFriendRequest(targetUser.id);

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
        await acceptFriendRequest(requestId);
      } else {
        await declineFriendRequest(requestId);
      }
    } catch (error) {
      console.error('Error handling friend request:', error);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    try {
      await removeFriend(friendId);
    } catch (error) {
      console.error(error);
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
    <>
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
                        onClick={() => onStartDM(friend.id, friend.username, friend.profile_image_url)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setVolumeContextMenu({ x: e.clientX, y: e.clientY, friend });
                        }}
                      >
                        <div className="flex items-center space-x-3">
                          {/* Avatar with online status */}
                          <div className="relative">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center overflow-hidden">
                              {friend.profile_image_url ? (
                                <img
                                  src={friend.profile_image_url}
                                  alt={friend.username}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-white text-sm font-medium">
                                  {friend.username.charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                            {/* Online status indicator */}
                            <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-900 ${isUserOnline(friend.id) ? 'bg-green-500' : 'bg-gray-500'
                              }`} />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <h3 className="text-white font-medium text-sm truncate">
                              {friend.username}
                            </h3>
                            <p className={`text-xs truncate ${isUserOnline(friend.id) ? 'text-green-400' : 'text-gray-400'
                              }`}>
                              {isUserOnline(friend.id) ? 'Çevrimiçi' : 'Çevrimdışı'}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFriendToRemove(friend);
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
                        <div className="flex items-center justify-between">
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

                          <button
                            onClick={async () => {
                              if (window.confirm(`${request.requested.username} kullanıcısına gönderilen isteği iptal etmek istiyor musunuz?`)) {
                                try {
                                  await cancelFriendRequest(request.id);
                                } catch (error) {
                                  console.error('İstek iptal edilirken hata:', error);
                                }
                              }
                            }}
                            className="p-2 hover:bg-gray-700 rounded-full text-gray-400 hover:text-red-500 transition-colors"
                            title="İsteği İptal Et"
                          >
                            <X size={18} />
                          </button>
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
                                handleFriendRequestByUsername(user.username);
                              }}
                              className="p-1 hover:bg-green-600 rounded transition-colors group/btn"
                              title="Arkadaş Ekle"
                            >
                              <UserPlus size={14} className="text-green-400 group-hover/btn:text-white" />
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

        {/* User Connection Panel */}
        <UserConnectionPanel />
      </div>

      {/* Volume Context Menu */}
      {volumeContextMenu && (
        <UserVolumeContextMenu
          x={volumeContextMenu.x}
          y={volumeContextMenu.y}
          userId={volumeContextMenu.friend.id}
          username={volumeContextMenu.friend.username}
          profileImageUrl={volumeContextMenu.friend.profile_image_url || undefined}
          onClose={() => setVolumeContextMenu(null)}
        />
      )}

      {/* Remove Friend Confirmation Modal */}
      {friendToRemove && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-6">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <UserMinus size={32} className="text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-white text-center mb-2">Arkadaşı Çıkar</h3>
              <p className="text-gray-400 text-center mb-6">
                <span className="font-semibold text-white">{friendToRemove.username}</span> adlı kişiyi arkadaş listenden çıkarmak istediğine emin misin?
              </p>

              <div className="flex space-x-3">
                <button
                  onClick={() => setFriendToRemove(null)}
                  className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-medium transition-all"
                >
                  Vazgeç
                </button>
                <button
                  onClick={async () => {
                    if (friendToRemove) {
                      try {
                        await removeFriend(friendToRemove.id);
                        setFriendToRemove(null);
                      } catch (error) {
                        console.error('Arkadaş silinirken hata oluştu:', error);
                        alert('Arkadaş silinemedi. Lütfen tekrar deneyin.');
                      }
                    }
                  }}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-red-600/20"
                >
                  Evet, Çıkar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
