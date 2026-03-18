import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Window control sends
contextBridge.exposeInMainWorld('electronSend', (channel: string) => {
  const allowed = ['window:minimize', 'window:maximize', 'window:close']
  if (allowed.includes(channel)) ipcRenderer.send(channel)
})

contextBridge.exposeInMainWorld('electronAPI', {
  // PowerShell execution
  runPowerShell: (command: string, timeoutMs?: number) =>
    ipcRenderer.invoke('ps:run', command, timeoutMs),

  // Admin check
  checkAdmin: () => ipcRenderer.invoke('ps:checkAdmin'),

  // File dialogs
  openFileDialog: (filters?: Electron.FileFilter[]) =>
    ipcRenderer.invoke('dialog:openFile', filters),
  saveFileDialog: (defaultPath?: string, filters?: Electron.FileFilter[]) =>
    ipcRenderer.invoke('dialog:saveFile', defaultPath, filters),
  selectDirectory: () =>
    ipcRenderer.invoke('dialog:selectDirectory'),

  // File I/O
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  writeFile: (filePath: string, data: Buffer | string) =>
    ipcRenderer.invoke('file:write', filePath, data),

  // Settings (electron-store)
  getSettings: () => ipcRenderer.invoke('store:get'),
  setSetting: (key: string, value: unknown) =>
    ipcRenderer.invoke('store:set', key, value),

  // Shell open (mailto etc.)
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  // Open local file in default application (e.g. Excel, Acrobat, Word)
  openPath: (filePath: string) => ipcRenderer.invoke('shell:openPath', filePath),

  // Cancel all running processes
  cancelAll: () => ipcRenderer.invoke('ps:cancelAll'),

  // Write to app.log
  log: (message: string) => ipcRenderer.invoke('app:log', message),

  // Compose email via Outlook COM or mailto: fallback
  composeEmail: (opts: { to: string; cc: string; subject: string; body: string; attachmentPath?: string }) =>
    ipcRenderer.invoke('mail:compose', opts),

  // App info
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Progress events from main
  onQueryProgress: (cb: (data: { deviceId: string; queryId: string; status: string }) => void) => {
    ipcRenderer.on('query:progress', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('query:progress')
  },
})

// PROBLEM 1 FIX: Expose Electron webUtils.getPathForFile for reliable Drag & Drop.
// In Electron 28+ with contextIsolation=true, File.path is no longer directly accessible.
// webUtils.getPathForFile() is the official Electron API to retrieve the filesystem path
// from a File object obtained via drag & drop. Available from Electron 28+ (we use 29.4.6).
contextBridge.exposeInMainWorld('electronDrop', {
  getPath: (file: File) => webUtils.getPathForFile(file),
})
