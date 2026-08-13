// ── Drucker↔Computer/Person-Verbindungen ──────────────────────────────────────
// Ermittelt je Computer, welche (Netzwerk-)Drucker der/die angemeldete(n)
// Benutzer verbunden haben + welcher der Standarddrucker ist. Netzwerkdrucker-
// Verbindungen liegen PRO BENUTZER in HKCU — über WinRM (Admin-Kontext) NICHT
// sichtbar. Deshalb werden die geladenen Benutzer-Hives direkt gelesen:
//   registry::HKEY_USERS\<SID>\Printers\Connections\*   (Netzwerkverbindungen)
//   registry::HKU\<SID>\...\Windows  Wert 'Device'      (Standarddrucker)
// Hives sind geladen, solange der Benutzer angemeldet ist → daher läuft der
// Auto-Scan freitags 14:00 (Benutzer i. d. R. angemeldet).
//
// Verbinden/Standard/Entfernen müssen ebenfalls im BENUTZERKONTEXT laufen
// (per-Session) → Einmal-Scheduled-Task als der angemeldete User (Muster:
// dailyCommands.actionMapDriveI).
//
// Speicher (Netzlaufwerk, zentral):
//   printer_connections/scan_data.json
//   printer_connections/scan_schedule.json

import { api } from '../electronAPI'
import type { PSResult } from '../electronAPI'
import { buildBulkOnlineCheck, parseOnlineCheckLine } from '../utils/connectivityCheck'
import { ensureWinRM } from '../utils/winrmUtils'
import { batchAdLookup } from './adUserLookup'
import { PRINT_SERVERS } from './printerDossier'

export const CONN_DATA_PATH = 'printer_connections/scan_data.json'
export const CONN_SCHEDULE_PATH = 'printer_connections/scan_schedule.json'
const INVENTORY_FILE = 'inventory/inventory.json'
const STALE_LOCK_MS = 2 * 60 * 60 * 1000   // Claim älter als 2h = abgestürzt → übernehmbar

// ── Datenmodell ───────────────────────────────────────────────────────────────

export interface ConnPrinter {
  name: string          // Druckername (Share, z. B. "PMD634")
  connection: string    // UNC, z. B. "\\w3172\PMD634"
  user?: string         // Besitzer der Verbindung (DOMAIN\user)
  isDefault: boolean
  isNetwork: boolean
}
export interface ConnComputer {
  hostname: string
  loggedIn?: string     // primär angemeldeter Benutzer (DOMAIN\user)
  online: boolean
  printers: ConnPrinter[]
  scannedAt: string
  error?: string
}
export interface ConnScanData {
  scanDate: string
  scannedBy?: string
  computers: ConnComputer[]
  /** SamAccountName (lowercase) → Anzeigename (best effort, aus AD-Batch-Lookup). */
  users?: Record<string, string>
}

/** Flache Zeile für Auswertungen (je Drucker-Verbindung eines Users auf einem PC). */
export interface ConnFlat {
  hostname: string
  online: boolean
  user?: string         // Besitzer der Verbindung (bzw. angemeldeter User)
  sam?: string          // nur der Kontoname ohne Domäne
  display?: string      // Anzeigename (aus data.users, best effort) — sonst sam
  printerName: string
  connection: string
  isDefault: boolean
  scannedAt: string
}

export function canonPrinterName(s: string): string { return (s || '').trim().toUpperCase() }
function bareSam(u?: string): string { if (!u) return ''; const p = u.split('\\'); return (p[p.length - 1] || '').trim() }
/** Druckername (Share) aus einem UNC "\\server\Share" ableiten. */
export function shareOf(connection: string): string {
  const p = (connection || '').replace(/^\\+/, '').split('\\')
  return (p[p.length - 1] || '').trim()
}

// ── Laden/Speichern ───────────────────────────────────────────────────────────

export async function loadConnData(): Promise<ConnScanData | null> {
  try {
    const d = await api().netReadJson<ConnScanData>(CONN_DATA_PATH)
    if (d && Array.isArray(d.computers)) {
      // Robust gegen Schema-Drift/Teildaten: jedes computer.printers zu einem Array normalisieren.
      const computers = d.computers
        .filter(c => c && typeof c === 'object' && typeof c.hostname === 'string')
        .map(c => ({ ...c, printers: Array.isArray(c.printers) ? c.printers : [] }))
      return { ...d, computers, users: (d.users && typeof d.users === 'object') ? d.users : {} }
    }
  } catch { /* noch keins */ }
  return null
}
async function saveConnData(d: ConnScanData): Promise<boolean> {
  try { return await api().netWriteJson(CONN_DATA_PATH, d) } catch { return false }
}

// ── Auswertung ────────────────────────────────────────────────────────────────

