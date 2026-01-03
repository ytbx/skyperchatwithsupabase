import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSupabaseRealtime } from '@/contexts/SupabaseRealtimeContext';
import { useAuth } from '@/contexts/AuthContext';
import { Profile, PERMISSIONS } from '@/lib/types';
import { Crown, User } from 'lucide-react';
import { UserContextMenu } from '../server/UserContextMenu';
import { computeBasePermissions } from '@/utils/PermissionUtils';
import { toast } from 'sonner';

interface MemberListProps {
  serverId: string | null;
}

export function MemberList({ serverId }: MemberListProps) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Profile[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [currentUserPermissions, setCurrentUserPermissions] = useState<bigint>(0n);
  const [isCurrentUserOwner, setIsCurrentUserOwner] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; memberId: string; memberName: string; profileImage?: string; isSelf: boolean } | null>(null);
  const { isUserOnline } = useSupabaseRealtime();

  useEffect(() => {
    if (!serverId) {
      setMembers([]);
      setOwnerId(null);
      setCurrentUserPermissions(0n);
      setIsCurrentUserOwner(false);
      return;
    }

    loadMembers();
    loadServerOwner();
    loadCurrentUserPermissions();
  }, [serverId]);

  // Close context menu on click outside (handled by component) or scroll
  useEffect(() => {
    const handleScroll = () => setContextMenu(null);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, []);

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

  async function loadCurrentUserPermissions() {
    if (!serverId || !user) return;

    // Get server owner to check if we are owner
    const { data: server } = await supabase
      .from('servers')
      .select('owner_id')
      .eq('id', serverId)
      .single();

    if (server && server.owner_id === user.id) {
      setCurrentUserPermissions(PERMISSIONS.ADMINISTRATOR);
      setIsCurrentUserOwner(true);
      return;
    }

    setIsCurrentUserOwner(false);

    // Get our roles
    const { data: userRoles } = await supabase
      .from('server_user_roles')
      .select('role_id')
      .eq('server_id', serverId)
      .eq('user_id', user.id);

    // Get all server roles to map permissions
    const { data: serverRoles } = await supabase
      .from('server_roles')
      .select('*')
      .eq('server_id', serverId);

    if (userRoles && serverRoles) {
      const myRoles = serverRoles.filter(r => userRoles.some(ur => ur.role_id === r.id));
      const permissions = computeBasePermissions(myRoles, server?.owner_id || '', user.id);
      setCurrentUserPermissions(permissions);
    }
  }

  const handleContextMenu = (e: React.MouseEvent, member: Profile) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      memberId: member.id,
      memberName: member.username || 'Kullanıcı',
      profileImage: member.profile_image_url || undefined,
      isSelf: member.id === user?.id
    });
  };

  const handleKick = async (memberId: string, memberName: string) => {
    if (!serverId) return;
    if (memberId === ownerId) {
      toast.error('Sunucu sahibi atılamaz.');
      return;
    }

    if (!confirm(`${memberName} adlı kullanıcıyı sunucudan atmak istediğinize emin misiniz?`)) return;

    setContextMenu(null);
    const toastId = toast.loading('Kullanıcı atılıyor...');

    try {
      const { error } = await supabase.rpc('kick_server_member', {
        p_server_id: serverId,
        p_user_id: memberId
      });

      if (error) throw error;

      toast.success(`${memberName} sunucudan atıldı.`, { id: toastId });
      loadMembers(); // Refresh list
    } catch (error: any) {
      console.error('Kick error:', error);
      toast.error(`Hata: ${error.message || 'Kullanıcı atılamadı'}`, { id: toastId });
    }
  };

  const handleBan = async (memberId: string, memberName: string) => {
    if (!serverId) return;
    if (memberId === ownerId) {
      toast.error('Sunucu sahibi yasaklanamaz.');
      return;
    }

    const reason = prompt(`${memberName} adlı kullanıcıyı yasaklamak için bir sebep girin (isteğe bağlı):`);
    if (reason === null) return; // Cancelled

    setContextMenu(null);
    const toastId = toast.loading('Kullanıcı yasaklanıyor...');

    try {
      const { error } = await supabase.rpc('ban_server_member', {
        p_server_id: serverId,
        p_user_id: memberId,
        p_reason: reason || 'Sebep belirtilmedi'
      });

      if (error) throw error;

      toast.success(`${memberName} sunucudan yasaklandı.`, { id: toastId });
      loadMembers(); // Refresh list
    } catch (error: any) {
      console.error('Ban error:', error);
      toast.error(`Hata: ${error.message || 'Kullanıcı yasaklanamadı'}`, { id: toastId });
    }
  };

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
    <>
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
                            onContextMenu={(e) => handleContextMenu(e, member)}
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
                                    {getInitials(member.username || '')}
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
                            onContextMenu={(e) => handleContextMenu(e, member)}
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
                                    {getInitials(member.username || '')}
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

      {contextMenu && (
        <UserContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetMemberId={contextMenu.memberId}
          targetMemberName={contextMenu.memberName}
          targetMemberProfileImage={contextMenu.profileImage}
          currentUserPermissions={currentUserPermissions}
          isOwner={isCurrentUserOwner}
          isSelf={contextMenu.isSelf}
          onClose={() => setContextMenu(null)}
          onKick={handleKick}
          onBan={handleBan}
        />
      )}
    </>
  );
}
