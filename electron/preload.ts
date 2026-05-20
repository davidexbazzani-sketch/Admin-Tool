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

  // Admin check (Windows process elevation — separate from app auth)
  checkAdmin: () => ipcRenderer.invoke('ps:checkAdmin'),

  // File dialogs
  openFileDialog: (filters?: Electron.FileFilter[]) =>
    ipcRenderer.invoke('dialog:openFile', filters),
  openFilesDialog: (filters?: Electron.FileFilter[]) =>
    ipcRenderer.invoke('dialog:openFiles', filters),
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

  // Shell open
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
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

  // Path configuration
  loadPathsConfig: () => ipcRenderer.invoke('paths:load') as Promise<{ success: boolean; data: unknown }>,
  savePathsConfig: (config: unknown) => ipcRenderer.invoke('paths:save', config) as Promise<{ success: boolean; error?: string }>,

  // Progress events from main
  onQueryProgress: (cb: (data: { deviceId: string; queryId: string; status: string }) => void) => {
    ipcRenderer.on('query:progress', (_e, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('query:progress')
  },

  // ── Auth ──────────────────────────────────────────────────────────────────
  authInit: () => ipcRenderer.invoke('auth:init'),
  authLogin: (username: string, password: string) => ipcRenderer.invoke('auth:login', username, password),
  authSso: () => ipcRenderer.invoke('auth:sso'),
  authVerifyRecovery: (key: string) => ipcRenderer.invoke('auth:verifyRecovery', key),
  authResetMasterPassword: (newPassword: string) => ipcRenderer.invoke('auth:resetMasterPassword', newPassword),
  authHashPassword: (password: string) => ipcRenderer.invoke('auth:hashPassword', password),
  authGetUsers: () => ipcRenderer.invoke('auth:getUsers'),
  authCreateAdmin: (params: { username: string; displayName: string; password: string; createdBy: string; role?: 'master_admin' | 'admin' | 'user' }) =>
    ipcRenderer.invoke('auth:createAdmin', params),
  authUpdateUser: (userId: string, patch: Record<string, unknown>) =>
    ipcRenderer.invoke('auth:updateUser', userId, patch),
  authUpdatePassword: (userId: string, newPassword: string) =>
    ipcRenderer.invoke('auth:updatePassword', userId, newPassword),
  authDeleteUser: (userId: string) => ipcRenderer.invoke('auth:deleteUser', userId),

  // ── Activity logging ──────────────────────────────────────────────────────
  logActivity: (entry: {
    userId: string; username: string; displayName: string
    action: string; target?: string; screen: string; timestamp: string
  }) => ipcRenderer.invoke('auth:log', entry),
  getLogs: (monthKey?: string) => ipcRenderer.invoke('auth:getLogs', monthKey),

  // ── App config ────────────────────────────────────────────────────────────
  getAppConfig: () => ipcRenderer.invoke('auth:getConfig'),
  saveAppConfig: (config: Record<string, unknown>) => ipcRenderer.invoke('auth:saveConfig', config),

  // ── Network storage (for inventory, tasks, bugs, etc.) ───────────────────
  netReadJson: (relativePath: string) => ipcRenderer.invoke('net:readJson', relativePath),
  netWriteJson: (relativePath: string, data: unknown) => ipcRenderer.invoke('net:writeJson', relativePath, data),
  netExists: (relativePath: string) => ipcRenderer.invoke('net:exists', relativePath),
  netListDir: (relativePath: string) => ipcRenderer.invoke('net:listDir', relativePath),
  netDeleteFile: (relativePath: string) => ipcRenderer.invoke('net:deleteFile', relativePath),
  netIsAvailable: () => ipcRenderer.invoke('net:isAvailable'),
  netGetBasePath: () => ipcRenderer.invoke('net:getBasePath'),
  netSetBasePath: (path: string) => ipcRenderer.invoke('net:setBasePath', path),
  netWriteRawFile: (relativePath: string, base64Data: string) => ipcRenderer.invoke('net:writeRawFile', relativePath, base64Data),
  netReadRawFile: (relativePath: string) => ipcRenderer.invoke('net:readRawFile', relativePath),

  // ── Wissensdatenbank (dedicated IPC for performance) ──────────────────────
  wbGetCategories: () => ipcRenderer.invoke('wb:get-categories'),
  wbGetArticles: (subcategoryId: string) => ipcRenderer.invoke('wb:get-articles', subcategoryId),
  wbGetArticle: (articleId: string) => ipcRenderer.invoke('wb:get-article', articleId),
  wbSearch: (query: string) => ipcRenderer.invoke('wb:search', query),
  wbEnsureGenerated: () => ipcRenderer.invoke('wb:ensure-generated'),

  // ── System info ───────────────────────────────────────────────────────────
  getWindowsUsername: () => ipcRenderer.invoke('sys:getWindowsUsername'),
  getHostname: () => ipcRenderer.invoke('sys:getHostname'),

  // ── Context menu ──────────────────────────────────────────────────────────
  showContextMenu: () => ipcRenderer.invoke('context-menu:show'),

  // ── E-Mail (nodemailer) ───────────────────────────────────────────────────
  sendEmailRaw: (opts: {
    to: string; subject: string; body: string; html?: boolean
    smtp: string; port: number; user: string; pass: string; from?: string
  }) => ipcRenderer.invoke('mail:sendRaw', opts),

  // ── Heartbeat / crash detection ───────────────────────────────────────────
  heartbeatSet: (username: string) => ipcRenderer.invoke('heartbeat:set', username),
  heartbeatClear: (username: string) => ipcRenderer.invoke('heartbeat:clear', username),
  heartbeatCheck: (username: string) => ipcRenderer.invoke('heartbeat:check', username),

  // ── Presentation mode (hall display) ──────────────────────────────────────
  presentationOpen: (opts?: { displayId?: number }) => ipcRenderer.invoke('presentation:open', opts),
  presentationClose: () => ipcRenderer.invoke('presentation:close'),
  presentationListDisplays: () => ipcRenderer.invoke('presentation:listDisplays'),
})

// Global right-click context menu for ALL elements (copy, paste, select all)
;(globalThis as unknown as { addEventListener: (event: string, cb: (e: { preventDefault(): void; target: unknown }) => void) => void })
  .addEventListener('contextmenu', (e) => {
    e.preventDefault()
    ipcRenderer.invoke('context-menu:show')
  })

// Drag & Drop file path resolution (Electron 28+)
contextBridge.exposeInMainWorld('electronDrop', {
  getPath: (file: File) => webUtils.getPathForFile(file),
})