/** Alle Verbindungen als flache Liste (für Filterung in den Views). */
export function flatten(data: ConnScanData | null): ConnFlat[] {
  if (!data) return []
  const users = data.users || {}
  const out: ConnFlat[] = []
  for (const c of (data.computers || [])) {
    for (const p of (c.printers || [])) {
      const sam = bareSam(p.user || c.loggedIn)
      out.push({
        hostname: c.hostname, online: c.online, user: p.user || c.loggedIn,
        sam, display: (sam && users[sam.toLowerCase()]) || undefined,
        printerName: p.name || shareOf(p.connection),
        connection: p.connection, isDefault: p.isDefault, scannedAt: c.scannedAt,
      })
    }
  }
  return out
}
/** Verbindungen zu EINEM Drucker (Name/Share, case-insensitiv). */
export function forPrinter(data: ConnScanData | null, printerName: string): ConnFlat[] {
  const key = canonPrinterName(printerName)
  return flatten(data).filter(f => canonPrinterName(f.printerName) === key)
}
/** Drucker EINES Computers (Hostname, case-insensitiv, ohne Domain-Suffix). */
export function forComputer(data: ConnScanData | null, hostname: string): ConnFlat[] {
  const h = (hostname || '').trim().split('.')[0].toUpperCase()
  return flatten(data).filter(f => f.hostname.trim().split('.')[0].toUpperCase() === h)
}
/** Drucker EINES Benutzers (per SamAccountName). */
export function forUser(data: ConnScanData | null, sam?: string): ConnFlat[] {
  const s = (sam || '').trim().toLowerCase()
  if (!s) return []
  return flatten(data).filter(f => (f.sam || '').toLowerCase() === s)
}

// ── Remote-Skript: verbundene Drucker je geladenem Benutzer-Hive lesen ─────────

// 4-Methoden-Erkennung des angemeldeten Benutzers (setzt $user = DOMAIN\user).
const USER_DETECTION = [
  `$user = $null`,
  `try { $cs = Get-CimInstance Win32_ComputerSystem -EA Stop; if ($cs.UserName) { $user = $cs.UserName } } catch {}`,
  `if (-not $user) { try { $qr = @(quser 2>&1) | Where-Object { "$_" -and "$_" -notmatch '^\\s*USERNAME|^\\s*BENUTZERNAME' }; $line = $qr | Where-Object { "$_" -match 'Active|Aktiv' } | Select-Object -First 1; if (-not $line) { $line = $qr | Select-Object -First 1 }; if ($line) { $parts = ("$line" -replace '^[> ]+','') -split '\\s{2,}'; $c0 = $parts[0]; if ($c0 -and $c0 -notmatch '\\\\') { $c0 = "$env:USERDOMAIN\\$c0" }; if ($c0) { $user = $c0 } } } catch {} }`,
  `if (-not $user) { try { $ep = @(Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA Stop) | Select-Object -First 1; if ($ep) { $ow = Invoke-CimMethod -InputObject $ep -MethodName GetOwner -EA Stop; if ($ow.User) { $user = "$($ow.Domain)\\$($ow.User)" } } } catch {} }`,
].join('\n')

function psq(s: string): string { return (s || '').replace(/'/g, "''") }

/** Baut das WinRM-Skript, das die pro-Benutzer-Druckerverbindungen eines Hosts liest. */
function buildConnScanCmd(hostname: string): string {
  const sb = [
    `$ErrorActionPreference='SilentlyContinue'`,
    USER_DETECTION,
    `$arr = @()`,
    `$loaded = @(Get-ChildItem 'registry::HKEY_USERS' -EA SilentlyContinue | Where-Object { $_.PSChildName -like 'S-1-5-21-*' -and $_.PSChildName -notlike '*_Classes' })`,
    `foreach ($hive in $loaded) {`,
    `  $sid = $hive.PSChildName`,
    `  $uname = ''`,
    `  try { $uname = (New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount]).Value } catch {}`,
    `  $def = ''`,
    `  try { $dev = (Get-ItemProperty "registry::HKU\\$sid\\Software\\Microsoft\\Windows NT\\CurrentVersion\\Windows" -Name Device -EA Stop).Device; if ($dev) { $def = ($dev -split ',')[0] } } catch {}`,
    `  $conns = @(Get-ChildItem "registry::HKU\\$sid\\Printers\\Connections" -EA SilentlyContinue)`,
    `  foreach ($c in $conns) {`,
    `    $nm = $c.PSChildName`,
    `    $unc = '\\\\' + (($nm -replace '^,+','') -replace ',','\\')`,
    `    $arr += [pscustomobject]@{ user=$uname; connection=$unc; isDefault=($unc -ieq $def) }`,
    `  }`,
    `}`,
    `$o = [ordered]@{ loggedIn=[string]$user; printers=@($arr) }`,
    `$o | ConvertTo-Json -Compress -Depth 4`,
  ].join('\n')
  return `try { Invoke-Command -ComputerName '${psq(hostname)}' -ScriptBlock { ${sb} } -EA Stop } catch { Write-Output ('ERR:' + $_.Exception.Message) }`
}

interface RemoteConn { user?: string; connection?: string; isDefault?: boolean }
function parseConnResult(hostname: string, res: PSResult | undefined, now: string): ConnComputer {
  const out: ConnComputer = { hostname, online: true, printers: [], scannedAt: now }
  const stdout = (res?.stdout ?? '').trim()
  if (!stdout || stdout.startsWith('ERR:')) { out.error = stdout.slice(4).trim() || 'Keine Antwort'; return out }
  const m = stdout.match(/\{[\s\S]*\}/)
  if (!m) { out.error = 'Ungültige Antwort'; return out }
  try {
    const p = JSON.parse(m[0]) as { loggedIn?: string; printers?: RemoteConn | RemoteConn[] }
    out.loggedIn = (p.loggedIn as string) || undefined
    const raw = Array.isArray(p.printers) ? p.printers : (p.printers ? [p.printers] : [])
    for (const r of raw) {
      const connection = (r.connection || '').trim()
      if (!connection) continue
      out.printers.push({ name: shareOf(connection), connection, user: r.user || undefined, isDefault: r.isDefault === true, isNetwork: true })
    }
  } catch { out.error = 'Antwort nicht lesbar' }
  return out
}

// ── Inventar + Batch-Helfer (klein, wie softwareInventoryScan) ─────────────────

async function loadComputerHostnames(): Promise<string[]> {
  try {
    const data = await api().netReadJson<{ name: string; category: string }[]>(INVENTORY_FILE)
    if (!Array.isArray(data)) return []
    return data.filter(i => i.category === 'Computer' && i.name).map(i => i.name)
  } catch { return [] }
}
async function runBatch<T>(items: string[], batchSize: number, fn: (item: string) => Promise<T>, onHeartbeat?: () => void | Promise<void>): Promise<Map<string, T>> {
  const out = new Map<string, T>()
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize)
    const res = await Promise.all(chunk.map(async h => [h, await fn(h)] as const))
    for (const [h, r] of res) out.set(h, r)
    await onHeartbeat?.()
  }
  return out
}
const psSafe = (cmd: string, t: number): Promise<PSResult> =>
  api().runPowerShell(cmd, t).catch(() => ({ stdout: '', stderr: '', exitCode: -1, timedOut: true } as PSResult))

