import React, { useState, useEffect, useRef } from 'react';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { CallControls } from './CallControls';
import { User, Wifi, WifiOff, Maximize2, Minimize2, X, Volume2, MicOff, VolumeX } from 'lucide-react';
import { UserVolumeContextMenu } from '@/components/voice/UserVolumeContextMenu';
import { StreamVolumeControl } from '../common/StreamVolumeControl';
import { useUserAudio } from '@/contexts/UserAudioContext';

export const ActiveCallOverlay: React.FC = () => {
    const { user } = useAuth();
    const {
        callStatus,
        localStream,
        remoteStream,
        cameraStream,
        isMicMuted,
        isDeafened,
        isCameraOff,
        isScreenSharing,
        isRemoteScreenSharing,
        remoteMicMuted: contextRemoteMicMuted,
        remoteDeafened: contextRemoteDeafened,
        connectionState,
        toggleMic,
        toggleDeafen,
        toggleCamera,
        toggleScreenShare,
        endCall,
        activeCall,
        screenStream,
        remoteScreenStream,
        playSoundboardAudio,
        ping
    } = useCall();


    const [fullscreenVideoId, setFullscreenVideoId] = useState<string | null>(null);
    const {
        getUserScreenVolume,
        setUserScreenVolume,
        getUserScreenMuted,
        toggleUserScreenMute,
        getUserVoiceVolume,
        setUserVoiceVolume,
        getUserVoiceMuted,
        toggleUserVoiceMute
    } = useUserAudio();
    const [contactName, setContactName] = useState<string>('');
    const [contactProfileImageUrl, setContactProfileImageUrl] = useState<string | null>(null);
    const [localProfileImageUrl, setLocalProfileImageUrl] = useState<string | null>(null);
    const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
    const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
    const [contactId, setContactId] = useState<string>('');
    const [volumeContextMenu, setVolumeContextMenu] = useState<{ x: number; y: number; streamId?: string } | null>(null);
    const [ignoredStreams, setIgnoredStreams] = useState<Set<string>>(new Set());
    const [isMaximized, setIsMaximized] = useState(false);

    const toggleMaximize = () => {
        setIsMaximized(!isMaximized);
    };

    const toggleIgnoreStream = (streamId: string) => {
        const isScreen = streamId.includes('screen');

        setIgnoredStreams(prev => {
            const newSet = new Set(prev);
            if (newSet.has(streamId)) {
                newSet.delete(streamId);
                // Re-watch: Unmute if currently muted
                if (isScreen) {
                    if (getUserScreenMuted(contactId)) toggleUserScreenMute(contactId);
                } else {
                    if (getUserVoiceMuted(contactId)) toggleUserVoiceMute(contactId);
                }
            } else {
                newSet.add(streamId);
                // Stop watching: Mute if not already muted
                if (isScreen) {
                    if (!getUserScreenMuted(contactId)) toggleUserScreenMute(contactId);
                } else {
                    if (!getUserVoiceMuted(contactId)) toggleUserVoiceMute(contactId);
                }
            }
            return newSet;
        });
    };

    const remoteScreenVideoRef = useRef<HTMLVideoElement | null>(null);
    const localScreenVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteCameraVideoRef = useRef<HTMLVideoElement | null>(null);
    const fullscreenVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteAudioContextRef = useRef<AudioContext | null>(null);
    const localAudioContextRef = useRef<AudioContext | null>(null);
    const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
    const localAnalyserRef = useRef<AnalyserNode | null>(null);

    const handleTogglePiP = async (streamId: string) => {
        let videoElement: HTMLVideoElement | null = null;

        if (streamId === 'remote-camera') {
            videoElement = remoteCameraVideoRef.current;
        } else if (streamId === 'remote-screen') {
            videoElement = remoteScreenVideoRef.current;
        } else if (streamId === 'local-screen') {
            videoElement = localScreenVideoRef.current;
        }

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

    // Fetch contact name and profile images from activeCall
    useEffect(() => {
        const fetchContactInfo = async () => {
            if (!activeCall || !user) return;

            // Determine who the other person is
            const remoteContactId = activeCall.caller_id === user.id ? activeCall.callee_id : activeCall.caller_id;
            setContactId(remoteContactId);

            // Fetch their profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('username, profile_image_url')
                .eq('id', remoteContactId)
                .single();

            if (profile) {
                setContactName(profile.username || 'Unknown User');
                setContactProfileImageUrl(profile.profile_image_url);
            }

            // Fetch local user's profile image
            const { data: localProfile } = await supabase
                .from('profiles')
                .select('profile_image_url')
                .eq('id', user.id)
                .single();

            if (localProfile) {
                setLocalProfileImageUrl(localProfile.profile_image_url);
            }
        };

        fetchContactInfo();
    }, [activeCall, user]);

    // Voice activity detection for remote stream
    useEffect(() => {
        if (!remoteStream) return;

        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(remoteStream);
        source.connect(analyser);
        analyser.fftSize = 256;

        // Resume context in case it started suspended
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        remoteAudioContextRef.current = audioContext;
        remoteAnalyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let animationFrame: number;

        const detectVoice = () => {
            analyser.getByteFrequencyData(dataArray);
            const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
            setIsRemoteSpeaking(average > 20); // Threshold for voice detection
            animationFrame = requestAnimationFrame(detectVoice);
        };

        detectVoice();

        return () => {
            cancelAnimationFrame(animationFrame);
            audioContext.close();
        };
    }, [remoteStream]);

    // Voice activity detection for local stream
    useEffect(() => {
        if (!localStream) return;

        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(localStream);
        source.connect(analyser);
        analyser.fftSize = 256;

        // Resume context in case it started suspended
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        localAudioContextRef.current = audioContext;
        localAnalyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let animationFrame: number;

        const detectVoice = () => {
            if (!isMicMuted) {
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                setIsLocalSpeaking(average > 15); // Slightly more sensitive for local user
            } else {
                setIsLocalSpeaking(false);
            }
            animationFrame = requestAnimationFrame(detectVoice);
        };

        detectVoice();

        return () => {
            cancelAnimationFrame(animationFrame);
            audioContext.close();
        };
    }, [localStream, isMicMuted]);

    // Container size tracking for responsive layout
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const contentAreaRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!contentAreaRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setContainerSize({
                    width: entry.contentRect.width,
                    height: entry.contentRect.height
                });
            }
        });
        observer.observe(contentAreaRef.current);
        return () => observer.disconnect();
    }, []);


    // Helper to set video stream - handles race conditions with play
    const attachStreamToVideo = async (video: HTMLVideoElement, stream: MediaStream, videoId: string) => {
        if (video.srcObject !== stream) {
            console.log(`[ActiveCallOverlay] Attaching stream to ${videoId}`);
            video.srcObject = stream;

            // UNMUTE for remote screen shares to fix Lip Sync (audio plays in video element)
            // Local streams and camera streams remain muted in the video element 
            // because their audio is handled elsewhere or not needed there.
            const isRemoteScreen = videoId === 'remote-screen';
            video.muted = !isRemoteScreen;

            if (isRemoteScreen) {
                const volume = getUserScreenVolume(contactId);
                const isUserMuted = getUserScreenMuted(contactId);
                video.volume = isUserMuted ? 0 : volume;
            }

            try {
                await video.play();
            } catch (e) {
                console.error(`[ActiveCallOverlay] Error playing ${videoId}:`, e);
            }
        }
    };

    // Effect to handle Remote Screen Stream
    useEffect(() => {
        const video = remoteScreenVideoRef.current;
        if (!video) return;

        if (remoteScreenStream && isRemoteScreenSharing) {
            attachStreamToVideo(video, remoteScreenStream, 'remote-screen');
        } else {
            // Clear video if sharing stopped
            video.srcObject = null;
        }
    }, [remoteScreenStream, isRemoteScreenSharing, ignoredStreams]);

    // Effect to handle Remote Camera Stream
    useEffect(() => {
        const video = remoteCameraVideoRef.current;
        if (video && remoteStream) {
            // Check if there are any video tracks
            const hasVideo = remoteStream.getVideoTracks().length > 0;
            if (hasVideo) {
                attachStreamToVideo(video, remoteStream, 'remote-camera');
            } else {
                video.srcObject = null;
            }
        }
    }, [remoteStream, ignoredStreams]);

    // Effect to handle Local Screen Stream
    useEffect(() => {
        const video = localScreenVideoRef.current;
        if (!video) return;

        if (screenStream && isScreenSharing) {
            attachStreamToVideo(video, screenStream, 'local-screen');
        } else {
            video.srcObject = null;
        }
    }, [screenStream, isScreenSharing, ignoredStreams]);

    // Handle initial mute state
    useEffect(() => {
        const audioElements = [
            { ref: remoteCameraVideoRef, id: 'remote-camera' },
            { ref: remoteScreenVideoRef, id: 'remote-screen' },
            { ref: localScreenVideoRef, id: 'local-screen' }
        ];

        audioElements.forEach(({ ref }) => {
            if (ref.current) {
                ref.current.muted = true;
            }
        });
    }, []);

    const handleVolumeChange = (videoId: string, volume: number) => {
        if (videoId === 'remote-screen' || videoId === 'local-screen') {
            setUserScreenVolume(contactId, volume);

            // Sync with video element volume if it's the remote screen
            if (videoId === 'remote-screen' && remoteScreenVideoRef.current) {
                remoteScreenVideoRef.current.volume = volume;
            }

            // Sync with fullscreen video if active
            if (fullscreenVideoId === videoId && fullscreenVideoRef.current) {
                fullscreenVideoRef.current.volume = volume;
            }
        } else {
            setUserVoiceVolume(contactId, volume);
        }
    };

    const openFullscreen = (videoId: string) => {
        setFullscreenVideoId(videoId);
    };

    const closeFullscreen = () => {
        setFullscreenVideoId(null);
    };

    // Handle fullscreen video stream assignment with useEffect to prevent flickering
    useEffect(() => {
        const video = fullscreenVideoRef.current;
        if (!video || !fullscreenVideoId) return;

        let stream: MediaStream | null = null;
        const isRemoteScreen = fullscreenVideoId === 'remote-screen';

        if (isRemoteScreen && remoteScreenStream) {
            stream = remoteScreenStream;
        } else if (fullscreenVideoId === 'local-screen' && screenStream) {
            stream = screenStream;
        } else if (fullscreenVideoId === 'remote-camera' && remoteStream) {
            stream = remoteStream;
        }

        if (stream) {
            // Only update srcObject if it changed
            if (video.srcObject !== stream) {
                video.srcObject = stream;

                // UNMUTE for remote screen shares in fullscreen too
                video.muted = !isRemoteScreen;

                if (isRemoteScreen) {
                    const volume = getUserScreenVolume(contactId);
                    const isUserMuted = getUserScreenMuted(contactId);
                    video.volume = isUserMuted ? 0 : volume;
                }

                video.play().catch(e => console.error('Error playing fullscreen video:', e));
            }
        }
    }, [fullscreenVideoId, remoteScreenStream, screenStream, remoteStream]);

    // Call duration timer


    // Format call duration




    if (callStatus !== 'active' && callStatus !== 'connecting') {
        return null;
    }

    // Check for active video tracks
    const hasRemoteVideo = remoteStream && remoteStream.getVideoTracks().length > 0;
    const hasLocalVideo = localStream && !isCameraOff;

    // Define active streams for dynamic mapping
    const activeStreams = [
        {
            id: 'remote-camera',
            label: contactName,
            isRemote: true,
            stream: remoteStream,
            hasVideo: hasRemoteVideo,
            isMicMuted: contextRemoteMicMuted,
            isDeafened: contextRemoteDeafened,
            isSpeaking: isRemoteSpeaking,
            avatar: contactProfileImageUrl,
            initial: contactName.charAt(0).toUpperCase(),
            videoRef: remoteCameraVideoRef
        },
        (isRemoteScreenSharing && !!remoteScreenStream) ? {
            id: 'remote-screen',
            label: `${contactName}'s Screen`,
            isRemote: true,
            stream: remoteScreenStream,
            hasVideo: true,
            isMicMuted: false,
            isDeafened: false,
            isSpeaking: false,
            videoRef: remoteScreenVideoRef
        } : null,
        (isScreenSharing && !!screenStream) ? {
            id: 'local-screen',
            label: 'Your Screen',
            isRemote: false,
            stream: screenStream,
            hasVideo: true,
            isMicMuted: false,
            isDeafened: false,
            isSpeaking: false,
            muted: true,
            videoRef: localScreenVideoRef
        } : null,
        {
            id: 'local-camera',
            label: 'Siz',
            isRemote: false,
            stream: cameraStream || localStream,
            hasVideo: !isCameraOff && (!!cameraStream || !!localStream),
            isMicMuted: isMicMuted,
            isDeafened: isDeafened,
            isSpeaking: isLocalSpeaking,
            avatar: localProfileImageUrl,
            muted: true,
            isMirror: true
        }
    ].filter((s): s is any => s !== null);

    // Calculate optimal grid layout
    const calculateLayout = () => {
        const n = activeStreams.length;
        if (n === 0 || containerSize.width === 0) return { cols: 1, rows: 1, itemWidth: 0, itemHeight: 0 };

        const gap = 16;
        const padding = 32;
        const availableWidth = containerSize.width - padding;
        const availableHeight = containerSize.height - padding;

        let bestWidth = 0;
        let bestLayout = { cols: 1, rows: n };

        // Test all possible column counts from 1 to n
        for (let cols = 1; cols <= n; cols++) {
            const rows = Math.ceil(n / cols);

            const cellWidth = (availableWidth - (cols - 1) * gap) / cols;
            const cellHeight = (availableHeight - (rows - 1) * gap) / rows;

            let itemWidth, itemHeight;
            if (cellWidth / (16 / 9) <= cellHeight) {
                // Width is the limiting factor
                itemWidth = cellWidth;
                itemHeight = cellWidth / (16 / 9);
            } else {
                // Height is the limiting factor
                itemHeight = cellHeight;
                itemWidth = cellHeight * (16 / 9);
            }

            // We want to maximize the area (and thus width) of each item
            if (itemWidth > bestWidth) {
                bestWidth = itemWidth;
                bestLayout = { cols, rows };
            }
        }

        return {
            ...bestLayout,
            itemWidth: bestWidth,
            itemHeight: bestWidth / (16 / 9)
        };
    };

    const layout = calculateLayout();

    // Resize Logic
    const [height, setHeight] = useState(450);
    const [isResizing, setIsResizing] = useState(false);
    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;

            // Constrain height between 450px and 80vh
            const newHeight = Math.max(450, Math.min(window.innerHeight * 0.8, e.clientY - (overlayRef.current?.getBoundingClientRect().top || 0)));
            setHeight(newHeight);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.cursor = 'default';
        };

        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'row-resize';
        }

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
    }, [isResizing]);



    return (
        <>
            <div
                ref={overlayRef}
                className={`relative w-full bg-gray-900 z-10 flex flex-col flex-none transition-all duration-300 ease-out select-none ${isMaximized ? 'fixed inset-0 !h-full !z-[100]' : ''}`}
                style={{ height: isMaximized ? '100%' : height }}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 bg-gray-800/50 backdrop-blur-sm z-20 shrink-0">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
                            <User size={16} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-medium">{contactName}</h3>
                            <p className="text-xs text-gray-400">
                                {callStatus === 'connecting' ? 'Connecting...' : 'Active Call'}
                            </p>
                        </div>
                    </div>

                    {/* Connection Quality Indicator */}
                    <div className="flex items-center space-x-4">
                        {ping !== null && (
                            <div className={`flex items-center space-x-1 ${ping < 100 ? 'text-green-500' :
                                ping < 200 ? 'text-yellow-500' : 'text-red-500'
                                } `}>
                                <span className="text-xs font-medium">Ping: {Math.round(ping)}ms</span>
                            </div>
                        )}
                        {connectionState === 'connected' ? (
                            <div className="flex items-center space-x-1 text-green-500">
                                <Wifi size={16} />
                                <span className="text-xs">Connected</span>
                            </div>
                        ) : connectionState === 'connecting' ? (
                            <div className="flex items-center space-x-1 text-yellow-500">
                                <div className="animate-spin w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full" />
                                <span className="text-xs">Connecting...</span>
                            </div>
                        ) : (
                            <div className="flex items-center space-x-1 text-red-500">
                                <WifiOff size={16} />
                                <span className="text-xs">Disconnected</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div
                    ref={contentAreaRef}
                    className="flex-1 relative bg-gray-950 p-4 min-h-0 overflow-hidden flex flex-wrap justify-center items-center content-center gap-4"
                >
                    {activeStreams.map((streamInfo) => (
                        <div
                            key={streamInfo.id}
                            className={`relative bg-gray-900 rounded-xl overflow-hidden border-2 border-gray-800 shadow-lg group transition-all duration-300`}
                            style={{
                                width: `${layout.itemWidth}px`,
                                height: `${layout.itemHeight}px`,
                                flexShrink: 0
                            }}
                            onContextMenu={(e) => {
                                if (streamInfo.isRemote) {
                                    e.preventDefault();
                                    if (contactId) setVolumeContextMenu({ x: e.clientX, y: e.clientY, streamId: streamInfo.id });
                                }
                            }}
                        >
                            {/* Render Video or Avatar or Placeholder */}
                            {ignoredStreams.has(streamInfo.id) ? (
                                <div
                                    className="w-full h-full flex flex-col items-center justify-center bg-black cursor-pointer group/placeholder"
                                    onClick={() => toggleIgnoreStream(streamInfo.id)}
                                >
                                    <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-4 transition-transform group-hover/placeholder:scale-110">
                                        <Maximize2 size={32} className="text-blue-500" />
                                    </div>
                                    <p className="text-white font-medium">İzlemek için tıklayın</p>
                                    <p className="text-gray-400 text-sm mt-1">Yayın duraklatıldı</p>
                                </div>
                            ) : streamInfo.hasVideo ? (
                                <video
                                    ref={streamInfo.videoRef ? streamInfo.videoRef : (el) => {
                                        if (el && streamInfo.stream) {
                                            if (el.srcObject !== streamInfo.stream) {
                                                el.srcObject = streamInfo.stream;
                                            }
                                            // CRITICAL: Always force mute local stream or if this stream is currently fullscreen
                                            el.muted = true;
                                        }
                                    }}
                                    autoPlay
                                    playsInline
                                    muted={true}
                                    style={{
                                        // Reduce visibility/interactivity of background video when in fullscreen to save resources and avoid audio
                                        visibility: fullscreenVideoId === streamInfo.id ? 'hidden' : 'visible'
                                    }}
                                    className={`w-full h-full object-cover bg-black ${streamInfo.isMirror ? 'mirror' : ''}`}
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center">
                                    {streamInfo.avatar ? (
                                        <img src={streamInfo.avatar} alt={streamInfo.label} className="w-[25%] min-w-[64px] max-w-[128px] aspect-square rounded-full object-cover border-4 border-gray-700 shadow-2xl" />
                                    ) : (
                                        <div className="w-[25%] min-w-[64px] max-w-[128px] aspect-square bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center border-4 border-gray-700 shadow-2xl">
                                            <span className="text-3xl font-bold text-white">{streamInfo.initial || '?'}</span>
                                        </div>
                                    )}
                                    <p className="text-white text-lg font-semibold mt-4">{streamInfo.label}</p>
                                </div>
                            )}

                            {/* Indicators */}
                            <div className="absolute bottom-3 left-3 bg-black/60 px-3 py-1.5 rounded-lg flex items-center space-x-2 z-10">
                                <span className="text-white text-sm font-medium">{streamInfo.label}</span>
                                {streamInfo.isMicMuted && (
                                    <div className="flex items-center" title="Mikrofon Kapalı">
                                        <MicOff size={14} className="text-red-500" />
                                    </div>
                                )}
                                {streamInfo.isDeafened && (
                                    <div className="flex items-center" title="Sağırlaştırıldı (Sesi Kapalı)">
                                        <VolumeX size={14} className="text-red-500" />
                                    </div>
                                )}
                            </div>

                            {/* Controls Layer */}
                            <div className="absolute top-3 right-3 flex space-x-2 z-10">
                                {streamInfo.id !== 'local-camera' && (
                                    <button
                                        onClick={() => openFullscreen(streamInfo.id)}
                                        className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-opacity opacity-0 group-hover:opacity-100"
                                    >
                                        <Maximize2 size={16} />
                                    </button>
                                )}
                            </div>

                            {/* Volume slider */}
                            <div className="absolute bottom-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                <StreamVolumeControl
                                    volume={streamInfo.id.includes('screen') ? getUserScreenVolume(contactId) : getUserVoiceVolume(contactId)}
                                    onVolumeChange={(v) => handleVolumeChange(streamInfo.id, v)}
                                    isMuted={streamInfo.muted || isDeafened || (streamInfo.id.includes('screen') ? getUserScreenMuted(contactId) : false)}
                                />
                            </div>

                            {/* Voice Activity Indicator */}
                            {streamInfo.isSpeaking && <div className="absolute inset-0 border-4 border-green-500 rounded-xl pointer-events-none z-20" />}
                        </div>
                    ))}
                </div>

                {/* Call Controls */}
                <div className="p-4 flex justify-center bg-gray-900 shrink-0">
                    <CallControls
                        isMicMuted={isMicMuted}
                        isDeafened={isDeafened}
                        isCameraOff={isCameraOff}
                        isScreenSharing={isScreenSharing}
                        onMicToggle={toggleMic}
                        onDeafenToggle={toggleDeafen}
                        onCameraToggle={toggleCamera}
                        onScreenShareToggle={toggleScreenShare}
                        onEndCall={endCall}
                        showCamera={true}
                        showScreenShare={true}
                        onPlaySound={playSoundboardAudio}
                    />
                </div>

                {/* Maximize Toggle Button */}
                <button
                    onClick={toggleMaximize}
                    className="absolute bottom-4 right-4 p-2 bg-gray-800/80 hover:bg-gray-700 rounded-lg text-white transition-colors z-[60]"
                    title={isMaximized ? "Küçült" : "Tam Ekran Yap"}
                >
                    {isMaximized ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                </button>

                {/* Resize Handle */}
                <div
                    className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-800 hover:bg-blue-500 cursor-row-resize z-50 transition-colors flex items-center justify-center group"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        setIsResizing(true);
                    }}
                >
                    <div className="w-20 h-1 rounded-full bg-gray-600 group-hover:bg-blue-300 transition-colors" />
                </div>
            </div>

            {/* Fullscreen Modal */}
            {fullscreenVideoId && (() => {
                let stream: MediaStream | null = null;
                let label = '';

                if (fullscreenVideoId === 'remote-screen' && remoteScreenStream) {
                    stream = remoteScreenStream;
                    label = `${contactName} - Ekran paylaşımı`;
                } else if (fullscreenVideoId === 'local-screen' && screenStream) {
                    stream = screenStream;
                    label = 'Sizin ekranınız';
                } else if (fullscreenVideoId === 'remote-camera' && remoteStream) {
                    stream = remoteStream;
                    label = `${contactName} - Kamera`;
                }

                const currentVolume = fullscreenVideoId.includes('screen') ? getUserScreenVolume(contactId) : getUserVoiceVolume(contactId);
                const isMuted = fullscreenVideoId.startsWith('local-') || isDeafened || (fullscreenVideoId.includes('screen') ? getUserScreenMuted(contactId) : false);

                return (
                    <div
                        className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-8"
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

                            {/* Fullscreen Volume slider */}
                            <div className="absolute bottom-8 right-8 z-10">
                                <StreamVolumeControl
                                    volume={currentVolume}
                                    onVolumeChange={(v) => handleVolumeChange(fullscreenVideoId, v)}
                                    isMuted={isMuted}
                                    className="scale-125"
                                />
                            </div>



                            {/* Label */}
                            <div className="absolute top-4 left-4 bg-black/70 rounded-lg px-4 py-2">
                                <p className="text-sm font-medium text-white">{label}</p>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <style>{`
                .mirror {
                    transform: scaleX(-1);
                }
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

            {/* Volume Context Menu */}
            {volumeContextMenu && contactId && (
                <UserVolumeContextMenu
                    x={volumeContextMenu.x}
                    y={volumeContextMenu.y}
                    userId={contactId}
                    username={contactName}
                    profileImageUrl={contactProfileImageUrl || undefined}
                    onClose={() => setVolumeContextMenu(null)}
                    streamId={volumeContextMenu.streamId}
                    isIgnored={volumeContextMenu.streamId ? ignoredStreams.has(volumeContextMenu.streamId) : false}
                    onToggleIgnore={toggleIgnoreStream}
                    onTogglePiP={handleTogglePiP}
                />
            )}
        </>
    );
};
