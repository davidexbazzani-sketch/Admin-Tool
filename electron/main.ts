import { app, BrowserWindow, ipcMain, dialog, shell, Menu, screen as electronScreen, session as electronSession } from 'electron'
import { join } from 'path'
import { spawn, execFileSync, execFile, type ChildProcess } from 'child_process'
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { userInfo, hostname } from 'os'
import Store from 'electron-store'
import { runPowerShell, killAllProcesses } from './powerShellRunner'
import * as auth from './authManager'
import * as ns from './networkStorage'
import { registerKnowledgeSearchIpc } from './knowledgeSearchIpc'

// Wissenssuche-IPC (knowledge:load / knowledge:status) einmalig registrieren.
registerKnowledgeSearchIpc()

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

// Sicherheitsnetz: ein einzelner Fehler im Main-Prozess soll NIE das ganze
// Admin-Tool beenden — nur protokollieren (sonst wuerde z. B. ein Fehler rund um
// das ServiceNow-Anmeldefenster die komplette App schliessen).
process.on('uncaughtException', (err) => { try { console.error('[main] uncaughtException:', err) } catch { /* egal */ } })
process.on('unhandledRejection', (reason) => { try { console.error('[main] unhandledRejection:', reason) } catch { /* egal */ } })

// PROBLEM 1 (UIPI): When the app runs elevated (HIGH integrity), Windows blocks
// WM_DROPFILES drag messages from Explorer (MEDIUM integrity). Fix: call
// ChangeWindowMessageFilterEx to allow those messages per-window.
async function fixAdminDragDrop(win: BrowserWindow): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    const hwnd = win.getNativeWindowHandle().readUInt32LE(0)
    // WM_DROPFILES=0x0233, WM_COPYDATA=0x004A, WM_COPYGLOBALDATA=0x0049.
    // ChangeWindowMessageFilterEx betrifft nur das uebergebene (Top-Level-)Fenster;
    // Chromiums OLE-Drag-Drop laeuft jedoch ueber CHILD-Fenster (RenderWidgetHost).
    // Darum zusaetzlich das PROZESSWEITE ChangeWindowMessageFilter setzen, das die
    // Nachrichten fuer alle Fenster des Prozesses (inkl. Kind-Fenster) freigibt.
    const ps = [
      `Add-Type -TypeDefinition @'`,
      `using System;`,
      `using System.Runtime.InteropServices;`,
      `public class WinUipi {`,
      `    [DllImport("user32.dll", SetLastError=true)]`,
      `    public static extern bool ChangeWindowMessageFilterEx(IntPtr hWnd, uint msg, uint action, IntPtr pChangeInfo);`,
      `    [DllImport("user32.dll", SetLastError=true)]`,
      `    public static extern bool ChangeWindowMessageFilter(uint msg, uint flag);`,
      `}`,
      `'@`,
      `$h = [IntPtr][uint]${hwnd}`,
      `foreach ($m in 0x0233,0x004A,0x0049) {`,
      `    [WinUipi]::ChangeWindowMessageFilterEx($h, [uint]$m, 1u, [IntPtr]::Zero) | Out-Null`,
      `    [WinUipi]::ChangeWindowMessageFilter([uint]$m, 1u) | Out-Null`,
      `}`,
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
    // Versteckte Hilfsfenster (ServiceNow-Transport/-Anmeldung) schliessen, damit
    // KEIN unsichtbarer Prozess zurueckbleibt. Sonst feuert window-all-closed nicht,
    // die App laeuft im Hintergrund weiter — und der Installer meldet spaeter
    // "IT Admin Tool kann nicht geschlossen werden".
    try { if (snWindow && !snWindow.isDestroyed()) { snWindow.destroy(); snWindow = null } } catch { /* egal */ }
    try { if (snLoginWindow && !snLoginWindow.isDestroyed()) { snLoginWindow.destroy(); snLoginWindow = null } } catch { /* egal */ }
  })
}

// ── Presentation window (Hall display) ──────────────────────────────────────
// Separate fullscreen BrowserWindow that hosts <webview> tags pre-loaded with
// the configured slides. The renderer code in PresentationPlayer.tsx handles
// cycling, timer, hotkeys etc. We open this as a child window of the main app.
let presentationWindow: BrowserWindow | null = null
let presentationHeadersStripped = false

// ─── Präsentations-Auto-Klick (Anzeige/App aktiv halten) ────────────────────
// Optional: alle 20 s ein echter OS-Linksklick an der AKTUELLEN Cursor-Position
// (mouse_event, dx=dy=0 → keine Bewegung). Nur während das Präsentationsfenster
// offen ist; an dessen Lebenszyklus gekoppelt (Start ready-to-show, Stop closed).
let presentationAutoClick: ReturnType<typeof setInterval> | null = null
const AUTOCLICK_PS =
  `Add-Type -Name AC -Namespace WinAC -MemberDefinition '[DllImport("user32.dll")]public static extern void mouse_event(uint f,uint dx,uint dy,uint d,int e);'; ` +
  `[WinAC.AC]::mouse_event(0x02,0,0,0,0); Start-Sleep -Milliseconds 40; [WinAC.AC]::mouse_event(0x04,0,0,0,0)`
function doPresentationAutoClick() { void runPowerShell(AUTOCLICK_PS, 5000).catch(() => {}) }
function applyPresentationAutoClick(enabled: boolean) {
  if (presentationAutoClick) { clearInterval(presentationAutoClick); presentationAutoClick = null }
  if (enabled) presentationAutoClick = setInterval(doPresentationAutoClick, 20000)
}

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

