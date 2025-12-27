import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { DirectCall } from '@/lib/types';
import { CallSession, CallSessionState } from '@/services/CallSession';
import { SignalingChannel } from '@/services/SignalingChannel';
import { ScreenSharePickerModal } from '@/components/modals/ScreenSharePickerModal';
import { ScreenShareQualityModal } from '@/components/modals/ScreenShareQualityModal';
import { useDeviceSettings } from './DeviceSettingsContext';

type CallStatus = 'idle' | 'ringing_outgoing' | 'ringing_incoming' | 'connecting' | 'active';

interface CallContextType {
    // State
    activeCall: DirectCall | null;
    callStatus: CallStatus;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    remoteSoundpadStream: MediaStream | null;
    screenStream: MediaStream | null;
    cameraStream: MediaStream | null;
    remoteScreenStream: MediaStream | null;
    isMicMuted: boolean;
    isDeafened: boolean;
    isCameraOff: boolean;
    isScreenSharing: boolean;
    isRemoteScreenSharing: boolean;
    remoteMicMuted: boolean;
    remoteDeafened: boolean;
    connectionState: RTCPeerConnectionState | null;
    ping: number | null;

    // Actions
    initiateCall: (contactId: string, contactName: string, callType: 'voice' | 'video') => Promise<void>;
    acceptCall: (call: DirectCall) => Promise<void>;
    rejectCall: (callId: string) => Promise<void>;
    endCall: () => Promise<void>;
    toggleMic: () => void;
    toggleDeafen: () => void;
    toggleCamera: () => Promise<void>;
    toggleScreenShare: () => Promise<void>;
    playSoundboardAudio: (audioBuffer: AudioBuffer) => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();

    // Call session ref - one session per call
    const sessionRef = useRef<CallSession | null>(null);