export interface ConnScanResult { ok: boolean; reason?: string; candidates: number; online: number; withPrinters: number }

/** Führt EINEN vollständigen Verbindungs-Scan über alle Computer aus. */
export async function runConnectionScanOnce(by?: string, onHeartbeat?: () => void | Promise<void>): Promise<ConnScanResult> {
  const hosts = await loadComputerHostnames()
  if (hosts.length === 0) return { ok: false, reason: 'Keine Computer im Inventar (Kategorie „Computer").', candidates: 0, online: 0, withPrinters: 0 }
  const now = new Date().toISOString()

  // Phase 1: Online-Check (Ping→SMB→RPC), Batches à 40
  const onlineHosts: string[] = []
  for (let i = 0; i < hosts.length; i += 40) {
    const chunk = hosts.slice(i, i + 40)
    const res = await psSafe(buildBulkOnlineCheck(chunk), 120000)
    const lines = (res.stdout ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const onlineSet = new Set<string>()
    for (const l of lines) { const p = parseOnlineCheckLine(l); if (p && p.online) onlineSet.add(p.hostname.toUpperCase()) }
    for (const h of chunk) if (onlineSet.has(h.toUpperCase())) onlineHosts.push(h)
    await onHeartbeat?.()
  }

  // Phase 2: WinRM je Online-Host (Batch 10), pro-Benutzer-Drucker lesen
  const winrmRes = await runBatch(onlineHosts, 10, h => psSafe(buildConnScanCmd(h), 40000), onHeartbeat)
  const scanned: ConnComputer[] = onlineHosts.map(h => parseConnResult(h, winrmRes.get(h), now))

  // Merge mit vorigem Stand: offline/nicht gescannte (aber weiter im Inventar
  // vorhandene) Rechner behalten ihre letzte bekannte Verbindung (online:false),
  // statt bei jedem Lauf verloren zu gehen (kein Blind-Overwrite).
  const prev = await loadConnData()
  const inv = new Set(hosts.map(h => h.trim().toUpperCase()))
  const scannedSet = new Set(onlineHosts.map(h => h.trim().toUpperCase()))
  const merged: ConnComputer[] = [...scanned]
  for (const c of (prev?.computers || [])) {
    const key = (c.hostname || '').trim().toUpperCase()
    if (!inv.has(key)) continue            // nicht mehr im Inventar → verwerfen (Reconciliation)
    if (scannedSet.has(key)) continue      // in diesem Lauf frisch erfasst
    merged.push({ ...c, online: false })   // diesmal offline → letzten Stand behalten
  }

  // Anzeigenamen (best effort) für alle vorkommenden Benutzer via AD-Batch-Lookup.
  const users: Record<string, string> = { ...(prev?.users || {}) }
  try {
    const sams = new Set<string>()
    for (const c of merged) {
      if (c.loggedIn) sams.add(bareSam(c.loggedIn))
      for (const p of c.printers) if (p.user) sams.add(bareSam(p.user))
    }
    const need = [...sams].filter(s => s && !users[s.toLowerCase()])
    if (need.length > 0) {
      const res = await batchAdLookup(need)
      for (const [id, r] of res) if (r.displayName) users[id.toLowerCase()] = r.displayName
    }
  } catch { /* Anzeigenamen sind optional */ }

  const okSave = await saveConnData({ scanDate: now, scannedBy: by, computers: merged, users })
  if (!okSave) return { ok: false, reason: 'Ergebnis konnte nicht gespeichert werden (Netzlaufwerk?).', candidates: hosts.length, online: onlineHosts.length, withPrinters: 0 }
  return { ok: true, candidates: hosts.length, online: onlineHosts.length, withPrinters: scanned.filter(c => c.printers.length > 0).length }
}

// ── Zeitplan: alle 2 Wochen freitags 14:00 (instanzübergreifend, Nachholen) ────

export interface ConnScanSchedule {
  lastRunAt: string | null
  lastResult?: 'success' | 'error'
  lastSummary?: string
  running?: { by: string; at: string }
}

export async function loadConnSchedule(): Promise<ConnScanSchedule> {
  try {
    const s = await api().netReadJson<ConnScanSchedule>(CONN_SCHEDULE_PATH)
    if (s && typeof s === 'object') return { lastRunAt: s.lastRunAt ?? null, lastResult: s.lastResult, lastSummary: s.lastSummary, running: s.running }
  } catch { /* noch keiner */ }
  return { lastRunAt: null }
}
export async function saveConnSchedule(s: ConnScanSchedule): Promise<boolean> {
  try { return await api().netWriteJson(CONN_SCHEDULE_PATH, s) } catch { return false }
}

/** Jüngster „Freitag 14:00 mit gerader Wochen-Parität" ≤ now (= alle 2 Wochen). */
export function latestBiweeklyFridaySlot(now: Date): Date | null {
  for (let back = 0; back < 21; back++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, 14, 0, 0, 0)
    if (d.getTime() > now.getTime()) continue
    if (d.getDay() !== 5) continue                                   // 5 = Freitag
    if (Math.floor(d.getTime() / 604800000) % 2 !== 0) continue      // Biweekly-Parität
    return d
  }
  return null
}

