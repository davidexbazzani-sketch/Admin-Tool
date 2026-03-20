"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = require("path");
const fs_1 = require("fs");
const os_1 = require("os");
const electron_store_1 = __importDefault(require("electron-store"));
const powerShellRunner_1 = require("./powerShellRunner");
const auth = __importStar(require("./authManager"));
const ns = __importStar(require("./networkStorage"));
// NOTE: Hardware acceleration intentionally ENABLED.
// Disabling it (disableHardwareAcceleration) forces CPU-only software rendering.
// With all query categories open as admin (~40 DOM nodes), every checkbox re-render
// overloaded the CPU renderer → window went white. GPU rendering handles this without issue.
// If a specific machine has GPU driver problems, use --disable-gpu-compositing as a
// targeted CLI flag rather than killing GPU acceleration entirely.
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
// PROBLEM 1 (UIPI): When the app runs elevated (HIGH integrity), Windows blocks
// WM_DROPFILES drag messages from Explorer (MEDIUM integrity). Fix: call
// ChangeWindowMessageFilterEx to allow those messages per-window.
async function fixAdminDragDrop(win) {
    if (process.platform !== 'win32')
        return;
    try {
        const hwnd = win.getNativeWindowHandle().readUInt32LE(0);
        const ps = [
            `Add-Type -TypeDefinition @'`,
            `using System;`,
            `using System.Runtime.InteropServices;`,
            `public class WinUipi {`,
            `    [DllImport("user32.dll", SetLastError=true)]`,
            `    public static extern bool ChangeWindowMessageFilterEx(IntPtr hWnd, uint msg, uint action, IntPtr pChangeInfo);`,
            `}`,
            `'@`,
            `$h = [IntPtr][uint]${hwnd}`,
            `[WinUipi]::ChangeWindowMessageFilterEx($h, 0x0233u, 1u, [IntPtr]::Zero) | Out-Null`,
            `[WinUipi]::ChangeWindowMessageFilterEx($h, 0x004Au, 1u, [IntPtr]::Zero) | Out-Null`,
            `[WinUipi]::ChangeWindowMessageFilterEx($h, 0x0049u, 1u, [IntPtr]::Zero) | Out-Null`,
            `Write-Output 'ok'`,
        ].join('\n');
        await (0, powerShellRunner_1.runPowerShell)(ps, 15000);
    }
    catch { /* non-critical — D&D may not work when running as admin */ }
}
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
        // Fire-and-forget: allow drag-drop into admin-elevated window
        if (mainWindow)
            fixAdminDragDrop(mainWindow);
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
// Open a local file in the system's default application
electron_1.ipcMain.handle('shell:openPath', async (_e, filePath) => {
    const error = await electron_1.shell.openPath(filePath);
    // openPath returns '' on success, or an error string on failure
    return error === '' ? { success: true } : { success: false, error };
});
// Cancel all running PowerShell/CMD processes
electron_1.ipcMain.handle('ps:cancelAll', () => {
    (0, powerShellRunner_1.killAllProcesses)();
    return true;
});
// Write a line to app.log in the userData directory
electron_1.ipcMain.handle('app:log', (_e, message) => {
    try {
        const logPath = (0, path_1.join)(electron_1.app.getPath('userData'), 'app.log');
        (0, fs_1.appendFileSync)(logPath, message, 'utf8');
    }
    catch { /* swallow logging errors */ }
});
// Compose email: tries Outlook COM (with attachment support), falls back to mailto:
electron_1.ipcMain.handle('mail:compose', async (_e, opts) => {
    // Encode text values as base64 to avoid PowerShell escaping issues with
    // special characters, quotes, and multi-line bodies
    const b64 = (s) => Buffer.from(s ?? '', 'utf8').toString('base64');
    const psLines = [
        `try {`,
        `  $to   = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(opts.to)}'))`,
        `  $cc   = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(opts.cc)}'))`,
        `  $subj = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(opts.subject)}'))`,
        `  $body = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(opts.body)}'))`,
        `  $o = New-Object -ComObject Outlook.Application -ErrorAction Stop`,
        `  $mail = $o.CreateItem(0)`,
        `  $mail.To = $to`,
        `  $mail.CC = $cc`,
        `  $mail.Subject = $subj`,
        `  $mail.Body = $body`,
    ];
    if (opts.attachmentPath) {
        // Escape single quotes in path for PS single-quoted string
        psLines.push(`  $mail.Attachments.Add('${opts.attachmentPath.replace(/'/g, "''")}')`);
    }
    psLines.push(`  $mail.Display()`, `  Write-Output 'ok'`, `} catch { Write-Output "err: $($_.Exception.Message)" }`);
    const result = await (0, powerShellRunner_1.runPowerShell)(psLines.join('\n'), 12000);
    if (result.stdout.trim() === 'ok')
        return { success: true };
    // Outlook not available or failed → fall back to mailto: (no attachment)
    const url = `mailto:${encodeURIComponent(opts.to ?? '')}?cc=${encodeURIComponent(opts.cc ?? '')}&subject=${encodeURIComponent(opts.subject ?? '')}&body=${encodeURIComponent(opts.body ?? '')}`;
    electron_1.shell.openExternal(url);
    return { success: false, fallback: true };
});
// App version
electron_1.ipcMain.handle('app:version', () => electron_1.app.getVersion());
// ─── Auth / Network Storage IPC ──────────────────────────────────────────────
// Initialize on startup — check network, create first-run data
electron_1.ipcMain.handle('auth:init', async () => {
    return auth.initializeIfNeeded();
});
// Login with username + password
electron_1.ipcMain.handle('auth:login', async (_e, username, password) => {
    return auth.loginWithPassword(username, password);
});
// SSO: get Windows user and look up / create account
electron_1.ipcMain.handle('auth:sso', async () => {
    const info = (0, os_1.userInfo)();
    const winUser = info.username;
    const user = await auth.createOrGetSsoUser(winUser);
    return { user, windowsUsername: winUser };
});
// Verify recovery key
electron_1.ipcMain.handle('auth:verifyRecovery', async (_e, key) => {
    return auth.verifyRecoveryKey(key);
});
// Reset master admin password via recovery
electron_1.ipcMain.handle('auth:resetMasterPassword', async (_e, newPassword) => {
    return auth.resetMasterPasswordViaRecovery(newPassword);
});
// Hash a password
electron_1.ipcMain.handle('auth:hashPassword', async (_e, password) => {
    return auth.hashPassword(password);
});
// Compare a password with a hash
electron_1.ipcMain.handle('auth:comparePassword', async (_e, password, hash) => {
    return auth.comparePassword(password, hash);
});
// Get all users
electron_1.ipcMain.handle('auth:getUsers', () => auth.getUsers());
// Create user (admin, master_admin, or regular user)
electron_1.ipcMain.handle('auth:createAdmin', async (_e, params) => {
    return auth.createAdminUser(params);
});
// Update user (role, status, blockedFeatures, etc.)
electron_1.ipcMain.handle('auth:updateUser', (_e, userId, patch) => {
    return auth.updateUser(userId, patch);
});
// Update user password
electron_1.ipcMain.handle('auth:updatePassword', async (_e, userId, newPassword) => {
    return auth.updateUserPassword(userId, newPassword);
});
// Delete user
electron_1.ipcMain.handle('auth:deleteUser', (_e, userId) => {
    return auth.deleteUser(userId);
});
// Log an activity
electron_1.ipcMain.handle('auth:log', (_e, entry) => {
    auth.writeActivityLog(entry);
    return true;
});
// Read activity logs
electron_1.ipcMain.handle('auth:getLogs', (_e, monthKey) => {
    return auth.readActivityLogs(monthKey);
});
// App config
electron_1.ipcMain.handle('auth:getConfig', () => auth.getAppConfig());
electron_1.ipcMain.handle('auth:saveConfig', (_e, config) => {
    auth.saveAppConfig(config);
    return true;
});
// Network storage: read/write JSON
electron_1.ipcMain.handle('net:readJson', (_e, relativePath) => {
    return ns.readJson(relativePath);
});
electron_1.ipcMain.handle('net:writeJson', (_e, relativePath, data) => {
    return ns.writeJson(relativePath, data);
});
electron_1.ipcMain.handle('net:exists', (_e, relativePath) => {
    return ns.fileExists(relativePath);
});
electron_1.ipcMain.handle('net:listDir', (_e, relativePath) => {
    return ns.listDir(relativePath);
});
electron_1.ipcMain.handle('net:deleteFile', (_e, relativePath) => {
    ns.deleteFile(relativePath);
    return true;
});
electron_1.ipcMain.handle('net:isAvailable', () => ns.isNetworkAvailable());
electron_1.ipcMain.handle('net:getBasePath', () => ns.getBasePath());
electron_1.ipcMain.handle('net:setBasePath', (_e, path) => { ns.setBasePath(path); return true; });
// System info
electron_1.ipcMain.handle('sys:getWindowsUsername', () => (0, os_1.userInfo)().username);
electron_1.ipcMain.handle('sys:getHostname', () => (0, os_1.hostname)());
// Context menu (right-click paste/copy in input fields)
electron_1.ipcMain.handle('context-menu:show', (event) => {
    const menu = electron_1.Menu.buildFromTemplate([
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einfügen' },
        { type: 'separator' },
        { role: 'selectAll', label: 'Alles auswählen' },
    ]);
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (win)
        menu.popup({ window: win });
});
// Multi-file open dialog
electron_1.ipcMain.handle('dialog:openFiles', async (_e, filters) => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: filters ?? [{ name: 'Alle Dateien', extensions: ['*'] }],
    });
    return result.canceled ? [] : result.filePaths;
});
// Window controls (custom titlebar)
electron_1.ipcMain.on('window:minimize', () => mainWindow?.minimize());
electron_1.ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized())
        mainWindow.unmaximize();
    else
        mainWindow?.maximize();
});
electron_1.ipcMain.on('window:close', () => mainWindow?.close());
// ── E-Mail via nodemailer ─────────────────────────────────────────────────────
electron_1.ipcMain.handle('mail:sendRaw', async (_e, opts) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer');
    const transportOpts = {
        host: opts.smtp,
        port: opts.port,
        secure: opts.port === 465, // true only for implicit TLS (port 465)
        requireTLS: opts.useTls !== false && opts.port !== 465, // STARTTLS on 587
        tls: { rejectUnauthorized: false },
    };
    // Only add auth when credentials are provided (relay mode = no auth needed)
    if (opts.user && opts.pass) {
        transportOpts.auth = { user: opts.user, pass: opts.pass };
    }
    const transporter = nodemailer.createTransport(transportOpts);
    await transporter.sendMail({
        from: opts.from || opts.user || opts.to,
        to: opts.to,
        subject: opts.subject,
        [opts.html ? 'html' : 'text']: opts.body,
    });
    return true;
});
// ── Heartbeat (crash detection) ───────────────────────────────────────────────
let _heartbeatUser = null;
electron_1.ipcMain.handle('heartbeat:set', (_e, username) => {
    _heartbeatUser = username;
    ns.writeJson(`heartbeat/${username}.json`, { username, timestamp: new Date().toISOString() });
    return true;
});
electron_1.ipcMain.handle('heartbeat:clear', (_e, username) => {
    _heartbeatUser = null;
    try {
        ns.deleteFile(`heartbeat/${username}.json`);
    }
    catch { /* ignore */ }
    return true;
});
electron_1.ipcMain.handle('heartbeat:check', (_e, username) => {
    return ns.readJson(`heartbeat/${username}.json`);
});
electron_1.app.on('before-quit', () => {
    if (_heartbeatUser) {
        try {
            ns.deleteFile(`heartbeat/${_heartbeatUser}.json`);
        }
        catch { /* ignore */ }
        _heartbeatUser = null;
    }
});
