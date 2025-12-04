import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
    getDesktopSources: async () => {
        return await ipcRenderer.invoke('get-desktop-sources')
    },
    soundboard: {
        openFilePicker: async () => {
            return await ipcRenderer.invoke('soundboard-open-file-dialog')
        },
        saveSound: async (data: { name: string; buffer: string; extension: string }) => {
            return await ipcRenderer.invoke('soundboard-save-sound', data)
        },
        listSounds: async () => {
            return await ipcRenderer.invoke('soundboard-list-sounds')
        },
        deleteSound: async (id: string) => {
            return await ipcRenderer.invoke('soundboard-delete-sound', id)
        },
        getSoundData: async (id: string) => {
            return await ipcRenderer.invoke('soundboard-get-sound-data', id)
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
