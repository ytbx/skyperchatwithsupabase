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

    constructor(callId: string, userId: string, peerId: string) {
        this.callId = callId;
        this.userId = userId;
        this.peerId = peerId;
    }

    /**
     * Initialize Supabase Realtime channel for this call
     */
    async initialize(onSignal: (signal: CallSignal) => void) {
        this.onSignalCallback = onSignal;

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
                this.onSignalCallback?.(signal as CallSignal);
            }
        }

        // Create unique channel for this call
        const channelName = `direct_call_${this.callId}`;

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
                (payload: any) => {
                    const signal = payload.new as CallSignal;

                    // Only process signals meant for us
                    if (signal.to_user_id === this.userId && signal.from_user_id === this.peerId) {
                        console.log('[SignalingService] Received realtime signal:', signal.signal_type);
                        this.onSignalCallback?.(signal);
                    }
                }
            )
            .subscribe((status) => {
                console.log('[SignalingService] Channel status:', status);
            });

        return this.channel;
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
     * Clean up and close the signaling channel
     */
    async cleanup() {
        console.log('[SignalingService] Cleaning up');

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
