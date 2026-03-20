import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs'
import { userInfo, hostname } from 'os'
import Store from 'electron-store'
import { runPowerShell, killAllProcesses } from './powerShellRunner'
import * as auth from './authManager'
import * as ns from './networkStorage'

// NOTE: Hardware acceleration intentionally ENABLED.
// Disabling it (disableHardwareAcceleration) forces CPU-only software rendering.
// With all query categories open as admin (~40 DOM nodes), every checkbox re-render
// overloaded the CPU renderer → window went white. GPU rendering handles this without issue.
// If a specific machine has GPU driver problems, use --disable-gpu-compositing as a
// targeted CLI flag rather than killing GPU acceleration entirely.

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Persistent settings store
const store = new Store({
  defaults: {
    smtpHost: '',
    smtpPort: 587,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    exportPath: app.getPath('documents'),
    adDomain: '',
    adServer: '',
    theme: 'dark',
  },
})

let mainWindow: BrowserWindow | null = null

// PROBLEM 1 (UIPI): When the app runs elevated (HIGH integrity), Windows blocks
// WM_DROPFILES drag messages from Explorer (MEDIUM integrity). Fix: call
// ChangeWindowMessageFilterEx to allow those messages per-window.
async function fixAdminDragDrop(win: BrowserWindow): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    const hwnd = win.getNativeWindowHandle().readUInt32LE(0)
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
    ].join('\n')
    await runPowerShell(ps, 15000)
  } catch { /* non-critical — D&D may not work when running as admin */ }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
    titleBarStyle: 'hidden',
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    // Fire-and-forget: allow drag-drop into admin-elevated window
    if (mainWindow) fixAdminDragDrop(mainWindow)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ─── IPC Handlers ───────────────────────────────────────────────────────────

// PowerShell execution
ipcMain.handle('ps:run', async (_e, command: string, timeoutMs?: number) => {
  return runPowerShell(command, timeoutMs ?? 30000)
})

// Admin check
ipcMain.handle('ps:checkAdmin', async () => {
  const result = await runPowerShell(
    '[bool](([System.Security.Principal.WindowsIdentity]::GetCurrent()).groups -match "S-1-5-32-544")',
    5000
  )
  return result.stdout.toLowerCase().trim() === 'true'
})

// File open dialog
ipcMain.handle('dialog:openFile', async (_e, filters?: Electron.FileFilter[]) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: filters ?? [
      { name: 'Alle Dateien', extensions: ['xlsx', 'xls', 'csv', 'docx', 'pdf'] },
    ],
  })
  return result.canceled ? null : result.filePaths[0]
})

// File save dialog
ipcMain.handle('dialog:saveFile', async (_e, defaultPath?: string, filters?: Electron.FileFilter[]) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath,
    filters: filters ?? [{ name: 'Alle Dateien', extensions: ['*'] }],
  })
  return result.canceled ? null : result.filePath
})

