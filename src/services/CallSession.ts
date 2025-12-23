/**
 * CallSession - Main call lifecycle manager
 * 
 * This is the core orchestrator that:
 * - Creates fresh WebRTC peer and signaling channel per call
 * - Manages complete call lifecycle (init → connect → active → end)
 * - Handles all signal processing in one place
 * - Ensures proper cleanup on call end
 */

import { WebRTCPeer, PeerConnectionState } from './WebRTCPeer';
import { SignalingChannel, CallSignal } from './SignalingChannel';

export type CallRole = 'caller' | 'callee';
export type CallSessionState = 'idle' | 'starting' | 'ringing' | 'connecting' | 'active' | 'ending' | 'ended';

export interface CallSessionCallbacks {
    onStateChange: (state: CallSessionState) => void;
    onConnectionStateChange: (state: PeerConnectionState) => void;
    onLocalStream: (stream: MediaStream) => void;
    onRemoteStream: (stream: MediaStream) => void;
    onRemoteSoundpad: (stream: MediaStream) => void;
    onRemoteScreenStream: (stream: MediaStream) => void;  // New: separate screen stream
    onRemoteScreenShareStarted: () => void;
    onRemoteScreenShareStopped: () => void;
    onCallEnded: (reason: 'remote_ended' | 'remote_rejected' | 'remote_cancelled' | 'local_ended') => void;
    onError: (error: Error) => void;
}

interface PendingOffer {
    offer: RTCSessionDescriptionInit;
    timestamp: number;
}

export class CallSession {
    private callId: string;
    private localUserId: string;
    private remoteUserId: string;
    private role: CallRole;
    private state: CallSessionState = 'idle';

    private peer: WebRTCPeer | null = null;
    private signaling: SignalingChannel | null = null;
    private callbacks: CallSessionCallbacks;

    // Soundpad audio context and destination
    private audioContext: AudioContext | null = null;
    private soundpadDestination: MediaStreamAudioDestinationNode | null = null;
    private soundpadStream: MediaStream | null = null;

    // Renegotiation state
    private isProcessingOffer = false;
    private pendingOffer: PendingOffer | null = null;
    private lastProcessedOfferSdp: string | null = null;

    constructor(
        callId: string,
        localUserId: string,
        remoteUserId: string,
        role: CallRole,
        callbacks: CallSessionCallbacks
    ) {
        this.callId = callId;
        this.localUserId = localUserId;
        this.remoteUserId = remoteUserId;
        this.role = role;
        this.callbacks = callbacks;

        console.log('[CallSession] Created -', role, 'for call:', callId);
    }

