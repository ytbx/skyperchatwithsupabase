import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';
import { DirectCall } from '@/lib/types';
import { WebRTCManager } from '@/services/WebRTCManager';
import { SignalingService } from '@/services/SignalingService';
import { ScreenSharePickerModal } from '@/components/modals/ScreenSharePickerModal';

type CallStatus = 'idle' | 'ringing_outgoing' | 'ringing_incoming' | 'connecting' | 'active';

interface CallContextType {
    // State
    activeCall: DirectCall | null;
    callStatus: CallStatus;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    screenStream: MediaStream | null;
    remoteScreenStream: MediaStream | null;
    isMicMuted: boolean;
    isCameraOff: boolean;
    isScreenSharing: boolean;
    isRemoteScreenSharing: boolean;
    connectionState: RTCPeerConnectionState | null;

    // Actions
    initiateCall: (contactId: string, contactName: string, callType: 'voice' | 'video') => Promise<void>;
    acceptCall: (call: DirectCall) => Promise<void>;
    rejectCall: (callId: string) => Promise<void>;
    endCall: () => Promise<void>;
    toggleMic: () => void;
    toggleCamera: () => void;
    toggleScreenShare: () => Promise<void>;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function CallProvider({ children }: { children: ReactNode }) {

    // Services
    const [webrtcManager] = useState(() => new WebRTCManager());
    const [signalingService, setSignalingService] = useState<SignalingService | null>(null);

    const { user } = useAuth();

    // State
    const [activeCall, setActiveCall] = useState<DirectCall | null>(null);
    const [callStatus, setCallStatus] = useState<CallStatus>('idle');
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isCameraOff, setIsCameraOff] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false);
    const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | null>(null);
    const [isScreenShareModalOpen, setIsScreenShareModalOpen] = useState(false);

    /**
     * Initiate a call to a contact
     */
    const initiateCall = useCallback(async (contactId: string, contactName: string, callType: 'voice' | 'video') => {
        if (!user) return;

        try {
            console.log('[CallContext] Initiating call to:', contactName);
            setCallStatus('ringing_outgoing');

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

            // Get user media
            const stream = await webrtcManager.getUserMedia(true, callType === 'video');
            setLocalStream(stream);
            setIsCameraOff(callType === 'voice');

            // Initialize signaling
            const signaling = new SignalingService(call.id, user.id, contactId);
            setSignalingService(signaling);

            // Create peer connection
            webrtcManager.createPeerConnection(
                (remoteStream) => {
                    console.log('[CallContext] Remote stream received');
                    // Create a new MediaStream reference to ensure React re-renders
                    setRemoteStream(new MediaStream(remoteStream.getTracks()));
                },
                async (candidate) => {
                    await signaling.sendICECandidate(candidate);
                },
                (state) => {
                    setConnectionState(state);
                    if (state === 'connected') {
                        setCallStatus('active');
                    }
                },
                async () => {
                    // Handle renegotiation
                    console.log('[CallContext] Renegotiation needed - creating new offer');
                    const offer = await webrtcManager.createOffer();
                    await signaling.sendOffer(offer);
                },
                (screenStream) => {
                    console.log('[CallContext] Remote screen stream received');
                    setRemoteScreenStream(new MediaStream(screenStream.getTracks()));
                }
            );

            // Add local stream
            webrtcManager.addLocalStream(stream);

            // Queue for ICE candidates that arrive before answer
            const pendingIceCandidates: RTCIceCandidateInit[] = [];
            let remoteDescriptionSet = false;

            // Initialize signaling and handle incoming signals
            await signaling.initialize(async (signal) => {
                if (signal.signal_type === 'answer') {
                    await webrtcManager.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
                    remoteDescriptionSet = true;

                    // Add any pending ICE candidates
                    console.log('[CallContext] Processing', pendingIceCandidates.length, 'pending ICE candidates');
                    for (const candidate of pendingIceCandidates) {
                        await webrtcManager.addICECandidate(candidate);
                    }
                    pendingIceCandidates.length = 0; // Clear queue
                } else if (signal.signal_type === 'ice-candidate') {
                    if (remoteDescriptionSet) {
                        // Remote description is set, add immediately
                        await webrtcManager.addICECandidate(signal.payload as RTCIceCandidateInit);
                    } else {
                        // Queue for later
                        console.log('[CallContext] Queueing ICE candidate until answer arrives');
                        pendingIceCandidates.push(signal.payload as RTCIceCandidateInit);
                    }
                } else if (signal.signal_type === 'offer') {
                    // Handle renegotiation offer from peer (e.g., peer started screen sharing)
                    console.log('[CallContext] Received renegotiation offer from peer');
                    await webrtcManager.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
                    const answer = await webrtcManager.createAnswer();
                    await signaling.sendAnswer(answer);
                } else if (signal.signal_type === 'screen-share-started') {
                    console.log('[CallContext] Peer started screen sharing');
                    setIsRemoteScreenSharing(true);
                    // Force update remote stream to ensure UI updates
                    const currentRemoteStream = webrtcManager.getRemoteStream();
                    if (currentRemoteStream) {
                        console.log('[CallContext] Force updating remote stream for screen share start');
                        setRemoteStream(new MediaStream(currentRemoteStream.getTracks()));
                    }
                } else if (signal.signal_type === 'screen-share-stopped') {
                    console.log('[CallContext] Peer stopped screen sharing');
                    setIsRemoteScreenSharing(false);
                    // Force update remote stream to ensure UI updates
                    const currentRemoteStream = webrtcManager.getRemoteStream();
                    if (currentRemoteStream) {
                        console.log('[CallContext] Force updating remote stream for screen share stop');
                        setRemoteStream(new MediaStream(currentRemoteStream.getTracks()));
                    }
                } else if (signal.signal_type === 'call-rejected') {
                    console.log('[CallContext] ========== RECEIVED CALL-REJECTED SIGNAL (CALLER) ==========');
                    console.log('[CallContext] Callee rejected the call, cleaning up...');
                    // Cleanup and reset state
                    webrtcManager.cleanup();
                    await signaling.cleanup();
                    setActiveCall(null);
                    setCallStatus('idle');
                    setLocalStream(null);
                    setRemoteStream(null);
                    setIsMicMuted(false);
                    setIsCameraOff(true);
                    setIsScreenSharing(false);
                    setConnectionState(null);
                    setSignalingService(null);
                    console.log('[CallContext] ✓ Cleanup complete after receiving call-rejected');
                } else if (signal.signal_type === 'call-ended') {
                    console.log('[CallContext] ========== RECEIVED CALL-ENDED SIGNAL (CALLER) ==========');
                    console.log('[CallContext] Peer ended the call, cleaning up...');
                    // Cleanup and reset state
                    webrtcManager.cleanup();
                    await signaling.cleanup();
                    setActiveCall(null);
                    setCallStatus('idle');
                    setLocalStream(null);
                    setRemoteStream(null);
                    setIsMicMuted(false);
                    setIsCameraOff(true);
                    setIsScreenSharing(false);
                    setConnectionState(null);
                    setSignalingService(null);
                    console.log('[CallContext] ✓ Cleanup complete after receiving call-ended');
                }
            });

            // Create and send offer
            const offer = await webrtcManager.createOffer();
            await signaling.sendOffer(offer);

        } catch (error) {
            console.error('[CallContext] Error initiating call:', error);
            setCallStatus('idle');
            setActiveCall(null);
        }
    }, [user, webrtcManager]);

    /**
     * Accept an incoming call
     */
    const acceptCall = useCallback(async (call: DirectCall) => {
        if (!user) return;

        try {
            console.log('[CallContext] Accepting call:', call.id);
            setCallStatus('connecting');
            setActiveCall(call);

            // Update call status in database
            await supabase
                .from('direct_calls')
                .update({
                    status: 'active',
                    answered_at: new Date().toISOString()
                })
                .eq('id', call.id);

            // Get user media
            const stream = await webrtcManager.getUserMedia(true, call.call_type === 'video');
            setLocalStream(stream);
            setIsCameraOff(call.call_type === 'voice');

            // Use existing signaling service or create new one
            let signaling = signalingService;
            if (!signaling) {
                console.log('[CallContext] Creating new signaling service for accept');
                signaling = new SignalingService(call.id, user.id, call.caller_id);
                setSignalingService(signaling);
            } else {
                console.log('[CallContext] Reusing existing signaling service from incoming call');
            }

            // Wait for offer before creating peer connection
            let peerConnectionCreated = false;

            // Don't await - this is a callback-based subscription
            signaling.initialize(async (signal) => {
                try {
                    console.log('[CallContext] Received signal:', signal.signal_type);

                    // Create peer connection on first offer
                    if (signal.signal_type === 'offer' && !peerConnectionCreated) {
                        console.log('[CallContext] Creating peer connection for callee');
                        peerConnectionCreated = true;

                        // Create peer connection
                        webrtcManager.createPeerConnection(
                            (remoteStream) => {
                                console.log('[CallContext] Remote stream received');
                                // Create a new MediaStream reference to ensure React re-renders
                                setRemoteStream(new MediaStream(remoteStream.getTracks()));
                            },
                            async (candidate) => {
                                await signaling.sendICECandidate(candidate);
                            },
                            (state) => {
                                console.log('[CallContext] Connection state changed to:', state);
                                setConnectionState(state);
                                if (state === 'connected') {
                                    console.log('[CallContext] Setting callStatus to ACTIVE (callee)');
                                    setCallStatus('active');
                                }
                            },
                            async () => {
                                // Handle renegotiation (e.g., when screen sharing starts/stops)
                                console.log('[CallContext] Renegotiation needed - creating new offer');
                                const offer = await webrtcManager.createOffer();
                                await signaling.sendOffer(offer);
                            },
                            (screenStream) => {
                                console.log('[CallContext] Remote screen stream received (callee)');
                                setRemoteScreenStream(new MediaStream(screenStream.getTracks()));
                            }
                        );

                        // Add local stream
                        webrtcManager.addLocalStream(stream);

                        // Set remote description (offer)
                        await webrtcManager.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);

                        // Create and send answer
                        const answer = await webrtcManager.createAnswer();
                        await signaling.sendAnswer(answer);
                    } else if (signal.signal_type === 'offer' && peerConnectionCreated) {
                        // Handle renegotiation offer (e.g., peer started screen sharing)
                        console.log('[CallContext] Received renegotiation offer from peer');
                        await webrtcManager.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
                        const answer = await webrtcManager.createAnswer();
                        await signaling.sendAnswer(answer);
                    } else if (signal.signal_type === 'ice-candidate') {
                        await webrtcManager.addICECandidate(signal.payload as RTCIceCandidateInit);
                    } else if (signal.signal_type === 'screen-share-started') {
                        console.log('[CallContext] Peer started screen sharing');
                        setIsRemoteScreenSharing(true);
                        // Force update remote stream to ensure UI updates
                        const currentRemoteStream = webrtcManager.getRemoteStream();
                        if (currentRemoteStream) {
                            console.log('[CallContext] Force updating remote stream for screen share start');
                            setRemoteStream(new MediaStream(currentRemoteStream.getTracks()));
                        }
                    } else if (signal.signal_type === 'screen-share-stopped') {
                        console.log('[CallContext] Peer stopped screen sharing');
                        setIsRemoteScreenSharing(false);
                        // Force update remote stream to ensure UI updates
                        const currentRemoteStream = webrtcManager.getRemoteStream();
                        if (currentRemoteStream) {
                            console.log('[CallContext] Force updating remote stream for screen share stop');
                            setRemoteStream(new MediaStream(currentRemoteStream.getTracks()));
                        }
                    } else if (signal.signal_type === 'call-cancelled') {
                        console.log('[CallContext] ========== RECEIVED CALL-CANCELLED SIGNAL (CALLEE) ==========');
                        console.log('[CallContext] Caller cancelled the call, cleaning up...');
                        // Cleanup and reset state
                        webrtcManager.cleanup();
                        await signaling.cleanup();
                        setActiveCall(null);
                        setCallStatus('idle');
                        setLocalStream(null);
                        setRemoteStream(null);
                        setIsMicMuted(false);
                        setIsCameraOff(true);
                        setIsScreenSharing(false);
                        setConnectionState(null);
                        setSignalingService(null);
                        console.log('[CallContext] ✓ Cleanup complete after receiving call-cancelled');
                    } else if (signal.signal_type === 'call-ended') {
                        console.log('[CallContext] ========== RECEIVED CALL-ENDED SIGNAL (CALLEE) ==========');
                        console.log('[CallContext] Caller ended the call, cleaning up...');
                        // Cleanup and reset state
                        webrtcManager.cleanup();
                        await signaling.cleanup();
                        setActiveCall(null);
                        setCallStatus('idle');
                        setLocalStream(null);
                        setRemoteStream(null);
                        setIsMicMuted(false);
                        setIsCameraOff(true);
                        setIsScreenSharing(false);
                        setConnectionState(null);
                        setSignalingService(null);
                        console.log('[CallContext] ✓ Cleanup complete after receiving call-ended');
                    }
                } catch (signalError) {
                    console.error('[CallContext] Error processing signal:', signalError);
                }
            });

        } catch (error) {
            console.error('[CallContext] Error accepting call:', error);
            setCallStatus('idle');
            setActiveCall(null);
        }
    }, [user, webrtcManager]);

    /**
     * Reject an incoming call
     */
    const rejectCall = useCallback(async (callId: string) => {
        try {
            console.log('[CallContext] Rejecting call:', callId);

            // If we have an active call, send rejection signal
            if (activeCall && user) {
                try {
                    // Initialize signaling if not already done
                    let signaling = signalingService;
                    if (!signaling) {
                        signaling = new SignalingService(activeCall.id, user.id, activeCall.caller_id);
                        // We don't need to fully initialize, just send the signal
                    }
                    await signaling.sendCallRejected();
                } catch (signalError) {
                    console.error('[CallContext] Error sending rejection signal:', signalError);
                }
            }

            // Delete the call record
            await supabase
                .from('direct_calls')
                .delete()
                .eq('id', callId);

            // Cleanup if signaling was initialized
            if (signalingService) {
                await signalingService.cleanup();
            }

            setCallStatus('idle');
            setActiveCall(null);
            setSignalingService(null);
        } catch (error) {
            console.error('[CallContext] Error rejecting call:', error);
        }
    }, [activeCall, user, signalingService]);

    /**
     * End the active call
     */
    const endCall = useCallback(async () => {
        try {
            console.log('[CallContext] ========== ENDING CALL ==========');
            console.log('[CallContext] Active call:', activeCall?.id);
            console.log('[CallContext] Signaling service available:', !!signalingService);
            console.log('[CallContext] Call status:', callStatus);

            // Determine which signal to send based on call status
            const isCancelling = callStatus === 'ringing_outgoing';

            // Send appropriate signal to peer if signaling is available
            if (signalingService && activeCall) {
                try {
                    if (isCancelling) {
                        console.log('[CallContext] Sending call-cancelled signal (caller cancelling during ringing)...');
                        await signalingService.sendCallCancelled();
                        console.log('[CallContext] ✓ Call-cancelled signal sent successfully');
                    } else {
                        console.log('[CallContext] Sending call-ended signal (active call ending)...');
                        await signalingService.sendCallEnded();
                        console.log('[CallContext] ✓ Call-ended signal sent successfully');
                    }

                    // Wait a bit to ensure signal is delivered before cleanup
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (signalError) {
                    console.error('[CallContext] ✗ Error sending termination signal:', signalError);
                }
            } else {
                console.warn('[CallContext] Cannot send termination signal - signalingService:', !!signalingService, 'activeCall:', !!activeCall);
            }

            if (activeCall) {
                // Delete the call record
                console.log('[CallContext] Deleting call record from database...');
                await supabase
                    .from('direct_calls')
                    .delete()
                    .eq('id', activeCall.id);
                console.log('[CallContext] ✓ Call record deleted');
            }

            // Cleanup
            console.log('[CallContext] Starting cleanup...');
            webrtcManager.cleanup();
            if (signalingService) {
                await signalingService.cleanup();
            }

            setActiveCall(null);
            setCallStatus('idle');
            setLocalStream(null);
            setRemoteStream(null);
            setIsMicMuted(false);
            setIsCameraOff(true);
            setIsScreenSharing(false);
            setConnectionState(null);
            setSignalingService(null);
            console.log('[CallContext] ✓ Cleanup complete');
        } catch (error) {
            console.error('[CallContext] Error ending call:', error);
        }
    }, [activeCall, webrtcManager, signalingService, callStatus]);

    /**
     * Toggle microphone mute
     */
    const toggleMic = useCallback(() => {
        const newMutedState = !isMicMuted;
        webrtcManager.toggleMicrophone(newMutedState);
        setIsMicMuted(newMutedState);
    }, [isMicMuted, webrtcManager]);

    /**
     * Toggle camera on/off
     */
    const toggleCamera = useCallback(() => {
        const newCameraState = !isCameraOff;
        webrtcManager.toggleCamera(!newCameraState);
        setIsCameraOff(newCameraState);
    }, [isCameraOff, webrtcManager]);

    /**
     * Start screen sharing with a specific stream
     */
    const startScreenShareWithStream = async (stream: MediaStream) => {
        try {
            await webrtcManager.startScreenShare(stream);
            setIsScreenSharing(true);
            setScreenStream(stream);

            // Handle stream stop (user clicks "Stop sharing" in browser UI)
            stream.getVideoTracks()[0].onended = () => {
                toggleScreenShare();
            };

            // Notify peer that screen sharing started
            if (signalingService) {
                await signalingService.sendScreenShareStarted();
            }

            console.log('[CallContext] Screen sharing started, renegotiation will be triggered automatically');
        } catch (error) {
            console.error('[CallContext] Error starting screen share with stream:', error);
        }
    };

    /**
     * Toggle screen sharing
     */
    const toggleScreenShare = useCallback(async () => {
        try {
            if (isScreenSharing) {
                // Stop screen sharing
                await webrtcManager.stopScreenShare();
                setIsScreenSharing(false);
                setScreenStream(null);

                // Notify peer that screen sharing stopped
                if (signalingService) {
                    await signalingService.sendScreenShareStopped();
                }

                console.log('[CallContext] Screen sharing stopped, renegotiation will be triggered automatically');
            } else {
                // Check if Electron
                const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

                if (isElectron) {
                    setIsScreenShareModalOpen(true);
                } else {
                    // Web implementation
                    const stream = await navigator.mediaDevices.getDisplayMedia({
                        video: true,
                        audio: false
                    });
                    await startScreenShareWithStream(stream);
                }
            }
        } catch (error) {
            console.error('[CallContext] Error toggling screen share:', error);
        }
    }, [isScreenSharing, webrtcManager, signalingService]);

    const handleScreenShareSelect = async (sourceId: string) => {
        setIsScreenShareModalOpen(false);
        try {
            const stream = await (navigator.mediaDevices as any).getUserMedia({
                audio: false,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId,
                        minWidth: 1280,
                        maxWidth: 1280,
                        minHeight: 720,
                        maxHeight: 720
                    }
                }
            });
            await startScreenShareWithStream(stream);
        } catch (e) {
            console.error('Error getting electron screen stream:', e);
        }
    };

    // Subscribe to incoming calls and call status updates
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
                (payload) => {
                    const call = payload.new as DirectCall;
                    console.log('[CallContext] Incoming call:', call);

                    // Only process if call is ringing and recent (within last 30 seconds)
                    const callAge = Date.now() - new Date(call.created_at).getTime();
                    const isRecent = callAge < 30000; // 30 seconds

                    console.log('[CallContext] Call age:', callAge, 'ms, Is recent:', isRecent);

                    if (call.status === 'ringing' && isRecent) {
                        setActiveCall(call);
                        setCallStatus('ringing_incoming');

                        // Initialize signaling immediately to listen for cancellation
                        console.log('[CallContext] Initializing signaling for incoming call');
                        const signaling = new SignalingService(call.id, user.id, call.caller_id);
                        setSignalingService(signaling);

                        // Listen for call cancellation
                        signaling.initialize(async (signal) => {
                            if (signal.signal_type === 'call-cancelled') {
                                console.log('[CallContext] ========== RECEIVED CALL-CANCELLED SIGNAL (INCOMING) ==========');
                                console.log('[CallContext] Caller cancelled the call before we answered');
                                // Cleanup
                                await signaling.cleanup();
                                setActiveCall(null);
                                setCallStatus('idle');
                                setSignalingService(null);
                                console.log('[CallContext] ✓ Cleanup complete after call-cancelled');
                            }
                        });
                    } else if (!isRecent) {
                        console.log('[CallContext] Ignoring old call from', new Date(call.created_at).toLocaleTimeString());
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'direct_calls',
                    filter: `caller_id=eq.${user.id}`
                },
                (payload) => {
                    const call = payload.new as DirectCall;
                    console.log('[CallContext] Call status updated (as caller):', call.status);

                    // Handle call acceptance
                    if (call.status === 'active') {
                        console.log('[CallContext] Call accepted by callee');
                        setCallStatus('connecting');
                        setActiveCall(call);
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
                    console.log('[CallContext] Call deleted (as caller):', call.id, 'Current status:', callStatus);

                    // Cleanup if this was our active call OR if we're in any call-related state
                    const shouldCleanup = (activeCall && call.id === activeCall.id) ||
                        callStatus !== 'idle';

                    if (shouldCleanup) {
                        console.log('[CallContext] Call was deleted - cleaning up');
                        webrtcManager.cleanup();
                        if (signalingService) {
                            signalingService.cleanup();
                        }
                        setActiveCall(null);
                        setCallStatus('idle');
                        setLocalStream(null);
                        setRemoteStream(null);
                        setIsMicMuted(false);
                        setIsCameraOff(true);
                        setIsScreenSharing(false);
                        setConnectionState(null);
                        setSignalingService(null);
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'direct_calls',
                    filter: `callee_id=eq.${user.id}`
                },
                (payload) => {
                    const call = payload.new as DirectCall;
                    console.log('[CallContext] Call status updated (as callee):', call.status, 'Call ID:', call.id, 'Active Call ID:', activeCall?.id);

                    // Handle call acceptance - transition to connecting
                    if (call.status === 'active') {
                        console.log('[CallContext] Call status is active (as callee)');
                        // Don't override if already active from WebRTC connection
                        // This just confirms the database is in sync
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
                    console.log('[CallContext] Call deleted (as callee):', call.id, 'Current status:', callStatus);

                    // Cleanup if this was our active call OR if we're in any call-related state
                    const shouldCleanup = (activeCall && call.id === activeCall.id) ||
                        callStatus !== 'idle';

                    if (shouldCleanup) {
                        console.log('[CallContext] Call was deleted - cleaning up');
                        webrtcManager.cleanup();
                        if (signalingService) {
                            signalingService.cleanup();
                        }
                        setActiveCall(null);
                        setCallStatus('idle');
                        setLocalStream(null);
                        setRemoteStream(null);
                        setIsMicMuted(false);
                        setIsCameraOff(true);
                        setIsScreenSharing(false);
                        setConnectionState(null);
                        setSignalingService(null);
                    }
                }
            )
            .subscribe();

        return () => {
            console.log('[CallContext] Cleaning up call subscriptions');
            channel.unsubscribe();
        };
    }, [user?.id]); // Only re-subscribe when user changes, not on every state change

    const value: CallContextType = {
        activeCall,
        callStatus,
        localStream,
        remoteStream,
        screenStream,
        remoteScreenStream,
        isMicMuted,
        isCameraOff,
        isScreenSharing,
        isRemoteScreenSharing,
        connectionState,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMic,
        toggleCamera,
        toggleScreenShare
    };

    return (
        <CallContext.Provider value={value}>
            {children}
            <ScreenSharePickerModal
                isOpen={isScreenShareModalOpen}
                onClose={() => setIsScreenShareModalOpen(false)}
                onSelect={handleScreenShareSelect}
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
