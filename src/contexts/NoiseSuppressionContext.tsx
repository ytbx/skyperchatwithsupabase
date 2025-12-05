import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { setNoiseSuppressionEnabled, getNoiseSuppressionEnabled } from '@/utils/NoiseSuppression';

interface NoiseSuppressionContextType {
    isNoiseSuppressionEnabled: boolean;
    toggleNoiseSuppression: () => void;
}

const NoiseSuppressionContext = createContext<NoiseSuppressionContextType | undefined>(undefined);

const STORAGE_KEY = 'noise-suppression-enabled';

export function NoiseSuppressionProvider({ children }: { children: ReactNode }) {
    // Load initial state from localStorage
    const [isNoiseSuppressionEnabled, setIsNoiseSuppressionEnabled] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            const enabled = saved === 'true';
            // Sync with utility module
            setNoiseSuppressionEnabled(enabled);
            return enabled;
        } catch {
            return false;
        }
    });

    // Save to localStorage and update utility when changed
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, String(isNoiseSuppressionEnabled));
            // Update the noise suppression utility - this affects all active streams!
            setNoiseSuppressionEnabled(isNoiseSuppressionEnabled);
            console.log('[NoiseSuppressionContext] Updated noise suppression state:', isNoiseSuppressionEnabled);
        } catch {
            // Ignore localStorage errors
        }
    }, [isNoiseSuppressionEnabled]);

    const toggleNoiseSuppression = useCallback(() => {
        setIsNoiseSuppressionEnabled(prev => !prev);
    }, []);

    const value: NoiseSuppressionContextType = {
        isNoiseSuppressionEnabled,
        toggleNoiseSuppression
    };

    return (
        <NoiseSuppressionContext.Provider value={value}>
            {children}
        </NoiseSuppressionContext.Provider>
    );
}

export function useNoiseSuppression() {
    const context = useContext(NoiseSuppressionContext);
    if (context === undefined) {
        throw new Error('useNoiseSuppression must be used within a NoiseSuppressionProvider');
    }
    return context;
}
