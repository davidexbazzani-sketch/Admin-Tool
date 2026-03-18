"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = require("path");
const fs_1 = require("fs");
const electron_store_1 = __importDefault(require("electron-store"));
const powerShellRunner_1 = require("./powerShellRunner");
// Disable GPU for stability on corporate machines
electron_1.app.disableHardwareAcceleration();
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
// Persistent settings store
const store = new electron_store_1.default({
    defaults: {
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        smtpPass: '',
        smtpFrom: '',
        exportPath: electron_1.app.getPath('documents'),
        adDomain: '',
        adServer: '',
        theme: 'dark',
    },
});
let mainWindow = null;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        backgroundColor: '#0f172a',
        webPreferences: {
            preload: (0, path_1.join)(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        show: false,
        titleBarStyle: 'hidden',
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        mainWindow.loadFile((0, path_1.join)(__dirname, '../dist/index.html'));
    }
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
// ─── IPC Handlers ───────────────────────────────────────────────────────────
// PowerShell execution
electron_1.ipcMain.handle('ps:run', async (_e, command, timeoutMs) => {
    return (0, powerShellRunner_1.runPowerShell)(command, timeoutMs ?? 30000);
});
// Admin check
electron_1.ipcMain.handle('ps:checkAdmin', async () => {
    const result = await (0, powerShellRunner_1.runPowerShell)('[bool](([System.Security.Principal.WindowsIdentity]::GetCurrent()).groups -match "S-1-5-32-544")', 5000);
    return result.stdout.toLowerCase().trim() === 'true';
});
// File open dialog
electron_1.ipcMain.handle('dialog:openFile', async (_e, filters) => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: filters ?? [
            { name: 'Alle Dateien', extensions: ['xlsx', 'xls', 'csv', 'docx', 'pdf'] },
        ],
    });
    return result.canceled ? null : result.filePaths[0];
});
// File save dialog
electron_1.ipcMain.handle('dialog:saveFile', async (_e, defaultPath, filters) => {
    const result = await electron_1.dialog.showSaveDialog(mainWindow, {
        defaultPath,
        filters: filters ?? [{ name: 'Alle Dateien', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePath;
});
// Directory picker
electron_1.ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
});
// Read file as base64
electron_1.ipcMain.handle('file:read', async (_e, filePath) => {
    try {
        const buf = (0, fs_1.readFileSync)(filePath);
        return { success: true, data: buf.toString('base64'), filePath };
    }
    catch (err) {
        return { success: false, error: String(err) };
    }
});
// Write file from base64
electron_1.ipcMain.handle('file:write', async (_e, filePath, dataBase64) => {
    try {
        (0, fs_1.writeFileSync)(filePath, Buffer.from(dataBase64, 'base64'));
        return { success: true };
    }
    catch (err) {
        return { success: false, error: String(err) };
    }
});
// Store
electron_1.ipcMain.handle('store:get', () => store.store);
electron_1.ipcMain.handle('store:set', (_e, key, value) => {
    store.set(key, value);
    return true;
});
// Shell
electron_1.ipcMain.handle('shell:openExternal', (_e, url) => {
    electron_1.shell.openExternal(url);
});
// App version
electron_1.ipcMain.handle('app:version', () => electron_1.app.getVersion());
// Window controls (custom titlebar)
electron_1.ipcMain.on('window:minimize', () => mainWindow?.minimize());
electron_1.ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized())
        mainWindow.unmaximize();
    else
        mainWindow?.maximize();
});
electron_1.ipcMain.on('window:close', () => mainWindow?.close());
