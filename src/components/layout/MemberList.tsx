import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSupabaseRealtime } from '@/contexts/SupabaseRealtimeContext';
import { Profile } from '@/lib/types';
import { Crown, User } from 'lucide-react';

interface MemberListProps {
  serverId: string | null;
}

export function MemberList({ serverId }: MemberListProps) {
  const [members, setMembers] = useState<Profile[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const { isUserOnline } = useSupabaseRealtime();

  useEffect(() => {
    if (!serverId) {
      setMembers([]);
      setOwnerId(null);
      return;
    }

    loadMembers();
    loadServerOwner();
  }, [serverId]);

  async function loadMembers() {
    if (!serverId) return;

    const { data: serverUsers } = await supabase
      .from('server_users')
      .select('user_id')
      .eq('server_id', serverId);

    if (serverUsers && serverUsers.length > 0) {
      const userIds = serverUsers.map(su => su.user_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds)
        .order('username', { ascending: true });

      if (profiles) {
        setMembers(profiles);
      }
    }
  }

  async function loadServerOwner() {
    if (!serverId) return;

    const { data: server } = await supabase
      .from('servers')
      .select('owner_id')
      .eq('id', serverId)
      .single();

    if (server) {
      setOwnerId(server.owner_id);
    }
  }

  if (!serverId) {
    return null;
  }

  const getInitials = (username: string) => {
    return username?.charAt(0).toUpperCase() || 'U';
  };

  const getAvatarColor = (id: string) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-yellow-500',
      'bg-red-500',
      'bg-indigo-500',
      'bg-teal-500'
    ];
    const index = id.charCodeAt(0) % colors.length;
    return colors[index];
  };

  return (
    <div className="hidden lg:flex lg:w-60 bg-gray-800/50 flex-col border-l border-gray-800/50">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-800/50">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Üyeler — {members.length}
        </h3>
      </div>

      {/* Members List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {/* Online Members Section */}
        {(() => {
          const onlineMembers = members.filter(m => isUserOnline(m.id));
          const offlineMembers = members.filter(m => !isUserOnline(m.id));

          return (
            <>
              {onlineMembers.length > 0 && (
                <div className="mb-4">
                  <div className="px-2 py-1 mb-1">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Çevrimiçi — {onlineMembers.length}
                    </h4>
                  </div>

                  <div className="space-y-0.5">
                    {onlineMembers.map((member) => {
                      const isOwner = member.id === ownerId;

                      return (
                        <button
                          key={member.id}
                          className="w-full px-2 py-1.5 flex items-center gap-3 rounded hover:bg-gray-700/50 transition-colors group"
                        >
                          {/* Avatar with Online Indicator */}
                          <div className="relative flex-shrink-0">
                            <div className={`w-8 h-8 rounded-full ${getAvatarColor(member.id)} flex items-center justify-center ring-2 ring-gray-800/50`}>
                              {member.profile_image_url ? (
                                <img
                                  src={member.profile_image_url}
                                  alt=""
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                <span className="text-sm font-semibold text-white">
                                  {getInitials(member.username)}
                                </span>
                              )}
                            </div>
                            {/* Online Status Indicator */}
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-800"></div>
                          </div>

                          {/* Member Info */}
                          <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
                                {member.username || 'Kullanıcı'}
                              </span>
                              {isOwner && (
                                <Crown className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                              )}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {isOwner ? 'Sunucu Sahibi' : 'Üye'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Offline Members Section */}
              {offlineMembers.length > 0 && (
                <div>
                  <div className="px-2 py-1 mb-1">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Çevrimdışı — {offlineMembers.length}
                    </h4>
                  </div>

                  <div className="space-y-0.5">
                    {offlineMembers.map((member) => {
                      const isOwner = member.id === ownerId;

                      return (
                        <button
                          key={member.id}
                          className="w-full px-2 py-1.5 flex items-center gap-3 rounded hover:bg-gray-700/50 transition-colors group opacity-60"
                        >
                          {/* Avatar with Offline Indicator */}
                          <div className="relative flex-shrink-0">
                            <div className={`w-8 h-8 rounded-full ${getAvatarColor(member.id)} flex items-center justify-center ring-2 ring-gray-800/50`}>
                              {member.profile_image_url ? (
                                <img
                                  src={member.profile_image_url}
                                  alt=""
                                  className="w-full h-full rounded-full object-cover"
                                />
                              ) : (
                                <span className="text-sm font-semibold text-white">
                                  {getInitials(member.username)}
                                </span>
                              )}
                            </div>
                            {/* Offline Status Indicator */}
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-gray-500 rounded-full border-2 border-gray-800"></div>
                          </div>

                          {/* Member Info */}
                          <div className="flex-1 min-w-0 text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-medium text-gray-200 truncate group-hover:text-white transition-colors">
                                {member.username || 'Kullanıcı'}
                              </span>
                              {isOwner && (
                                <Crown className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
                              )}
                            </div>
                            <div className="text-xs text-gray-500 truncate">
                              {isOwner ? 'Sunucu Sahibi' : 'Üye'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Bottom Info */}
      <div className="px-4 py-3 border-t border-gray-800/50 bg-gray-900/50">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <User className="w-3.5 h-3.5" />
          <span>{members.filter(m => isUserOnline(m.id)).length} çevrimiçi, {members.length} toplam</span>
        </div>
      </div>
    </div>
  );
}
