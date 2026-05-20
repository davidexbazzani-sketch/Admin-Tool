import { app, BrowserWindow, ipcMain, dialog, shell, Menu, screen as electronScreen, session as electronSession } from 'electron'
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

// ── Presentation window (Hall display) ──────────────────────────────────────
// Separate fullscreen BrowserWindow that hosts <webview> tags pre-loaded with
// the configured slides. The renderer code in PresentationPlayer.tsx handles
// cycling, timer, hotkeys etc. We open this as a child window of the main app.
let presentationWindow: BrowserWindow | null = null
let presentationHeadersStripped = false

function stripFramingHeadersOnce() {
  // ServiceNow & many internal dashboards set X-Frame-Options: SAMEORIGIN or
  // Content-Security-Policy: frame-ancestors. Without removing these headers
  // the embedded <webview> refuses to render the page. We strip them on the
  // default session — the presentation window also uses the default session.
  if (presentationHeadersStripped) return
  presentationHeadersStripped = true
  electronSession.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    const headers = details.responseHeaders || {}
    for (const key of Object.keys(headers)) {
      const lk = key.toLowerCase()
      if (lk === 'x-frame-options') delete headers[key]
      if (lk === 'content-security-policy') {
        const vals = headers[key] as string[]
        headers[key] = vals.map(v =>
          v.replace(/frame-ancestors[^;]*;?/gi, '').replace(/;\s*$/, '')
        )
      }
    }
    cb({ responseHeaders: headers })
  })
}

