import { useState, useEffect } from 'react';
import { X, Hash, Volume2, Save, Trash2, Plus, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Channel, ServerRole, ChannelPermission, PERMISSIONS } from '@/lib/types';

interface EditChannelModalProps {
    isOpen: boolean;
    onClose: () => void;
    channelId: number;
    serverId: string;
}

export function EditChannelModal({ isOpen, onClose, channelId, serverId }: EditChannelModalProps) {
    const [activeTab, setActiveTab] = useState<'overview' | 'permissions'>('overview');
    const [channel, setChannel] = useState<Channel | null>(null);
    const [channelName, setChannelName] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [roles, setRoles] = useState<ServerRole[]>([]);
    const [permissions, setPermissions] = useState<ChannelPermission[]>([]);
    const [showAddDropdown, setShowAddDropdown] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [memberResults, setMemberResults] = useState<any[]>([]);

    useEffect(() => {
        if (isOpen && channelId) {
            loadChannelData();
            loadRoles();
            loadPermissions();
        }
    }, [isOpen, channelId]);

    async function loadChannelData() {
        const { data } = await supabase.from('channels').select('*').eq('id', channelId).single();
        if (data) {
            setChannel(data);
            setChannelName(data.name);
            setIsPrivate(data.is_private);
        }
    }

    async function loadRoles() {
        const { data } = await supabase.from('server_roles').select('*').eq('server_id', serverId).order('position', { ascending: false });
        if (data) setRoles(data);
    }

    async function loadPermissions() {
        const { data } = await supabase.from('channel_permissions').select('*').eq('channel_id', channelId);
        if (data) setPermissions(data);
    }

    async function handleSaveOverview() {
        if (!channel) return;
        const { error } = await supabase
            .from('channels')
            .update({ name: channelName, is_private: isPrivate })
            .eq('id', channelId);

        if (!error) {
            alert('Kanal güncellendi!');
            onClose();
        }
    }

    async function handleDeleteChannel() {
        if (!confirm('Bu kanalı silmek istediğinize emin misiniz?')) return;
        await supabase.from('channels').delete().eq('id', channelId);
        onClose();
    }

    async function handleAddPermission(targetId: number | string, type: 'role' | 'member') {
        const payload: any = {
            channel_id: channelId,
            allow: PERMISSIONS.VIEW_CHANNEL.toString(),
            deny: '0'
        };

        if (type === 'role') {
            payload.role_id = targetId;
        } else {
            payload.user_id = targetId;
        }

        const { data, error } = await supabase
            .from('channel_permissions')
            .insert(payload)
            .select()
            .single();

        if (data) {
            setPermissions([...permissions, data]);
            setShowAddDropdown(false);
            setSearchQuery('');
        }
    }

    async function handleRemovePermission(permissionId: number) {
        await supabase.from('channel_permissions').delete().eq('id', permissionId);
        setPermissions(permissions.filter(p => p.id !== permissionId));
    }

    useEffect(() => {
        if (showAddDropdown && searchQuery) {
            const timer = setTimeout(searchMembers, 300);
            return () => clearTimeout(timer);
        } else {
            setMemberResults([]);
        }
    }, [showAddDropdown, searchQuery]);

    async function searchMembers() {
        if (!searchQuery.trim()) return;

        // First get server members
        const { data: serverMembers } = await supabase
            .from('server_users')
            .select('user_id')
            .eq('server_id', serverId);

        if (!serverMembers?.length) return;

        const memberIds = serverMembers.map(m => m.user_id);

        // Then search profiles
        const { data: profiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', memberIds)
            .ilike('username', `%${searchQuery}%`)
            .limit(5);

        if (profiles) {
            setMemberResults(profiles);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-gray-800 w-full max-w-4xl h-[70vh] rounded-lg flex overflow-hidden shadow-2xl">
                {/* Sidebar */}
                <div className="w-60 bg-gray-900 p-4 flex flex-col gap-1">
                    <h2 className="text-xs font-bold text-gray-500 uppercase mb-2 px-2">Kanal Ayarları</h2>
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`text-left px-3 py-2 rounded text-sm font-medium ${activeTab === 'overview' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
                    >
                        Genel Görünüm
                    </button>
                    <button
                        onClick={() => setActiveTab('permissions')}
                        className={`text-left px-3 py-2 rounded text-sm font-medium ${activeTab === 'permissions' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'}`}
                    >
                        İzinler
                    </button>

                    <div className="mt-auto">
                        <button onClick={handleDeleteChannel} className="text-left px-3 py-2 rounded text-sm font-medium text-red-400 hover:bg-red-900/20 w-full flex items-center gap-2 mb-2">
                            <Trash2 size={16} /> Kanalı Sil
                        </button>
                        <button onClick={onClose} className="text-left px-3 py-2 rounded text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-gray-200 w-full flex items-center gap-2">
                            <X size={16} /> Çıkış
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 bg-gray-800 p-8 overflow-y-auto">
                    {activeTab === 'overview' && (
                        <div className="max-w-xl space-y-6">
                            <h2 className="text-2xl font-bold text-white mb-4">Genel Görünüm</h2>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Kanal Adı</label>
                                <div className="relative">
                                    {channel?.is_voice ? <Volume2 className="absolute left-3 top-2.5 text-gray-400" size={20} /> : <Hash className="absolute left-3 top-2.5 text-gray-400" size={20} />}
                                    <input
                                        type="text"
                                        value={channelName}
                                        onChange={e => setChannelName(e.target.value)}
                                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 pl-10 text-white focus:border-primary-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <label className="text-white font-medium">Özel Kanal</label>
                                    <p className="text-sm text-gray-400">Sadece seçili üyeler ve roller görebilir.</p>
                                </div>
                                <button
                                    onClick={() => setIsPrivate(!isPrivate)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isPrivate ? 'bg-green-500' : 'bg-gray-600'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            <div className="pt-4">
                                <button onClick={handleSaveOverview} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded flex items-center gap-2">
                                    <Save size={18} /> Değişiklikleri Kaydet
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'permissions' && (
                        <div className="h-full flex flex-col">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold text-white">İzinler</h2>
                                <div className="relative">
                                    <button
                                        onClick={() => setShowAddDropdown(!showAddDropdown)}
                                        className="bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded text-sm flex items-center gap-2"
                                    >
                                        <Plus size={16} /> Rol/Üye Ekle
                                    </button>

                                    {showAddDropdown && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowAddDropdown(false)} />
                                            <div className="absolute right-0 mt-2 w-64 bg-gray-900 rounded shadow-xl border border-gray-700 z-20 flex flex-col max-h-80">
                                                <div className="p-2 border-b border-gray-800 sticky top-0 bg-gray-900 z-30">
                                                    <div className="relative">
                                                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" size={14} />
                                                        <input
                                                            type="text"
                                                            value={searchQuery}
                                                            onChange={e => setSearchQuery(e.target.value)}
                                                            placeholder="Rol veya üye ara..."
                                                            className="w-full bg-gray-800 border border-gray-700 rounded pl-8 pr-2 py-1 text-sm text-white focus:border-primary-500 outline-none"
                                                            autoFocus
                                                        />
                                                    </div>
                                                </div>

                                                <div className="overflow-y-auto p-2 space-y-1">
                                                    {/* Roles */}
                                                    <div className="text-xs font-semibold text-gray-500 uppercase px-2 py-1">Roller</div>
                                                    {roles
                                                        .filter(r => !permissions.some(p => p.role_id === r.id))
                                                        .filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                                        .map(role => (
                                                            <button
                                                                key={role.id}
                                                                onClick={() => handleAddPermission(role.id, 'role')}
                                                                className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 text-gray-300 text-sm flex items-center gap-2"
                                                            >
                                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }} />
                                                                {role.name}
                                                            </button>
                                                        ))}

                                                    {/* Members */}
                                                    {memberResults.length > 0 && (
                                                        <>
                                                            <div className="text-xs font-semibold text-gray-500 uppercase px-2 py-1 mt-2">Üyeler</div>
                                                            {memberResults
                                                                .filter(m => !permissions.some(p => p.user_id === m.id))
                                                                .map(member => (
                                                                    <button
                                                                        key={member.id}
                                                                        onClick={() => handleAddPermission(member.id, 'member')}
                                                                        className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-800 text-gray-300 text-sm flex items-center gap-2"
                                                                    >
                                                                        <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                                                                            {member.profile_image_url ? (
                                                                                <img src={member.profile_image_url} alt="" className="w-full h-full object-cover" />
                                                                            ) : (
                                                                                <span className="text-xs text-white">{member.username?.charAt(0).toUpperCase()}</span>
                                                                            )}
                                                                        </div>
                                                                        {member.username}
                                                                    </button>
                                                                ))}
                                                        </>
                                                    )}

                                                    {roles.filter(r => !permissions.some(p => p.role_id === r.id)).length === 0 && memberResults.length === 0 && (
                                                        <div className="text-xs text-gray-500 text-center py-2">Sonuç bulunamadı</div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                {permissions.map(perm => {
                                    if (perm.role_id) {
                                        const role = roles.find(r => r.id === perm.role_id);
                                        if (!role) return null;
                                        return (
                                            <div key={perm.id} className="bg-gray-850 p-4 rounded flex items-center justify-between">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: role.color }} />
                                                    <span className="text-white font-medium">{role.name}</span>
                                                    <span className="text-xs text-gray-500 ml-2">(Rol)</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className="text-sm text-gray-400">Kanalı Görebilir</div>
                                                    <button onClick={() => handleRemovePermission(perm.id)} className="text-gray-400 hover:text-red-400">
                                                        <Trash2 size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    } else if (perm.user_id) {
                                        return (
                                            <PermissionItem
                                                key={perm.id}
                                                permission={perm}
                                                onRemove={() => handleRemovePermission(perm.id)}
                                            />
                                        );
                                    }
                                    return null;
                                })}
                                {permissions.length === 0 && (
                                    <div className="text-center text-gray-500 py-8">
                                        Bu kanal için özel izin ayarlanmamış.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function PermissionItem({ permission, onRemove }: { permission: ChannelPermission, onRemove: () => void }) {
    const [userProfile, setUserProfile] = useState<any>(null);

    useEffect(() => {
        if (permission.user_id) {
            supabase.from('profiles').select('*').eq('id', permission.user_id).single().then(({ data }) => {
                setUserProfile(data);
            });
        }
    }, [permission.user_id]);

    if (!userProfile) return null;

    return (
        <div className="bg-gray-850 p-4 rounded flex items-center justify-between">
            <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                    {userProfile.profile_image_url ? (
                        <img src={userProfile.profile_image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                        <span className="text-xs text-white">{userProfile.username?.charAt(0).toUpperCase()}</span>
                    )}
                </div>
                <span className="text-white font-medium">{userProfile.username}</span>
                <span className="text-xs text-gray-500 ml-2">(Üye)</span>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-sm text-gray-400">Kanalı Görebilir</div>
                <button onClick={onRemove} className="text-gray-400 hover:text-red-400">
                    <Trash2 size={18} />
                </button>
            </div>
        </div>
    );
}
