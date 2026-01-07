export type PeerConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

export interface WebRTCPeerCallbacks {
    onRemoteStream: (stream: MediaStream) => void;
    onRemoteSoundpad: (stream: MediaStream) => void;
    onRemoteVideo: (stream: MediaStream) => void;  // Separate video callback for screen share
    onIceCandidate: (candidate: RTCIceCandidateInit) => void;
    onConnectionStateChange: (state: PeerConnectionState) => void;
    onNegotiationNeeded: () => void;
    onRemoteTrackChanged: () => void; // Notify when tracks are added or removed
}

export class WebRTCPeer {
    private pc: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private cameraStream: MediaStream | null = null;
    private screenStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private remoteScreenStream: MediaStream | null = null; // Track remote screen stream for cleanup
    private remoteSoundpadStream: MediaStream | null = null;

    private cameraSender: RTCRtpSender | null = null;
    private screenSender: RTCRtpSender | null = null;

    private remoteStreamId: string | null = null;

    // ICE candidate queue - crucial for handling race conditions
    private pendingCandidates: RTCIceCandidateInit[] = [];
    private hasRemoteDescription = false;

    // Track audio count to differentiate voice from soundpad
    private audioTrackCount = 0;

    // Flag to expect next video track as screen share
    private expectScreenShare = false;

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

            // Monitor track removal on the stream
            event.streams.forEach(stream => {
                stream.onremovetrack = (ev) => {
                    console.log('[WebRTCPeer] Remote track removed:', ev.track.kind, ev.track.label);

                    // Remove from remoteStream
                    if (this.remoteStream) {
                        const track = this.remoteStream.getTracks().find(t => t.id === ev.track.id);
                        if (track) {
                            this.remoteStream.removeTrack(track);
                            console.log('[WebRTCPeer] Removed track from remoteStream');
                        }
                    }

                    // Check Soundpad
                    if (this.remoteSoundpadStream) {
                        const track = this.remoteSoundpadStream.getTracks().find(t => t.id === ev.track.id);
                        if (track) {
                            this.remoteSoundpadStream.removeTrack(track);
                            console.log('[WebRTCPeer] Removed track from remoteSoundpadStream');
                        }
                    }

                    // Check Screen Share
                    if (this.remoteScreenStream) {
                        const track = this.remoteScreenStream.getTracks().find(t => t.id === ev.track.id);
                        if (track) {
                            this.remoteScreenStream.removeTrack(track);
                            console.log('[WebRTCPeer] Removed track from remoteScreenStream');

                            // Explicitly notify that screen share stopped if no tracks left
                            if (this.remoteScreenStream.getTracks().length === 0) {
                                this.remoteScreenStream = null;
                                // We rely on specific callback or generic track changed
                            }
                        }
                    }

                    this.callbacks.onRemoteTrackChanged();
                };
            });

            this.handleRemoteTrack(event.track, event.streams);
            this.callbacks.onRemoteTrackChanged();
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

