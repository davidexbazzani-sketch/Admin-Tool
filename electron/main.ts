import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, appendFileSync } from 'fs'
import Store from 'electron-store'
import { runPowerShell, killAllProcesses } from './powerShellRunner'

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

// Window controls (custom titlebar)
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())
