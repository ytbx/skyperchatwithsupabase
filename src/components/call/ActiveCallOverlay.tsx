import React, { useEffect, useRef, useState } from 'react';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { CallControls } from './CallControls';
import { User, Wifi, WifiOff, Maximize2, X, Volume2, MicOff } from 'lucide-react';

export const ActiveCallOverlay: React.FC = () => {
    const { user } = useAuth();
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
        remoteScreenStream,
        playSoundboardAudio
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

    const remoteScreenVideoRef = useRef<HTMLVideoElement | null>(null);
    const localScreenVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteCameraVideoRef = useRef<HTMLVideoElement | null>(null);
    const remoteAudioContextRef = useRef<AudioContext | null>(null);
    const localAudioContextRef = useRef<AudioContext | null>(null);
    const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
    const localAnalyserRef = useRef<AnalyserNode | null>(null);

    // Fetch contact name and profile images from activeCall
    useEffect(() => {
        const fetchContactInfo = async () => {
            if (!activeCall || !user) return;

            // Determine who the other person is
            const contactId = activeCall.caller_id === user.id ? activeCall.callee_id : activeCall.caller_id;

            // Fetch their profile
            const { data: profile } = await supabase
                .from('profiles')
                .select('username, profile_image_url')
                .eq('id', contactId)
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


    // Helper to set video stream - handles race conditions with play
    const setVideoStream = async (el: HTMLVideoElement | null, stream: MediaStream | null, videoId?: string) => {
        if (el && stream) {
            // Only update if stream changed
            if (el.srcObject !== stream) {
                console.log('[ActiveCallOverlay] Setting stream to video element');
                // Pause any existing playback first
                el.pause();
                el.srcObject = stream;
                if (videoId) {
                    el.volume = volumes.get(videoId) ?? 1.0;
                }
                // Wait a frame before playing
                await new Promise(resolve => requestAnimationFrame(resolve));
                try {
                    await el.play();
                } catch (e: any) {
                    // Ignore AbortError as it just means play was interrupted by another play
                    if (e.name !== 'AbortError') {
                        console.error('Error playing video:', e);
                    }
                }
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

    // Separate video display logic for each participant
    const showRemoteVideo = (isVideoCall && remoteStream) || isRemoteScreenSharing;
    const showLocalVideo = (isVideoCall && !isCameraOff) || isScreenSharing;

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
                <div className="w-full h-full flex items-center justify-center p-6 gap-6">
                    {/* Remote Participant Box */}
                    <div className="flex-1 max-w-[45%] flex flex-col items-center justify-center transition-all duration-300 ease-in-out">
                        <div className={`relative w-full aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl overflow-hidden shadow-2xl transition-all duration-300 ${isRemoteSpeaking ? 'ring-4 ring-green-500 shadow-green-500/50' : 'border-2 border-gray-700'
                            }`}>
                            {/* Remote Screen Share or Camera */}
                            {isRemoteScreenSharing && remoteScreenStream ? (
                                <>
                                    <video
                                        ref={(el) => {
                                            remoteScreenVideoRef.current = el;
                                            setVideoStream(el, remoteScreenStream, 'remote-screen');
                                        }}
                                        autoPlay
                                        playsInline
                                        className="w-full h-full object-contain bg-black"
                                    />
                                    {/* Fullscreen button */}
                                    <button
                                        onClick={() => openFullscreen('remote-screen')}
                                        className="absolute top-3 right-3 p-2 bg-black/70 hover:bg-black/90 rounded-lg transition-colors opacity-0 hover:opacity-100 group-hover:opacity-100"
                                        title="Tam ekran"
                                    >
                                        <Maximize2 className="w-4 h-4 text-white" />
                                    </button>
                                </>
                            ) : showRemoteVideo && remoteStream ? (
                                <>
                                    <video
                                        ref={(el) => {
                                            remoteCameraVideoRef.current = el;
                                            setVideoStream(el, remoteStream, 'remote-camera');
                                        }}
                                        autoPlay
                                        playsInline
                                        className="w-full h-full object-cover"
                                    />
                                    {/* Fullscreen button */}
                                    <button
                                        onClick={() => openFullscreen('remote-camera')}
                                        className="absolute top-3 right-3 p-2 bg-black/70 hover:bg-black/90 rounded-lg transition-colors opacity-0 hover:opacity-100 group-hover:opacity-100"
                                        title="Tam ekran"
                                    >
                                        <Maximize2 className="w-4 h-4 text-white" />
                                    </button>
                                </>
                            ) : (
                                // Avatar/Initial
                                <div className="w-full h-full flex flex-col items-center justify-center">
                                    {contactProfileImageUrl ? (
                                        <img
                                            src={contactProfileImageUrl}
                                            alt={contactName}
                                            className="w-32 h-32 rounded-full object-cover border-4 border-gray-700"
                                        />
                                    ) : (
                                        <div className="w-32 h-32 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center border-4 border-gray-700">
                                            <span className="text-5xl font-bold text-white">
                                                {contactName.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                    )}
                                    <p className="text-white text-xl font-semibold mt-4">{contactName}</p>
                                </div>
                            )}

                            {/* Mic Muted Indicator */}
                            {remoteMicMuted && (
                                <div className="absolute bottom-3 right-3 bg-red-600 rounded-full p-2 shadow-lg">
                                    <MicOff size={16} className="text-white" />
                                </div>
                            )}

                            {/* Name Label */}
                            <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                                <p className="text-white text-sm font-medium">{contactName}</p>
                            </div>
                        </div>
                    </div>

                    {/* Local Participant Box */}
                    <div className="flex-1 max-w-[45%] flex flex-col items-center justify-center transition-all duration-300 ease-in-out">
                        <div className={`relative w-full aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl overflow-hidden shadow-2xl transition-all duration-300 ${isLocalSpeaking ? 'ring-4 ring-green-500 shadow-green-500/50' : 'border-2 border-gray-700'
                            }`}>
                            {/* Local Screen Share or Camera */}
                            {isScreenSharing && screenStream ? (
                                <>
                                    <video
                                        ref={(el) => {
                                            localScreenVideoRef.current = el;
                                            setVideoStream(el, screenStream, 'local-screen');
                                        }}
                                        autoPlay
                                        playsInline
                                        muted
                                        className="w-full h-full object-contain bg-black"
                                    />
                                    {/* Fullscreen button */}
                                    <button
                                        onClick={() => openFullscreen('local-screen')}
                                        className="absolute top-3 right-3 p-2 bg-black/70 hover:bg-black/90 rounded-lg transition-colors opacity-0 hover:opacity-100 group-hover:opacity-100"
                                        title="Tam ekran"
                                    >
                                        <Maximize2 className="w-4 h-4 text-white" />
                                    </button>
                                </>
                            ) : showLocalVideo && localStream && !isCameraOff ? (
                                <video
                                    ref={(el) => setVideoStream(el, localStream)}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover mirror"
                                />
                            ) : (
                                // Avatar/Initial
                                <div className="w-full h-full flex flex-col items-center justify-center">
                                    {localProfileImageUrl ? (
                                        <img
                                            src={localProfileImageUrl}
                                            alt="You"
                                            className="w-32 h-32 rounded-full object-cover border-4 border-gray-700"
                                        />
                                    ) : (
                                        <div className="w-32 h-32 bg-gradient-to-br from-green-600 to-teal-600 rounded-full flex items-center justify-center border-4 border-gray-700">
                                            <User size={48} className="text-white" />
                                        </div>
                                    )}
                                    <p className="text-white text-xl font-semibold mt-4">Siz</p>
                                </div>
                            )}

                            {/* Mic Muted Indicator */}
                            {isMicMuted && (
                                <div className="absolute bottom-3 right-3 bg-red-600 rounded-full p-2 shadow-lg">
                                    <MicOff size={16} className="text-white" />
                                </div>
                            )}

                            {/* Name Label */}
                            <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                                <p className="text-white text-sm font-medium">Siz</p>
                            </div>
                        </div>
                    </div>
                </div>

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
                    showScreenShare={true}
                    onPlaySound={playSoundboardAudio}
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
                                        // Only set srcObject if it's different to prevent flickering
                                        if (el.srcObject !== stream) {
                                            el.srcObject = stream;
                                            el.muted = fullscreenVideoId === 'local-screen';
                                            el.play().catch(e => console.error('Error playing video:', e));
                                        }
                                        // Always update volume
                                        el.volume = currentVolume;
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
