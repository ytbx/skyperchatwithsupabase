import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface UserAudioSettings {
    voiceVolume: number; // 0-2 (0% to 200%)
    voiceMuted: boolean;
    soundpadVolume: number; // 0-2 (0% to 200%)
    soundpadMuted: boolean;
    screenVolume: number; // 0-2 (0% to 200%)
    screenMuted: boolean;
}

interface UserAudioContextType {
    // Per-user voice settings
    getUserVoiceVolume: (userId: string) => number;
    getUserVoiceMuted: (userId: string) => boolean;
    setUserVoiceVolume: (userId: string, volume: number) => void;
    toggleUserVoiceMute: (userId: string) => void;

    // Per-user soundpad settings
    getUserSoundpadVolume: (userId: string) => number;
    getUserSoundpadMuted: (userId: string) => boolean;
    setUserSoundpadVolume: (userId: string, volume: number) => void;
    toggleUserSoundpadMute: (userId: string) => void;

    // Per-user screen settings
    getUserScreenVolume: (userId: string) => number;
    getUserScreenMuted: (userId: string) => boolean;
    setUserScreenVolume: (userId: string, volume: number) => void;
    toggleUserScreenMute: (userId: string) => void;

    // Global mute (for voice)
    isGlobalMuted: boolean;
    toggleGlobalMute: () => void;

    // Global soundpad mute (separate from voice)
    isGlobalSoundpadMuted: boolean;
    toggleGlobalSoundpadMute: () => void;

    // Get effective volume (considering mute states)
    getEffectiveVoiceVolume: (userId: string) => number;
    getEffectiveSoundpadVolume: (userId: string) => number;
    getEffectiveScreenVolume: (userId: string) => number;

    // Legacy compatibility (returns voice settings)
    getUserVolume: (userId: string) => number;
    getUserMuted: (userId: string) => boolean;
    setUserVolume: (userId: string, volume: number) => void;
    toggleUserMute: (userId: string) => void;
    getEffectiveVolume: (userId: string) => number;
}

const UserAudioContext = createContext<UserAudioContextType | undefined>(undefined);

const STORAGE_KEY = 'userAudioSettings_v2';
const GLOBAL_MUTE_KEY = 'globalAudioMute';
const GLOBAL_SOUNDPAD_MUTE_KEY = 'globalSoundpadMute';

interface StoredSettings {
    [userId: string]: UserAudioSettings;
}

const DEFAULT_SETTINGS: UserAudioSettings = {
    voiceVolume: 1.0,
    voiceMuted: false,
    soundpadVolume: 1.0,
    soundpadMuted: false,
    screenVolume: 1.0,
    screenMuted: false
};

