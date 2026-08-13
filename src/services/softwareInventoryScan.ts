// ── Software-Inventar: Scan-Service (headless-fähig) ──────────────────────────
// Kapselt die Scan-Bausteine des Software-Inventars, damit sie SOWOHL vom Screen
// als auch vom Hintergrund-Controller (SoftwareScanController) OHNE offenen
// Screen genutzt werden können. Zwei Aufgaben:
//   1. Veraltung: Ein erfasster PC gilt nach FRESH_DAYS (30) Tagen als veraltet
//      und wird beim nächsten Scan neu gescannt (Software kann sich geändert
//      haben). isFresh() wird auch im Screen für die Skip-Logik verwendet.
//   2. Auto-Scan alle 72h (runAutoScanOnce) — instanzübergreifend, mit
//      Nachhol-Logik über einen zentralen Zeitplan (scan_schedule.json).
//
// Regeln (project_performance_rules): max 10 parallele WinRM, UI nie blockieren
// (PowerShell läuft im Main-Prozess via IPC), Bulk-Ops in 10er-Batches.

import { api } from '../electronAPI'
import type { PSResult } from '../electronAPI'
import { pathService } from './pathService'
import { buildBulkOnlineCheck, parseOnlineCheckLine } from '../utils/connectivityCheck'

// ── Typen (strukturgleich zum Screen) ─────────────────────────────────────────
export interface SoftwareEntry { DisplayName: string; DisplayVersion: string; Publisher: string }
export interface PCResult {
  hostname: string
  software: SoftwareEntry[]
  error?: string
  scannedAt?: string      // ISO
  method?: number         // 1=WinRM, 2=Registry, 3=PsExec
  offline?: boolean
}
export interface PersistentScanData { lastUpdated: string; scannedPCs: PCResult[] }

export const SCAN_DATA_PATH = 'software_inventar/scan_data.json'

// ── Veraltung ─────────────────────────────────────────────────────────────────
export const FRESH_DAYS = 30

/** true, wenn der Scan jünger als FRESH_DAYS ist (sonst neu scannen). */
export function isFresh(scannedAt?: string): boolean {
  if (!scannedAt) return false
  const t = new Date(scannedAt).getTime()
  if (isNaN(t)) return false
  return (Date.now() - t) < FRESH_DAYS * 86400000
}

// ── Persistenz ────────────────────────────────────────────────────────────────
export async function loadPersistent(): Promise<PersistentScanData | null> {
  try {
    const d = await api().netReadJson<PersistentScanData>(SCAN_DATA_PATH)
    if (d && Array.isArray(d.scannedPCs)) return d
  } catch { /* offline */ }
  return null
}
export async function savePersistent(data: PersistentScanData): Promise<boolean> {
  try { return await api().netWriteJson(SCAN_DATA_PATH, data) } catch { return false }
}

// ── PS-Bausteine (identisch zum Screen; hier für den headless-Scan) ───────────
const SW_PS_LOCAL = `$paths=@('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); Get-ItemProperty $paths -EA SilentlyContinue | Where-Object {$_.DisplayName} | Select-Object DisplayName,DisplayVersion,Publisher | Group-Object DisplayName | ForEach-Object { $_.Group | Sort-Object DisplayVersion -Descending | Select-Object -First 1 } | Sort-Object DisplayName | ConvertTo-Json -Compress`

