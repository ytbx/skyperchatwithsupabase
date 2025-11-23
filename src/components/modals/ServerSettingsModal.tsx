import { useState, useEffect, useRef } from 'react';
import { X, Shield, Trash2, Plus, Save, Upload, Loader2, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Server, ServerRole, PERMISSIONS } from '@/lib/types';
import { hasPermission } from '@/utils/PermissionUtils';
import { FileUploadService } from '@/services/FileUploadService';
import { toast } from 'sonner';

interface ServerSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    serverId: string;
}

export function ServerSettingsModal({ isOpen, onClose, serverId }: ServerSettingsModalProps) {
    const [activeTab, setActiveTab] = useState<'overview' | 'roles' | 'members'>('overview');
    const [server, setServer] = useState<Server | null>(null);
    const [roles, setRoles] = useState<ServerRole[]>([]);
    const [selectedRole, setSelectedRole] = useState<ServerRole | null>(null);
    const [editedRoleName, setEditedRoleName] = useState('');
    const [editedRoleColor, setEditedRoleColor] = useState('#99aab5');
    const [editedPermissions, setEditedPermissions] = useState<bigint>(0n);
    const [members, setMembers] = useState<any[]>([]);
    const [memberRoles, setMemberRoles] = useState<Record<string, ServerRole[]>>({});
    const [openDropdownMemberId, setOpenDropdownMemberId] = useState<string | null>(null);

    // Overview tab states
    const [editedServerName, setEditedServerName] = useState('');
    const [editedServerDescription, setEditedServerDescription] = useState('');
    const [isUploadingIcon, setIsUploadingIcon] = useState(false);
    const [isSavingServer, setIsSavingServer] = useState(false);
    const serverIconInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && serverId && activeTab === 'members') {
            loadMembers();
        }
    }, [isOpen, serverId, activeTab]);

    async function loadMembers() {
        const { data: membersData } = await supabase
            .from('server_users')
            .select('*, profile:profiles(*)')
            .eq('server_id', serverId);

        if (membersData) {
            setMembers(membersData);
            // Load roles for all members
            const { data: userRolesData } = await supabase
                .from('server_user_roles')
                .select('user_id, role_id, server_roles(*)')
                .eq('server_id', serverId);

            const rolesMap: Record<string, ServerRole[]> = {};
            userRolesData?.forEach((ur: any) => {
                if (!rolesMap[ur.user_id]) rolesMap[ur.user_id] = [];
                if (ur.server_roles) rolesMap[ur.user_id].push(ur.server_roles);
            });
            setMemberRoles(rolesMap);
        }
    }

    async function handleAddRoleToMember(userId: string, roleId: number) {
        const { error } = await supabase
            .from('server_user_roles')
            .insert({ server_id: serverId, user_id: userId, role_id: roleId });

        if (!error) {
            loadMembers(); // Reload to refresh
        }
    }

    async function handleRemoveRoleFromMember(userId: string, roleId: number) {
        const { error } = await supabase
            .from('server_user_roles')
            .delete()
            .eq('server_id', serverId)
            .eq('user_id', userId)
            .eq('role_id', roleId);

        if (!error) {
            loadMembers(); // Reload to refresh
        }
    }

    useEffect(() => {
        if (isOpen && serverId) {
            loadServerData();
            loadRoles();
        }
    }, [isOpen, serverId]);

    useEffect(() => {
        if (selectedRole) {
            setEditedRoleName(selectedRole.name);
            setEditedRoleColor(selectedRole.color);
            setEditedPermissions(BigInt(selectedRole.permissions));
        }
    }, [selectedRole]);

    async function loadServerData() {
        const { data } = await supabase.from('servers').select('*').eq('id', serverId).single();
        setServer(data);
        if (data) {
            setEditedServerName(data.name || '');
            setEditedServerDescription(data.description || '');
        }
    }

    async function loadRoles() {
        const { data } = await supabase
            .from('server_roles')
            .select('*')
            .eq('server_id', serverId)
            .order('position', { ascending: false }); // High position number = higher in list (Discord style usually opposite but let's stick to this for now or clarify)
        // Actually, let's assume Position 0 is lowest (@everyone). Higher number = Higher role.

        if (data) {
            setRoles(data);
        }
    }

    async function handleCreateRole() {
        const newRole = {
            server_id: serverId,
            name: 'New Role',
            color: '#99aab5',
            position: roles.length > 0 ? Math.max(...roles.map(r => r.position)) + 1 : 1,
            permissions: '0',
            is_hoisted: false
        };

        const { data, error } = await supabase.from('server_roles').insert(newRole).select().single();
        if (data) {
            setRoles([...roles, data]);
            setSelectedRole(data);
        }
    }

    async function handleSaveRole() {
        if (!selectedRole) return;

        const updates = {
            name: editedRoleName,
            color: editedRoleColor,
            permissions: editedPermissions.toString()
        };

        const { error } = await supabase
            .from('server_roles')
            .update(updates)
            .eq('id', selectedRole.id);

        if (!error) {
            setRoles(roles.map(r => r.id === selectedRole.id ? { ...r, ...updates } : r));
            alert('Rol kaydedildi!');
        }
    }

    async function handleDeleteRole() {
        if (!selectedRole) return;
        if (confirm('Bu rolü silmek istediğinize emin misiniz?')) {
            await supabase.from('server_roles').delete().eq('id', selectedRole.id);
            setRoles(roles.filter(r => r.id !== selectedRole.id));
            setSelectedRole(null);
        }
    }

    function togglePermission(permission: bigint) {
        if (hasPermission(editedPermissions, permission)) {
            setEditedPermissions(editedPermissions & ~permission);
        } else {
            setEditedPermissions(editedPermissions | permission);
        }
    }

    async function handleServerIconUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file || !server) return;

        const validation = FileUploadService.validateFile(file);
        if (!validation.valid) {
            toast.error(validation.error);
            return;
        }

        setIsUploadingIcon(true);
        try {
            const iconUrl = await FileUploadService.uploadServerImage(server.id, file);

            // Update server in database
            const { error } = await supabase
                .from('servers')
                .update({ server_image_url: iconUrl })
                .eq('id', server.id);

            if (error) throw error;

            setServer({ ...server, server_image_url: iconUrl });
            toast.success('Sunucu ikonu güncellendi!');
        } catch (error) {
            console.error('Server icon upload error:', error);
            toast.error('İkon yüklenirken bir hata oluştu');
        } finally {
            setIsUploadingIcon(false);
            if (serverIconInputRef.current) {
                serverIconInputRef.current.value = '';
            }
        }
    }

    async function handleSaveServerInfo() {
        if (!server) return;

        setIsSavingServer(true);
        try {
            const { error } = await supabase
                .from('servers')
                .update({
                    name: editedServerName,
                    description: editedServerDescription
                })
                .eq('id', server.id);

            if (error) throw error;

            setServer({ ...server, name: editedServerName, description: editedServerDescription });
            toast.success('Sunucu bilgileri güncellendi!');
        } catch (error) {
            console.error('Server update error:', error);
            toast.error('Sunucu güncellenirken bir hata oluştu');
        } finally {
            setIsSavingServer(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-gray-800 w-full max-w-5xl h-[80vh] rounded-lg flex overflow-hidden shadow-2xl">
                {/* Sidebar */}
                <div className="w-60 bg-gray-900 p-4 flex flex-col gap-1">
                    <h2 className="text-xs font-bold text-gray-500 uppercase mb-2 px-2">{server?.name}</h2>
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`text-left px-3 py-2 rounded text-sm font-medium ${activeTab === 'overview' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
                    >
                        Genel Görünüm
                    </button>
                    <button
                        onClick={() => setActiveTab('roles')}
                        className={`text-left px-3 py-2 rounded text-sm font-medium ${activeTab === 'roles' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
                    >
                        Roller
                    </button>
                    <button
                        onClick={() => setActiveTab('members')}
                        className={`text-left px-3 py-2 rounded text-sm font-medium ${activeTab === 'members' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
                    >
                        Üyeler
                    </button>

                    <div className="mt-auto">
                        <button onClick={onClose} className="text-left px-3 py-2 rounded text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-gray-200 w-full flex items-center gap-2">
                            <X size={16} /> Çıkış
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 bg-gray-800 flex flex-col">
                    {activeTab === 'roles' && (
                        <div className="flex h-full">
                            {/* Roles List */}
                            <div className="w-60 bg-gray-850 border-r border-gray-700 p-4 flex flex-col">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="text-white font-semibold">Roller</h3>
                                    <button onClick={handleCreateRole} className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white">
                                        <Plus size={16} />
                                    </button>
                                </div>
                                <div className="space-y-1 overflow-y-auto flex-1">
                                    {roles.map(role => (
                                        <button
                                            key={role.id}
                                            onClick={() => setSelectedRole(role)}
                                            className={`w-full text-left px-3 py-2 rounded flex items-center gap-2 ${selectedRole?.id === role.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
                                        >
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color }} />
                                            <span className="truncate">{role.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Role Editor */}
                            <div className="flex-1 p-8 overflow-y-auto">
                                {selectedRole ? (
                                    <div className="max-w-2xl space-y-8">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-2xl font-bold text-white">Rolü Düzenle - {selectedRole.name}</h2>
                                            <button onClick={handleDeleteRole} className="text-red-400 hover:text-red-300 p-2 border border-red-400/30 rounded">
                                                <Trash2 size={20} />
                                            </button>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Rol Adı</label>
                                                <input
                                                    type="text"
                                                    value={editedRoleName}
                                                    onChange={e => setEditedRoleName(e.target.value)}
                                                    className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-primary-500 outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Rol Rengi</label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="color"
                                                        value={editedRoleColor}
                                                        onChange={e => setEditedRoleColor(e.target.value)}
                                                        className="h-10 w-20 bg-transparent cursor-pointer"
                                                    />
                                                    <input
                                                        type="text"
                                                        value={editedRoleColor}
                                                        onChange={e => setEditedRoleColor(e.target.value)}
                                                        className="flex-1 bg-gray-900 border border-gray-700 rounded p-2 text-white focus:border-primary-500 outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="border-t border-gray-700 pt-6">
                                            <h3 className="text-lg font-semibold text-white mb-4">İzinler</h3>
                                            <div className="space-y-4">
                                                {Object.entries(PERMISSIONS).map(([key, value]) => (
                                                    <div key={key} className="flex items-center justify-between py-2 border-b border-gray-700/50">
                                                        <div>
                                                            <div className="text-white font-medium">{key.replace(/_/g, ' ')}</div>
                                                            <div className="text-xs text-gray-400">Bu izne sahip üyeler {key.toLowerCase().replace(/_/g, ' ')} yapabilir.</div>
                                                        </div>
                                                        <button
                                                            onClick={() => togglePermission(value as bigint)}
                                                            className={`w-12 h-6 rounded-full transition-colors relative ${hasPermission(editedPermissions, value as bigint) ? 'bg-green-500' : 'bg-gray-600'}`}
                                                        >
                                                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${hasPermission(editedPermissions, value as bigint) ? 'left-7' : 'left-1'}`} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="fixed bottom-8 right-8 bg-gray-900 p-4 rounded shadow-lg flex gap-4 animate-slide-up">
                                            <button onClick={() => setSelectedRole(null)} className="text-gray-400 hover:text-white px-4 py-2">İptal</button>
                                            <button onClick={handleSaveRole} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded flex items-center gap-2">
                                                <Save size={18} /> Değişiklikleri Kaydet
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                        <Shield size={64} className="mb-4 opacity-50" />
                                        <p>Düzenlemek için bir rol seçin</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'overview' && (
                        <div className="p-8 overflow-y-auto">
                            <h2 className="text-2xl font-bold text-white mb-6">Sunucu Genel Görünümü</h2>

                            <div className="max-w-2xl space-y-6">
                                {/* Server Icon */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-3">Sunucu İkonu</label>
                                    <div className="flex items-center gap-4">
                                        <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center relative overflow-hidden">
                                            {server?.server_image_url ? (
                                                <img
                                                    src={server.server_image_url}
                                                    alt="Server icon"
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <ImageIcon className="w-12 h-12 text-gray-500" />
                                            )}
                                            {isUploadingIcon && (
                                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                                                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <input
                                                ref={serverIconInputRef}
                                                type="file"
                                                accept="image/*"
                                                onChange={handleServerIconUpload}
                                                className="hidden"
                                            />
                                            <button
                                                onClick={() => serverIconInputRef.current?.click()}
                                                disabled={isUploadingIcon}
                                                className="px-4 py-2 bg-primary-500 text-white rounded hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                            >
                                                {isUploadingIcon ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                        Yükleniyor...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload className="w-4 h-4" />
                                                        İkon Yükle
                                                    </>
                                                )}
                                            </button>
                                            <p className="text-xs text-gray-500 mt-2">Maksimum 1MB</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Server Name */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Sunucu Adı</label>
                                    <input
                                        type="text"
                                        value={editedServerName}
                                        onChange={e => setEditedServerName(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white focus:border-primary-500 outline-none"
                                        placeholder="Sunucu adını girin"
                                    />
                                </div>

                                {/* Server Description */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Sunucu Açıklaması</label>
                                    <textarea
                                        value={editedServerDescription}
                                        onChange={e => setEditedServerDescription(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white focus:border-primary-500 outline-none resize-none"
                                        placeholder="Sunucu açıklamasını girin (opsiyonel)"
                                        rows={4}
                                    />
                                </div>

                                {/* Save Button */}
                                <div className="pt-4">
                                    <button
                                        onClick={handleSaveServerInfo}
                                        disabled={isSavingServer}
                                        className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        {isSavingServer ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Kaydediliyor...
                                            </>
                                        ) : (
                                            <>
                                                <Save className="w-4 h-4" />
                                                Değişiklikleri Kaydet
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'members' && (
                        <div className="p-8 h-full flex flex-col">
                            <h2 className="text-2xl font-bold text-white mb-4">Üyeler</h2>
                            <div className="flex-1 overflow-y-auto space-y-2">
                                {members.map(member => (
                                    <div key={member.id} className="bg-gray-850 p-4 rounded flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                                                {member.profile?.profile_image_url ? (
                                                    <img src={member.profile.profile_image_url} alt="" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-white font-semibold">{member.profile?.username?.charAt(0).toUpperCase()}</span>
                                                )}
                                            </div>
                                            <div>
                                                <div className="text-white font-medium">{member.profile?.username}</div>
                                                <div className="flex gap-1 mt-1">
                                                    {memberRoles[member.user_id]?.map(role => (
                                                        <span key={role.id} className="text-xs px-2 py-0.5 rounded text-white flex items-center gap-1" style={{ backgroundColor: role.color }}>
                                                            {role.name}
                                                            <button onClick={() => handleRemoveRoleFromMember(member.user_id, role.id)} className="hover:text-red-200">
                                                                <X size={12} />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="relative">
                                            <button
                                                onClick={() => setOpenDropdownMemberId(openDropdownMemberId === member.user_id ? null : member.user_id)}
                                                className={`p-2 rounded hover:bg-gray-700 hover:text-white transition-colors ${openDropdownMemberId === member.user_id ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
                                            >
                                                <Plus size={20} />
                                            </button>

                                            {/* Role Dropdown */}
                                            {openDropdownMemberId === member.user_id && (
                                                <>
                                                    <div className="fixed inset-0 z-10" onClick={() => setOpenDropdownMemberId(null)} />
                                                    <div className="absolute right-0 mt-2 w-48 bg-gray-900 rounded shadow-xl border border-gray-700 z-20">
                                                        <div className="p-2 space-y-1">
                                                            {roles.filter(r => !memberRoles[member.user_id]?.some(mr => mr.id === r.id)).map(role => (
                                                                <button
                                                                    key={role.id}
                                                                    onClick={() => {
                                                                        handleAddRoleToMember(member.user_id, role.id);
                                                                        setOpenDropdownMemberId(null);
                                                                    }}
                                                                    className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 text-gray-300 text-sm flex items-center gap-2"
                                                                >
                                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }} />
                                                                    {role.name}
                                                                </button>
                                                            ))}
                                                            {roles.filter(r => !memberRoles[member.user_id]?.some(mr => mr.id === r.id)).length === 0 && (
                                                                <div className="text-xs text-gray-500 text-center py-2">Eklenecek rol yok</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
