import { useState, useEffect } from 'react';
import { ChevronDown, Hash, Plus, Settings, UserPlus, Shield, Search, X, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Channel, Server, Profile } from '@/lib/types';

interface ChannelListProps {
  serverId: string | null;
  selectedChannelId: number | null;
  onSelectChannel: (channelId: number) => void;
  onCreateChannel?: () => void;
  onInvite?: () => void;
  onManageRoles?: () => void;
}

export function ChannelList({ serverId, selectedChannelId, onSelectChannel, onCreateChannel, onInvite, onManageRoles }: ChannelListProps) {
  const [server, setServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [textChannelsExpanded, setTextChannelsExpanded] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ channels: Channel[], members: Profile[] }>({ channels: [], members: [] });
  const { user, profile } = useAuth();

  useEffect(() => {
    if (!serverId) {
      setServer(null);
      setChannels([]);
      return;
    }

    loadServerAndChannels();

    // Subscribe to channel changes
    const channelSub = supabase
      .channel(`channels_${serverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'channels', filter: `server_id=eq.${serverId}` },
        () => {
          loadServerAndChannels();
        }
      )
      .subscribe();

    return () => {
      channelSub.unsubscribe();
    };
  }, [serverId]);

  // Real-time search
  useEffect(() => {
    if (searchQuery.trim() && serverId) {
      performSearch(searchQuery);
    } else {
      setSearchResults({ channels: [], members: [] });
    }
  }, [searchQuery, serverId]);

  async function performSearch(query: string) {
    if (!serverId) return;

    const { data: channelData } = await supabase
      .from('channels')
      .select('*')
      .eq('server_id', serverId)
      .ilike('name', `%${query}%`)
      .limit(5);

    const { data: serverUsers } = await supabase
      .from('server_users')
      .select('user_id')
      .eq('server_id', serverId);

    if (serverUsers) {
      const userIds = serverUsers.map(su => su.user_id);
      const { data: memberData } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds)
        .ilike('username', `%${query}%`)
        .limit(5);

      setSearchResults({
        channels: channelData || [],
        members: memberData || []
      });
    }
  }

  async function loadServerAndChannels() {
    if (!serverId) return;

    const { data: serverData } = await supabase
      .from('servers')
      .select('*')
      .eq('id', serverId)
      .maybeSingle();

    if (serverData) {
      setServer(serverData);
    }

    const { data: channelsData } = await supabase
      .from('channels')
      .select('*')
      .eq('server_id', serverId)
      .eq('is_voice', false)
      .order('name', { ascending: true });

    if (channelsData) {
      setChannels(channelsData);
    }
  }

  if (!serverId) {
    return (
      <div className="w-60 bg-gray-900 flex flex-col border-r border-gray-800">
        <div className="h-12 px-4 flex items-center border-b border-gray-900 shadow-sm">
          <h2 className="text-base font-semibold text-white">Direkt Mesajlar</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="hidden md:flex md:w-60 bg-gray-900 flex-col border-r border-gray-800 shadow-lg">
      {/* Server Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-gray-800 shadow-sm hover:bg-gray-800 transition-colors cursor-pointer">
        <h2 className="text-base font-semibold text-white truncate">{server?.name || 'Sunucu'}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-1.5 hover:bg-gray-700 rounded transition-all duration-150 hover:scale-105"
            title="Ara"
          >
            <Search className="w-4 h-4 text-gray-400 hover:text-white transition-colors" />
          </button>
          {onInvite && (
            <button
              onClick={onInvite}
              className="p-1.5 hover:bg-gray-700 rounded transition-all duration-150 hover:scale-105"
              title="Sunucuya Davet Et"
            >
              <UserPlus className="w-4 h-4 text-gray-400 hover:text-white transition-colors" />
            </button>
          )}
          {server?.owner_id === user?.id && onManageRoles && (
            <button
              onClick={onManageRoles}
              className="p-1.5 hover:bg-gray-700 rounded transition-all duration-150 hover:scale-105"
              title="Roller ve Üyeler"
            >
              <Shield className="w-4 h-4 text-gray-400 hover:text-white transition-colors" />
            </button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="p-3 border-b border-gray-800 animate-slide-down">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ara..."
              className="w-full pl-9 pr-9 py-2 text-sm bg-gray-900 border border-gray-800 rounded text-white placeholder:text-gray-500 focus:outline-none focus:border-primary-500 transition-colors"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 hover:bg-gray-700 p-0.5 rounded"
              >
                <X className="w-4 h-4 text-gray-400 hover:text-white" />
              </button>
            )}
          </div>

          {searchQuery && (
            <div className="mt-2 max-h-60 overflow-y-auto custom-scrollbar">
              {searchResults.channels.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-semibold text-gray-500 uppercase px-2 py-1">Kanallar</div>
                  {searchResults.channels.map(channel => (
                    <button
                      key={channel.id}
                      onClick={() => {
                        onSelectChannel(channel.id);
                        setSearchQuery('');
                        setShowSearch(false);
                      }}
                      className="w-full px-2 py-1.5 flex items-center gap-2 text-gray-300 hover:bg-gray-800 rounded transition-colors text-sm"
                    >
                      <Hash className="w-4 h-4" />
                      {channel.name}
                    </button>
                  ))}
                </div>
              )}

              {searchResults.members.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-gray-500 uppercase px-2 py-1">Üyeler</div>
                  {searchResults.members.map(member => (
                    <div
                      key={member.id}
                      className="px-2 py-1.5 flex items-center gap-2 text-gray-300 rounded text-sm"
                    >
                      <div className="w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center text-xs text-white">
                        {member.username?.charAt(0).toUpperCase()}
                      </div>
                      {member.username}
                    </div>
                  ))}
                </div>
              )}

              {searchResults.channels.length === 0 && searchResults.members.length === 0 && (
                <div className="text-center py-4 text-sm text-gray-500">
                  Sonuç bulunamadı
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Channels */}
      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        {/* Text Channels */}
        <div className="mb-1">
          <button
            onClick={() => setTextChannelsExpanded(!textChannelsExpanded)}
            className="w-full px-2 py-1.5 flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase hover:text-gray-300 transition-colors group"
          >
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${textChannelsExpanded ? '' : '-rotate-90'}`} />
            <span>Kanallar</span>
          </button>
          {textChannelsExpanded && (
            <div className="mt-0.5 space-y-0.5">
              {channels.map((channel) => (
                <button
                  key={channel.id}
                  onClick={() => onSelectChannel(channel.id)}
                  className={`w-full px-2 py-1.5 mx-2 flex items-center gap-2 rounded transition-all duration-150 group ${selectedChannelId === channel.id
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'
                    }`}
                >
                  <Hash className={`w-4 h-4 flex-shrink-0 ${selectedChannelId === channel.id ? 'text-white' : 'text-gray-500'}`} />
                  <span className="text-sm truncate font-medium">{channel.name}</span>
                </button>
              ))}
              {onCreateChannel && server?.owner_id === user?.id && (
                <button
                  onClick={onCreateChannel}
                  className="w-full px-2 py-1.5 mx-2 flex items-center gap-2 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded transition-all duration-150"
                >
                  <Plus className="w-4 h-4" />
                  <span className="text-sm font-medium">Kanal Ekle</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* User Profile Bar */}
      <div className="h-14 px-2 flex items-center gap-2 bg-gray-900 border-t border-gray-800">
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center overflow-hidden">
            {profile?.profile_image_url ? (
              <img src={profile.profile_image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-semibold text-white">
                {profile?.username?.charAt(0).toUpperCase() || 'U'}
              </span>
            )}
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-gray-900" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white truncate">
            {profile?.username || 'Kullanıcı'}
          </div>
          <div className="text-xs text-gray-400">
            Çevrimiçi
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #1f2937;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #374151;
        }
        @keyframes slide-down {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-down {
          animation: slide-down 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
