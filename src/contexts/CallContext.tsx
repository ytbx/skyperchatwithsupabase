import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
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
    remoteSoundpadStream: MediaStream | null;  // NEW: Separate soundpad stream
    screenStream: MediaStream | null;
    remoteScreenStream: MediaStream | null;
    isMicMuted: boolean;
    isDeafened: boolean;  // Kulaklık kapalı mı (gelen sesler susturulmuş mu)
    isCameraOff: boolean;
    isScreenSharing: boolean;
    isRemoteScreenSharing: boolean;
    connectionState: RTCPeerConnectionState | null;
    ping: number | null;

    // Actions
    initiateCall: (contactId: string, contactName: string, callType: 'voice' | 'video') => Promise<void>;
    acceptCall: (call: DirectCall) => Promise<void>;
    rejectCall: (callId: string) => Promise<void>;
    endCall: () => Promise<void>;
    toggleMic: () => void;
    toggleDeafen: () => void;  // Kulaklık aç/kapa
    toggleCamera: () => void;
    toggleScreenShare: () => Promise<void>;
    playSoundboardAudio: (audioBuffer: AudioBuffer) => void;
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
    const [remoteSoundpadStream, setRemoteSoundpadStream] = useState<MediaStream | null>(null);  // NEW
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
    const [isMicMuted, setIsMicMuted] = useState(false);
    const [isDeafened, setIsDeafened] = useState(false);  // Kulaklık durumu
    const [isCameraOff, setIsCameraOff] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false);
    const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | null>(null);
    const [ping, setPing] = useState<number | null>(null);
    const [isScreenShareModalOpen, setIsScreenShareModalOpen] = useState(false);
    const ringtoneRef = useRef<HTMLAudioElement | null>(null);
    const lastProcessedOfferSdp = useRef<string | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const isProcessingOffer = useRef<boolean>(false);
    const offerQueue = useRef<RTCSessionDescriptionInit[]>([]);

    // Soundpad audio - SEPARATE TRACK for independent volume control
    const soundpadDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
    const soundpadStreamRef = useRef<MediaStream | null>(null);

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
            const stats = await webrtcManager.getCallStats();
            setPing(stats.rtt);
        }, 2000);

        return () => clearInterval(interval);
    }, [callStatus, webrtcManager]);

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
            let stream = await webrtcManager.getUserMedia(true, callType === 'video');

            // Apply noise suppression processor (can be toggled live)
            try {
                console.log('[CallContext] Creating noise suppression processor (initiateCall)');
                const { createNoiseSuppressionProcessor } = await import('@/utils/NoiseSuppression');
                const processor = await createNoiseSuppressionProcessor(stream);
                stream = processor.outputStream;
                console.log('[CallContext] Noise suppression processor created (live toggle enabled)');
            } catch (e) {
                console.log('[CallContext] Noise suppression not available:', e);
            }

            setLocalStream(stream);
            setIsCameraOff(callType === 'voice');

            // Create persistent soundpad stream for separate audio track
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new AudioContext();
            }
            const ctx = audioContextRef.current;
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }
            soundpadDestinationRef.current = ctx.createMediaStreamDestination();
            soundpadStreamRef.current = soundpadDestinationRef.current.stream;
            console.log('[CallContext] Created separate soundpad stream');

            // Initialize signaling
            const signaling = new SignalingService(call.id, user.id, contactId);
            setSignalingService(signaling);

            // Create peer connection with soundpad callback
            webrtcManager.createPeerConnection(
                (remoteStream) => {
                    console.log('[CallContext] Remote VOICE stream received');
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
                    console.log('[CallContext] ========== REMOTE SCREEN STREAM RECEIVED (CALLER) ==========');
                    console.log('[CallContext] Screen stream tracks:', screenStream.getTracks().map(t => `${t.kind}: ${t.label}`));
                    const newStream = new MediaStream(screenStream.getTracks());
                    setRemoteScreenStream(newStream);
                    // REMOVED: setIsRemoteScreenSharing(true);
                    // We now rely purely on the 'screen-share-started' signal to toggle the UI mode.
                    // This prevents race conditions where a camera track might be mistaken for a screen share.
                    console.log('[CallContext] ✓ Remote screen stream updated (waiting for signal to enable UI)');
                },
                undefined,  // onRemoteCamera (not used in direct calls)
                // NEW: Soundpad callback - separate stream
                (soundpadStream) => {
                    console.log('[CallContext] Remote SOUNDPAD stream received');
                    setRemoteSoundpadStream(new MediaStream(soundpadStream.getTracks()));
                }
            );

            // Add local stream (voice/mic) first
            webrtcManager.addLocalStream(stream);

            // Add soundpad stream second (separate track)
            if (soundpadStreamRef.current) {
                console.log('[CallContext] Adding soundpad stream to peer connection');
                webrtcManager.addSoundpadStream(soundpadStreamRef.current);
            }

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
                    const offer = signal.payload as RTCSessionDescriptionInit;
                    const offerSdp = offer.sdp;

                    // Deduplicate offers - ignore if we just processed this exact offer
                    if (lastProcessedOfferSdp.current === offerSdp) {
                        console.log('[CallContext] Ignoring duplicate offer (same SDP)');
                        return;
                    }

                    console.log('[CallContext] Received renegotiation offer from peer');

                    // If already processing an offer, queue this one
                    if (isProcessingOffer.current) {
                        console.log('[CallContext] Already processing an offer, queueing this one');
                        offerQueue.current = [offer];
                        return;
                    }

                    // Process this offer
                    const processOffer = async (offerToProcess: RTCSessionDescriptionInit) => {
                        isProcessingOffer.current = true;
                        try {
                            const signalingState = webrtcManager.getSignalingState();
                            if (signalingState !== 'stable') {
                                console.log('[CallContext] Waiting for stable state, current:', signalingState);
                                await new Promise<void>((resolve) => {
                                    const checkState = () => {
                                        const state = webrtcManager.getSignalingState();
                                        if (state === 'stable') {
                                            resolve();
                                        } else {
                                            setTimeout(checkState, 50);
                                        }
                                    };
                                    setTimeout(resolve, 2000);
                                    checkState();
                                });
                            }

                            const finalState = webrtcManager.getSignalingState();
                            if (finalState !== 'stable') {
                                console.warn('[CallContext] State not stable after waiting:', finalState);
                                return;
                            }

                            lastProcessedOfferSdp.current = offerToProcess.sdp || null;
                            await webrtcManager.setRemoteDescription(offerToProcess);
                            const answer = await webrtcManager.createAnswer();
                            await signaling.sendAnswer(answer);
                        } catch (err) {
                            console.error('[CallContext] Error processing offer:', err);
                        } finally {
                            isProcessingOffer.current = false;

                            if (offerQueue.current.length > 0) {
                                const nextOffer = offerQueue.current.shift()!;
                                console.log('[CallContext] Processing queued offer');
                                processOffer(nextOffer);
                            }
                        }
                    };

                    await processOffer(offer);
                } else if (signal.signal_type === 'screen-share-started') {
                    console.log('[CallContext] ========== PEER STARTED SCREEN SHARING ==========');
                    // Just set the flag - the video track will come through ontrack event
                    // and will be handled by onRemoteScreenCallback
                    setIsRemoteScreenSharing(true);
                    console.log('[CallContext] ✓ Screen sharing flag set, waiting for video track via ontrack');
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
            let stream = await webrtcManager.getUserMedia(true, call.call_type === 'video');

            // Apply noise suppression processor (can be toggled live)
            try {
                console.log('[CallContext] Creating noise suppression processor (acceptCall)');
                const { createNoiseSuppressionProcessor } = await import('@/utils/NoiseSuppression');
                const processor = await createNoiseSuppressionProcessor(stream);
                stream = processor.outputStream;
                console.log('[CallContext] Noise suppression processor created (live toggle enabled)');
            } catch (e) {
                console.log('[CallContext] Noise suppression not available:', e);
            }

            setLocalStream(stream);
            setIsCameraOff(call.call_type === 'voice');

            // Create persistent soundpad stream for separate audio track
            if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                audioContextRef.current = new AudioContext();
            }
            const ctx = audioContextRef.current;
            if (ctx.state === 'suspended') {
                await ctx.resume();
            }
            soundpadDestinationRef.current = ctx.createMediaStreamDestination();
            soundpadStreamRef.current = soundpadDestinationRef.current.stream;
            console.log('[CallContext] Created separate soundpad stream (callee)');

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

            // Initialize signaling for incoming signals
            await signaling.initialize(async (signal) => {
                try {
                    console.log('[CallContext] Received signal:', signal.signal_type);

                    // Create peer connection on first offer
                    if (signal.signal_type === 'offer' && !peerConnectionCreated) {
                        console.log('[CallContext] Creating peer connection for callee');
                        peerConnectionCreated = true;

                        // Create peer connection with soundpad callback
                        webrtcManager.createPeerConnection(
                            (remoteStream) => {
                                console.log('[CallContext] Remote VOICE stream received (callee)');
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
                                console.log('[CallContext] ========== REMOTE SCREEN STREAM RECEIVED (CALLEE) ==========');
                                console.log('[CallContext] Screen stream tracks:', screenStream.getTracks().map(t => `${t.kind}: ${t.label}`));
                                const newStream = new MediaStream(screenStream.getTracks());
                                setRemoteScreenStream(newStream);
                                // REMOVED: setIsRemoteScreenSharing(true);
                                // We now rely purely on the 'screen-share-started' signal to toggle the UI mode.
                                console.log('[CallContext] ✓ Remote screen stream updated (waiting for signal to enable UI)');
                            },
                            undefined,  // onRemoteCamera (not used in direct calls)
                            // NEW: Soundpad callback - separate stream
                            (soundpadStream) => {
                                console.log('[CallContext] Remote SOUNDPAD stream received (callee)');
                                setRemoteSoundpadStream(new MediaStream(soundpadStream.getTracks()));
                            }
                        );

                        // Add local stream (voice/mic) first
                        webrtcManager.addLocalStream(stream);

                        // Add soundpad stream second (separate track)
                        if (soundpadStreamRef.current) {
                            console.log('[CallContext] Adding soundpad stream to peer connection (callee)');
                            webrtcManager.addSoundpadStream(soundpadStreamRef.current);
                        }

                        // Set remote description (offer)
                        await webrtcManager.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);

                        // Create and send answer
                        const answer = await webrtcManager.createAnswer();
                        await signaling.sendAnswer(answer);
                    } else if (signal.signal_type === 'offer' && peerConnectionCreated) {
                        // Handle renegotiation offer (e.g., peer started screen sharing)
                        const offer = signal.payload as RTCSessionDescriptionInit;
                        const offerSdp = offer.sdp;

                        // Deduplicate offers - ignore if we just processed this exact offer
                        if (lastProcessedOfferSdp.current === offerSdp) {
                            console.log('[CallContext] Ignoring duplicate renegotiation offer (same SDP)');
                            return;
                        }

                        console.log('[CallContext] Received renegotiation offer from peer');

                        // If already processing an offer, queue this one
                        if (isProcessingOffer.current) {
                            console.log('[CallContext] Already processing an offer, queueing this one');
                            // Only keep the latest offer in queue (older ones are stale)
                            offerQueue.current = [offer];
                            return;
                        }

                        // Process this offer
                        const processOffer = async (offerToProcess: RTCSessionDescriptionInit) => {
                            isProcessingOffer.current = true;
                            try {
                                // Check if peer connection is in a valid state for renegotiation
                                const signalingState = webrtcManager.getSignalingState();
                                if (signalingState !== 'stable') {
                                    console.log('[CallContext] Waiting for stable state, current:', signalingState);
                                    // Wait for state to become stable
                                    await new Promise<void>((resolve) => {
                                        const checkState = () => {
                                            const state = webrtcManager.getSignalingState();
                                            if (state === 'stable') {
                                                resolve();
                                            } else {
                                                setTimeout(checkState, 50);
                                            }
                                        };
                                        // Timeout after 2 seconds
                                        setTimeout(resolve, 2000);
                                        checkState();
                                    });
                                }

                                // Double check state is still stable
                                const finalState = webrtcManager.getSignalingState();
                                if (finalState !== 'stable') {
                                    console.warn('[CallContext] State not stable after waiting:', finalState);
                                    return;
                                }

                                lastProcessedOfferSdp.current = offerToProcess.sdp || null;
                                await webrtcManager.setRemoteDescription(offerToProcess);
                                const answer = await webrtcManager.createAnswer();
                                await signaling.sendAnswer(answer);
                            } catch (err) {
                                console.error('[CallContext] Error processing offer:', err);
                            } finally {
                                isProcessingOffer.current = false;

                                // Process next offer in queue if any
                                if (offerQueue.current.length > 0) {
                                    const nextOffer = offerQueue.current.shift()!;
                                    console.log('[CallContext] Processing queued offer');
                                    processOffer(nextOffer);
                                }
                            }
                        };

                        await processOffer(offer);
                    } else if (signal.signal_type === 'ice-candidate') {
                        await webrtcManager.addICECandidate(signal.payload as RTCIceCandidateInit);
                    } else if (signal.signal_type === 'screen-share-started') {
                        console.log('[CallContext] ========== PEER STARTED SCREEN SHARING (CALLEE) ==========');
                        // Just set the flag - the video track will come through ontrack event
                        // and will be handled by onRemoteScreenCallback
                        setIsRemoteScreenSharing(true);
                        console.log('[CallContext] ✓ Screen sharing flag set, waiting for video track via ontrack');
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

                    // Wait to ensure signal is delivered before cleanup (increased for Electron)
                    await new Promise(resolve => setTimeout(resolve, 1000));
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
     * Toggle deafen (mute incoming audio / speaker)
     */
    const toggleDeafen = useCallback(() => {
        const newDeafenState = !isDeafened;
        setIsDeafened(newDeafenState);
        console.log('[CallContext] Deafen toggled:', newDeafenState);
    }, [isDeafened]);

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
            console.log('[CallContext] ========== STARTING SCREEN SHARE ==========');
            console.log('[CallContext] Screen stream tracks:', stream.getTracks().map(t => `${t.kind}: ${t.label}`));
            console.log('[CallContext] Current connection state:', connectionState);

            // Ensure connection is stable before starting screen share
            if (connectionState !== 'connected') {
                console.log('[CallContext] Waiting for connection to stabilize...');
                // Wait a bit for connection to stabilize
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            await webrtcManager.startScreenShare(stream);
            setIsScreenSharing(true);
            setScreenStream(stream);

            // Handle stream stop (user clicks "Stop sharing" in browser UI)
            stream.getVideoTracks()[0].onended = () => {
                toggleScreenShare();
            };

            // IMPORTANT: First do renegotiation to establish the video track
            // THEN notify peer that screen sharing started
            if (signalingService) {
                console.log('[CallContext] Step 1: Creating and sending renegotiation offer...');

                // Create and send offer
                const offer = await webrtcManager.createOffer();
                console.log('[CallContext] Offer created:', offer.type);
                await signalingService.sendOffer(offer);
                console.log('[CallContext] ✓ Offer sent successfully');

                // Wait longer for the offer/answer exchange to complete
                // First screen share needs more time for transceiver setup
                console.log('[CallContext] Waiting for renegotiation to complete...');
                await new Promise(resolve => setTimeout(resolve, 1500));

                // Check signaling state - if still negotiating, wait more
                const signalingState = webrtcManager.getSignalingState();
                console.log('[CallContext] Signaling state after wait:', signalingState);

                if (signalingState === 'have-local-offer') {
                    console.log('[CallContext] Still waiting for answer, waiting more...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

                console.log('[CallContext] Step 2: Sending screen-share-started signal...');
                await signalingService.sendScreenShareStarted();
                console.log('[CallContext] ✓ Screen-share-started signal sent');
            }

            console.log('[CallContext] ========== SCREEN SHARE STARTED SUCCESSFULLY ==========');
        } catch (error) {
            console.error('[CallContext] ✗ Error starting screen share with stream:', error);
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

                    // Manual renegotiation to ensure video track is removed/restored
                    console.log('[CallContext] Triggering manual renegotiation for screen share stop');
                    const offer = await webrtcManager.createOffer();
                    await signalingService.sendOffer(offer);
                }

                console.log('[CallContext] Screen sharing stopped, manual renegotiation triggered');
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

    const handleScreenShareSelect = async (sourceId: string, withAudio: boolean) => {
        setIsScreenShareModalOpen(false);
        try {
            const stream = await (navigator.mediaDevices as any).getUserMedia({
                audio: withAudio ? {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: sourceId
                    }
                } : false,
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
                async (payload) => {
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
                        await signaling.initialize(async (signal) => {
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
                async (payload) => {
                    const call = payload.new as DirectCall;
                    console.log('[CallContext] ========== CALL STATUS UPDATED (AS CALLER) ==========');
                    console.log('[CallContext] New status:', call.status);
                    console.log('[CallContext] Call ID:', call.id);
                    console.log('[CallContext] Active call ID:', activeCall?.id);

                    // Handle call acceptance - caller needs to initiate WebRTC connection
                    if (call.status === 'active' && activeCall?.id === call.id) {
                        console.log('[CallContext] ✓ Call accepted by callee, initiating WebRTC connection...');
                        setCallStatus('connecting');
                        setActiveCall(call);

                        // Initialize signaling if not already done
                        if (!signalingService) {
                            console.log('[CallContext] Creating signaling service for caller');
                            const signaling = new SignalingService(call.id, user.id, call.callee_id);
                            setSignalingService(signaling);

                            // Create peer connection
                            webrtcManager.createPeerConnection(
                                (remoteStream) => {
                                    console.log('[CallContext] ✓ Remote stream received from callee');
                                    setRemoteStream(new MediaStream(remoteStream.getTracks()));
                                },
                                async (candidate) => {
                                    await signaling.sendICECandidate(candidate);
                                },
                                (state) => {
                                    console.log('[CallContext] Connection state:', state);
                                    setConnectionState(state);
                                    if (state === 'connected') {
                                        console.log('[CallContext] ✓ Setting callStatus to ACTIVE');
                                        setCallStatus('active');
                                    }
                                },
                                async () => {
                                    console.log('[CallContext] Renegotiation needed');
                                    const offer = await webrtcManager.createOffer();
                                    await signaling.sendOffer(offer);
                                },
                                (screenStream) => {
                                    console.log('[CallContext] ✓ Remote screen stream received');
                                    setRemoteScreenStream(new MediaStream(screenStream.getTracks()));
                                    // REMOVED: setIsRemoteScreenSharing(true);
                                    console.log('[CallContext] Remote screen stream updated');
                                }
                            );

                            // Add local stream
                            if (localStream) {
                                console.log('[CallContext] Adding local stream to peer connection');
                                webrtcManager.addLocalStream(localStream);
                            }

                            // Initialize signaling and handle incoming signals
                            await signaling.initialize(async (signal) => {
                                if (signal.signal_type === 'answer') {
                                    console.log('[CallContext] ✓ Received answer from callee');
                                    await webrtcManager.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
                                } else if (signal.signal_type === 'ice-candidate') {
                                    await webrtcManager.addICECandidate(signal.payload as RTCIceCandidateInit);
                                } else if (signal.signal_type === 'screen-share-started') {
                                    console.log('[CallContext] Callee started screen sharing');
                                    setIsRemoteScreenSharing(true);
                                } else if (signal.signal_type === 'screen-share-stopped') {
                                    console.log('[CallContext] Callee stopped screen sharing');
                                    setIsRemoteScreenSharing(false);
                                } else if (signal.signal_type === 'call-ended') {
                                    console.log('[CallContext] Callee ended the call');
                                    await endCall();
                                }
                            });

                            // Create and send offer
                            console.log('[CallContext] Creating offer...');
                            const offer = await webrtcManager.createOffer();
                            console.log('[CallContext] Sending offer to callee...');
                            await signaling.sendOffer(offer);
                            console.log('[CallContext] ✓ Offer sent successfully');
                        }
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
                async (payload) => {
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

    // Play soundboard audio - plays locally and mixes with WebRTC stream
    // Play soundboard audio - plays locally AND to separate soundpad track
    const playSoundboardAudio = useCallback((audioBuffer: AudioBuffer) => {
        console.log('[CallContext] Playing soundboard audio, duration:', audioBuffer.duration, 's');

        // Create or get audio context
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new AudioContext();
        }
        const ctx = audioContextRef.current;

        // Resume context if suspended (browser autoplay policy)
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        // Play locally through speakers
        const localSourceNode = ctx.createBufferSource();
        localSourceNode.buffer = audioBuffer;
        localSourceNode.connect(ctx.destination);
        localSourceNode.start();

        // Send to soundpad destination (separate track)
        if (soundpadDestinationRef.current) {
            console.log('[CallContext] Sending soundboard to SEPARATE soundpad track');

            // Create buffer source for WebRTC transmission
            const remoteSource = ctx.createBufferSource();
            remoteSource.buffer = audioBuffer;

            // Create gain node for volume boost
            const soundGain = ctx.createGain();
            soundGain.gain.value = 1.5; // Slightly boost soundboard volume

            // Connect: source -> gain -> soundpad destination
            remoteSource.connect(soundGain);
            soundGain.connect(soundpadDestinationRef.current);
            remoteSource.start();

            console.log('[CallContext] ✓ Soundboard audio routed to soundpad track');
        } else {
            console.log('[CallContext] No soundpad destination, playing locally only');
        }
    }, []);

    const value: CallContextType = {
        activeCall,
        callStatus,
        localStream,
        remoteStream,
        remoteSoundpadStream,  // NEW
        screenStream,
        remoteScreenStream,
        isMicMuted,
        isDeafened,
        isCameraOff,
        isScreenSharing,
        isRemoteScreenSharing,
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
