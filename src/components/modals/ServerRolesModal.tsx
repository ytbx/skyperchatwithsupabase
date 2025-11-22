import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { X, Plus, Trash2, Shield, Users as UsersIcon, Hash, Settings, Crown } from 'lucide-react';

// Discord-like permission constants
const PERMISSIONS = {
  CREATE_INSTANT_INVITE: 1 << 0,
  KICK_MEMBERS: 1 << 1,
  BAN_MEMBERS: 1 << 2,
  MANAGE_ROLES: 1 << 5,
  MANAGE_CHANNELS: 1 << 4,
  MANAGE_SERVER: 1 << 3,
  VIEW_AUDIT_LOG: 1 << 7,
  MANAGE_MESSAGES: 1 << 13,
  MENTION_EVERYONE: 1 << 17,
  CONNECT: 1 << 20,
  SPEAK: 1 << 21,
  MUTE_MEMBERS: 1 << 22,
  DEAFEN_MEMBERS: 1 << 23,
  MOVE_MEMBERS: 1 << 24,
  USE_VAD: 1 << 25,
  PRIORITY_SPEAKER: 1 << 11,
  STREAM: 1 << 9,
  VIEW_CHANNEL: 1 << 10,
  SEND_MESSAGES: 1 << 11,
  EMBED_LINKS: 1 << 14,
  ATTACH_FILES: 1 << 15,
  READ_MESSAGE_HISTORY: 1 << 16,
  USE_EXTERNAL_EMOJIS: 1 << 18,
  ADD_REACTIONS: 1 << 6
};

const PERMISSION_NAMES = {
  [PERMISSIONS.CREATE_INSTANT_INVITE]: 'Davet Oluştur',
  [PERMISSIONS.KICK_MEMBERS]: 'Üyeleri At',
  [PERMISSIONS.BAN_MEMBERS]: 'Üyeleri Yasakla',
  [PERMISSIONS.MANAGE_ROLES]: 'Rolleri Yönet',
  [PERMISSIONS.MANAGE_CHANNELS]: 'Kanalları Yönet',
  [PERMISSIONS.MANAGE_SERVER]: 'Sunucuyu Yönet',
  [PERMISSIONS.VIEW_AUDIT_LOG]: 'Audit Günlüğünü Görüntüle',
  [PERMISSIONS.CONNECT]: 'Bağlan',
  [PERMISSIONS.SPEAK]: 'Konuş',
  [PERMISSIONS.MUTE_MEMBERS]: 'Üyeleri Sessize Al',
  [PERMISSIONS.DEAFEN_MEMBERS]: 'Üyeleri Sağırlaştır',
  [PERMISSIONS.MOVE_MEMBERS]: 'Üyeleri Taşı',
  [PERMISSIONS.USE_VAD]: 'VAD Kullan',
  [PERMISSIONS.PRIORITY_SPEAKER]: 'Öncelikli Konuşmacı',
  [PERMISSIONS.STREAM]: 'Yayın Yap'
};

interface Role {
  id: number;
  server_id: string;
  name: string;
  permissions: number;
  position: number;
  color: number | null;
  hoist: boolean;
  mentionable: boolean;
}

interface ServerMember {
  user_id: string;
  username: string;
  roles: number[];
}

interface ServerRolesModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverId: string;
  serverName: string;
}

