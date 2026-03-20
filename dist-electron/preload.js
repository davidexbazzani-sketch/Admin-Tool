"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// Window control sends
electron_1.contextBridge.exposeInMainWorld('electronSend', (channel) => {
    const allowed = ['window:minimize', 'window:maximize', 'window:close'];
    if (allowed.includes(channel))
        electron_1.ipcRenderer.send(channel);
});
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // PowerShell execution
    runPowerShell: (command, timeoutMs) => electron_1.ipcRenderer.invoke('ps:run', command, timeoutMs),
    // Admin check (Windows process elevation — separate from app auth)
    checkAdmin: () => electron_1.ipcRenderer.invoke('ps:checkAdmin'),
    // File dialogs
    openFileDialog: (filters) => electron_1.ipcRenderer.invoke('dialog:openFile', filters),
    openFilesDialog: (filters) => electron_1.ipcRenderer.invoke('dialog:openFiles', filters),
    saveFileDialog: (defaultPath, filters) => electron_1.ipcRenderer.invoke('dialog:saveFile', defaultPath, filters),
    selectDirectory: () => electron_1.ipcRenderer.invoke('dialog:selectDirectory'),
    // File I/O
    readFile: (filePath) => electron_1.ipcRenderer.invoke('file:read', filePath),
    writeFile: (filePath, data) => electron_1.ipcRenderer.invoke('file:write', filePath, data),
    // Settings (electron-store)
    getSettings: () => electron_1.ipcRenderer.invoke('store:get'),
    setSetting: (key, value) => electron_1.ipcRenderer.invoke('store:set', key, value),
    // Shell open
    openExternal: (url) => electron_1.ipcRenderer.invoke('shell:openExternal', url),
    openPath: (filePath) => electron_1.ipcRenderer.invoke('shell:openPath', filePath),
    // Cancel all running processes
    cancelAll: () => electron_1.ipcRenderer.invoke('ps:cancelAll'),
    // Write to app.log
    log: (message) => electron_1.ipcRenderer.invoke('app:log', message),
    // Compose email via Outlook COM or mailto: fallback
    composeEmail: (opts) => electron_1.ipcRenderer.invoke('mail:compose', opts),
    // App info
    getAppVersion: () => electron_1.ipcRenderer.invoke('app:version'),
    // Progress events from main
    onQueryProgress: (cb) => {
        electron_1.ipcRenderer.on('query:progress', (_e, data) => cb(data));
        return () => electron_1.ipcRenderer.removeAllListeners('query:progress');
    },
    // ── Auth ──────────────────────────────────────────────────────────────────
    authInit: () => electron_1.ipcRenderer.invoke('auth:init'),
    authLogin: (username, password) => electron_1.ipcRenderer.invoke('auth:login', username, password),
    authSso: () => electron_1.ipcRenderer.invoke('auth:sso'),
    authVerifyRecovery: (key) => electron_1.ipcRenderer.invoke('auth:verifyRecovery', key),
    authResetMasterPassword: (newPassword) => electron_1.ipcRenderer.invoke('auth:resetMasterPassword', newPassword),
    authHashPassword: (password) => electron_1.ipcRenderer.invoke('auth:hashPassword', password),
    authGetUsers: () => electron_1.ipcRenderer.invoke('auth:getUsers'),
    authCreateAdmin: (params) => electron_1.ipcRenderer.invoke('auth:createAdmin', params),
    authUpdateUser: (userId, patch) => electron_1.ipcRenderer.invoke('auth:updateUser', userId, patch),
    authUpdatePassword: (userId, newPassword) => electron_1.ipcRenderer.invoke('auth:updatePassword', userId, newPassword),
    authDeleteUser: (userId) => electron_1.ipcRenderer.invoke('auth:deleteUser', userId),
    // ── Activity logging ──────────────────────────────────────────────────────
    logActivity: (entry) => electron_1.ipcRenderer.invoke('auth:log', entry),
    getLogs: (monthKey) => electron_1.ipcRenderer.invoke('auth:getLogs', monthKey),
    // ── App config ────────────────────────────────────────────────────────────
    getAppConfig: () => electron_1.ipcRenderer.invoke('auth:getConfig'),
    saveAppConfig: (config) => electron_1.ipcRenderer.invoke('auth:saveConfig', config),
    // ── Network storage (for inventory, tasks, bugs, etc.) ───────────────────
    netReadJson: (relativePath) => electron_1.ipcRenderer.invoke('net:readJson', relativePath),
    netWriteJson: (relativePath, data) => electron_1.ipcRenderer.invoke('net:writeJson', relativePath, data),
    netExists: (relativePath) => electron_1.ipcRenderer.invoke('net:exists', relativePath),
    netListDir: (relativePath) => electron_1.ipcRenderer.invoke('net:listDir', relativePath),
    netDeleteFile: (relativePath) => electron_1.ipcRenderer.invoke('net:deleteFile', relativePath),
    netIsAvailable: () => electron_1.ipcRenderer.invoke('net:isAvailable'),
    netGetBasePath: () => electron_1.ipcRenderer.invoke('net:getBasePath'),
    netSetBasePath: (path) => electron_1.ipcRenderer.invoke('net:setBasePath', path),
    // ── System info ───────────────────────────────────────────────────────────
    getWindowsUsername: () => electron_1.ipcRenderer.invoke('sys:getWindowsUsername'),
    getHostname: () => electron_1.ipcRenderer.invoke('sys:getHostname'),
    // ── Context menu ──────────────────────────────────────────────────────────
    showContextMenu: () => electron_1.ipcRenderer.invoke('context-menu:show'),
    // ── E-Mail (nodemailer) ───────────────────────────────────────────────────
    sendEmailRaw: (opts) => electron_1.ipcRenderer.invoke('mail:sendRaw', opts),
    // ── Heartbeat / crash detection ───────────────────────────────────────────
    heartbeatSet: (username) => electron_1.ipcRenderer.invoke('heartbeat:set', username),
    heartbeatClear: (username) => electron_1.ipcRenderer.invoke('heartbeat:clear', username),
    heartbeatCheck: (username) => electron_1.ipcRenderer.invoke('heartbeat:check', username),
});
globalThis
    .addEventListener('contextmenu', (e) => {
    const target = e.target;
    const tag = (target.tagName ?? '').toUpperCase();
    const isEditable = tag === 'INPUT' || tag === 'TEXTAREA' ||
        target.isContentEditable === true ||
        (typeof target.closest === 'function' && target.closest('[contenteditable="true"]') !== null);
    if (isEditable) {
        e.preventDefault();
        electron_1.ipcRenderer.invoke('context-menu:show');
    }
});
// Drag & Drop file path resolution (Electron 28+)
electron_1.contextBridge.exposeInMainWorld('electronDrop', {
    getPath: (file) => electron_1.webUtils.getPathForFile(file),
});
