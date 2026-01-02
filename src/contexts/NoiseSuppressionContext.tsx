import React, { createContext, useContext, useState, useEffect } from 'react';

interface NoiseSuppressionContextType {
    isEnabled: boolean;
    toggleNoiseSuppression: () => void;
}

const NoiseSuppressionContext = createContext<NoiseSuppressionContextType | undefined>(undefined);

export const NoiseSuppressionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isEnabled, setIsEnabled] = useState(() => {
        const saved = localStorage.getItem('noise_suppression_enabled');
        return saved === 'true';
    });

    const toggleNoiseSuppression = () => {
        setIsEnabled(prev => {
            const newState = !prev;
            localStorage.setItem('noise_suppression_enabled', String(newState));
            return newState;
        });
    };

    return (
        <NoiseSuppressionContext.Provider value={{ isEnabled, toggleNoiseSuppression }}>
            {children}
        </NoiseSuppressionContext.Provider>
    );
};

export const useNoiseSuppression = () => {
    const context = useContext(NoiseSuppressionContext);
    if (context === undefined) {
        throw new Error('useNoiseSuppression must be used within a NoiseSuppressionProvider');
    }
    return context;
};
