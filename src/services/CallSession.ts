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
import { noiseSuppressionService } from './NoiseSuppression';

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
    onRemoteCameraStarted: () => void;
    onRemoteCameraStopped: () => void;
    onRemoteTrackChanged: () => void;
    onRemoteAudioStateChanged: (isMuted: boolean, isDeafened: boolean) => void;
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

    private rawLocalStream: MediaStream | null = null;
    private isNoiseSuppressionEnabled = false;


    // Renegotiation state
    private isProcessingOffer = false;
    private pendingOffer: PendingOffer | null = null;
    private lastProcessedOfferSdp: string | null = null;

    private connectionFailedTimer: any = null;
    private offerRetryTimer: any = null;
    private offerRetryCount = 0;
    private static readonly MAX_OFFER_RETRIES = 3;

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

                        // Clear any failure timers if we recover
                        if (this.connectionFailedTimer) {
                            clearTimeout(this.connectionFailedTimer);
                            this.connectionFailedTimer = null;
                        }
                    } else if (state === 'failed') {
                        // Connection lost - provide a 10s grace period before ending
                        console.warn('[CallSession] Connection failed - starting 10s grace period');
                        if (!this.connectionFailedTimer) {
                            this.connectionFailedTimer = setTimeout(() => {
                                console.error('[CallSession] Connection recovery timed out - ending call');
                                this.handleRemoteEnd('remote_ended'); // Or local end
                            }, 10000);
                        }
                    } else if (state === 'disconnected') {
                        console.warn('[CallSession] Connection disconnected - waiting for reconnect');
                    }
                },
                onNegotiationNeeded: async () => {
                    // Only handle if we're already connected (renegotiation)
                    if (this.state === 'active' && this.signaling) {
                        console.log('[CallSession] Renegotiation needed - sending offer');
                        await this.sendOffer();
                    }
                },
                onRemoteTrackChanged: () => {
                    console.log('[CallSession] Remote tracks changed');
                    this.callbacks.onRemoteTrackChanged();
                }
            });

            // Get local media
            const rawStream = await this.peer.getUserMedia(true, callType === 'video');
            this.rawLocalStream = rawStream;

            let localStream = rawStream;
            if (this.isNoiseSuppressionEnabled) {
                console.log('[CallSession] Applying noise suppression at start');
                try {
                    localStream = await noiseSuppressionService.processStream(rawStream);
                } catch (err) {
                    console.error('[CallSession] Noise suppression failed at start:', err);
                }
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
                // Only set ringing if we haven't already moved to connecting/active via historical signals
                if ((this.state as string) === 'starting') {
                    this.setState('ringing');
                }
                await this.sendOffer();
                this.startOfferRetryTimer();
            } else {
                // Callee waits for offer (will be processed in handleSignal)
                // Only set connecting if we haven't already moved to active via historical signals
                if ((this.state as string) === 'starting') {
                    this.setState('connecting');
                }
            }
            // Riverside: added explicit cast to string to bypass narrowing



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
                    this.peer?.setExpectScreenShare(); // Signal to expect screen share track
                    this.callbacks.onRemoteScreenShareStarted();
                    break;

                case 'screen-share-stopped':
                    console.log('[CallSession] Remote stopped screen sharing');
                    this.callbacks.onRemoteScreenShareStopped();
                    break;

                case 'camera-share-started':
                    console.log('[CallSession] Remote started camera');
                    this.callbacks.onRemoteCameraStarted();
                    break;

                case 'camera-share-stopped':
                    console.log('[CallSession] Remote stopped camera');
                    this.callbacks.onRemoteCameraStopped();
                    break;

                case 'audio-state-change':
                    const { isMuted, isDeafened } = signal.payload as any;
                    console.log('[CallSession] Remote audio state changed:', { isMuted, isDeafened });
                    this.callbacks.onRemoteAudioStateChanged(isMuted, isDeafened);
                    break;
            }
        } catch (error) {
            console.error('[CallSession] Error handling signal:', signal.signal_type, error);
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
        console.log('[CallSession] ✓ Offer sent (Count:', this.offerRetryCount + 1, ')');
    }

    /**
     * Start a timer to retry sending offer if not connected
     */
    private startOfferRetryTimer(): void {
        this.stopOfferRetryTimer();

        this.offerRetryTimer = setInterval(async () => {
            if (this.state === 'active' || this.state === 'ended' || this.state === 'ending') {
                this.stopOfferRetryTimer();
                return;
            }

            if (this.offerRetryCount >= CallSession.MAX_OFFER_RETRIES) {
                console.warn('[CallSession] Max offer retries reached');
                this.stopOfferRetryTimer();
                return;
            }

            console.log('[CallSession] Offer retry timer fired - re-sending offer');
            this.offerRetryCount++;
            try {
                await this.sendOffer();
            } catch (e) {
                console.error('[CallSession] Error during offer retry:', e);
            }
        }, 5000); // Retry every 5 seconds
    }

    private stopOfferRetryTimer(): void {
        if (this.offerRetryTimer) {
            clearInterval(this.offerRetryTimer);
            this.offerRetryTimer = null;
        }
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
     * Send audio state to remote
     */
    async sendAudioState(isMuted: boolean, isDeafened: boolean): Promise<void> {
        if (this.signaling) {
            await this.signaling.sendAudioState(isMuted, isDeafened);
        }
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
        await this.signaling.sendCameraShareStarted();
        await this.sendOffer();

        console.log('[CallSession] ✓ Camera started and renegotiated');
        return cameraStream;
    }

    /**
     * Replace audio track mid-call
     */
    async replaceAudioTrack(deviceId: string): Promise<MediaStream | null> {
        if (!this.peer) return null;

        console.log('[CallSession] Replacing audio track with device:', deviceId);

        // 1. Stop old raw tracks
        if (this.rawLocalStream) {
            this.rawLocalStream.getTracks().forEach(t => t.stop());
        }


        // 2. Get new raw stream
        const rawStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
                echoCancellation: true,
                autoGainControl: true
            },
            video: false
        });
        this.rawLocalStream = rawStream;

        let finalStream = rawStream;
        if (this.isNoiseSuppressionEnabled) {
            console.log('[CallSession] Applying noise suppression to replaced track');
            try {
                finalStream = await noiseSuppressionService.processStream(rawStream);
            } catch (err) {
                console.error('[CallSession] Noise suppression failed during track replacement:', err);
            }
        }

        // 4. Update peer
        const newTrack = finalStream.getAudioTracks()[0];
        if (newTrack) {
            await this.peer.replaceAudioTrack(newTrack);
        }

        // 5. Notify UI
        this.callbacks.onLocalStream(finalStream);

        return finalStream;
    }

    /**
     * Replace video track mid-call
     */
    async replaceVideoTrack(deviceId: string): Promise<MediaStream | null> {
        if (!this.peer) return null;
        return await this.peer.replaceVideoTrack(deviceId);
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
        await this.signaling.sendCameraShareStopped();
        await this.sendOffer();

        console.log('[CallSession] ✓ Camera stopped');
    }

    /**
     * Start screen sharing
     */
    async startScreenShare(stream: MediaStream, quality: 'standard' | 'fullhd' = 'standard'): Promise<void> {
        if (!this.peer || !this.signaling) {
            throw new Error('Cannot start screen share - not connected');
        }

        console.log('[CallSession] Starting screen share with quality:', quality);

        // We use WebRTC default bitrate management now
        await this.peer.startScreenShare(stream, quality);

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

        const prevState = this.state;
        console.log('[CallSession] Ending call, previous state:', prevState);
        this.setState('ending');

        // Send appropriate end signal based on state
        if (this.signaling) {
            try {
                if ((prevState === 'ringing' || prevState === 'starting') && this.role === 'caller') {
                    await this.signaling.sendCallCancelled();
                } else {
                    await this.signaling.sendCallEnded();
                }
                // Wait for signal to be delivered before cleaning up
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

        if (this.rawLocalStream) {
            try {
                this.rawLocalStream.getTracks().forEach(t => t.stop());
            } catch (e) {
                console.warn('[CallSession] Error stopping local tracks:', e);
            }
            this.rawLocalStream = null;
        }

        if (this.connectionFailedTimer) {
            clearTimeout(this.connectionFailedTimer);
            this.connectionFailedTimer = null;
        }

        this.isProcessingOffer = false;
        this.pendingOffer = null;
        this.lastProcessedOfferSdp = null;
        this.stopOfferRetryTimer();
        this.offerRetryCount = 0;

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

    async setNoiseSuppression(enabled: boolean): Promise<void> {
        if (this.isNoiseSuppressionEnabled === enabled) return;
        this.isNoiseSuppressionEnabled = enabled;

        if (this.state === 'active' && this.rawLocalStream) {
            console.log('[CallSession] Noise suppression toggled to:', enabled);
            try {
                let finalStream = this.rawLocalStream;
                if (enabled) {
                    finalStream = await noiseSuppressionService.processStream(this.rawLocalStream);
                } else {
                    // Cleanup previous
                    const currentStream = this.peer?.getLocalStream();
                    if (currentStream && (currentStream as any).stopSuppression) {
                        (currentStream as any).stopSuppression();
                    }
                }

                const newTrack = finalStream.getAudioTracks()[0];
                if (newTrack && this.peer) {
                    await this.peer.replaceAudioTrack(newTrack);
                    this.callbacks.onLocalStream(finalStream);
                }
            } catch (err) {
                console.error('[CallSession] Error toggling noise suppression mid-call:', err);
            }
        }
    }

    /**
     * Get remote stream
     */
    getRemoteStream(): MediaStream | null {
        return this.peer?.getRemoteStream() ?? null;
    }
}
