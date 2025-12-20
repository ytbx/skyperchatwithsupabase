import { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { LoginForm } from '@/components/auth/LoginForm';
import { SignUpForm } from '@/components/auth/SignUpForm';
import { ServerList } from '@/components/layout/ServerList';
import { ChannelList } from '@/components/layout/ChannelList';
import { MessageArea } from '@/components/layout/MessageArea';
import { MemberList } from '@/components/layout/MemberList';
import { CreateServerModal } from '@/components/modals/CreateServerModal';
import { CreateChannelModal } from '@/components/modals/CreateChannelModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { ServerSettingsModal } from '@/components/modals/ServerSettingsModal';
import { EditChannelModal } from '@/components/modals/EditChannelModal';
import { ServerInviteModal } from '@/components/modals/ServerInviteModal';
import { DirectMessageArea } from '@/components/dm/DirectMessageArea';
import { FriendsList } from '@/components/friends/FriendsList';
import { NotificationSystem } from '@/components/notifications/NotificationSystem';
import { GlobalSearchModal } from '@/components/modals/GlobalSearchModal';
import { JoinServerPage } from '@/pages/JoinServerPage';
import { CallNotification } from '@/components/call/CallNotification';
import { VoiceChannelView } from '@/components/voice/VoiceChannelView';
import { VoiceChannelMiniPlayer } from '@/components/voice/VoiceChannelMiniPlayer';
import { Users, Hash } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Channel } from '@/lib/types';
import { SupabaseRealtimeProvider } from '@/contexts/SupabaseRealtimeContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { CallProvider } from '@/contexts/CallContext';
import { VoiceChannelProvider, useVoiceChannel } from '@/contexts/VoiceChannelContext';
import { UserAudioProvider } from '@/contexts/UserAudioContext';
import { DeviceSettingsProvider } from '@/contexts/DeviceSettingsContext';
import { NoiseSuppressionProvider } from '@/contexts/NoiseSuppressionContext';
import { GlobalAudio } from '@/components/layout/GlobalAudio';
import { GlobalKeybindListener } from '@/components/GlobalKeybindListener';
import { ErrorBoundary } from '@/components/ErrorBoundary';

import { FriendProvider } from '@/contexts/FriendContext';