    /**
     * Start the call session
     * For caller: creates offer and sends it
     * For callee: waits for offer, then creates answer
     */
    async start(callType: 'voice' | 'video' = 'voice'): Promise<void> {
        if (this.state !== 'idle') {
            console.warn('[CallSession] Cannot start - not idle, current state:', this.state);
            return;
        }

        try {
            this.setState('starting');
            console.log('[CallSession] Starting as', this.role);

            // Create soundpad audio context and stream
            await this.initSoundpadStream();

            // Create WebRTC peer
            this.peer = new WebRTCPeer({
                onRemoteStream: (stream) => {
                    console.log('[CallSession] Remote stream received');
                    this.callbacks.onRemoteStream(new MediaStream(stream.getTracks()));
                    // Fallback: if we have remote stream, we should be active
                    if (this.state === 'connecting' || this.state === 'starting' || this.state === 'ringing') {
                        console.log('[CallSession] Remote stream received - setting state to active');
                        this.setState('active');
                    }
                },
                onRemoteSoundpad: (stream) => {
                    console.log('[CallSession] Remote soundpad received');
                    this.callbacks.onRemoteSoundpad(new MediaStream(stream.getTracks()));
                },
                onRemoteVideo: (stream) => {
                    console.log('[CallSession] Remote video stream received');
                    this.callbacks.onRemoteScreenStream(new MediaStream(stream.getTracks()));
                },
                onIceCandidate: async (candidate) => {
                    if (this.signaling) {
                        await this.signaling.sendIceCandidate(candidate);
                    }
                },
                onConnectionStateChange: (state) => {
                    console.log('[CallSession] Connection state:', state);
                    this.callbacks.onConnectionStateChange(state);

                    // Set active when connected
                    if (state === 'connected' && this.state !== 'active') {
                        console.log('[CallSession] Connection established - setting state to active');
                        this.setState('active');
                    } else if (state === 'failed' || state === 'disconnected') {
                        // Connection lost - might recover or need to end
                        console.warn('[CallSession] Connection issue:', state);
                    }
                },
                onNegotiationNeeded: async () => {
                    // Only handle if we're already connected (renegotiation)
                    if (this.state === 'active' && this.signaling) {
                        console.log('[CallSession] Renegotiation needed - sending offer');
                        await this.sendOffer();
                    }
                }
            });

            // Get local media
            let localStream = await this.peer.getUserMedia(true, callType === 'video');

            // Apply noise suppression if available
            try {
                const { createNoiseSuppressionProcessor } = await import('@/utils/NoiseSuppression');
                const processor = await createNoiseSuppressionProcessor(localStream);
                localStream = processor.outputStream;
                console.log('[CallSession] Noise suppression applied');
            } catch (e) {
                console.log('[CallSession] Noise suppression not available');
            }

            this.callbacks.onLocalStream(localStream);

            // Add streams to peer connection
            this.peer.addLocalStream(localStream);
            if (this.soundpadStream) {
                this.peer.addSoundpadStream(this.soundpadStream);
            }

            // Create signaling channel
            this.signaling = new SignalingChannel(this.callId, this.localUserId, this.remoteUserId);

            // Subscribe to signals and handle them
            await this.signaling.subscribe(this.handleSignal.bind(this));

            if (this.role === 'caller') {
                // Caller sends offer after signaling is ready
                this.setState('ringing');
                await this.sendOffer();
            } else {
                // Callee waits for offer (will be processed in handleSignal)
                this.setState('connecting');
            }

        } catch (error) {
            console.error('[CallSession] Start error:', error);
            this.callbacks.onError(error as Error);
            await this.cleanup();
        }
    }

    /**
     * Handle incoming signal
     */
    private async handleSignal(signal: CallSignal): Promise<void> {
        console.log('[CallSession] Handling signal:', signal.signal_type);

        try {
            switch (signal.signal_type) {
                case 'offer':
                    await this.handleOffer(signal.payload as RTCSessionDescriptionInit);
                    break;

                case 'answer':
                    await this.handleAnswer(signal.payload as RTCSessionDescriptionInit);
                    break;

                case 'ice-candidate':
                    if (this.peer) {
                        await this.peer.addIceCandidate(signal.payload as RTCIceCandidateInit);
                    }
                    break;

                case 'call-ended':
                    console.log('[CallSession] Remote ended the call');
                    await this.handleRemoteEnd('remote_ended');
                    break;

                case 'call-rejected':
                    console.log('[CallSession] Call was rejected');
                    await this.handleRemoteEnd('remote_rejected');
                    break;

                case 'call-cancelled':
                    console.log('[CallSession] Call was cancelled');
                    await this.handleRemoteEnd('remote_cancelled');
                    break;

                case 'screen-share-started':
                    console.log('[CallSession] Remote started screen sharing');
                    this.callbacks.onRemoteScreenShareStarted();
                    break;

                case 'screen-share-stopped':
                    console.log('[CallSession] Remote stopped screen sharing');
                    this.callbacks.onRemoteScreenShareStopped();
                    break;
            }
        } catch (error) {
            console.error('[CallSession] Error handling signal:', error);
        }
    }

    /**
     * Handle incoming offer (as callee or for renegotiation)
     */
    private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
        if (!this.peer) {
            console.error('[CallSession] Cannot handle offer - no peer');
            return;
        }

        // Deduplicate offers
        if (this.lastProcessedOfferSdp === offer.sdp) {
            console.log('[CallSession] Ignoring duplicate offer');
            return;
        }

        // Queue if already processing
        if (this.isProcessingOffer) {
            console.log('[CallSession] Queueing offer (already processing)');
            this.pendingOffer = { offer, timestamp: Date.now() };
            return;
        }

        this.isProcessingOffer = true;

