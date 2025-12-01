import React, { useEffect, useRef, useState } from 'react';
import { useCall } from '@/contexts/CallContext';
import { CallControls } from './CallControls';
import { User, Wifi, WifiOff, Maximize2, X, Volume2 } from 'lucide-react';

interface ActiveCallOverlayProps {
    contactName: string;
}

export const ActiveCallOverlay: React.FC<ActiveCallOverlayProps> = ({ contactName }) => {
    const {
        callStatus,
        localStream,
        remoteStream,
        isMicMuted,
        isCameraOff,
        isScreenSharing,
        isRemoteScreenSharing,
        connectionState,
        toggleMic,
        toggleCamera,
        toggleScreenShare,
        endCall,
        activeCall,
        screenStream,
        remoteScreenStream
    } = useCall();

    const [callDuration, setCallDuration] = useState(0);
    const [fullscreenVideoId, setFullscreenVideoId] = useState<string | null>(null);
    const [volumes, setVolumes] = useState<Map<string, number>>(new Map());

    const remoteScreenVideoRef = useRef<HTMLVideoElement | null>(null);
    const localScreenVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteCameraVideoRef = useRef<HTMLVideoElement | null>(null);

    // Helper to set video stream
    const setVideoStream = (el: HTMLVideoElement | null, stream: MediaStream | null, videoId?: string) => {
        if (el && stream) {
            if (el.srcObject !== stream) {
                console.log('[ActiveCallOverlay] Setting stream to video element');
                el.srcObject = stream;
                if (videoId) {
                    el.volume = volumes.get(videoId) ?? 1.0;
                }
                el.play().catch(e => console.error('Error playing video:', e));
            }
        }
    };

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

    const isVideoCall = activeCall?.call_type === 'video';
    const showVideo = (isVideoCall && !isCameraOff) || isRemoteScreenSharing || isScreenSharing;

    // Determine layout mode
    const isBidirectionalScreenShare = isScreenSharing && screenStream && isRemoteScreenSharing && remoteScreenStream;

    return (
        <div className="relative w-full h-1/2 bg-gray-900 border-b border-gray-700 z-10 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 bg-gray-800/50 backdrop-blur-sm">
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
                <div className="flex items-center space-x-2">
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

            {/* Video/Audio Display Area */}
            <div className="flex-1 relative bg-gray-950">
                {/* GlobalAudio handles the audio playback now */}

                <div className="w-full h-full flex items-center justify-center p-4 gap-4">
                    {/* Remote Screen Share */}
                    {(isRemoteScreenSharing && remoteScreenStream) && (
                        <div className="flex-1 max-w-[50%] flex flex-col items-center justify-center transition-all duration-300 ease-in-out">
                            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-xl border border-gray-800 group">
                                <video
                                    ref={(el) => {
                                        remoteScreenVideoRef.current = el;
                                        setVideoStream(el, remoteScreenStream, 'remote-screen');
                                    }}
                                    autoPlay
                                    playsInline
                                    className="w-full h-full object-contain bg-gray-900"
                                />

                                {/* Controls overlay */}
                                <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    {/* Volume control */}
                                    <div className="flex items-center gap-2 bg-black/70 rounded-lg px-3 py-2">
                                        <Volume2 className="w-4 h-4 text-white" />
                                        <input
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.1"
                                            value={volumes.get('remote-screen') ?? 1.0}
                                            onChange={(e) => handleVolumeChange('remote-screen', parseFloat(e.target.value))}
                                            className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                        />
                                        <span className="text-xs text-white w-8">{Math.round((volumes.get('remote-screen') ?? 1.0) * 100)}%</span>
                                    </div>
                                    {/* Fullscreen button */}
                                    <button
                                        onClick={() => openFullscreen('remote-screen')}
                                        className="p-2 bg-black/70 hover:bg-black/90 rounded-lg transition-colors"
                                        title="Tam ekran"
                                    >
                                        <Maximize2 className="w-5 h-5 text-white" />
                                    </button>
                                </div>

                                <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs text-white">
                                    {contactName}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Local Screen Share */}
                    {(isScreenSharing && screenStream) && (
                        <div className="flex-1 max-w-[50%] flex flex-col items-center justify-center transition-all duration-300 ease-in-out">
                            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-xl border border-gray-800 group">
                                <video
                                    ref={(el) => {
                                        localScreenVideoRef.current = el;
                                        setVideoStream(el, screenStream, 'local-screen');
                                    }}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-contain bg-gray-900"
                                />

                                {/* Controls overlay */}
                                <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    {/* Fullscreen button */}
                                    <button
                                        onClick={() => openFullscreen('local-screen')}
                                        className="p-2 bg-black/70 hover:bg-black/90 rounded-lg transition-colors"
                                        title="Tam ekran"
                                    >
                                        <Maximize2 className="w-5 h-5 text-white" />
                                    </button>
                                </div>

                                <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs text-white">
                                    Sizin Ekranınız
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Remote Camera (only if no screen shares) */}
                    {(!isRemoteScreenSharing && !isScreenSharing) && (
                        <div className="flex-1 max-w-[50%] flex flex-col items-center justify-center transition-all duration-300 ease-in-out">
                            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-2xl border border-gray-800 group">
                                {showVideo && remoteStream ? (
                                    <>
                                        <video
                                            ref={(el) => {
                                                remoteCameraVideoRef.current = el;
                                                setVideoStream(el, remoteStream, 'remote-camera');
                                            }}
                                            autoPlay
                                            playsInline
                                            className="w-full h-full object-contain bg-gray-900"
                                        />

                                        {/* Controls overlay */}
                                        <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                            {/* Volume control */}
                                            <div className="flex items-center gap-2 bg-black/70 rounded-lg px-3 py-2">
                                                <Volume2 className="w-4 h-4 text-white" />
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="1"
                                                    step="0.1"
                                                    value={volumes.get('remote-camera') ?? 1.0}
                                                    onChange={(e) => handleVolumeChange('remote-camera', parseFloat(e.target.value))}
                                                    className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                                                />
                                                <span className="text-xs text-white w-8">{Math.round((volumes.get('remote-camera') ?? 1.0) * 100)}%</span>
                                            </div>
                                            {/* Fullscreen button */}
                                            <button
                                                onClick={() => openFullscreen('remote-camera')}
                                                className="p-2 bg-black/70 hover:bg-black/90 rounded-lg transition-colors"
                                                title="Tam ekran"
                                            >
                                                <Maximize2 className="w-5 h-5 text-white" />
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    // Audio-only avatar
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900">
                                        <div className="w-32 h-32 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center mb-4">
                                            <User size={48} className="text-white" />
                                        </div>
                                        <p className="text-white text-lg font-medium">{contactName}</p>
                                        <p className="text-gray-400 text-sm">Voice call</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Local Video Thumbnail (PIP) - Hide when screen sharing OR camera is off */}
                {localStream && showVideo && !isScreenSharing && !isCameraOff && (
                    <div className="absolute bottom-4 right-4 w-48 h-36 bg-gray-800 rounded-lg overflow-hidden border-2 border-gray-700 shadow-xl">
                        <video
                            ref={(el) => setVideoStream(el, localStream)}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover mirror"
                        />
                        {isMicMuted && (
                            <div className="absolute top-2 right-2 bg-red-600 rounded-full p-1">
                                <User size={12} className="text-white" />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Call Controls */}
            <div className="p-4 flex justify-center">
                <CallControls
                    isMicMuted={isMicMuted}
                    isCameraOff={isCameraOff}
                    isScreenSharing={isScreenSharing}
                    onMicToggle={toggleMic}
                    onCameraToggle={toggleCamera}
                    onScreenShareToggle={toggleScreenShare}
                    onEndCall={endCall}
                    showCamera={isVideoCall}
                />
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
                                ref={(el) => {
                                    if (el && stream) {
                                        el.srcObject = stream;
                                        el.volume = currentVolume;
                                        el.muted = fullscreenVideoId === 'local-screen';
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
        </div>
    );
};
