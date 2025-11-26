import { useEffect, useRef, useState } from 'react';
import { MonitorUp, Users, MicOff, Headphones, Maximize2, X, Volume2 } from 'lucide-react';

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
    const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
    const [fullscreenVideoId, setFullscreenVideoId] = useState<string | null>(null);
    const [volumes, setVolumes] = useState<Map<string, number>>(new Map());

    // Get participants with camera or screen share
    const cameraParticipants = participants.filter(p => p.is_video_enabled && p.cameraStream);
    const screenSharingParticipants = participants.filter(p => p.is_screen_sharing && p.screenStream);

    // Update video elements when streams change
    useEffect(() => {
        // Update camera streams
        cameraParticipants.forEach(participant => {
            const videoId = `camera-${participant.user_id}`;
            const video = videoRefs.current.get(videoId);
            if (video && participant.cameraStream && video.srcObject !== participant.cameraStream) {
                video.srcObject = participant.cameraStream;
                video.volume = volumes.get(videoId) ?? 1.0;
                video.play().catch(e => console.error('Error playing video:', e));
            }
        });

        // Update screen share streams
        screenSharingParticipants.forEach(participant => {
            const videoId = `screen-${participant.user_id}`;
            const video = videoRefs.current.get(videoId);
            if (video && participant.screenStream && video.srcObject !== participant.screenStream) {
                video.srcObject = participant.screenStream;
                video.volume = volumes.get(videoId) ?? 1.0;
                video.play().catch(e => console.error('Error playing video:', e));
            }
        });
    }, [cameraParticipants, screenSharingParticipants, volumes]);



    const handleVolumeChange = (videoId: string, volume: number) => {
        const video = videoRefs.current.get(videoId);
        if (video) {
            video.volume = volume;
        }
        setVolumes(new Map(volumes.set(videoId, volume)));
    };

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
                                >
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
                                            <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center overflow-hidden">
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
                                >
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
                                            <div className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center overflow-hidden">
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
                                ref={(el) => {
                                    if (el && stream) {
                                        el.srcObject = stream;
                                        el.volume = currentVolume;
                                        el.play().catch(e => console.error('Error playing video:', e));
                                    }
                                }}
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

                            {/* Volume control */}
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

                            {/* User info */}
                            <div className="absolute top-4 left-4 bg-black/70 rounded-lg px-4 py-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center overflow-hidden">
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