// Directory picker
ipcMain.handle('dialog:selectDirectory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

// Read file as base64
ipcMain.handle('file:read', async (_e, filePath: string) => {
  try {
    const buf = readFileSync(filePath)
    return { success: true, data: buf.toString('base64'), filePath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// Write file from base64
ipcMain.handle('file:write', async (_e, filePath: string, dataBase64: string) => {
  try {
    writeFileSync(filePath, Buffer.from(dataBase64, 'base64'))
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// Store
ipcMain.handle('store:get', () => store.store)
ipcMain.handle('store:set', (_e, key: string, value: unknown) => {
  store.set(key, value)
  return true
})

// Shell
ipcMain.handle('shell:openExternal', (_e, url: string) => {
  shell.openExternal(url)
})

// Open a local file in the system's default application
ipcMain.handle('shell:openPath', async (_e, filePath: string) => {
  const error = await shell.openPath(filePath)
  // openPath returns '' on success, or an error string on failure
  return error === '' ? { success: true } : { success: false, error }
})

// Cancel all running PowerShell/CMD processes
ipcMain.handle('ps:cancelAll', () => {
  killAllProcesses()
  return true
})

// Write a line to app.log in the userData directory
ipcMain.handle('app:log', (_e, message: string) => {
  try {
    const logPath = join(app.getPath('userData'), 'app.log')
    appendFileSync(logPath, message, 'utf8')
  } catch { /* swallow logging errors */ }
})

// Compose email: tries Outlook COM (with attachment support), falls back to mailto:
ipcMain.handle('mail:compose', async (_e, opts: {
  to: string; cc: string; subject: string; body: string; attachmentPath?: string
}) => {
  // Encode text values as base64 to avoid PowerShell escaping issues with
  // special characters, quotes, and multi-line bodies
  const b64 = (s: string) => Buffer.from(s ?? '', 'utf8').toString('base64')

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
  ]
  if (opts.attachmentPath) {
    // Escape single quotes in path for PS single-quoted string
    psLines.push(`  $mail.Attachments.Add('${opts.attachmentPath.replace(/'/g, "''")}')`)
  }
  psLines.push(
    `  $mail.Display()`,
    `  Write-Output 'ok'`,
    `} catch { Write-Output "err: $($_.Exception.Message)" }`
  )

  const result = await runPowerShell(psLines.join('\n'), 12000)
  if (result.stdout.trim() === 'ok') return { success: true }

  // Outlook not available or failed → fall back to mailto: (no attachment)
  const url = `mailto:${encodeURIComponent(opts.to ?? '')}?cc=${encodeURIComponent(opts.cc ?? '')}&subject=${encodeURIComponent(opts.subject ?? '')}&body=${encodeURIComponent(opts.body ?? '')}`
  shell.openExternal(url)
  return { success: false, fallback: true }
})

// App version
ipcMain.handle('app:version', () => app.getVersion())

// ─── Auth / Network Storage IPC ──────────────────────────────────────────────

// Initialize on startup — check network, create first-run data
ipcMain.handle('auth:init', async () => {
  return auth.initializeIfNeeded()
})

// Login with username + password
ipcMain.handle('auth:login', async (_e, username: string, password: string) => {
  return auth.loginWithPassword(username, password)
})

// SSO: get Windows user and look up / create account
ipcMain.handle('auth:sso', async () => {
  const info = userInfo()
  const winUser = info.username
  const user = await auth.createOrGetSsoUser(winUser)
  return { user, windowsUsername: winUser }
})

// Verify recovery key
ipcMain.handle('auth:verifyRecovery', async (_e, key: string) => {
  return auth.verifyRecoveryKey(key)
})

// Reset master admin password via recovery
ipcMain.handle('auth:resetMasterPassword', async (_e, newPassword: string) => {
  return auth.resetMasterPasswordViaRecovery(newPassword)
})

// Hash a password
ipcMain.handle('auth:hashPassword', async (_e, password: string) => {
  return auth.hashPassword(password)
})

// Compare a password with a hash
ipcMain.handle('auth:comparePassword', async (_e, password: string, hash: string) => {
  return auth.comparePassword(password, hash)
})

// Get all users
ipcMain.handle('auth:getUsers', () => auth.getUsers())

// Create user (admin, master_admin, or regular user)
ipcMain.handle('auth:createAdmin', async (_e, params: { username: string; displayName: string; password: string; createdBy: string; role?: 'master_admin' | 'admin' | 'user' }) => {
  return auth.createAdminUser(params)
})

// Update user (role, status, blockedFeatures, etc.)
ipcMain.handle('auth:updateUser', (_e, userId: string, patch: Partial<auth.AppUser>) => {
  return auth.updateUser(userId, patch)
})

// Update user password
ipcMain.handle('auth:updatePassword', async (_e, userId: string, newPassword: string) => {
  return auth.updateUserPassword(userId, newPassword)
})

// Delete user
ipcMain.handle('auth:deleteUser', (_e, userId: string) => {
  return auth.deleteUser(userId)
})

// Log an activity
ipcMain.handle('auth:log', (_e, entry: Parameters<typeof auth.writeActivityLog>[0]) => {
  auth.writeActivityLog(entry)
  return true
})

// Read activity logs
ipcMain.handle('auth:getLogs', (_e, monthKey?: string) => {
  return auth.readActivityLogs(monthKey)
})

// App config
ipcMain.handle('auth:getConfig', () => auth.getAppConfig())
ipcMain.handle('auth:saveConfig', (_e, config: Partial<auth.AppConfig>) => {
  auth.saveAppConfig(config)
  return true
})

// Network storage: read/write JSON
ipcMain.handle('net:readJson', (_e, relativePath: string) => {
  return ns.readJson(relativePath)
})
ipcMain.handle('net:writeJson', (_e, relativePath: string, data: unknown) => {
  return ns.writeJson(relativePath, data)
})
ipcMain.handle('net:exists', (_e, relativePath: string) => {
  return ns.fileExists(relativePath)
})
ipcMain.handle('net:listDir', (_e, relativePath: string) => {
  return ns.listDir(relativePath)
})
ipcMain.handle('net:deleteFile', (_e, relativePath: string) => {
  ns.deleteFile(relativePath)
  return true
})
ipcMain.handle('net:isAvailable', () => ns.isNetworkAvailable())
ipcMain.handle('net:getBasePath', () => ns.getBasePath())
ipcMain.handle('net:setBasePath', (_e, path: string) => { ns.setBasePath(path); return true })

// System info
ipcMain.handle('sys:getWindowsUsername', () => userInfo().username)
ipcMain.handle('sys:getHostname', () => hostname())

// Context menu (right-click paste/copy in input fields)
ipcMain.handle('context-menu:show', (event) => {
  const menu = Menu.buildFromTemplate([
    { role: 'cut',       label: 'Ausschneiden' },
    { role: 'copy',      label: 'Kopieren'     },
    { role: 'paste',     label: 'Einfügen'     },
    { type: 'separator' },
    { role: 'selectAll', label: 'Alles auswählen' },
  ])
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) menu.popup({ window: win })
})

// Multi-file open dialog
ipcMain.handle('dialog:openFiles', async (_e, filters?: Electron.FileFilter[]) => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections'],
    filters: filters ?? [{ name: 'Alle Dateien', extensions: ['*'] }],
  })
  return result.canceled ? [] : result.filePaths
})

// Window controls (custom titlebar)
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())

// ── E-Mail via nodemailer ─────────────────────────────────────────────────────
ipcMain.handle('mail:sendRaw', async (_e, opts: {
  to: string; subject: string; body: string; html?: boolean
  smtp: string; port: number; user?: string; pass?: string; from?: string
  useTls?: boolean
}) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodemailer = require('nodemailer') as typeof import('nodemailer')
  const transportOpts: Record<string, unknown> = {
    host: opts.smtp,
    port: opts.port,
    secure: opts.port === 465,      // true only for implicit TLS (port 465)
    requireTLS: opts.useTls !== false && opts.port !== 465, // STARTTLS on 587
    tls: { rejectUnauthorized: false },
  }
  // Only add auth when credentials are provided (relay mode = no auth needed)
  if (opts.user && opts.pass) {
    transportOpts.auth = { user: opts.user, pass: opts.pass }
  }
  const transporter = nodemailer.createTransport(transportOpts)
  await transporter.sendMail({
    from: opts.from || opts.user || opts.to,
    to: opts.to,
    subject: opts.subject,
    [opts.html ? 'html' : 'text']: opts.body,
  })
  return true
})

// ── Heartbeat (crash detection) ───────────────────────────────────────────────
let _heartbeatUser: string | null = null
ipcMain.handle('heartbeat:set', (_e, username: string) => {
  _heartbeatUser = username
  ns.writeJson(`heartbeat/${username}.json`, { username, timestamp: new Date().toISOString() })
  return true
})
ipcMain.handle('heartbeat:clear', (_e, username: string) => {
  _heartbeatUser = null
  try { ns.deleteFile(`heartbeat/${username}.json`) } catch { /* ignore */ }
  return true
})
ipcMain.handle('heartbeat:check', (_e, username: string) => {
  return ns.readJson<{ username: string; timestamp: string }>(`heartbeat/${username}.json`)
})
app.on('before-quit', () => {
  if (_heartbeatUser) {
    try { ns.deleteFile(`heartbeat/${_heartbeatUser}.json`) } catch { /* ignore */ }
    _heartbeatUser = null
  }
})