export function UserAudioProvider({ children }: { children: ReactNode }) {
    const [userSettings, setUserSettings] = useState<StoredSettings>({});
    const [isGlobalMuted, setIsGlobalMuted] = useState(false);
    const [isGlobalSoundpadMuted, setIsGlobalSoundpadMuted] = useState(false);

    // Load settings from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setUserSettings(JSON.parse(stored));
            }

            const globalMute = localStorage.getItem(GLOBAL_MUTE_KEY);
            if (globalMute) {
                setIsGlobalMuted(JSON.parse(globalMute));
            }

            const globalSoundpadMute = localStorage.getItem(GLOBAL_SOUNDPAD_MUTE_KEY);
            if (globalSoundpadMute) {
                setIsGlobalSoundpadMuted(JSON.parse(globalSoundpadMute));
            }
        } catch (error) {
            console.error('[UserAudioContext] Error loading settings:', error);
        }
    }, []);

    // Save settings to localStorage whenever they change
    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(userSettings));
        } catch (error) {
            console.error('[UserAudioContext] Error saving settings:', error);
        }
    }, [userSettings]);

    useEffect(() => {
        try {
            localStorage.setItem(GLOBAL_MUTE_KEY, JSON.stringify(isGlobalMuted));
        } catch (error) {
            console.error('[UserAudioContext] Error saving global mute:', error);
        }
    }, [isGlobalMuted]);

    useEffect(() => {
        try {
            localStorage.setItem(GLOBAL_SOUNDPAD_MUTE_KEY, JSON.stringify(isGlobalSoundpadMuted));
        } catch (error) {
            console.error('[UserAudioContext] Error saving global soundpad mute:', error);
        }
    }, [isGlobalSoundpadMuted]);

    // Voice settings
    const getUserVoiceVolume = useCallback((userId: string): number => {
        return userSettings[userId]?.voiceVolume ?? 1.0;
    }, [userSettings]);

    const getUserVoiceMuted = useCallback((userId: string): boolean => {
        return userSettings[userId]?.voiceMuted ?? false;
    }, [userSettings]);

    const setUserVoiceVolume = useCallback((userId: string, volume: number) => {
        const clampedVolume = Math.max(0, Math.min(2, volume));
        setUserSettings(prev => ({
            ...prev,
            [userId]: {
                ...DEFAULT_SETTINGS,
                ...prev[userId],
                voiceVolume: clampedVolume
            }
        }));
    }, []);

    const toggleUserVoiceMute = useCallback((userId: string) => {
        setUserSettings(prev => ({
            ...prev,
            [userId]: {
                ...DEFAULT_SETTINGS,
                ...prev[userId],
                voiceMuted: !(prev[userId]?.voiceMuted ?? false)
            }
        }));
    }, []);

    // Soundpad settings
    const getUserSoundpadVolume = useCallback((userId: string): number => {
        return userSettings[userId]?.soundpadVolume ?? 1.0;
    }, [userSettings]);

    const getUserSoundpadMuted = useCallback((userId: string): boolean => {
        return userSettings[userId]?.soundpadMuted ?? false;
    }, [userSettings]);

    const setUserSoundpadVolume = useCallback((userId: string, volume: number) => {
        const clampedVolume = Math.max(0, Math.min(2, volume));
        setUserSettings(prev => ({
            ...prev,
            [userId]: {
                ...DEFAULT_SETTINGS,
                ...prev[userId],
                soundpadVolume: clampedVolume
            }
        }));
    }, []);

    const toggleUserSoundpadMute = useCallback((userId: string) => {
        setUserSettings(prev => ({
            ...prev,
            [userId]: {
                ...DEFAULT_SETTINGS,
                ...prev[userId],
                soundpadMuted: !(prev[userId]?.soundpadMuted ?? false)
            }
        }));
    }, []);

    // Screen settings
    const getUserScreenVolume = useCallback((userId: string): number => {
        return userSettings[userId]?.screenVolume ?? 1.0;
    }, [userSettings]);

    const getUserScreenMuted = useCallback((userId: string): boolean => {
        return userSettings[userId]?.screenMuted ?? false;
    }, [userSettings]);

    const setUserScreenVolume = useCallback((userId: string, volume: number) => {
        const clampedVolume = Math.max(0, Math.min(2, volume));
        setUserSettings(prev => ({
            ...prev,
            [userId]: {
                ...DEFAULT_SETTINGS,
                ...prev[userId],
                screenVolume: clampedVolume
            }
        }));
    }, []);

    const toggleUserScreenMute = useCallback((userId: string) => {
        setUserSettings(prev => ({
            ...prev,
            [userId]: {
                ...DEFAULT_SETTINGS,
                ...prev[userId],
                screenMuted: !(prev[userId]?.screenMuted ?? false)
            }
        }));
    }, []);

    const toggleGlobalMute = useCallback(() => {
        setIsGlobalMuted(prev => !prev);
    }, []);

    const toggleGlobalSoundpadMute = useCallback(() => {
        setIsGlobalSoundpadMuted(prev => !prev);
    }, []);

    const getEffectiveVoiceVolume = useCallback((userId: string): number => {
        if (isGlobalMuted) return 0;
        if (getUserVoiceMuted(userId)) return 0;
        return getUserVoiceVolume(userId);
    }, [isGlobalMuted, getUserVoiceMuted, getUserVoiceVolume]);

    const getEffectiveSoundpadVolume = useCallback((userId: string): number => {
        if (isGlobalSoundpadMuted) return 0;
        if (getUserSoundpadMuted(userId)) return 0;
        return getUserSoundpadVolume(userId);
    }, [isGlobalSoundpadMuted, getUserSoundpadMuted, getUserSoundpadVolume]);

    const getEffectiveScreenVolume = useCallback((userId: string): number => {
        if (isGlobalMuted) return 0; // Screen audio should respect global voice mute for now
        if (getUserScreenMuted(userId)) return 0;
        return getUserScreenVolume(userId);
    }, [isGlobalMuted, getUserScreenMuted, getUserScreenVolume]);

    // Legacy compatibility
    const getUserVolume = getUserVoiceVolume;
    const getUserMuted = getUserVoiceMuted;
    const setUserVolume = setUserVoiceVolume;
    const toggleUserMute = toggleUserVoiceMute;
    const getEffectiveVolume = getEffectiveVoiceVolume;

    return (
        <UserAudioContext.Provider
            value={{
                getUserVoiceVolume,
                getUserVoiceMuted,
                setUserVoiceVolume,
                toggleUserVoiceMute,
                getUserSoundpadVolume,
                getUserSoundpadMuted,
                setUserSoundpadVolume,
                toggleUserSoundpadMute,
                getUserScreenVolume,
                getUserScreenMuted,
                setUserScreenVolume,
                toggleUserScreenMute,
                isGlobalMuted,
                toggleGlobalMute,
                isGlobalSoundpadMuted,
                toggleGlobalSoundpadMute,
                getEffectiveVoiceVolume,
                getEffectiveSoundpadVolume,
                getEffectiveScreenVolume,
                // Legacy
                getUserVolume,
                getUserMuted,
                setUserVolume,
                toggleUserMute,
                getEffectiveVolume
            }}
        >
            {children}
        </UserAudioContext.Provider>
    );
}

export function useUserAudio() {
    const context = useContext(UserAudioContext);
    if (context === undefined) {
        throw new Error('useUserAudio must be used within a UserAudioProvider');
    }
    return context;
}