/** Fällig, wenn der jüngste Biweekly-Freitag-14:00-Slot nach dem letzten Lauf liegt (Nachholen inkl.). */
export function isConnScanDue(s: ConnScanSchedule, now = Date.now()): boolean {
  const slot = latestBiweeklyFridaySlot(new Date(now))
  if (!slot) return false
  if (!s.lastRunAt) return true
  const t = new Date(s.lastRunAt).getTime()
  if (isNaN(t)) return true
  return t < slot.getTime()
}

/** Ein anderer, nicht veralteter Claim läuft gerade. */
export function isConnClaimed(s: ConnScanSchedule, now = Date.now()): boolean {
  if (!s.running) return false
  const t = new Date(s.running.at).getTime()
  if (isNaN(t)) return false
  return (now - t) < STALE_LOCK_MS
}

/**
 * Manueller Sofort-Lauf mit Gating: bricht ab, wenn bereits ein Scan läuft
 * (Hintergrund-Scheduler oder andere Instanz), setzt sonst selbst einen Claim
 * (blockt den Scheduler) und schreibt den Zeitplan fort (lastRunAt NUR bei Erfolg).
 */
export async function runConnectionScanManual(by?: string): Promise<ConnScanResult> {
  const s = await loadConnSchedule()
  if (isConnClaimed(s)) return { ok: false, reason: 'Ein Verbindungs-Scan läuft bereits (Hintergrund oder andere Instanz).', candidates: 0, online: 0, withPrinters: 0 }
  const token = `manual#${Math.random().toString(36).slice(2, 10)}`
  try { await saveConnSchedule({ ...s, running: { by: token, at: new Date().toISOString() } }) } catch { /* egal */ }
  try {
    const res = await runConnectionScanOnce(by)
    const summary = res.ok ? `${res.withPrinters} PCs mit Druckern / ${res.online} online / ${res.candidates} Computer` : (res.reason || 'Fehler')
    // lastRunAt nur bei Erfolg fortschreiben (transienter Fehler → nächster Lauf holt nach).
    try { await saveConnSchedule({ lastRunAt: res.ok ? new Date().toISOString() : s.lastRunAt, lastResult: res.ok ? 'success' : 'error', lastSummary: summary, running: undefined }) } catch { /* egal */ }
    return res
  } catch (e) {
    try { await saveConnSchedule({ ...s, running: undefined }) } catch { /* egal */ }
    throw e
  }
}

// ── Client-Aktionen im Benutzerkontext (verbinden/Standard/entfernen) ──────────
// Führt eine PowerShell-Operation als der angemeldete Benutzer des Ziel-PCs aus
// (Einmal-Scheduled-Task + Ergebnis-Rücklesung, Muster dailyCommands.actionMapDriveI).

export interface ClientActionResult { ok: boolean; text: string }

/** UNC aus Druckserver + Druckername; '' wenn kein Server hinterlegt. */
export function printerUnc(printServer: string | undefined, printerName: string): string {
  const s = (printServer || '').trim().replace(/^\\+/, '')
  const n = (printerName || '').trim()
  if (!s || !n) return ''
  return `\\\\${s}\\${n}`
}

/** UTF-16LE-Base64 für `powershell -EncodedCommand` (vermeidet jegliches Quoting/
 *  Variablen-Expansions-Problem beim Einbetten des Inner-Skripts). btoa ist im
 *  Renderer verfügbar; unsere Skripte sind ASCII. */
function toEncodedCommand(ps: string): string {
  let bin = ''
  for (let i = 0; i < ps.length; i++) { const c = ps.charCodeAt(i); bin += String.fromCharCode(c & 0xff, (c >> 8) & 0xff) }
  return btoa(bin)
}

