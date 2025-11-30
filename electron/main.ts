import { app, BrowserWindow, ipcMain, desktopCapturer, session } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import isDev from 'electron-is-dev';

function createWindow() {
    const iconPath = isDev
        ? path.join(__dirname, '..', 'public', 'icon.png')
        : path.join(__dirname, '..', 'dist', 'icon.png');

    const mainWindow = new BrowserWindow({
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

    // Permission handler for media access
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['media', 'display-capture', 'mediaKeySystem'];
        if (allowedPermissions.includes(permission)) {
            callback(true);
        } else {
            callback(false);
        }
    });

    // IPC handler for screen sharing
    ipcMain.handle('get-desktop-sources', async () => {
        const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 150, height: 150 } });
        return sources;
    });

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        // Load from app.asar - dist is at the root level
        mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }

    // Auto-update logic
    if (!isDev) {
        autoUpdater.checkForUpdatesAndNotify();

        // Check for updates every 30 minutes
        setInterval(() => {
            autoUpdater.checkForUpdatesAndNotify();
        }, 30 * 60 * 1000);
    }
}

app.whenReady().then(() => {
    createWindow();

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
});

autoUpdater.on('update-not-available', (info: any) => {
    console.log('Update not available.', info);
});

autoUpdater.on('error', (err: any) => {
    console.log('Error in auto-updater. ' + err);
});

autoUpdater.on('download-progress', (progressObj: any) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
    log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
    console.log(log_message);
});

autoUpdater.on('update-downloaded', (info: any) => {
    console.log('Update downloaded');
    autoUpdater.quitAndInstall();
});