function buildWinRMCmd(hostname: string): string {
  const h = hostname.replace(/'/g, "''")
  return [
    '$winrm = $false',
    "try { Test-WSMan -ComputerName '" + h + "' -EA Stop | Out-Null; $winrm = $true } catch {}",
    'if (-not $winrm) {',
    '  try {',
    "    $svc = Get-Service -ComputerName '" + h + "' -Name WinRM -EA Stop",
    "    if ($svc.StartType -eq 'Disabled') { Set-Service -ComputerName '" + h + "' -Name WinRM -StartupType Manual -EA Stop }",
    '    $svc.Start()',
    '    $svc.WaitForStatus("Running", [TimeSpan]::FromSeconds(10))',
    '    $winrm = $true',
    '  } catch {}',
    '  if (-not $winrm) {',
    '    try {',
    "      $sc = [System.ServiceProcess.ServiceController]::new('WinRM', '" + h + "')",
    '      $sc.Start()',
    '      $sc.WaitForStatus("Running", [TimeSpan]::FromSeconds(10))',
    '      $sc.Close()',
    '      $winrm = $true',
    '    } catch {}',
    '  }',
    '  if (-not $winrm) {',
    '    try {',
    '      sc.exe "\\\\' + h + '" start WinRM 2>&1 | Out-Null',
    '      Start-Sleep 3',
    "      $chk = Get-Service -ComputerName '" + h + "' -Name WinRM -EA SilentlyContinue",
    "      if ($chk -and $chk.Status -eq 'Running') { $winrm = $true }",
    '    } catch {}',
    '  }',
    '}',
    'if ($winrm) {',
    "  try { $r = Invoke-Command -ComputerName '" + h + "' -ScriptBlock { " + SW_PS_LOCAL + " } -EA Stop; if ($r -ne $null) { $r } else { Write-Output '[]' } }",
    '  catch { Write-Output ("ERR:" + $_.Exception.Message) }',
    '} else { Write-Output "ERR:WinRM nicht aktivierbar" }',
  ].join('\n')
}

function buildRegistryCmd(hostname: string): string {
  const h = hostname.replace(/'/g, "''")
  return [
    `$h = '${h}'`,
    `try { sc.exe "\\\\$h" start RemoteRegistry 2>&1 | Out-Null; Start-Sleep -Milliseconds 1500 } catch {}`,
    `try {`,
    `  $hive = [Microsoft.Win32.RegistryKey]::OpenRemoteBaseKey('LocalMachine', $h)`,
    `  $sw = @()`,
    `  foreach ($p in @('SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall','SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall')) {`,
    `    $key = $hive.OpenSubKey($p)`,
    `    if (-not $key) { continue }`,
    `    foreach ($sn in $key.GetSubKeyNames()) {`,
    `      try {`,
    `        $sub = $key.OpenSubKey($sn)`,
    `        $dn = $sub.GetValue('DisplayName')`,
    `        if ($dn) { $sw += [PSCustomObject]@{DisplayName=[string]$dn;DisplayVersion=[string]$sub.GetValue('DisplayVersion');Publisher=[string]$sub.GetValue('Publisher')} }`,
    `      } catch {}`,
    `    }`,
    `  }`,
    `  $hive.Close()`,
    `  if ($sw.Count -gt 0) {`,
    `    $sw | Group-Object DisplayName | ForEach-Object { $_.Group | Sort-Object DisplayVersion -Descending | Select-Object -First 1 } | Sort-Object DisplayName | ConvertTo-Json -Compress`,
    `  } else { Write-Output 'ERR:Registry leer' }`,
    `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
  ].join('\n')
}

function buildPsExecCmd(hostname: string): string {
  const h = hostname.replace(/'/g, "''")
  const dir = pathService.getToolsDir().replace(/'/g, "''")
  return [
    `$dir = '${dir}'`,
    `$psExe = if (Test-Path "$dir\\PsExec64.exe") { "$dir\\PsExec64.exe" } elseif (Test-Path "$dir\\PsExec.exe") { "$dir\\PsExec.exe" } else { $null }`,
    `if (-not $psExe) { Write-Output 'ERR:PsExec nicht gefunden'; exit }`,
    `$scriptContent = '${SW_PS_LOCAL.replace(/'/g, "''")}'`,
    `$tempScript = "\\\\${h}\\C$\\Temp\\it_sw_scan.ps1"`,
    `try { Set-Content -Path $tempScript -Value $scriptContent -Force -EA Stop } catch { Write-Output "ERR:Admin-Share nicht erreichbar"; exit }`,
    `try {`,
    `  $r = & $psExe "\\\\${h}" -s -accepteula powershell.exe -ExecutionPolicy Bypass -File "C:\\Temp\\it_sw_scan.ps1" 2>&1`,
    `  $json = ($r | Where-Object { $_ -is [string] -and $_.Trim() -match '^[\\[{]' }) -join ''`,
    `  if ($json) { Write-Output $json } else { Write-Output 'ERR:PsExec keine Daten' }`,
    `} catch { Write-Output "ERR:$($_.Exception.Message)" }`,
    `try { Remove-Item $tempScript -Force -EA SilentlyContinue } catch {}`,
  ].join('\n')
}

function parseSoftwareJson(result: PSResult): SoftwareEntry[] {
  const out = result.stdout?.trim() ?? ''
  if (!out || out.startsWith('ERR:') || out === '[]') return []
  try {
    const cleaned = out
      .replace(/PSComputerName\s*:.*/g, '')
      .replace(/RunspaceId\s*:.*/g, '')
      .replace(/PSShowComputerName\s*:.*/g, '')
      .trim()
    if (!cleaned) return []
    const parsed = JSON.parse(cleaned)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr
      .filter((e: Record<string, unknown>) => e.DisplayName)
      .map((e: Record<string, unknown>) => ({
        DisplayName: String(e.DisplayName ?? ''),
        DisplayVersion: String(e.DisplayVersion ?? ''),
        Publisher: String(e.Publisher ?? ''),
      }))
  } catch { return [] }
}

