import { supabase } from '@/lib/supabase';
import { CallSignal } from '@/lib/types';

/**
 * SignalingService handles WebRTC signaling via Supabase Realtime
 * Manages offer/answer exchange and ICE candidate relay between peers
 */
export class SignalingService {
    private callId: string;
    private userId: string;
    private peerId: string;
    private channel: any;
    private onSignalCallback?: (signal: CallSignal) => void;
    private isInitialized: boolean = false;
    private processedSignalIds: Set<string> = new Set();

    constructor(callId: string, userId: string, peerId: string) {
        this.callId = callId;
        this.userId = userId;
        this.peerId = peerId;
    }

    /**
     * Initialize Supabase Realtime channel for this call
     */
    async initialize(onSignal: (signal: CallSignal) => void): Promise<void> {
        if (this.isInitialized) {
            console.log('[SignalingService] Already initialized, skipping...');
            return;
        }

        this.onSignalCallback = onSignal;

        // If channel already exists, clean it up first to avoid duplicates
        if (this.channel) {
            console.log('[SignalingService] Cleaning up existing channel before re-initialization');
            await this.channel.unsubscribe();
            this.channel = null;
        }

        // First, fetch any existing signals that were sent before we subscribed
        console.log('[SignalingService] Fetching historical signals');
        const { data: historicalSignals, error: fetchError } = await supabase
            .from('webrtc_signals')
            .select('*')
            .eq('call_id', this.callId)
            .eq('to_user_id', this.userId)
            .eq('from_user_id', this.peerId)
            .order('created_at', { ascending: true });

        if (!fetchError && historicalSignals) {
            console.log('[SignalingService] Processing', historicalSignals.length, 'historical signals');
            for (const signal of historicalSignals) {
                const signalId = (signal as any).id;
                // Avoid processing duplicate signals
                if (!this.processedSignalIds.has(signalId)) {
                    this.processedSignalIds.add(signalId);
                    await this.onSignalCallback?.(signal as CallSignal);
                }
            }
        }

        // Create unique channel for this call
        const channelName = `direct_call_${this.callId}_${Date.now()}`;

        this.channel = supabase.channel(channelName);

        // Subscribe to postgres changes for webrtc_signals
        this.channel
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'webrtc_signals',
                    filter: `call_id=eq.${this.callId}`
                },
                async (payload: any) => {
                    const signal = payload.new as CallSignal;
                    const signalId = (signal as any).id;

                    // Only process signals meant for us and not already processed
                    if (signal.to_user_id === this.userId &&
                        signal.from_user_id === this.peerId &&
                        !this.processedSignalIds.has(signalId)) {
                        console.log('[SignalingService] Received realtime signal:', signal.signal_type);
                        this.processedSignalIds.add(signalId);
                        await this.onSignalCallback?.(signal);
                    }
                }
            );

        // Wait for channel to be subscribed before continuing
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('[SignalingService] Channel subscription timeout'));
            }, 10000); // 10 second timeout

            this.channel.subscribe((status: string) => {
                console.log('[SignalingService] Channel subscription status:', status);
                if (status === 'SUBSCRIBED') {
                    clearTimeout(timeout);
                    this.isInitialized = true;
                    console.log('[SignalingService] ✓ Channel successfully subscribed and ready');
                    resolve();
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                    clearTimeout(timeout);
                    reject(new Error(`[SignalingService] Channel subscription failed with status: ${status}`));
                }
            });
        });
    }

    /**
     * Send SDP offer to peer
     */
    async sendOffer(offer: RTCSessionDescriptionInit) {
        console.log('[SignalingService] Sending offer');

        const { error } = await supabase
            .from('webrtc_signals')
            .insert({
                call_id: this.callId,
                from_user_id: this.userId,
                to_user_id: this.peerId,
                signal_type: 'offer',
                payload: offer
            });

        if (error) {
            console.error('[SignalingService] Error sending offer:', error);
            throw error;
        }
    }

    /**
     * Send SDP answer to peer
     */
    async sendAnswer(answer: RTCSessionDescriptionInit) {
        console.log('[SignalingService] Sending answer');

        const { error } = await supabase
            .from('webrtc_signals')
            .insert({
                call_id: this.callId,
                from_user_id: this.userId,
                to_user_id: this.peerId,
                signal_type: 'answer',
                payload: answer
            });

        if (error) {
            console.error('[SignalingService] Error sending answer:', error);
            throw error;
        }
    }

    /**
     * Send ICE candidate to peer
     */
    async sendICECandidate(candidate: RTCIceCandidateInit) {
        console.log('[SignalingService] Sending ICE candidate');

        const { error } = await supabase
            .from('webrtc_signals')
            .insert({
                call_id: this.callId,
                from_user_id: this.userId,
                to_user_id: this.peerId,
                signal_type: 'ice-candidate',
                payload: candidate
            });

        if (error) {
            console.error('[SignalingService] Error sending ICE candidate:', error);
            throw error;
        }
    }

    /**
     * Send call ended signal to peer
     */
    async sendCallEnded() {
        console.log('[SignalingService] ========== SENDING CALL-ENDED SIGNAL ==========');
        console.log('[SignalingService] Call ID:', this.callId);
        console.log('[SignalingService] From:', this.userId);
        console.log('[SignalingService] To:', this.peerId);

        const { data, error } = await supabase
            .from('webrtc_signals')
            .insert({
                call_id: this.callId,
                from_user_id: this.userId,
                to_user_id: this.peerId,
                signal_type: 'call-ended',
                payload: {}
            })
            .select();

        if (error) {
            console.error('[SignalingService] ✗ Error sending call ended signal:', error);
            throw error;
        }

        console.log('[SignalingService] ✓ Call-ended signal inserted into database:', data);
    }

    /**
     * Send call rejected signal to peer
     */
    async sendCallRejected() {
        console.log('[SignalingService] Sending call rejected signal');

        const { error } = await supabase
            .from('webrtc_signals')
            .insert({
                call_id: this.callId,
                from_user_id: this.userId,
                to_user_id: this.peerId,
                signal_type: 'call-rejected',
                payload: {}
            });

        if (error) {
            console.error('[SignalingService] Error sending call rejected signal:', error);
            throw error;
        }
    }

    /**
     * Send call cancelled signal to peer
     */
    async sendCallCancelled() {
        console.log('[SignalingService] Sending call cancelled signal');

        const { error } = await supabase
            .from('webrtc_signals')
            .insert({
                call_id: this.callId,
                from_user_id: this.userId,
                to_user_id: this.peerId,
                signal_type: 'call-cancelled',
                payload: {}
            });

        if (error) {
            console.error('[SignalingService] Error sending call cancelled signal:', error);
            throw error;
        }
    }

    /**
     * Send screen share started signal to peer
     */
    async sendScreenShareStarted() {
        console.log('[SignalingService] Sending screen share started signal');

        const { error } = await supabase
            .from('webrtc_signals')
            .insert({
                call_id: this.callId,
                from_user_id: this.userId,
                to_user_id: this.peerId,
                signal_type: 'screen-share-started',
                payload: {}
            });

        if (error) {
            console.error('[SignalingService] Error sending screen share started signal:', error);
            throw error;
        }
    }

    /**
     * Send screen share stopped signal to peer
     */
    async sendScreenShareStopped() {
        console.log('[SignalingService] Sending screen share stopped signal');

        const { error } = await supabase
            .from('webrtc_signals')
            .insert({
                call_id: this.callId,
                from_user_id: this.userId,
                to_user_id: this.peerId,
                signal_type: 'screen-share-stopped',
                payload: {}
            });

        if (error) {
            console.error('[SignalingService] Error sending screen share stopped signal:', error);
            throw error;
        }
    }

    /**
     * Clean up and close the signaling channel
     */
    async cleanup() {
        console.log('[SignalingService] Cleaning up');

        this.isInitialized = false;
        this.processedSignalIds.clear();

        if (this.channel) {
            await this.channel.unsubscribe();
            this.channel = null;
        }

        // Delete old signals for this call to keep database clean
        await supabase
            .from('webrtc_signals')
            .delete()
            .eq('call_id', this.callId);
    }
}
