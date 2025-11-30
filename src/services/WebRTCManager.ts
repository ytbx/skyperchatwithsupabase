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
            console.log('[WebRTCManager] Received remote track', event.track.kind, event.track.id);
            const stream = event.streams[0] || new MediaStream([event.track]);
            console.log('[WebRTCManager] Track belongs to stream:', stream.id);

            if (event.track.kind === 'audio') {
                // Audio track - always add to main remote stream
                if (!this.remoteStream) {
                    this.remoteStream = new MediaStream();
                }
                this.remoteStream.addTrack(event.track);
                this.onRemoteStreamCallback?.(this.remoteStream);
            } else if (event.track.kind === 'video') {
                // Video track
                // We pass the stream to the callback. CallContext will decide based on stream ID if possible.

                // 1. Try to guess if it's screen share (if we already have a main video)
                const hasMainVideo = this.remoteStream && this.remoteStream.getVideoTracks().length > 0;

                if (hasMainVideo) {
                    console.log('[WebRTCManager] Main video exists, treating as screen share');
                    this.onRemoteScreenCallback?.(stream);
                } else {
                    console.log('[WebRTCManager] No main video, treating as camera/main');
                    // Add to remoteStream
                    if (!this.remoteStream) {
                        this.remoteStream = new MediaStream();
                    }
                    this.remoteStream.addTrack(event.track);
                    this.onRemoteStreamCallback?.(this.remoteStream);

                    // Also fire screen callback just in case (CallContext can filter by ID)
                    this.onRemoteScreenCallback?.(stream);
                }
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
            const videoTrack = screenStream.getVideoTracks()[0];

            if (this.peerConnection) {
                // ALWAYS add a new track for screen sharing
                // This ensures 'ontrack' fires on the remote side
                console.log('[WebRTCManager] Adding screen share track to peer connection');
                this.peerConnection.addTrack(videoTrack, screenStream);

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

        // Find the sender that is sending the screen share track
        const senders = this.peerConnection.getSenders();
        const screenSender = senders.find(s => s.track?.kind === 'video' && s.track.label.includes('screen') || s.track?.label.includes('display') || s.track?.label.includes('window'));

        // If we can't find by label, try to find the one that is NOT the camera (if camera exists)
        let targetSender = screenSender;

        if (!targetSender) {
            // Fallback: Find any video sender that isn't the local camera stream's track
            const localVideoTrack = this.localStream?.getVideoTracks()[0];
            targetSender = senders.find(s => s.track?.kind === 'video' && s.track !== localVideoTrack);
        }

        if (targetSender) {
            console.log('[WebRTCManager] Removing screen share sender');
            this.peerConnection.removeTrack(targetSender);
        } else {
            console.log('[WebRTCManager] No screen share sender found to remove');
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
