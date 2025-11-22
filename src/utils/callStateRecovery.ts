/**
 * Call State Recovery - Handle page refresh and unexpected disconnections
 */

interface CallState {
  isActive: boolean;
  isCalling: boolean;
  isReceiving: boolean;
  contactId: string | null;
  contactName: string | null;
  callerId: string | null;
  callerName: string | null;
  timestamp: number;
}

const CALL_STATE_KEY = 'webrtc_call_state';
const STATE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export class CallStateRecovery {
  /**
   * Save call state to sessionStorage
   */
  static saveCallState(state: CallState): void {
    try {
      const stateWithTimestamp = {
        ...state,
        timestamp: Date.now(),
      };
      sessionStorage.setItem(CALL_STATE_KEY, JSON.stringify(stateWithTimestamp));
      console.log('[CallStateRecovery] Call state saved');
    } catch (error) {
      console.error('[CallStateRecovery] Failed to save call state:', error);
    }
  }

  /**
   * Load call state from sessionStorage
   */
  static loadCallState(): CallState | null {
    try {
      const stored = sessionStorage.getItem(CALL_STATE_KEY);
      if (!stored) return null;

      const state = JSON.parse(stored) as CallState;
      
      // Check if state is expired
      if (Date.now() - state.timestamp > STATE_EXPIRY_MS) {
        console.log('[CallStateRecovery] Call state expired, clearing');
        CallStateRecovery.clearCallState();
        return null;
      }

      console.log('[CallStateRecovery] Call state loaded');
      return state;
    } catch (error) {
      console.error('[CallStateRecovery] Failed to load call state:', error);
      return null;
    }
  }

  /**
   * Clear call state from sessionStorage
   */
  static clearCallState(): void {
    try {
      sessionStorage.removeItem(CALL_STATE_KEY);
      console.log('[CallStateRecovery] Call state cleared');
    } catch (error) {
      console.error('[CallStateRecovery] Failed to clear call state:', error);
    }
  }

  /**
   * Check if there's an active call that needs cleanup
   */
  static hasActiveCallToCleanup(): boolean {
    const state = CallStateRecovery.loadCallState();
    return state !== null && (state.isActive || state.isCalling || state.isReceiving);
  }

  /**
   * Handle page refresh during active call
   */
  static handlePageRefresh(): CallState | null {
    const state = CallStateRecovery.loadCallState();
    
    if (!state) return null;

    // If there was an active call, it needs to be terminated
    if (state.isActive || state.isCalling || state.isReceiving) {
      console.warn('[CallStateRecovery] Active call detected after page refresh - needs cleanup');
      
      // Clear the state as the WebRTC connections are lost
      CallStateRecovery.clearCallState();
      
      // Return the state for cleanup notification
      return state;
    }

    return null;
  }
}
