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
        onNegotiationNeeded?: () => void
    ) {
        console.log('[WebRTCManager] Creating peer connection');

        this.onRemoteStreamCallback = onRemoteStream;
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
            console.log('[WebRTCManager] Received remote track');

            if (!this.remoteStream) {
                this.remoteStream = new MediaStream();
            }

            this.remoteStream.addTrack(event.track);
            this.onRemoteStreamCallback?.(this.remoteStream);
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
    }

    /**
     * Add ICE candidate
     */
    async addICECandidate(candidate: RTCIceCandidateInit) {
        if (!this.peerConnection) {
            throw new Error('Peer connection not initialized');
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
     * Start screen sharing
     */
    async startScreenShare(): Promise<MediaStream> {
        console.log('[WebRTCManager] Starting screen share');

        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false
            });

            this.screenStream = screenStream;

            // Replace video track with screen share track
            if (this.peerConnection) {
                const videoTrack = screenStream.getVideoTracks()[0];
                const sender = this.peerConnection
                    .getSenders()
                    .find(s => s.track?.kind === 'video');

                if (sender) {
                    console.log('[WebRTCManager] Found existing video sender, replacing track');
                    await sender.replaceTrack(videoTrack);
                    console.log('[WebRTCManager] Video track replaced with screen share');

                    // Manually trigger renegotiation since replaceTrack doesn't always fire onnegotiationneeded
                    console.log('[WebRTCManager] Manually triggering renegotiation for screen share (replaceTrack)');
                    this.onNegotiationNeededCallback?.();
                } else {
                    console.log('[WebRTCManager] No video sender found, adding new track');
                    this.peerConnection.addTrack(videoTrack, screenStream);
                    console.log('[WebRTCManager] Screen share track added');
                    // addTrack will automatically trigger onnegotiationneeded, so no manual trigger needed here
                }

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

        const sender = this.peerConnection
            .getSenders()
            .find(s => s.track?.kind === 'video');

        if (!sender) {
            console.log('[WebRTCManager] No video sender found to stop');
            return;
        }

        // Restore camera track if available, otherwise stop sending video
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                console.log('[WebRTCManager] Restoring camera track');
                await sender.replaceTrack(videoTrack);
            } else {
                console.log('[WebRTCManager] No camera track to restore, stopping video transmission');
                await sender.replaceTrack(null);
            }
        } else {
            console.log('[WebRTCManager] No local stream, stopping video transmission');
            await sender.replaceTrack(null);
        }

        // Manually trigger renegotiation to ensure peer knows about the change
        console.log('[WebRTCManager] Manually triggering renegotiation after stopping screen share');
        this.onNegotiationNeededCallback?.();
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