function openPresentationWindow(opts?: { displayId?: number; previewPlaylistId?: string; autoClick?: boolean }) {
  const preview = opts?.previewPlaylistId
  const autoClick = !!opts?.autoClick
  // Vorschau-Playlist als Query mitgeben (Hash bleibt exakt "#presentation").
  const devUrl = preview
    ? `http://localhost:5173/?preview=${encodeURIComponent(preview)}#presentation`
    : 'http://localhost:5173/#presentation'
  const prodQuery = preview ? { preview } : undefined

  if (presentationWindow && !presentationWindow.isDestroyed()) {
    // Bereits offen: mit (ggf. neuer) Vorschau neu laden, damit "Start" immer
    // die aktuelle Auswahl zeigt — nicht die zuletzt geladene.
    if (isDev) presentationWindow.loadURL(devUrl)
    else presentationWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: 'presentation', query: prodQuery })
    presentationWindow.focus()
    applyPresentationAutoClick(autoClick)   // Option ggf. für den Neustart aktualisieren
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

  if (isDev) {
    presentationWindow.loadURL(devUrl)
  } else {
    presentationWindow.loadFile(join(__dirname, '../dist/index.html'), { hash: 'presentation', query: prodQuery })
  }

  presentationWindow.once('ready-to-show', () => {
    presentationWindow?.show()
    presentationWindow?.setFullScreen(true)
    applyPresentationAutoClick(autoClick)   // Klicker erst starten, wenn Fenster sichtbar
  })

  presentationWindow.on('closed', () => {
    presentationWindow = null
    applyPresentationAutoClick(false)       // deckt presentation:close UND manuelles Schließen ab
  })
}

app.whenReady().then(createWindow)

// Mutual-TLS: Firmen-Proxy (Zscaler) / SSL-Inspection oder ServiceNow selbst
// verlangt beim TLS-Handshake ein CLIENT-Zertifikat. Fuer webContents (Fenster/
// Webview) feuert dieses Event und wir waehlen automatisch ein gueltiges
// Zertifikat aus dem Windows-Zertifikatspeicher. Die letzte Anfrage wird zur
// Diagnose festgehalten (siehe servicenow:certDiag).
let lastClientCertInfo: {
  at: string; url: string; count: number
  certs: { subjectName: string; issuerName: string; validExpiry: number }[]
} | null = null
app.on('select-client-certificate', (event, _webContents, url, list, callback) => {
  const arr = list || []
  lastClientCertInfo = {
    at: new Date().toISOString(),
    url,
    count: arr.length,
    certs: arr.map(c => ({
      subjectName: c.subjectName || c.subject?.commonName || '',
      issuerName: c.issuerName || c.issuer?.commonName || '',
      validExpiry: c.validExpiry || 0,
    })),
  }
  if (arr.length > 0) {
    event.preventDefault()
    // Bevorzugt ein NICHT abgelaufenes Zertifikat, sonst das erste.
    const nowSec = Date.now() / 1000
    const valid = arr.find(c => (c.validExpiry || 0) > nowSec)
    callback(valid || arr[0])
  }
  // Keine passenden Zertifikate -> Default (Abbruch): dann sieht das Tool kein
  // Client-Zertifikat auf diesem Rechner.
})

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