function openPresentationWindow(opts?: { displayId?: number }) {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.focus()
    return
  }
  stripFramingHeadersOnce()

  // Pick display: requested id, otherwise external monitor, otherwise primary
  const displays = electronScreen.getAllDisplays()
  const primary = electronScreen.getPrimaryDisplay()
  const requested = opts?.displayId != null ? displays.find(d => d.id === opts.displayId) : null
  const external = displays.find(d => d.id !== primary.id)
  const target = requested ?? external ?? primary
  const { x, y, width, height } = target.bounds

  presentationWindow = new BrowserWindow({
    x, y, width, height,
    fullscreen: true,
    frame: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true, // enables <webview> in the player route
    },
    show: false,
  })

  const url = isDev
    ? 'http://localhost:5173/#presentation'
    : `file://${join(__dirname, '../dist/index.html')}#presentation`

  if (isDev) {
    presentationWindow.loadURL(url)
  } else {
    presentationWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: 'presentation' })
  }

  presentationWindow.once('ready-to-show', () => {
    presentationWindow?.show()
    presentationWindow?.setFullScreen(true)
  })

  presentationWindow.on('closed', () => {
    presentationWindow = null
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

// Compose email: Outlook via ScheduledTask (UIPI bypass), falls back to mailto:
ipcMain.handle('mail:compose', async (_e, opts: {
  to: string; cc: string; subject: string; body: string; attachmentPath?: string
}) => {
  const { composeViaOutlookScheduledTask } = require('./outlookMailer') as typeof import('./outlookMailer')
  const result = await composeViaOutlookScheduledTask({
    to: opts.to, cc: opts.cc, subject: opts.subject, body: opts.body, attachmentPath: opts.attachmentPath,
  })
  if (result.success) return { success: true }

  // Fallback to mailto: (no attachment support)
  const url = `mailto:${encodeURIComponent(opts.to ?? '')}?cc=${encodeURIComponent(opts.cc ?? '')}&subject=${encodeURIComponent(opts.subject ?? '')}&body=${encodeURIComponent(opts.body ?? '')}`
  shell.openExternal(url)
  return { success: false, fallback: true }
})

// App version
ipcMain.handle('app:version', () => app.getVersion())

// ─── Presentation Mode IPC ──────────────────────────────────────────────────
ipcMain.handle('presentation:open', (_e, opts?: { displayId?: number }) => {
  openPresentationWindow(opts)
  return { success: true }
})
ipcMain.handle('presentation:close', () => {
  if (presentationWindow && !presentationWindow.isDestroyed()) {
    presentationWindow.close()
  }
  return { success: true }
})
ipcMain.handle('presentation:listDisplays', () => {
  const all = electronScreen.getAllDisplays()
  const primaryId = electronScreen.getPrimaryDisplay().id
  return all.map(d => ({
    id: d.id,
    label: d.label || `Display ${d.id}`,
    bounds: d.bounds,
    primary: d.id === primaryId,
    scaleFactor: d.scaleFactor,
  }))
})

// ─── Path Configuration IPC ─────────────────────────────────────────────────
ipcMain.handle('paths:load', async () => {
  try {
    const data = ns.readJson('config/paths.json')
    return { success: true, data }
  } catch {
    return { success: false, data: null }
  }
})

ipcMain.handle('paths:save', async (_e, config: unknown) => {
  try {
    ns.writeJson('config/paths.json', config)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

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

// ─── WISSENSDATENBANK DATA FORMAT NOTES ──────────────────────────────────────
// The network has TWO different formats in knowledge_base/:
// 1. categories/*.json — IT Guru format: flat array of problems with solutions/keywords/skillMapping
// 2. wissensdatenbank_generated.json — WB format: categories > subcategories > articles > steps
// The Wissensdatenbank UI expects format #2. If only #1 exists, we use the built-in generator.
// The generator creates ~47 articles with detailed step-by-step instructions.
// ─────────────────────────────────────────────────────────────────────────────

function loadWB(): Record<string, unknown> | null {
  if (_wbCache && Array.isArray(_wbCache.categories)) return _wbCache

  // Helper: check if data has the correct WB structure AND articles have steps with content
  function isValidWB(d: Record<string, unknown>): boolean {
    if (!Array.isArray(d.categories)) return false
    const cats = d.categories as Array<Record<string, unknown>>
    if (cats.length === 0) return false
    const hasSubs = Array.isArray(cats[0].subcategories)
    if (!hasSubs) return false
    const subs = cats[0].subcategories as Array<Record<string, unknown>>
    if (subs.length === 0 || !Array.isArray(subs[0].articles)) return false
    // CRITICAL: Also check that articles have actual steps with content
    // An older wissensdatenbank.json might have the right structure but empty steps
    const firstArticles = subs[0].articles as Array<Record<string, unknown>>
    if (firstArticles.length === 0) return false
    const firstArt = firstArticles[0]
    if (!Array.isArray(firstArt.steps) || firstArt.steps.length === 0) {
      console.log('[WB] isValidWB: Articles found but NO steps — rejecting this file (needs regeneration)')
      return false
    }
    const firstStep = (firstArt.steps as Array<Record<string, unknown>>)[0]
    if (!firstStep.content || String(firstStep.content).length < 10) {
      console.log('[WB] isValidWB: Steps found but no/empty content — rejecting')
      return false
    }
    return true
  }

  // Try 1: Read the generated WB file (saved by previous generator run)
  const generated = ns.readJson<Record<string, unknown>>('knowledge_base/wissensdatenbank_generated.json')
  if (generated && isValidWB(generated)) {
    console.log('[WB] Loaded wissensdatenbank_generated.json from network')
    _wbCache = generated
    return generated
  }

  // Try 2: Read wissensdatenbank.json (in case it was manually placed)
  const manual = ns.readJson<Record<string, unknown>>('knowledge_base/wissensdatenbank.json')
    ?? ns.readJson<Record<string, unknown>>('wissensdatenbank.json')
  if (manual && isValidWB(manual)) {
    console.log('[WB] Loaded wissensdatenbank.json from network')
    _wbCache = manual
    return manual
  }

  if (manual) {
    console.log(`[WB] wissensdatenbank.json found but wrong format (keys: ${Object.keys(manual).slice(0,5).join(',')})`)
  }

  // Try 3: Use built-in generator (always works, produces correct structure with ~47 articles)
  try {
    console.log('[WB] Using built-in generator...')
    const { generateWissensdatenbank } = require('./wissensdatenbankGenerator')
    const wb = generateWissensdatenbank()
    _wbCache = wb as unknown as Record<string, unknown>
    const cats = wb.categories as unknown[]
    console.log(`[WB] Generated: ${cats.length} categories`)
    // Save to network for faster loading next time (may fail if offline)
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
          const steps = Array.isArray(a.steps) ? a.steps : []
          console.log(`[WB-DEBUG] Article "${a.id}" found — keys: ${Object.keys(a).join(',')}`)
          console.log(`[WB-DEBUG] steps: isArray=${Array.isArray(a.steps)}, length=${(steps as unknown[]).length}`)
          if ((steps as unknown[]).length > 0) console.log(`[WB-DEBUG] first step keys: ${Object.keys((steps as Array<Record<string, unknown>>)[0]).join(',')}`)
          return { ...a, steps, tags: Array.isArray(a.tags) ? a.tags : [], relatedSkills: Array.isArray(a.relatedSkills) ? a.relatedSkills : [] }
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
  // If already cached in RAM, verify it has steps (not a stale cache from an old version)
  if (_wbCache && Array.isArray(_wbCache.categories) && (_wbCache.categories as unknown[]).length > 0) {
    const cats = _wbCache.categories as Array<Record<string, unknown>>
    const subs = Array.isArray(cats[0]?.subcategories) ? cats[0].subcategories as Array<Record<string, unknown>> : []
    const arts = Array.isArray(subs[0]?.articles) ? subs[0].articles as Array<Record<string, unknown>> : []
    const hasSteps = arts.length > 0 && Array.isArray(arts[0].steps) && (arts[0].steps as unknown[]).length > 0
    if (hasSteps) {
      console.log('[WB] Already in RAM cache (with steps)')
      return { exists: true, generated: false }
    }
    console.log('[WB] RAM cache exists but articles have NO steps — regenerating')
    _wbCache = null
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
    try { ns.writeJson('knowledge_base/wissensdatenbank_generated.json', wb) } catch { /* offline */ }
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

// ── E-Mail via Outlook COM ───────────────────────────────────────────────────
ipcMain.handle('mail:sendRaw', async (_e, opts: {
  to: string; subject: string; body: string; html?: boolean
  smtp: string; port: number; user?: string; pass?: string; from?: string
  useTls?: boolean; method?: 'outlook' | 'nodemailer' | 'powershell'
}): Promise<{ success: boolean; error?: string; method?: string }> => {

  console.log(`[mail:sendRaw] to=${opts.to} subject="${opts.subject?.slice(0, 40)}"`)

  try {
    const { sendViaOutlookScheduledTask } = require('./outlookMailer') as typeof import('./outlookMailer')
    const result = await sendViaOutlookScheduledTask({
      to: opts.to, subject: opts.subject, body: opts.body, html: opts.html,
    })
    console.log('[mail:sendRaw] result:', JSON.stringify(result))
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[mail:sendRaw] exception:', msg)
    return { success: false, error: msg, method: 'outlook' }
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
