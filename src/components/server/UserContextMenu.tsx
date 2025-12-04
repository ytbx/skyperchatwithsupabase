import { useEffect, useRef, useState } from 'react';
import { UserMinus, Ban, Volume2, VolumeX, Mic, MicOff, Music2, ChevronRight, ChevronDown } from 'lucide-react';
import { PERMISSIONS } from '@/lib/types';
import { hasPermission } from '@/utils/PermissionUtils';
import { useUserAudio } from '@/contexts/UserAudioContext';

interface UserContextMenuProps {
    x: number;
    y: number;
    targetMemberId: string;
    targetMemberName: string;
    targetMemberProfileImage?: string;
    currentUserPermissions: bigint;
    isOwner: boolean;
    isSelf?: boolean;
    onClose: () => void;
    onKick: (memberId: string, memberName: string) => void;
    onBan: (memberId: string, memberName: string) => void;
}

export function UserContextMenu({
    x,
    y,
    targetMemberId,
    targetMemberName,
    targetMemberProfileImage,
    currentUserPermissions,
    isOwner,
    isSelf = false,
    onClose,
    onKick,
    onBan
}: UserContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [showAudioControls, setShowAudioControls] = useState(false);

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

    const voiceVolume = getUserVoiceVolume(targetMemberId);
    const isVoiceMuted = getUserVoiceMuted(targetMemberId);
    const soundpadVolume = getUserSoundpadVolume(targetMemberId);
    const isSoundpadMuted = getUserSoundpadMuted(targetMemberId);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    useEffect(() => {
        function handleEscape(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onClose();
            }
        }
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    const canKick = isOwner || hasPermission(currentUserPermissions, PERMISSIONS.KICK_MEMBERS);
    const canBan = isOwner || hasPermission(currentUserPermissions, PERMISSIONS.BAN_MEMBERS);
    const showModActions = (canKick || canBan) && !isSelf;

    // Adjust position to not go off screen
    const adjustedPosition = {
        top: Math.min(y, window.innerHeight - (showAudioControls ? 380 : 250)),
        left: Math.min(x, window.innerWidth - 240)
    };

    return (
        <div
            ref={menuRef}
            className="fixed z-[100] w-56 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            style={adjustedPosition}
        >
            {/* Header */}
            <div className="px-3 py-2 border-b border-gray-700/50 bg-gray-800/50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center overflow-hidden">
                        {targetMemberProfileImage ? (
                            <img src={targetMemberProfileImage} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-xs font-bold text-white">
                                {targetMemberName?.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>
                    <span className="text-sm font-semibold text-white truncate">
                        {targetMemberName}
                    </span>
                </div>
            </div>

            {/* Audio Controls Section (only for other users) */}
            {!isSelf && (
                <div className="border-b border-gray-700/50">
                    <button
                        onClick={() => setShowAudioControls(!showAudioControls)}
                        className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 transition-colors"
                    >
                        <div className="flex items-center gap-2">
                            <Volume2 size={16} className="text-blue-400" />
                            <span>Ses Ayarları</span>
                            {(isVoiceMuted || isSoundpadMuted) && (
                                <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                            )}
                        </div>
                        {showAudioControls ? (
                            <ChevronDown size={16} className="text-gray-400" />
                        ) : (
                            <ChevronRight size={16} className="text-gray-400" />
                        )}
                    </button>

                    {showAudioControls && (
                        <div className="px-3 pb-3 space-y-3">
                            {/* Voice Controls */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <Mic size={12} className="text-gray-400" />
                                        <span className="text-xs text-gray-400">Mikrofon</span>
                                    </div>
                                    <span className="text-xs text-blue-400 font-medium">
                                        {isVoiceMuted ? 'Kapalı' : `${Math.round(voiceVolume * 100)}%`}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="range"
                                        min="0"
                                        max="2"
                                        step="0.05"
                                        value={voiceVolume}
                                        onChange={(e) => setUserVoiceVolume(targetMemberId, parseFloat(e.target.value))}
                                        disabled={isVoiceMuted}
                                        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                                        style={{
                                            background: isVoiceMuted
                                                ? '#374151'
                                                : `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${voiceVolume * 50}%, #374151 ${voiceVolume * 50}%, #374151 100%)`
                                        }}
                                    />
                                    <button
                                        onClick={() => toggleUserVoiceMute(targetMemberId)}
                                        className={`p-1 rounded transition-colors ${isVoiceMuted ? 'text-red-400 bg-red-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                            }`}
                                    >
                                        {isVoiceMuted ? <MicOff size={14} /> : <Mic size={14} />}
                                    </button>
                                </div>
                            </div>

                            {/* Soundpad Controls */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <Music2 size={12} className="text-gray-400" />
                                        <span className="text-xs text-gray-400">Soundpad</span>
                                    </div>
                                    <span className="text-xs text-purple-400 font-medium">
                                        {isSoundpadMuted ? 'Kapalı' : `${Math.round(soundpadVolume * 100)}%`}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="range"
                                        min="0"
                                        max="2"
                                        step="0.05"
                                        value={soundpadVolume}
                                        onChange={(e) => setUserSoundpadVolume(targetMemberId, parseFloat(e.target.value))}
                                        disabled={isSoundpadMuted}
                                        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
                                        style={{
                                            background: isSoundpadMuted
                                                ? '#374151'
                                                : `linear-gradient(to right, #a855f7 0%, #a855f7 ${soundpadVolume * 50}%, #374151 ${soundpadVolume * 50}%, #374151 100%)`
                                        }}
                                    />
                                    <button
                                        onClick={() => toggleUserSoundpadMute(targetMemberId)}
                                        className={`p-1 rounded transition-colors ${isSoundpadMuted ? 'text-red-400 bg-red-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                            }`}
                                    >
                                        {isSoundpadMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Moderation Actions */}
            {showModActions && (
                <div className="py-1">
                    {canKick && (
                        <button
                            onClick={() => onKick(targetMemberId, targetMemberName)}
                            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 flex items-center gap-2 transition-colors"
                        >
                            <UserMinus size={16} />
                            Sunucudan At
                        </button>
                    )}

                    {canBan && (
                        <button
                            onClick={() => onBan(targetMemberId, targetMemberName)}
                            className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 hover:text-red-400 flex items-center gap-2 transition-colors"
                        >
                            <Ban size={16} />
                            Sunucudan Yasakla
                        </button>
                    )}
                </div>
            )}

            {/* Slider Styles */}
            <style>{`
                input[type="range"]::-webkit-slider-thumb {
                    appearance: none;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: white;
                    cursor: pointer;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                }
                input[type="range"]::-moz-range-thumb {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: white;
                    cursor: pointer;
                    border: none;
                }
            `}</style>
        </div>
    );
}
