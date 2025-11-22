import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Hash, Plus, Settings, UserPlus, Shield, Search, X, Lock, Volume2, Mic, MicOff, Headphones, PhoneOff, MonitorUp, Video, VideoOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Channel, Server, Profile, VoiceChannelMember } from '@/lib/types';
import { useVoiceChannel } from '@/hooks/useVoiceChannel';

interface ChannelListProps {
  serverId: string | null;
  selectedChannelId: number | null;
  onSelectChannel: (channelId: number) => void;
  onCreateChannel?: () => void;
  onInvite?: () => void;
  onManageRoles?: () => void;
  onVoiceChannelChange?: (channel: { id: number; name: string; participants: any[] } | null) => void;
}

export function ChannelList({ serverId, selectedChannelId, onSelectChannel, onCreateChannel, onInvite, onManageRoles, onVoiceChannelChange }: ChannelListProps) {
  const [server, setServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<Channel[]>([]);
  const [voiceParticipants, setVoiceParticipants] = useState<Record<number, VoiceChannelMember[]>>({});
  const [textChannelsExpanded, setTextChannelsExpanded] = useState(true);
  const [voiceChannelsExpanded, setVoiceChannelsExpanded] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ channels: Channel[], members: Profile[] }>({ channels: [], members: [] });
  const [activeVoiceChannelId, setActiveVoiceChannelId] = useState<number | null>(null);

  const { user, profile } = useAuth();
  const { participants, joinChannel, leaveChannel, isConnected, isMuted, isDeafened, isScreenSharing, isCameraEnabled, toggleMute, toggleDeafen, toggleScreenShare, toggleCamera } = useVoiceChannel(activeVoiceChannelId);

  // Use ref to avoid stale closure in realtime subscription
  const voiceChannelsRef = useRef<Channel[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    voiceChannelsRef.current = voiceChannels;
  }, [voiceChannels]);

  // Render audio elements for remote participants
  useEffect(() => {
    participants.forEach(participant => {
      if (participant.stream && participant.user_id !== user?.id) {
        const audio = document.getElementById(`audio-${participant.user_id}`) as HTMLAudioElement;
        if (audio && audio.srcObject !== participant.stream) {
          audio.srcObject = participant.stream;
          audio.play().catch(e => console.error('Error playing audio:', e));
        }
      }
    });
  }, [participants, user]);

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

    // Subscribe to voice participant changes
    const voiceSub = supabase
      .channel(`voice_users_${serverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'voice_channel_users' },
        () => {
          loadVoiceParticipants();
        }
      )
      .subscribe();

    return () => {
      channelSub.unsubscribe();
      voiceSub.unsubscribe();
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

  // Handle joining voice channel
  useEffect(() => {
    if (activeVoiceChannelId) {
      joinChannel();
    }
  }, [activeVoiceChannelId]);

  // Notify parent when voice channel state changes
  useEffect(() => {
    if (activeVoiceChannelId && isConnected && onVoiceChannelChange) {
      const channel = voiceChannels.find(c => c.id === activeVoiceChannelId);
      if (channel) {
        onVoiceChannelChange({
          id: channel.id,
          name: channel.name,
          participants: participants
        });
      }
    } else if (!activeVoiceChannelId && onVoiceChannelChange) {
      onVoiceChannelChange(null);
    }
  }, [activeVoiceChannelId, isConnected, voiceChannels, participants, onVoiceChannelChange]);

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

  async function loadVoiceParticipants() {
    // Use ref to get current voice channels even inside stale closure
    const currentVoiceChannels = voiceChannelsRef.current;

    if (!currentVoiceChannels.length) return;

    const channelIds = currentVoiceChannels.map(c => c.id);
    if (channelIds.length === 0) return;

    const { data } = await supabase
      .from('voice_channel_users')
      .select('*, profile:profiles(*)')
      .in('channel_id', channelIds);

    if (data) {
      const participantsByChannel: Record<number, VoiceChannelMember[]> = {};
      data.forEach((p: any) => {
        if (!participantsByChannel[p.channel_id]) {
          participantsByChannel[p.channel_id] = [];
        }
        participantsByChannel[p.channel_id].push(p);
      });
      setVoiceParticipants(participantsByChannel);
    } else {
      setVoiceParticipants({});
    }
  }

  // Reload participants when voice channels change
  useEffect(() => {
    loadVoiceParticipants();
  }, [voiceChannels]);

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
      .order('name', { ascending: true });

    if (channelsData) {
      setChannels(channelsData.filter(c => !c.is_voice));
      setVoiceChannels(channelsData.filter(c => c.is_voice));
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
            <span>Metin Kanalları</span>
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
            </div>
          )}
        </div>

        {/* Voice Channels */}
        <div className="mb-1 mt-4">
          <button
            onClick={() => setVoiceChannelsExpanded(!voiceChannelsExpanded)}
            className="w-full px-2 py-1.5 flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase hover:text-gray-300 transition-colors group"
          >
            <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${voiceChannelsExpanded ? '' : '-rotate-90'}`} />
            <span>Ses Kanalları</span>
          </button>
          {voiceChannelsExpanded && (
            <div className="mt-0.5 space-y-0.5">
              {voiceChannels.map((channel) => (
                <div key={channel.id}>
                  <button
                    onClick={() => setActiveVoiceChannelId(channel.id)}
                    className={`w-full px-2 py-1.5 mx-2 flex items-center gap-2 rounded transition-all duration-150 group ${activeVoiceChannelId === channel.id
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'
                      }`}
                  >
                    <Volume2 className={`w-4 h-4 flex-shrink-0 ${activeVoiceChannelId === channel.id ? 'text-white' : 'text-gray-500'}`} />
                    <span className="text-sm truncate font-medium">{channel.name}</span>
                  </button>

                  {/* Voice Participants */}
                  {voiceParticipants[channel.id]?.map((participant) => (
                    <div key={participant.id} className="ml-8 mr-2 py-1 flex items-center gap-2 group cursor-pointer hover:bg-gray-800/50 rounded px-1">
                      <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                        {participant.profile?.profile_image_url ? (
                          <img src={participant.profile.profile_image_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs text-white">
                            {participant.profile?.username?.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className={`text-sm truncate ${activeVoiceChannelId === channel.id && participant.user_id === user?.id ? 'text-green-400' : 'text-gray-400'}`}>
                        {participant.profile?.username}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {onCreateChannel && server?.owner_id === user?.id && (
          <button
            onClick={onCreateChannel}
            className="w-full px-2 py-1.5 mx-2 mt-2 flex items-center gap-2 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded transition-all duration-150"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">Kanal Ekle</span>
          </button>
        )}
      </div>

      {/* Hidden Audio Elements */}
      {participants.map((participant) => (
        <audio
          key={participant.user_id}
          id={`audio-${participant.user_id}`}
          autoPlay
          playsInline
          className="hidden"
        />
      ))}

      {/* Voice Controls (if connected) */}
      {activeVoiceChannelId && (
        <div className="bg-gray-850 border-t border-gray-800 p-2 pb-0">
          <div className="flex items-center justify-between px-2 py-1 bg-green-900/20 rounded border border-green-900/50 mb-2">
            <div className="flex items-center gap-2 overflow-hidden">
              <Volume2 className="w-4 h-4 text-green-500 flex-shrink-0" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-green-500 truncate">Ses Bağlantısı</span>
                <span className="text-xs text-gray-400 truncate">
                  {voiceChannels.find(c => c.id === activeVoiceChannelId)?.name}
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                leaveChannel();
                setActiveVoiceChannelId(null);
              }}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white"
              title="Bağlantıyı Kes"
            >
              <PhoneOff size={16} />
            </button>
          </div>

          <div className="flex items-center justify-center gap-4 pb-2">
            <button
              onClick={toggleMute}
              className={`p-2 rounded-full transition-colors ${isMuted ? 'bg-red-500/20 text-red-500' : 'hover:bg-gray-700 text-gray-300'}`}
              title={isMuted ? "Sesi Aç" : "Sessize Al"}
            >
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              onClick={toggleDeafen}
              className={`p-2 rounded-full transition-colors ${isDeafened ? 'bg-red-500/20 text-red-500' : 'hover:bg-gray-700 text-gray-300'}`}
              title={isDeafened ? "Sağırlaştır" : "Sağırlaştır"}
            >
              <Headphones size={18} />
            </button>
            <button
              onClick={toggleScreenShare}
              className={`p-2 rounded-full transition-colors ${isScreenSharing ? 'bg-green-500/20 text-green-500' : 'hover:bg-gray-700 text-gray-300'}`}
              title={isScreenSharing ? "Ekran Paylaşımını Durdur" : "Ekran Paylaş"}
            >
              <MonitorUp size={18} />
            </button>
            <button
              onClick={toggleCamera}
              className={`p-2 rounded-full transition-colors ${isCameraEnabled ? 'bg-blue-500/20 text-blue-500' : 'hover:bg-gray-700 text-gray-300'}`}
              title={isCameraEnabled ? "Kamerayı Kapat" : "Kamerayı Aç"}
            >
              {isCameraEnabled ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button
              className="p-2 rounded-full hover:bg-gray-700 text-gray-300"
              title="Ayarlar"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>
      )}

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
