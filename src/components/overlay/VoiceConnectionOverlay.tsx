import React, { useEffect, useState, useRef } from 'react';
import { Mic, MicOff, Headphones, PhoneOff, Maximize2, Volume2 } from 'lucide-react';
import { useVoiceChannel } from '@/contexts/VoiceChannelContext';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/lib/types';

interface VoiceConnectionOverlayProps {
    onMaximize: (type: 'voice' | 'call', id?: string | number) => void;
}

export function VoiceConnectionOverlay({ onMaximize }: VoiceConnectionOverlayProps) {
    // Voice Channel State
    const {
        activeChannelId,
        leaveChannel,
        isMuted: isVoiceMuted,
        isDeafened: isVoiceDeafened,
        toggleMute: toggleVoiceMute,
        toggleDeafen: toggleVoiceDeafen,
        participants: voiceParticipants
    } = useVoiceChannel();

    // Direct Call State
    const {
        activeCall,
        endCall,
        isMicMuted: isCallMuted,
        isDeafened: isCallDeafened,
        toggleMic: toggleCallMic,
        toggleDeafen: toggleCallDeafen,
        callStatus
    } = useCall();

    const { user } = useAuth();
    const [remoteProfile, setRemoteProfile] = useState<Profile | null>(null);

    // Fetch remote profile for direct calls
    useEffect(() => {
        const fetchRemoteProfile = async () => {
            if (!activeCall || !user) {
                setRemoteProfile(null);
                return;
            }

            const remoteId = activeCall.caller_id === user.id ? activeCall.callee_id : activeCall.caller_id;

            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', remoteId)
                .single();

            if (!error && data) {
                setRemoteProfile(data);
            }
        };

        if (activeCall) {
            fetchRemoteProfile();
        } else {
            setRemoteProfile(null);
        }
    }, [activeCall, user]);

    // Determine active mode
    const isVoiceActive = !!activeChannelId;
    const isCallActive = !!activeCall && (callStatus === 'active' || callStatus === 'connecting');

    // If neither is active, don't render
    if (!isVoiceActive && !isCallActive) return null;

    // Unified Controls
    const isMuted = isCallActive ? isCallMuted : isVoiceMuted;
    const isDeafened = isCallActive ? isCallDeafened : isVoiceDeafened;

    const handleToggleMute = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isCallActive) toggleCallMic();
        else toggleVoiceMute();
    };

    const handleToggleDeafen = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isCallActive) toggleCallDeafen();
        else toggleVoiceDeafen();
    };

    const handleDisconnect = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isCallActive) endCall();
        else leaveChannel();
    };

    const handleMaximize = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (isCallActive && activeCall && user) {
            const remoteId = activeCall.caller_id === user.id ? activeCall.callee_id : activeCall.caller_id;
            onMaximize('call', remoteId);
        } else if (isVoiceActive && activeChannelId) {
            onMaximize('voice', activeChannelId);
        }
    };

    // Voice Activity Detection (reusing existing logic for unified visualization if possible)
    // For now, keeping it simple or copying the VAD logic from MiniPlayer if needed. 
    // The user just wants the "same" look.

    // Simplification: Direct Call usually has 2 participants max (for now).
    // Voice Channel has list.

    return (
        <div className="fixed bottom-20 right-6 z-50 w-80 bg-gray-900 border border-gray-700/50 rounded-lg shadow-2xl overflow-hidden animate-fade-in-up backdrop-blur-sm bg-opacity-95">
            {/* Header / Draggable Area */}
            <div
                className="bg-gray-800/80 p-3 flex items-center justify-between cursor-pointer hover:bg-gray-750 transition-colors border-b border-gray-700/50"
                onClick={() => handleMaximize()}
            >
                <div className="flex items-center gap-2 text-green-500">
                    <Volume2 size={18} className="animate-pulse" />
                    <span className="font-semibold text-sm text-white truncate max-w-[180px]">
                        {isCallActive
                            ? (remoteProfile ? `Arama: ${remoteProfile.username}` : (callStatus === 'connecting' ? 'Bağlanıyor...' : 'Arama Sürüyor'))
                            : 'Ses Bağlantısı'}
                    </span>
                </div>
                <button
                    onClick={(e) => handleMaximize(e)}
                    className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                >
                    <Maximize2 size={16} />
                </button>
            </div>

            {/* Content */}
            <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="text-xs text-gray-400 font-medium">
                        {isCallActive ? 'Sesli Arama' : `${voiceParticipants.length} kişi bağlı`}
                    </div>

                    {/* Participant Avatars */}
                    <div className="flex -space-x-2">
                        {isCallActive ? (
                            // For Call: Show remote user avatar
                            <div className="w-8 h-8 rounded-full bg-gray-700 overflow-hidden border-2 border-gray-900 shadow-sm">
                                {remoteProfile?.profile_image_url ? (
                                    <img src={remoteProfile.profile_image_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-xs text-white">
                                        {remoteProfile?.username?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                )}
                            </div>
                        ) : (
                            // For Voice Channel: Show participants
                            <>
                                {voiceParticipants.slice(0, 3).map(p => (
                                    <div
                                        key={p.user_id}
                                        className="w-6 h-6 rounded-full bg-gray-700 overflow-hidden border-2 border-gray-900"
                                    >
                                        {p.profile?.profile_image_url ? (
                                            <img src={p.profile.profile_image_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[10px] text-white">
                                                {p.profile?.username?.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {voiceParticipants.length > 3 && (
                                    <div className="w-6 h-6 rounded-full bg-gray-700 border-2 border-gray-900 flex items-center justify-center text-[10px] text-gray-400">
                                        +{voiceParticipants.length - 3}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4">
                    <button
                        onClick={handleToggleMute}
                        className={`p-3 rounded-full transition-all duration-200 ${isMuted
                            ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 ring-1 ring-red-500/50'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white hover:ring-1 hover:ring-gray-600'
                            }`}
                        title={isMuted ? "Sesi Aç" : "Sessize Al"}
                    >
                        {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>

                    <button
                        onClick={handleDisconnect}
                        className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all shadow-lg hover:shadow-red-500/20 hover:scale-105 active:scale-95"
                        title="Bağlantıyı Kes"
                    >
                        <PhoneOff size={20} />
                    </button>

                    <button
                        onClick={handleToggleDeafen}
                        className={`p-3 rounded-full transition-all duration-200 ${isDeafened
                            ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 ring-1 ring-red-500/50'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white hover:ring-1 hover:ring-gray-600'
                            }`}
                        title={isDeafened ? "Sağırlaştır" : "Sağırlaştır"}
                    >
                        <Headphones size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
}
