/**
 * WebRTCManager handles peer-to-peer connections for voice/video calls
 * Manages RTCPeerConnection, media streams, and ICE candidates
 */
export class WebRTCManager {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private screenStream: MediaStream | null = null;
    private screenAudioSender: RTCRtpSender | null = null;

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
        onRemoteCamera?: (stream: MediaStream) => void
    ) {
        console.log('[WebRTCManager] Creating peer connection');

        this.onRemoteStreamCallback = onRemoteStream;
        this.onRemoteScreenCallback = onRemoteScreen;
        this.onRemoteCameraCallback = onRemoteCamera;
        this.onICECandidateCallback = onICECandidate;
        this.onConnectionStateChangeCallback = onConnectionStateChange;
        this.onNegotiationNeededCallback = onNegotiationNeeded;

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
            console.log('[WebRTCManager] Track enabled:', event.track.enabled);
            console.log('[WebRTCManager] Track readyState:', event.track.readyState);

            if (event.track.kind === 'audio') {
                // Audio track - for voice
                console.log('[WebRTCManager] Processing audio track');
                if (!this.remoteStream) {
                    this.remoteStream = new MediaStream();
                }
                this.remoteStream.addTrack(event.track);
                this.onRemoteStreamCallback?.(this.remoteStream);
                console.log('[WebRTCManager] ✓ Audio track added to remote stream');
            } else if (event.track.kind === 'video') {
                // Video track - could be camera or screen share
                console.log('[WebRTCManager] Processing video track');

                if (!this.remoteStream) {
                    this.remoteStream = new MediaStream();
                }

                // Check if we already have a video track
                const existingVideoTrack = this.remoteStream.getVideoTracks()[0];
                if (existingVideoTrack) {
                    console.log('[WebRTCManager] Removing existing video track');
                    this.remoteStream.removeTrack(existingVideoTrack);
                }
                this.remoteStream.addTrack(event.track);
                console.log('[WebRTCManager] ✓ Video track added to remote stream');
                this.onRemoteStreamCallback?.(this.remoteStream);

                // Also treat as screen share for compatibility with current UI logic
                const screenStream = new MediaStream([event.track]);
                console.log('[WebRTCManager] ✓ Calling onRemoteScreenCallback');
                this.onRemoteScreenCallback?.(screenStream);

                // Also treat as camera stream
                const cameraStream = new MediaStream([event.track]);
                console.log('[WebRTCManager] ✓ Calling onRemoteCameraCallback');
                this.onRemoteCameraCallback?.(cameraStream);

                console.log('[WebRTCManager] ========== VIDEO TRACK PROCESSING COMPLETE ==========');
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
                    noiseSuppression: true,
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

        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
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

        await this.peerConnection.setRemoteDescription(
            new RTCSessionDescription(description)
        );

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
        if (!this.localStream) return;

        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !muted;
        });

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
     * Close connection and cleanup
     */
    cleanup() {
        console.log('[WebRTCManager] Cleaning up');

        // Stop all local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Stop screen share
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.remoteStream = null;
    }
}
