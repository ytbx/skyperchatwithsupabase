import React, { useState, useEffect } from 'react';
import { X, Search, Hash, User, UserPlus, Server as ServerIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface SearchResult {
  type: 'user' | 'server' | 'channel';
  id: string;
  name: string;
  subtitle?: string;
  serverId?: string;
}

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectServer?: (serverId: string) => void;
  onSelectChannel?: (channelId: number, serverId: string) => void;
  onSelectUser?: (userId: string, username: string) => void;
  onAddFriend?: (userId: string, username: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectServer,
  onSelectChannel,
  onSelectUser,
  onAddFriend
}) => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      performSearch();
    } else {
      setResults([]);
    }
  }, [searchQuery]);

  const performSearch = async () => {
    if (!user || !searchQuery.trim()) return;

    setLoading(true);
    try {
      const searchTerm = searchQuery.toLowerCase();
      const allResults: SearchResult[] = [];

      // Search users (profiles)
      const { data: users } = await supabase
        .from('profiles')
        .select('id, username')
        .or(`username.ilike.%${searchTerm}%`)
        .limit(10);

      if (users) {
        users.forEach((u) => {
          if (u.id !== user.id) {
            allResults.push({
              type: 'user',
              id: u.id,
              name: u.username,
              subtitle: 'Kullanıcı'
            });
          }
        });
      }

      // Search servers
      const { data: serverUsers } = await supabase
        .from('server_users')
        .select('server_id')
        .eq('user_id', user.id);

      const userServerIds = serverUsers?.map(su => su.server_id) || [];

      // Search user's servers
      if (userServerIds.length > 0) {
        const { data: servers } = await supabase
          .from('servers')
          .select('id, name')
          .in('id', userServerIds)
          .ilike('name', `%${searchTerm}%`)
          .limit(5);

        if (servers) {
          servers.forEach(s => {
            allResults.push({
              type: 'server',
              id: s.id,
              name: s.name,
              subtitle: 'Sunucum'
            });
          });
        }
      }

      // Search public servers (that user is not a member of)
      const { data: publicServers } = await supabase
        .from('servers')
        .select('id, name, is_public')
        .eq('is_public', true)
        .ilike('name', `%${searchTerm}%`)
        .not('id', 'in', `(${userServerIds.length > 0 ? userServerIds.join(',') : 'null'})`)
        .limit(5);

      if (publicServers) {
        publicServers.forEach(s => {
          allResults.push({
            type: 'server',
            id: s.id,
            name: s.name,
            subtitle: 'Genel Sunucu'
          });
        });
      }

      // Search channels in user's servers
      if (userServerIds.length > 0) {
        const { data: channels } = await supabase
          .from('channels')
          .select('id, name, server_id')
          .in('server_id', userServerIds)
          .ilike('name', `%${searchTerm}%`)
          .limit(15);

        if (channels) {
          // Get server names for channels
          const uniqueServerIds = [...new Set(channels.map(c => c.server_id))];
          const { data: channelServers } = await supabase
            .from('servers')
            .select('id, name')
            .in('id', uniqueServerIds);

          const serverNamesMap = new Map(channelServers?.map(s => [s.id, s.name]) || []);

          channels.forEach(c => {
            allResults.push({
              type: 'channel',
              id: c.id.toString(),
              name: c.name,
              subtitle: `${serverNamesMap.get(c.server_id) || 'Bilinmeyen Sunucu'}`,
              serverId: c.server_id
            });
          });
        }
      }

      setResults(allResults);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResultClick = async (result: SearchResult) => {
    if (result.type === 'user' && onSelectUser) {
      onSelectUser(result.id, result.name);
      onClose();
    } else if (result.type === 'server' && onSelectServer) {
      onSelectServer(result.id);
      onClose();
    } else if (result.type === 'channel' && onSelectChannel && result.serverId) {
      onSelectChannel(parseInt(result.id), result.serverId);
      onClose();
    }
  };

  // Send friend request
  const sendFriendRequest = async (targetUserId: string, username: string) => {
    if (!user) return;

    try {
      // Check if already friends
      const { data: existingFriendship } = await supabase
        .from('friends')
        .select('*')
        .eq('status', 'accepted')
        .or(`
          and(requester_id.eq.${user.id},requested_id.eq.${targetUserId}),
          and(requester_id.eq.${targetUserId},requested_id.eq.${user.id})
        `);

      if (existingFriendship && existingFriendship.length > 0) {
        alert(`${username} zaten arkadaşınız`);
        return;
      }

      // Check if request already exists
      const { data: existingRequest } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('requester_id', user.id)
        .eq('requested_id', targetUserId)
        .eq('status', 'pending');

      if (existingRequest && existingRequest.length > 0) {
        alert(`${username} kullanıcısına zaten arkadaş isteği gönderilmiş`);
        return;
      }

      // Send friend request
      const { error: requestError } = await supabase
        .from('friend_requests')
        .insert({
          requester_id: user.id,
          requested_id: targetUserId,
          status: 'pending'
        });

      if (requestError) throw requestError;

      alert(`${username} kullanıcısına arkadaş isteği gönderildi!`);
    } catch (error) {
      console.error('Error sending friend request:', error);
      alert('Arkadaş isteği gönderilemedi');
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'user':
        return <User className="w-5 h-5 text-blue-400" />;
      case 'server':
        return <ServerIcon className="w-5 h-5 text-purple-400" />;
      case 'channel':
        return <Hash className="w-5 h-5 text-green-400" />;
      default:
        return <Search className="w-5 h-5 text-gray-400" />;
    }
  };

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-start justify-center pt-20 z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-lg w-full max-w-2xl border border-gray-700 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Search className="w-5 h-5" />
            Global Arama
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Kullanıcı, sunucu veya kanal ara..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              autoFocus
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto p-2">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-pulse text-gray-400">Aranıyor...</div>
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center">
              <Search className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">
                {searchQuery.trim() ? 'Sonuç bulunamadı' : 'Aramak için yazmaya başlayın'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}-${index}`}
                  onClick={() => handleResultClick(result)}
                  className="w-full p-3 rounded-lg transition-colors flex items-center gap-3 text-left hover:bg-gray-800"
                >
                  <div className="flex-shrink-0">
                    {getIcon(result.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-white font-medium truncate">
                      {result.name}
                    </div>
                    <div className="text-sm text-gray-400 truncate">
                      {result.subtitle}
                    </div>
                  </div>
                  {result.type === 'user' && onAddFriend && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        sendFriendRequest(result.id, result.name);
                      }}
                      className="p-2 hover:bg-green-600 rounded transition-colors"
                      title="Arkadaş Ekle"
                    >
                      <UserPlus className="w-4 h-4 text-green-400" />
                    </button>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-700 bg-gray-800/50">
          <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3 text-blue-400" /> Kullanıcılar
            </span>
            <span className="flex items-center gap-1">
              <ServerIcon className="w-3 h-3 text-purple-400" /> Sunucular
            </span>
            <span className="flex items-center gap-1">
              <Hash className="w-3 h-3 text-green-400" /> Kanallar
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