// Gebuendeltes App-Asset (public/ bzw. dist/) als Base64 lesen.
// Noetig, weil fetch() im Production-Build (file:// + webSecurity) blockiert ist.
// rel wird gegen Pfad-Ausbrueche bereinigt und bleibt unterhalb des App-Ordners.
ipcMain.handle('asset:read', async (_e, rel: string) => {
  try {
    const safeRel = String(rel).replace(/\\/g, '/').split('/').filter(s => s && s !== '.' && s !== '..').join('/')
    const base = isDev ? join(__dirname, '../public') : join(__dirname, '../dist')
    const buf = readFileSync(join(base, safeRel))
    return { success: true, data: buf.toString('base64') }
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

// ── SNMP (Drucker-Statusabfrage & Geräte-Neustart) ──────────────────────────
// Läuft im Main-Prozess (Renderer/Browser können kein UDP 161). Nutzt das
// pure-JS-Modul "net-snmp". get/walk sind lesend (Community "public" i. d. R.
// offen); set ist schreibend (Write-Community, meist deaktiviert) und wird für
// den physischen Geräte-Neustart (prtGeneralReset = 4) verwendet.
// Werte werden serialisierbar zurückgegeben (Buffer → String, sonst Zahl).
ipcMain.handle('snmp:query', async (_e, opts: {
  host: string
  op: 'get' | 'walk' | 'set'
  oids?: string[]           // get
  oid?: string              // walk / set
  version?: 'v1' | 'v2c'
  community?: string
  timeoutMs?: number
  retries?: number
  setType?: 'Integer' | 'OctetString'   // set
  setValue?: string | number            // set
}): Promise<{ success: boolean; error?: string; varbinds?: { oid: string; type: string; value: string | number; hex?: string }[] }> => {
  const host = (opts?.host || '').trim()
  if (!host) return { success: false, error: 'Keine IP/Host angegeben.' }
  let snmp: typeof import('net-snmp')
  try { snmp = require('net-snmp') as typeof import('net-snmp') } catch (e) {
    return { success: false, error: 'SNMP-Modul nicht verfügbar: ' + (e instanceof Error ? e.message : String(e)) }
  }
  const community = (opts.community || 'public').trim() || 'public'
  const version = opts.version === 'v2c' ? snmp.Version2c : snmp.Version1
  const timeout = Math.min(Math.max(opts.timeoutMs ?? 3000, 500), 15000)
  const retries = Math.min(Math.max(opts.retries ?? 1, 0), 3)

  const typeName = (t: number): string => {
    const map = snmp.ObjectType as unknown as Record<string, number>
    for (const k of Object.keys(map)) if (map[k] === t) return k
    return String(t)
  }
  const vbVal = (vb: { type: number; value: unknown }): string | number => {
    const v = vb.value
    if (Buffer.isBuffer(v)) { const s = v.toString('utf8'); return /�/.test(s) ? v.toString('latin1') : s }
    if (typeof v === 'number' || typeof v === 'string') return v
    if (v == null) return ''
    return String(v)
  }
  // Rohbytes als Hex (z. B. ifPhysAddress = MAC) — der String-Wert wäre unbrauchbar.
  const vbHex = (vb: { value: unknown }): string | undefined =>
    Buffer.isBuffer(vb.value) ? (vb.value as Buffer).toString('hex') : undefined

  return await new Promise((resolve) => {
    let session: import('net-snmp').Session | null = null
    let done = false
    const finish = (r: { success: boolean; error?: string; varbinds?: { oid: string; type: string; value: string | number }[] }) => {
      if (done) return
      done = true
      try { session?.close() } catch { /* ignore */ }
      resolve(r)
    }
    // Sicherheitsnetz: falls die Library nie zurückruft.
    const guard = setTimeout(() => finish({ success: false, error: 'SNMP-Zeitüberschreitung' }), timeout * (retries + 2) + 2000)
    const clearGuard = () => clearTimeout(guard)
    try {
      session = snmp.createSession(host, community, { version, timeout, retries })
      session.on('error', (err: Error) => { clearGuard(); finish({ success: false, error: 'SNMP-Sitzungsfehler: ' + err.message }) })

      if (opts.op === 'get') {
        const oids = (opts.oids || []).filter(Boolean)
        if (oids.length === 0) { clearGuard(); return finish({ success: false, error: 'Keine OID(s) für get.' }) }
        session.get(oids, (error: Error | null, varbinds: Array<{ oid: string; type: number; value: unknown }>) => {
          clearGuard()
          if (error) return finish({ success: false, error: error.message })
          const out = (varbinds || []).map(vb => ({
            oid: vb.oid,
            type: snmp.isVarbindError(vb) ? 'error' : typeName(vb.type),
            value: snmp.isVarbindError(vb) ? snmp.varbindError(vb) : vbVal(vb),
            hex: snmp.isVarbindError(vb) ? undefined : vbHex(vb),
          }))
          finish({ success: true, varbinds: out })
        })
      } else if (opts.op === 'walk') {
        const base = (opts.oid || '').trim()
        if (!base) { clearGuard(); return finish({ success: false, error: 'Keine Basis-OID für walk.' }) }
        const collected: { oid: string; type: string; value: string | number; hex?: string }[] = []
        const feed = (varbinds: Array<{ oid: string; type: number; value: unknown }>) => {
          for (const vb of varbinds) {
            if (snmp.isVarbindError(vb)) continue
            collected.push({ oid: vb.oid, type: typeName(vb.type), value: vbVal(vb), hex: vbHex(vb) })
          }
        }
        session.subtree(base, 20, feed, (error?: Error | null) => {
          clearGuard()
          if (error && collected.length === 0) return finish({ success: false, error: error.message })
          // Fehler NACH Teilergebnissen: Daten zurückgeben, aber unvollständigen Walk signalisieren.
          finish({ success: true, varbinds: collected, error: error ? `Unvollständiger Walk: ${error.message}` : undefined })
        })
      } else if (opts.op === 'set') {
        const oid = (opts.oid || '').trim()
        if (!oid) { clearGuard(); return finish({ success: false, error: 'Keine OID für set.' }) }
        const type = opts.setType === 'OctetString' ? snmp.ObjectType.OctetString : snmp.ObjectType.Integer
        const value = type === snmp.ObjectType.Integer ? Number(opts.setValue) : String(opts.setValue ?? '')
        session.set([{ oid, type, value } as unknown as import('net-snmp').Varbind], (error: Error | null, varbinds: Array<{ oid: string; type: number; value: unknown }>) => {
          clearGuard()
          if (error) return finish({ success: false, error: error.message })
          const out = (varbinds || []).map(vb => ({
            oid: vb.oid,
            type: snmp.isVarbindError(vb) ? 'error' : typeName(vb.type),
            value: snmp.isVarbindError(vb) ? snmp.varbindError(vb) : vbVal(vb),
            hex: snmp.isVarbindError(vb) ? undefined : vbHex(vb),
          }))
          finish({ success: true, varbinds: out })
        })
      } else {
        clearGuard(); finish({ success: false, error: 'Unbekannte SNMP-Operation.' })
      }
    } catch (e) {
      clearGuard(); finish({ success: false, error: e instanceof Error ? e.message : String(e) })
    }
  })
})

// ── ServiceNow Table-API über die SSO-Sitzung (Session-Cookie) ──────────────
// Das SKF-Konto ist SSO-basiert -> es gibt KEIN lokales ServiceNow-Passwort,
// Basic Auth scheitert daher immer (401). Stattdessen meldet sich der Nutzer
// einmal per SSO an (wie im Browser); die Anmeldung liegt in einer eigenen,
// persistenten Partition 'persist:servicenow'. Alle API-Aufrufe laufen im
// versteckten Fenster derselben Partition OHNE Authorization-Header -> der
// Session-Cookie authentifiziert. mTLS (select-client-certificate) bleibt.
const SN_PARTITION = 'persist:servicenow'
let snWindow: BrowserWindow | null = null
let snIntegratedAuthConfigured = false

function snOriginOf(u: string): string { try { return new URL(u).origin } catch { return '' } }

// Integrated Auth (Negotiate/NTLM) fuer moeglichst klickfreies SSO erlauben —
// deckt Windows-Integrated-Login beim IdP ab. Einmalig, best-effort.
function configureSnIntegratedAuth(): void {
  if (snIntegratedAuthConfigured) return
  try {
    const ses = electronSession.fromPartition(SN_PARTITION)
    ses.allowNTLMCredentialsForDomains('*')
    snIntegratedAuthConfigured = true
  } catch { /* best effort */ }
}

// Basic-Auth entfaellt. Negotiate/NTLM-Challenges NICHT abfangen -> Electrons
// Integrated Auth beantwortet sie automatisch (siehe configureSnIntegratedAuth).
// Proxy-Auth (Zscaler) ebenfalls den Defaults ueberlassen.

function ensureSnWindow(): BrowserWindow {
  if (snWindow && !snWindow.isDestroyed()) return snWindow
  configureSnIntegratedAuth()
  const win = new BrowserWindow({ show: false, webPreferences: { partition: SN_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: false } })
  win.on('closed', () => { if (snWindow === win) snWindow = null })
  snWindow = win
  return win
}

// Sieht der Antworttext nach einer (SSO-)Anmeldeseite statt nach JSON aus?
function snLooksLikeLogin(body: string): boolean {
  const t = (body || '').slice(0, 4000).toLowerCase()
  if (!t) return false
  return t.includes('<html') || t.includes('<!doctype')
    || t.includes('login') || t.includes('sign in') || t.includes('anmeld')
    || t.includes('saml') || t.includes('sso')
}

// GET per direkter Navigation: setzt den Authorization-Header, liest den Status
// (did-navigate) und den Antworttext (nach did-finish-load).
function snNavGet(win: BrowserWindow, url: string, extraHeaders: string): Promise<{ ok: boolean; status?: number; body?: string; error?: string }> {
  return new Promise((resolve) => {
    let settled = false
    let status = 0
    const wc = win.webContents
    const onNav = (_e: unknown, _u: string, code: number) => { if (typeof code === 'number' && code > 0) status = code }
    const onFinish = () => {
      wc.executeJavaScript('(document.body&&document.body.innerText)||document.documentElement.innerText||""', true)
        .then((body: unknown) => finish({ ok: true, status, body: String(body || '') }))
        .catch((e: unknown) => finish({ ok: false, error: e instanceof Error ? e.message : String(e) }))
    }
    const onFail = (_e: unknown, code: number, desc: string, _u: string, isMain: boolean) => {
      if (!isMain || code === -3) return // ERR_ABORTED ignorieren
      let m = desc || ('Fehler ' + code)
      if (/ERR_SSL_CLIENT_AUTH_CERT_NEEDED/i.test(m)) m = 'Client-Zertifikat (mutual TLS) nicht auswählbar (siehe Diagnose).'
      else if (/ERR_PROXY|ERR_TUNNEL/i.test(m)) m = 'Proxy-Fehler beim Verbindungsaufbau: ' + m
      finish({ ok: false, error: m })
    }
    const timer = setTimeout(() => finish({ ok: false, error: 'Zeitüberschreitung bei der API-Anfrage.' }), 30000)
    function finish(r: { ok: boolean; status?: number; body?: string; error?: string }) {
      if (settled) return; settled = true
      clearTimeout(timer)
      wc.removeListener('did-navigate', onNav as never)
      wc.removeListener('did-finish-load', onFinish)
      wc.removeListener('did-fail-load', onFail as never)
      resolve(r)
    }
    wc.on('did-navigate', onNav as never)
    wc.on('did-finish-load', onFinish)
    wc.on('did-fail-load', onFail as never)
    win.loadURL(url, { extraHeaders }).catch(() => { /* Ablauf via Events */ })
  })
}

ipcMain.handle('servicenow:certDiag', () => lastClientCertInfo)

ipcMain.handle('servicenow:request', async (_e, opts: {
  instanceUrl: string
  method?: 'GET' | 'POST' | 'PATCH'; table: string; sysId?: string
  query?: string; fields?: string; limit?: number; body?: unknown
  auth?: { user: string; pass: string }
}): Promise<{ success: boolean; status?: number; data?: unknown; error?: string; needsLogin?: boolean }> => {
  try {
    const method = opts.method === 'PATCH' ? 'PATCH' : opts.method === 'POST' ? 'POST' : 'GET'
    const base = (opts.instanceUrl || '').trim().replace(/\/+$/, '')
    if (!base) return { success: false, error: 'Keine Instanz-URL konfiguriert.' }
    if (!/^https?:\/\//i.test(base)) return { success: false, error: 'Instanz-URL muss mit https:// beginnen.' }
    if (!opts.table) return { success: false, error: 'Keine Tabelle angegeben.' }
    const origin = snOriginOf(base)
    if (!origin) return { success: false, error: 'Instanz-URL ungültig.' }

    let path = `/api/now/table/${encodeURIComponent(opts.table)}`
    if (opts.sysId) path += `/${encodeURIComponent(opts.sysId)}`
    const params = new URLSearchParams()
    if (opts.query) params.set('sysparm_query', opts.query)
    if (opts.fields) params.set('sysparm_fields', opts.fields)
    if (opts.limit) params.set('sysparm_limit', String(opts.limit))
    params.set('sysparm_display_value', 'all')
    params.set('sysparm_exclude_reference_link', 'true')
    const url = origin + path + '?' + params.toString()

    // Integrationskonto (Basic Auth) hat Vorrang; ohne Konto authentifiziert die
    // SSO-Sitzung (Cookie). Transport IMMER ueber das versteckte Fenster —
    // net.request scheitert am Firmenrechner an der Client-Zertifikat-Auswahl
    // (Zscaler/mTLS, select-client-certificate feuert nur fuer webContents).
    const usedBasic = !!(opts.auth && opts.auth.user && opts.auth.pass)
    const authHeader = usedBasic
      ? 'Authorization: Basic ' + Buffer.from(`${opts.auth!.user}:${opts.auth!.pass}`, 'utf8').toString('base64')
      : ''
    const extraHeaders = 'Accept: application/json' + (authHeader ? '\n' + authHeader : '')

    const win = ensureSnWindow()

    let raw: { ok: boolean; status?: number; body?: string; error?: string }
    if (method === 'GET') {
      raw = await snNavGet(win, url, extraHeaders)
    } else {
      // PATCH (Phase 2): erst API-Origin per Navigation etablieren, dann same-origin fetch
      // (Basic- bzw. Cookie-authentifiziert; das CSRF-Token g_ck/X-UserToken folgt separat).
      await snNavGet(win, origin + '/api/now/table/sys_user?sysparm_limit=1', extraHeaders)
      const headers: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' }
      if (usedBasic) headers.Authorization = authHeader.replace(/^Authorization: /, '')
      const init = { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store', credentials: 'include' }
      const js = `(async()=>{try{const r=await fetch(${JSON.stringify(url)},${JSON.stringify(init)});const t=await r.text();return{ok:true,status:r.status,body:t}}catch(e){return{ok:false,error:String((e&&e.message)||e)}}})()`
      raw = await win.webContents.executeJavaScript(js, true) as { ok: boolean; status?: number; body?: string; error?: string }
    }

    if (!raw || !raw.ok) {
      let m = raw?.error || 'Anfrage fehlgeschlagen'
      if (/Failed to fetch|NetworkError|ERR_/i.test(m)) m = 'Verbindungsfehler bei der API-Anfrage: ' + m
      return { success: false, error: m }
    }
    let data: unknown
    try { data = raw.body ? JSON.parse(raw.body) : undefined } catch { data = raw.body }
    const status = raw.status || 0
    const hasResult = !!(data && typeof data === 'object' && 'result' in (data as Record<string, unknown>))
    if ((status >= 200 && status < 300) || (status === 0 && hasResult)) return { success: true, status: status || 200, data }

    // Nicht angemeldet: 401 ODER es kam eine (SSO-)Anmeldeseite/HTML statt JSON zurueck.
    if (status === 401 || (!hasResult && snLooksLikeLogin(typeof raw.body === 'string' ? raw.body : ''))) {
      if (usedBasic) {
        // Integrationskonto abgelehnt -> KEIN SSO-Prompt, sondern klare Meldung.
        return { success: false, status: status || 401, error: 'Integrationskonto abgelehnt (401) — Benutzername/Passwort im Zugang-Panel prüfen.' }
      }
      return { success: false, status: status || 401, needsLogin: true, error: 'ServiceNow-SSO-Anmeldung erforderlich. Bitte im Zugang-Panel anmelden.' }
    }
    let msg = `HTTP ${status}`
    if (status === 403) msg = 'Kein Zugriff (403) — ServiceNow-Rolle/Rechte für die Tabelle prüfen.'
    else if (status === 404) msg = 'Nicht gefunden (404) — Tabelle oder Instanz-URL prüfen.'
    const em = (data as { error?: { message?: string } } | undefined)?.error?.message
    if (em) msg += ` — ${em}`
    return { success: false, status, data, error: msg }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── ServiceNow SSO-Anmeldung (sichtbares Fenster) ───────────────────────────
// Öffnet die Instanz in einem echten Fenster (persist:servicenow). Der Nutzer
// meldet sich per SSO an (oft automatisch). Sobald die Table-API JSON liefert,
// gilt die Anmeldung als erfolgreich und das Fenster schließt sich.
let snLoginWindow: BrowserWindow | null = null

ipcMain.handle('servicenow:login', async (_e, instanceUrl: string): Promise<{ success: boolean; user?: string; error?: string }> => {
  const base = (instanceUrl || '').trim().replace(/\/+$/, '')
  const origin = snOriginOf(base)
  if (!origin) return { success: false, error: 'Instanz-URL ungültig.' }
  if (snLoginWindow && !snLoginWindow.isDestroyed()) { snLoginWindow.focus(); return { success: false, error: 'Anmeldefenster ist bereits geöffnet.' } }
  configureSnIntegratedAuth()

  return await new Promise((resolve) => {
    let settled = false
    let poll: ReturnType<typeof setInterval> | null = null
    const win = new BrowserWindow({
      show: true, width: 1000, height: 800, title: 'ServiceNow – Anmeldung',
      autoHideMenuBar: true,
      webPreferences: { partition: SN_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: false },
    })
    snLoginWindow = win
    const wc = win.webContents

    const onNav = () => { void probe() }

    function cleanup() {
      if (poll) { clearInterval(poll); poll = null }
      try { wc.removeListener('did-navigate', onNav) } catch { /* egal */ }
    }
    // Aufloesen + Fenster GESCHUETZT und VERZOEGERT schliessen (nicht synchron aus
    // einem webContents-Event heraus — das kann den Main-Prozess crashen).
    function settle(r: { success: boolean; user?: string; error?: string }) {
      if (settled) return
      settled = true
      cleanup()
      if (snLoginWindow === win) snLoginWindow = null
      resolve(r)
      setTimeout(() => { try { if (!win.isDestroyed()) win.destroy() } catch { /* egal */ } }, 300)
    }

    // Anmeldung ueber SESSION-COOKIES erkennen — reine Main-Prozess-API, KEIN
    // executeJavaScript im Fenster (das konnte den Prozess nativ crashen).
    // ServiceNow setzt nach erfolgreichem Login Benutzer-/Session-Cookies auf der
    // Instanz-Origin. Erkennung ist bewusst tolerant: schlaegt sie fehl, bleibt das
    // Fenster offen und der Nutzer schliesst es selbst (win 'closed' → Ticketliste
    // testet dann erneut). So kann hier NICHTS mehr abstuerzen.
    async function probe(): Promise<void> {
      if (settled) return
      let cur = ''
      try { if (win.isDestroyed() || wc.isDestroyed()) return; cur = wc.getURL() } catch { return }
      if (!cur.startsWith(origin)) return  // noch beim IdP / Anmeldeseite
      if (/login\.do|navpage\.do|\/sso|saml|logout|oauth/i.test(cur)) return  // noch Login/SSO
      try {
        const ses = electronSession.fromPartition(SN_PARTITION)
        const cookies = await ses.cookies.get({ url: origin })
        if (settled) return
        const loggedIn = cookies.some(c => /^glide_(session_store|user_activity|user_session)/i.test(c.name))
        if (loggedIn) settle({ success: true })
      } catch { /* noch nicht bereit */ }
    }

    win.on('closed', () => {
      if (!settled) { settled = true; cleanup(); if (snLoginWindow === win) snLoginWindow = null; resolve({ success: false, error: 'Anmeldung abgebrochen.' }) }
    })
    wc.on('did-navigate', onNav)

    poll = setInterval(() => { void probe() }, 3000)
    win.loadURL(origin + '/nav_to.do').catch(() => { try { win.loadURL(origin).catch(() => { /* egal */ }) } catch { /* egal */ } })
  })
})

ipcMain.handle('servicenow:logout', async (): Promise<{ success: boolean }> => {
  try {
    if (snWindow && !snWindow.isDestroyed()) { snWindow.destroy(); snWindow = null }
    await electronSession.fromPartition(SN_PARTITION).clearStorageData()
    return { success: true }
  } catch { return { success: false } }
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
  to: string; cc: string; subject: string; body: string; html?: boolean; attachmentPath?: string
}) => {
  const { composeViaOutlookScheduledTask } = require('./outlookMailer') as typeof import('./outlookMailer')
  const result = await composeViaOutlookScheduledTask({
    to: opts.to, cc: opts.cc, subject: opts.subject, body: opts.body, html: opts.html, attachmentPath: opts.attachmentPath,
  })
  if (result.success) return { success: true }

  // Fallback to mailto: (no attachment/HTML support -> HTML-Body auf Text reduzieren)
  const plainBody = opts.html
    ? (opts.body ?? '')
        .replace(/<\s*(br|\/li|\/p|\/div|\/tr)\s*\/?>/gi, '\n')
        .replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2: $1')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n').trim()
    : (opts.body ?? '')
  const url = `mailto:${encodeURIComponent(opts.to ?? '')}?cc=${encodeURIComponent(opts.cc ?? '')}&subject=${encodeURIComponent(opts.subject ?? '')}&body=${encodeURIComponent(plainBody)}`
  shell.openExternal(url)
  return { success: false, fallback: true }
})

// App version
ipcMain.handle('app:version', () => app.getVersion())

// ── Silent printing ──────────────────────────────────────────────────────────
// Laedt das uebergebene HTML in ein unsichtbares Fenster und druckt es OHNE
// Dialog auf dem Windows-Standarddrucker (silent: true). Wird u. a. von den
// Checklisten ("Drucken"-Button) genutzt.
//
// Wichtig: Ohne expliziten deviceName faellt Chromium teils auf "Als PDF
// speichern" bzw. "Microsoft Print to PDF" zurueck — dann erscheint ein
// "Druckausgabe speichern unter"-Dialog. Darum wird der echte (physische)
// Standarddrucker vorab ermittelt und explizit uebergeben.

const VIRTUAL_PRINTER_RE = /print to pdf|save as pdf|xps|onenote|fax/i

async function resolveDefaultPrinter(wc: Electron.WebContents): Promise<{ name?: string; error?: string }> {
  let printers: Electron.PrinterInfo[] = []
  try { printers = await wc.getPrintersAsync() } catch { /* leer */ }
  if (printers.length === 0) return { error: 'Kein Drucker auf diesem System gefunden.' }

  // 1) Windows-Standarddrucker laut Chromium
  let candidate = printers.find(p => p.isDefault)?.name

  // 2) Falls unbekannt oder virtuell: Standarddrucker per WMI nachschlagen
  //    (im elevated Kontext zuverlaessiger als die Chromium-Aufloesung)
  if (!candidate || VIRTUAL_PRINTER_RE.test(candidate)) {
    try {
      const res = await runPowerShell('(Get-CimInstance -ClassName Win32_Printer -Filter "Default=TRUE").Name', 10000)
      const name = (res.stdout || '').trim().split(/\r?\n/)[0]?.trim()
      if (name && printers.some(p => p.name === name)) candidate = name
    } catch { /* weiter mit Fallback */ }
  }

  // 3) Immer noch virtuell? Dann den ersten physischen Drucker nehmen.
  if (!candidate || VIRTUAL_PRINTER_RE.test(candidate)) {
    const physical = printers.filter(p => !VIRTUAL_PRINTER_RE.test(p.name))
    if (physical.length > 0) {
      candidate = (physical.find(p => p.isDefault) ?? physical[0]).name
    }
  }

  if (!candidate) return { error: 'Kein physischer Drucker gefunden — bitte einen Standarddrucker einrichten.' }
  return { name: candidate }
}

ipcMain.handle('print:html', async (_e, html: string) => {
  return new Promise<{ success: boolean; error?: string }>((resolve) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    })
    let settled = false
    const finish = (r: { success: boolean; error?: string }) => {
      if (settled) return
      settled = true
      try { if (!win.isDestroyed()) win.destroy() } catch { /* ok */ }
      resolve(r)
    }
    // Sicherheitsnetz: nie ewig haengen bleiben
    const timeout = setTimeout(() => finish({ success: false, error: 'Zeitueberschreitung beim Drucken.' }), 60_000)

    win.webContents.once('did-finish-load', () => {
      // Kurz warten, bis Bilder (Logo/Unterschrift, Data-URLs) gerendert sind
      setTimeout(async () => {
        const printer = await resolveDefaultPrinter(win.webContents)
        if (!printer.name) {
          clearTimeout(timeout)
          finish({ success: false, error: printer.error || 'Kein Drucker gefunden.' })
          return
        }
        win.webContents.print(
          { silent: true, printBackground: true, deviceName: printer.name, margins: { marginType: 'none' } },
          (ok, failureReason) => {
            clearTimeout(timeout)
            finish(ok ? { success: true } : { success: false, error: failureReason || 'Drucken fehlgeschlagen.' })
          },
        )
      }, 250)
    })
    win.webContents.once('did-fail-load', (_ev, _code, desc) => {
      clearTimeout(timeout)
      finish({ success: false, error: `Inhalt konnte nicht geladen werden: ${desc}` })
    })
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html)).catch(err => {
      clearTimeout(timeout)
      finish({ success: false, error: String(err) })
    })
  })
})

// ─── Presentation Mode IPC ──────────────────────────────────────────────────
ipcMain.handle('presentation:open', (_e, opts?: { displayId?: number; previewPlaylistId?: string; autoClick?: boolean }) => {
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

// ─── Task-Manager als eigenständiges Fenster (je Ziel-Host) ─────────────────
// Klon des Präsentationsfenster-Musters: gleiches Bundle, aber Hash "#taskmgr"
// + Query "?host=<host>". Normales (framed, resizable) Fenster, damit das
// Hauptfenster voll bedienbar bleibt. Ein Fenster pro Host (Map).
const taskmgrWindows = new Map<string, BrowserWindow>()
function openTaskManagerWindow(opts: { host: string; displayId?: number; admin?: boolean }) {
  const host = (opts?.host || '').trim()
  if (!host) return
  const admin = opts?.admin ? '1' : '0'   // reale Admin-Rolle ins Fenster durchreichen (UI-Gate für Beenden/Neustart)
  const key = host.toLowerCase()
  const existing = taskmgrWindows.get(key)
  if (existing && !existing.isDestroyed()) { existing.focus(); return }

  const displays = electronScreen.getAllDisplays()
  const primary = electronScreen.getPrimaryDisplay()
  const requested = opts?.displayId != null ? displays.find(d => d.id === opts.displayId) : null
  const target = requested ?? primary
  const w = 1120, h = 760
  const bx = target.bounds.x + Math.max(0, Math.floor((target.bounds.width - w) / 2))
  const by = target.bounds.y + Math.max(0, Math.floor((target.bounds.height - h) / 2))

  const win = new BrowserWindow({
    x: bx, y: by, width: w, height: h, minWidth: 760, minHeight: 500,
    title: `Task-Manager — ${host}`,
    frame: true, autoHideMenuBar: true, backgroundColor: '#0b0f17',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: false,
    },
    show: false,
  })
  if (isDev) win.loadURL(`http://localhost:5173/?host=${encodeURIComponent(host)}&admin=${admin}#taskmgr`)
  else win.loadFile(join(__dirname, '../dist/index.html'), { hash: 'taskmgr', query: { host, admin } })
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => { taskmgrWindows.delete(key) })
  taskmgrWindows.set(key, win)
}

ipcMain.handle('taskmgr:open', (_e, opts: { host: string; displayId?: number; admin?: boolean }) => {
  openTaskManagerWindow(opts)
  return { success: true }
})
ipcMain.handle('taskmgr:close', (_e, host?: string) => {
  if (host) { const wnd = taskmgrWindows.get(host.toLowerCase()); if (wnd && !wnd.isDestroyed()) wnd.close() }
  return { success: true }
})

// ─── Edge-Anzeige (SSO): URL in echtem Microsoft-Edge-Fenster (App-Modus) ─────
// Der interne Chromium hat keinen Zugriff auf den Windows-/Entra-SSO-Kontext.
// Fuer SSO-Seiten (eMaint/Auth0/Microsoft-SAML) starten wir daher echte
// msedge.exe-Fenster im App-Modus auf dem gewaehlten Monitor.

// msedge.exe robust finden: Standardpfade → Registry (App Paths) → "where msedge".
function findEdgePath(): string | null {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  for (const c of candidates) { try { if (existsSync(c)) return c } catch { /* egal */ } }
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe', '/ve'], { encoding: 'utf8' })
    const m = out.match(/REG_SZ\s+(.+msedge\.exe)/i)
    if (m && existsSync(m[1].trim())) return m[1].trim()
  } catch { /* egal */ }
  try {
    const out = execFileSync('where', ['msedge'], { encoding: 'utf8' })
    const first = out.split(/\r?\n/).map(s => s.trim()).find(Boolean)
    if (first && existsSync(first)) return first
  } catch { /* egal */ }
  return null
}