    // State
    const [activeCall, setActiveCall] = useState<DirectCall | null>(null);
    const [callStatus, setCallStatus] = useState<CallStatus>('idle');
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [remoteSoundpadStream, setRemoteSoundpadStream] = useState<MediaStream | null>(null);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false);
    const [remoteMicMuted, setRemoteMicMuted] = useState(false);
    const [remoteDeafened, setRemoteDeafened] = useState(false);
    const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | null>(null);
    const [ping, setPing] = useState<number | null>(null);
    const [isScreenShareModalOpen, setIsScreenShareModalOpen] = useState(false);
    const [isQualityModalOpen, setIsQualityModalOpen] = useState(false);

    const ringtoneRef = useRef<HTMLAudioElement | null>(null);

    // Initialize ringtone
    useEffect(() => {
        ringtoneRef.current = new Audio('sounds/ringtone.mp3');
        ringtoneRef.current.loop = true;
        return () => {
            if (ringtoneRef.current) {
                ringtoneRef.current.pause();
                ringtoneRef.current = null;
            }
        };
    }, []);

    // Handle ringtone playback
    useEffect(() => {
        if (!ringtoneRef.current) return;

        const shouldPlay = callStatus === 'ringing_incoming' || callStatus === 'ringing_outgoing';

        if (shouldPlay) {
            ringtoneRef.current.play().catch(e => console.error('Error playing ringtone:', e));
        } else {
            ringtoneRef.current.pause();
            ringtoneRef.current.currentTime = 0;
        }
    }, [callStatus]);

    // Poll for call stats (ping)
    useEffect(() => {
        if (callStatus !== 'active') {
            setPing(null);
            return;
        }

        const interval = setInterval(async () => {
            if (sessionRef.current) {
                const stats = await sessionRef.current.getStats();
                setPing(stats.rtt);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [callStatus]);

    // Reactive Device Switching
    const { audioInputDeviceId, videoInputDeviceId } = useDeviceSettings();

    // Handle microphone change
    useEffect(() => {
        if (callStatus === 'active' && sessionRef.current) {
            const updateTrack = async () => {
                console.log('[CallContext] Microphone change detected, replacing track');
                const newStream = await sessionRef.current?.replaceAudioTrack(audioInputDeviceId);
                if (newStream) {
                    // Create a new MediaStream instance to trigger a state change
                    // and re-initialize speaking detection in components
                    setLocalStream(new MediaStream(newStream.getTracks()));
                }
            };
            updateTrack();
        }
    }, [audioInputDeviceId, callStatus]);

    // Handle camera change
    useEffect(() => {
        if (callStatus === 'active' && sessionRef.current && !isCameraOff) {
            const updateTrack = async () => {
                console.log('[CallContext] Camera change detected, replacing track');
                const newStream = await sessionRef.current?.replaceVideoTrack(videoInputDeviceId);
                if (newStream) {
                    setCameraStream(new MediaStream(newStream.getTracks()));
                }
            };
            updateTrack();
        }
    }, [videoInputDeviceId, callStatus, isCameraOff]);

    /**
     * Map CallSession state to CallStatus
     */
    const mapSessionStateToStatus = useCallback((state: CallSessionState, role: 'caller' | 'callee'): CallStatus => {
        switch (state) {
            case 'idle':
                return 'idle';
            case 'starting':
            case 'connecting':
                return 'connecting';
            case 'ringing':
                return role === 'caller' ? 'ringing_outgoing' : 'ringing_incoming';
            case 'active':
                return 'active';
            case 'ending':
            case 'ended':
                return 'idle';
            default:
                return 'idle';
        }
    }, []);

    /**
     * Reset all call state
     */
    const resetCallState = useCallback(() => {
        console.log('[CallContext] Resetting call state');
        setActiveCall(null);
        setCallStatus('idle');
        setLocalStream(null);
        setRemoteStream(null);
        setRemoteSoundpadStream(null);
        setScreenStream(null);
        setCameraStream(null);
        setRemoteScreenStream(null);
        setIsMicMuted(false);
        setIsCameraOff(true);
        setIsScreenSharing(false);
        setIsRemoteScreenSharing(false);
        setRemoteMicMuted(false);
        setRemoteDeafened(false);
        setConnectionState(null);
        setPing(null);
        sessionRef.current = null;
    }, []);

    /**
     * Create a new CallSession with callbacks
     */
    const createSession = useCallback((callId: string, peerId: string, role: 'caller' | 'callee') => {
        if (!user) return null;

        console.log('[CallContext] Creating CallSession as', role);

        const session = new CallSession(callId, user.id, peerId, role, {
            onStateChange: (state) => {
                console.log('[CallContext] Session state:', state);
                setCallStatus(mapSessionStateToStatus(state, role));
            },
            onConnectionStateChange: (state) => {
                console.log('[CallContext] Connection state:', state);
                setConnectionState(state as RTCPeerConnectionState);
            },
            onLocalStream: (stream) => {
                console.log('[CallContext] Local stream received');
                setLocalStream(stream);
            },
            onRemoteStream: (stream) => {
                console.log('[CallContext] Remote stream received');
                setRemoteStream(new MediaStream(stream.getTracks()));
            },
            onRemoteSoundpad: (stream) => {
                console.log('[CallContext] Remote soundpad received');
                setRemoteSoundpadStream(new MediaStream(stream.getTracks()));
            },
            onRemoteScreenStream: (stream) => {
                console.log('[CallContext] Remote screen stream received');
                setRemoteScreenStream(stream);
                // Ensure we know they are sharing
                setIsRemoteScreenSharing(true);
            },
            onRemoteTrackChanged: () => {
                if (sessionRef.current) {
                    const stream = sessionRef.current.getRemoteStream();
                    if (stream) {
                        console.log('[CallContext] Remote tracks changed, updating stream');
                        setRemoteStream(new MediaStream(stream.getTracks()));
                    }
                }
            },
            onRemoteScreenShareStarted: () => {
                console.log('[CallContext] Remote screen share started');
                setIsRemoteScreenSharing(true);
            },
            onRemoteScreenShareStopped: () => {
                console.log('[CallContext] Remote screen share stopped');
                setIsRemoteScreenSharing(false);
                setRemoteScreenStream(null);
            },
            onRemoteAudioStateChanged: (isMuted, isDeafened) => {
                console.log('[CallContext] Remote audio state changed signal received:', { isMuted, isDeafened });
                setRemoteMicMuted(isMuted);
                setRemoteDeafened(isDeafened);
            },
            onCallEnded: (reason) => {
                console.log('[CallContext] Call ended:', reason);
                resetCallState();
            },
            onError: (error) => {
                console.error('[CallContext] Session error:', error);
                resetCallState();
            }
        });

        sessionRef.current = session;
        return session;
    }, [user?.id, mapSessionStateToStatus, resetCallState]);

    /**
     * Initiate a call to a contact
     */
    const initiateCall = useCallback(async (contactId: string, contactName: string, callType: 'voice' | 'video') => {
        if (!user) return;

        try {
            console.log('[CallContext] Initiating call to:', contactName);
            setCallStatus('ringing_outgoing');
            setIsCameraOff(callType === 'voice');

            // Create call record in database
            const { data: call, error: callError } = await supabase
                .from('direct_calls')
                .insert({
                    caller_id: user.id,
                    callee_id: contactId,
                    call_type: callType,
                    status: 'ringing'
                })
                .select()
                .single();

            if (callError) throw callError;

            setActiveCall(call);

            // Create and start session
            const session = createSession(call.id, contactId, 'caller');
            if (!session) throw new Error('Failed to create session');

            await session.start(callType);

        } catch (error) {
            console.error('[CallContext] Error initiating call:', error);
            resetCallState();
        }
    }, [user?.id, createSession, resetCallState]);

    /**
     * Accept an incoming call
     */
    const acceptCall = useCallback(async (call: DirectCall) => {
        if (!user) return;

        try {
            console.log('[CallContext] Accepting call:', call.id);
            setCallStatus('connecting');
            setActiveCall(call);
            setIsCameraOff(call.call_type === 'voice');

            // Update call status in database
            await supabase
                .from('direct_calls')
                .update({
                    status: 'active',
                    answered_at: new Date().toISOString()
                })
                .eq('id', call.id);

            // Create and start session
            const session = createSession(call.id, call.caller_id, 'callee');
            if (!session) throw new Error('Failed to create session');

            await session.start(call.call_type as 'voice' | 'video');

        } catch (error) {
            console.error('[CallContext] Error accepting call:', error);
            resetCallState();
        }
    }, [user?.id, createSession, resetCallState]);

    /**
     * Reject an incoming call
     */
    const rejectCall = useCallback(async (callId: string) => {
        try {
            console.log('[CallContext] Rejecting call:', callId);

            // Send rejection signal if session exists
            if (sessionRef.current) {
                await sessionRef.current.reject();
            } else if (activeCall && user) {
                // Create temporary signaling to send rejection
                const signaling = new SignalingChannel(callId, user.id, activeCall.caller_id);
                await signaling.sendCallRejected();
                await signaling.close();
            }

            // Delete the call record
            await supabase
                .from('direct_calls')
                .delete()
                .eq('id', callId);

            resetCallState();
        } catch (error) {
            console.error('[CallContext] Error rejecting call:', error);
            resetCallState();
        }
    }, [activeCall, user, resetCallState]);

    /**
     * End the active call
     */
    const endCall = useCallback(async () => {
        try {
            console.log('[CallContext] Ending call');

            if (sessionRef.current) {
                await sessionRef.current.end();
            }

            if (activeCall) {
                // Delete the call record
                await supabase
                    .from('direct_calls')
                    .delete()
                    .eq('id', activeCall.id);
            }

            resetCallState();
        } catch (error) {
            console.error('[CallContext] Error ending call:', error);
            resetCallState();
        }
    }, [activeCall, resetCallState]);

    /**
     * Toggle microphone mute
     */
    const toggleMic = useCallback(() => {
        const newMutedState = !isMicMuted;
        sessionRef.current?.setMicMuted(newMutedState);
        setIsMicMuted(newMutedState);
        // Broadcast the change
        sessionRef.current?.sendAudioState(newMutedState, isDeafened);
    }, [isMicMuted, isDeafened]);

    /**
     * Toggle deafen (mute incoming audio)
     */
    const toggleDeafen = useCallback(() => {
        const newDeafenState = !isDeafened;
        setIsDeafened(newDeafenState);
        console.log('[CallContext] Deafen toggled:', newDeafenState);

        // Usually deafen also implies muted mic, but we let the user decide.
        // Discord style: deafen => muted.
        const newMicState = newDeafenState ? true : isMicMuted;
        if (newDeafenState && !isMicMuted) {
            setIsMicMuted(true);
            sessionRef.current?.setMicMuted(true);
        }

        // Broadcast the change
        sessionRef.current?.sendAudioState(newMicState, newDeafenState);
    }, [isDeafened, isMicMuted]);

    /**
     * Toggle camera on/off (supports mid-call camera add/remove)
     */
    const toggleCamera = useCallback(async () => {
        if (!sessionRef.current) return;

        try {
            if (isCameraOff) {
                // Turn camera ON - add camera track mid-call
                console.log('[CallContext] Starting camera mid-call');
                const stream = await sessionRef.current.startCamera();
                setCameraStream(stream);
                setIsCameraOff(false);
                console.log('[CallContext] ✓ Camera started');
            } else {
                // Turn camera OFF - remove camera track
                console.log('[CallContext] Stopping camera');
                await sessionRef.current.stopCamera();
                setCameraStream(null);
                setIsCameraOff(true);
                console.log('[CallContext] ✓ Camera stopped');
            }
        } catch (error) {
            console.error('[CallContext] Error toggling camera:', error);
        }
    }, [isCameraOff]);

    /**
     * Start screen sharing with a specific stream
     */
    const startScreenShareWithStream = async (stream: MediaStream) => {
        try {
            console.log('[CallContext] Starting screen share');

            if (!sessionRef.current) {
                throw new Error('No active session');
            }

            await sessionRef.current.startScreenShare(stream);
            setIsScreenSharing(true);
            setScreenStream(stream);

            // Handle stream stop (user clicks "Stop sharing" in browser UI)
            stream.getVideoTracks()[0].onended = () => {
                toggleScreenShare();
            };

            console.log('[CallContext] ✓ Screen share started');
        } catch (error) {
            console.error('[CallContext] Error starting screen share:', error);
        }
    };

    /**
     * Toggle screen sharing
     */
    const toggleScreenShare = useCallback(async () => {
        try {
            if (isScreenSharing) {
                // Stop screen sharing
                if (sessionRef.current) {
                    await sessionRef.current.stopScreenShare();
                }
                setIsScreenSharing(false);
                setScreenStream(null);
                console.log('[CallContext] Screen sharing stopped');
            } else {
                // Check if Electron
                const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

                if (isElectron) {
                    setIsScreenShareModalOpen(true);
                } else {
                    // Web implementation - show quality picker first
                    setIsQualityModalOpen(true);
                }
            }
        } catch (error) {
            console.error('[CallContext] Error toggling screen share:', error);
        }
    }, [isScreenSharing]);

    const handleWebScreenShareSelect = async (quality: 'standard' | 'fullhd') => {
        setIsQualityModalOpen(false);
        try {
            const constraints = {
                video: {
                    width: quality === 'fullhd' ? { ideal: 1920 } : { ideal: 1280 },
                    height: quality === 'fullhd' ? { ideal: 1080 } : { ideal: 720 },
                    frameRate: quality === 'fullhd' ? { ideal: 60 } : { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };
            const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
            await startScreenShareWithStream(stream);
        } catch (error) {
            console.error('[CallContext] Error starting web screen share:', error);
        }
    };

    const handleScreenShareSelect = async (sourceId: string, withAudio: boolean, quality: 'standard' | 'fullhd') => {
        setIsScreenShareModalOpen(false);
        try {
            console.log('[CallContext] getUserMedia request - sourceId:', sourceId, 'withAudio:', withAudio, 'quality:', quality);
            const stream = await (navigator.mediaDevices as any).getUserMedia({
                audio: withAudio ? {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                    },
                    // Add modern constraints to help the audio pipeline
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                } : false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        minWidth: quality === 'fullhd' ? 1920 : 1280,
                        maxWidth: quality === 'fullhd' ? 1920 : 1280,
                        minHeight: quality === 'fullhd' ? 1080 : 720,
                        maxHeight: quality === 'fullhd' ? 1080 : 720,
                        minFrameRate: quality === 'fullhd' ? 60 : 30,
                        maxFrameRate: quality === 'fullhd' ? 60 : 30
                    }
                }
            });
            console.log('[CallContext] Got screen stream:', stream.id);
            console.log('[CallContext] Audio tracks found:', stream.getAudioTracks().length);
            stream.getAudioTracks().forEach(t => console.log('[CallContext] Audio track:', t.label, t.enabled, t.readyState));
            console.log('[CallContext] Video tracks found:', stream.getVideoTracks().length);

            await startScreenShareWithStream(stream);
        } catch (e) {
            console.error('Error getting electron screen stream:', e);
        }
    };

    // Subscribe to incoming calls
    useEffect(() => {
        if (!user) return;

        console.log('[CallContext] Setting up call subscriptions for user:', user.id);

        const channel = supabase
            .channel('call_updates')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'direct_calls',
                    filter: `callee_id=eq.${user.id}`
                },
                async (payload) => {
                    const call = payload.new as DirectCall;
                    console.log('[CallContext] Incoming call:', call);

                    // Only process if call is ringing and recent (within last 30 seconds)
                    const callAge = Date.now() - new Date(call.created_at).getTime();
                    const isRecent = callAge < 30000;

                    if (call.status === 'ringing' && isRecent) {
                        setActiveCall(call);
                        setCallStatus('ringing_incoming');

                        // Listen for call cancellation
                        const signaling = new SignalingChannel(call.id, user.id, call.caller_id);
                        await signaling.subscribe(async (signal) => {
                            if (signal.signal_type === 'call-cancelled') {
                                console.log('[CallContext] Call was cancelled by caller');
                                await signaling.close();
                                resetCallState();
                            }
                        });
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'direct_calls',
                    filter: `caller_id=eq.${user.id}`
                },
                (payload) => {
                    const call = payload.old as DirectCall;
                    console.log('[CallContext] Call deleted (as caller):', call.id);

                    if (activeCall && call.id === activeCall.id) {
                        resetCallState();
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'direct_calls',
                    filter: `callee_id=eq.${user.id}`
                },
                (payload) => {
                    const call = payload.old as DirectCall;
                    console.log('[CallContext] Call deleted (as callee):', call.id);

                    if (activeCall && call.id === activeCall.id) {
                        resetCallState();
                    }
                }
            )
            .subscribe();

        return () => {
            console.log('[CallContext] Cleaning up call subscriptions');
            channel.unsubscribe();
        };
    }, [user?.id, resetCallState]);

    // Play soundboard audio
    const playSoundboardAudio = useCallback((audioBuffer: AudioBuffer) => {
        sessionRef.current?.playSoundboardAudio(audioBuffer);
    }, []);

    const value: CallContextType = {
        activeCall,
        callStatus,
        localStream,
        remoteStream,
        remoteSoundpadStream,
        screenStream,
        cameraStream,
        remoteScreenStream,
        isMicMuted,
        isDeafened,
        isCameraOff,
        isScreenSharing,
        isRemoteScreenSharing,
        remoteMicMuted,
        remoteDeafened,
        connectionState,
        ping,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMic,
        toggleDeafen,
        toggleCamera,
        toggleScreenShare,
        playSoundboardAudio
    };

    return (
        <CallContext.Provider value={value}>
            {children}
            <ScreenSharePickerModal
                isOpen={isScreenShareModalOpen}
                onClose={() => setIsScreenShareModalOpen(false)}
                onSelect={handleScreenShareSelect}
            />
            <ScreenShareQualityModal
                isOpen={isQualityModalOpen}
                onClose={() => setIsQualityModalOpen(false)}
                onSelect={handleWebScreenShareSelect}
            />
        </CallContext.Provider>
    );
}

export function useCall() {
    const context = useContext(CallContext);
    if (context === undefined) {
        throw new Error('useCall must be used within a CallProvider');
    }
    return context;
}
