import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Volume1, Music2, Mic, MicOff, Bell, BellOff, Check } from 'lucide-react';
import { useUserAudio } from '@/contexts/UserAudioContext';
import { toast } from 'sonner';

const MUTED_USERS_NOTIFICATIONS_KEY = 'muted_users_notifications';

interface UserVolumeContextMenuProps {
    x: number;
    y: number;
    userId: string;
    username: string;
    profileImageUrl?: string;
    onClose: () => void;
}

type TabType = 'voice' | 'soundpad';

export function UserVolumeContextMenu({
    x,
    y,
    userId,
    username,
    profileImageUrl,
    onClose
}: UserVolumeContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [activeTab, setActiveTab] = useState<TabType>('voice');

    const {
        getUserVoiceVolume,
        getUserVoiceMuted,
        setUserVoiceVolume,
        toggleUserVoiceMute,
        getUserSoundpadVolume,
        getUserSoundpadMuted,
        setUserSoundpadVolume,
        toggleUserSoundpadMute
    } = useUserAudio();

    const voiceVolume = getUserVoiceVolume(userId);
    const isVoiceMuted = getUserVoiceMuted(userId);
    const soundpadVolume = getUserSoundpadVolume(userId);
    const isSoundpadMuted = getUserSoundpadMuted(userId);

    // Notification mute state
    const [isNotificationMuted, setIsNotificationMuted] = useState<boolean>(() => {
        try {
            const stored = localStorage.getItem(MUTED_USERS_NOTIFICATIONS_KEY);
            if (stored) {
                const mutedUsers: string[] = JSON.parse(stored);
                return mutedUsers.includes(userId);
            }
        } catch { }
        return false;
    });

    const toggleNotificationMute = () => {
        try {
            const stored = localStorage.getItem(MUTED_USERS_NOTIFICATIONS_KEY);
            const mutedUsers: string[] = stored ? JSON.parse(stored) : [];

            if (isNotificationMuted) {
                const updated = mutedUsers.filter(id => id !== userId);
                localStorage.setItem(MUTED_USERS_NOTIFICATIONS_KEY, JSON.stringify(updated));
                setIsNotificationMuted(false);
                toast.success(`${username} kullanıcısından bildirimler açıldı`);
            } else {
                mutedUsers.push(userId);
                localStorage.setItem(MUTED_USERS_NOTIFICATIONS_KEY, JSON.stringify(mutedUsers));
                setIsNotificationMuted(true);
                toast.success(`${username} kullanıcısından bildirimler kapatıldı`);
            }

            // Update window function for NotificationContext to use
            updateMutedUsersWindowFunction();
        } catch (error) {
            console.error('Error toggling notification mute:', error);
        }
    };

    // Update window function for checking muted users
    const updateMutedUsersWindowFunction = () => {
        (window as any).isUserNotificationsMuted = (checkUserId: string): boolean => {
            try {
                const stored = localStorage.getItem(MUTED_USERS_NOTIFICATIONS_KEY);
                if (stored) {
                    const mutedUsers: string[] = JSON.parse(stored);
                    return mutedUsers.includes(checkUserId);
                }
            } catch { }
            return false;
        };
    };

    // Initialize window function on mount
    useEffect(() => {
        updateMutedUsersWindowFunction();
    }, []);

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // Close on escape
    useEffect(() => {
        function handleEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onClose();
            }
        }
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Adjust position to not go off screen
    const adjustedPosition = {
        top: Math.min(y, window.innerHeight - 320),
        left: Math.min(x, window.innerWidth - 260)
    };

    const getVoiceIcon = () => {
        if (isVoiceMuted || voiceVolume === 0) return <MicOff className="w-4 h-4" />;
        return <Mic className="w-4 h-4" />;
    };

    const getSoundpadIcon = () => {
        if (isSoundpadMuted || soundpadVolume === 0) return <VolumeX className="w-4 h-4" />;
        if (soundpadVolume < 0.5) return <Volume1 className="w-4 h-4" />;
        return <Volume2 className="w-4 h-4" />;
    };

    const getInitials = (name: string) => {
        return name?.charAt(0).toUpperCase() || 'U';
    };

    const handleVolumeChange = (type: TabType, value: number) => {
        if (type === 'voice') {
            setUserVoiceVolume(userId, value);
        } else {
            setUserSoundpadVolume(userId, value);
        }
    };

    const renderVolumeControl = (
        type: TabType,
        volume: number,
        isMuted: boolean,
        icon: React.ReactNode,
        toggleMute: () => void,
        label: string
    ) => (
        <div className="space-y-3">
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-400">{label}</label>
                    <span className={`text-xs font-bold ${isMuted ? 'text-red-400' : 'text-blue-400'}`}>
                        {isMuted ? 'Kapalı' : `${Math.round(volume * 100)}%`}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded ${isMuted ? 'text-red-400' : 'text-gray-400'}`}>
                        {icon}
                    </div>
                    <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.05"
                        value={volume}
                        onChange={(e) => handleVolumeChange(type, parseFloat(e.target.value))}
                        disabled={isMuted}
                        className={`flex-1 h-2 rounded-full appearance-none cursor-pointer transition-opacity ${isMuted ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                        style={{
                            background: isMuted
                                ? '#374151'
                                : `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${volume * 50}%, #374151 ${volume * 50}%, #374151 100%)`
                        }}
                    />
                </div>
                {volume > 1 && !isMuted && (
                    <p className="text-xs text-yellow-400/80 flex items-center gap-1">
                        ⚠️ %100'ün üzerinde ses bozulabilir
                    </p>
                )}
            </div>

            <button
                onClick={toggleMute}
                className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isMuted
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                    : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-600/50'
                    }`}
            >
                {isMuted ? (
                    <>
                        <Volume2 className="w-4 h-4" />
                        <span>Sesi Aç</span>
                    </>
                ) : (
                    <>
                        <VolumeX className="w-4 h-4" />
                        <span>Sesini Kapat</span>
                    </>
                )}
            </button>
        </div>
    );

    return (
        <div
            ref={menuRef}
            className="fixed z-[100] w-64 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            style={adjustedPosition}
        >
            {/* Header with user info */}
            <div className="px-3 py-3 border-b border-gray-700/50 bg-gray-800/50">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden ring-2 ring-gray-700">
                        {profileImageUrl ? (
                            <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-sm font-bold text-white">{getInitials(username)}</span>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{username}</p>
                        <p className="text-xs text-gray-400">Ses Ayarları</p>
                    </div>
                </div>
            </div>

            {/* Tab Buttons */}
            <div className="flex border-b border-gray-700/50">
                <button
                    onClick={() => setActiveTab('voice')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${activeTab === 'voice'
                        ? 'text-blue-400 bg-blue-500/10 border-b-2 border-blue-400'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Mikrofon</span>
                    {isVoiceMuted && <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />}
                </button>
                <button
                    onClick={() => setActiveTab('soundpad')}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${activeTab === 'soundpad'
                        ? 'text-purple-400 bg-purple-500/10 border-b-2 border-purple-400'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                >
                    <Music2 className="w-3.5 h-3.5" />
                    <span>Soundpad</span>
                    {isSoundpadMuted && <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />}
                </button>
            </div>

            {/* Volume Control */}
            <div className="p-3">
                {activeTab === 'voice' ? (
                    renderVolumeControl(
                        'voice',
                        voiceVolume,
                        isVoiceMuted,
                        getVoiceIcon(),
                        () => toggleUserVoiceMute(userId),
                        'Mikrofon Sesi'
                    )
                ) : (
                    renderVolumeControl(
                        'soundpad',
                        soundpadVolume,
                        isSoundpadMuted,
                        getSoundpadIcon(),
                        () => toggleUserSoundpadMute(userId),
                        'Soundpad Sesi'
                    )
                )}
            </div>

            {/* Notification Mute Section */}
            <div className="px-3 pb-3 border-t border-gray-700/50 pt-3">
                <button
                    onClick={toggleNotificationMute}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors hover:bg-gray-800"
                >
                    <div className="flex items-center gap-2">
                        {isNotificationMuted ? (
                            <BellOff size={16} className="text-red-400" />
                        ) : (
                            <Bell size={16} className="text-green-400" />
                        )}
                        <span className="text-gray-300">Bildirimleri Engelle</span>
                    </div>
                    {isNotificationMuted && (
                        <Check size={16} className="text-green-400" />
                    )}
                </button>
            </div>

            {/* Slider Thumb Styles */}
            <style>{`
                input[type="range"]::-webkit-slider-thumb {
                    appearance: none;
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: #3b82f6;
                    cursor: pointer;
                    border: 2px solid white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                    transition: transform 0.15s ease;
                }
                input[type="range"]::-webkit-slider-thumb:hover {
                    transform: scale(1.1);
                }
                input[type="range"]::-moz-range-thumb {
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: #3b82f6;
                    cursor: pointer;
                    border: 2px solid white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                }
                input[type="range"]:disabled::-webkit-slider-thumb {
                    background: #6b7280;
                    cursor: not-allowed;
                }
                input[type="range"]:disabled::-moz-range-thumb {
                    background: #6b7280;
                    cursor: not-allowed;
                }
            `}</style>
        </div>
    );
}