// Laufende Edge-Prozesse pro Monitor-ID (fuer zuverlaessiges Schliessen).
const edgeProcs = new Map<number, { proc: ChildProcess; pid?: number }>()

function killEdgeTree(pid?: number) {
  if (!pid) return
  try { execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => { /* best effort */ }) } catch { /* egal */ }
}

ipcMain.handle('edge:launch', (_e, opts: { url: string; displayId?: number; fullscreen?: boolean; ownProfile?: boolean }) => {
  const url = (opts?.url || '').trim()
  if (!/^https?:\/\//i.test(url)) return { success: false, error: 'Ungültige URL — nur http/https erlaubt.' }
  const edge = findEdgePath()
  if (!edge) return { success: false, error: 'Microsoft Edge (msedge.exe) wurde nicht gefunden. Bitte Edge installieren oder Pfad prüfen.' }

  const displays = electronScreen.getAllDisplays()
  const primary = electronScreen.getPrimaryDisplay()
  const disp = (opts.displayId != null ? displays.find(d => d.id === opts.displayId) : null) ?? primary
  const b = disp.bounds

  const args = [
    `--app=${url}`,
    `--window-position=${b.x},${b.y}`,
    `--window-size=${b.width},${b.height}`,
    '--no-first-run',
    '--no-default-browser-check',
  ]
  if (opts.fullscreen) args.push('--start-fullscreen')
  // Eigenes Profil (Standard AN): eigenstaendiger Prozess → PID-basiertes Schliessen
  // funktioniert; Login-Session bleibt im Profilordner ueber Neustarts erhalten.
  if (opts.ownProfile !== false) {
    const dir = join(app.getPath('userData'), 'edge-profiles', String(disp.id))
    try { mkdirSync(dir, { recursive: true }) } catch { /* egal */ }
    args.push(`--user-data-dir=${dir}`)
  } else {
    // Normales Edge-Profil → sofortige SSO-Uebernahme (Fenster ggf. manuell schliessen).
    args.push('--profile-directory=Default')
  }

  // Evtl. altes Fenster fuer diesen Monitor zuerst schliessen.
  const existing = edgeProcs.get(disp.id)
  if (existing) { killEdgeTree(existing.pid); edgeProcs.delete(disp.id) }

  try {
    const proc = spawn(edge, args, { detached: true, stdio: 'ignore' })
    const pid = proc.pid
    proc.on('exit', () => { if (edgeProcs.get(disp.id)?.proc === proc) edgeProcs.delete(disp.id) })
    proc.on('error', () => { if (edgeProcs.get(disp.id)?.proc === proc) edgeProcs.delete(disp.id) })
    edgeProcs.set(disp.id, { proc, pid })
    proc.unref()
    return { success: true, displayId: disp.id, ownProfile: opts.ownProfile !== false }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('edge:close', (_e, displayId?: number) => {
  if (displayId != null) {
    const e = edgeProcs.get(displayId)
    if (!e) return { success: false, error: 'Kein laufendes Edge-Fenster für diesen Monitor.' }
    killEdgeTree(e.pid); edgeProcs.delete(displayId)
    return { success: true }
  }
  for (const [id, e] of edgeProcs) { killEdgeTree(e.pid); edgeProcs.delete(id) }
  return { success: true }
})

ipcMain.handle('edge:status', (_e, displayId?: number) => {
  if (displayId != null) return { running: edgeProcs.has(displayId), displayId }
  return { running: edgeProcs.size > 0 }
})

// ─── USV: URL in Edge (Fallback Chrome, sonst Standardbrowser) öffnen ─────────
function findChromePath(): string | null {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  for (const c of candidates) { try { if (existsSync(c)) return c } catch { /* egal */ } }
  try {
    const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe', '/ve'], { encoding: 'utf8' })
    const m = out.match(/REG_SZ\s+(.+chrome\.exe)/i)
    if (m && existsSync(m[1].trim())) return m[1].trim()
  } catch { /* egal */ }
  try {
    const out = execFileSync('where', ['chrome'], { encoding: 'utf8' })
    const first = out.split(/\r?\n/).map(s => s.trim()).find(Boolean)
    if (first && existsSync(first)) return first
  } catch { /* egal */ }
  return null
}

ipcMain.handle('browser:openInEdgeOrChrome', (_e, url: string) => {
  const u = (url || '').trim()
  if (!/^https?:\/\//i.test(u)) return { success: false, error: 'Ungültige URL — nur http/https erlaubt.' }
  const exe = findEdgePath() || findChromePath()
  if (exe) {
    try {
      const p = spawn(exe, ['--new-window', u], { detached: true, stdio: 'ignore' })
      p.on('error', () => { /* Fallback greift unten nicht mehr — spawn hat bereits gestartet */ })
      p.unref()
      return { success: true }
    } catch { /* auf Standardbrowser zurueckfallen */ }
  }
  // Fallback: Standardbrowser
  try { void shell.openExternal(u); return { success: true, fallback: true } }
  catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
})

// USV-Notfallplan (DOCX) im Standard-Programm (Word) oeffnen.
ipcMain.handle('usv:openDoc', async () => {
  const rel = join('USV', 'SKF_SIAM_Marine_Hamburg_UPS_Emergency_SOP_V1-4.docx')
  const p = app.isPackaged ? join(process.resourcesPath, rel) : join(app.getAppPath(), 'resources', rel)
  if (!existsSync(p)) return { success: false, error: 'Dokument nicht gefunden.' }
  try {
    const err = await shell.openPath(p)
    return err ? { success: false, error: err } : { success: true }
  } catch (e) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
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
  if (snWindow && !snWindow.isDestroyed()) { try { snWindow.destroy() } catch { /* ignore */ } snWindow = null }
})