    private handleRemoteTrack(track: MediaStreamTrack, streams: readonly MediaStream[]) {
        const stream = streams[0];
        if (!stream) {
            console.warn('[WebRTCPeer] Track received with no stream:', track.kind);
            return;
        }

        console.log('[WebRTCPeer] Remote track received:', track.kind, track.label, 'Stream ID:', stream.id);

        if (track.kind === 'audio') {
            console.log('[WebRTCPeer] Processing audio track:', track.label, 'Stream ID:', stream.id);

            // Check if this stream has a video track (Screen Share)
            const hasVideo = stream.getVideoTracks().length > 0;

            if (hasVideo) {
                console.log('[WebRTCPeer] Identified as SCREEN SHARE audio (associated with video)');
                // Create/Update screen stream - maintain stable reference
                if (!this.remoteScreenStream) {
                    this.remoteScreenStream = new MediaStream();
                }

                // Add track if not already present
                if (!this.remoteScreenStream.getTracks().find(t => t.id === track.id)) {
                    this.remoteScreenStream.addTrack(track);
                }

                this.callbacks.onRemoteVideo(this.remoteScreenStream);
            } else {
                this.audioTrackCount++;
                console.log('[WebRTCPeer] Audio track #', this.audioTrackCount);

                if (this.audioTrackCount === 1) {
                    // First audio stream -> Main Voice/Camera Stream
                    if (!this.remoteStream) {
                        this.remoteStream = new MediaStream();
                        this.remoteStreamId = stream.id;
                    }

                    if (!this.remoteStream.getTracks().find(t => t.id === track.id)) {
                        this.remoteStream.addTrack(track);
                    }

                    this.callbacks.onRemoteStream(this.remoteStream);
                    console.log('[WebRTCPeer] ✓ Voice track added');
                } else {
                    // Subsequent audio without video -> Soundpad
                    if (!this.remoteSoundpadStream) {
                        this.remoteSoundpadStream = new MediaStream();
                    }

                    if (!this.remoteSoundpadStream.getTracks().find(t => t.id === track.id)) {
                        this.remoteSoundpadStream.addTrack(track);
                    }

                    this.callbacks.onRemoteSoundpad(this.remoteSoundpadStream);
                    console.log('[WebRTCPeer] ✓ Soundpad track added');
                }
            }
        } else if (track.kind === 'video') {

            let isCamera = false;

            // Priority 1: Are we expecting a screen share?
            if (this.expectScreenShare) {
                console.log('[WebRTCPeer] Expected screen share flag set -> Treating as Screen Share');
                isCamera = false;
                this.expectScreenShare = false; // Reset flag after use
            }
            // Priority 2: Does the track label indicate it's a screen share?
            else if (track.label.toLowerCase().includes('screen')) {
                console.log('[WebRTCPeer] Track label contains "screen" -> Treating as Screen Share');
                isCamera = false;
            }
            // Priority 3: Stream ID matching
            else if (this.remoteStreamId && stream.id === this.remoteStreamId) {
                isCamera = true;
            } else {
                // Fallback: If default remoteStream has NO video tracks, assume this IS the camera.
                if (this.remoteStream && this.remoteStream.getVideoTracks().length === 0) {
                    console.log('[WebRTCPeer] Stream ID mismatch but Main Stream has no video -> Adopting as Camera');
                    isCamera = true;
                }
            }

            if (isCamera) {
                console.log('[WebRTCPeer] Assigning as Primary (Camera) Video');
                if (!this.remoteStream) {
                    this.remoteStream = new MediaStream();
                    this.remoteStreamId = stream.id;
                }

                if (!this.remoteStream.getTracks().find(t => t.id === track.id)) {
                    this.remoteStream.addTrack(track);
                }

                this.callbacks.onRemoteStream(this.remoteStream);
            } else {
                // Different stream ID -> Screen Share
                console.log('[WebRTCPeer] Assigning as Secondary (Screen) Video');

                if (!this.remoteScreenStream) {
                    this.remoteScreenStream = new MediaStream();
                }

                if (!this.remoteScreenStream.getTracks().find(t => t.id === track.id)) {
                    this.remoteScreenStream.addTrack(track);
                }

                this.callbacks.onRemoteVideo(this.remoteScreenStream);
            }
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
            const sender = this.pc!.addTrack(track, stream);
            if (track.kind === 'video') {
                this.cameraSender = sender;
                console.log('[WebRTCPeer] Camera sender stored');
            }
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
        if (!this.pc) return;

        // Mute the active audio sender track directly
        const sender = this.pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender && sender.track) {
            sender.track.enabled = !muted;
        }

        // Also update local stream tracking if available, for UI or local preview consistency
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !muted;
            });
        }

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
     * Replace audio track mid-call
     */
    async replaceAudioTrack(track: MediaStreamTrack): Promise<void> {
        if (!this.pc) return;

        console.log('[WebRTCPeer] Replacing audio track mid-call');

        // Find main audio sender
        const sender = this.pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) {
            await sender.replaceTrack(track);
        }

        console.log('[WebRTCPeer] ✓ Audio track replaced');
    }

    /**
     * Replace video track mid-call
     */
    async replaceVideoTrack(deviceId: string): Promise<MediaStream | null> {
        if (!this.pc) return;

        console.log('[WebRTCPeer] Replacing video track with device:', deviceId);

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

        if (this.cameraSender) {
            await this.cameraSender.replaceTrack(newTrack);
        }

        // Update cameraStream
        if (this.cameraStream) {
            const oldTracks = this.cameraStream.getVideoTracks();
            oldTracks.forEach(t => {
                t.stop();
                this.cameraStream?.removeTrack(t);
            });
            this.cameraStream.addTrack(newTrack);
        } else {
            this.cameraStream = newStream;
        }

        console.log('[WebRTCPeer] ✓ Video track replaced');
        return this.cameraStream;
    }

    /**
     * Start camera mid-call (for voice calls that need to add video)
     * Returns the camera stream for local preview
     */
    async startCamera(): Promise<MediaStream> {
        if (!this.pc) throw new Error('Peer connection not initialized');

        console.log('[WebRTCPeer] Starting camera mid-call');

        // Get camera stream
        const cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: false
        });

        // Store reference
        this.cameraStream = cameraStream;

        // Add video track to peer connection
        const videoTrack = cameraStream.getVideoTracks()[0];
        if (videoTrack) {
            // CRITICAL: Add to localStream if available so remote side sees it as the SAME stream (Camera)
            // instead of a new stream (Screen Share)
            const streams = this.localStream ? [this.localStream] : [cameraStream];
            this.cameraSender = this.pc.addTrack(videoTrack, ...streams);
            console.log('[WebRTCPeer] ✓ Camera track added mid-call (grouped with local stream)');
        }

        return cameraStream;
    }

    /**
     * Stop camera mid-call
     */
    async stopCamera() {
        if (!this.pc) return;

        console.log('[WebRTCPeer] Stopping camera');

        // Stop camera stream tracks
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }

        // Remove camera sender from peer connection
        if (this.cameraSender) {
            try {
                this.pc.removeTrack(this.cameraSender);
                console.log('[WebRTCPeer] ✓ Camera sender removed');
            } catch (e) {
                console.warn('[WebRTCPeer] Error removing camera sender:', e);
            }
            this.cameraSender = null;
        }
    }

    /**
     * Start screen sharing
     */
    async startScreenShare(screenStream: MediaStream) {
        if (!this.pc) throw new Error('Peer connection not initialized');

        console.log('[WebRTCPeer] Starting screen share');
        this.screenStream = screenStream;

        // Add screen share video track
        const videoTrack = screenStream.getVideoTracks()[0];
        if (videoTrack) {
            console.log('[WebRTCPeer] Adding screen share video track');
            // Store the sender so we can remove exactly this one later
            this.screenSender = this.pc.addTrack(videoTrack, screenStream);

            // Handle user stopping screen share via browser UI
            videoTrack.onended = () => {
                console.log('[WebRTCPeer] Screen share stopped by user');
                // We should probably notify the session/context here if possible, 
                // but the current architecture relies on callbacks/events not bubbling up easily for 'ended'.
                // The `CallContext` adds a listener on the track itself, so that's handled.
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

        // Stop all screen stream tracks locally
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }

        // Remove screen share specific sender
        if (this.screenSender) {
            try {
                this.pc.removeTrack(this.screenSender);
                console.log('[WebRTCPeer] Screen sender removed');
            } catch (e) {
                console.warn('[WebRTCPeer] Error removing screen sender:', e);
            }
            this.screenSender = null;
        } else {
            console.warn('[WebRTCPeer] No screen sender found to remove');
            // Fallback: don't randomly remove video tracks anymore to prevent removing camera
        }

        // Note: Camera track is separate and untouched because we used distinct senders.
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
     * Signal that the next video track should be treated as screen share
     */
    setExpectScreenShare() {
        console.log('[WebRTCPeer] Expecting screen share on next video track');
        this.expectScreenShare = true;
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

        // Stop camera stream tracks
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
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
