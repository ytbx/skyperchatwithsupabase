/**
 * Connection Monitor - Network ve Browser Event Handling
 * Production-ready edge case management
 */

type ConnectionStatus = 'online' | 'offline' | 'reconnecting';
type ConnectionCallback = (status: ConnectionStatus) => void;

export class ConnectionMonitor {
  private static instance: ConnectionMonitor | null = null;
  private status: ConnectionStatus = 'online';
  private callbacks: Set<ConnectionCallback> = new Set();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;

  private constructor() {
    this.initializeMonitoring();
  }

  static getInstance(): ConnectionMonitor {
    if (!ConnectionMonitor.instance) {
      ConnectionMonitor.instance = new ConnectionMonitor();
    }
    return ConnectionMonitor.instance;
  }

  private initializeMonitoring() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    // Network online/offline events
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);

    // Page visibility (tab switching)
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Page unload/refresh
    window.addEventListener('beforeunload', this.handleBeforeUnload);

    // Initial status check
    this.status = navigator.onLine ? 'online' : 'offline';
    
    console.log('[ConnectionMonitor] Monitoring started, initial status:', this.status);
  }

  private handleOnline = () => {
    console.log('[ConnectionMonitor] Network online detected');
    this.status = 'online';
    this.reconnectAttempts = 0;
    this.notifyCallbacks('online');
  };

  private handleOffline = () => {
    console.log('[ConnectionMonitor] Network offline detected');
    this.status = 'offline';
    this.notifyCallbacks('offline');
    this.startReconnectionAttempts();
  };

  private handleVisibilityChange = () => {
    if (document.hidden) {
      console.log('[ConnectionMonitor] Tab hidden');
      // Don't change status, but notify callbacks
    } else {
      console.log('[ConnectionMonitor] Tab visible');
      // Check connection status when tab becomes visible
      if (!navigator.onLine && this.status === 'online') {
        this.handleOffline();
      } else if (navigator.onLine && this.status === 'offline') {
        this.handleOnline();
      }
    }
  };

  private handleBeforeUnload = () => {
    console.log('[ConnectionMonitor] Page unloading');
    // Cleanup will be handled by component unmount
  };

  private startReconnectionAttempts() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    const attemptReconnect = () => {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.log('[ConnectionMonitor] Max reconnection attempts reached');
        return;
      }

      this.reconnectAttempts++;
      this.status = 'reconnecting';
      console.log(`[ConnectionMonitor] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      this.notifyCallbacks('reconnecting');

      // Check if online after delay
      this.reconnectTimer = setTimeout(() => {
        if (navigator.onLine) {
          this.handleOnline();
        } else {
          attemptReconnect();
        }
      }, 3000 * this.reconnectAttempts); // Exponential backoff
    };

    attemptReconnect();
  }

  private notifyCallbacks(status: ConnectionStatus) {
    this.callbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('[ConnectionMonitor] Callback error:', error);
      }
    });
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public isOnline(): boolean {
    return this.status === 'online' && navigator.onLine;
  }

  public subscribe(callback: ConnectionCallback): () => void {
    this.callbacks.add(callback);
    // Immediately notify with current status
    callback(this.status);
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  public cleanup() {
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    this.callbacks.clear();
    this.isMonitoring = false;
    console.log('[ConnectionMonitor] Cleanup completed');
  }
}

// Singleton instance export
export const connectionMonitor = ConnectionMonitor.getInstance();
