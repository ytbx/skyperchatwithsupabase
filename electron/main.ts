import { app, BrowserWindow, ipcMain, desktopCapturer, dialog, globalShortcut, systemPreferences } from 'electron';
import path from 'path';
import { captureSystemAudioExcluding, stopAudioCapture, setExecutablesRoot } from '@skyperchat/audio-loopback';

// Configure native audio capture binaries path
// In production (asar), binaries are usually unpacked to a specific folder
const isProd = app.isPackaged;
if (isProd) {
    // Adjust this path based on your builder configuration (e.g. electron-builder extraResources)
    // For now, assuming standard unpacking behavior for native modules
    const possiblePath = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@skyperchat', 'audio-loopback', 'bin');
    setExecutablesRoot(possiblePath);
} else {
    // In development, it's in node_modules
    setExecutablesRoot(path.join(__dirname, '..', 'node_modules', '@skyperchat', 'audio-loopback', 'bin'));
}

/**
 * Audio Capture Exclusion Configuration
 * 
 * These flags prevent the application's own audio from being captured during screen sharing.
 * This eliminates echo where remote participants would hear their own voices.
 */

// 1. Standalone command line switches (Must be at the top)
// Force exclusion of this process from loopback capture
app.commandLine.appendSwitch('enable-loopback-capture-exclusion');
// Suppress local audio playback intended for capture
app.commandLine.appendSwitch('enable-blink-features', 'SuppressLocalAudioPlaybackIntended');

// 2. Feature-based switches
// ExcludeCurrentProcessFromAudioCapture: Explicitly tells Chromium to omit this process's output
// AudioServiceOutOfProcess: Required for modern Windows loopback exclusion to function
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer,AudioServiceOutOfProcess,ExcludeCurrentProcessFromAudioCapture,WASAPIRawAudioCapture');

// 3. Platform & Service Specifics
// Disable sandbox for the Audio Service on Windows to allow it to identify process IDs for exclusion
app.commandLine.appendSwitch('disable-features', 'AudioServiceSandbox');
app.commandLine.appendSwitch('auto-select-desktop-capture-source', 'Entire screen');

if (process.platform === 'win32') {
    // Windows 10/11 specific WASAPI tuning for loopback
    // No additional switches needed here as they are covered above
}
import fs from 'fs';
import { autoUpdater } from 'electron-updater';
import isDev from 'electron-is-dev';

// Enable detailed logging for auto-updater
autoUpdater.logger = console;
(autoUpdater.logger as any).transports = { console: { level: 'debug' } };

let mainWindow: BrowserWindow | null = null;
let updateWindow: BrowserWindow | null = null;

// Soundboard storage directory
const getSoundboardDir = () => {
    const soundboardDir = path.join(app.getPath('userData'), 'soundboard');
    if (!fs.existsSync(soundboardDir)) {
        fs.mkdirSync(soundboardDir, { recursive: true });
    }
    return soundboardDir;
};

// Soundboard metadata file
const getSoundboardMetaPath = () => path.join(getSoundboardDir(), 'sounds.json');

