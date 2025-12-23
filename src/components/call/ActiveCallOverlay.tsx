import React, { useState, useEffect, useRef } from 'react';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { CallControls } from './CallControls';
import { User, Wifi, WifiOff, Maximize2, X, Volume2, MicOff } from 'lucide-react';
import { UserVolumeContextMenu } from '@/components/voice/UserVolumeContextMenu';

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

    const [callDuration, setCallDuration] = useState(0);
    const [fullscreenVideoId, setFullscreenVideoId] = useState<string | null>(null);
    const [volumes, setVolumes] = useState<Map<string, number>>(new Map());
    const [contactName, setContactName] = useState<string>('');
    const [contactProfileImageUrl, setContactProfileImageUrl] = useState<string | null>(null);
    const [localProfileImageUrl, setLocalProfileImageUrl] = useState<string | null>(null);
    const [isRemoteSpeaking, setIsRemoteSpeaking] = useState(false);
    const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
    const [remoteMicMuted, setRemoteMicMuted] = useState(false);
    const [contactId, setContactId] = useState<string>('');
    const [volumeContextMenu, setVolumeContextMenu] = useState<{ x: number; y: number } | null>(null);

    const remoteScreenVideoRef = useRef<HTMLVideoElement | null>(null);
    const localScreenVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteCameraVideoRef = useRef<HTMLVideoElement | null>(null);
    const fullscreenVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteAudioContextRef = useRef<AudioContext | null>(null);
    const localAudioContextRef = useRef<AudioContext | null>(null);
    const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
    const localAnalyserRef = useRef<AnalyserNode | null>(null);

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

        // Check if remote audio track is muted
        const audioTrack = remoteStream.getAudioTracks()[0];
        if (audioTrack) {
            setRemoteMicMuted(!audioTrack.enabled);
        }

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

        localAudioContextRef.current = audioContext;
        localAnalyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let animationFrame: number;

        const detectVoice = () => {
            if (!isMicMuted) {
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                setIsLocalSpeaking(average > 20);
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
    // Refactored to be used inside useEffect
    const attachStreamToVideo = async (video: HTMLVideoElement, stream: MediaStream, videoId: string) => {
        if (video.srcObject !== stream) {
            console.log(`[ActiveCallOverlay] Attaching stream to ${videoId}`);
            video.srcObject = stream;
            // Common volume handling
            const vol = volumes.get(videoId) ?? 1.0;
            video.volume = vol;
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
    }, [remoteScreenStream, isRemoteScreenSharing]);

    // Effect to handle Remote Camera Stream
    useEffect(() => {
        const video = remoteCameraVideoRef.current;
        if (video && remoteStream) {
            // Only attach as camera if NOT screen sharing or if it's explicitly allowed
            // The logic: showRemoteVideo = (isVideoCall && remoteStream) || isRemoteScreenSharing;
            // But we have separate refs.
            const isVideoCall = activeCall?.call_type === 'video';
            if (isVideoCall) {
                attachStreamToVideo(video, remoteStream, 'remote-camera');
            }
        }
    }, [remoteStream, activeCall?.call_type]);

    // Effect to handle Local Screen Stream
    useEffect(() => {
        const video = localScreenVideoRef.current;
        if (!video) return;

        if (screenStream && isScreenSharing) {
            attachStreamToVideo(video, screenStream, 'local-screen');
        } else {
            video.srcObject = null;
        }
    }, [screenStream, isScreenSharing]);

    const handleVolumeChange = (videoId: string, volume: number) => {
        const videoRefs = [remoteScreenVideoRef, localScreenVideoRef, remoteCameraVideoRef];
        videoRefs.forEach(ref => {
            if (ref.current) {
                ref.current.volume = volume;
            }
        });
        setVolumes(new Map(volumes.set(videoId, volume)));
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
        let isLocalStream = false;

        if (fullscreenVideoId === 'remote-screen' && remoteScreenStream) {
            stream = remoteScreenStream;
        } else if (fullscreenVideoId === 'local-screen' && screenStream) {
            stream = screenStream;
            isLocalStream = true;
        } else if (fullscreenVideoId === 'remote-camera' && remoteStream) {
            stream = remoteStream;
        }

        if (stream) {
            // Only update srcObject if it changed
            if (video.srcObject !== stream) {
                video.srcObject = stream;
                video.muted = isLocalStream; // Mute local stream to prevent feedback
                video.play().catch(e => console.error('Error playing fullscreen video:', e));
            }
            // Always update volume for remote streams
            const currentVolume = volumes.get(fullscreenVideoId) ?? 1.0;
            video.volume = isLocalStream ? 0 : currentVolume;
        }
    }, [fullscreenVideoId, remoteScreenStream, screenStream, remoteStream, volumes]);

    // Call duration timer
    useEffect(() => {
        if (callStatus === 'active') {
            const interval = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
            return () => clearInterval(interval);
        } else {
            setCallDuration(0);
        }
    }, [callStatus]);

    // Format call duration
    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };



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
            isMicMuted: remoteMicMuted,
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
                className="relative w-full bg-gray-900 z-10 flex flex-col flex-none transition-[height] duration-75 ease-out select-none"
                style={{ height }}
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
                                {callStatus === 'connecting' ? 'Connecting...' : formatDuration(callDuration)}
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
                                    if (contactId) setVolumeContextMenu({ x: e.clientX, y: e.clientY });
                                }
                            }}
                        >
                            {/* Render Video or Avatar */}
                            {streamInfo.hasVideo ? (
                                <video
                                    ref={streamInfo.videoRef ? streamInfo.videoRef : (el) => {
                                        if (el && streamInfo.stream && el.srcObject !== streamInfo.stream) {
                                            el.srcObject = streamInfo.stream;
                                        }
                                    }}
                                    autoPlay
                                    playsInline
                                    muted={streamInfo.muted}
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
                                {streamInfo.isMicMuted && <MicOff size={14} className="text-red-500" />}
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
                let currentVolume = 1.0;

                if (fullscreenVideoId === 'remote-screen' && remoteScreenStream) {
                    stream = remoteScreenStream;
                    label = `${contactName} - Ekran paylaşımı`;
                    currentVolume = volumes.get('remote-screen') ?? 1.0;
                } else if (fullscreenVideoId === 'local-screen' && screenStream) {
                    stream = screenStream;
                    label = 'Sizin ekranınız';
                    currentVolume = volumes.get('local-screen') ?? 1.0;
                } else if (fullscreenVideoId === 'remote-camera' && remoteStream) {
                    stream = remoteStream;
                    label = `${contactName} - Kamera`;
                    currentVolume = volumes.get('remote-camera') ?? 1.0;
                }

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

                            {/* Volume control (not for local screen) */}
                            {fullscreenVideoId !== 'local-screen' && (
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
                                    />
                                    <span className="text-sm text-white font-medium w-10">{Math.round(currentVolume * 100)}%</span>
                                </div>
                            )}

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
                />
            )}
        </>
    );
};
