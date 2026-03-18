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
    // Admin check
    checkAdmin: () => electron_1.ipcRenderer.invoke('ps:checkAdmin'),
    // File dialogs
    openFileDialog: (filters) => electron_1.ipcRenderer.invoke('dialog:openFile', filters),
    saveFileDialog: (defaultPath, filters) => electron_1.ipcRenderer.invoke('dialog:saveFile', defaultPath, filters),
    selectDirectory: () => electron_1.ipcRenderer.invoke('dialog:selectDirectory'),
    // File I/O
    readFile: (filePath) => electron_1.ipcRenderer.invoke('file:read', filePath),
    writeFile: (filePath, data) => electron_1.ipcRenderer.invoke('file:write', filePath, data),
    // Settings (electron-store)
    getSettings: () => electron_1.ipcRenderer.invoke('store:get'),
    setSetting: (key, value) => electron_1.ipcRenderer.invoke('store:set', key, value),
    // Shell open (mailto etc.)
    openExternal: (url) => electron_1.ipcRenderer.invoke('shell:openExternal', url),
    // App info
    getAppVersion: () => electron_1.ipcRenderer.invoke('app:version'),
    // Progress events from main
    onQueryProgress: (cb) => {
        electron_1.ipcRenderer.on('query:progress', (_e, data) => cb(data));
        return () => electron_1.ipcRenderer.removeAllListeners('query:progress');
    },
});
