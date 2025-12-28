/**
 * SignalingChannel - Clean signaling service for WebRTC
 * 
 * Key features:
 * - Subscribes to Supabase realtime for signals
 * - Built-in signal deduplication
 * - Simple send methods with error handling
 */

import { supabase } from '@/lib/supabase';

export type SignalType =
    | 'offer'
    | 'answer'
    | 'ice-candidate'
    | 'call-ended'
    | 'call-rejected'
    | 'call-cancelled'
    | 'screen-share-started'
    | 'screen-share-stopped'
    | 'camera-started'
    | 'camera-stopped'
    | 'audio-state-change';

export interface CallSignal {
    id: string;
    call_id: string;
    from_user_id: string;
    to_user_id: string;
    signal_type: SignalType;
    payload: RTCSessionDescriptionInit | RTCIceCandidateInit | Record<string, any>;
    created_at: string;
}

export type SignalHandler = (signal: CallSignal) => Promise<void>;

export class SignalingChannel {
    private callId: string;
    private userId: string;
    private peerId: string;
    private channel: ReturnType<typeof supabase.channel> | null = null;
    private handler: SignalHandler | null = null;
    private processedIds: Set<string> = new Set();
    private isSubscribed = false;

    constructor(callId: string, userId: string, peerId: string) {
        this.callId = callId;
        this.userId = userId;
        this.peerId = peerId;
        console.log('[SignalingChannel] Created for call:', callId);
    }

    /**
     * Subscribe to signals for this call
     */
    async subscribe(handler: SignalHandler): Promise<void> {
        if (this.isSubscribed) {
            console.log('[SignalingChannel] Already subscribed, reusing');
            this.handler = handler;
            return;
        }

        this.handler = handler;

        // First, process any historical signals that were sent before we subscribed
        console.log('[SignalingChannel] Fetching historical signals');
        const { data: historicalSignals, error: fetchError } = await supabase
            .from('webrtc_signals')
            .select('*')
            .eq('call_id', this.callId)
            .eq('to_user_id', this.userId)
            .eq('from_user_id', this.peerId)
            .order('created_at', { ascending: true });

        if (!fetchError && historicalSignals) {
            console.log('[SignalingChannel] Processing', historicalSignals.length, 'historical signals');
            for (const signal of historicalSignals) {
                if (!this.processedIds.has(signal.id)) {
                    this.processedIds.add(signal.id);
                    await this.handler(signal as CallSignal);
                }
            }
        }

        // Create unique channel for this call
        const channelName = `call_signals_${this.callId}_${this.userId}_${Date.now()}`;
        this.channel = supabase.channel(channelName);

        // Subscribe to new signals
        this.channel.on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'webrtc_signals',
                filter: `call_id=eq.${this.callId}`
            },
            async (payload) => {
                const signal = payload.new as CallSignal;
                console.log('[SignalingChannel] Received signal:', signal.signal_type, 'from:', signal.from_user_id);

                // Only process signals meant for us and not already processed
                if (signal.to_user_id === this.userId &&
                    signal.from_user_id === this.peerId &&
                    !this.processedIds.has(signal.id)) {
                    console.log('[SignalingChannel] Received signal:', signal.signal_type);
                    this.processedIds.add(signal.id);
                    await this.handler?.(signal);
                }
            }
        );

        // Wait for channel to be subscribed
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Channel subscription timeout'));
            }, 10000);

            this.channel!.subscribe((status) => {
                console.log('[SignalingChannel] Channel status:', status);
                if (status === 'SUBSCRIBED') {
                    clearTimeout(timeout);
                    this.isSubscribed = true;
                    console.log('[SignalingChannel] ✓ Subscribed successfully');
                    resolve();
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    clearTimeout(timeout);
                    reject(new Error(`Channel subscription failed: ${status}`));
                }
            });
        });
    }

    /**
     * Send SDP offer
     */
    async sendOffer(offer: RTCSessionDescriptionInit): Promise<void> {
        console.log('[SignalingChannel] Sending offer');
        await this.sendSignal('offer', offer);
    }

    /**
     * Send SDP answer
     */
    async sendAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
        console.log('[SignalingChannel] Sending answer');
        await this.sendSignal('answer', answer);
    }

    /**
     * Send ICE candidate
     */
    async sendIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        console.log('[SignalingChannel] Sending ICE candidate');
        await this.sendSignal('ice-candidate', candidate);
    }

    /**
     * Send call ended signal
     */
    async sendCallEnded(): Promise<void> {
        console.log('[SignalingChannel] Sending call-ended');
        await this.sendSignal('call-ended', {});
    }

    /**
     * Send call rejected signal
     */
    async sendCallRejected(): Promise<void> {
        console.log('[SignalingChannel] Sending call-rejected');
        await this.sendSignal('call-rejected', {});
    }

    /**
     * Send call cancelled signal
     */
    async sendCallCancelled(): Promise<void> {
        console.log('[SignalingChannel] Sending call-cancelled');
        await this.sendSignal('call-cancelled', {});
    }

    /**
     * Send screen share started signal
     */
    async sendScreenShareStarted(): Promise<void> {
        console.log('[SignalingChannel] Sending screen-share-started');
        await this.sendSignal('screen-share-started', {});
    }

    /**
     * Send screen share stopped signal
     */
    async sendScreenShareStopped(): Promise<void> {
        console.log('[SignalingChannel] Sending screen-share-stopped');
        await this.sendSignal('screen-share-stopped', {});
    }

    /**
     * Send camera started signal
     */
    async sendCameraStarted(): Promise<void> {
        console.log('[SignalingChannel] Sending camera-started');
        await this.sendSignal('camera-started', {});
    }

    /**
     * Send camera stopped signal
     */
    async sendCameraStopped(): Promise<void> {
        console.log('[SignalingChannel] Sending camera-stopped');
        await this.sendSignal('camera-stopped', {});
    }

    /**
     * Send audio state change signal
     */
    async sendAudioState(isMuted: boolean, isDeafened: boolean): Promise<void> {
        console.log('[SignalingChannel] Sending audio-state-change:', { isMuted, isDeafened });
        await this.sendSignal('audio-state-change', { isMuted, isDeafened } as any);
    }

    /**
     * Generic signal sender
     */
    private async sendSignal(type: SignalType, payload: RTCSessionDescriptionInit | RTCIceCandidateInit | Record<string, never>): Promise<void> {
        const { error } = await supabase
            .from('webrtc_signals')
            .insert({
                call_id: this.callId,
                from_user_id: this.userId,
                to_user_id: this.peerId,
                signal_type: type,
                payload
            });

        if (error) {
            console.error('[SignalingChannel] Error sending signal:', error);
            throw error;
        }

        console.log('[SignalingChannel] ✓ Signal sent:', type);
    }

    /**
     * Cleanup and close channel
     */
    async close(): Promise<void> {
        console.log('[SignalingChannel] Closing channel');

        this.isSubscribed = false;
        this.processedIds.clear();
        this.handler = null;

        if (this.channel) {
            await this.channel.unsubscribe();
            this.channel = null;
        }

        // Clean up signals from database
        await supabase
            .from('webrtc_signals')
            .delete()
            .eq('call_id', this.callId);

        console.log('[SignalingChannel] ✓ Closed and cleaned up');
    }
}
