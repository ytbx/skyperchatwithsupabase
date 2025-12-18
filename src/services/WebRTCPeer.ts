/**
 * WebRTCPeer - A clean, per-call WebRTC peer connection manager
 * 
 * Key design decisions:
 * - Created fresh for each call (no reuse)
 * - Built-in ICE candidate queueing until remote description is set
 * - Event emitter pattern for clean callbacks
 * - Simple API for media management
 */

export type PeerConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface WebRTCPeerCallbacks {
    onRemoteStream: (stream: MediaStream) => void;
    onRemoteSoundpad: (stream: MediaStream) => void;
    onRemoteVideo: (stream: MediaStream) => void;  // Separate video callback for screen share
    onIceCandidate: (candidate: RTCIceCandidateInit) => void;
    onConnectionStateChange: (state: PeerConnectionState) => void;
    onNegotiationNeeded: () => void;
}

export class WebRTCPeer {
    private pc: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private screenStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private remoteSoundpadStream: MediaStream | null = null;

    // ICE candidate queue - crucial for handling race conditions
    private pendingCandidates: RTCIceCandidateInit[] = [];
    private hasRemoteDescription = false;

    // Track audio count to differentiate voice from soundpad
    private audioTrackCount = 0;

    // Callbacks
    private callbacks: WebRTCPeerCallbacks;

