import { app, BrowserWindow, ipcMain, desktopCapturer, dialog, globalShortcut, systemPreferences, shell, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import { startAudioCapture, stopAudioCapture, setExecutablesRoot, getWindowPid } from '@skyperchat/audio-loopback';

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
// DrawSnapshotEdge: Disables the yellow border on Windows 10/11 when sharing screen
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer,AudioServiceOutOfProcess,ExcludeCurrentProcessFromAudioCapture,WASAPIRawAudioCapture');
app.commandLine.appendSwitch('disable-features', 'AudioServiceSandbox,DrawSnapshotEdge');
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
let tray: Tray | null = null;
let isQuitting = false;

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
    const soundboardDir = getSoundboardDir();
    const metaPath = getSoundboardMetaPath();
    let meta: Array<{ id: string; name: string; filename: string; createdAt: string }> = [];

    if (fs.existsSync(metaPath)) {
        try {
            meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch {
            meta = [];
        }
    }

    // Get all files in the directory
    const files = fs.readdirSync(soundboardDir);
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.webm', '.m4a'];

    let changed = false;

    // Remove metadata for files that no longer exist and deduplicate by filename
    const seenFiles = new Set<string>();
    const existingMeta = meta.filter(item => {
        const fileExists = files.includes(item.filename);
        const isDuplicate = seenFiles.has(item.filename);

        if (!fileExists || isDuplicate) {
            changed = true;
            return false;
        }

        seenFiles.add(item.filename);
        return true;
    });

    meta = existingMeta;

    // Add metadata for new files
    files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        if (audioExtensions.includes(ext) && file !== 'sounds.json') {
            const alreadyInMeta = meta.some(item => item.filename === file);
            if (!alreadyInMeta) {
                meta.push({
                    id: Date.now().toString(36) + Math.random().toString(36).substring(2, 10),
                    name: path.parse(file).name,
                    filename: file,
                    createdAt: new Date().toISOString()
                });
                changed = true;
            }
        }
    });

    if (changed) {
        saveSoundboardMeta(meta);
    }

    return meta;
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

    // Open external links in the default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https:') || url.startsWith('http:')) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (url.startsWith('https:') || url.startsWith('http:')) {
            event.preventDefault();
            shell.openExternal(url);
        }
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
    ipcMain.handle('start-native-audio-capture', async (event, pid: string, mode: 'include' | 'exclude' = 'exclude') => {
        try {
            console.log(`Starting native audio capture via start-native-audio-capture handler (PID: ${pid}, Mode: ${mode})`);
            // Stop any existing capture first
            try {
                stopAudioCapture(pid);
            } catch (e) { /* ignore */ }

            // Start capture
            startAudioCapture(pid, {
                mode,
                onData: (chunk: Uint8Array) => {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('audio-data-chunk', chunk);
                    }
                }
            });
            return true;
        } catch (error) {
            console.error('Failed to start native audio capture:', error);
            return false;
        }
    });

    ipcMain.handle('get-window-pid', async (event, hwnd: string) => {
        try {
            return await getWindowPid(hwnd);
        } catch (error) {
            console.error('Failed to get window PID:', error);
            return null;
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
        // 1. Load current metadata first (without the new file)
        const meta = loadSoundboardMeta();

        // 2. Generate unique ID and filename
        const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
        const filename = `${id}.${extension}`;
        const filePath = path.join(getSoundboardDir(), filename);

        // 3. Create new entry
        const newSound = {
            id,
            name,
            filename,
            createdAt: new Date().toISOString()
        };

        // 4. Update and save metadata BEFORE writing the file
        // This ensures that when the file appears on disk, it's already in the meta
        meta.push(newSound);
        saveSoundboardMeta(meta);

        // 5. Finally write the actual audio file
        fs.writeFileSync(filePath, Buffer.from(buffer, 'base64'));

        return newSound;
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

    ipcMain.handle('soundboard-open-directory', async () => {
        const dir = getSoundboardDir();
        if (fs.existsSync(dir)) {
            shell.openPath(dir);
            return true;
        }
        return false;
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

    // Thumbar IPC handlers
    ipcMain.on('set-thumbar-buttons', (event, buttons: Array<{ tooltip: string; iconBase64: string; flags?: string[]; id: string }>) => {
        if (!mainWindow || mainWindow.isDestroyed() || process.platform !== 'win32') return;

        const thumbarButtons = buttons.map(btn => ({
            tooltip: btn.tooltip,
            icon: nativeImage.createFromDataURL(btn.iconBase64),
            click: () => {
                mainWindow?.webContents.send('thumbar-button-clicked', btn.id);
            },
            flags: (btn.flags as any) || []
        }));

        mainWindow.setThumbarButtons(thumbarButtons);
    });

    ipcMain.on('clear-thumbar-buttons', () => {
        if (!mainWindow || mainWindow.isDestroyed() || process.platform !== 'win32') return;
        mainWindow.setThumbarButtons([]);
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

    // Handle window close: hide instead of quit
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow?.hide();
        }
        return false;
    });
}

function createTray() {
    const iconPath = isDev
        ? path.join(__dirname, '..', 'public', 'icon.ico')
        : path.join(__dirname, '..', 'dist', 'icon.ico');

    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Ovox\'u Aç',
            click: () => {
                mainWindow?.show();
            }
        },
        { type: 'separator' },
        {
            label: 'Çıkış',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Ovox');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow?.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow?.show();
        }
    });
}

// IPC handler for notification badges
ipcMain.on('update-badge', (event, count: number) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (process.platform === 'win32') {
            // On Windows, we can use setOverlayIcon or just let it be
            // But usually we set the badge count on the taskbar icon
            if (count > 0) {
                // Remove setProgressBar to prevent green flash
                // tray?.setToolTip(`Ovox (${count > 9 ? '9+' : count} yeni bildirim)`);
                tray?.setToolTip(`Ovox (${count > 9 ? '9+' : count} yeni bildirim)`);
            } else {
                tray?.setToolTip('Ovox');
            }
        }

        // Update taskbar badge (macOS/some Linux)
        if (process.platform === 'darwin') {
            app.setBadgeCount(count);
        }
    }
});

// New IPC handler for setting the taskbar overlay icon with a rendered badge
ipcMain.on('update-badge-overlay', (event, dataUrl: string | null) => {
    if (mainWindow && !mainWindow.isDestroyed() && process.platform === 'win32') {
        if (dataUrl) {
            try {
                const overlay = nativeImage.createFromDataURL(dataUrl);
                mainWindow.setOverlayIcon(overlay, 'Bildirimler');
            } catch (error) {
                console.error('[Electron] Failed to set overlay icon:', error);
            }
        } else {
            mainWindow.setOverlayIcon(null, '');
        }
    }
});

app.whenReady().then(() => {
    // Check for updates first in production
    // Skip update check if running as a Windows Store app (updates handled by Store)
    if (!isDev && !process.windowsStore) {
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
        } else {
            mainWindow?.show();
        }
    });

    createTray();
});

app.on('before-quit', () => {
    isQuitting = true;
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
