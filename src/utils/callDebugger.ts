/**
 * Call Debug Helper - Comprehensive debugging and logging for call system
 * Use this to track and diagnose call flow issues
 */

export class CallDebugger {
  private static instance: CallDebugger | null = null;
  private logs: Array<{ timestamp: number; category: string; message: string; data?: any }> = [];
  private maxLogs = 1000;
  private enabled = true;

  private constructor() {
    console.log('[CallDebugger] Initialized');
  }

  static getInstance(): CallDebugger {
    if (!CallDebugger.instance) {
      CallDebugger.instance = new CallDebugger();
    }
    return CallDebugger.instance;
  }

  log(category: string, message: string, data?: any) {
    if (!this.enabled) return;

    const logEntry = {
      timestamp: Date.now(),
      category,
      message,
      data
    };

    this.logs.push(logEntry);
    
    // Keep only last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Console output with color coding
    const color = this.getCategoryColor(category);
    console.log(
      `%c[${category}] ${message}`,
      `color: ${color}; font-weight: bold`,
      data || ''
    );
  }

  private getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      'CALL_FLOW': '#00ff00',
      'STATE_CHANGE': '#ffff00',
      'WEBRTC': '#00ffff',
      'SIGNAL': '#ff00ff',
      'DATABASE': '#ff9900',
      'ERROR': '#ff0000',
      'SUCCESS': '#00ff00',
      'WARNING': '#ffaa00'
    };
    return colors[category] || '#ffffff';
  }

  // Get call flow timeline
  getCallFlowTimeline(): string {
    const callLogs = this.logs.filter(log => 
      log.category === 'CALL_FLOW' || 
      log.category === 'STATE_CHANGE' ||
      log.category === 'WEBRTC'
    );

    let timeline = '\n=== CALL FLOW TIMELINE ===\n';
    const startTime = callLogs.length > 0 ? callLogs[0].timestamp : Date.now();

    callLogs.forEach(log => {
      const elapsed = ((log.timestamp - startTime) / 1000).toFixed(2);
      timeline += `[+${elapsed}s] [${log.category}] ${log.message}\n`;
      if (log.data) {
        timeline += `  Data: ${JSON.stringify(log.data, null, 2)}\n`;
      }
    });

    return timeline;
  }

  // Get state history
  getStateHistory(): Array<{ time: string; state: any }> {
    return this.logs
      .filter(log => log.category === 'STATE_CHANGE')
      .map(log => ({
        time: new Date(log.timestamp).toISOString(),
        state: log.data
      }));
  }

  // Get error summary
  getErrorSummary(): string {
    const errors = this.logs.filter(log => log.category === 'ERROR');
    
    if (errors.length === 0) {
      return 'No errors logged';
    }

    let summary = '\n=== ERROR SUMMARY ===\n';
    errors.forEach((error, index) => {
      summary += `${index + 1}. ${error.message}\n`;
      if (error.data) {
        summary += `   Details: ${JSON.stringify(error.data)}\n`;
      }
    });

    return summary;
  }

  // Export logs for debugging
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // Clear logs
  clear() {
    this.logs = [];
    console.log('[CallDebugger] Logs cleared');
  }

  // Enable/disable debugging
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    console.log('[CallDebugger] Debugging', enabled ? 'enabled' : 'disabled');
  }

  // Check call state consistency
  checkStateConsistency(currentState: {
    isInCall: boolean;
    isCalling: boolean;
    isReceiving: boolean;
    callActive: boolean;
  }): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check for conflicting states
    if (currentState.isCalling && currentState.isReceiving) {
      issues.push('CONFLICT: Both isCalling and isReceiving are true');
    }

    if (currentState.isInCall && !currentState.callActive) {
      issues.push('CONFLICT: isInCall true but callActive false');
    }

    if (currentState.callActive && currentState.isCalling) {
      issues.push('CONFLICT: callActive true but still isCalling (should transition)');
    }

    if (currentState.callActive && currentState.isReceiving) {
      issues.push('CONFLICT: callActive true but still isReceiving (should transition)');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

// Global instance
export const callDebugger = CallDebugger.getInstance();

// Expose to window for browser console access
if (typeof window !== 'undefined') {
  (window as any).callDebugger = callDebugger;
  
  // Helper functions for console
  (window as any).getCallTimeline = () => {
    console.log(callDebugger.getCallFlowTimeline());
  };
  
  (window as any).getCallErrors = () => {
    console.log(callDebugger.getErrorSummary());
  };
  
  (window as any).exportCallLogs = () => {
    console.log(callDebugger.exportLogs());
  };

  console.log('%c[CallDebugger] Helper functions available:', 'color: cyan; font-weight: bold');
  console.log('  - window.getCallTimeline() - View call flow timeline');
  console.log('  - window.getCallErrors() - View error summary');
  console.log('  - window.exportCallLogs() - Export all logs');
  console.log('  - window.callDebugger - Direct access to debugger');
}
