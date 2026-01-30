import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserAudio } from '@/contexts/UserAudioContext';
import { MonitorUp, Users, MicOff, Headphones, Maximize2, Minimize2, X, Volume2, User, Camera, Trash2, VolumeX, PictureInPicture2 } from 'lucide-react';
import { UserVolumeContextMenu } from './UserVolumeContextMenu';
import { StreamVolumeControl } from '../common/StreamVolumeControl';

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
    const {
        getUserScreenVolume,
        setUserScreenVolume,
        getUserScreenMuted,
        toggleUserScreenMute,
        getUserVoiceVolume,
        setUserVoiceVolume,
        getUserVoiceMuted,
        toggleUserVoiceMute,
        getEffectiveVoiceVolume,
        getEffectiveScreenVolume
    } = useUserAudio();
    const [ignoredStreams, setIgnoredStreams] = useState<Set<string>>(new Set());
    const [volumeContextMenu, setVolumeContextMenu] = useState<{ x: number; y: number; userId: string; username: string; profileImageUrl?: string; streamId: string } | null>(null);
    const [isMaximized, setIsMaximized] = useState(false);

    const toggleMaximize = () => setIsMaximized(!isMaximized);

    const [showFullscreenControls, setShowFullscreenControls] = useState(true);
    const fullscreenControlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleFullscreenMouseMove = () => {
        setShowFullscreenControls(true);
        if (fullscreenControlsTimeoutRef.current) {
            clearTimeout(fullscreenControlsTimeoutRef.current);
        }
        fullscreenControlsTimeoutRef.current = setTimeout(() => {
            setShowFullscreenControls(false);
        }, 3000);
    };

    const toggleIgnoreStream = (streamId: string) => {
        const isScreen = streamId.startsWith('screen-');
        const userId = streamId.slice(7); // Extract userId after 'screen-' or 'camera-' (both are 7 chars)

        setIgnoredStreams(prev => {
            const newSet = new Set(prev);
            if (newSet.has(streamId)) {
                newSet.delete(streamId);
                // Re-watch: Unmute if currently muted
                if (isScreen) {
                    if (getUserScreenMuted(userId)) toggleUserScreenMute(userId);
                } else {
                    if (getUserVoiceMuted(userId)) toggleUserVoiceMute(userId);
                }
            } else {
                newSet.add(streamId);
                // Stop watching: Mute if not already muted
                if (isScreen) {
                    if (!getUserScreenMuted(userId)) toggleUserScreenMute(userId);
                } else {
                    if (!getUserVoiceMuted(userId)) toggleUserVoiceMute(userId);
                }
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
                video.muted = true; // Mute video element, audio is handled by GlobalAudio
                video.play().catch(e => console.error('Error playing video:', e));
            }
        });

        // Update screen share streams
        screenSharingParticipants.forEach(participant => {
            const videoId = `screen-${participant.user_id}`;
            const video = videoRefs.current.get(videoId);
            if (video && participant.screenStream && video.srcObject !== participant.screenStream && !ignoredStreams.has(videoId)) {
                video.srcObject = participant.screenStream;

                video.muted = true; // Always muted locally
                video.play().catch(e => console.error('Error playing video:', e));
            }
        });
    }, [cameraParticipants, screenSharingParticipants, ignoredStreams, videoRefs.current]);

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
        const { stream } = getFullscreenStream();
        const video = fullscreenVideoRef.current;
        const participantId = fullscreenVideoId?.split('-')[1];

        if (video && stream && participantId) {
            // Only update srcObject if it changed
            if (video.srcObject !== stream) {
                video.srcObject = stream;

                // Logic for audio playback in fullscreen:
                // 1. Mute if it's local user
                // 2. Mute if it's a camera (audio comes from GlobalAudio)
                // 3. Unmute ONLY if it's remote screen share (audio comes from video element)
                const isCamera = fullscreenVideoId?.startsWith('camera-');
                const isLocal = participantId === user?.id;
                const shouldUnmute = !isLocal && !isCamera;

                video.muted = !shouldUnmute;

                // Sync volume if unmuted
                if (shouldUnmute) {
                    const volume = getUserScreenVolume(participantId);
                    const isUserMuted = getUserScreenMuted(participantId);
                    video.volume = isUserMuted ? 0 : volume;
                }

                video.play().catch(e => console.error('Error playing fullscreen video:', e));
            }
        }
    }, [fullscreenVideoId, getFullscreenStream, user?.id]);

    // Reset controls when entering fullscreen
    useEffect(() => {
        if (fullscreenVideoId) {
            setShowFullscreenControls(true);
            if (fullscreenControlsTimeoutRef.current) {
                clearTimeout(fullscreenControlsTimeoutRef.current);
            }
            fullscreenControlsTimeoutRef.current = setTimeout(() => {
                setShowFullscreenControls(false);
            }, 3000);
        } else {
            if (fullscreenControlsTimeoutRef.current) {
                clearTimeout(fullscreenControlsTimeoutRef.current);
            }
        }
    }, [fullscreenVideoId]);

    const handleVolumeChange = useCallback((videoId: string, userId: string, volume: number) => {
        if (videoId.startsWith('screen-')) {
            setUserScreenVolume(userId, volume);

            // Sync with video element volume (for Lip Sync)
            const video = videoRefs.current.get(videoId);
            if (video) {
                video.volume = volume;
            }

            // Sync with fullscreen video if active
            if (fullscreenVideoId === videoId && fullscreenVideoRef.current) {
                fullscreenVideoRef.current.volume = volume;
            }
        } else {
            setUserVoiceVolume(userId, volume);
        }
    }, [setUserScreenVolume, setUserVoiceVolume, fullscreenVideoId]);

    const openFullscreen = (videoId: string) => {
        setFullscreenVideoId(videoId);
    };

    const closeFullscreen = () => {
        setFullscreenVideoId(null);
    };

    const handleTogglePiP = async (streamId: string) => {
        const videoElement = videoRefs.current.get(streamId);

        if (videoElement) {
            try {
                if (document.pictureInPictureElement) {
                    await document.exitPictureInPicture();
                }
                if (document.pictureInPictureElement !== videoElement) {
                    await videoElement.requestPictureInPicture();
                }
            } catch (error) {
                console.error('Error toggling PiP:', error);
            }
        }
    };

    const hasAnyStreams = cameraParticipants.length > 0 || screenSharingParticipants.length > 0;

    return (
        <div className={`flex-1 flex flex-col bg-gray-900 ${isMaximized ? 'fixed inset-0 z-[100]' : ''}`}>
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
            <div className={`flex-1 overflow-y-auto p-4 ${isMaximized ? 'h-full' : ''}`}>
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
                    // Grid layout for streams
                    <div className={`gap-4 ${isMaximized
                        ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-fr h-full content-center'
                        : 'grid grid-cols-2 auto-rows-min'
                        }`}>
                        {/* Camera streams */}
                        {cameraParticipants.map((participant) => {
                            const videoId = `camera-${participant.user_id}`;
                            const currentVolume = getUserVoiceVolume(participant.user_id);
                            const isMuted = false; // Add muted logic if needed per user

                            return (
                                <div
                                    key={videoId}
                                    className="relative bg-gray-800 rounded-lg overflow-hidden group aspect-video shadow-md border border-gray-800"
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
                                                    el.muted = true;
                                                    if (participant.cameraStream && el.srcObject !== participant.cameraStream) {
                                                        el.srcObject = participant.cameraStream;
                                                        el.play().catch(e => console.error('Error playing camera video from ref:', e));
                                                    }
                                                } else {
                                                    videoRefs.current.delete(videoId);
                                                }
                                            }}
                                            autoPlay
                                            playsInline
                                            muted={true}
                                            className={`w-full h-full bg-black ${isMaximized ? 'object-contain' : 'object-cover'}`}
                                        />
                                    )}

                                    {/* Controls overlay */}
                                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">

                                        {/* Fullscreen button */}
                                        <button
                                            onClick={() => openFullscreen(videoId)}
                                            className="p-2 bg-black/70 hover:bg-black/90 rounded-lg transition-colors"
                                            title="Tam ekran"
                                        >
                                            <Maximize2 className="w-5 h-5 text-white" />
                                        </button>
                                    </div>

                                    {/* Volume slider */}
                                    <div className="absolute bottom-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <StreamVolumeControl
                                            volume={currentVolume}
                                            onVolumeChange={(v) => handleVolumeChange(videoId, participant.user_id, v)}
                                            isMuted={participant.user_id === user?.id || isMuted}
                                        />
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
                            const currentVolume = getUserScreenVolume(participant.user_id);
                            const isMuted = getUserScreenMuted(participant.user_id);

                            return (
                                <div
                                    key={videoId}
                                    className="relative bg-gray-800 rounded-lg overflow-hidden group aspect-video shadow-md border border-gray-800"
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

                                                    // Only mute self
                                                    const isSelf = participant.user_id === user?.id;
                                                    el.muted = isSelf;

                                                    if (participant.screenStream && el.srcObject !== participant.screenStream) {
                                                        el.srcObject = participant.screenStream;

                                                        // Set volume for remote users
                                                        if (!isSelf) {
                                                            const volume = getUserScreenVolume(participant.user_id);
                                                            const isUserMuted = getUserScreenMuted(participant.user_id);
                                                            el.volume = isUserMuted ? 0 : volume;
                                                        }

                                                        el.play().catch(e => console.error('Error playing screen video from ref:', e));
                                                    }
                                                } else {
                                                    videoRefs.current.delete(videoId);
                                                }
                                            }}
                                            autoPlay
                                            playsInline
                                            muted={participant.user_id === user?.id} // Only mute self, play remote audio through video for lip-sync
                                            style={{
                                                visibility: fullscreenVideoId === videoId ? 'hidden' : 'visible'
                                            }}
                                            className={`w-full h-full bg-black ${isMaximized ? 'object-contain' : 'object-contain'}`}
                                        />
                                    )}

                                    {/* Controls overlay */}
                                    <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">

                                        {/* Fullscreen button */}
                                        <button
                                            onClick={() => openFullscreen(videoId)}
                                            className="p-2 bg-black/70 hover:bg-black/90 rounded-lg transition-colors"
                                            title="Tam ekran"
                                        >
                                            <Maximize2 className="w-5 h-5 text-white" />
                                        </button>
                                    </div>

                                    {/* Volume slider */}
                                    <div className="absolute bottom-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <StreamVolumeControl
                                            volume={currentVolume}
                                            onVolumeChange={(v) => handleVolumeChange(videoId, participant.user_id, v)}
                                            isMuted={participant.user_id === user?.id || isMuted}
                                        />
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

            {/* Maximize Toggle Button */}
            {/* Maximize Toggle Button - Fixed to bottom right of the container */}
            <button
                onClick={toggleMaximize}
                className={`absolute bottom-6 right-6 p-3 rounded-full text-white transition-all z-[60] shadow-xl border border-white/10 ${isMaximized
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                title={isMaximized ? "Küçült" : "Tam Ekran Yap"}
            >
                {isMaximized ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
            </button>

            {/* Fullscreen Modal */}
            {
                fullscreenVideoId && (() => {
                    const participant = [...cameraParticipants, ...screenSharingParticipants].find(p =>
                        fullscreenVideoId === `camera-${p.user_id}` || fullscreenVideoId === `screen-${p.user_id}`
                    );
                    const isCamera = fullscreenVideoId.startsWith('camera-');
                    const stream = isCamera ? participant?.cameraStream : participant?.screenStream;
                    const participantId = participant?.user_id || '';
                    const currentVolume = isCamera ? getUserVoiceVolume(participantId) : getUserScreenVolume(participantId);
                    const isMuted = participantId === user?.id || (isCamera ? false : getUserScreenMuted(participantId));
                    const isLocalUser = participantId === user?.id;

                    return (
                        <div
                            className={`fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-8 transition-cursor duration-300 ${!showFullscreenControls ? 'cursor-none' : ''}`}
                            onClick={closeFullscreen}
                            onMouseMove={handleFullscreenMouseMove}
                        >
                            <div
                                className="relative w-[95vw] h-[95vh] bg-black rounded-lg overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <video
                                    ref={fullscreenVideoRef}
                                    autoPlay
                                    playsInline
                                    muted={participantId === user?.id || isCamera} // Mute self or if camera (audio comes from GlobalAudio)
                                    className="w-full h-full object-contain"
                                />

                                {/* Close button */}
                                <button
                                    onClick={closeFullscreen}
                                    className={`absolute top-4 right-4 p-3 bg-black/70 hover:bg-black/90 rounded-lg transition-all duration-300 z-10 ${showFullscreenControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}
                                    title="Kapat"
                                >
                                    <X className="w-6 h-6 text-white" />
                                </button>

                                {/* Fullscreen Volume slider */}
                                <div className={`absolute bottom-8 right-8 z-10 transition-all duration-300 ${showFullscreenControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
                                    <StreamVolumeControl
                                        volume={currentVolume}
                                        onVolumeChange={(v) => handleVolumeChange(fullscreenVideoId!, participantId, v)}
                                        isMuted={isMuted}
                                        className="scale-125"
                                    />
                                </div>



                                {/* User info */}
                                <div className={`absolute top-4 left-4 bg-black/70 rounded-lg px-4 py-2 transition-all duration-300 ${showFullscreenControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
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
                })()
            }

            {/* Volume Context Menu */}
            {
                volumeContextMenu && (
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
                        onTogglePiP={handleTogglePiP}
                    />
                )
            }

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
        </div >
    );
}
