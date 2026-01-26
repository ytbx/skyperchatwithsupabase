import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
    getDesktopSources: async () => {
        return await ipcRenderer.invoke('get-desktop-sources')
    },
    // Soundboard
    soundboard: {
        openFilePicker: () => ipcRenderer.invoke('soundboard-open-file-dialog'),
        openDirectory: () => ipcRenderer.invoke('soundboard-open-directory'),
        saveSound: (sound: any) => ipcRenderer.invoke('soundboard-save-sound', sound),
        listSounds: () => ipcRenderer.invoke('soundboard-list-sounds'),
        deleteSound: (id: string) => ipcRenderer.invoke('soundboard-delete-sound', id),
        getSoundData: (id: string) => ipcRenderer.invoke('soundboard-get-sound-data', id),
    },

    // Native Audio Capture
    nativeAudio: {
        startCapture: (pid: string, mode?: 'include' | 'exclude') => ipcRenderer.invoke('start-native-audio-capture', pid, mode),
        stopCapture: (pid: string) => ipcRenderer.invoke('stop-native-audio-capture', pid),
        getAppPid: () => ipcRenderer.invoke('get-app-pid'),
        getWindowPid: (hwnd: string) => ipcRenderer.invoke('get-window-pid', hwnd),
        onAudioData: (callback: (chunk: Uint8Array) => void) => {
            const subscription = (_event: any, chunk: Uint8Array) => callback(chunk);
            ipcRenderer.on('audio-data-chunk', subscription);
            // Return unsubscribe function
            return () => ipcRenderer.removeListener('audio-data-chunk', subscription);
        }
    },

    // Global Shortcuts
    globalShortcuts: {
        register: (accelerator: string) => ipcRenderer.invoke('register-global-shortcut', accelerator),
        unregister: (accelerator: string) => ipcRenderer.invoke('unregister-global-shortcut', accelerator),
        unregisterAll: () => ipcRenderer.invoke('unregister-all-global-shortcuts'),
        onTriggered: (callback: (accelerator: string) => void) => {
            const subscription = (_event: any, accelerator: string) => callback(accelerator);
            ipcRenderer.on('global-shortcut-triggered', subscription);
            return () => ipcRenderer.removeListener('global-shortcut-triggered', subscription);
        }
    },
    updateBadge: (count: number) => ipcRenderer.send('update-badge', count),
    updateBadgeOverlay: (dataUrl: string | null) => ipcRenderer.send('update-badge-overlay', dataUrl),
    thumbar: {
        setButtons: (buttons: any[]) => ipcRenderer.send('set-thumbar-buttons', buttons),
        clearButtons: () => ipcRenderer.send('clear-thumbar-buttons'),
        onButtonClicked: (callback: (id: string) => void) => {
            const subscription = (_event: any, id: string) => callback(id);
            ipcRenderer.on('thumbar-button-clicked', subscription);
            return () => ipcRenderer.removeListener('thumbar-button-clicked', subscription);
        }
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