        try {
            // Wait for stable state if needed
            const signalingState = this.peer.getSignalingState();
            if (signalingState !== 'stable') {
                console.log('[CallSession] Waiting for stable state, current:', signalingState);
                await this.waitForStableState();
            }

            this.lastProcessedOfferSdp = offer.sdp ?? null;

            await this.peer.setRemoteDescription(offer);
            const answer = await this.peer.createAnswer();

            if (this.signaling) {
                await this.signaling.sendAnswer(answer);
            }

            console.log('[CallSession] ✓ Offer processed, answer sent');

        } finally {
            this.isProcessingOffer = false;

            // Process pending offer if any
            if (this.pendingOffer) {
                const pending = this.pendingOffer;
                this.pendingOffer = null;
                console.log('[CallSession] Processing pending offer');
                await this.handleOffer(pending.offer);
            }
        }
    }

    /**
     * Handle incoming answer (as caller)
     */
    private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
        if (!this.peer) {
            console.error('[CallSession] Cannot handle answer - no peer');
            return;
        }

        console.log('[CallSession] Processing answer');
        await this.peer.setRemoteDescription(answer);
        console.log('[CallSession] ✓ Answer processed');
    }

    /**
     * Handle remote ending the call
     */
    private async handleRemoteEnd(reason: 'remote_ended' | 'remote_rejected' | 'remote_cancelled'): Promise<void> {
        if (this.state === 'ended' || this.state === 'ending') {
            return;
        }

        this.setState('ending');
        this.callbacks.onCallEnded(reason);
        await this.cleanup();
        this.setState('ended');
    }

    /**
     * Send offer to remote peer
     */
    private async sendOffer(): Promise<void> {
        if (!this.peer || !this.signaling) {
            console.error('[CallSession] Cannot send offer - missing peer or signaling');
            return;
        }

        const offer = await this.peer.createOffer();
        await this.signaling.sendOffer(offer);
        console.log('[CallSession] ✓ Offer sent');
    }

    /**
     * Wait for signaling state to become stable
     */
    private async waitForStableState(timeoutMs: number = 2000): Promise<void> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const state = this.peer?.getSignalingState();
            if (state === 'stable') {
                return;
            }
            await new Promise(r => setTimeout(r, 50));
        }

        console.warn('[CallSession] Timeout waiting for stable state');
    }

    /**
     * Initialize soundpad audio stream
     */
    private async initSoundpadStream(): Promise<void> {
        try {
            if (!this.audioContext || this.audioContext.state === 'closed') {
                this.audioContext = new AudioContext();
            }

            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            this.soundpadDestination = this.audioContext.createMediaStreamDestination();
            this.soundpadStream = this.soundpadDestination.stream;
            console.log('[CallSession] Soundpad stream initialized');
        } catch (e) {
            console.error('[CallSession] Error initializing soundpad:', e);
        }
    }

    /**
     * Play soundboard audio - plays locally and sends to remote
     */
    playSoundboardAudio(audioBuffer: AudioBuffer): void {
        if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = new AudioContext();
        }

        const ctx = this.audioContext;
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        // Play locally
        const localSource = ctx.createBufferSource();
        localSource.buffer = audioBuffer;
        localSource.connect(ctx.destination);
        localSource.start();

        // Send to remote via soundpad track
        if (this.soundpadDestination) {
            const remoteSource = ctx.createBufferSource();
            remoteSource.buffer = audioBuffer;
            const gain = ctx.createGain();
            gain.gain.value = 1.5;
            remoteSource.connect(gain);
            gain.connect(this.soundpadDestination);
            remoteSource.start();
            console.log('[CallSession] Soundboard sent to remote');
        }
    }

    /**
     * Toggle microphone mute
     */
    setMicMuted(muted: boolean): void {
        this.peer?.setMicMuted(muted);
    }

    /**
     * Toggle camera
     */
    setCameraEnabled(enabled: boolean): void {
        this.peer?.setCameraEnabled(enabled);
    }

    /**
     * Start camera mid-call
     * Returns the camera stream for local preview
     */
    async startCamera(): Promise<MediaStream> {
        if (!this.peer || !this.signaling) {
            throw new Error('Cannot start camera - not connected');
        }

        console.log('[CallSession] Starting camera mid-call');

        const cameraStream = await this.peer.startCamera();

        // Renegotiate to add the new track
        await this.sendOffer();

        console.log('[CallSession] ✓ Camera started and renegotiated');
        return cameraStream;
    }

    /**
     * Replace audio track mid-call
     */
    async replaceAudioTrack(deviceId: string): Promise<void> {
        if (!this.peer) return;
        await this.peer.replaceAudioTrack(deviceId);
    }

    /**
     * Replace video track mid-call
     */
    async replaceVideoTrack(deviceId: string): Promise<void> {
        if (!this.peer) return;
        await this.peer.replaceVideoTrack(deviceId);
    }

    /**
     * Stop camera mid-call
     */
    async stopCamera(): Promise<void> {
        if (!this.peer || !this.signaling) {
            return;
        }

        console.log('[CallSession] Stopping camera');

        await this.peer.stopCamera();

        // Renegotiate to remove the track
        await this.sendOffer();

        console.log('[CallSession] ✓ Camera stopped');
    }

    /**
     * Start screen sharing
     */
    async startScreenShare(stream: MediaStream): Promise<void> {
        if (!this.peer || !this.signaling) {
            throw new Error('Cannot start screen share - not connected');
        }

        console.log('[CallSession] Starting screen share');

        await this.peer.startScreenShare(stream);

        // Send signal first so remote is ready for tracks
        await this.signaling.sendScreenShareStarted();

        // Then negotiate tracks
        await this.sendOffer();

        console.log('[CallSession] ✓ Screen share started and signaled');
    }

    /**
     * Stop screen sharing
     */
    async stopScreenShare(): Promise<void> {
        if (!this.peer || !this.signaling) {
            return;
        }

        console.log('[CallSession] Stopping screen share');

        await this.peer.stopScreenShare();
        // Send signal first
        await this.signaling.sendScreenShareStopped();

        // Then negotiate to remove tracks
        await this.sendOffer();

        console.log('[CallSession] ✓ Screen share stopped');
    }

    /**
     * End the call locally
     */
    async end(): Promise<void> {
        if (this.state === 'ended' || this.state === 'ending') {
            return;
        }

        console.log('[CallSession] Ending call');
        this.setState('ending');

        // Send appropriate end signal based on state
        if (this.signaling) {
            try {
                if (this.state === 'ringing' && this.role === 'caller') {
                    await this.signaling.sendCallCancelled();
                } else {
                    await this.signaling.sendCallEnded();
                }
                // Wait for signal to be delivered
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                console.error('[CallSession] Error sending end signal:', e);
            }
        }

        this.callbacks.onCallEnded('local_ended');
        await this.cleanup();
        this.setState('ended');
    }

    /**
     * Reject an incoming call (callee only)
     */
    async reject(): Promise<void> {
        if (this.role !== 'callee') {
            console.warn('[CallSession] Only callee can reject');
            return;
        }

        console.log('[CallSession] Rejecting call');

        if (this.signaling) {
            await this.signaling.sendCallRejected();
        }

        await this.cleanup();
        this.setState('ended');
    }

    /**
     * Cleanup all resources
     */
    private async cleanup(): Promise<void> {
        console.log('[CallSession] Cleaning up');

        this.peer?.close();
        this.peer = null;

        await this.signaling?.close();
        this.signaling = null;

        if (this.audioContext && this.audioContext.state !== 'closed') {
            await this.audioContext.close();
        }
        this.audioContext = null;
        this.soundpadDestination = null;
        this.soundpadStream = null;

        this.isProcessingOffer = false;
        this.pendingOffer = null;
        this.lastProcessedOfferSdp = null;

        console.log('[CallSession] ✓ Cleanup complete');
    }

    /**
     * Set session state
     */
    private setState(state: CallSessionState): void {
        console.log('[CallSession] State:', this.state, '->', state);
        this.state = state;
        this.callbacks.onStateChange(state);
    }

    /**
     * Get current state
     */
    getState(): CallSessionState {
        return this.state;
    }

    /**
     * Get call statistics
     */
    async getStats(): Promise<{ rtt: number | null }> {
        return this.peer?.getStats() ?? { rtt: null };
    }

    /**
     * Get local stream
     */
    getLocalStream(): MediaStream | null {
        return this.peer?.getLocalStream() ?? null;
    }

    /**
     * Get remote stream
     */
    getRemoteStream(): MediaStream | null {
        return this.peer?.getRemoteStream() ?? null;
    }
}
