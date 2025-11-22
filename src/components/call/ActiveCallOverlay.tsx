import React, { useEffect, useRef, useState } from 'react';
import { useCall } from '@/contexts/CallContext';
import { CallControls } from './CallControls';
import { User, Wifi, WifiOff } from 'lucide-react';

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
        screenStream
    } = useCall();

    const [callDuration, setCallDuration] = useState(0);

    // Helper to set video stream
    const setVideoStream = (el: HTMLVideoElement | null, stream: MediaStream | null) => {
        if (el && stream) {
            if (el.srcObject !== stream) {
                console.log('[ActiveCallOverlay] Setting stream to video element');
                el.srcObject = stream;
                el.play().catch(e => console.error('Error playing video:', e));
            }
        }
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
    const isBidirectionalScreenShare = isScreenSharing && screenStream && remoteStream && isRemoteScreenSharing;

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
                <audio
                    ref={(el) => {
                        if (el && remoteStream) {
                            if (el.srcObject !== remoteStream) {
                                el.srcObject = remoteStream;
                                el.play().catch(e => console.error('Error playing remote audio:', e));
                            }
                        }
                    }}
                    autoPlay
                    playsInline
                />

                <div className="w-full h-full flex items-center justify-center p-4">
                    {isBidirectionalScreenShare ? (
                        // Case 1: Bidirectional Screen Share (Split View)
                        <div className="w-full h-full flex space-x-4">
                            <div className="flex-1 flex flex-col items-center justify-center">
                                <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-xl border border-gray-800">
                                    <video
                                        ref={(el) => setVideoStream(el, screenStream)}
                                        autoPlay
                                        playsInline
                                        muted
                                        className="w-full h-full object-contain bg-gray-900"
                                    />
                                    <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs text-white">
                                        Sizin Ekranınız
                                    </div>
                                </div>
                            </div>
                            <div className="flex-1 flex flex-col items-center justify-center">
                                <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-xl border border-gray-800">
                                    <video
                                        ref={(el) => setVideoStream(el, remoteStream)}
                                        autoPlay
                                        playsInline
                                        className="w-full h-full object-contain bg-gray-900"
                                    />
                                    <div className="absolute bottom-2 left-2 bg-black/50 px-2 py-1 rounded text-xs text-white">
                                        {contactName}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Case 2: Single View
                        (remoteStream || (isScreenSharing && screenStream)) ? (
                            <div className="relative w-full max-w-4xl aspect-video bg-black rounded-lg overflow-hidden shadow-2xl border border-gray-800">
                                {showVideo ? (
                                    <video
                                        // If screen sharing, use local screen stream, otherwise remote stream
                                        ref={(el) => setVideoStream(el, (isScreenSharing && screenStream) ? screenStream : remoteStream)}
                                        autoPlay
                                        playsInline
                                        muted={isScreenSharing}
                                        className="w-full h-full object-contain bg-gray-900"
                                    />
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
                        ) : (
                            // Waiting state
                            <div className="text-center">
                                <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
                                <p className="text-gray-400">Waiting for {contactName}...</p>
                            </div>
                        )
                    )}
                </div>

                {/* Local Video Thumbnail (PIP) - Hide when screen sharing */}
                {localStream && showVideo && !isScreenSharing && (
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

            <style>{`
                .mirror {
                    transform: scaleX(-1);
                }
            `}</style>
        </div>
    );
};
