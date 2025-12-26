import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { MonitorUp, Users, MicOff, Headphones, Maximize2, X, Volume2, User } from 'lucide-react';
import { UserVolumeContextMenu } from './UserVolumeContextMenu';

interface VoiceParticipant {
    user_id: string;
    profile: {
        username: string;
        profile_image_url?: string;
    };
    is_screen_sharing: boolean;
    is_video_enabled: boolean;
    is_muted: boolean;
    is_deafened: boolean;
    stream?: MediaStream;
    screenStream?: MediaStream;
    cameraStream?: MediaStream;
}

interface VoiceChannelViewProps {
    channelId: number;
    channelName: string;
    participants: VoiceParticipant[];
    onStartScreenShare: () => void;
}

export function VoiceChannelView({ channelId, channelName, participants, onStartScreenShare }: VoiceChannelViewProps) {
    const { user } = useAuth();
    const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
    const [fullscreenVideoId, setFullscreenVideoId] = useState<string | null>(null);
    const [volumes, setVolumes] = useState<Map<string, number>>(new Map());
    const [ignoredStreams, setIgnoredStreams] = useState<Set<string>>(new Set());
    const [volumeContextMenu, setVolumeContextMenu] = useState<{ x: number; y: number; userId: string; username: string; profileImageUrl?: string; streamId: string } | null>(null);

    const toggleIgnoreStream = (streamId: string) => {
        setIgnoredStreams(prev => {
            const newSet = new Set(prev);
            if (newSet.has(streamId)) {
                newSet.delete(streamId);
            } else {
                newSet.add(streamId);
            }
            return newSet;
        });
    };

    // Stable ref for fullscreen video to prevent flickering
    const fullscreenVideoRef = useRef<HTMLVideoElement | null>(null);

    // Track speaking state for each participant
    const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());
    const analyserRefs = useRef<Map<string, { context: AudioContext; analyser: AnalyserNode; animationFrame: number }>>(new Map());

    // Get participants with camera or screen share
    const cameraParticipants = participants.filter(p => p.is_video_enabled && p.cameraStream);
    const screenSharingParticipants = participants.filter(p => p.is_screen_sharing && p.screenStream);

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
            } catch (error) {
                console.error('[VoiceChannelView] Error setting up voice detection:', error);
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

    // Update video elements when streams change
    useEffect(() => {
        // Update camera streams
        cameraParticipants.forEach(participant => {
            const videoId = `camera-${participant.user_id}`;
            const video = videoRefs.current.get(videoId);
            if (video && participant.cameraStream && video.srcObject !== participant.cameraStream && !ignoredStreams.has(videoId)) {
                video.srcObject = participant.cameraStream;
                video.volume = volumes.get(videoId) ?? 1.0;
                video.play().catch(e => console.error('Error playing video:', e));
            }
        });

        // Update screen share streams
        screenSharingParticipants.forEach(participant => {
            const videoId = `screen-${participant.user_id}`;
            const video = videoRefs.current.get(videoId);
            if (video && participant.screenStream && video.srcObject !== participant.screenStream && !ignoredStreams.has(videoId)) {
                video.srcObject = participant.screenStream;
                video.volume = volumes.get(videoId) ?? 1.0;
                video.play().catch(e => console.error('Error playing video:', e));
            }
        });
    }, [cameraParticipants, screenSharingParticipants, volumes, ignoredStreams]);

    // Get the current fullscreen stream
    const getFullscreenStream = useCallback((): { stream: MediaStream | null; isLocalUser: boolean } => {
        if (!fullscreenVideoId) return { stream: null, isLocalUser: false };

        const participant = [...cameraParticipants, ...screenSharingParticipants].find(p =>
            fullscreenVideoId === `camera-${p.user_id}` || fullscreenVideoId === `screen-${p.user_id}`
        );
        if (!participant) return { stream: null, isLocalUser: false };

        const isCamera = fullscreenVideoId.startsWith('camera-');
        const stream = isCamera ? participant.cameraStream : participant.screenStream;
        return { stream: stream || null, isLocalUser: participant.user_id === user?.id };
    }, [fullscreenVideoId, cameraParticipants, screenSharingParticipants, user?.id]);

    // Handle fullscreen video stream assignment with useEffect to prevent flickering
    useEffect(() => {
        const { stream, isLocalUser } = getFullscreenStream();
        const video = fullscreenVideoRef.current;

        if (video && stream) {
            // Only update srcObject if it changed
            if (video.srcObject !== stream) {
                video.srcObject = stream;
                video.muted = isLocalUser; // Mute local user's stream to prevent feedback
                video.play().catch(e => console.error('Error playing fullscreen video:', e));
            }
            // Always update volume
            const currentVolume = volumes.get(fullscreenVideoId!) ?? 1.0;
            video.volume = isLocalUser ? 0 : currentVolume;
        }
    }, [fullscreenVideoId, getFullscreenStream, volumes]);

    const handleVolumeChange = useCallback((videoId: string, volume: number) => {
        // Update the video element in the list
        const video = videoRefs.current.get(videoId);
        if (video) {
            video.volume = volume;
        }
        // Also update fullscreen video if it's the same
        if (fullscreenVideoRef.current && fullscreenVideoId === videoId) {
            fullscreenVideoRef.current.volume = volume;
        }
        setVolumes(prev => new Map(prev.set(videoId, volume)));
    }, [fullscreenVideoId]);

    const openFullscreen = (videoId: string) => {
        setFullscreenVideoId(videoId);
    };

    const closeFullscreen = () => {
        setFullscreenVideoId(null);
    };

    const hasAnyStreams = cameraParticipants.length > 0 || screenSharingParticipants.length > 0;

    return (
        <div className="flex-1 flex flex-col bg-gray-900">
            {/* Header */}
            <div className="h-12 px-4 flex items-center justify-between border-b border-gray-800 bg-gray-900">
                <div className="flex items-center gap-2">
                    <MonitorUp className="w-5 h-5 text-gray-400" />
                    <h2 className="text-base font-semibold text-white">{channelName}</h2>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Users className="w-4 h-4" />
                    <span>{participants.length} kişi</span>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4">
                {!hasAnyStreams ? (
                    // Empty state
                    <div className="h-full flex flex-col items-center justify-center">
                        <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-4">
                            <MonitorUp className="w-10 h-10 text-gray-600" />
                        </div>
                        <h3 className="text-xl font-semibold text-white mb-2">
                            Kimse ekran veya kamera paylaşmıyor
                        </h3>
                        <p className="text-gray-400 mb-4 text-center max-w-md">
                            Ekranınızı veya kameranızı paylaşmak için aşağıdaki butonları kullanın
                        </p>
                        <button
                            onClick={onStartScreenShare}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
                        >
                            <MonitorUp className="w-5 h-5" />
                            Ekran Paylaş
                        </button>
                    </div>
                ) : (
                    // Vertical list of camera and screen shares
                    <div className="space-y-4">
                        {/* Camera streams */}
                        {cameraParticipants.map((participant) => {
                            const videoId = `camera-${participant.user_id}`;
                            const currentVolume = volumes.get(videoId) ?? 1.0;

                            return (
                                <div
                                    key={videoId}
                                    className="relative bg-gray-800 rounded-lg overflow-hidden group"
                                    style={{ maxHeight: '400px' }}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        setVolumeContextMenu({
                                            x: e.clientX,
                                            y: e.clientY,
                                            userId: participant.user_id,
                                            username: participant.profile?.username || 'Unknown',
                                            profileImageUrl: participant.profile?.profile_image_url,
                                            streamId: videoId
                                        });
                                    }}
                                >
                                    {ignoredStreams.has(videoId) ? (
                                        <div
                                            className="w-full aspect-video flex flex-col items-center justify-center bg-black cursor-pointer group/placeholder"
                                            onClick={() => toggleIgnoreStream(videoId)}
                                        >
                                            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 transition-transform group-hover/placeholder:scale-110">
                                                <User size={32} className="text-blue-500" />
                                            </div>
                                            <p className="text-white font-medium">İzlemek için tıklayın</p>
                                            <p className="text-gray-400 text-sm mt-1">Görüntü gizlendi</p>
                                        </div>
                                    ) : (
                                        <video
                                            ref={(el) => {
                                                if (el) {
                                                    videoRefs.current.set(videoId, el);
                                                    el.volume = currentVolume;
                                                } else {
                                                    videoRefs.current.delete(videoId);
                                                }
                                            }}
                                            autoPlay
                                            playsInline
                                            className="w-full h-auto object-contain bg-black"
                                            style={{ maxHeight: '400px' }}
                                        />
                                    )}

                                    {/* Controls overlay */}
                                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {/* Volume control */}
                                        <div className="flex items-center gap-2 bg-black/70 rounded-lg px-3 py-2">
                                            <Volume2 className="w-4 h-4 text-white" />
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.1"
                                                value={currentVolume}
                                                onChange={(e) => handleVolumeChange(videoId, parseFloat(e.target.value))}
                                                className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                                style={{
                                                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${currentVolume * 100}%, #4b5563 ${currentVolume * 100}%, #4b5563 100%)`
                                                }}
                                            />
                                            <span className="text-xs text-white w-8">{Math.round(currentVolume * 100)}%</span>
                                        </div>
                                        {/* Fullscreen button */}
                                        <button
                                            onClick={() => openFullscreen(videoId)}
                                            className="p-2 bg-black/70 hover:bg-black/90 rounded-lg transition-colors"
                                            title="Tam ekran"
                                        >
                                            <Maximize2 className="w-5 h-5 text-white" />
                                        </button>
                                    </div>

                                    {/* User info overlay */}
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center overflow-hidden transition-all duration-200 ${speakingUsers.has(participant.user_id)
                                                ? 'ring-2 ring-green-500 shadow-lg shadow-green-500/50'
                                                : ''
                                                }`}>
                                                {participant.profile?.profile_image_url ? (
                                                    <img
                                                        src={participant.profile.profile_image_url}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <span className="text-xs text-white font-semibold">
                                                        {participant.profile?.username?.charAt(0).toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">
                                                    {participant.profile?.username}
                                                </p>
                                                <p className="text-xs text-blue-400">Kamera açık</p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {participant.is_muted && <MicOff className="w-4 h-4 text-red-500" />}
                                                {participant.is_deafened && <Headphones className="w-4 h-4 text-red-500" />}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Screen share streams */}
                        {screenSharingParticipants.map((participant) => {
                            const videoId = `screen-${participant.user_id}`;
                            const currentVolume = volumes.get(videoId) ?? 1.0;

                            return (
                                <div
                                    key={videoId}
                                    className="relative bg-gray-800 rounded-lg overflow-hidden group"
                                    style={{ maxHeight: '400px' }}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        setVolumeContextMenu({
                                            x: e.clientX,
                                            y: e.clientY,
                                            userId: participant.user_id,
                                            username: participant.profile?.username || 'Unknown',
                                            profileImageUrl: participant.profile?.profile_image_url,
                                            streamId: videoId
                                        });
                                    }}
                                >
                                    {ignoredStreams.has(videoId) ? (
                                        <div
                                            className="w-full aspect-video flex flex-col items-center justify-center bg-black cursor-pointer group/placeholder"
                                            onClick={() => toggleIgnoreStream(videoId)}
                                        >
                                            <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 transition-transform group-hover/placeholder:scale-110">
                                                <Maximize2 size={32} className="text-green-500" />
                                            </div>
                                            <p className="text-white font-medium">İzlemek için tıklayın</p>
                                            <p className="text-gray-400 text-sm mt-1">Yayın gizlendi</p>
                                        </div>
                                    ) : (
                                        <video
                                            ref={(el) => {
                                                if (el) {
                                                    videoRefs.current.set(videoId, el);
                                                    el.volume = currentVolume;
                                                } else {
                                                    videoRefs.current.delete(videoId);
                                                }
                                            }}
                                            autoPlay
                                            playsInline
                                            muted={participant.user_id === user?.id} // Mute if local user
                                            className="w-full h-auto object-contain bg-black"
                                            style={{ maxHeight: '400px' }}
                                        />
                                    )}

                                    {/* Controls overlay */}
                                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {/* Volume control */}
                                        <div className="flex items-center gap-2 bg-black/70 rounded-lg px-3 py-2">
                                            <Volume2 className="w-4 h-4 text-white" />
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.1"
                                                value={currentVolume}
                                                onChange={(e) => handleVolumeChange(videoId, parseFloat(e.target.value))}
                                                className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                                style={{
                                                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${currentVolume * 100}%, #4b5563 ${currentVolume * 100}%, #4b5563 100%)`
                                                }}
                                            />
                                            <span className="text-xs text-white w-8">{Math.round(currentVolume * 100)}%</span>
                                        </div>
                                        {/* Fullscreen button */}
                                        <button
                                            onClick={() => openFullscreen(videoId)}
                                            className="p-2 bg-black/70 hover:bg-black/90 rounded-lg transition-colors"
                                            title="Tam ekran"
                                        >
                                            <Maximize2 className="w-5 h-5 text-white" />
                                        </button>
                                    </div>

                                    {/* User info overlay */}
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-6 h-6 rounded-full bg-green-600 flex items-center justify-center overflow-hidden transition-all duration-200 ${speakingUsers.has(participant.user_id)
                                                ? 'ring-2 ring-green-500 shadow-lg shadow-green-500/50'
                                                : ''
                                                }`}>
                                                {participant.profile?.profile_image_url ? (
                                                    <img
                                                        src={participant.profile.profile_image_url}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <span className="text-xs text-white font-semibold">
                                                        {participant.profile?.username?.charAt(0).toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">
                                                    {participant.profile?.username}
                                                </p>
                                                <p className="text-xs text-green-400">Ekran paylaşıyor</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Fullscreen Modal */}
            {fullscreenVideoId && (() => {
                const participant = [...cameraParticipants, ...screenSharingParticipants].find(p =>
                    fullscreenVideoId === `camera-${p.user_id}` || fullscreenVideoId === `screen-${p.user_id}`
                );
                const isCamera = fullscreenVideoId.startsWith('camera-');
                const stream = isCamera ? participant?.cameraStream : participant?.screenStream;
                const currentVolume = volumes.get(fullscreenVideoId) ?? 1.0;
                const isLocalUser = participant?.user_id === user?.id;

                return (
                    <div
                        className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-8"
                        onClick={closeFullscreen}
                    >
                        <div
                            className="relative w-[95vw] h-[95vh] bg-black rounded-lg overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <video
                                ref={fullscreenVideoRef}
                                autoPlay
                                playsInline
                                className="w-full h-full object-contain"
                            />

                            {/* Close button */}
                            <button
                                onClick={closeFullscreen}
                                className="absolute top-4 right-4 p-3 bg-black/70 hover:bg-black/90 rounded-lg transition-colors z-10"
                                title="Kapat"
                            >
                                <X className="w-6 h-6 text-white" />
                            </button>

                            {/* Volume control - only for other users' streams */}
                            {!isLocalUser && (
                                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-3 bg-black/70 rounded-lg px-4 py-3">
                                    <Volume2 className="w-5 h-5 text-white" />
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        value={currentVolume}
                                        onChange={(e) => handleVolumeChange(fullscreenVideoId, parseFloat(e.target.value))}
                                        className="w-32 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                        style={{
                                            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${currentVolume * 100}%, #4b5563 ${currentVolume * 100}%, #4b5563 100%)`
                                        }}
                                    />
                                    <span className="text-sm text-white font-medium w-10">{Math.round(currentVolume * 100)}%</span>
                                </div>
                            )}

                            {/* User info */}
                            <div className="absolute top-4 left-4 bg-black/70 rounded-lg px-4 py-2">
                                <div className="flex items-center gap-2">
                                    <div className={`w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center overflow-hidden transition-all duration-200 ${participant && speakingUsers.has(participant.user_id)
                                        ? 'ring-2 ring-green-500 shadow-lg shadow-green-500/50'
                                        : ''
                                        }`}>
                                        {participant?.profile?.profile_image_url ? (
                                            <img
                                                src={participant.profile.profile_image_url}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-sm text-white font-semibold">
                                                {participant?.profile?.username?.charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-white">
                                            {participant?.profile?.username}
                                        </p>
                                        <p className="text-xs text-gray-300">
                                            {isCamera ? 'Kamera' : 'Ekran paylaşımı'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Volume Context Menu */}
            {volumeContextMenu && (
                <UserVolumeContextMenu
                    x={volumeContextMenu.x}
                    y={volumeContextMenu.y}
                    userId={volumeContextMenu.userId}
                    username={volumeContextMenu.username}
                    profileImageUrl={volumeContextMenu.profileImageUrl}
                    onClose={() => setVolumeContextMenu(null)}
                    streamId={volumeContextMenu.streamId}
                    isIgnored={ignoredStreams.has(volumeContextMenu.streamId)}
                    onToggleIgnore={toggleIgnoreStream}
                />
            )}

            <style>{`
                input[type="range"]::-webkit-slider-thumb {
                    appearance: none;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #3b82f6;
                    cursor: pointer;
                    border: 2px solid white;
                }
                input[type="range"]::-moz-range-thumb {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: #3b82f6;
                    cursor: pointer;
                    border: 2px solid white;
                }
            `}</style>
        </div>
    );
}
