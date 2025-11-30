/**
 * WebRTCManager handles peer-to-peer connections for voice/video calls
 * Manages RTCPeerConnection, media streams, and ICE candidates
 */
export class WebRTCManager {
    private peerConnection: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private screenStream: MediaStream | null = null;

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
            console.log('[WebRTCManager] Received remote track', event.track.kind);

            if (event.track.kind === 'audio') {
                // Audio track - for voice
                if (!this.remoteStream) {
                    this.remoteStream = new MediaStream();
                }
                this.remoteStream.addTrack(event.track);
                this.onRemoteStreamCallback?.(this.remoteStream);
            } else if (event.track.kind === 'video') {
                // Video track - for screen share
                const screenStream = new MediaStream([event.track]);
                this.onRemoteScreenCallback?.(screenStream);
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

            // Always add screen share as a NEW track (don't replace camera)
            // This is more reliable than replaceTrack for renegotiation
            if (this.peerConnection) {
                const videoTrack = screenStream.getVideoTracks()[0];

                console.log('[WebRTCManager] Adding screen share track as new track');
                this.peerConnection.addTrack(videoTrack, screenStream);
                console.log('[WebRTCManager] Screen share track added');

                // Handle screen share stop
                videoTrack.onended = () => {
                    console.log('[WebRTCManager] Screen share stopped by user');
                    this.stopScreenShare();
                };
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

        // Find and remove the screen share sender
        // Since we added it as a separate track, we need to remove it
        const senders = this.peerConnection.getSenders();
        const screenSender = senders.find(s => {
            // Screen share tracks typically have labels like "screen", "window", etc.
            const label = s.track?.label?.toLowerCase() || '';
            return s.track?.kind === 'video' &&
                (label.includes('screen') || label.includes('window') || label.includes('monitor') || label.includes('display'));
        });

        if (screenSender) {
            console.log('[WebRTCManager] Removing screen share sender');
            this.peerConnection.removeTrack(screenSender);
            console.log('[WebRTCManager] Screen share sender removed');
        } else {
            console.log('[WebRTCManager] No screen share sender found to remove');
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
