import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { userInfo, hostname } from 'os'
import Store from 'electron-store'
import { runPowerShell, killAllProcesses } from './powerShellRunner'
import * as auth from './authManager'
import * as ns from './networkStorage'

// ========= WISSENSDATENBANK + GURU DEBUG =========
try {
  const _dbgBase = ns.getBasePath()
  console.log('=== NETZWERK-DEBUG START ===')
  console.log('BasePath:', _dbgBase)
  console.log('BasePath exists:', existsSync(_dbgBase))

  // Test knowledge_base subdir
  const _kbDir = _dbgBase + '\\knowledge_base'
  console.log('KB dir:', _kbDir, 'exists:', existsSync(_kbDir))

  // Try listing files
  if (existsSync(_kbDir)) {
    const { readdirSync, statSync } = require('fs')
    const files = readdirSync(_kbDir) as string[]
    console.log('Files in knowledge_base:', files)
    for (const f of files) {
      try {
        const st = statSync(_kbDir + '\\' + f)
        console.log(`  ${f}: ${st.size} bytes (${Math.round(st.size/1024)} KB)`)
      } catch {}
    }
  }

  // Try reading wissensdatenbank.json directly
  const _wPath = _kbDir + '\\wissensdatenbank.json'
  if (existsSync(_wPath)) {
    const raw = readFileSync(_wPath, 'utf-8')
    console.log('wissensdatenbank.json: read OK,', raw.length, 'chars')
    const data = JSON.parse(raw)
    console.log('  Type:', typeof data, 'IsArray:', Array.isArray(data))
    if (Array.isArray(data)) {
      console.log('  Array length:', data.length)
      if (data[0]) console.log('  First item keys:', Object.keys(data[0]))
    } else if (typeof data === 'object' && data !== null) {
      const keys = Object.keys(data)
      console.log('  Object keys:', keys)
      for (const k of keys.slice(0, 5)) {
        const v = data[k]
        console.log(`    "${k}": type=${typeof v}, isArray=${Array.isArray(v)}, length=${Array.isArray(v) ? v.length : 'n/a'}`)
        if (Array.isArray(v) && v[0]) console.log(`      first item keys: ${Object.keys(v[0])}`)
      }
    }
  } else {
    console.log('wissensdatenbank.json NOT FOUND at', _wPath)
  }

  // Try guru_brain files
  for (const gf of ['guru_brain.json', 'guru_brain_starter.json', 'guru_requests.json', 'guru_requests_starter.json']) {
    const gp = _kbDir + '\\' + gf
    console.log(`${gf}: exists=${existsSync(gp)}${existsSync(gp) ? ', size=' + statSync(gp).size : ''}`)
  }
} catch (e: unknown) {
  console.error('DEBUG ERROR:', (e as Error).message)
}
console.log('=== NETZWERK-DEBUG ENDE ===')
// ========= ENDE DEBUG =========

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
ipcMain.handle('net:readJson', async (_e, relativePath: string) => {
  console.log(`[IPC net:readJson] request for: "${relativePath}"`)
  const result = ns.readJson(relativePath)
  if (result === null) {
    console.log(`[IPC net:readJson] "${relativePath}" returned null`)
  } else {
    const type = typeof result
    const isArr = Array.isArray(result)
    console.log(`[IPC net:readJson] "${relativePath}" OK — type=${type} isArray=${isArr}`)
  }
  return result
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
ipcMain.handle('net:writeRawFile', (_e, relativePath: string, base64Data: string) => {
  return ns.writeRawFile(relativePath, base64Data)
})
ipcMain.handle('net:readRawFile', (_e, relativePath: string) => {
  return ns.readRawFile(relativePath)
})

// ── Wissensdatenbank IPC (dedicated handlers for performance) ─────────────────
let _wbCache: Record<string, unknown> | null = null

function loadWB(): Record<string, unknown> | null {
  if (_wbCache && Array.isArray(_wbCache.categories)) return _wbCache

  let data = ns.readJson<Record<string, unknown>>('knowledge_base/wissensdatenbank.json')
    ?? ns.readJson<Record<string, unknown>>('wissensdatenbank.json')

  if (data) {
    console.log(`[WB] Raw JSON loaded. Type: ${typeof data}, isArray: ${Array.isArray(data)}, keys: ${Object.keys(data).slice(0,10).join(',')}`)

    // Check if data has our expected structure
    if (Array.isArray(data.categories)) {
      const cats = data.categories as Array<Record<string, unknown>>
      const hasSubs = cats.length > 0 && Array.isArray(cats[0].subcategories)
      if (hasSubs) {
        const subs = cats[0].subcategories as Array<Record<string, unknown>>
        const hasArticles = subs.length > 0 && Array.isArray(subs[0].articles)
        if (hasArticles) {
          console.log(`[WB] Structure OK: ${cats.length} categories with subcategories+articles`)
          _wbCache = data
          return data
        }
      }
      console.log('[WB] Has categories but missing subcategories/articles structure')
    }

    // The server JSON has a DIFFERENT structure — use generator instead
    console.log('[WB] Server JSON does not match expected format — falling back to generator')
  } else {
    console.log('[WB] wissensdatenbank.json NOT FOUND on network')
  }

  // Fallback: use generator (always works, produces correct structure)
  try {
    const { generateWissensdatenbank } = require('./wissensdatenbankGenerator')
    const wb = generateWissensdatenbank()
    _wbCache = wb as unknown as Record<string, unknown>
    const cats = wb.categories as unknown[]
    console.log(`[WB] Using generated data: ${cats.length} categories`)
    // Try to save to network for next time (may fail offline)
    try { ns.writeJson('knowledge_base/wissensdatenbank_generated.json', wb) } catch { /* offline */ }
    return _wbCache
  } catch (err) {
    console.error('[WB] Generator failed:', err)
    return null
  }
}

ipcMain.handle('wb:get-categories', async () => {
  const data = loadWB()
  if (!data || !Array.isArray(data.categories)) return []
  return (data.categories as Array<Record<string, unknown>>).map(c => {
    const subs = Array.isArray(c.subcategories) ? c.subcategories as Array<Record<string, unknown>> : []
    return {
      id: c.id ?? '', name: c.name ?? '', icon: c.icon ?? 'folder',
      articleCount: subs.reduce((s, sc) => s + (Array.isArray(sc.articles) ? sc.articles.length : 0), 0),
      subcategories: subs.map(sc => ({
        id: sc.id ?? '', name: sc.name ?? '',
        articleCount: Array.isArray(sc.articles) ? sc.articles.length : 0,
      })),
    }
  })
})

ipcMain.handle('wb:get-articles', async (_e, subcategoryId: string) => {
  const data = loadWB()
  if (!data || !Array.isArray(data.categories)) return []
  for (const cat of data.categories as Array<Record<string, unknown>>) {
    const subs = Array.isArray(cat.subcategories) ? cat.subcategories as Array<Record<string, unknown>> : []
    for (const sc of subs) {
      if (sc.id === subcategoryId) {
        const articles = Array.isArray(sc.articles) ? sc.articles as Array<Record<string, unknown>> : []
        return articles.map(a => ({
          id: a.id ?? '', title: a.title ?? '', description: a.description ?? '',
          tags: Array.isArray(a.tags) ? a.tags : [],
        }))
      }
    }
  }
  return []
})

ipcMain.handle('wb:get-article', async (_e, articleId: string) => {
  const data = loadWB()
  if (!data || !Array.isArray(data.categories)) return null
  for (const cat of data.categories as Array<Record<string, unknown>>) {
    const subs = Array.isArray(cat.subcategories) ? cat.subcategories as Array<Record<string, unknown>> : []
    for (const sc of subs) {
      const articles = Array.isArray(sc.articles) ? sc.articles as Array<Record<string, unknown>> : []
      for (const a of articles) {
        if (a.id === articleId) {
          // Ensure steps and tags are arrays
          return { ...a, steps: Array.isArray(a.steps) ? a.steps : [], tags: Array.isArray(a.tags) ? a.tags : [], relatedSkills: Array.isArray(a.relatedSkills) ? a.relatedSkills : [] }
        }
      }
    }
  }
  return null
})

ipcMain.handle('wb:search', async (_e, query: string) => {
  const data = loadWB()
  if (!data || !Array.isArray(data.categories) || !query || query.length < 2) return []
  const q = query.toLowerCase()
  const results: unknown[] = []
  for (const cat of data.categories as Array<Record<string, unknown>>) {
    const catName = String(cat.name ?? '')
    const subs = Array.isArray(cat.subcategories) ? cat.subcategories as Array<Record<string, unknown>> : []
    for (const sc of subs) {
      const scName = String(sc.name ?? '')
      const articles = Array.isArray(sc.articles) ? sc.articles as Array<Record<string, unknown>> : []
      for (const a of articles) {
        const title = String(a.title ?? '')
        const desc = String(a.description ?? '')
        const tags = Array.isArray(a.tags) ? a.tags as string[] : []
        const steps = Array.isArray(a.steps) ? a.steps as Array<Record<string, unknown>> : []
        const match = title.toLowerCase().includes(q)
          || desc.toLowerCase().includes(q)
          || tags.some(t => String(t).toLowerCase().includes(q))
          || steps.some(s => String(s.content ?? '').toLowerCase().includes(q))
        if (match) {
          results.push({ id: a.id, title, description: desc, categoryName: catName, subcategoryName: scName, tags })
          if (results.length >= 50) return results
        }
      }
    }
  }
  return results
})

ipcMain.handle('wb:ensure-generated', async () => {
  // If already cached in RAM, skip
  if (_wbCache && Array.isArray(_wbCache.categories) && (_wbCache.categories as unknown[]).length > 0) {
    console.log('[WB] Already in RAM cache')
    return { exists: true, generated: false }
  }
  // Try loading from network
  const loaded = loadWB()
  if (loaded && Array.isArray(loaded.categories) && (loaded.categories as unknown[]).length > 0) {
    console.log('[WB] Loaded from network')
    return { exists: true, generated: false }
  }
  // Not found — generate it and keep in RAM (also try to save to network)
  try {
    console.log('[WB] Not found — generating...')
    const { generateWissensdatenbank } = require('./wissensdatenbankGenerator')
    const wb = generateWissensdatenbank()
    _wbCache = wb as unknown as Record<string, unknown>
    console.log(`[WB] Generated: ${(wb.categories as unknown[]).length} categories`)
    // Try to save to network (may fail in offline mode — that's OK)
    try { ns.writeJson('knowledge_base/wissensdatenbank.json', wb) } catch { /* offline */ }
    return { exists: true, generated: true }
  } catch (err) {
    console.error('[WB] Generation failed:', err)
  }
  return { exists: false, generated: false }
})

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

// ── E-Mail via Outlook COM / PowerShell / Nodemailer ──────────────────────────
ipcMain.handle('mail:sendRaw', async (_e, opts: {
  to: string; subject: string; body: string; html?: boolean
  smtp: string; port: number; user?: string; pass?: string; from?: string
  useTls?: boolean; method?: 'outlook' | 'nodemailer' | 'powershell'
}): Promise<{ success: boolean; error?: string; method?: string }> => {

  const method = opts.method ?? 'outlook'
  console.log(`[mail:sendRaw] method=${method} to=${opts.to} subject="${opts.subject?.slice(0, 40)}"`)

  // ── Outlook COM via VBScript (like SKF Protokoll Generator — no password needed) ──
  if (method === 'outlook') {
    try {
      const { writeFileSync, unlinkSync } = require('fs') as typeof import('fs')
      const { tmpdir } = require('os') as typeof import('os')
      const { join: pjoin } = require('path') as typeof import('path')
      const { execSync } = require('child_process') as typeof import('child_process')

      const safeTo = opts.to.replace(/"/g, '')
      const safeSubject = opts.subject.replace(/"/g, '')
      const safeBody = opts.body
        .replace(/"/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\n/g, '" & Chr(10) & "')
        .replace(/\r/g, '')

      const vbsLines = [
        'Set objOutlook = CreateObject("Outlook.Application")',
        'Set objMail = objOutlook.CreateItem(0)',
        'With objMail',
        `    .To = "${safeTo}"`,
        `    .Subject = "${safeSubject}"`,
        `    .Body = "${safeBody}"`,
        '    .Send',
        'End With',
      ]

      const vbsContent = vbsLines.join('\r\n')
      // Save VBS to a shared temp location accessible by the desktop user
      const vbsPath = pjoin(tmpdir(), `it_admin_mail_${Date.now()}.vbs`)
      const resultPath = vbsPath + '.result'

      console.log(`[mail:sendRaw][outlook] Writing VBS to: ${vbsPath}`)
      writeFileSync(vbsPath, vbsContent, 'utf-8')

      try {
        // Detect current desktop user (may differ from process owner when running as admin)
        const desktopUser = (() => {
          try {
            const { execSync: es } = require('child_process') as typeof import('child_process')
            // query the interactive session user
            const whoOut = es('query user 2>nul || quser 2>nul || echo UNKNOWN', { encoding: 'utf-8', windowsHide: true, timeout: 5000 })
            const lines = whoOut.split('\n').filter(l => l.includes('Active') || l.includes('Aktiv'))
            if (lines.length > 0) {
              const parts = lines[0].trim().split(/\s+/)
              const u = parts[0].replace(/^>/, '')
              if (u && u !== 'UNKNOWN') return u
            }
          } catch {}
          return ''
        })()

        const processUser = userInfo().username
        console.log(`[mail:sendRaw][outlook] Process user: ${processUser}, Desktop user: ${desktopUser || '(same)'}`)

        // If running as different user (admin elevation), use schtasks to run VBS as the desktop user
        if (desktopUser && desktopUser.toLowerCase() !== processUser.toLowerCase()) {
          console.log(`[mail:sendRaw][outlook] Running as elevated admin — using schtasks for desktop user: ${desktopUser}`)
          const { execSync: es } = require('child_process') as typeof import('child_process')
          const taskName = 'IT_Admin_SendMail'
          // Create a wrapper VBS that writes result to file
          const wrapperVbs = vbsLines.join('\r\n') + '\r\nDim fso : Set fso = CreateObject("Scripting.FileSystemObject")\r\nDim f : Set f = fso.CreateTextFile("' + resultPath.replace(/\\/g, '\\\\') + '", True)\r\nf.Write "OK"\r\nf.Close'
          writeFileSync(vbsPath, wrapperVbs, 'utf-8')
          try {
            es(`schtasks /create /tn "${taskName}" /tr "cscript //nologo \\"${vbsPath}\\"" /sc once /st 00:00 /ru "${desktopUser}" /f`, { encoding: 'utf-8', windowsHide: true, timeout: 10000 })
            es(`schtasks /run /tn "${taskName}"`, { encoding: 'utf-8', windowsHide: true, timeout: 10000 })
            // Wait for result
            const maxWait = 15000
            const start = Date.now()
            while (Date.now() - start < maxWait) {
              if (existsSync(resultPath)) {
                const res = readFileSync(resultPath, 'utf-8').trim()
                console.log(`[mail:sendRaw][outlook] schtasks result: ${res}`)
                try { unlinkSync(resultPath) } catch {}
                try { es(`schtasks /delete /tn "${taskName}" /f`, { windowsHide: true, timeout: 5000 }) } catch {}
                if (res === 'OK') return { success: true, method: 'outlook' }
                break
              }
              // eslint-disable-next-line no-await-in-loop
              await new Promise(r => setTimeout(r, 500))
            }
            try { es(`schtasks /delete /tn "${taskName}" /f`, { windowsHide: true, timeout: 5000 }) } catch {}
          } catch (taskErr: unknown) {
            console.error('[mail:sendRaw][outlook] schtasks error:', taskErr)
          }
        } else {
          // Same user — run directly
          const { execSync: es } = require('child_process') as typeof import('child_process')
          const output = es(`cscript //nologo "${vbsPath}"`, { timeout: 30000, encoding: 'utf-8', windowsHide: true })
          console.log(`[mail:sendRaw][outlook] cscript output: ${output.trim()}`)
          return { success: true, method: 'outlook' }
        }
      } catch (execErr: unknown) {
        const e = execErr as { stderr?: string; stdout?: string; message?: string }
        const errMsg = e.stderr || e.stdout || e.message || 'Outlook-Fehler'
        console.error(`[mail:sendRaw][outlook] error:`, errMsg)
      } finally {
        try { unlinkSync(vbsPath) } catch { /* ignore */ }
        try { unlinkSync(resultPath) } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('[mail:sendRaw][outlook] exception:', err)
    }
    // Fall through to PowerShell/Nodemailer as fallback
  }

  // ── PowerShell .NET SmtpClient (uses Windows credentials automatically) ─────
  if (method === 'powershell') {
    try {
      const safeFrom    = (opts.from || opts.to).replace(/'/g, "''")
      const safeTo      = opts.to.replace(/'/g, "''")
      const safeSubject = opts.subject.replace(/'/g, "''")
      const safeBody    = opts.body.replace(/'/g, "''")
      const safeSmtp    = opts.smtp.replace(/'/g, "''")
      const enableSsl   = opts.useTls !== false ? '$true' : '$false'
      const ps = [
        `$ErrorActionPreference = 'Stop'`,
        `try {`,
        `  $smtp = New-Object System.Net.Mail.SmtpClient('${safeSmtp}', ${opts.port})`,
        `  $smtp.EnableSsl = ${enableSsl}`,
        `  $smtp.UseDefaultCredentials = $true`,
        `  $mail = New-Object System.Net.Mail.MailMessage`,
        `  $mail.From = '${safeFrom}'`,
        `  $mail.To.Add('${safeTo}')`,
        `  $mail.Subject = '${safeSubject}'`,
        `  $mail.Body = '${safeBody}'`,
        `  $mail.IsBodyHtml = $${opts.html ? 'true' : 'false'}`,
        `  $mail.SubjectEncoding = [System.Text.Encoding]::UTF8`,
        `  $mail.BodyEncoding = [System.Text.Encoding]::UTF8`,
        `  $smtp.Send($mail)`,
        `  $smtp.Dispose()`,
        `  Write-Output 'OK'`,
        `} catch {`,
        `  Write-Output "ERR:$($_.Exception.Message)"`,
        `}`,
      ].join('\n')
      console.log('[mail:sendRaw][ps] sending via .NET SmtpClient (UseDefaultCredentials=true)')
      const res = await runPowerShell(ps, 30000)
      console.log('[mail:sendRaw][ps] stdout=%s stderr=%s exit=%d', res.stdout.trim(), res.stderr.trim(), res.exitCode)
      if (res.stdout.trim() === 'OK') return { success: true }
      const errMsg = res.stdout.trim().replace(/^ERR:/, '') || res.stderr.trim() || 'Unbekannter Fehler'
      return { success: false, error: `PowerShell SMTP: ${errMsg}` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[mail:sendRaw][ps] exception:', msg)
      return { success: false, error: `PowerShell SMTP Exception: ${msg}` }
    }
  }

  // ── Nodemailer ────────────────────────────────────────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodemailer = require('nodemailer') as typeof import('nodemailer')
    const transportOpts: Record<string, unknown> = {
      host: opts.smtp,
      port: opts.port,
      secure: opts.port === 465,   // implicit TLS only on port 465
      requireTLS: opts.useTls !== false,
      tls: {
        rejectUnauthorized: false, // accept self-signed / internal certs
      },
    }
    // No auth object = anonymous relay (internal Exchange / Office365 with IP whitelist)
    if (opts.user && opts.pass) {
      transportOpts.auth = { user: opts.user, pass: opts.pass }
    }
    console.log('[mail:sendRaw][nodemailer] config:', JSON.stringify({ ...transportOpts, auth: transportOpts.auth ? '***' : undefined }))
    const transporter = nodemailer.createTransport(transportOpts)
    const info = await transporter.sendMail({
      from: opts.from || opts.user || opts.to,
      to: opts.to,
      subject: opts.subject,
      [opts.html ? 'html' : 'text']: opts.body,
    })
    console.log('[mail:sendRaw][nodemailer] OK messageId=%s response=%s', info.messageId, info.response)
    return { success: true }
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string; response?: string; responseCode?: number; command?: string }
    const detail = [
      e.message,
      e.response      ? `SMTP-Response: ${e.response}` : '',
      e.responseCode  ? `Code: ${e.responseCode}` : '',
      e.code          ? `Fehlercode: ${e.code}` : '',
      e.command       ? `Befehl: ${e.command}` : '',
    ].filter(Boolean).join(' | ')
    console.error('[mail:sendRaw][nodemailer] ERROR:', detail)
    return { success: false, error: detail }
  }
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
