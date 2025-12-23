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
    onRemoteTrackChanged: () => void; // Notify when tracks are added or removed
}

export class WebRTCPeer {
    private pc: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private cameraStream: MediaStream | null = null;
    private screenStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private remoteSoundpadStream: MediaStream | null = null;

    private cameraSender: RTCRtpSender | null = null;
    private screenSender: RTCRtpSender | null = null;

    private remoteStreamId: string | null = null;

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

            // Monitor track removal on the stream
            event.streams.forEach(stream => {
                stream.onremovetrack = (ev) => {
                    console.log('[WebRTCPeer] Remote track removed:', ev.track.kind, ev.track.label);
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
            this.audioTrackCount++;
            console.log('[WebRTCPeer] Audio track #', this.audioTrackCount);

            if (this.audioTrackCount === 1) {
                // First audio stream -> Main Voice/Camera Stream
                if (!this.remoteStream) {
                    this.remoteStream = new MediaStream();
                    this.remoteStreamId = stream.id;
                } else if (this.remoteStreamId && this.remoteStreamId !== stream.id) {
                    // Mismatch? We'll assume the first one we set is the "Main" one.
                    console.warn('[WebRTCPeer] Audio stream ID mismatch, expected:', this.remoteStreamId, 'got:', stream.id);
                }

                this.remoteStream.addTrack(track);
                this.callbacks.onRemoteStream(this.remoteStream);
                console.log('[WebRTCPeer] ✓ Voice track added');

            } else if (this.audioTrackCount === 2) {
                // Second audio track = soundpad
                if (!this.remoteSoundpadStream) {
                    this.remoteSoundpadStream = new MediaStream();
                }
                // Check if this audio belongs to screen share?
                // Usually soundpad is separate stream. WebRTCPeer assumes specific order/logic.
                // Keeping existing logic for Soundpad.
                this.remoteSoundpadStream.addTrack(track);
                this.callbacks.onRemoteSoundpad(this.remoteSoundpadStream);
                console.log('[WebRTCPeer] ✓ Soundpad track added');
            } else {
                // Additional audio (screen share audio)
                // If it belongs to screen share stream
                if (stream.id !== this.remoteStreamId && stream.id !== this.remoteSoundpadStream?.id) {
                    console.log('[WebRTCPeer] Screen share audio track?');
                    // We don't have a dedicated "RemoteScreenStream" object to add to exposed by callbacks,
                    // but the video handler handles the screen stream.
                    // Often screen share audio comes with the video stream.
                }
            }
        } else if (track.kind === 'video') {

            // Logic:
            // 1. If we have a remoteStreamId, and this stream matches -> Camera
            // 2. If we DON'T have a remoteStreamId, we assume the first one is Camera (unless we know otherwise?)
            //    - Actually, if I start a call with NO camera, and they share screen, that might be the first video.
            //    - But usually Audio comes first and establishes remoteStreamId.

            let isCamera = false;

            if (this.remoteStreamId) {
                if (stream.id === this.remoteStreamId) {
                    isCamera = true;
                }
            } else {
                // No audio yet? Fallback.
                // If it's the first video track...
                if (!this.remoteStream) {
                    this.remoteStream = new MediaStream();
                    this.remoteStreamId = stream.id;
                    isCamera = true;
                } else {
                    // verifying id
                    if (stream.id === this.remoteStream.id) {
                        isCamera = true;
                    }
                }
            }

            if (isCamera) {
                console.log('[WebRTCPeer] Assigning as Primary (Camera) Video');
                this.remoteStream?.addTrack(track);
                if (this.remoteStream) {
                    this.callbacks.onRemoteStream(this.remoteStream);
                }
            } else {
                // Different stream ID -> Screen Share
                console.log('[WebRTCPeer] Assigning as Secondary (Screen) Video');
                // Create a new stream object for the UI to consume
                const screenStream = new MediaStream([track]);
                this.callbacks.onRemoteVideo(screenStream);
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
     * Replace audio track mid-call
     */
    async replaceAudioTrack(deviceId: string): Promise<MediaStream | null> {
        if (!this.pc) return;

        console.log('[WebRTCPeer] Replacing audio track with device:', deviceId);

        const newStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: false
        });

        const newTrack = newStream.getAudioTracks()[0];
        if (!newTrack) throw new Error('No audio track in new stream');

        // Find main audio sender
        const sender = this.pc.getSenders().find(s => s.track?.kind === 'audio');
        if (sender) {
            await sender.replaceTrack(newTrack);
        }

        // Update localStream
        if (this.localStream) {
            const oldTracks = this.localStream.getAudioTracks();
            oldTracks.forEach(t => {
                t.stop();
                this.localStream?.removeTrack(t);
            });
            this.localStream.addTrack(newTrack);
        } else {
            this.localStream = newStream;
        }

        console.log('[WebRTCPeer] ✓ Audio track replaced');
        return this.localStream;
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
            this.cameraSender = this.pc.addTrack(videoTrack, cameraStream);
            console.log('[WebRTCPeer] ✓ Camera track added mid-call');
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
