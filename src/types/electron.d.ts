export interface DesktopCapturerSource {
    id: string;
    name: string;
    thumbnail: {
        toDataURL(): string;
    };
    display_id: string;
    appIcon: {
        toDataURL(): string;
    } | null;
}

export interface SoundboardSound {
    id: string;
    name: string;
    filename: string;
    createdAt: string;
}

export interface SoundboardSoundData extends SoundboardSound {
    buffer: string; // base64 encoded
}

export interface SoundboardFilePickerResult {
    name: string;
    buffer: string; // base64 encoded
    extension: string;
}

declare global {
    interface Window {
        electron?: {
            getDesktopSources: () => Promise<DesktopCapturerSource[]>;
            soundboard: {
                openFilePicker: () => Promise<SoundboardFilePickerResult | null>;
                openDirectory: () => Promise<boolean>;
                saveSound: (data: { name: string; buffer: string; extension: string }) => Promise<SoundboardSound>;
                listSounds: () => Promise<SoundboardSound[]>;
                deleteSound: (id: string) => Promise<boolean>;
                getSoundData: (id: string) => Promise<SoundboardSoundData | null>;
                getSoundData: (id: string) => Promise<SoundboardSoundData | null>;
            };
            nativeAudio: {
                startCapture: (pid: string, mode?: 'include' | 'exclude') => Promise<boolean>;
                stopCapture: (pid: string) => Promise<boolean>;
                getAppPid: () => Promise<number>;
                getWindowPid: (hwnd: string) => Promise<string | null>;
                onAudioData: (callback: (chunk: Uint8Array) => void) => () => void;
            };
        };
        electronUpdater?: {
            onProgress: (callback: (percent: number, status?: string) => void) => void;
            onStatus: (callback: (status: string) => void) => void;
        };
    }
}
