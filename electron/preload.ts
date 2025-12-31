import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
    getDesktopSources: async () => {
        return await ipcRenderer.invoke('get-desktop-sources')
    },
    // Soundboard
    soundboard: {
        openFileDialog: () => ipcRenderer.invoke('soundboard-open-file-dialog'),
        saveSound: (sound: any) => ipcRenderer.invoke('soundboard-save-sound', sound),
        listSounds: () => ipcRenderer.invoke('soundboard-list-sounds'),
        deleteSound: (id: string) => ipcRenderer.invoke('soundboard-delete-sound', id),
        getSoundData: (id: string) => ipcRenderer.invoke('soundboard-get-sound-data', id),
    },

    // Native Audio Capture
    nativeAudio: {
        startCapture: (pidToExclude: string) => ipcRenderer.invoke('start-native-audio-capture', pidToExclude),
        stopCapture: (pidToExclude: string) => ipcRenderer.invoke('stop-native-audio-capture', pidToExclude),
        getAppPid: () => ipcRenderer.invoke('get-app-pid'),
        onAudioData: (callback: (chunk: Uint8Array) => void) => {
            const subscription = (_event: any, chunk: Uint8Array) => callback(chunk);
            ipcRenderer.on('audio-data-chunk', subscription);
            // Return unsubscribe function
            return () => ipcRenderer.removeListener('audio-data-chunk', subscription);
        }
    },

    // Global Shortcut
    registerGlobalShortcut: (accelerator: string) => ipcRenderer.invoke('register-global-shortcut', accelerator),
    unregisterGlobalShortcut: (accelerator: string) => ipcRenderer.invoke('unregister-global-shortcut', accelerator),
    unregisterAllGlobalShortcuts: () => ipcRenderer.invoke('unregister-all-global-shortcuts'),
    onGlobalShortcut: (callback: (accelerator: string) => void) => {
        const subscription = (_event: any, accelerator: string) => callback(accelerator);
        ipcRenderer.on('global-shortcut-triggered', subscription);
        return () => ipcRenderer.removeListener('global-shortcut-triggered', subscription);
    }
})

// Expose update events for update window
contextBridge.exposeInMainWorld('electronUpdater', {
    onProgress: (callback: (percent: number, status?: string) => void) => {
        ipcRenderer.on('update-progress', (_event, percent) => {
            callback(percent)
        })
    },
    onStatus: (callback: (status: string) => void) => {
        ipcRenderer.on('update-status', (_event, status) => {
            callback(status)
        })
    }
})

window.addEventListener('DOMContentLoaded', () => {
    const replaceText = (selector: string, text: string) => {
        const element = document.getElementById(selector)
        if (element) element.innerText = text
    }

    for (const type of ['chrome', 'node', 'electron']) {
        replaceText(`${type}-version`, process.versions[type as keyof NodeJS.ProcessVersions] || '')
    }
})