    // ICE servers configuration
    private static readonly ICE_SERVERS: RTCConfiguration = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
        ]
    };

    constructor(callbacks: WebRTCPeerCallbacks) {
        this.callbacks = callbacks;
        this.createPeerConnection();
    }

    private createPeerConnection() {
        console.log('[WebRTCPeer] Creating new peer connection');

        this.pc = new RTCPeerConnection(WebRTCPeer.ICE_SERVERS);

        // Handle ICE candidates
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('[WebRTCPeer] ICE candidate generated');
                this.callbacks.onIceCandidate(event.candidate.toJSON());
            }
        };

        // Handle remote tracks
        this.pc.ontrack = (event) => {
            console.log('[WebRTCPeer] Remote track received:', event.track.kind, event.track.label);
            this.handleRemoteTrack(event.track);
        };

        // Handle connection state changes
        this.pc.onconnectionstatechange = () => {
            const state = this.pc?.connectionState as PeerConnectionState;
            console.log('[WebRTCPeer] Connection state:', state);
            this.callbacks.onConnectionStateChange(state);
        };

        // Handle ICE connection state for debugging
        this.pc.oniceconnectionstatechange = () => {
            console.log('[WebRTCPeer] ICE connection state:', this.pc?.iceConnectionState);
        };

        // Handle negotiation needed
        this.pc.onnegotiationneeded = () => {
            console.log('[WebRTCPeer] Negotiation needed');
            this.callbacks.onNegotiationNeeded();
        };
    }

    private handleRemoteTrack(track: MediaStreamTrack) {
        if (track.kind === 'audio') {
            this.audioTrackCount++;
            console.log('[WebRTCPeer] Audio track #', this.audioTrackCount);

            if (this.audioTrackCount === 1) {
                // First audio track = voice
                if (!this.remoteStream) {
                    this.remoteStream = new MediaStream();
                }
                this.remoteStream.addTrack(track);
                this.callbacks.onRemoteStream(this.remoteStream);
                console.log('[WebRTCPeer] ✓ Voice track added');
            } else if (this.audioTrackCount === 2) {
                // Second audio track = soundpad
                if (!this.remoteSoundpadStream) {
                    this.remoteSoundpadStream = new MediaStream();
                }
                this.remoteSoundpadStream.addTrack(track);
                this.callbacks.onRemoteSoundpad(this.remoteSoundpadStream);
                console.log('[WebRTCPeer] ✓ Soundpad track added');
            } else {
                // Additional audio (screen share audio) goes to voice stream
                this.remoteStream?.addTrack(track);
                if (this.remoteStream) {
                    this.callbacks.onRemoteStream(this.remoteStream);
                }
            }
        } else if (track.kind === 'video') {
            console.log('[WebRTCPeer] Video track received');

            if (!this.remoteStream) {
                this.remoteStream = new MediaStream();
            }

            // Replace existing video track
            const existingVideo = this.remoteStream.getVideoTracks()[0];
            if (existingVideo) {
                this.remoteStream.removeTrack(existingVideo);
            }

            this.remoteStream.addTrack(track);
            this.callbacks.onRemoteStream(this.remoteStream);

            // Also emit separate video stream for screen share UI
            const videoStream = new MediaStream([track]);
            this.callbacks.onRemoteVideo(videoStream);
            console.log('[WebRTCPeer] ✓ Video track added and emitted');
        }
    }

    /**
     * Get user media (microphone/camera)
     */
    async getUserMedia(audio: boolean = true, video: boolean = false): Promise<MediaStream> {
        console.log('[WebRTCPeer] Getting user media - audio:', audio, 'video:', video);

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
    }

    /**
     * Add local stream to peer connection
     */
    addLocalStream(stream: MediaStream) {
        if (!this.pc) throw new Error('Peer connection not initialized');

        console.log('[WebRTCPeer] Adding local stream');
        stream.getTracks().forEach(track => {
            this.pc?.addTrack(track, stream);
        });
    }

    /**
     * Add soundpad stream (separate audio track)
     */
    addSoundpadStream(stream: MediaStream) {
        if (!this.pc) {
            console.warn('[WebRTCPeer] Cannot add soundpad - no peer connection');
            return;
        }

        console.log('[WebRTCPeer] Adding soundpad stream');
        stream.getAudioTracks().forEach(track => {
            this.pc?.addTrack(track, stream);
        });
    }

    /**
     * Create SDP offer
     */
    async createOffer(): Promise<RTCSessionDescriptionInit> {
        if (!this.pc) throw new Error('Peer connection not initialized');

        console.log('[WebRTCPeer] Creating offer');

        const offer = await this.pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
        });

        await this.pc.setLocalDescription(offer);
        console.log('[WebRTCPeer] ✓ Offer created and set as local description');
        return offer;
    }

    /**
     * Create SDP answer
     */
    async createAnswer(): Promise<RTCSessionDescriptionInit> {
        if (!this.pc) throw new Error('Peer connection not initialized');

        console.log('[WebRTCPeer] Creating answer, signaling state:', this.pc.signalingState);

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        console.log('[WebRTCPeer] ✓ Answer created and set as local description');
        return answer;
    }

    /**
     * Set remote description (offer or answer)
     * This also flushes any queued ICE candidates
     */
    async setRemoteDescription(description: RTCSessionDescriptionInit) {
        if (!this.pc) throw new Error('Peer connection not initialized');

        console.log('[WebRTCPeer] Setting remote description:', description.type);
        console.log('[WebRTCPeer] Current signaling state:', this.pc.signalingState);

        await this.pc.setRemoteDescription(new RTCSessionDescription(description));
        this.hasRemoteDescription = true;

        console.log('[WebRTCPeer] ✓ Remote description set, new state:', this.pc.signalingState);

        // Flush queued ICE candidates
        if (this.pendingCandidates.length > 0) {
            console.log('[WebRTCPeer] Flushing', this.pendingCandidates.length, 'queued ICE candidates');
            for (const candidate of this.pendingCandidates) {
                try {
                    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
                } catch (e) {
                    console.warn('[WebRTCPeer] Error adding queued ICE candidate:', e);
                }
            }
            this.pendingCandidates = [];
        }
    }

    /**
     * Add ICE candidate (queues if remote description not yet set)
     */
    async addIceCandidate(candidate: RTCIceCandidateInit) {
        if (!this.pc) throw new Error('Peer connection not initialized');

        if (!this.hasRemoteDescription) {
            console.log('[WebRTCPeer] Queueing ICE candidate (no remote description yet)');
            this.pendingCandidates.push(candidate);
            return;
        }

        console.log('[WebRTCPeer] Adding ICE candidate');
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    }

    /**
     * Toggle microphone mute
     */
    setMicMuted(muted: boolean) {
        if (!this.localStream) return;

        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = !muted;
        });
        console.log('[WebRTCPeer] Microphone', muted ? 'muted' : 'unmuted');
    }

    /**
     * Toggle camera
     */
    setCameraEnabled(enabled: boolean) {
        if (!this.localStream) return;

        this.localStream.getVideoTracks().forEach(track => {
            track.enabled = enabled;
        });
        console.log('[WebRTCPeer] Camera', enabled ? 'enabled' : 'disabled');
    }

    /**
     * Start screen sharing
     */
    async startScreenShare(screenStream: MediaStream) {
        if (!this.pc) throw new Error('Peer connection not initialized');

        console.log('[WebRTCPeer] Starting screen share');
        this.screenStream = screenStream;

        // Find and remove existing video track
        const existingSender = this.pc.getSenders().find(s => s.track?.kind === 'video');
        if (existingSender) {
            console.log('[WebRTCPeer] Removing existing video sender');
            this.pc.removeTrack(existingSender);
        }

        // Add screen share video track
        const videoTrack = screenStream.getVideoTracks()[0];
        if (videoTrack) {
            console.log('[WebRTCPeer] Adding screen share video track');
            this.pc.addTrack(videoTrack, screenStream);

            // Handle user stopping screen share via browser UI
            videoTrack.onended = () => {
                console.log('[WebRTCPeer] Screen share stopped by user');
            };
        }

        // Add screen share audio if available
        const audioTrack = screenStream.getAudioTracks()[0];
        if (audioTrack) {
            console.log('[WebRTCPeer] Adding screen share audio track');
            this.pc.addTrack(audioTrack, screenStream);
        }
    }

    /**
     * Stop screen sharing
     */
    async stopScreenShare() {
        if (!this.pc) return;

        console.log('[WebRTCPeer] Stopping screen share');

        // Stop all screen stream tracks
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        // Remove screen share tracks from peer connection
        const videoSender = this.pc.getSenders().find(s => s.track?.kind === 'video');
        if (videoSender) {
            this.pc.removeTrack(videoSender);
        }

        // Restore camera track if available
        if (this.localStream) {
            const cameraTrack = this.localStream.getVideoTracks()[0];
            if (cameraTrack) {
                console.log('[WebRTCPeer] Restoring camera track');
                this.pc.addTrack(cameraTrack, this.localStream);
            }
        }
    }

    /**
     * Get signaling state
     */
    getSignalingState(): RTCSignalingState | null {
        return this.pc?.signalingState ?? null;
    }

    /**
     * Get connection state
     */
    getConnectionState(): RTCPeerConnectionState | null {
        return this.pc?.connectionState ?? null;
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
     * Get call statistics (RTT/ping)
     */
    async getStats(): Promise<{ rtt: number | null }> {
        if (!this.pc) return { rtt: null };

        try {
            const stats = await this.pc.getStats();
            let rtt: number | null = null;

            stats.forEach(report => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    rtt = report.currentRoundTripTime * 1000; // ms
                }
            });

            return { rtt };
        } catch (e) {
            console.error('[WebRTCPeer] Error getting stats:', e);
            return { rtt: null };
        }
    }

    /**
     * Close and cleanup - MUST be called when call ends
     */
    close() {
        console.log('[WebRTCPeer] Closing peer connection');

        // Stop local stream tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Stop screen stream tracks
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        // Close peer connection
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        // Clear state
        this.remoteStream = null;
        this.remoteSoundpadStream = null;
        this.pendingCandidates = [];
        this.hasRemoteDescription = false;
        this.audioTrackCount = 0;

        console.log('[WebRTCPeer] ✓ Cleanup complete');
    }
}
