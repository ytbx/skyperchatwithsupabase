import React, { useEffect, useState, useRef } from 'react';
import { Mic, MicOff, Headphones, PhoneOff, Maximize2, Volume2 } from 'lucide-react';
import { useVoiceChannel } from '@/contexts/VoiceChannelContext';

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

    // Track speaking state for each participant
    const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
    const analyserRefs = useRef<Map<string, { context: AudioContext; analyser: AnalyserNode; animationFrame: number }>>(new Map());

    // Voice activity detection for each participant
    useEffect(() => {
        // Clean up old analysers for participants who left
        const currentUserIds = new Set(participants.map(p => p.user_id));
        analyserRefs.current.forEach((analyserData, userId) => {
            if (!currentUserIds.has(userId)) {
                cancelAnimationFrame(analyserData.animationFrame);
                analyserData.context.close();
                analyserRefs.current.delete(userId);
            }
        });

        // Set up analysers for each participant with a stream
        participants.forEach(participant => {
            if (!participant.stream || analyserRefs.current.has(participant.user_id)) return;

            console.log('[VoiceChannelMiniPlayer] Setting up voice detection for user:', participant.user_id, 'Has stream:', !!participant.stream);

            try {
                const audioContext = new AudioContext();
                const analyser = audioContext.createAnalyser();
                const source = audioContext.createMediaStreamSource(participant.stream);
                source.connect(analyser);
                analyser.fftSize = 256;

                const dataArray = new Uint8Array(analyser.frequencyBinCount);

                const detectVoice = () => {
                    analyser.getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                    const isSpeaking = average > 20; // Threshold for voice detection

                    setSpeakingUsers(prev => {
                        const newSet = new Set(prev);
                        if (isSpeaking) {
                            newSet.add(participant.user_id);
                        } else {
                            newSet.delete(participant.user_id);
                        }
                        return newSet;
                    });

                    const animationFrame = requestAnimationFrame(detectVoice);
                    const analyserData = analyserRefs.current.get(participant.user_id);
                    if (analyserData) {
                        analyserData.animationFrame = animationFrame;
                    }
                };

                const animationFrame = requestAnimationFrame(detectVoice);
                analyserRefs.current.set(participant.user_id, { context: audioContext, analyser, animationFrame });
                console.log('[VoiceChannelMiniPlayer] ✓ Voice detection setup complete for:', participant.user_id);
            } catch (error) {
                console.error('[VoiceChannelMiniPlayer] Error setting up voice detection:', error);
            }
        });

        return () => {
            // Cleanup all analysers on unmount
            analyserRefs.current.forEach(analyserData => {
                cancelAnimationFrame(analyserData.animationFrame);
                analyserData.context.close();
            });
            analyserRefs.current.clear();
        };
    }, [participants]);

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
                            const isSpeaking = speakingUsers.has(p.user_id);
                            return (
                                <div
                                    key={p.user_id}
                                    className={`w-6 h-6 rounded-full bg-gray-700 overflow-hidden transition-all duration-200 ${isSpeaking
                                        ? 'ring-2 ring-green-500 shadow-lg shadow-green-500/50'
                                        : 'border-2 border-gray-900'
                                        }`}
                                >
                                    {p.profile?.profile_image_url ? (
                                        <img src={p.profile.profile_image_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[10px] text-white">
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
