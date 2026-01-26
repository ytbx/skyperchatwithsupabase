import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export interface DeviceSettings {
    audioInputDeviceId: string;
    audioOutputDeviceId: string;
    videoInputDeviceId: string;
}

export interface Keybinds {
    mute: string;
    deafen: string;
}

interface DeviceSettingsContextType {
    // Device Selections
    audioInputDeviceId: string;
    audioOutputDeviceId: string;
    videoInputDeviceId: string;
    setAudioInputDeviceId: (id: string) => void;
    setAudioOutputDeviceId: (id: string) => void;
    setVideoInputDeviceId: (id: string) => void;

    // Available Devices
    audioInputs: MediaDeviceInfo[];
    audioOutputs: MediaDeviceInfo[];
    videoInputs: MediaDeviceInfo[];
    refreshDevices: () => Promise<void>;

    // Keybinds
    keybinds: Keybinds;
    setKeybind: (action: keyof Keybinds, shortcut: string) => Promise<void>;
    clearKeybind: (action: keyof Keybinds) => Promise<void>;
    isElectron: boolean;
    showTaskbarController: boolean;
    setShowTaskbarController: (show: boolean) => void;
}

const DeviceSettingsContext = createContext<DeviceSettingsContextType | undefined>(undefined);

const STORAGE_KEY_DEVICES = 'device_settings_v1';
const STORAGE_KEY_KEYBINDS = 'keybind_settings_v1';

const DEFAULT_KEYBINDS: Keybinds = {
    mute: '',
    deafen: ''
};

export function DeviceSettingsProvider({ children }: { children: ReactNode }) {
    // Device State
    const [audioInputDeviceId, setAudioInputDevice] = useState<string>('default');
    const [audioOutputDeviceId, setAudioOutputDevice] = useState<string>('default');
    const [videoInputDeviceId, setVideoInputDevice] = useState<string>('default');

    // Device Lists
    const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
    const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([]);
    const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);

    // Keybind State
    const [keybinds, setKeybinds] = useState<Keybinds>(DEFAULT_KEYBINDS);

    // Other settings
    const [showTaskbarController, setShowTaskbarController] = useState<boolean>(true);

    // Electron Detection
    const isElectron = typeof window !== 'undefined' && !!(window as any).electron;

    // Load Settings
    useEffect(() => {
        try {
            const savedDevices = localStorage.getItem(STORAGE_KEY_DEVICES);
            if (savedDevices) {
                const parsed = JSON.parse(savedDevices);
                setAudioInputDevice(parsed.audioInputDeviceId || 'default');
                setAudioOutputDevice(parsed.audioOutputDeviceId || 'default');
                setVideoInputDevice(parsed.videoInputDeviceId || 'default');
            }

            const savedKeybinds = localStorage.getItem(STORAGE_KEY_KEYBINDS);
            if (savedKeybinds) {
                const parsed = JSON.parse(savedKeybinds);
                setKeybinds(parsed);
                // Register saved keybinds if in Electron
                if (isElectron && (window as any).electron?.globalShortcuts) {
                    if (parsed.mute) (window as any).electron.globalShortcuts.register(parsed.mute);
                    if (parsed.deafen) (window as any).electron.globalShortcuts.register(parsed.deafen);
                }
            }

            const savedTaskbarSetting = localStorage.getItem('show_taskbar_controller');
            if (savedTaskbarSetting !== null) {
                setShowTaskbarController(savedTaskbarSetting === 'true');
            }
        } catch (error) {
            console.error('[DeviceSettings] Error loading settings:', error);
        }
    }, [isElectron]);

    // Save Settings
    useEffect(() => {
        const settings = {
            audioInputDeviceId,
            audioOutputDeviceId,
            videoInputDeviceId
        };
        localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(settings));
    }, [audioInputDeviceId, audioOutputDeviceId, videoInputDeviceId]);

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY_KEYBINDS, JSON.stringify(keybinds));
    }, [keybinds]);

    useEffect(() => {
        localStorage.setItem('show_taskbar_controller', String(showTaskbarController));
    }, [showTaskbarController]);

    // Device Enumeration
    const refreshDevices = useCallback(async (includeVideo = false) => {
        try {
            // Request permission to list labels
            // PRIVACY FIX: Only request audio by default. 
            // In most browsers, granting mic access allows seeing labels for all devices (including cameras).
            // This prevents the camera light from turning on unnecessarily.
            await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: includeVideo
            }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => { });

            const devices = await navigator.mediaDevices.enumerateDevices();
            setAudioInputs(devices.filter(d => d.kind === 'audioinput'));
            setAudioOutputs(devices.filter(d => d.kind === 'audiooutput'));
            setVideoInputs(devices.filter(d => d.kind === 'videoinput'));
        } catch (error) {
            console.error('[DeviceSettings] Error enumerating devices:', error);
        }
    }, []);

    // Initial Refresh
    useEffect(() => {
        refreshDevices();
        const handleDeviceChange = () => refreshDevices();
        navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
        return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    }, [refreshDevices]);

    // Keybind Management
    const setKeybind = useCallback(async (action: keyof Keybinds, shortcut: string) => {
        if (isElectron && (window as any).electron?.globalShortcuts) {
            // Unregister old shortcut if exists
            const oldShortcut = keybinds[action];
            if (oldShortcut) {
                await (window as any).electron.globalShortcuts.unregister(oldShortcut);
            }
            // Register new shortcut
            const success = await (window as any).electron.globalShortcuts.register(shortcut);
            if (!success) {
                console.warn('[DeviceSettings] Failed to register global shortcut:', shortcut);
                // Depending on requirements we might still save it or reject
            }
        }
        setKeybinds(prev => ({ ...prev, [action]: shortcut }));
    }, [keybinds, isElectron]);

    const clearKeybind = useCallback(async (action: keyof Keybinds) => {
        const oldShortcut = keybinds[action];
        if (oldShortcut && isElectron && (window as any).electron?.globalShortcuts) {
            await (window as any).electron.globalShortcuts.unregister(oldShortcut);
        }
        setKeybinds(prev => ({ ...prev, [action]: '' }));
    }, [keybinds, isElectron]);

    return (
        <DeviceSettingsContext.Provider value={{
            audioInputDeviceId,
            audioOutputDeviceId,
            videoInputDeviceId,
            setAudioInputDeviceId: setAudioInputDevice,
            setAudioOutputDeviceId: setAudioOutputDevice,
            setVideoInputDeviceId: setVideoInputDevice,
            audioInputs,
            audioOutputs,
            videoInputs,
            refreshDevices,
            keybinds,
            setKeybind,
            clearKeybind,
            isElectron,
            showTaskbarController,
            setShowTaskbarController
        }}>
            {children}
        </DeviceSettingsContext.Provider>
    );
}

export function useDeviceSettings() {
    const context = useContext(DeviceSettingsContext);
    if (context === undefined) {
        throw new Error('useDeviceSettings must be used within a DeviceSettingsProvider');
    }
    return context;
}
