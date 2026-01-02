import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Play, Trash2, Volume2, Music, Loader2, FolderOpen } from 'lucide-react';

interface Sound {
    id: string;
    name: string;
    filename: string;
    createdAt: string;
}

interface SoundPanelProps {
    onPlaySound?: (audioBuffer: AudioBuffer) => void;
    audioContext?: AudioContext;
}

export const SoundPanel: React.FC<SoundPanelProps> = ({ onPlaySound, audioContext }) => {
    const [sounds, setSounds] = useState<Sound[]>([]);
    const [loading, setLoading] = useState(true);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const localAudioContextRef = useRef<AudioContext | null>(null);

    // Check if running in Electron
    const isElectron = typeof window !== 'undefined' && !!window.electron?.soundboard;

    // Load sounds on mount
    useEffect(() => {
        if (isElectron) {
            loadSounds();
        } else {
            setLoading(false);
        }
    }, [isElectron]);

    const loadSounds = async () => {
        try {
            const soundList = await window.electron!.soundboard.listSounds();
            setSounds(soundList);
        } catch (error) {
            console.error('[SoundPanel] Error loading sounds:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddSound = async () => {
        if (!isElectron || uploading) return;

        try {
            setUploading(true);
            const result = await window.electron!.soundboard.openFilePicker();

            if (result) {
                const saved = await window.electron!.soundboard.saveSound({
                    name: result.name,
                    buffer: result.buffer,
                    extension: result.extension
                });
                setSounds(prev => [...prev, saved]);
            }
        } catch (error) {
            console.error('[SoundPanel] Error adding sound:', error);
        } finally {
            setUploading(false);
        }
    };

    const handleOpenDirectory = async () => {
        if (!isElectron) return;
        await window.electron!.soundboard.openDirectory();
    };

    const handleDeleteSound = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isElectron) return;

        try {
            const success = await window.electron!.soundboard.deleteSound(id);
            if (success) {
                setSounds(prev => prev.filter(s => s.id !== id));
            }
        } catch (error) {
            console.error('[SoundPanel] Error deleting sound:', error);
        }
    };

    const handlePlaySound = useCallback(async (id: string) => {
        if (!isElectron) return;

        try {
            // Stop any currently playing sound
            if (audioSourceRef.current) {
                audioSourceRef.current.stop();
                audioSourceRef.current = null;
            }

            setPlayingId(id);

            // Get sound data
            const soundData = await window.electron!.soundboard.getSoundData(id);
            if (!soundData) {
                console.error('[SoundPanel] Sound not found');
                setPlayingId(null);
                return;
            }

            // Decode the audio
            const ctx = audioContext || localAudioContextRef.current || new AudioContext();
            if (!localAudioContextRef.current && !audioContext) {
                localAudioContextRef.current = ctx;
            }

            // Convert base64 to ArrayBuffer
            const binaryString = atob(soundData.buffer);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const audioBuffer = await ctx.decodeAudioData(bytes.buffer as ArrayBuffer);

            // If we have a callback for mixing with WebRTC, use it
            // The callback will handle both local playback and WebRTC transmission
            if (onPlaySound) {
                onPlaySound(audioBuffer);
                // Set timeout to reset playing state after sound finishes
                setTimeout(() => {
                    setPlayingId(null);
                }, (audioBuffer.duration * 1000) + 100);
            } else {
                // No WebRTC context, just play locally
                const source = ctx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(ctx.destination);
                source.onended = () => {
                    setPlayingId(null);
                    audioSourceRef.current = null;
                };
                source.start();
                audioSourceRef.current = source;
            }

        } catch (error) {
            console.error('[SoundPanel] Error playing sound:', error);
            setPlayingId(null);
        }
    }, [isElectron, audioContext, onPlaySound]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (audioSourceRef.current) {
                audioSourceRef.current.stop();
            }
            if (localAudioContextRef.current) {
                localAudioContextRef.current.close();
            }
        };
    }, []);

    if (!isElectron) {
        return (
            <div className="p-4 text-center">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Music size={28} className="text-purple-400" />
                </div>
                <h3 className="text-white font-semibold mb-2">Ses Paneli</h3>
                <p className="text-gray-400 text-sm mb-4">
                    Ses panelini kullanmak için masaüstü uygulamasını indirmeniz gerekmektedir.
                </p>
                <a
                    href="https://github.com/ytbx/skyperchatwithsupabase/releases/download/v0.3.10/Ovox-Setup-0.3.10.exe"
                    download="Ovox-Setup-0.3.10.exe"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Uygulamayı İndir
                </a>
                <p className="text-gray-500 text-xs mt-3">
                    Diğer kullanıcıların çaldığı sesleri yine de duyabilirsiniz!
                </p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="p-4 flex items-center justify-center">
                <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="p-3">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Volume2 size={18} className="text-purple-400" />
                    <span className="text-white font-semibold text-sm">Ses Paneli</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleAddSound}
                        disabled={uploading}
                        className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 rounded-lg text-white text-xs font-semibold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-purple-600/20"
                    >
                        {uploading ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <Plus size={14} />
                        )}
                        <span>Ses Ekle</span>
                    </button>
                </div>
            </div>

            {/* Sounds Grid - Horizontal Scrollable */}
            {sounds.length === 0 ? (
                <div className="text-center py-6 text-gray-500">
                    <Music size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Henüz ses eklenmedi</p>
                    <p className="text-xs mt-1">Yukarıdaki "Ses Ekle" butonuna tıklayın</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3 overflow-y-auto max-h-[360px] pr-2 custom-scrollbar">
                    {sounds.map(sound => (
                        <div
                            key={sound.id}
                            className={`group relative flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all duration-200 ${playingId === sound.id
                                ? 'bg-purple-600 shadow-xl shadow-purple-600/30 -translate-y-0.5'
                                : 'bg-[#2b2d31] hover:bg-[#35373c] border border-transparent hover:border-[#404249]'
                                }`}
                            onClick={() => handlePlaySound(sound.id)}
                        >
                            {/* Play Icon */}
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${playingId === sound.id ? 'bg-white/20' : 'bg-gray-700 group-hover:bg-gray-600'
                                }`}>
                                {playingId === sound.id ? (
                                    <div className="flex gap-0.5 items-end h-3">
                                        <div className="w-1 bg-white animate-[sound-bar_0.5s_ease-in-out_infinite]" />
                                        <div className="w-1 bg-white animate-[sound-bar_0.7s_ease-in-out_infinite]" />
                                        <div className="w-1 bg-white animate-[sound-bar_0.6s_ease-in-out_infinite]" />
                                    </div>
                                ) : (
                                    <Play size={16} className="text-white fill-white ml-0.5" />
                                )}
                            </div>

                            {/* Sound Name */}
                            <div className="flex flex-col min-width-0 overflow-hidden">
                                <span className="text-white text-[13px] font-semibold truncate">
                                    {sound.name}
                                </span>
                                <span className={`text-[10px] ${playingId === sound.id ? 'text-purple-100' : 'text-gray-400'}`}>
                                    Ses Efekti
                                </span>
                            </div>

                            {/* Delete Button */}
                            <button
                                onClick={(e) => handleDeleteSound(sound.id, e)}
                                className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-all transform hover:scale-110"
                                title="Sil"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
