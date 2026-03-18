import { contextBridge, ipcRenderer } from 'electron'

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

  // App info
  getAppVersion: () => ipcRenderer.invoke('app:version'),

  // Progress events from main
  onQueryProgress: (cb: (data: { deviceId: string; queryId: string; status: string }) => void) => {
    ipcRenderer.on('query:progress', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('query:progress')
  },
})