// Load soundboard metadata
const loadSoundboardMeta = (): Array<{ id: string; name: string; filename: string; createdAt: string }> => {
    const metaPath = getSoundboardMetaPath();
    if (fs.existsSync(metaPath)) {
        try {
            return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch {
            return [];
        }
    }
    return [];
};

// Save soundboard metadata
const saveSoundboardMeta = (meta: Array<{ id: string; name: string; filename: string; createdAt: string }>) => {
    fs.writeFileSync(getSoundboardMetaPath(), JSON.stringify(meta, null, 2));
};

// Create update window
function createUpdateWindow() {
    updateWindow = new BrowserWindow({
        width: 400,
        height: 300,
        frame: false,
        resizable: false,
        transparent: true,
        alwaysOnTop: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    if (isDev) {
        updateWindow.loadFile(path.join(__dirname, '..', 'public', 'update.html'));
    } else {
        updateWindow.loadFile(path.join(__dirname, '..', 'dist', 'update.html'));
    }

    updateWindow.on('closed', () => {
        updateWindow = null;
    });
}

// Send update progress to update window
function sendUpdateStatus(status: string) {
    if (updateWindow && !updateWindow.isDestroyed()) {
        updateWindow.webContents.send('update-status', status);
    }
}

function sendUpdateProgress(percent: number) {
    if (updateWindow && !updateWindow.isDestroyed()) {
        updateWindow.webContents.send('update-progress', percent);
    }
}

function createWindow() {
    const iconPath = isDev
        ? path.join(__dirname, '..', 'public', 'icon.ico')
        : path.join(__dirname, '..', 'dist', 'icon.ico');

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        icon: iconPath,
        autoHideMenuBar: true, // Hide menu bar like Discord
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // IPC handler for screen sharing
    ipcMain.handle('get-desktop-sources', async () => {
        const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 150, height: 150 } });
        return sources;
    });

    // Soundboard IPC handlers
    ipcMain.handle('soundboard-open-file-dialog', async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {
            title: 'Ses Dosyası Seç',
            filters: [
                { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'webm', 'm4a'] }
            ],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return null;
        }

        const filePath = result.filePaths[0];
        const buffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);

        return {
            name: path.parse(fileName).name,
            buffer: buffer.toString('base64'),
            extension: path.extname(fileName).slice(1)
        };
    });

    // Native Audio Capture Handlers
    ipcMain.handle('start-native-audio-capture', async (event, pidToExclude: string) => {
        try {
            console.log('Starting native audio capture via start-native-audio-capture handler');
            // Stop any existing capture first
            try {
                stopAudioCapture(pidToExclude);
            } catch (e) { /* ignore */ }

            // Start capture in EXCLUDE mode
            captureSystemAudioExcluding(pidToExclude, {
                onData: (chunk: Uint8Array) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        // Send audio chunk to renderer
                        // We need to send it as a buffer or array
                        mainWindow.webContents.send('audio-data-chunk', chunk);
                    }
                }
            });
            console.log(`Native audio capture started for PID exclusion: ${pidToExclude}`);
            return true;
        } catch (error) {
            console.error('Failed to start native audio capture:', error);
            return false;
        }
    });

    ipcMain.handle('stop-native-audio-capture', async (event, pidToExclude: string) => {
        try {
            console.log(`Stopping native audio capture for PID: ${pidToExclude}`);
            return stopAudioCapture(pidToExclude);
        } catch (error) {
            console.error('Failed to stop native audio capture:', error);
            return false;
        }
    });

    ipcMain.handle('get-app-pid', () => {
        return process.pid;
    });

    ipcMain.handle('soundboard-save-sound', async (_event, { name, buffer, extension }: { name: string; buffer: string; extension: string }) => {
        const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
        const filename = `${id}.${extension}`;
        const filePath = path.join(getSoundboardDir(), filename);

        fs.writeFileSync(filePath, Buffer.from(buffer, 'base64'));

        const meta = loadSoundboardMeta();
        meta.push({
            id,
            name,
            filename,
            createdAt: new Date().toISOString()
        });
        saveSoundboardMeta(meta);

        return { id, name, filename };
    });

    ipcMain.handle('soundboard-list-sounds', async () => {
        return loadSoundboardMeta();
    });

    ipcMain.handle('soundboard-delete-sound', async (_event, id: string) => {
        const meta = loadSoundboardMeta();
        const sound = meta.find(s => s.id === id);

        if (sound) {
            const filePath = path.join(getSoundboardDir(), sound.filename);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            const newMeta = meta.filter(s => s.id !== id);
            saveSoundboardMeta(newMeta);
            return true;
        }
        return false;
    });

    // Soundboard IPC handlers
    ipcMain.handle('soundboard-get-sound-data', async (_event, id: string) => {
        const meta = loadSoundboardMeta();
        const sound = meta.find(s => s.id === id);

        if (sound) {
            const filePath = path.join(getSoundboardDir(), sound.filename);
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                return {
                    ...sound,
                    buffer: buffer.toString('base64')
                };
            }
        }
        return null;
    });

    // Global Shortcut IPC handlers
    ipcMain.handle('register-global-shortcut', (_event, accelerator: string) => {
        try {
            // Unregister if already registered to avoid conflicts
            if (globalShortcut.isRegistered(accelerator)) {
                globalShortcut.unregister(accelerator);
            }

            const ret = globalShortcut.register(accelerator, () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('global-shortcut-triggered', accelerator);
                }
            });

            if (!ret) {
                console.log('Registration failed for', accelerator);
                return false;
            }
            return true;
        } catch (error) {
            console.error('Error registering global shortcut:', error);
            return false;
        }
    });

    ipcMain.handle('unregister-global-shortcut', (_event, accelerator: string) => {
        try {
            if (globalShortcut.isRegistered(accelerator)) {
                globalShortcut.unregister(accelerator);
            }
            return true;
        } catch (error) {
            console.error('Error unregistering global shortcut:', error);
            return false;
        }
    });

    ipcMain.handle('unregister-all-global-shortcuts', () => {
        globalShortcut.unregisterAll();
        return true;
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        // Load from app.asar - dist is at the root level
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    // Check for updates first in production
    if (!isDev) {
        try {
            autoUpdater.checkForUpdates();
        } catch (e) {
            console.error('Failed to check for updates:', e);
            createWindow();
        }
    } else {
        createWindow();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
    console.log('Checking for update...');
});

autoUpdater.on('update-available', (info: any) => {
    console.log('Update available.', info);
    // Create update window and hide main window if exists
    createUpdateWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
    }
    sendUpdateStatus('Güncelleme bulundu, indiriliyor...');
});

autoUpdater.on('update-not-available', (info: any) => {
    console.log('Update not available.', info);
    // No update available, create main window if not exists
    if (!mainWindow) {
        createWindow();
    }
});

autoUpdater.on('error', (err: any) => {
    console.log('Error in auto-updater: ' + err);
    // On error, close update window and show main window
    if (updateWindow && !updateWindow.isDestroyed()) {
        updateWindow.close();
    }
    if (!mainWindow) {
        createWindow();
    } else if (!mainWindow.isDestroyed()) {
        mainWindow.show();
    }
});

autoUpdater.on('download-progress', (progressObj: any) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log(log_message);

    sendUpdateProgress(progressObj.percent);

    const mbTransferred = (progressObj.transferred / 1024 / 1024).toFixed(1);
    const mbTotal = (progressObj.total / 1024 / 1024).toFixed(1);
    sendUpdateStatus(`${mbTransferred} MB / ${mbTotal} MB`);
});

autoUpdater.on('update-downloaded', (info: any) => {
    console.log('Update downloaded');
    sendUpdateStatus('Güncelleme tamamlandı, yeniden başlatılıyor...');

    // Wait a moment to show the message, then install
    setTimeout(() => {
        // Close all windows first
        if (updateWindow && !updateWindow.isDestroyed()) {
            updateWindow.close();
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.close();
        }

        // Force quit and install
        // isSilent: true = don't show installer UI
        // isForceRunAfter: true = run app after install
        autoUpdater.quitAndInstall(true, true);

        // Force exit if quitAndInstall doesn't work
        setTimeout(() => {
            app.exit(0);
        }, 1000);
    }, 1500);
});
