"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = require("path");
const fs_1 = require("fs");
const os_1 = require("os");
const electron_store_1 = __importDefault(require("electron-store"));
const powerShellRunner_1 = require("./powerShellRunner");
const auth = __importStar(require("./authManager"));
const ns = __importStar(require("./networkStorage"));
// ========= WISSENSDATENBANK + GURU DEBUG =========
try {
    const _dbgBase = ns.getBasePath();
    console.log('=== NETZWERK-DEBUG START ===');
    console.log('BasePath:', _dbgBase);
    console.log('BasePath exists:', (0, fs_1.existsSync)(_dbgBase));
    // Test knowledge_base subdir
    const _kbDir = _dbgBase + '\\knowledge_base';
    console.log('KB dir:', _kbDir, 'exists:', (0, fs_1.existsSync)(_kbDir));
    // Try listing files
    if ((0, fs_1.existsSync)(_kbDir)) {
        const { readdirSync, statSync } = require('fs');
        const files = readdirSync(_kbDir);
        console.log('Files in knowledge_base:', files);
        for (const f of files) {
            try {
                const st = statSync(_kbDir + '\\' + f);
                console.log(`  ${f}: ${st.size} bytes (${Math.round(st.size / 1024)} KB)`);
            }
            catch { }
        }
    }
    // Try reading wissensdatenbank.json directly
    const _wPath = _kbDir + '\\wissensdatenbank.json';
    if ((0, fs_1.existsSync)(_wPath)) {
        const raw = (0, fs_1.readFileSync)(_wPath, 'utf-8');
        console.log('wissensdatenbank.json: read OK,', raw.length, 'chars');
        const data = JSON.parse(raw);
        console.log('  Type:', typeof data, 'IsArray:', Array.isArray(data));
        if (Array.isArray(data)) {
            console.log('  Array length:', data.length);
            if (data[0])
                console.log('  First item keys:', Object.keys(data[0]));
        }
        else if (typeof data === 'object' && data !== null) {
            const keys = Object.keys(data);
            console.log('  Object keys:', keys);
            for (const k of keys.slice(0, 5)) {
                const v = data[k];
                console.log(`    "${k}": type=${typeof v}, isArray=${Array.isArray(v)}, length=${Array.isArray(v) ? v.length : 'n/a'}`);
                if (Array.isArray(v) && v[0])
                    console.log(`      first item keys: ${Object.keys(v[0])}`);
            }
        }
    }
    else {
        console.log('wissensdatenbank.json NOT FOUND at', _wPath);
    }
    // Try guru_brain files
    for (const gf of ['guru_brain.json', 'guru_brain_starter.json', 'guru_requests.json', 'guru_requests_starter.json']) {
        const gp = _kbDir + '\\' + gf;
        console.log(`${gf}: exists=${(0, fs_1.existsSync)(gp)}${(0, fs_1.existsSync)(gp) ? ', size=' + (0, fs_1.statSync)(gp).size : ''}`);
    }
}
catch (e) {
    console.error('DEBUG ERROR:', e.message);
}
console.log('=== NETZWERK-DEBUG ENDE ===');
// ========= ENDE DEBUG =========
// NOTE: Hardware acceleration intentionally ENABLED.
// Disabling it (disableHardwareAcceleration) forces CPU-only software rendering.
// With all query categories open as admin (~40 DOM nodes), every checkbox re-render
// overloaded the CPU renderer → window went white. GPU rendering handles this without issue.
// If a specific machine has GPU driver problems, use --disable-gpu-compositing as a
// targeted CLI flag rather than killing GPU acceleration entirely.
const isDev = process.env.NODE_ENV === 'development' || !electron_1.app.isPackaged;
// Persistent settings store
const store = new electron_store_1.default({
    defaults: {
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        smtpPass: '',
        smtpFrom: '',
        exportPath: electron_1.app.getPath('documents'),
        adDomain: '',
        adServer: '',
        theme: 'dark',
    },
});
let mainWindow = null;
// PROBLEM 1 (UIPI): When the app runs elevated (HIGH integrity), Windows blocks
// WM_DROPFILES drag messages from Explorer (MEDIUM integrity). Fix: call
// ChangeWindowMessageFilterEx to allow those messages per-window.
async function fixAdminDragDrop(win) {
    if (process.platform !== 'win32')
        return;
    try {
        const hwnd = win.getNativeWindowHandle().readUInt32LE(0);
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
        ].join('\n');
        await (0, powerShellRunner_1.runPowerShell)(ps, 15000);
    }
    catch { /* non-critical — D&D may not work when running as admin */ }
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        backgroundColor: '#0f172a',
        webPreferences: {
            preload: (0, path_1.join)(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
        show: false,
        titleBarStyle: 'hidden',
    });
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        mainWindow.loadFile((0, path_1.join)(__dirname, '../dist/index.html'));
    }
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        // Fire-and-forget: allow drag-drop into admin-elevated window
        if (mainWindow)
            fixAdminDragDrop(mainWindow);
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0)
        createWindow();
});
// ─── IPC Handlers ───────────────────────────────────────────────────────────
// PowerShell execution
electron_1.ipcMain.handle('ps:run', async (_e, command, timeoutMs) => {
    return (0, powerShellRunner_1.runPowerShell)(command, timeoutMs ?? 30000);
});
// Admin check
electron_1.ipcMain.handle('ps:checkAdmin', async () => {
    const result = await (0, powerShellRunner_1.runPowerShell)('[bool](([System.Security.Principal.WindowsIdentity]::GetCurrent()).groups -match "S-1-5-32-544")', 5000);
    return result.stdout.toLowerCase().trim() === 'true';
});
// File open dialog
electron_1.ipcMain.handle('dialog:openFile', async (_e, filters) => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: filters ?? [
            { name: 'Alle Dateien', extensions: ['xlsx', 'xls', 'csv', 'docx', 'pdf'] },
        ],
    });
    return result.canceled ? null : result.filePaths[0];
});
// File save dialog
electron_1.ipcMain.handle('dialog:saveFile', async (_e, defaultPath, filters) => {
    const result = await electron_1.dialog.showSaveDialog(mainWindow, {
        defaultPath,
        filters: filters ?? [{ name: 'Alle Dateien', extensions: ['*'] }],
    });
    return result.canceled ? null : result.filePath;
});
// Directory picker
electron_1.ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
    });
    return result.canceled ? null : result.filePaths[0];
});
// Read file as base64
electron_1.ipcMain.handle('file:read', async (_e, filePath) => {
    try {
        const buf = (0, fs_1.readFileSync)(filePath);
        return { success: true, data: buf.toString('base64'), filePath };
    }
    catch (err) {
        return { success: false, error: String(err) };
    }
});
// Write file from base64
electron_1.ipcMain.handle('file:write', async (_e, filePath, dataBase64) => {
    try {
        (0, fs_1.writeFileSync)(filePath, Buffer.from(dataBase64, 'base64'));
        return { success: true };
    }
    catch (err) {
        return { success: false, error: String(err) };
    }
});
// Store
electron_1.ipcMain.handle('store:get', () => store.store);
electron_1.ipcMain.handle('store:set', (_e, key, value) => {
    store.set(key, value);
    return true;
});
// Shell
electron_1.ipcMain.handle('shell:openExternal', (_e, url) => {
    electron_1.shell.openExternal(url);
});
// Open a local file in the system's default application
electron_1.ipcMain.handle('shell:openPath', async (_e, filePath) => {
    const error = await electron_1.shell.openPath(filePath);
    // openPath returns '' on success, or an error string on failure
    return error === '' ? { success: true } : { success: false, error };
});
// Cancel all running PowerShell/CMD processes
electron_1.ipcMain.handle('ps:cancelAll', () => {
    (0, powerShellRunner_1.killAllProcesses)();
    return true;
});
// Write a line to app.log in the userData directory
electron_1.ipcMain.handle('app:log', (_e, message) => {
    try {
        const logPath = (0, path_1.join)(electron_1.app.getPath('userData'), 'app.log');
        (0, fs_1.appendFileSync)(logPath, message, 'utf8');
    }
    catch { /* swallow logging errors */ }
});
// Compose email: tries Outlook COM (with attachment support), falls back to mailto:
electron_1.ipcMain.handle('mail:compose', async (_e, opts) => {
    // Encode text values as base64 to avoid PowerShell escaping issues with
    // special characters, quotes, and multi-line bodies
    const b64 = (s) => Buffer.from(s ?? '', 'utf8').toString('base64');
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
    ];
    if (opts.attachmentPath) {
        // Escape single quotes in path for PS single-quoted string
        psLines.push(`  $mail.Attachments.Add('${opts.attachmentPath.replace(/'/g, "''")}')`);
    }
    psLines.push(`  $mail.Display()`, `  Write-Output 'ok'`, `} catch { Write-Output "err: $($_.Exception.Message)" }`);
    const result = await (0, powerShellRunner_1.runPowerShell)(psLines.join('\n'), 12000);
    if (result.stdout.trim() === 'ok')
        return { success: true };
    // Outlook not available or failed → fall back to mailto: (no attachment)
    const url = `mailto:${encodeURIComponent(opts.to ?? '')}?cc=${encodeURIComponent(opts.cc ?? '')}&subject=${encodeURIComponent(opts.subject ?? '')}&body=${encodeURIComponent(opts.body ?? '')}`;
    electron_1.shell.openExternal(url);
    return { success: false, fallback: true };
});
// App version
electron_1.ipcMain.handle('app:version', () => electron_1.app.getVersion());
// ─── Auth / Network Storage IPC ──────────────────────────────────────────────
// Initialize on startup — check network, create first-run data
electron_1.ipcMain.handle('auth:init', async () => {
    return auth.initializeIfNeeded();
});
// Login with username + password
electron_1.ipcMain.handle('auth:login', async (_e, username, password) => {
    return auth.loginWithPassword(username, password);
});
// SSO: get Windows user and look up / create account
electron_1.ipcMain.handle('auth:sso', async () => {
    const info = (0, os_1.userInfo)();
    const winUser = info.username;
    const user = await auth.createOrGetSsoUser(winUser);
    return { user, windowsUsername: winUser };
});
// Verify recovery key
electron_1.ipcMain.handle('auth:verifyRecovery', async (_e, key) => {
    return auth.verifyRecoveryKey(key);
});
// Reset master admin password via recovery
electron_1.ipcMain.handle('auth:resetMasterPassword', async (_e, newPassword) => {
    return auth.resetMasterPasswordViaRecovery(newPassword);
});
// Hash a password
electron_1.ipcMain.handle('auth:hashPassword', async (_e, password) => {
    return auth.hashPassword(password);
});
// Compare a password with a hash
electron_1.ipcMain.handle('auth:comparePassword', async (_e, password, hash) => {
    return auth.comparePassword(password, hash);
});
// Get all users
electron_1.ipcMain.handle('auth:getUsers', () => auth.getUsers());
// Create user (admin, master_admin, or regular user)
electron_1.ipcMain.handle('auth:createAdmin', async (_e, params) => {
    return auth.createAdminUser(params);
});
// Update user (role, status, blockedFeatures, etc.)
electron_1.ipcMain.handle('auth:updateUser', (_e, userId, patch) => {
    return auth.updateUser(userId, patch);
});
// Update user password
electron_1.ipcMain.handle('auth:updatePassword', async (_e, userId, newPassword) => {
    return auth.updateUserPassword(userId, newPassword);
});
// Delete user
electron_1.ipcMain.handle('auth:deleteUser', (_e, userId) => {
    return auth.deleteUser(userId);
});
// Log an activity
electron_1.ipcMain.handle('auth:log', (_e, entry) => {
    auth.writeActivityLog(entry);
    return true;
});
// Read activity logs
electron_1.ipcMain.handle('auth:getLogs', (_e, monthKey) => {
    return auth.readActivityLogs(monthKey);
});
// App config
electron_1.ipcMain.handle('auth:getConfig', () => auth.getAppConfig());
electron_1.ipcMain.handle('auth:saveConfig', (_e, config) => {
    auth.saveAppConfig(config);
    return true;
});
// Network storage: read/write JSON
electron_1.ipcMain.handle('net:readJson', async (_e, relativePath) => {
    console.log(`[IPC net:readJson] request for: "${relativePath}"`);
    const result = ns.readJson(relativePath);
    if (result === null) {
        console.log(`[IPC net:readJson] "${relativePath}" returned null`);
    }
    else {
        const type = typeof result;
        const isArr = Array.isArray(result);
        console.log(`[IPC net:readJson] "${relativePath}" OK — type=${type} isArray=${isArr}`);
    }
    return result;
});
electron_1.ipcMain.handle('net:writeJson', (_e, relativePath, data) => {
    return ns.writeJson(relativePath, data);
});
electron_1.ipcMain.handle('net:exists', (_e, relativePath) => {
    return ns.fileExists(relativePath);
});
electron_1.ipcMain.handle('net:listDir', (_e, relativePath) => {
    return ns.listDir(relativePath);
});
electron_1.ipcMain.handle('net:deleteFile', (_e, relativePath) => {
    ns.deleteFile(relativePath);
    return true;
});
electron_1.ipcMain.handle('net:isAvailable', () => ns.isNetworkAvailable());
electron_1.ipcMain.handle('net:getBasePath', () => ns.getBasePath());
electron_1.ipcMain.handle('net:setBasePath', (_e, path) => { ns.setBasePath(path); return true; });
electron_1.ipcMain.handle('net:writeRawFile', (_e, relativePath, base64Data) => {
    return ns.writeRawFile(relativePath, base64Data);
});
electron_1.ipcMain.handle('net:readRawFile', (_e, relativePath) => {
    return ns.readRawFile(relativePath);
});
// ── Wissensdatenbank IPC (dedicated handlers for performance) ─────────────────
let _wbCache = null;
function loadWB() {
    if (_wbCache)
        return _wbCache;
    // Try both paths
    const data = ns.readJson('knowledge_base/wissensdatenbank.json')
        ?? ns.readJson('wissensdatenbank.json');
    if (data) {
        _wbCache = data;
        console.log('[WB] Loaded wissensdatenbank.json into cache');
    }
    return data;
}
electron_1.ipcMain.handle('wb:get-categories', async () => {
    const data = loadWB();
    if (!data?.categories)
        return [];
    const cats = data.categories;
    return cats.map(c => ({
        id: c.id, name: c.name, icon: c.icon,
        articleCount: c.subcategories.reduce((s, sc) => s + (sc.articles?.length ?? 0), 0),
        subcategories: c.subcategories.map(sc => ({ id: sc.id, name: sc.name, articleCount: sc.articles?.length ?? 0 })),
    }));
});
electron_1.ipcMain.handle('wb:get-articles', async (_e, subcategoryId) => {
    const data = loadWB();
    if (!data?.categories)
        return [];
    for (const cat of data.categories) {
        for (const sc of cat.subcategories) {
            if (sc.id === subcategoryId)
                return sc.articles.map(a => ({ id: a.id, title: a.title, description: a.description, tags: a.tags }));
        }
    }
    return [];
});
electron_1.ipcMain.handle('wb:get-article', async (_e, articleId) => {
    const data = loadWB();
    if (!data?.categories)
        return null;
    for (const cat of data.categories) {
        for (const sc of cat.subcategories) {
            for (const a of sc.articles) {
                if (a.id === articleId)
                    return a;
            }
        }
    }
    return null;
});
electron_1.ipcMain.handle('wb:search', async (_e, query) => {
    const data = loadWB();
    if (!data?.categories || !query || query.length < 2)
        return [];
    const q = query.toLowerCase();
    const results = [];
    for (const cat of data.categories) {
        for (const sc of cat.subcategories) {
            for (const a of sc.articles) {
                const match = a.title.toLowerCase().includes(q)
                    || a.description.toLowerCase().includes(q)
                    || a.tags.some(t => t.toLowerCase().includes(q))
                    || a.steps?.some(s => s.content.toLowerCase().includes(q));
                if (match) {
                    results.push({ id: a.id, title: a.title, description: a.description, categoryName: cat.name, subcategoryName: sc.name, tags: a.tags });
                    if (results.length >= 50)
                        return results;
                }
            }
        }
    }
    return results;
});
electron_1.ipcMain.handle('wb:ensure-generated', async () => {
    // Check if wissensdatenbank.json exists and is large enough
    const exists1 = ns.fileExists('knowledge_base/wissensdatenbank.json');
    const exists2 = ns.fileExists('wissensdatenbank.json');
    if (exists1 || exists2) {
        console.log('[WB] wissensdatenbank.json already exists');
        return { exists: true, generated: false };
    }
    // Generate it
    try {
        const { generateWissensdatenbank } = require('./wissensdatenbankGenerator');
        const wb = generateWissensdatenbank();
        const wrote = ns.writeJson('knowledge_base/wissensdatenbank.json', wb);
        if (wrote) {
            _wbCache = wb;
            console.log('[WB] Generated and saved wissensdatenbank.json');
            return { exists: true, generated: true };
        }
    }
    catch (err) {
        console.error('[WB] Generation failed:', err);
    }
    return { exists: false, generated: false };
});
// System info
electron_1.ipcMain.handle('sys:getWindowsUsername', () => (0, os_1.userInfo)().username);
electron_1.ipcMain.handle('sys:getHostname', () => (0, os_1.hostname)());
// Context menu (right-click paste/copy in input fields)
electron_1.ipcMain.handle('context-menu:show', (event) => {
    const menu = electron_1.Menu.buildFromTemplate([
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einfügen' },
        { type: 'separator' },
        { role: 'selectAll', label: 'Alles auswählen' },
    ]);
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (win)
        menu.popup({ window: win });
});
// Multi-file open dialog
electron_1.ipcMain.handle('dialog:openFiles', async (_e, filters) => {
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],
        filters: filters ?? [{ name: 'Alle Dateien', extensions: ['*'] }],
    });
    return result.canceled ? [] : result.filePaths;
});
// Window controls (custom titlebar)
electron_1.ipcMain.on('window:minimize', () => mainWindow?.minimize());
electron_1.ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized())
        mainWindow.unmaximize();
    else
        mainWindow?.maximize();
});
electron_1.ipcMain.on('window:close', () => mainWindow?.close());
// ── E-Mail via Outlook COM / PowerShell / Nodemailer ──────────────────────────
electron_1.ipcMain.handle('mail:sendRaw', async (_e, opts) => {
    const method = opts.method ?? 'outlook';
    console.log(`[mail:sendRaw] method=${method} to=${opts.to} subject="${opts.subject?.slice(0, 40)}"`);
    // ── Outlook COM via VBScript (like SKF Protokoll Generator — no password needed) ──
    if (method === 'outlook') {
        try {
            const { writeFileSync, unlinkSync } = require('fs');
            const { tmpdir } = require('os');
            const { join: pjoin } = require('path');
            const { execSync } = require('child_process');
            const safeTo = opts.to.replace(/"/g, '');
            const safeSubject = opts.subject.replace(/"/g, '');
            const safeBody = opts.body
                .replace(/"/g, '')
                .replace(/\r\n/g, '\n')
                .replace(/\n/g, '" & Chr(10) & "')
                .replace(/\r/g, '');
            const vbsLines = [
                'Set objOutlook = CreateObject("Outlook.Application")',
                'Set objMail = objOutlook.CreateItem(0)',
                'With objMail',
                `    .To = "${safeTo}"`,
                `    .Subject = "${safeSubject}"`,
                `    .Body = "${safeBody}"`,
                '    .Send',
                'End With',
            ];
            const vbsContent = vbsLines.join('\r\n');
            const vbsPath = pjoin(tmpdir(), `it_admin_mail_${Date.now()}.vbs`);
            console.log(`[mail:sendRaw][outlook] Writing VBS to: ${vbsPath}`);
            writeFileSync(vbsPath, vbsContent, 'utf-8');
            try {
                const output = execSync(`cscript //nologo "${vbsPath}"`, { timeout: 30000, encoding: 'utf-8', windowsHide: true });
                console.log(`[mail:sendRaw][outlook] cscript output: ${output.trim()}`);
                return { success: true, method: 'outlook' };
            }
            catch (execErr) {
                const e = execErr;
                const errMsg = e.stderr || e.stdout || e.message || 'Outlook-Fehler';
                console.error(`[mail:sendRaw][outlook] cscript error:`, errMsg);
                // Don't return error yet — fall through to SMTP fallback below
                console.log('[mail:sendRaw][outlook] Outlook failed, falling back to SMTP...');
            }
            finally {
                try {
                    unlinkSync(vbsPath);
                }
                catch { /* ignore */ }
            }
        }
        catch (err) {
            console.error('[mail:sendRaw][outlook] exception:', err);
        }
        // Fall through to PowerShell/Nodemailer as fallback
    }
    // ── PowerShell .NET SmtpClient (uses Windows credentials automatically) ─────
    if (method === 'powershell') {
        try {
            const safeFrom = (opts.from || opts.to).replace(/'/g, "''");
            const safeTo = opts.to.replace(/'/g, "''");
            const safeSubject = opts.subject.replace(/'/g, "''");
            const safeBody = opts.body.replace(/'/g, "''");
            const safeSmtp = opts.smtp.replace(/'/g, "''");
            const enableSsl = opts.useTls !== false ? '$true' : '$false';
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
            ].join('\n');
            console.log('[mail:sendRaw][ps] sending via .NET SmtpClient (UseDefaultCredentials=true)');
            const res = await (0, powerShellRunner_1.runPowerShell)(ps, 30000);
            console.log('[mail:sendRaw][ps] stdout=%s stderr=%s exit=%d', res.stdout.trim(), res.stderr.trim(), res.exitCode);
            if (res.stdout.trim() === 'OK')
                return { success: true };
            const errMsg = res.stdout.trim().replace(/^ERR:/, '') || res.stderr.trim() || 'Unbekannter Fehler';
            return { success: false, error: `PowerShell SMTP: ${errMsg}` };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[mail:sendRaw][ps] exception:', msg);
            return { success: false, error: `PowerShell SMTP Exception: ${msg}` };
        }
    }
    // ── Nodemailer ────────────────────────────────────────────────────────────────
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodemailer = require('nodemailer');
        const transportOpts = {
            host: opts.smtp,
            port: opts.port,
            secure: opts.port === 465, // implicit TLS only on port 465
            requireTLS: opts.useTls !== false,
            tls: {
                rejectUnauthorized: false, // accept self-signed / internal certs
            },
        };
        // No auth object = anonymous relay (internal Exchange / Office365 with IP whitelist)
        if (opts.user && opts.pass) {
            transportOpts.auth = { user: opts.user, pass: opts.pass };
        }
        console.log('[mail:sendRaw][nodemailer] config:', JSON.stringify({ ...transportOpts, auth: transportOpts.auth ? '***' : undefined }));
        const transporter = nodemailer.createTransport(transportOpts);
        const info = await transporter.sendMail({
            from: opts.from || opts.user || opts.to,
            to: opts.to,
            subject: opts.subject,
            [opts.html ? 'html' : 'text']: opts.body,
        });
        console.log('[mail:sendRaw][nodemailer] OK messageId=%s response=%s', info.messageId, info.response);
        return { success: true };
    }
    catch (err) {
        const e = err;
        const detail = [
            e.message,
            e.response ? `SMTP-Response: ${e.response}` : '',
            e.responseCode ? `Code: ${e.responseCode}` : '',
            e.code ? `Fehlercode: ${e.code}` : '',
            e.command ? `Befehl: ${e.command}` : '',
        ].filter(Boolean).join(' | ');
        console.error('[mail:sendRaw][nodemailer] ERROR:', detail);
        return { success: false, error: detail };
    }
});
// ── Heartbeat (crash detection) ───────────────────────────────────────────────
let _heartbeatUser = null;
electron_1.ipcMain.handle('heartbeat:set', (_e, username) => {
    _heartbeatUser = username;
    ns.writeJson(`heartbeat/${username}.json`, { username, timestamp: new Date().toISOString() });
    return true;
});
electron_1.ipcMain.handle('heartbeat:clear', (_e, username) => {
    _heartbeatUser = null;
    try {
        ns.deleteFile(`heartbeat/${username}.json`);
    }
    catch { /* ignore */ }
    return true;
});
electron_1.ipcMain.handle('heartbeat:check', (_e, username) => {
    return ns.readJson(`heartbeat/${username}.json`);
});
electron_1.app.on('before-quit', () => {
    if (_heartbeatUser) {
        try {
            ns.deleteFile(`heartbeat/${_heartbeatUser}.json`);
        }
        catch { /* ignore */ }
        _heartbeatUser = null;
    }
});
