import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Hash, Plus, Settings, UserPlus, Shield, Search, X, Lock, Volume2, Mic, MicOff, Headphones, PhoneOff, MonitorUp, Video, VideoOff, Music2, VolumeX } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Channel, Server, Profile, VoiceChannelMember, PERMISSIONS, ServerRole, ChannelPermission } from '@/lib/types';
import { useVoiceChannel } from '@/contexts/VoiceChannelContext';
import { useUserAudio } from '@/contexts/UserAudioContext';
import { hasPermission, computeBasePermissions, computeChannelPermissions } from '@/utils/PermissionUtils';
import { SoundPanelPopup } from '@/components/soundboard/SoundPanelPopup';
import { UserVolumeContextMenu } from '@/components/voice/UserVolumeContextMenu';

interface ChannelListProps {
  serverId: string | null;
  selectedChannelId: number | null;
  onSelectChannel: (channelId: number) => void;
  onCreateChannel?: () => void;
  onInvite?: () => void;
  onServerSettings?: () => void;
  onEditChannel?: (channelId: number) => void;
}

export function ChannelList({ serverId, selectedChannelId, onSelectChannel, onCreateChannel, onInvite, onServerSettings, onEditChannel }: ChannelListProps) {
  const [server, setServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<Channel[]>([]);
  const [voiceParticipants, setVoiceParticipants] = useState<Record<number, VoiceChannelMember[]>>({});
  const [userRoles, setUserRoles] = useState<ServerRole[]>([]);
  const [channelPermissions, setChannelPermissions] = useState<ChannelPermission[]>([]);
  const [textChannelsExpanded, setTextChannelsExpanded] = useState(true);
  const [voiceChannelsExpanded, setVoiceChannelsExpanded] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ channels: Channel[], members: Profile[] }>({ channels: [], members: [] });
  const [showSoundPanel, setShowSoundPanel] = useState(false);
  const [volumeContextMenu, setVolumeContextMenu] = useState<{ x: number; y: number; userId: string; username: string; profileImageUrl?: string } | null>(null);

  const { user, profile } = useAuth();
  const {
    activeChannelId,
    joinChannel,
    leaveChannel,
    isConnected,
    isMuted,
    isDeafened,
    isScreenSharing,
    isCameraEnabled,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    toggleCamera,
    participants: activeParticipants,
    playSoundboardAudio
  } = useVoiceChannel();
  const { getUserMuted } = useUserAudio();

  // Track speaking state for each participant
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
  const analyserRefs = useRef<Map<string, { context: AudioContext; analyser: AnalyserNode; animationFrame: number }>>(new Map());

  // Use ref to avoid stale closure in realtime subscription
  const voiceChannelsRef = useRef<Channel[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    voiceChannelsRef.current = voiceChannels;
  }, [voiceChannels]);

  // Render audio elements for remote participants
  useEffect(() => {
    activeParticipants.forEach(participant => {
      if (participant.stream && participant.user_id !== user?.id) {
        const audio = document.getElementById(`audio-${participant.user_id}`) as HTMLAudioElement;
        if (audio && audio.srcObject !== participant.stream) {
          audio.srcObject = participant.stream;
          audio.play().catch(e => console.error('Error playing audio:', e));
        }
      }
    });
  }, [activeParticipants, user]);

  // Voice activity detection for each participant
  useEffect(() => {
    // Clean up old analysers for participants who left
    const currentUserIds = new Set(activeParticipants.map(p => p.user_id));
    analyserRefs.current.forEach((analyserData, userId) => {
      if (!currentUserIds.has(userId)) {
        cancelAnimationFrame(analyserData.animationFrame);
        analyserData.context.close();
        analyserRefs.current.delete(userId);
      }
    });

    // Set up analysers for each participant with a stream
    activeParticipants.forEach(participant => {
      if (!participant.stream || analyserRefs.current.has(participant.user_id)) return;

      console.log('[ChannelList] Setting up voice detection for user:', participant.user_id, 'Has stream:', !!participant.stream);

      try {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(participant.stream);
        source.connect(analyser);
        analyser.fftSize = 256;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        const detectVoice = () => {
          analyser.getByteFrequencyData(dataArray);
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
          const isSpeaking = average > 20; // Threshold for voice detection

          setSpeakingUsers(prev => {
            const newSet = new Set(prev);
            if (isSpeaking) {
              newSet.add(participant.user_id);
            } else {
              newSet.delete(participant.user_id);
            }
            return newSet;
          });

          const animationFrame = requestAnimationFrame(detectVoice);
          const analyserData = analyserRefs.current.get(participant.user_id);
          if (analyserData) {
            analyserData.animationFrame = animationFrame;
          }
        };

        const animationFrame = requestAnimationFrame(detectVoice);
        analyserRefs.current.set(participant.user_id, { context: audioContext, analyser, animationFrame });
        console.log('[ChannelList] ✓ Voice detection setup complete for:', participant.user_id);
      } catch (error) {
        console.error('[ChannelList] Error setting up voice detection:', error);
      }
    });

    return () => {
      // Cleanup all analysers on unmount
      analyserRefs.current.forEach(analyserData => {
        cancelAnimationFrame(analyserData.animationFrame);
        analyserData.context.close();
      });
      analyserRefs.current.clear();
    };
  }, [activeParticipants]);

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

  const canMoveMembers = server?.owner_id === user?.id || hasPermission(computeBasePermissions(userRoles, server?.owner_id, user?.id), PERMISSIONS.MANAGE_CHANNELS);

  const handleDragStart = (e: React.DragEvent, userId: string, currentChannelId: number) => {
    if (!canMoveMembers) return;
    e.dataTransfer.setData('userId', userId);
    e.dataTransfer.setData('currentChannelId', currentChannelId.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!canMoveMembers) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetChannelId: number) => {
    e.preventDefault();
    if (!canMoveMembers) return;

    const userId = e.dataTransfer.getData('userId');
    const currentChannelId = parseInt(e.dataTransfer.getData('currentChannelId'));

    if (!userId || isNaN(currentChannelId)) return;
    if (currentChannelId === targetChannelId) return;

    try {
      const { error } = await supabase.rpc('move_voice_user', {
        p_target_channel_id: targetChannelId,
        p_target_user_id: userId
      });

      if (error) {
        console.error('Error moving user:', error);
        alert('Kullanıcı taşınırken bir hata oluştu: ' + error.message);
      }
    } catch (err) {
      console.error('Error moving user:', err);
    }
  };

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

    // Fetch user roles
    const { data: userRolesData } = await supabase
      .from('server_user_roles')
      .select('role_id, server_roles(*)')
      .eq('user_id', user?.id)
      .eq('server_id', serverId);

    const myRoles = userRolesData?.map((ur: any) => ur.server_roles) || [];
    setUserRoles(myRoles);

    // Fetch channel permissions
    const { data: permissionsData } = await supabase
      .from('channel_permissions')
      .select('*')
      .in('channel_id', channelsData?.map(c => c.id) || []);

    setChannelPermissions(permissionsData || []);

    if (channelsData) {
      // Filter channels based on permissions
      const visibleChannels = channelsData.filter(channel => {
        if (!channel.is_private) return true; // Public channels are visible to everyone (unless we add VIEW_CHANNEL check for public too, but usually public means visible)
        // Actually, Discord hides channels if you don't have VIEW_CHANNEL.
        // For now, let's assume is_private means "needs explicit permission".

        if (serverData?.owner_id === user?.id) return true;

        const basePermissions = computeBasePermissions(myRoles, serverData?.owner_id || '', user?.id || '');
        const finalPermissions = computeChannelPermissions(
          basePermissions,
          myRoles,
          permissionsData || [],
          user?.id || '',
          serverData?.owner_id || ''
        );

        // For private channels, we check if they have VIEW_CHANNEL or if they are explicitly allowed
        // But our computeChannelPermissions logic is generic. 
        // Let's simplify: if is_private, check if user has VIEW_CHANNEL permission calculated for this channel.

        // Wait, computeChannelPermissions needs specific channel logic.
        // The helper function I wrote `computeChannelPermissions` takes ALL channel permissions.
        // I need to filter `permissionsData` for THIS channel inside the loop?
        // No, the helper expects `channelPermissions` array. It should probably filter inside?
        // Let's look at `PermissionUtils.ts` again.
        // It takes `channelPermissions: ChannelPermission[]`.
        // It iterates over roles and checks `channelPermissions.find`.
        // So I should pass ONLY the permissions for THIS channel to the helper?
        // Yes, likely.

        const thisChannelPermissions = (permissionsData || []).filter(cp => cp.channel_id === channel.id);

        const permissions = computeChannelPermissions(
          basePermissions,
          myRoles,
          thisChannelPermissions,
          user?.id || '',
          serverData?.owner_id || ''
        );

        return hasPermission(permissions, PERMISSIONS.VIEW_CHANNEL);
      });

      setChannels(visibleChannels.filter(c => !c.is_voice));
      setVoiceChannels(visibleChannels.filter(c => c.is_voice));
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
    <>
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
            {(server?.owner_id === user?.id || hasPermission(computeBasePermissions(userRoles, server?.owner_id, user?.id), PERMISSIONS.MANAGE_SERVER) || hasPermission(computeBasePermissions(userRoles, server?.owner_id, user?.id), PERMISSIONS.MANAGE_ROLES)) && onServerSettings && (
              <button
                onClick={onServerSettings}
                className="p-1.5 hover:bg-gray-700 rounded transition-all duration-150 hover:scale-105"
                title="Sunucu Ayarları"
              >
                <Settings className="w-4 h-4 text-gray-400 hover:text-white transition-colors" />
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
                    <span className="text-sm truncate font-medium flex-1 text-left">{channel.name}</span>
                    {onEditChannel && (server?.owner_id === user?.id || hasPermission(computeBasePermissions(userRoles, server?.owner_id, user?.id), PERMISSIONS.MANAGE_CHANNELS)) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditChannel(channel.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-white transition-opacity"
                      >
                        <Settings size={12} />
                      </button>
                    )}
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
                  <div
                    key={channel.id}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, channel.id)}
                  >
                    <button
                      onClick={() => {
                        joinChannel(channel.id);
                        onSelectChannel(channel.id);
                      }}
                      className={`w-full px-2 py-1.5 mx-2 flex items-center gap-2 rounded transition-all duration-150 group ${activeChannelId === channel.id
                        ? 'bg-gray-700 text-white'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-300'
                        }`}
                    >
                      <Volume2 className={`w-4 h-4 flex-shrink-0 ${activeChannelId === channel.id ? 'text-white' : 'text-gray-500'}`} />
                      <span className="text-sm truncate font-medium flex-1 text-left">{channel.name}</span>
                      {onEditChannel && (server?.owner_id === user?.id || hasPermission(computeBasePermissions(userRoles, server?.owner_id, user?.id), PERMISSIONS.MANAGE_CHANNELS)) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditChannel(channel.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-white transition-opacity"
                        >
                          <Settings size={12} />
                        </button>
                      )}
                    </button>

                    {/* Voice Participants */}
                    {voiceParticipants[channel.id]?.map((participant) => (
                      <div
                        key={participant.id}
                        className={`ml-8 mr-2 py-1 flex items-center gap-2 group rounded px-1 ${canMoveMembers ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} hover:bg-gray-800/50`}
                        draggable={canMoveMembers}
                        onDragStart={(e) => handleDragStart(e, participant.user_id, channel.id)}
                        onContextMenu={(e) => {
                          // Don't show volume menu for self
                          if (participant.user_id === user?.id) return;
                          e.preventDefault();
                          setVolumeContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            userId: participant.user_id,
                            username: participant.profile?.username || 'Kullanıcı',
                            profileImageUrl: participant.profile?.profile_image_url
                          });
                        }}
                      >
                        <div className={`w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden transition-all duration-200 ${speakingUsers.has(participant.user_id)
                          ? 'ring-2 ring-green-500 shadow-lg shadow-green-500/50'
                          : getUserMuted(participant.user_id) ? 'ring-2 ring-red-500/50' : ''
                          }`}>
                          {participant.profile?.profile_image_url ? (
                            <img src={participant.profile.profile_image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs text-white">
                              {participant.profile?.username?.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex items-center justify-between">
                          <span className={`text-sm truncate ${activeChannelId === channel.id && participant.user_id === user?.id ? 'text-green-400' : getUserMuted(participant.user_id) ? 'text-red-400 line-through' : 'text-gray-400'}`}>
                            {participant.profile?.username}
                          </span>
                          <div className="flex items-center gap-1">
                            {getUserMuted(participant.user_id) && <VolumeX className="w-3 h-3 text-red-500" />}
                            {participant.is_muted && <MicOff className="w-3 h-3 text-red-500" />}
                            {participant.is_deafened && <Headphones className="w-3 h-3 text-red-500" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {onCreateChannel && (server?.owner_id === user?.id || hasPermission(computeBasePermissions(userRoles, server?.owner_id, user?.id), PERMISSIONS.MANAGE_CHANNELS)) && (
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
        {activeParticipants.map((participant) => (
          <audio
            key={participant.user_id}
            id={`audio-${participant.user_id}`}
            autoPlay
            playsInline
            className="hidden"
          />
        ))}

        {/* Voice Controls (if connected) */}
        {activeChannelId && (
          <div className="bg-gray-850 border-t border-gray-800 p-2 pb-0">
            <div className="flex items-center justify-between px-2 py-1 bg-green-900/20 rounded border border-green-900/50 mb-2">
              <div className="flex items-center gap-2 overflow-hidden">
                <Volume2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-green-500 truncate">Ses Bağlantısı</span>
                  <span className="text-xs text-gray-400 truncate">
                    {voiceChannels.find(c => c.id === activeChannelId)?.name}
                  </span>
                </div>
              </div>
              <button
                onClick={() => {
                  leaveChannel();
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
              {/* Sound Panel Button - Shows for all users */}
              <div className="relative">
                <button
                  onClick={() => setShowSoundPanel(!showSoundPanel)}
                  className={`p-2 rounded-full transition-colors ${showSoundPanel ? 'bg-purple-500/20 text-purple-400' : 'hover:bg-gray-700 text-gray-300'}`}
                  title="Ses Paneli"
                >
                  <Music2 size={18} />
                </button>
                <SoundPanelPopup
                  isOpen={showSoundPanel}
                  onClose={() => setShowSoundPanel(false)}
                  anchorPosition="top"
                  onPlaySound={playSoundboardAudio}
                />
              </div>
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

      {/* Volume Context Menu */}
      {
        volumeContextMenu && (
          <UserVolumeContextMenu
            x={volumeContextMenu.x}
            y={volumeContextMenu.y}
            userId={volumeContextMenu.userId}
            username={volumeContextMenu.username}
            profileImageUrl={volumeContextMenu.profileImageUrl}
            onClose={() => setVolumeContextMenu(null)}
          />
        )
      }
    </>
  );
}