export function ServerRolesModal({ isOpen, onClose, serverId, serverName }: ServerRolesModalProps) {
  const { user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<ServerMember[]>([]);
  const [selectedTab, setSelectedTab] = useState<'roles' | 'members'>('roles');
  const [newRoleName, setNewRoleName] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [canManageRoles, setCanManageRoles] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);

  useEffect(() => {
    if (isOpen && serverId) {
      loadRoles();
      loadMembers();
      checkUserPermissions();
    }
  }, [isOpen, serverId]);

  // Check user permissions (owner or role management)
  async function checkUserPermissions() {
    if (!user || !serverId) return;

    try {
      // Check if user is owner
      const { data: ownerData } = await supabase
        .from('servers')
        .select('owner_id')
        .eq('id', serverId)
        .single();

      if (ownerData?.owner_id === user.id) {
        setIsOwner(true);
        setCanManageRoles(true);
        return;
      }

      // Check if user has role management permission
      const { data: userServerData } = await supabase
        .from('server_users')
        .select('id')
        .eq('server_id', serverId)
        .eq('user_id', user.id)
        .single();

      if (userServerData) {
        const { data: userRoles } = await supabase
          .from('server_user_roles')
          .select(`
            server_roles!inner(
              permissions
            )
          `)
          .eq('server_user_id', userServerData.id);

        const hasManageRoles = userRoles?.some(ur =>
          ((ur as any).server_roles?.permissions || 0) & (1 << 5) // MANAGE_ROLES = 1<<5
        );

        setCanManageRoles(hasManageRoles || false);
      }
    } catch (error) {
      console.error('[ServerRolesModal] Permission check failed:', error);
    }
  }

  async function loadRoles() {
    const { data, error } = await supabase
      .from('server_roles')
      .select('*')
      .eq('server_id', serverId)
      .order('position', { ascending: false });

    if (data && !error) {
      setRoles(data);
    }
  }

  async function loadMembers() {
    try {
      console.log('[ServerRolesModal] Loading members for server:', serverId);

      // First get server users
      const { data: serverUsers, error: serverUsersError } = await supabase
        .from('server_users')
        .select('user_id')
        .eq('server_id', serverId);

      if (serverUsersError) {
        console.error('[ServerRolesModal] Error loading server users:', serverUsersError);
        return;
      }

      if (!serverUsers || serverUsers.length === 0) {
        console.log('[ServerRolesModal] No members found in server');
        setMembers([]);
        return;
      }

      console.log('[ServerRolesModal] Found', serverUsers.length, 'server users');

      // Get user IDs and fetch their profiles
      const userIds = serverUsers.map(su => su.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', userIds);

      if (profilesError) {
        console.error('[ServerRolesModal] Error loading profiles:', profilesError);
        return;
      }

      console.log('[ServerRolesModal] Loaded', profiles?.length || 0, 'profiles');

      // Get user roles - assuming server_user_roles uses user_id and server_id or just user_id if roles are global (unlikely)
      // We'll try to fetch by user_id and filter by roles belonging to this server
      // Or better, we assume server_user_roles has (user_id, server_role_id)

      // Since we don't know the exact schema of server_user_roles, we'll try to query it using user_id
      // If server_user_roles uses server_user_id (FK to server_users.id), and server_users.id is missing, this part is broken in DB.
      // We will assume server_user_roles has 'user_id' column for now.

      const { data: userRoles, error: rolesError } = await supabase
        .from('server_user_roles')
        .select('user_id, server_role_id') // Changed from server_user_id to user_id
        .in('user_id', userIds);

      if (rolesError) {
        console.error('[ServerRolesModal] Error loading user roles:', rolesError);
        // If this fails, it might be because column user_id doesn't exist in server_user_roles
        // In that case, the DB schema is definitely broken regarding the missing ID in server_users
      }

      // Combine data
      const membersWithRoles = serverUsers.map(su => {
        const profile = profiles?.find(p => p.id === su.user_id);
        // Filter roles for this user
        const userRoleIds = userRoles?.filter(ur => ur.user_id === su.user_id).map(ur => ur.server_role_id) || [];

        return {
          user_id: su.user_id,
          username: profile?.username || `User ${su.user_id.substring(0, 8)}`,
          roles: userRoleIds
        };
      });

      console.log('[ServerRolesModal] Combined members data:', membersWithRoles);
      setMembers(membersWithRoles);

    } catch (error) {
      console.error('[ServerRolesModal] Exception in loadMembers:', error);
    }
  }

  async function createRole() {
    if (!newRoleName.trim() || !user || !canManageRoles) return;

    setLoading(true);

    const position = roles.length > 0 ? Math.max(...roles.map(r => r.position)) + 1 : 1;

    const { data, error } = await supabase
      .from('server_roles')
      .insert({
        server_id: serverId,
        name: newRoleName.trim(),
        permissions: PERMISSIONS.CONNECT | PERMISSIONS.SPEAK, // Default permissions
        position: position,
        color: null,
        hoist: false,
        mentionable: true
      })
      .select()
      .single();

    if (data && !error) {
      setRoles(prev => [...prev, data]);
      setNewRoleName('');
      console.log('[ServerRolesModal] Role created successfully');
    } else {
      console.error('[ServerRolesModal] Failed to create role:', error);
    }

    setLoading(false);
  }

  // Update role permissions
  async function updateRolePermissions(roleId: number, newPermissions: number) {
    if (!canManageRoles) return;

    try {
      const { error } = await supabase
        .from('server_roles')
        .update({ permissions: newPermissions })
        .eq('id', roleId);

      if (!error) {
        setRoles(prev => prev.map(role =>
          role.id === roleId ? { ...role, permissions: newPermissions } : role
        ));
        console.log('[ServerRolesModal] Role permissions updated');
      }
    } catch (error) {
      console.error('[ServerRolesModal] Failed to update permissions:', error);
    }
  }

  // Delete role
  async function deleteRole(roleId: number) {
    if (!canManageRoles || !confirm('Bu rolü silmek istediğinizden emin misiniz?')) return;

    try {
      const { error } = await supabase
        .from('server_roles')
        .delete()
        .eq('id', roleId);

      if (!error) {
        setRoles(prev => prev.filter(role => role.id !== roleId));
        console.log('[ServerRolesModal] Role deleted successfully');
      }
    } catch (error) {
      console.error('[ServerRolesModal] Failed to delete role:', error);
    }
  }

  // Toggle permission for a role
  function togglePermission(role: Role, permission: number) {
    const newPermissions = role.permissions & permission
      ? role.permissions & ~permission  // Remove permission
      : role.permissions | permission;  // Add permission

    updateRolePermissions(role.id, newPermissions);
  }

  // Assign role to user
  async function assignRoleToUser(userId: string, roleId: number) {
    if (!canManageRoles) return;

    try {
      // We use user_id instead of server_user_id
      const { error } = await supabase
        .from('server_user_roles')
        .insert({ user_id: userId, server_role_id: roleId });

      if (!error) {
        loadMembers(); // Reload to update
        console.log('[ServerRolesModal] Role assigned successfully');
      } else {
        console.error('[ServerRolesModal] Failed to assign role:', error);
      }
    } catch (error) {
      console.error('[ServerRolesModal] Failed to assign role:', error);
    }
  }

  // Remove role from user
  async function removeRoleFromUser(userId: string, roleId: number) {
    if (!canManageRoles) return;

    try {
      const { error } = await supabase
        .from('server_user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('server_role_id', roleId);

      if (!error) {
        loadMembers(); // Reload to update
        console.log('[ServerRolesModal] Role removed successfully');
      } else {
        console.error('[ServerRolesModal] Failed to remove role:', error);
      }
    } catch (error) {
      console.error('[ServerRolesModal] Failed to remove role:', error);
    }
  }

  async function toggleMemberRole(memberUserId: string, roleId: number, hasRole: boolean) {
    if (hasRole) {
      await removeRoleFromUser(memberUserId, roleId);
    } else {
      await assignRoleToUser(memberUserId, roleId);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-gray-900 rounded-lg w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Sunucu Rolleri ve Üyeler</h2>
            <p className="text-sm text-gray-400 mt-1">{serverName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          <button
            onClick={() => setSelectedTab('roles')}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${selectedTab === 'roles'
              ? 'bg-gray-800 text-white border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-white hover:bg-gray-850'
              }`}
          >
            <Shield className="w-5 h-5" />
            Roller ({roles.length})
          </button>
          <button
            onClick={() => setSelectedTab('members')}
            className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${selectedTab === 'members'
              ? 'bg-gray-800 text-white border-b-2 border-blue-500'
              : 'text-gray-400 hover:text-white hover:bg-gray-850'
              }`}
          >
            <UsersIcon className="w-5 h-5" />
            Üyeler ({members.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedTab === 'roles' ? (
            <div className="space-y-4">
              {/* Create Role */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">
                  Yeni Rol Oluştur
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="Rol adı..."
                    className="flex-1 px-3 py-2 bg-gray-900 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && createRole()}
                  />
                  <button
                    onClick={createRole}
                    disabled={loading || !newRoleName.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Oluştur
                  </button>
                </div>
              </div>

              {/* Roles List */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-400 uppercase">
                  Mevcut Roller
                </h3>
                {roles.length === 0 ? (
                  <div className="text-center py-8 text-neutral-500">
                    <Shield className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Henüz rol oluşturulmamış</p>
                  </div>
                ) : (
                  roles.map((role) => (
                    <div key={role.id} className="bg-gray-800 rounded-lg">
                      {/* Role Header */}
                      <div className="p-4 flex items-center justify-between border-b border-gray-700">
                        <div className="flex items-center gap-3">
                          <Shield className="w-5 h-5 text-blue-400" />
                          <div>
                            <div className="text-white font-medium">{role.name}</div>
                            <div className="text-sm text-gray-400">
                              Pozisyon: {role.position}
                            </div>
                          </div>
                          {role.permissions & PERMISSIONS.MANAGE_SERVER && (
                            <Crown className="w-4 h-4 text-yellow-500" />
                          )}
                        </div>
                        {canManageRoles && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditingRole(editingRole?.id === role.id ? null : role)}
                              className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                              title="Düzenle"
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteRole(role.id)}
                              className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                              title="Rolü Sil"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Permissions Display */}
                      <div className="p-4">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {Object.entries(PERMISSION_NAMES).map(([permission, name]) => (
                            <div key={permission} className="flex items-center gap-2">
                              <div className={`w-3 h-3 rounded border ${(role.permissions & parseInt(permission))
                                ? 'bg-green-500 border-green-400'
                                : 'bg-gray-600 border-gray-500'
                                }`} />
                              <span className="text-gray-300">{name}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Edit Permissions */}
                      {editingRole?.id === role.id && canManageRoles && (
                        <div className="p-4 border-t border-gray-700 bg-gray-750">
                          <h4 className="text-sm font-medium text-gray-300 mb-3">Yetki Ayarla</h4>
                          <div className="grid grid-cols-2 gap-2 text-xs max-h-40 overflow-y-auto">
                            {Object.entries(PERMISSION_NAMES).map(([permission, name]) => {
                              const permValue = parseInt(permission);
                              const hasPermission = (role.permissions & permValue) > 0;
                              return (
                                <label key={permission} className="flex items-center gap-2 cursor-pointer hover:bg-gray-700 p-1 rounded">
                                  <input
                                    type="checkbox"
                                    checked={hasPermission}
                                    onChange={() => togglePermission(role, permValue)}
                                    className="rounded"
                                  />
                                  <span className="text-gray-300">{name}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">
                Sunucu Üyeleri
              </h3>
              {members.length === 0 ? (
                <div className="text-center py-8 text-neutral-500">
                  <UsersIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Sunucuda üye bulunamadı</p>
                </div>
              ) : (
                members.map((member) => (
                  <div
                    key={member.user_id}
                    className="p-4 bg-gray-800 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                          <span className="text-white font-semibold">
                            {member.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="text-white font-medium">{member.username}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {roles.map((role) => {
                        const hasRole = member.roles.includes(role.id);
                        return (
                          <button
                            key={role.id}
                            onClick={() => toggleMemberRole(member.user_id, role.id, hasRole)}
                            className={`px-3 py-1 rounded-lg text-sm transition-colors ${hasRole
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                              }`}
                          >
                            {role.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800">
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