async function runInUserContext(hostname: string, opPs: string, timeoutMs = 75000): Promise<ClientActionResult> {
  try {
    const okRm = await ensureWinRM(hostname)
    if (!okRm) return { ok: false, text: `WinRM konnte auf ${hostname} nicht aktiviert werden.` }
  } catch (e) { return { ok: false, text: `WinRM-Aktivierung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` } }

  // Eindeutiger Ergebnispfad (JS-seitig erzeugt → sowohl im Inner-Skript als auch
  // im Admin-Readback als Literal bekannt). Inner-Skript läuft als User.
  const guid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const rf = `C:\\Temp\\it_prn_${guid}.txt`
  const inner = [
    `$ErrorActionPreference='Stop'`,
    `try {`,
    `  if (-not (Test-Path 'C:\\Temp')) { New-Item -Path 'C:\\Temp' -ItemType Directory -Force | Out-Null }`,
    `  ${opPs}`,
    `  'OK' | Out-File '${rf}' -Encoding UTF8`,
    `} catch { ('ERR:' + $_.Exception.Message) | Out-File '${rf}' -Encoding UTF8 }`,
  ].join('\r\n')
  const enc = toEncodedCommand(inner)   // reines Base64 (A-Za-z0-9+/=) → sicher in ' '

  const sb = [
    `$result = 'ERR:Skript unvollstaendig'`,
    `try {`,
    USER_DETECTION,
    `  if (-not $user) { $result = 'NOUSER' } else {`,
    `    if (-not (Test-Path 'C:\\Temp')) { New-Item -Path 'C:\\Temp' -ItemType Directory -Force | Out-Null }`,
    `    Remove-Item '${rf}' -Force -EA SilentlyContinue`,
    `    $taskName = 'ITAdminPrn_' + (Get-Date -Format 'yyyyMMddHHmmssfff')`,
    `    try {`,
    `      $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ${enc}'`,
    `      $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2)`,
    `      Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -User $user -Force | Out-Null`,
    `      Start-ScheduledTask -TaskName $taskName`,
    `      $deadline = (Get-Date).AddSeconds(45)`,
    `      do { Start-Sleep -Milliseconds 800 } while ((-not (Test-Path '${rf}')) -and ((Get-Date) -lt $deadline))`,
    `      Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -EA SilentlyContinue`,
    `      $output = if (Test-Path '${rf}') { (Get-Content '${rf}' -Raw -EA SilentlyContinue).Trim() } else { '' }`,
    `      Remove-Item '${rf}' -Force -EA SilentlyContinue`,
    `      if (-not $output) { $result = 'ERR:Keine Rueckmeldung vom Task (User: ' + $user + ')' } else { $result = $output + ' (User: ' + $user + ')' }`,
    `    } catch { $result = 'ERR:Task fehlgeschlagen: ' + $_.Exception.Message }`,
    `  }`,
    `} catch { $result = 'ERR:' + $_.Exception.Message }`,
    `Write-Output ('RES:' + $result)`,
  ].join('\n')

  const script = `try { Invoke-Command -ComputerName '${psq(hostname)}' -ScriptBlock { ${sb} } -EA Stop } catch { Write-Output ('RES:ERR:' + $_.Exception.Message) }`
  const r = await psSafe(script, timeoutMs)
  const lines = (r.stdout ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const resLine = lines.find(l => l.startsWith('RES:'))
  if (!resLine) return { ok: false, text: r.stderr?.trim() || 'Keine Antwort vom Ziel-PC' }
  const body = resLine.slice(4)
  if (body === 'NOUSER') return { ok: false, text: 'Kein Benutzer am Ziel-PC angemeldet — Client-Aktionen laufen nur im Benutzerkontext.' }
  if (body.startsWith('ERR:')) return { ok: false, text: body.slice(4) }
  return { ok: true, text: body.replace(/^OK\s*/, '').trim() || 'OK' }
}

/** Drucker auf dem Ziel-PC für den angemeldeten Benutzer verbinden. */
export async function connectPrinter(hostname: string, unc: string): Promise<ClientActionResult> {
  if (!unc) return { ok: false, text: 'Kein Druckserver in den Stammdaten hinterlegt (\\\\server\\name nötig).' }
  return runInUserContext(hostname, `Add-Printer -ConnectionName '${psq(unc)}' -EA Stop`)
}
/** Drucker auf dem Ziel-PC als Standarddrucker des angemeldeten Benutzers setzen. */
export async function setDefaultPrinter(hostname: string, unc: string): Promise<ClientActionResult> {
  if (!unc) return { ok: false, text: 'Kein Druckserver in den Stammdaten hinterlegt.' }
  return runInUserContext(hostname, `(New-Object -ComObject WScript.Network).SetDefaultPrinter('${psq(unc)}')`)
}
/** Drucker-Verbindung auf dem Ziel-PC für den angemeldeten Benutzer entfernen. */
export async function removePrinterConnection(hostname: string, unc: string): Promise<ClientActionResult> {
  if (!unc) return { ok: false, text: 'Kein Druckserver in den Stammdaten hinterlegt.' }
  return runInUserContext(hostname, `Remove-Printer -Name '${psq(unc)}' -EA Stop`)
}

// ── Freigaben des Druckservers auflisten + korrekten Verbindungsnamen auflösen ──
// WICHTIG: Der Freigabename (ShareName) kann vom Queue-Namen abweichen.
// Add-Printer -ConnectionName braucht \\<Server>\<ShareName>. Mehrere Methoden mit
// Fallback, weil die Druckserver remote WEDER Get-Printer (StandardCimv2 → „Klasse
// nicht vorhanden") NOCH Get-CimInstance (läuft über WSMan/WinRM → nicht verfügbar)
// beantworten. Deshalb zuerst:
//   1) System.Printing.PrintServer  → Spooler-RPC, dieselbe Schiene wie Add-Printer
//   2) Get-WmiObject Win32_Printer   → klassisches WMI über DCOM (NICHT WSMan)
//   3) Get-Printer -ComputerName     → PrintManagement (Fallback)
//   4) Get-CimInstance Win32_Printer → WSMan (letzter Fallback)

export interface ServerPrinter { name: string; shareName: string; driver?: string; location?: string; comment?: string }

function parseServerPrinterJson(out: string): ServerPrinter[] {
  const parsed = JSON.parse(out)
  const arr = Array.isArray(parsed) ? parsed : [parsed]
  return arr.filter((p: { name?: string }) => p && p.name).map((p: { name: string; share?: string; driver?: string; location?: string; comment?: string }) => ({
    name: String(p.name), shareName: String(p.share || p.name), driver: p.driver ? String(p.driver) : undefined,
    location: p.location ? String(p.location) : undefined, comment: p.comment ? String(p.comment) : undefined,
  }))
}

interface EnumResult { ok: boolean; printers: ServerPrinter[]; error?: string }

// Einheitliche Auswertung: Skripte geben 'EMPTY' (erreichbar, 0 Freigaben),
// 'JSON:<...>' (Treffer) oder 'ERR:<msg>' aus → so ist „erreichbar aber leer"
// klar von „nicht erreichbar" unterscheidbar.
function finishEnum(res: PSResult, srv: string): EnumResult {
  if (res.timedOut) return { ok: false, printers: [], error: `Zeitüberschreitung (${srv})` }
  const out = (res.stdout ?? '').trim()
  if (out.startsWith('ERR:')) return { ok: false, printers: [], error: out.replace(/^ERR:/, '').trim() || 'Fehler' }
  if (out === 'EMPTY') return { ok: true, printers: [] }
  if (out.startsWith('JSON:')) {
    try { return { ok: true, printers: parseServerPrinterJson(out.slice(5)) } } catch { return { ok: false, printers: [], error: 'Antwort nicht lesbar' } }
  }
  return { ok: false, printers: [], error: res.stderr || 'Keine Antwort' }
}

/** Baut ein Enum-Skript, das die normalisierten Objekte als EMPTY/JSON:/ERR: ausgibt. */
function wrapEnum(setup: string, pipeline: string): string {
  return `try { ${setup ? setup + '; ' : ''}$r = @(${pipeline}); if ($r.Count -eq 0) { 'EMPTY' } else { 'JSON:' + ($r | ConvertTo-Json -Compress) } } catch { 'ERR:' + $_.Exception.Message }`
}

const PROJ = `@{ name=[string]$_.Name; share=[string]$_.ShareName; driver=[string]$_.DriverName; location=[string]$_.Location; comment=[string]$_.Comment }`

/** 1) Spooler-RPC über System.Printing.PrintServer (gleiche Schiene wie Add-Printer).
 *  WICHTIG: die freigegebenen Warteschlangen EXPLIZIT anfordern (Shared+Local) —
 *  das parameterlose GetPrintServer()-Enumerieren liefert sie sonst nicht (→ „0
 *  Freigaben"). Fallback: alle Queues, gefiltert auf IsShared/ShareName. */
async function enumViaPrintServer(srv: string): Promise<EnumResult> {
  const setup = [
    `Add-Type -AssemblyName System.Printing -EA Stop`,
    `$ps = New-Object System.Printing.PrintServer('\\\\${psq(srv)}', [System.Printing.PrintSystemDesiredAccess]::EnumerateServer)`,
    `$fl = [System.Printing.EnumeratedPrintQueueTypes[]]@([System.Printing.EnumeratedPrintQueueTypes]::Shared, [System.Printing.EnumeratedPrintQueueTypes]::Local)`,
    `$q = @($ps.GetPrintQueues($fl))`,
    `if ($q.Count -eq 0) { $q = @($ps.GetPrintQueues() | Where-Object { $_.IsShared -or $_.ShareName }) }`,
  ].join('; ')
  const pipeline = `$q | ForEach-Object { [pscustomobject]@{ name=[string]$_.Name; share=[string]$_.ShareName; driver=''; location=[string]$_.Location; comment=[string]$_.Comment } }`
  return finishEnum(await psSafe(wrapEnum(setup, pipeline), 20000), srv)
}

/** 2) Klassisches WMI über DCOM (Get-WmiObject, NICHT Get-CimInstance/WSMan). */
async function enumViaWmiDcom(srv: string): Promise<EnumResult> {
  const pipeline = `Get-WmiObject -Class Win32_Printer -ComputerName '${psq(srv)}' -EA Stop | Where-Object { $_.Shared } | ForEach-Object { [pscustomobject]${PROJ} }`
  return finishEnum(await psSafe(wrapEnum('', pipeline), 20000), srv)
}

/** 3) Get-Printer (PrintManagement / StandardCimv2). */
async function enumViaGetPrinter(srv: string): Promise<EnumResult> {
  const pipeline = `Get-Printer -ComputerName '${psq(srv)}' -EA Stop | Where-Object { $_.Shared -eq $true -or $_.ShareName } | ForEach-Object { [pscustomobject]${PROJ} }`
  return finishEnum(await psSafe(wrapEnum('', pipeline), 15000), srv)
}

/** 4) Get-CimInstance Win32_Printer (root\cimv2, läuft über WSMan). */
async function enumViaCimWsman(srv: string): Promise<EnumResult> {
  const pipeline = `Get-CimInstance -ClassName Win32_Printer -ComputerName '${psq(srv)}' -EA Stop | Where-Object { $_.Shared } | ForEach-Object { [pscustomobject]${PROJ} }`
  return finishEnum(await psSafe(wrapEnum('', pipeline), 15000), srv)
}

const ENUM_METHODS: { label: string; fn: (srv: string) => Promise<EnumResult> }[] = [
  { label: 'PrintServer (Spooler)', fn: enumViaPrintServer },
  { label: 'WMI (DCOM)', fn: enumViaWmiDcom },
  { label: 'Get-Printer', fn: enumViaGetPrinter },
  { label: 'Win32_Printer (WSMan)', fn: enumViaCimWsman },
]

export async function listServerPrinters(server: string): Promise<EnumResult> {
  const srv = (server || '').trim()
  if (!srv) return { ok: false, printers: [], error: 'Kein Druckserver angegeben.' }
  const errors: string[] = []
  for (const m of ENUM_METHODS) {
    const r = await m.fn(srv)
    if (r.ok) return r
    errors.push(`${m.label}: ${r.error}`)
  }
  return { ok: false, printers: [], error: `${srv} nicht abrufbar (${errors.join(' · ')})` }
}

/** Vollständiger Verbindungsname (\\Server\Freigabe) einer Server-Freigabe. */
export function serverConnection(server: string, sp: ServerPrinter): string {
  const s = (server || '').trim().replace(/^\\+/, '')
  return `\\\\${s}\\${sp.shareName || sp.name}`
}

// ── Zentrale, selbstheilende Auflösung des echten \\Server\Freigabe ─────────────
// Reihenfolge (erster Treffer gewinnt): (1) Scan-Daten (echte, von Clients bereits
// genutzte UNCs), (2) Live-Enumerierung über die bekannten Server, (3) AD-
// veröffentlichte Warteschlange. So verbindet das Tool auch, wenn der reale
// Server ≠ w3149 ist oder der Freigabename vom Warteschlangennamen abweicht.

export type ConnSource = 'scan' | 'server' | 'ad' | 'direct'
export interface ResolvedConnection {
  ok: boolean
  unc?: string
  server?: string
  share?: string
  source?: ConnSource
  unconfirmed?: boolean   // true = Freigabe nicht bestätigt (Direktversuch \\Server\Name)
  error?: string
  tried?: string[]        // Diagnose: welche Server/Quellen wurden probiert
}

/** Bekannte Server in Auflösungs-Reihenfolge, `preferred` zuerst. */
function serversToTry(preferred?: string): string[] {
  const out: string[] = []
  const push = (s?: string) => { const v = (s || '').trim(); if (v && !out.some(x => x.toLowerCase() === v.toLowerCase())) out.push(v) }
  push(preferred)
  for (const s of PRINT_SERVERS) push(s.host)
  return out
}

/** Zerlegt "\\server\share\..." in { server, share }. */
function splitUnc(unc: string): { server: string; share: string } | null {
  const parts = (unc || '').replace(/^\\+/, '').split('\\').filter(Boolean)
  if (parts.length < 2) return null
  return { server: parts[0], share: parts.slice(1).join('\\') }
}

export async function resolvePrinterConnection(printerName: string, preferredServer?: string): Promise<ResolvedConnection> {
  const name = (printerName || '').trim()
  if (!name) return { ok: false, error: 'Kein Druckername angegeben.' }
  const nameLc = name.toLowerCase()
  const tried: string[] = []

  // 1) Scan-Daten: echte \\server\share, die Clients bereits verwenden
  try {
    const data = await loadConnData()
    if (data) {
      const hit = forPrinter(data, name).find(h => splitUnc(h.connection || ''))
      if (hit) {
        const sp = splitUnc(hit.connection)!
        tried.push('Scan-Daten')
        return { ok: true, unc: hit.connection, server: sp.server, share: sp.share, source: 'scan', tried }
      }
    }
  } catch { /* weiter mit Live-Enumerierung */ }

  // 2) Live-Enumerierung über die bekannten Server (bevorzugt zuerst)
  for (const srv of serversToTry(preferredServer)) {
    const list = await listServerPrinters(srv)
    tried.push(`${srv}: ${list.ok ? list.printers.length + ' Freigaben' : 'nicht abrufbar'}`)
    if (!list.ok) continue
    const m = list.printers.find(p => p.name.toLowerCase() === nameLc || (p.shareName || '').toLowerCase() === nameLc)
    if (m) return { ok: true, unc: serverConnection(srv, m), server: srv, share: m.shareName || m.name, source: 'server', tried }
  }

  // 3) AD-veröffentlichte Warteschlange (forestweit)
  const ad = await queryAdPublishedPrinter(name)
  tried.push(`AD: ${ad.ok ? 'Treffer' : (ad.error || 'kein Treffer')}`)
  if (ad.ok && ad.unc) return { ok: true, unc: ad.unc, server: ad.server, share: ad.share, source: 'ad', tried }

  // 4) Best-effort: keine Quelle konnte die echte Freigabe bestätigen (Server remote
  // nicht abfragbar). Trotzdem den Direktversuch \\<Server>\<Name> anbieten — das
  // klappt für alle Drucker, deren Freigabename = Warteschlangenname ist. Der
  // Ziel-PC-Spooler liefert dann eine klare Meldung, falls die Freigabe abweicht.
  const srv = serversToTry(preferredServer)[0]
  if (srv) {
    return { ok: true, unc: `\\\\${srv}\\${name}`, server: srv, share: name, source: 'direct', unconfirmed: true, tried }
  }
  return { ok: false, error: `„${name}" konnte auf keinem bekannten Druckserver als Freigabe gefunden werden.`, tried }
}

/** Sucht eine in AD veröffentlichte Druckerwarteschlange (printQueue) forestweit (Global Catalog). */
export async function queryAdPublishedPrinter(printerName: string): Promise<{ ok: boolean; unc?: string; server?: string; share?: string; error?: string }> {
  const name = (printerName || '').trim()
  if (!name) return { ok: false, error: 'Kein Druckername.' }
  const esc = psq(name)
  const inner = [
    `$gc = (Get-ADRootDSE).dnsHostName + ':3268'`,
    `$f = "(&(objectClass=printQueue)(|(printerName=${esc})(printShareName=${esc})(name=${esc})))"`,
    `$o = Get-ADObject -LDAPFilter $f -Server $gc -Properties serverName,printShareName,uNCName,printerName -EA Stop | Select-Object -First 1`,
    `if ($o) { [ordered]@{ server=[string]$o.serverName; share=[string]$o.printShareName; unc=[string]$o.uNCName } | ConvertTo-Json -Compress }`,
  ].join('; ')
  const res = await psSafe(`try { Import-Module ActiveDirectory -EA SilentlyContinue; ${inner} } catch { Write-Output ('ERR:' + $_.Exception.Message) }`, 40000)
  const out = (res.stdout ?? '').trim()
  if (res.timedOut) return { ok: false, error: 'AD-Zeitüberschreitung' }
  if (!out || out.startsWith('ERR:')) return { ok: false, error: out.replace(/^ERR:/, '') || 'kein Treffer' }
  try {
    const j = JSON.parse(out) as { server?: string; share?: string; unc?: string }
    const server = (j.server || '').replace(/\..*$/, '')   // FQDN → kurzer Name
    const share = j.share || ''
    const unc = (j.unc || '').trim() || (server && share ? `\\\\${server}\\${share}` : '')
    if (!unc) return { ok: false, error: 'AD-Objekt ohne UNC' }
    return { ok: true, unc, server: server || undefined, share: share || undefined }
  } catch { return { ok: false, error: 'AD-Antwort nicht lesbar' } }
}

function sourceLabel(r: ResolvedConnection): string {
  if (r.source === 'scan') return 'laut Scan'
  if (r.source === 'ad') return 'laut AD'
  if (r.source === 'direct') return `Direktversuch auf ${r.server}, Freigabe unbestätigt`
  return r.server ? `von ${r.server}` : 'aufgelöst'
}

/** Verbinden/Standard/Entfernen anhand des Druckernamens — löst zuerst die echte
 *  Freigabe auf (selbstheilend über Scan/bekannte Server/AD). `server` = bevorzugt. */
export async function connectPrinterByName(hostname: string, server: string, printerName: string): Promise<ClientActionResult> {
  const r = await resolvePrinterConnection(printerName, server)
  if (!r.ok || !r.unc) return { ok: false, text: r.error || 'Freigabe nicht auflösbar.' }
  const res = await connectPrinter(hostname, r.unc)
  return res.ok ? { ok: true, text: `Verbunden: ${r.unc} (${sourceLabel(r)})${res.text ? ' — ' + res.text : ''}` } : res
}
export async function setDefaultPrinterByName(hostname: string, server: string, printerName: string): Promise<ClientActionResult> {
  const r = await resolvePrinterConnection(printerName, server)
  if (!r.ok || !r.unc) return { ok: false, text: r.error || 'Freigabe nicht auflösbar.' }
  return setDefaultPrinter(hostname, r.unc)
}
export async function removePrinterConnectionByName(hostname: string, server: string, printerName: string): Promise<ClientActionResult> {
  const r = await resolvePrinterConnection(printerName, server)
  if (!r.ok || !r.unc) return { ok: false, text: r.error || 'Freigabe nicht auflösbar.' }
  return removePrinterConnection(hostname, r.unc)
}

// ── Diagnose: „Druckserver prüfen" ─────────────────────────────────────────────

export interface ServerProbe {
  host: string
  role: string
  reachable: boolean
  method?: string        // welche Enum-Methode griff (PrintServer / WMI (DCOM) / …)
  shareCount?: number
  error?: string
}
export interface PrintServerDiagnosis {
  probes: ServerProbe[]
  scanServers: { server: string; count: number }[]
  resolved?: ResolvedConnection
}

/** Probt einen Server mit allen Methoden und meldet, welche zuerst greift. */
async function probeServer(host: string): Promise<{ reachable: boolean; method?: string; shareCount?: number; error?: string }> {
  const errors: string[] = []
  for (const m of ENUM_METHODS) {
    const r = await m.fn(host)
    if (r.ok) return { reachable: true, method: m.label, shareCount: r.printers.length }
    errors.push(`${m.label}: ${r.error}`)
  }
  return { reachable: false, error: errors.join(' · ') }
}

/** Welche Druckserver nutzen die Clients laut Scan tatsächlich? */
async function scanServerCounts(): Promise<{ server: string; count: number }[]> {
  try {
    const data = await loadConnData()
    if (!data) return []
    const counts = new Map<string, number>()
    for (const c of flatten(data)) {
      const sp = splitUnc(c.connection || '')
      if (sp) counts.set(sp.server.toLowerCase(), (counts.get(sp.server.toLowerCase()) || 0) + 1)
    }
    return [...counts.entries()].map(([server, count]) => ({ server, count })).sort((a, b) => b.count - a.count)
  } catch { return [] }
}

/** Vollständige Druckserver-Diagnose; optional inkl. Auflösung eines konkreten Druckers. */
export async function diagnosePrintServers(printerName?: string): Promise<PrintServerDiagnosis> {
  // Server parallel proben (jeder probiert seine Methoden sequenziell) — sonst
  // summieren sich die Timeouts nicht erreichbarer Server.
  const probes = await Promise.all(PRINT_SERVERS.map(async s => {
    const p = await probeServer(s.host)
    return { host: s.host, role: s.role, ...p } as ServerProbe
  }))
  const scanServers = await scanServerCounts()
  const resolved = printerName && printerName.trim() ? await resolvePrinterConnection(printerName) : undefined
  return { probes, scanServers, resolved }
}
