import { useEffect, useRef, useState } from 'react';
import { MonitorUp, Users, Maximize2, Minimize2 } from 'lucide-react';

interface VoiceParticipant {
    user_id: string;
    profile: {
        username: string;
        profile_image_url?: string;
    };
    is_screen_sharing: boolean;
    is_video_enabled: boolean;
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

    // Get participants with camera or screen share
    const cameraParticipants = participants.filter(p => p.is_video_enabled && p.cameraStream);
    const screenSharingParticipants = participants.filter(p => p.is_screen_sharing && p.screenStream);

    // Update video elements when streams change
    useEffect(() => {
        // Update camera streams
        cameraParticipants.forEach(participant => {
            const video = videoRefs.current.get(`camera-${participant.user_id}`);
            if (video && participant.cameraStream && video.srcObject !== participant.cameraStream) {
                video.srcObject = participant.cameraStream;
                video.play().catch(e => console.error('Error playing video:', e));
            }
        });

        // Update screen share streams
        screenSharingParticipants.forEach(participant => {
            const video = videoRefs.current.get(`screen-${participant.user_id}`);
            if (video && participant.screenStream && video.srcObject !== participant.screenStream) {
                video.srcObject = participant.screenStream;
                video.play().catch(e => console.error('Error playing video:', e));
            }
        });
    }, [cameraParticipants, screenSharingParticipants]);

    // Fullscreen toggle function
    const toggleFullscreen = async (videoId: string) => {
        const video = videoRefs.current.get(videoId);
        if (!video) return;

        try {
            if (!document.fullscreenElement) {
                await video.requestFullscreen();
                setFullscreenVideoId(videoId);
            } else {
                await document.exitFullscreen();
                setFullscreenVideoId(null);
            }
        } catch (error) {
            console.error('Error toggling fullscreen:', error);
        }
    };

    // Listen for fullscreen changes (e.g., ESC key)
    useEffect(() => {
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                setFullscreenVideoId(null);
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

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
                            const isFullscreen = fullscreenVideoId === videoId;

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
                                            } else {
                                                videoRefs.current.delete(videoId);
                                            }
                                        }}
                                        autoPlay
                                        playsInline
                                        className="w-full h-auto object-contain bg-black"
                                        style={{ maxHeight: '400px' }}
                                    />

                                    {/* Fullscreen button */}
                                    <button
                                        onClick={() => toggleFullscreen(videoId)}
                                        className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 rounded-lg transition-all opacity-0 group-hover:opacity-100 z-10"
                                        title="Tam ekran"
                                    >
                                        {isFullscreen ? (
                                            <Minimize2 className="w-5 h-5 text-white" />
                                        ) : (
                                            <Maximize2 className="w-5 h-5 text-white" />
                                        )}
                                    </button>

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
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {/* Screen share streams */}
                        {screenSharingParticipants.map((participant) => {
                            const videoId = `screen-${participant.user_id}`;
                            const isFullscreen = fullscreenVideoId === videoId;

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
                                            } else {
                                                videoRefs.current.delete(videoId);
                                            }
                                        }}
                                        autoPlay
                                        playsInline
                                        className="w-full h-auto object-contain bg-black"
                                        style={{ maxHeight: '400px' }}
                                    />

                                    {/* Fullscreen button */}
                                    <button
                                        onClick={() => toggleFullscreen(videoId)}
                                        className="absolute top-3 right-3 p-2 bg-black/50 hover:bg-black/70 rounded-lg transition-all opacity-0 group-hover:opacity-100 z-10"
                                        title="Tam ekran"
                                    >
                                        {isFullscreen ? (
                                            <Minimize2 className="w-5 h-5 text-white" />
                                        ) : (
                                            <Maximize2 className="w-5 h-5 text-white" />
                                        )}
                                    </button>

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

            <style>{`
                video:fullscreen {
                    width: 100vw !important;
                    height: 100vh !important;
                    max-width: 100vw !important;
                    max-height: 100vh !important;
                    object-fit: contain;
                    background: #000;
                }
            `}</style>
        </div>
    );
}