async function loadInventoryHostnames(): Promise<string[]> {
  try {
    const data = await api().netReadJson<{ name: string; category: string }[]>('inventory/inventory.json')
    if (!Array.isArray(data)) return []
    return data.filter(i => i.category === 'Computer' && i.name).map(i => i.name)
  } catch { return [] }
}

/** Batch-Runner: sequenzielle Blöcke à batchSize, Promise.all je Block.
 *  onHeartbeat wird nach jedem Block aufgerufen (hält den Cross-Instanz-Claim frisch). */
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

// ── Headless Auto-Scan ────────────────────────────────────────────────────────

export interface AutoScanResult {
  ok: boolean
  reason?: string
  candidates: number   // zu scannende PCs (nicht frisch)
  online: number
  updated: number      // erfolgreich erfasste PCs
}

/**
 * Führt EINEN vollständigen Hintergrund-Scan aus: alle Inventar-PCs, die nicht
 * (mehr) frisch erfasst sind, werden per WinRM → Registry → PsExec gescannt.
 * Ergebnisse werden in scan_data.json ge-upsertet. Respektiert die 10er-Batch-
 * Regel und blockiert die UI nicht (PowerShell läuft im Main-Prozess).
 */
export async function runAutoScanOnce(onProgress?: (done: number, total: number) => void, onHeartbeat?: () => void | Promise<void>): Promise<AutoScanResult> {
  const hosts = await loadInventoryHostnames()
  if (hosts.length === 0) return { ok: false, reason: 'Keine Computer im Inventar (inventory.json).', candidates: 0, online: 0, updated: 0 }

  // WICHTIG (Datenschutz gegen Datenverlust): loadPersistent() liefert bei einer
  // BESCHÄDIGTEN oder unlesbaren scan_data.json ebenfalls null (netReadJson fängt
  // Fehler ab). Würden wir dann mit leerem Stand weitermachen und speichern,
  // gingen alle bisher erfassten (v. a. offline/unerreichbaren) PCs verloren.
  // Daher: existiert die Datei, ließ sich aber NICHT laden → Lauf abbrechen.
  const persistent0 = await loadPersistent()
  if (!persistent0) {
    let exists = false
    try { exists = await api().netExists(SCAN_DATA_PATH) } catch { /* Netzlaufwerk weg */ }
    if (exists) return { ok: false, reason: 'scan_data.json vorhanden, aber nicht lesbar (evtl. beschädigt) — Lauf abgebrochen, um Datenverlust zu vermeiden.', candidates: 0, online: 0, updated: 0 }
  }
  const persistent = persistent0 ?? { lastUpdated: '', scannedPCs: [] }

  const norm = (h: string) => h.trim().toUpperCase()   // konsistente Schlüssel (getrimmt)
  const fresh = new Set(persistent.scannedPCs.filter(p => isFresh(p.scannedAt)).map(p => norm(p.hostname)))
  const toScan = hosts.filter(h => !fresh.has(norm(h)))
  if (toScan.length === 0) return { ok: true, candidates: 0, online: 0, updated: 0 }

  const now = new Date().toISOString()
  const results = new Map<string, PCResult>()
  // runPowerShell darf den ganzen Lauf nie zum Werfen bringen (sonst Retry-Storm
  // im Controller) — einzelne Fehlschläge werden zu leerem Ergebnis.
  const psSafe = (cmd: string, t: number): Promise<PSResult> =>
    api().runPowerShell(cmd, t).catch(() => ({ stdout: '', stderr: '', exitCode: -1, timedOut: true } as PSResult))

  // Phase 1: Online-Check (Ping→SMB→RPC), Batches à 40
  const onlineHosts: string[] = []
  for (let i = 0; i < toScan.length; i += 40) {
    const chunk = toScan.slice(i, i + 40)
    const res = await psSafe(buildBulkOnlineCheck(chunk), 120000)
    const lines = (res.stdout ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const onlineSet = new Set<string>()
    for (const l of lines) { const p = parseOnlineCheckLine(l); if (p && p.online) onlineSet.add(norm(p.hostname)) }
    for (const h of chunk) {
      if (onlineSet.has(norm(h))) onlineHosts.push(h)
      else results.set(norm(h), { hostname: h, software: [], offline: true, scannedAt: now })
    }
    await onHeartbeat?.()
  }

  let done = 0
  const progress = () => { done++; onProgress?.(done, onlineHosts.length) }

  // Phase 2: WinRM (Batch 10)
  await onHeartbeat?.()
  const winrmFailed: string[] = []
  const winrmRes = await runBatch(onlineHosts, 10, h => psSafe(buildWinRMCmd(h), 35000), onHeartbeat)
  for (const h of onlineHosts) {
    const sw = parseSoftwareJson(winrmRes.get(h)!)
    if (sw.length > 0) results.set(norm(h), { hostname: h, software: sw, method: 1, scannedAt: now })
    else winrmFailed.push(h)
    progress()
  }

  // Phase 3: Remote-Registry (Batch 5) für WinRM-Fehler
  const regFailed: string[] = []
  if (winrmFailed.length > 0) {
    const regRes = await runBatch(winrmFailed, 5, h => psSafe(buildRegistryCmd(h), 30000), onHeartbeat)
    for (const h of winrmFailed) {
      const sw = parseSoftwareJson(regRes.get(h)!)
      if (sw.length > 0) results.set(norm(h), { hostname: h, software: sw, method: 2, scannedAt: now })
      else regFailed.push(h)
    }
  }

  // Phase 4: PsExec (Batch 3) für Registry-Fehler
  if (regFailed.length > 0) {
    const pxRes = await runBatch(regFailed, 3, h => psSafe(buildPsExecCmd(h), 60000), onHeartbeat)
    for (const h of regFailed) {
      const sw = parseSoftwareJson(pxRes.get(h)!)
      if (sw.length > 0) results.set(norm(h), { hostname: h, software: sw, method: 3, scannedAt: now })
      else results.set(norm(h), { hostname: h, software: [], error: 'Alle Methoden fehlgeschlagen', scannedAt: now })
    }
  }

  // Persistieren: erfolgreiche (software>0) upserten; nicht mehr im Inventar
  // befindliche PCs entfernen (Reconciliation wie der Screen). Direkt vor dem
  // Schreiben noch einmal FRISCH laden und darauf mergen, damit parallele
  // Schreibvorgänge (Screen/andere Instanz) nicht überschrieben werden.
  const latest = (await loadPersistent()) ?? persistent
  const inventoryUpper = new Set(hosts.map(norm))
  const successful = [...results.values()].filter(r => r.software.length > 0)
  const merged = new Map<string, PCResult>()
  for (const p of latest.scannedPCs) {
    if (inventoryUpper.has(norm(p.hostname))) merged.set(norm(p.hostname), p)
  }
  for (const r of successful) merged.set(norm(r.hostname), r)
  await savePersistent({ lastUpdated: now, scannedPCs: [...merged.values()] })

  return { ok: true, candidates: toScan.length, online: onlineHosts.length, updated: successful.length }
}

// ── Zeitplan (72h, instanzübergreifend, Nachhol-Logik) ────────────────────────
export const SCHEDULE_PATH = 'software_inventar/scan_schedule.json'
export const INTERVAL_HOURS = 72
const STALE_LOCK_MS = 2 * 60 * 60 * 1000   // laufender Scan älter als 2h = abgestürzt → übernehmbar

export interface SwScanSchedule {
  lastRunAt: string | null
  lastResult?: 'success' | 'error'
  lastSummary?: string
  running?: { by: string; at: string }
}

export async function loadSchedule(): Promise<SwScanSchedule> {
  try {
    const s = await api().netReadJson<SwScanSchedule>(SCHEDULE_PATH)
    if (s && typeof s === 'object') return { lastRunAt: s.lastRunAt ?? null, lastResult: s.lastResult, lastSummary: s.lastSummary, running: s.running }
  } catch { /* noch keine */ }
  return { lastRunAt: null }
}
export async function saveSchedule(s: SwScanSchedule): Promise<boolean> {
  try { return await api().netWriteJson(SCHEDULE_PATH, s) } catch { return false }
}

/** Fällig, wenn noch nie gelaufen oder >= INTERVAL_HOURS her (Nachhol-Logik). */
export function isScanDue(s: SwScanSchedule, now = Date.now()): boolean {
  if (!s.lastRunAt) return true
  const t = new Date(s.lastRunAt).getTime()
  if (isNaN(t)) return true
  return (now - t) >= INTERVAL_HOURS * 3600000
}

/** true, wenn gerade eine andere Instanz scannt (und der Claim nicht veraltet ist). */
export function isClaimed(s: SwScanSchedule, now = Date.now()): boolean {
  if (!s.running) return false
  const t = new Date(s.running.at).getTime()
  if (isNaN(t)) return false
  return (now - t) < STALE_LOCK_MS
}
