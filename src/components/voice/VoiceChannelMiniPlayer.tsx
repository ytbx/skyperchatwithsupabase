import React from 'react';
import { Mic, MicOff, Headphones, PhoneOff, Maximize2, Volume2 } from 'lucide-react';
import { useVoiceChannel } from '@/contexts/VoiceChannelContext';
import { useVoiceActivity } from '@/hooks/useVoiceActivity';

interface VoiceChannelMiniPlayerProps {
    onMaximize: () => void;
}

export function VoiceChannelMiniPlayer({ onMaximize }: VoiceChannelMiniPlayerProps) {
    const {
        activeChannelId,
        leaveChannel,
        isMuted,
        isDeafened,
        toggleMute,
        toggleDeafen,
        participants
    } = useVoiceChannel();

    // Voice activity detection for local user
    const localParticipant = participants.find(p => p.user_id === (window as any).currentUserId);
    const isLocalSpeaking = useVoiceActivity(localParticipant?.stream);

    if (!activeChannelId) return null;

    return (
        <div className="fixed bottom-20 right-6 z-50 w-80 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden animate-fade-in-up">
            {/* Header / Draggable Area */}
            <div
                className="bg-gray-800 p-3 flex items-center justify-between cursor-pointer hover:bg-gray-750 transition-colors"
                onClick={onMaximize}
            >
                <div className="flex items-center gap-2 text-green-500">
                    <Volume2 size={18} className="animate-pulse" />
                    <span className="font-semibold text-sm text-white">Ses Bağlantısı</span>
                </div>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onMaximize();
                    }}
                    className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                >
                    <Maximize2 size={16} />
                </button>
            </div>

            {/* Content */}
            <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="text-xs text-gray-400">
                        {participants.length} kişi bağlı
                    </div>
                    <div className="flex -space-x-2">
                        {participants.slice(0, 3).map(p => {
                            const isSpeaking = useVoiceActivity(p.stream);
                            return (
                                <div
                                    key={p.user_id}
                                    className={`w-6 h-6 rounded-full border-2 overflow-hidden transition-all ${isSpeaking
                                            ? 'border-green-500 ring-2 ring-green-500/50 shadow-lg shadow-green-500/30'
                                            : 'border-gray-900 bg-gray-700'
                                        }`}
                                >
                                    {p.profile?.profile_image_url ? (
                                        <img src={p.profile.profile_image_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[10px] text-white bg-gray-700">
                                            {p.profile?.username?.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {participants.length > 3 && (
                            <div className="w-6 h-6 rounded-full bg-gray-700 border-2 border-gray-900 flex items-center justify-center text-[10px] text-gray-400">
                                +{participants.length - 3}
                            </div>
                        )}
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-4">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleMute();
                        }}
                        className={`p-3 rounded-full transition-all ${isMuted ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                            }`}
                        title={isMuted ? "Sesi Aç" : "Sessize Al"}
                    >
                        {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                    </button>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            leaveChannel();
                        }}
                        className="p-3 rounded-full bg-red-500 hover:bg-red-600 text-white transition-all shadow-lg hover:shadow-red-500/20"
                        title="Bağlantıyı Kes"
                    >
                        <PhoneOff size={20} />
                    </button>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleDeafen();
                        }}
                        className={`p-3 rounded-full transition-all ${isDeafened ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
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