function AppContent() {
    const { user, loading } = useAuth();
    const { activeChannelId, participants, toggleScreenShare } = useVoiceChannel();
    const [showSignUp, setShowSignUp] = useState(false);

    // View states - Default is Friends page
    const [currentView, setCurrentView] = useState<'servers' | 'friends'>('friends');

    // Server-related states
    const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
    const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
    const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
    const [selectedServerName, setSelectedServerName] = useState<string>('');

    // DM-related states
    const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
    const [selectedContactName, setSelectedContactName] = useState<string | null>(null);
    const [selectedContactProfileImage, setSelectedContactProfileImage] = useState<string | null>(null);

    // Modal states
    const [showCreateServerModal, setShowCreateServerModal] = useState(false);
    const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [showServerInviteModal, setShowServerInviteModal] = useState(false);
    const [showServerSettingsModal, setShowServerSettingsModal] = useState(false);
    const [showEditChannelModal, setShowEditChannelModal] = useState(false);
    const [editingChannelId, setEditingChannelId] = useState<number | null>(null);

    const [showMemberList, setShowMemberList] = useState(true);
    const [showGlobalSearch, setShowGlobalSearch] = useState(false);

    // Handle ESC key and keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Global search modal keyboard shortcut
            if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault();
                setShowGlobalSearch(true);
                console.log('[App] 🔍 GlobalSearch opened with Ctrl+K');
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showGlobalSearch]);

    // Load channel details when channel ID changes
    useEffect(() => {
        if (selectedChannelId) {
            loadChannelDetails();
        } else {
            setSelectedChannel(null);
        }
    }, [selectedChannelId]);

    // Load server name
    useEffect(() => {
        if (selectedServerId) {
            loadServerName();
        } else {
            setSelectedServerName('');
        }
    }, [selectedServerId]);

    // Fetch active channel name if connected
    const [activeChannelName, setActiveChannelName] = useState<string>('');
    useEffect(() => {
        if (activeChannelId) {
            supabase
                .from('channels')
                .select('name')
                .eq('id', activeChannelId)
                .single()
                .then(({ data }) => {
                    if (data) setActiveChannelName(data.name);
                });
        }
    }, [activeChannelId]);

    async function loadChannelDetails() {
        if (!selectedChannelId) return;

        const { data, error } = await supabase
            .from('channels')
            .select('*')
            .eq('id', selectedChannelId)
            .maybeSingle();

        if (data && !error) {
            setSelectedChannel(data);
        }
    }

    async function loadServerName() {
        if (!selectedServerId) return;

        const { data, error } = await supabase
            .from('servers')
            .select('name')
            .eq('id', selectedServerId)
            .maybeSingle();

        if (data && !error) {
            setSelectedServerName(data.name);
        }
    }

    // Handle view switching
    const handleViewChange = (view: 'servers' | 'friends') => {
        setCurrentView(view);
        // Reset selections when switching views
        if (view !== 'servers') {
            setSelectedServerId(null);
            setSelectedChannelId(null);
        }
        if (view === 'servers') {
            setSelectedContactId(null);
            setSelectedContactName(null);
        }
    };

    // Handle DM conversation selection
    const handleConversationSelect = (contactId: string, contactName: string) => {
        setSelectedContactId(contactId);
        setSelectedContactName(contactName);
    };

    // Handle starting DM from friends list - Open chat directly without changing view
    const handleStartDM = (friendId: string, friendName: string, profileImageUrl: string | null) => {
        setSelectedContactId(friendId);
        setSelectedContactName(friendName);
        setSelectedContactProfileImage(profileImageUrl);
    };

    // Global add action handler - Always opens server modal
    const handleAddAction = () => {
        // Always open server creation modal when (+) button is clicked
        setShowCreateServerModal(true);
    };

    // Handle channel creation
    const handleCreateChannel = () => {
        if (selectedServerId) {
            setShowCreateChannelModal(true);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-neutral-400">Yükleniyor...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return showSignUp ? (
            <SignUpForm onToggle={() => setShowSignUp(false)} />
        ) : (
            <LoginForm onToggle={() => setShowSignUp(true)} />
        );
    }

    // Determine what to render in the main area
    const renderMainContent = () => {
        // 1. Voice Channel View (Full Screen)
        // Render if we are in servers view AND the selected channel is the active voice channel
        if (currentView === 'servers' && activeChannelId && selectedChannelId === activeChannelId) {
            return (
                <VoiceChannelView
                    channelId={activeChannelId}
                    channelName={activeChannelName}
                    participants={participants}
                    onStartScreenShare={toggleScreenShare}
                />
            );
        }

        // 2. Text Channel View
        // Render if we are in servers view AND we have a selected channel (that is NOT the active voice channel, or we aren't in voice)
        if (currentView === 'servers' && selectedChannelId && selectedChannel) {
            return <MessageArea channelId={selectedChannelId} />;
        }

        // 3. Empty Server State (No channel selected)
        if (currentView === 'servers' && !selectedChannelId) {
            return (
                <div className="flex-1 flex items-center justify-center bg-gray-900">
                    <div className="text-center px-4">
                        <div className="w-20 h-20 bg-gray-800 rounded-full mx-auto mb-6 flex items-center justify-center">
                            <Hash className="w-10 h-10 text-gray-600" />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">
                            Bir kanala katılın
                        </h3>
                        <p className="text-gray-400 max-w-md">
                            Sol taraftan bir kanal seçerek sohbete başlayın
                        </p>
                    </div>
                </div>
            );
        }

        // 4. Friends View (Empty State)
        if (currentView === 'friends' && !selectedContactId) {
            return (
                <div className="flex-1 flex items-center justify-center bg-gray-900">
                    <div className="text-center">
                        <div className="w-16 h-16 bg-green-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                            <Users className="w-8 h-8 text-white" />
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-2">
                            Arkadaşlar
                        </h3>
                        <p className="text-gray-400">
                            Arkadaşınızı seçin ve sohbet başlatın
                        </p>
                    </div>
                </div>
            );
        }

        // 5. Direct Message View
        if (currentView === 'friends' && selectedContactId && selectedContactName) {
            return (
                <DirectMessageArea
                    contactId={selectedContactId}
                    contactName={selectedContactName}
                    contactProfileImageUrl={selectedContactProfileImage}
                />
            );
        }

        return null;
    };

    return (
        <div className="h-screen bg-gray-900 flex overflow-hidden relative">
            <GlobalKeybindListener />
            {/* Left Sidebar - Always visible */}
            <ServerList
                selectedServerId={selectedServerId}
                currentView={currentView}
                onSelectServer={(serverId) => {
                    setSelectedServerId(serverId);
                    setSelectedChannelId(null);
                    setCurrentView('servers');
                }}
                onViewChange={handleViewChange}
                onAddAction={handleAddAction}
                onSettings={() => setShowSettingsModal(true)}
                onSearch={() => setShowGlobalSearch(true)}
            />

            {/* Second Panel - Changes based on current view */}
            {currentView === 'servers' && (
                <ChannelList
                    serverId={selectedServerId}
                    selectedChannelId={selectedChannelId}
                    onSelectChannel={setSelectedChannelId}
                    onCreateChannel={handleCreateChannel}
                    onInvite={() => setShowServerInviteModal(true)}
                    onServerSettings={() => setShowServerSettingsModal(true)}
                    onEditChannel={(channelId) => {
                        setEditingChannelId(channelId);
                        setShowEditChannelModal(true);
                    }}
                />
            )}

            {currentView === 'friends' && (
                <FriendsList
                    onStartDM={handleStartDM}
                />
            )}

            {/* Main Content Area */}
            {renderMainContent()}

            {/* Mini Player Overlay */}
            {/* Show if we are connected to voice AND (we are NOT viewing the active voice channel OR we are in a different view) */}
            {activeChannelId && (currentView !== 'servers' || selectedChannelId !== activeChannelId) && (
                <VoiceChannelMiniPlayer
                    onMaximize={() => {
                        if (selectedServerId) {
                            setSelectedChannelId(activeChannelId);
                            setCurrentView('servers');
                        } else {
                            supabase.from('channels').select('server_id').eq('id', activeChannelId).single().then(({ data }) => {
                                if (data) {
                                    setSelectedServerId(data.server_id);
                                    setSelectedChannelId(activeChannelId);
                                    setCurrentView('servers');
                                }
                            });
                        }
                    }}
                />
            )}



            {/* Right Sidebar - Member List (only for servers) */}
            {showMemberList && currentView === 'servers' && selectedServerId && (
                <MemberList serverId={selectedServerId} />
            )}

            {/* Top Bar with Notifications - Always visible */}
            <div className="absolute top-4 right-4 z-30">
                <NotificationSystem
                    onNavigate={(type, id, serverId) => {
                        console.log('[App] Notification navigation:', type, id, serverId);
                        if (type === 'channel') {
                            if (serverId) {
                                setSelectedServerId(serverId);
                                setSelectedChannelId(Number(id));
                                setCurrentView('servers');
                            }
                        } else if (type === 'dm') {
                            // Fetch user details to open DM
                            supabase
                                .from('profiles')
                                .select('username, profile_image_url')
                                .eq('id', id)
                                .single()
                                .then(({ data }) => {
                                    if (data) {
                                        setSelectedContactId(id);
                                        setSelectedContactName(data.username);
                                        setSelectedContactProfileImage(data.profile_image_url);
                                        setCurrentView('friends');
                                    }
                                });
                        }
                    }}
                />
            </div>

            {/* Call Notification - Always visible */}
            <CallNotification />

            {/* Modals */}
            <CreateServerModal
                isOpen={showCreateServerModal}
                onClose={() => setShowCreateServerModal(false)}
                onServerCreated={() => {
                    // Refresh will happen automatically via realtime subscription
                }}
            />

            <CreateChannelModal
                isOpen={showCreateChannelModal}
                onClose={() => setShowCreateChannelModal(false)}
                serverId={selectedServerId || ''}
                onChannelCreated={() => {
                    // Refresh will happen automatically via realtime subscription
                }}
            />

            <SettingsModal
                isOpen={showSettingsModal}
                onClose={() => setShowSettingsModal(false)}
            />

            {selectedServerId && (
                <>
                    <ServerInviteModal
                        isOpen={showServerInviteModal}
                        onClose={() => setShowServerInviteModal(false)}
                        serverId={selectedServerId}
                        serverName={selectedServerName}
                    />
                    <ServerSettingsModal
                        isOpen={showServerSettingsModal}
                        onClose={() => setShowServerSettingsModal(false)}
                        serverId={selectedServerId}
                    />
                    {editingChannelId && (
                        <EditChannelModal
                            isOpen={showEditChannelModal}
                            onClose={() => setShowEditChannelModal(false)}
                            channelId={editingChannelId}
                            serverId={selectedServerId}
                        />
                    )}
                </>
            )}

            {/* Global Search Modal */}
            <GlobalSearchModal
                isOpen={showGlobalSearch}
                onClose={() => setShowGlobalSearch(false)}
                onSelectServer={(serverId) => {
                    setSelectedServerId(serverId);
                    setSelectedChannelId(null);
                    setCurrentView('servers');
                }}
                onSelectChannel={(channelId, serverId) => {
                    setSelectedServerId(serverId);
                    setSelectedChannelId(channelId);
                    setCurrentView('servers');
                }}
                onSelectUser={async (userId, username) => {
                    // Switch to friends view and open DM
                    setCurrentView('friends');
                    setSelectedContactId(userId);
                    setSelectedContactName(username);
                }}
                onAddFriend={(userId, username) => {
                    // Show friend request sent confirmation
                    alert(`${username} kullanıcısına arkadaş isteği gönderildi!`);
                    // Optionally refresh friends list or show pending requests
                    setCurrentView('friends');
                }}
            />
        </div>
    );
}



function App() {
    return (
        <AuthProvider>
            <NotificationProvider>
                <DeviceSettingsProvider>
                    <NoiseSuppressionProvider>
                        <CallProvider>
                            <VoiceChannelProvider>
                                <UserAudioProvider>
                                    <SupabaseRealtimeProvider>
                                        <FriendProvider>
                                            <ErrorBoundary>
                                                <GlobalAudio />
                                            </ErrorBoundary>
                                            <Routes>
                                                <Route path="/" element={<AppContent />} />
                                                <Route path="/invite/:inviteCode" element={<JoinServerPage />} />
                                            </Routes>
                                        </FriendProvider>
                                    </SupabaseRealtimeProvider>
                                </UserAudioProvider>
                            </VoiceChannelProvider>
                        </CallProvider>
                    </NoiseSuppressionProvider>
                </DeviceSettingsProvider>
            </NotificationProvider>
        </AuthProvider>
    );
}

export default App;