/**
 * WebRTCManager handles peer-to-peer connections for voice/video calls
 * Manages RTCPeerConnection, media streams, and ICE candidates
 */
export class WebRTCManager {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private remoteSoundpadStream: MediaStream | null = null;  // Separate soundpad stream
    private remoteScreenStream: MediaStream | null = null;    // Unified screen share stream (audio+video)
    private screenStream: MediaStream | null = null;
    private screenAudioSender: RTCRtpSender | null = null;
    private audioTrackCount: number = 0;  // Track how many audio tracks we've received

    // ICE servers configuration (using free STUN servers)
    private iceServers: RTCConfiguration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
        ]
    };

    // Callbacks
    private onRemoteStreamCallback?: (stream: MediaStream) => void;
    private onRemoteSoundpadCallback?: (stream: MediaStream) => void;  // NEW: Soundpad callback
    private onRemoteScreenCallback?: (stream: MediaStream) => void;
    private onRemoteCameraCallback?: (stream: MediaStream) => void;
    private onICECandidateCallback?: (candidate: RTCIceCandidateInit) => void;
    private onConnectionStateChangeCallback?: (state: RTCPeerConnectionState) => void;
    private onNegotiationNeededCallback?: () => void;

    /**
     * Initialize peer connection
     */
    createPeerConnection(
        onRemoteStream: (stream: MediaStream) => void,
        onICECandidate: (candidate: RTCIceCandidateInit) => void,
        onConnectionStateChange?: (state: RTCPeerConnectionState) => void,
        onNegotiationNeeded?: () => void,
        onRemoteScreen?: (stream: MediaStream) => void,
        onRemoteCamera?: (stream: MediaStream) => void,
        onRemoteSoundpad?: (stream: MediaStream) => void  // NEW: Soundpad callback
    ) {
        console.log('[WebRTCManager] Creating peer connection');

        this.onRemoteStreamCallback = onRemoteStream;
        this.onRemoteSoundpadCallback = onRemoteSoundpad;  // NEW
        this.onRemoteScreenCallback = onRemoteScreen;
        this.onRemoteCameraCallback = onRemoteCamera;
        this.onICECandidateCallback = onICECandidate;
        this.onConnectionStateChangeCallback = onConnectionStateChange;
        this.onNegotiationNeededCallback = onNegotiationNeeded;
        this.audioTrackCount = 0;  // Reset track count

        this.peerConnection = new RTCPeerConnection(this.iceServers);

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('[WebRTCManager] New ICE candidate');
                this.onICECandidateCallback?.(event.candidate.toJSON());
            }
        };

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            console.log('[WebRTCManager] ========== RECEIVED REMOTE TRACK ==========');
            console.log('[WebRTCManager] Track kind:', event.track.kind);
            console.log('[WebRTCManager] Track label:', event.track.label);
            console.log('[WebRTCManager] Track id:', event.track.id);

            const track = event.track;
            const streams = event.streams;
            const stream = streams[0];

            if (!stream) {
                console.warn('[WebRTCManager] Track received with no stream');
                return;
            }

            // CRITICAL FIX: Handle track removal to prevent black screens on restart
            stream.onremovetrack = (ev) => {
                console.log('[WebRTCManager] Track removed:', ev.track.kind, ev.track.label);

                // Clean up remoteScreenStream
                if (this.remoteScreenStream) {
                    const foundTrack = this.remoteScreenStream.getTracks().find(t => t.id === ev.track.id);
                    if (foundTrack) {
                        this.remoteScreenStream.removeTrack(foundTrack);
                        console.log('[WebRTCManager] Removed track from remoteScreenStream');
                        this.onRemoteScreenCallback?.(this.remoteScreenStream);
                    }
                }

                // Clean up remoteStream (Voice/Camera)
                if (this.remoteStream) {
                    const foundTrack = this.remoteStream.getTracks().find(t => t.id === ev.track.id);
                    if (foundTrack) {
                        this.remoteStream.removeTrack(foundTrack);
                        console.log('[WebRTCManager] Removed track from remoteStream');
                        this.onRemoteStreamCallback?.(this.remoteStream);
                    }
                }

                // Clean up remoteSoundpadStream
                if (this.remoteSoundpadStream) {
                    const foundTrack = this.remoteSoundpadStream.getTracks().find(t => t.id === ev.track.id);
                    if (foundTrack) {
                        this.remoteSoundpadStream.removeTrack(foundTrack);
                        console.log('[WebRTCManager] Removed track from remoteSoundpadStream');
                        this.onRemoteSoundpadCallback?.(this.remoteSoundpadStream);
                    }
                }
            };

            if (track.kind === 'audio') {
                console.log('[WebRTCManager] Processing audio track:', track.label, 'Stream ID:', stream.id);

                // Check if this stream has a video track (likely screen share)
                const hasVideo = stream.getVideoTracks().length > 0;

                if (hasVideo) {
                    // This is SCREEN SHARE audio
                    console.log('[WebRTCManager] Identified as SCREEN SHARE audio (associated with video)');
                    if (!this.remoteScreenStream) {
                        this.remoteScreenStream = new MediaStream();
                    }
                    if (!this.remoteScreenStream.getTracks().find(t => t.id === track.id)) {
                        this.remoteScreenStream.addTrack(track);
                    }
                    this.onRemoteScreenCallback?.(this.remoteScreenStream);
                } else {
                    this.audioTrackCount++;

                    if (this.audioTrackCount === 1) {
                        console.log('[WebRTCManager] Identified as VOICE audio');
                        if (!this.remoteStream) {
                            this.remoteStream = new MediaStream();
                        }
                        if (!this.remoteStream.getTracks().find(t => t.id === track.id)) {
                            this.remoteStream.addTrack(track);
                        }
                        this.onRemoteStreamCallback?.(this.remoteStream);
                    } else {
                        console.log('[WebRTCManager] Identified as SOUNDPAD audio');
                        if (!this.remoteSoundpadStream) {
                            this.remoteSoundpadStream = new MediaStream();
                        }
                        if (!this.remoteSoundpadStream.getTracks().find(t => t.id === track.id)) {
                            this.remoteSoundpadStream.addTrack(track);
                        }
                        this.onRemoteSoundpadCallback?.(this.remoteSoundpadStream);
                    }
                }
            } else if (track.kind === 'video') {
                console.log('[WebRTCManager] Processing video track');

                const processVideoTrack = async () => {
                    // Wait for track to be ready if it's not yet
                    if (track.readyState !== 'live') {
                        console.log('[WebRTCManager] Track not live yet, waiting...');
                        await new Promise<void>((resolve) => {
                            const checkState = () => {
                                if (track.readyState === 'live') resolve();
                                else setTimeout(checkState, 50);
                            };
                            setTimeout(resolve, 500);
                            checkState();
                        });
                    }

                    // For WebRTCManager, we often map the first video to remoteStream (Camera)
                    // and we also add it to remoteScreenStream if it's logically a screen share.
                    // However, to keep sync, we MUST ensure the same stream object is used.

                    if (!this.remoteStream) {
                        this.remoteStream = new MediaStream();
                    }

                    if (!this.remoteStream.getTracks().find(t => t.id === track.id)) {
                        this.remoteStream.addTrack(track);
                    }

                    this.onRemoteStreamCallback?.(this.remoteStream);

                    // If it belongs to a screen share stream (identifiable by having audio or our own labels)
                    if (!this.remoteScreenStream) {
                        this.remoteScreenStream = new MediaStream();
                    }

                    if (!this.remoteScreenStream.getTracks().find(t => t.id === track.id)) {
                        this.remoteScreenStream.addTrack(track);
                    }

                    this.onRemoteScreenCallback?.(this.remoteScreenStream);

                    // Legacy/Camera specific callback
                    this.onRemoteCameraCallback?.(this.remoteStream);

                    console.log('[WebRTCManager] ========== VIDEO TRACK PROCESSING COMPLETE ==========');
                };

                processVideoTrack();
            }
        };

        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection?.connectionState;
            console.log('[WebRTCManager] Connection state:', state);

            if (state) {
                this.onConnectionStateChangeCallback?.(state);
            }
        };

        // Handle ICE connection state
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log('[WebRTCManager] ICE connection state:', this.peerConnection?.iceConnectionState);
        };

        // Handle negotiation needed (for track changes like screen sharing)
        this.peerConnection.onnegotiationneeded = () => {
            console.log('[WebRTCManager] Negotiation needed');
            this.onNegotiationNeededCallback?.();
        };

        return this.peerConnection;
    }

    /**
     * Get user media (audio/video)
     */
    async getUserMedia(audio: boolean = true, video: boolean = false): Promise<MediaStream> {
        console.log('[WebRTCManager] Getting user media - audio:', audio, 'video:', video);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: audio ? {
                    echoCancellation: true,

                    autoGainControl: true
                } : false,
                video: video ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                } : false
            });

            this.localStream = stream;
            return stream;
        } catch (error) {
            console.error('[WebRTCManager] Error getting user media:', error);
            throw error;
        }
    }

    /**
     * Add local stream to peer connection
     */
    addLocalStream(stream: MediaStream) {
        if (!this.peerConnection) {
            throw new Error('Peer connection not initialized');
        }

        console.log('[WebRTCManager] Adding local stream to peer connection');

        stream.getTracks().forEach(track => {
            this.peerConnection?.addTrack(track, stream);
        });
    }

    /**
     * Add soundpad stream to peer connection (separate track)
     */
    addSoundpadStream(stream: MediaStream) {
        if (!this.peerConnection) {
            console.warn('[WebRTCManager] Cannot add soundpad stream - peer connection not initialized');
            return;
        }

        console.log('[WebRTCManager] Adding soundpad stream to peer connection');

        stream.getAudioTracks().forEach(track => {
            this.peerConnection?.addTrack(track, stream);
        });
    }

    /**
     * Create and return SDP offer
     */
    async createOffer(): Promise<RTCSessionDescriptionInit> {
        if (!this.peerConnection) {
            throw new Error('Peer connection not initialized');
        }

        console.log('[WebRTCManager] Creating offer');

        const offer = await this.peerConnection.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });

        await this.peerConnection.setLocalDescription(offer);
        return offer;
    }

    /**
     * Create and return SDP answer
     */
    async createAnswer(): Promise<RTCSessionDescriptionInit> {
        if (!this.peerConnection) {
            throw new Error('Peer connection not initialized');
        }

        console.log('[WebRTCManager] Creating answer');
        console.log('[WebRTCManager] Current signaling state:', this.peerConnection.signalingState);

        // Warn if state is unexpected, but don't block - WebRTC might handle it
        if (this.peerConnection.signalingState !== 'have-remote-offer') {
            console.warn('[WebRTCManager] Creating answer in unexpected state:', this.peerConnection.signalingState);
            console.warn('[WebRTCManager] Proceeding anyway - WebRTC may handle this gracefully');
        }

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        console.log('[WebRTCManager] Answer created and set as local description');
        return answer;
    }

    private pendingCandidates: RTCIceCandidateInit[] = [];

    /**
     * Set remote description (offer or answer)
     */
    async setRemoteDescription(description: RTCSessionDescriptionInit) {
        if (!this.peerConnection) {
            throw new Error('Peer connection not initialized');
        }

        console.log('[WebRTCManager] Setting remote description:', description.type);
        console.log('[WebRTCManager] Current signaling state:', this.peerConnection.signalingState);

        // Validate signaling state before setting remote description
        const currentState = this.peerConnection.signalingState;
        const isOffer = description.type === 'offer';
        const isAnswer = description.type === 'answer';

        // Valid state transitions:
        // - offer can be set in 'stable' or 'have-local-offer' (for renegotiation)
        // - answer can be set in 'have-local-offer'
        if (isOffer && currentState !== 'stable' && currentState !== 'have-local-offer') {
            console.warn('[WebRTCManager] Invalid state for setting offer:', currentState);
            console.warn('[WebRTCManager] Waiting for state to stabilize...');
            // Wait a bit and retry
            await new Promise(resolve => setTimeout(resolve, 100));
            if (this.peerConnection.signalingState !== 'stable' && this.peerConnection.signalingState !== 'have-local-offer') {
                console.error('[WebRTCManager] State did not stabilize, current state:', this.peerConnection.signalingState);
                throw new Error(`Cannot set remote offer in state: ${this.peerConnection.signalingState}`);
            }
        }

        if (isAnswer && currentState !== 'have-local-offer') {
            console.warn('[WebRTCManager] Setting answer in unexpected state:', currentState);
            console.warn('[WebRTCManager] Proceeding anyway - WebRTC may handle this gracefully');
        }

        await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription(description)
        );

        console.log('[WebRTCManager] Remote description set successfully, new state:', this.peerConnection.signalingState);

        // Process pending candidates
        if (this.pendingCandidates.length > 0) {
            console.log(`[WebRTCManager] Processing ${this.pendingCandidates.length} pending ICE candidates`);
            for (const candidate of this.pendingCandidates) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            }
            this.pendingCandidates = [];
        }
    }

    /**
     * Add ICE candidate
     */
    async addICECandidate(candidate: RTCIceCandidateInit) {
        if (!this.peerConnection) {
            throw new Error('Peer connection not initialized');
        }

        if (!this.peerConnection.remoteDescription) {
            console.log('[WebRTCManager] Buffering ICE candidate (remote description not set)');
            this.pendingCandidates.push(candidate);
            return;
        }

        console.log('[WebRTCManager] Adding ICE candidate');

        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }

    /**
     * Toggle microphone mute
     */
    toggleMicrophone(muted: boolean) {
        if (!this.peerConnection) return;

        // 1. Mute active sender track directly (Robust Fix)
        const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'audio');
        if (sender && sender.track) {
            sender.track.enabled = !muted;
        }

        // 2. Update local stream reference if available (for UI/future)
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !muted;
            });
        }

        console.log('[WebRTCManager] Microphone', muted ? 'muted' : 'unmuted');
    }

    /**
     * Toggle camera on/off
     */
    toggleCamera(enabled: boolean) {
        if (!this.localStream) return;

        this.localStream.getVideoTracks().forEach(track => {
            track.enabled = enabled;
        });

        console.log('[WebRTCManager] Camera', enabled ? 'enabled' : 'disabled');
    }

    /**
     * Replace audio track mid-session
     */
    /**
     * Replace audio track mid-session with a pre-acquired/processed track
     */
    async replaceAudioTrack(track: MediaStreamTrack): Promise<void> {
        if (!this.peerConnection) return;

        console.log('[WebRTCManager] Replacing audio track mid-session');

        // Replace track on all main audio senders
        // We look for senders that are NOT screen audio (if we track it)
        const senders = this.peerConnection.getSenders().filter(s =>
            s.track?.kind === 'audio' && s !== this.screenAudioSender
        );

        for (const sender of senders) {
            await sender.replaceTrack(track);
        }

        console.log('[WebRTCManager] ✓ Audio track replaced');
    }

    /**
     * Replace video track mid-session
     */
    async replaceVideoTrack(deviceId: string): Promise<MediaStream | null> {
        if (!this.peerConnection) return;

        console.log('[WebRTCManager] Replacing video track with device:', deviceId);

        const newStream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 },
            },
            audio: false
        });

        const newTrack = newStream.getVideoTracks()[0];
        if (!newTrack) throw new Error('No video track in new stream');

        // Find camera sender
        const sender = this.peerConnection.getSenders().find(s =>
            s.track?.kind === 'video' && s.track?.label !== 'Screen' // basic check
        );

        if (sender) {
            await sender.replaceTrack(newTrack);
        }

        // Update localStream
        if (this.localStream) {
            const oldTracks = this.localStream.getVideoTracks();
            oldTracks.forEach(t => {
                t.stop();
                this.localStream?.removeTrack(t);
            });
            this.localStream.addTrack(newTrack);
        }

        console.log('[WebRTCManager] ✓ Video track replaced');
        return this.localStream;
    }

    /**
     * Add a video track to the peer connection
     */
    addVideoTrack(track: MediaStreamTrack, stream: MediaStream) {
        if (this.peerConnection) {
            this.peerConnection.addTrack(track, stream);
        }
    }

    /**
     * Start screen sharing
     */
    async startScreenShare(screenStream: MediaStream): Promise<MediaStream> {
        console.log('[WebRTCManager] Starting screen share');

        try {
            this.screenStream = screenStream;

            if (this.peerConnection) {
                // Find existing video sender
                const sender = this.peerConnection
                    .getSenders()
                    .find(s => s.track?.kind === 'video');

                // If there's an existing video track (camera), remove it first
                // We use removeTrack/addTrack instead of replaceTrack to force full renegotiation
                // This is more robust for switching between camera (low res) and screen (high res)
                if (sender) {
                    console.log('[WebRTCManager] Removing existing video track before adding screen share');
                    this.peerConnection.removeTrack(sender);
                }

                // Add the screen share video track
                const videoTrack = screenStream.getVideoTracks()[0];
                console.log('[WebRTCManager] Adding screen share video track');
                const newSender = this.peerConnection.addTrack(videoTrack, screenStream);

                // Removed bitrate limit logic to rely on WebRTC defaults

                // Ensure transceiver direction is correct
                const transceiver = this.peerConnection.getTransceivers().find(t => t.sender === newSender);
                if (transceiver) {
                    console.log('[WebRTCManager] Setting screen video transceiver direction to sendrecv');
                    transceiver.direction = 'sendrecv';
                }

                // Handle screen share stop
                videoTrack.onended = () => {
                    console.log('[WebRTCManager] Screen share stopped by user');
                    this.stopScreenShare();
                };

                // Handle audio track (system audio)
                const audioTrack = screenStream.getAudioTracks()[0];
                if (audioTrack) {
                    console.log('[WebRTCManager] Adding screen audio track');
                    this.screenAudioSender = this.peerConnection.addTrack(audioTrack, screenStream);

                    const audioTransceiver = this.peerConnection.getTransceivers().find(t => t.sender === this.screenAudioSender);
                    if (audioTransceiver) {
                        console.log('[WebRTCManager] Setting screen audio transceiver direction to sendrecv');
                        audioTransceiver.direction = 'sendrecv';
                    }
                }
            }

            return screenStream;
        } catch (error) {
            console.error('[WebRTCManager] Error starting screen share:', error);
            throw error;
        }
    }

    /**
     * Stop screen sharing
     */
    async stopScreenShare() {
        console.log('[WebRTCManager] Stopping screen share');

        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        if (!this.peerConnection) return;

        // Remove screen video sender
        const sender = this.peerConnection
            .getSenders()
            .find(s => s.track?.kind === 'video');

        if (sender) {
            console.log('[WebRTCManager] Removing screen share video track');
            this.peerConnection.removeTrack(sender);
        }

        // Remove screen audio track if exists
        if (this.screenAudioSender) {
            console.log('[WebRTCManager] Removing screen audio track');
            try {
                this.peerConnection.removeTrack(this.screenAudioSender);
            } catch (e) {
                console.error('[WebRTCManager] Error removing screen audio track:', e);
            }
            this.screenAudioSender = null;
        }

        // Restore camera track if available
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                console.log('[WebRTCManager] Restoring camera track');
                this.peerConnection.addTrack(videoTrack, this.localStream);
            }
        }
    }

    /**
 * Get local stream
 */
    getLocalStream(): MediaStream | null {
        return this.localStream;
    }

    /**
     * Get remote stream
     */
    getRemoteStream(): MediaStream | null {
        return this.remoteStream;
    }

    /**
     * Get remote video track
     */
    getRemoteVideoTrack(): MediaStreamTrack | undefined {
        if (!this.peerConnection) return undefined;

        const receivers = this.peerConnection.getReceivers();
        const videoReceiver = receivers.find(r => r.track.kind === 'video');
        return videoReceiver?.track;
    }

    /**
     * Get peer connection signaling state
     */
    getSignalingState(): RTCSignalingState | null {
        if (!this.peerConnection) return null;
        return this.peerConnection.signalingState;
    }

    /**
     * Get the peer connection for direct access (soundboard audio mixing)
     */
    getPeerConnection(): RTCPeerConnection | null {
        return this.peerConnection;
    }

    /**
     * Get call statistics (RTT, etc.)
     */
    async getCallStats(): Promise<{ rtt: number | null }> {
        if (!this.peerConnection) return { rtt: null };

        try {
            const stats = await this.peerConnection.getStats();
            let rtt: number | null = null;

            stats.forEach(report => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    rtt = report.currentRoundTripTime * 1000; // converted to ms
                }
            });

            return { rtt };
        } catch (e) {
            console.error('[WebRTCManager] Error getting stats:', e);
            return { rtt: null };
        }
    }

    /**
     * Close connection and cleanup
     */
    cleanup() {
        console.log('[WebRTCManager] Cleaning up');

        // Stop all local tracks
        // NOTE: We do NOT stop tracks here because they are managed by VoiceChannelContext
        // and shared across multiple peer connections. Stopping them here would kill the specific
        // stream for ALL peers and the local user.
        if (this.localStream) {
            // this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Stop screen share
        if (this.screenStream) {
            // this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.remoteStream = null;
        this.remoteSoundpadStream = null;
        this.remoteScreenStream = null;
        this.pendingCandidates = [];
    }
}
