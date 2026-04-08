import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Plus, X, Play, Download, Monitor, List, Loader,
  CheckCircle, XCircle, AlertTriangle, Package, Info,
  Database, Trash2, RefreshCw, Clock, Zap, Layers, HelpCircle,
} from 'lucide-react'
import ExcelJS from 'exceljs'
import { api } from '../electronAPI'
import type { PSResult } from '../electronAPI'
import { useIsMasterAdmin } from '../store/authStore'
import WinRMHelpModal from '../components/WinRMHelpModal'

// ── Types ────────────────────────────────────────────────────────────────────

interface SoftwareEntry {
  DisplayName: string
  DisplayVersion: string
  Publisher: string
}

interface PCResult {
  hostname: string
  software: SoftwareEntry[]
  error?: string
  scannedAt?: string     // ISO timestamp
  method?: number        // 1=WinRM, 2=Registry, 3=PsExec
  offline?: boolean      // true = ping failed
}

interface ScanState {
  phase: 'idle' | 'scanning' | 'done'
  total: number
  done: number
  current: string
  results: PCResult[]
}

/** Persistent data saved on network */
interface PersistentScanData {
  lastUpdated: string
  scannedPCs: PCResult[]  // Only successful scans (software.length > 0)
}

const SCAN_DATA_PATH = 'software_inventar/scan_data.json'

// ── Helpers ──────────────────────────────────────────────────────────────────

const SW_PS_LOCAL = `$paths=@('HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*'); Get-ItemProperty $paths -EA SilentlyContinue | Where-Object {$_.DisplayName} | Select-Object DisplayName,DisplayVersion,Publisher | Group-Object DisplayName | ForEach-Object { $_.Group | Sort-Object DisplayVersion -Descending | Select-Object -First 1 } | Sort-Object DisplayName | ConvertTo-Json -Compress`

const PSEXEC_DIR = '\\\\w3172\\skf marine\\700 Application\\711 IT Allgemein\\SW_INSTA\\Tool IT\\tools'

// ── Per-method simple commands (each is a standalone PS script) ──────────────

/** Bulk ping up to 50 hostnames in a single PS call — returns "HOST:OK" or "HOST:OFFLINE" per line */
function buildBulkPingCmd(hostnames: string[]): string {
  const list = hostnames.map(h => "'" + h.replace(/'/g, "''") + "'").join(',')
  return '@(' + list + ') | ForEach-Object -Parallel { if (Test-Connection $_ -Count 1 -Quiet -TimeoutSeconds 2 -EA SilentlyContinue) { ($_ + ":OK") } else { ($_ + ":OFFLINE") } } -ThrottleLimit 30'
}

/** Fallback ping for PS 5.1 (no -Parallel) */
function buildBulkPingCmdV5(hostnames: string[]): string {
  const list = hostnames.map(h => "'" + h.replace(/'/g, "''") + "'").join(',')
  return [
    '$pinger = New-Object System.Net.NetworkInformation.Ping',
    'foreach ($h in @(' + list + ')) {',
    '  try { $r = $pinger.Send($h, 1500); if ($r.Status -eq "Success") { Write-Output ($h + ":OK") } else { Write-Output ($h + ":OFFLINE") } }',
    '  catch { Write-Output ($h + ":OFFLINE") }',
    '}',
  ].join('\n')
}

/** WinRM scan: check WinRM, auto-activate if needed (3 methods like RemoteDoc), then query software */
function buildWinRMCmd(hostname: string): string {
  const h = hostname.replace(/'/g, "''")
  return [
    // Step 1: Check if WinRM is already running
    '$winrm = $false',
    "try { Test-WSMan -ComputerName '" + h + "' -EA Stop | Out-Null; $winrm = $true } catch {}",
    // Step 2: If not running, try to activate (same 3 methods as RemoteDoc)
    'if (-not $winrm) {',
    // Method 1: Get-Service remote start
    '  try {',
    "    $svc = Get-Service -ComputerName '" + h + "' -Name WinRM -EA Stop",
    "    if ($svc.StartType -eq 'Disabled') { Set-Service -ComputerName '" + h + "' -Name WinRM -StartupType Manual -EA Stop }",
    '    $svc.Start()',
    '    $svc.WaitForStatus("Running", [TimeSpan]::FromSeconds(10))',
    '    $winrm = $true',
    '  } catch {}',
    // Method 2: ServiceController .NET
    '  if (-not $winrm) {',
    '    try {',
    "      $sc = [System.ServiceProcess.ServiceController]::new('WinRM', '" + h + "')",
    '      $sc.Start()',
    '      $sc.WaitForStatus("Running", [TimeSpan]::FromSeconds(10))',
    '      $sc.Close()',
    '      $winrm = $true',
    '    } catch {}',
    '  }',
    // Method 3: sc.exe over SMB
    '  if (-not $winrm) {',
    '    try {',
    '      sc.exe "\\\\' + h + '" start WinRM 2>&1 | Out-Null',
    '      Start-Sleep 3',
    "      $chk = Get-Service -ComputerName '" + h + "' -Name WinRM -EA SilentlyContinue",
    "      if ($chk -and $chk.Status -eq 'Running') { $winrm = $true }",
    '    } catch {}',
    '  }',
    '}',
    // Step 3: If WinRM is now running, query software
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
  const dir = PSEXEC_DIR.replace(/'/g, "''")
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
    // Strip PS remoting metadata
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
  } catch {
    return []
  }
}

function normalizeName(name: string): string {
  return name
    .replace(/\s*\(x64\)\s*/gi, '')
    .replace(/\s*\(x86\)\s*/gi, '')
    .replace(/\s*\(64-bit\)\s*/gi, '')
    .replace(/\s*\(32-bit\)\s*/gi, '')
    .replace(/\s*- x64\s*$/gi, '')
    .replace(/\s*x64\s*$/gi, '')
    .replace(/\s+v?\d+\.\d+\.\d+.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-_]/).map(Number)
  const pb = b.split(/[.\-_]/).map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na !== nb) return na - nb
  }
  return 0
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return iso }
}

// ── Inventory loader ─────────────────────────────────────────────────────────

interface InventoryItem { name: string; category: string }

async function loadInventoryHostnames(): Promise<string[]> {
  try {
    const data = await api().netReadJson<InventoryItem[]>('inventory/inventory.json')
    if (!data) return []
    return data.filter(i => i.category === 'Computer' && i.name).map(i => i.name)
  } catch { return [] }
}

// ══════════════════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════════════════

export default function SoftwareInventory() {
  const isMaster = useIsMasterAdmin()

  // ── Host list ──────────────────────────────────────────────────────────────
  const [source, setSource] = useState<'manual' | 'inventory'>('manual')
  const [hosts, setHosts] = useState<string[]>([''])
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryCount, setInventoryCount] = useState<number | null>(null)

  // ── Persistent data from server ────────────────────────────────────────────
  const [persistent, setPersistent] = useState<PersistentScanData | null>(null)
  const [persistLoading, setPersistLoading] = useState(true)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // ── Scan mode & state ──────────────────────────────────────────────────────
  const [scanMode, setScanMode] = useState<'fast' | 'full'>('fast')
  const [scan, setScan] = useState<ScanState>({ phase: 'idle', total: 0, done: 0, current: '', results: [] })
  const cancelRef = useRef(false)
  const [skippedCount, setSkippedCount] = useState(0)
  const [winrmFailedList, setWinrmFailedList] = useState<string[]>([])  // PCs where WinRM failed in fast mode
  const [retrying, setRetrying] = useState(false)
  const [showWinrmHelp, setShowWinrmHelp] = useState(false)

  // ── Load persistent data on mount ──────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      setPersistLoading(true)
      try {
        const data = await api().netReadJson<PersistentScanData>(SCAN_DATA_PATH)
        if (data && Array.isArray(data.scannedPCs)) {
          setPersistent(data)
        }
      } catch { /* offline */ }
      setPersistLoading(false)
    })()
  }, [])

  const scannedHostnames = new Set((persistent?.scannedPCs ?? []).map(p => p.hostname.toUpperCase()))

  // ── Save persistent data to server ─────────────────────────────────────────
  const savePersistent = useCallback(async (data: PersistentScanData) => {
    setPersistent(data)
    try { await api().netWriteJson(SCAN_DATA_PATH, data) } catch { /* offline */ }
  }, [])

  // ── Load from inventory ────────────────────────────────────────────────────
  const loadFromInventory = useCallback(async () => {
    setInventoryLoading(true)
    const names = await loadInventoryHostnames()
    setHosts(names.length > 0 ? names : [''])
    setInventoryCount(names.length)
    setInventoryLoading(false)
    setSource('inventory')
  }, [])

  // ── Helper: run batched PS commands ─────────────────────────────────────────
  async function runBatch<T>(items: string[], batchSize: number, fn: (item: string) => Promise<T>, onProgress?: (done: number, current: string) => void): Promise<Map<string, T>> {
    const results = new Map<string, T>()
    for (let i = 0; i < items.length; i += batchSize) {
      if (cancelRef.current) break
      const batch = items.slice(i, i + batchSize)
      if (onProgress) onProgress(i, batch[0])
      const batchResults = await Promise.all(batch.map(async item => ({ item, result: await fn(item) })))
      for (const { item, result } of batchResults) results.set(item, result)
    }
    return results
  }

  // ── Bulk Ping helper ────────────────────────────────────────────────────────
  async function bulkPing(toScan: string[], allResults: PCResult[], now: string): Promise<string[]> {
    const onlinePCs: string[] = []
    const PING_BATCH = 50
    for (let i = 0; i < toScan.length; i += PING_BATCH) {
      if (cancelRef.current) break
      const batch = toScan.slice(i, i + PING_BATCH)
      setScan(prev => ({ ...prev, done: i, current: `Ping ${i + 1}-${Math.min(i + PING_BATCH, toScan.length)} von ${toScan.length}...` }))
      try {
        const res = await api().runPowerShell(buildBulkPingCmdV5(batch), 90000)
        const lines = (res.stdout ?? '').split('\n').map(l => l.trim()).filter(Boolean)
        for (const line of lines) {
          const sep = line.lastIndexOf(':')
          if (sep < 0) continue
          const host = line.slice(0, sep)
          const status = line.slice(sep + 1)
          if (status === 'OK') onlinePCs.push(host)
          else allResults.push({ hostname: host, software: [], error: 'Offline (Ping fehlgeschlagen)', scannedAt: now, offline: true })
        }
        const responded = new Set(lines.map(l => l.slice(0, l.lastIndexOf(':')).toUpperCase()))
        for (const h of batch) {
          if (!responded.has(h.toUpperCase())) allResults.push({ hostname: h, software: [], error: 'Offline (Ping timeout)', scannedAt: now, offline: true })
        }
      } catch { onlinePCs.push(...batch) }
    }
    return onlinePCs
  }

  // ── Full scan (Registry + PsExec fallbacks) for a list of hostnames ────────
  async function runFullFallback(hostnames: string[], allResults: PCResult[], now: string) {
    // Registry (batches of 5)
    setScan(prev => ({ ...prev, current: `Remote Registry für ${hostnames.length} PCs...` }))
    const regFailed: string[] = []
    let regDone = 0
    const regResults = await runBatch(hostnames, 5, async (hostname) => {
      try { return parseSoftwareJson(await api().runPowerShell(buildRegistryCmd(hostname), 30000)) } catch { return [] as SoftwareEntry[] }
    }, (_d, c) => { setScan(prev => ({ ...prev, current: `Registry ${++regDone}/${hostnames.length}: ${c}` })) })
    for (const [hostname, sw] of regResults) {
      if (sw.length > 0) allResults.push({ hostname, software: sw, scannedAt: now, method: 2 })
      else regFailed.push(hostname)
    }
    if (cancelRef.current || regFailed.length === 0) return

    // PsExec (batches of 3)
    setScan(prev => ({ ...prev, current: `PsExec für ${regFailed.length} PCs...` }))
    let pseDone = 0
    const pseResults = await runBatch(regFailed, 3, async (hostname) => {
      try { return parseSoftwareJson(await api().runPowerShell(buildPsExecCmd(hostname), 60000)) } catch { return [] as SoftwareEntry[] }
    }, (_d, c) => { setScan(prev => ({ ...prev, current: `PsExec ${++pseDone}/${regFailed.length}: ${c}` })) })
    for (const [hostname, sw] of pseResults) {
      if (sw.length > 0) allResults.push({ hostname, software: sw, scannedAt: now, method: 3 })
      else allResults.push({ hostname, software: [], error: 'Alle Methoden fehlgeschlagen (WinRM, Remote Registry, PsExec)', scannedAt: now })
    }
  }

  // ── Main scan ─────────────────────────────────────────────────────────────
  const startScan = useCallback(async () => {
    const allHostList = hosts.filter(h => h.trim())
    if (allHostList.length === 0) return

    const toScan = allHostList.filter(h => !scannedHostnames.has(h.trim().toUpperCase()))
    const skipped = allHostList.length - toScan.length
    setSkippedCount(skipped)
    setWinrmFailedList([])

    if (toScan.length === 0) {
      setScan({ phase: 'done', total: 0, done: 0, current: '', results: [] })
      return
    }

    cancelRef.current = false
    const now = new Date().toISOString()
    const allResults: PCResult[] = []
    const isFast = scanMode === 'fast'

    setScan({ phase: 'scanning', total: toScan.length, done: 0, current: `Pinge ${toScan.length} PCs...`, results: [] })

    // ── PHASE 1: Bulk Ping ──
    const onlinePCs = await bulkPing(toScan, allResults, now)
    setScan(prev => ({ ...prev, done: toScan.length, current: `${onlinePCs.length} online — starte ${isFast ? 'Schnell' : 'Komplett'}-Scan...` }))

    if (cancelRef.current || onlinePCs.length === 0) {
      await finishScan(allResults, now)
      return
    }

    // ── PHASE 2: WinRM ──
    const winrmFailed: string[] = []
    let winrmDone = 0
    const batchSize = isFast ? 10 : 5
    const timeout = isFast ? 25000 : 35000  // WinRM activation can take ~10s
    const winrmResults = await runBatch(onlinePCs, batchSize, async (hostname) => {
      try { return parseSoftwareJson(await api().runPowerShell(buildWinRMCmd(hostname), timeout)) } catch { return [] as SoftwareEntry[] }
    }, (_d, c) => { setScan(prev => ({ ...prev, current: `${isFast ? 'Schnell' : 'WinRM'} ${++winrmDone}/${onlinePCs.length}: ${c}` })) })

    for (const [hostname, sw] of winrmResults) {
      if (sw.length > 0) allResults.push({ hostname, software: sw, scannedAt: now, method: 1 })
      else winrmFailed.push(hostname)
    }

    if (isFast) {
      // Fast mode: stop here, save WinRM failures for "retry with full scan" button
      for (const h of winrmFailed) {
        allResults.push({ hostname: h, software: [], error: 'WinRM nicht verfügbar', scannedAt: now })
      }
      setWinrmFailedList(winrmFailed)
      await finishScan(allResults, now)
      return
    }

    // ── Full mode: PHASE 3+4 — Registry + PsExec ──
    if (!cancelRef.current && winrmFailed.length > 0) {
      await runFullFallback(winrmFailed, allResults, now)
    }

    await finishScan(allResults, now)
  }, [hosts, scannedHostnames, persistent, savePersistent, scanMode])

  // ── Retry WinRM failures with full scan ────────────────────────────────────
  const retryWithFullScan = useCallback(async () => {
    if (winrmFailedList.length === 0) return
    setRetrying(true)
    cancelRef.current = false
    const now = new Date().toISOString()
    const retryResults: PCResult[] = []

    setScan(prev => ({ ...prev, phase: 'scanning', total: winrmFailedList.length, done: 0, current: `Komplett-Scan für ${winrmFailedList.length} PCs...` }))

    // WinRM already failed for these — go straight to Registry + PsExec
    await runFullFallback(winrmFailedList, retryResults, now)

    // Merge retry results into existing scan results
    const existingResults = scan.results.filter(r => !winrmFailedList.some(h => h.toUpperCase() === r.hostname.toUpperCase()))
    const merged = [...existingResults, ...retryResults]

    // Update winrmFailedList: remove those that succeeded
    const stillFailed = winrmFailedList.filter(h => !retryResults.some(r => r.hostname.toUpperCase() === h.toUpperCase() && r.software.length > 0))
    setWinrmFailedList(stillFailed)

    // Merge with persistent
    const newSuccessful = retryResults.filter(r => r.software.length > 0)
    const existingPCs = persistent?.scannedPCs ?? []
    const mergedPCs = [...existingPCs]
    for (const r of newSuccessful) {
      const idx = mergedPCs.findIndex(p => p.hostname.toUpperCase() === r.hostname.toUpperCase())
      if (idx >= 0) mergedPCs[idx] = r
      else mergedPCs.push(r)
    }
    await savePersistent({ lastUpdated: now, scannedPCs: mergedPCs })
    setScan(prev => ({ ...prev, phase: 'done', results: merged }))
    setRetrying(false)
  }, [winrmFailedList, scan.results, persistent, savePersistent])

  // ── Finish scan: merge & save ─────────────────────────────────────────────
  const finishScan = useCallback(async (allResults: PCResult[], now: string) => {
    const newSuccessful = allResults.filter(r => r.software.length > 0)
    const existingPCs = persistent?.scannedPCs ?? []
    const mergedPCs = [...existingPCs]
    for (const r of newSuccessful) {
      const idx = mergedPCs.findIndex(p => p.hostname.toUpperCase() === r.hostname.toUpperCase())
      if (idx >= 0) mergedPCs[idx] = r
      else mergedPCs.push(r)
    }
    const newPersistent: PersistentScanData = { lastUpdated: now, scannedPCs: mergedPCs }
    await savePersistent(newPersistent)
    setScan(prev => ({ ...prev, phase: 'done', results: allResults }))
  }, [persistent, savePersistent])

  // ── Reset (Master Admin only) ─────────────────────────────────────────────
  const resetData = useCallback(async () => {
    await savePersistent({ lastUpdated: new Date().toISOString(), scannedPCs: [] })
    setShowResetConfirm(false)
    setScan({ phase: 'idle', total: 0, done: 0, current: '', results: [] })
    setSkippedCount(0)
  }, [savePersistent])

  // ── Combine results for analysis: persistent + new scan ────────────────────
  const allPCResults = persistent?.scannedPCs ?? []
  const successResults = allPCResults.filter(r => r.software.length > 0)
  const newFailedResults = scan.results.filter(r => r.error || r.software.length === 0)
  const offlineResults = newFailedResults.filter(r => r.offline)
  const winrmOnlyFailed = newFailedResults.filter(r => !r.offline && r.error === 'WinRM nicht verfügbar')
  const unreachableResults = newFailedResults.filter(r => !r.offline && r.error !== 'WinRM nicht verfügbar')

  // Build aggregated data from ALL persistent results
  const swMap = new Map<string, { name: string; versions: Map<string, string[]>; publisher: string }>()
  for (const pc of successResults) {
    for (const sw of pc.software) {
      const key = normalizeName(sw.DisplayName)
      if (!swMap.has(key)) {
        swMap.set(key, { name: sw.DisplayName, versions: new Map(), publisher: sw.Publisher || '' })
      }
      const entry = swMap.get(key)!
      if (!entry.name || sw.DisplayName.length > entry.name.length) entry.name = sw.DisplayName
      if (sw.Publisher && !entry.publisher) entry.publisher = sw.Publisher
      const ver = sw.DisplayVersion || '(unbekannt)'
      if (!entry.versions.has(ver)) entry.versions.set(ver, [])
      if (!entry.versions.get(ver)!.includes(pc.hostname)) entry.versions.get(ver)!.push(pc.hostname)
    }
  }

  const swList = [...swMap.values()]
    .map(e => {
      const totalInstalls = [...e.versions.values()].reduce((s, pcs) => s + pcs.length, 0)
      const versionsSorted = [...e.versions.keys()].sort((a, b) => compareVersions(b, a))
      const newest = versionsSorted[0] || ''
      const oldest = versionsSorted[versionsSorted.length - 1] || ''
      const mostCommon = [...e.versions.entries()].sort((a, b) => b[1].length - a[1].length)[0]?.[0] || ''
      return { name: e.name, publisher: e.publisher, totalInstalls, versionCount: e.versions.size, newest, oldest, mostCommon, versions: e.versions }
    })
    .sort((a, b) => b.totalInstalls - a.totalInstalls)

  // ── Excel Export ───────────────────────────────────────────────────────────
  const exportExcel = useCallback(async () => {
    const now = new Date()
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
    const defaultName = `Software_Inventar_${ts}.xlsx`

    const savePath = await api().saveFileDialog(defaultName, [{ name: 'Excel', extensions: ['xlsx'] }])
    if (!savePath) return

    const wb = new ExcelJS.Workbook()
    wb.creator = 'IT Admin Tool'
    wb.created = now

    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } },
      alignment: { vertical: 'middle' },
    }

    const ws1 = wb.addWorksheet('Übersicht')
    ws1.addRow(['Software-Name', 'Publisher', 'Anzahl Installationen', 'Verschiedene Versionen', 'Häufigste Version', 'Älteste Version'])
    ws1.getRow(1).eachCell(c => { Object.assign(c, { style: headerStyle }) })
    for (const sw of swList) {
      const row = ws1.addRow([sw.name, sw.publisher, sw.totalInstalls, sw.versionCount, sw.mostCommon, sw.oldest])
      if (sw.versionCount > 1) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } } })
    }
    ws1.columns = [{ width: 45 }, { width: 30 }, { width: 20 }, { width: 22 }, { width: 20 }, { width: 20 }]

    const ws2 = wb.addWorksheet('Versionsdetails')
    ws2.addRow(['Software-Name', 'Version', 'Anzahl PCs', 'PC-Liste'])
    ws2.getRow(1).eachCell(c => { Object.assign(c, { style: headerStyle }) })
    for (const sw of swList) {
      const vSorted = [...sw.versions.entries()].sort((a, b) => compareVersions(b[0], a[0]))
      for (let vi = 0; vi < vSorted.length; vi++) {
        const [ver, pcs] = vSorted[vi]
        const row = ws2.addRow([sw.name, ver, pcs.length, pcs.join(', ')])
        row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: vi === 0 ? 'FFD4EDDA' : 'FFF8D7DA' } }
      }
    }
    ws2.columns = [{ width: 45 }, { width: 20 }, { width: 12 }, { width: 80 }]

    const ws3 = wb.addWorksheet('Pro PC')
    ws3.addRow(['Hostname', 'Software-Name', 'Version', 'Publisher', 'Scan-Datum'])
    ws3.getRow(1).eachCell(c => { Object.assign(c, { style: headerStyle }) })
    const perPC: { h: string; n: string; v: string; p: string; d: string }[] = []
    for (const pc of successResults) {
      for (const sw of pc.software) {
        perPC.push({ h: pc.hostname, n: sw.DisplayName, v: sw.DisplayVersion || '', p: sw.Publisher || '', d: pc.scannedAt ? formatDate(pc.scannedAt) : '' })
      }
    }
    perPC.sort((a, b) => a.h.localeCompare(b.h) || a.n.localeCompare(b.n))
    for (const r of perPC) ws3.addRow([r.h, r.n, r.v, r.p, r.d])
    ws3.columns = [{ width: 22 }, { width: 45 }, { width: 20 }, { width: 30 }, { width: 18 }]

    const ws4 = wb.addWorksheet('Veraltete Versionen')
    ws4.addRow(['Software-Name', 'Hostname', 'Installierte Version', 'Neueste gefundene Version', 'Veraltet'])
    ws4.getRow(1).eachCell(c => { Object.assign(c, { style: headerStyle }) })
    for (const sw of swList) {
      if (sw.versionCount <= 1) continue
      for (const [ver, pcs] of sw.versions) {
        if (ver === sw.newest) continue
        for (const pc of pcs) {
          const row = ws4.addRow([sw.name, pc, ver, sw.newest, 'Ja'])
          row.getCell(5).font = { bold: true, color: { argb: 'FFDC3545' } }
        }
      }
    }
    ws4.columns = [{ width: 45 }, { width: 22 }, { width: 22 }, { width: 25 }, { width: 10 }]

    const ws5 = wb.addWorksheet('Nicht erreichbar')
    ws5.addRow(['Hostname', 'Status', 'Fehler'])
    ws5.getRow(1).eachCell(c => { Object.assign(c, { style: headerStyle }) })
    for (const r of newFailedResults) ws5.addRow([r.hostname, r.offline ? 'Offline' : 'Nicht zugreifbar', r.error || 'Keine Daten empfangen'])
    ws5.columns = [{ width: 22 }, { width: 18 }, { width: 60 }]

    // Also save Excel to server
    const arrayBuffer = await wb.xlsx.writeBuffer() as ArrayBuffer

    // Save locally (user-chosen path)
    const result = await api().writeFile(savePath, arrayBufferToBase64(arrayBuffer))
    if (!result.success) throw new Error(result.error ?? 'Speichern fehlgeschlagen')

    // Also save to server
    try {
      const serverPath = `software_inventar/Software_Inventar_${ts}.xlsx`
      await api().netWriteFile?.(serverPath, arrayBufferToBase64(arrayBuffer))
    } catch { /* offline — local save worked */ }
  }, [swList, successResults, newFailedResults])

  // ══════════════════════════════════════════════════════════════════════════
  // Render
  // ══════════════════════════════════════════════════════════════════════════

  const validHosts = hosts.filter(h => h.trim()).length
  const newToScan = hosts.filter(h => h.trim() && !scannedHostnames.has(h.trim().toUpperCase())).length
  const alreadyScanned = validHosts - newToScan

  return (
    <div className="flex flex-col gap-5 h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Package size={24} /> Software-Inventar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Unternehmensweiter Software-Scan mit Excel-Export
          </p>
        </div>
        {/* Persistent data info */}
        {!persistLoading && persistent && persistent.scannedPCs.length > 0 && scan.phase === 'idle' && (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                <Database size={10} /> <strong>{persistent.scannedPCs.length}</strong> PCs bereits erfasst
              </p>
              <p className="text-[9px] text-muted-foreground">
                Letztes Update: {formatDate(persistent.lastUpdated)}
              </p>
            </div>
            <button onClick={() => { setScan(prev => ({ ...prev, phase: 'done', results: [] })); setSkippedCount(0) }}
              className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground"
              title="Gespeicherte Ergebnisse anzeigen">
              Ergebnisse anzeigen
            </button>
            {isMaster && (
              <button onClick={() => setShowResetConfirm(true)}
                className="p-1.5 rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10" title="Alle Daten löschen (Master Admin)">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Step 1: Source selection ──────────────────────────────────────── */}
      {scan.phase === 'idle' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <button onClick={loadFromInventory} disabled={inventoryLoading}
              className={`p-4 rounded-lg border-2 text-left transition-all ${source === 'inventory' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Monitor size={18} className="text-primary" />
                <span className="font-semibold text-foreground text-sm">Alle Computer aus Standort-Übersicht</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {inventoryLoading ? 'Lade...' : inventoryCount !== null ? `${inventoryCount} Computer geladen` : 'Klicken um Computer aus dem Inventar zu laden'}
              </p>
            </button>
            <button onClick={() => { setSource('manual'); setInventoryCount(null) }}
              className={`p-4 rounded-lg border-2 text-left transition-all ${source === 'manual' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}>
              <div className="flex items-center gap-2 mb-2">
                <List size={18} className="text-primary" />
                <span className="font-semibold text-foreground text-sm">Geräte-Liste erstellen</span>
              </div>
              <p className="text-xs text-muted-foreground">Hostnamen manuell eingeben</p>
            </button>
          </div>

          {/* Host list editor */}
          <div className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {source === 'inventory' ? `Computer-Liste (${validHosts})` : 'Hostnamen eingeben'}
              </p>
              <button onClick={() => setHosts(prev => [...prev, ''])}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                <Plus size={13} /> Hinzufügen
              </button>
            </div>

            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {hosts.map((h, idx) => {
                const isAlreadyScanned = h.trim() && scannedHostnames.has(h.trim().toUpperCase())
                return (
                  <div key={idx} className="flex gap-2 items-center">
                    <input type="text" placeholder="z.B. DEHAM12345678" value={h}
                      onChange={e => { const next = [...hosts]; next[idx] = e.target.value; setHosts(next) }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { setHosts(prev => [...prev, '']); setTimeout(() => { const inputs = document.querySelectorAll<HTMLInputElement>('[data-hostinput]'); inputs[inputs.length - 1]?.focus() }, 50) }
                      }}
                      data-hostinput
                      className={`flex-1 px-3 py-1.5 text-sm rounded-md border bg-background text-foreground font-mono placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors ${isAlreadyScanned ? 'border-green-500/40 bg-green-500/5' : 'border-border'}`} />
                    {isAlreadyScanned && <CheckCircle size={14} className="text-green-400 shrink-0" title="Bereits erfasst" />}
                    <button onClick={() => setHosts(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)} disabled={hosts.length <= 1}
                      className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-30">
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>

            {/* Info box */}
            <div className="mt-3 rounded-md bg-blue-500/5 border border-blue-500/20 p-2">
              <p className="text-[9px] font-semibold text-blue-400 flex items-center gap-1"><Info size={10} /> Hinweis</p>
              <p className="text-[9px] text-muted-foreground leading-relaxed">
                {scanMode === 'fast'
                  ? 'Schnell-Scan: 10 PCs parallel, 25s Timeout. WinRM wird bei Bedarf automatisch aktiviert.'
                  : 'Komplett-Scan: 5 PCs parallel, 35s Timeout. WinRM + Remote Registry + PsExec.'
                }<br/>
                Bereits erfasste PCs werden übersprungen — nur neue PCs werden gescannt.
                {alreadyScanned > 0 && <><br/><strong className="text-green-400">{alreadyScanned} von {validHosts} PCs bereits erfasst</strong> — nur {newToScan} neue PCs werden gescannt.</>}
              </p>
            </div>
          </div>

          {/* Scan mode selector */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <button onClick={() => setScanMode('fast')}
              className={`p-3 rounded-lg border-2 text-left transition-all ${scanMode === 'fast' ? 'border-emerald-500 bg-emerald-500/5' : 'border-border hover:border-emerald-500/40'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Zap size={16} className="text-emerald-400" />
                <span className="font-semibold text-foreground text-sm">Schnell-Scan (nur WinRM)</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                WinRM (wird bei Bedarf automatisch aktiviert). 10 PCs parallel, 25s Timeout.<br/>
                PCs ohne WinRM können danach gezielt mit Komplett-Scan nachgescannt werden.
              </p>
            </button>
            <button onClick={() => setScanMode('full')}
              className={`p-3 rounded-lg border-2 text-left transition-all ${scanMode === 'full' ? 'border-blue-500 bg-blue-500/5' : 'border-border hover:border-blue-500/40'}`}>
              <div className="flex items-center gap-2 mb-1">
                <Layers size={16} className="text-blue-400" />
                <span className="font-semibold text-foreground text-sm">Komplett-Scan (alle Methoden)</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                WinRM, Remote Registry, PsExec. Langsamer (5 PCs parallel, 30s Timeout).<br/>
                Erreicht mehr PCs, dauert aber deutlich länger.
              </p>
            </button>
          </div>

          {/* Start button */}
          <div className="flex justify-end gap-3">
            {alreadyScanned > 0 && validHosts > 0 && (
              <button onClick={() => { setScan(prev => ({ ...prev, phase: 'done', results: [] })); setSkippedCount(0) }}
                className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm border border-border text-muted-foreground hover:bg-accent">
                <Database size={16} /> Gespeicherte Ergebnisse anzeigen
              </button>
            )}
            <button onClick={startScan} disabled={validHosts === 0}
              className={`flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all ${
                validHosts > 0 ? 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/25' : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}>
              {scanMode === 'fast' ? <Zap size={16} /> : <Layers size={16} />}
              {newToScan > 0 ? `${scanMode === 'fast' ? 'Schnell' : 'Komplett'}-Scan (${newToScan} neue PCs)` : alreadyScanned > 0 ? 'Alle bereits erfasst' : `${scanMode === 'fast' ? 'Schnell' : 'Komplett'}-Scan (${validHosts} PCs)`}
            </button>
          </div>
        </>
      )}

      {/* ── Step 2: Scanning progress ────────────────────────────────────── */}
      {scan.phase === 'scanning' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <Loader size={48} className="text-primary animate-spin" />
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">Scanne PC {scan.done + 1} von {scan.total}</p>
            <p className="text-sm font-mono text-primary mt-1">{scan.current}</p>
            {skippedCount > 0 && <p className="text-xs text-green-400 mt-2">{skippedCount} PCs übersprungen (bereits erfasst)</p>}
          </div>
          <div className="w-80">
            <div className="w-full h-3 rounded-full bg-muted/30 overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${Math.round((scan.done / scan.total) * 100)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground text-center mt-1">{Math.round((scan.done / scan.total) * 100)}% — {scan.done} von {scan.total} abgeschlossen</p>
          </div>
          <button onClick={() => { cancelRef.current = true }} className="text-xs text-destructive hover:text-destructive/80 transition-colors">Abbrechen</button>
        </div>
      )}

      {/* ── Step 3: Results ───────────────────────────────────────────────── */}
      {scan.phase === 'done' && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="bg-card rounded-lg border border-border p-3 text-center">
              <p className="text-xl font-bold text-foreground">{successResults.length}</p>
              <p className="text-[10px] text-muted-foreground">PCs erfasst (gesamt)</p>
            </div>
            <div className="bg-card rounded-lg border border-green-500/30 p-3 text-center">
              <p className="text-xl font-bold text-green-400">{scan.results.filter(r => r.software.length > 0).length}</p>
              <p className="text-[10px] text-muted-foreground">Neu gescannt</p>
            </div>
            <div className="bg-card rounded-lg border border-muted p-3 text-center">
              <p className="text-xl font-bold text-muted-foreground">{offlineResults.length}</p>
              <p className="text-[10px] text-muted-foreground">Offline</p>
            </div>
            {winrmOnlyFailed.length > 0 && (
              <div className="bg-card rounded-lg border border-amber-500/30 p-3 text-center">
                <p className="text-xl font-bold text-amber-400">{winrmOnlyFailed.length}</p>
                <p className="text-[10px] text-muted-foreground">Kein WinRM</p>
              </div>
            )}
            {unreachableResults.length > 0 && (
              <div className="bg-card rounded-lg border border-red-500/30 p-3 text-center">
                <p className="text-xl font-bold text-red-400">{unreachableResults.length}</p>
                <p className="text-[10px] text-muted-foreground">Nicht zugreifbar</p>
              </div>
            )}
            <div className="bg-card rounded-lg border border-primary/30 p-3 text-center">
              <p className="text-xl font-bold text-primary">{swList.length}</p>
              <p className="text-[10px] text-muted-foreground">Software-Titel</p>
            </div>
          </div>

          {/* Persistent data info */}
          {persistent && persistent.scannedPCs.length > 0 && (
            <div className="rounded-md bg-blue-500/5 border border-blue-500/20 p-3 flex items-center gap-3">
              <Database size={16} className="text-blue-400 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-foreground font-medium">
                  Gesamt: {persistent.scannedPCs.length} PCs erfasst — Ergebnisse aus {
                    new Set(persistent.scannedPCs.map(p => p.scannedAt ? p.scannedAt.slice(0, 10) : '')).size
                  } Scan-Durchläufen
                </p>
                <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                  <Clock size={9} /> Letztes Update: {formatDate(persistent.lastUpdated)}
                  {skippedCount > 0 && <> — {skippedCount} PCs übersprungen (bereits erfasst)</>}
                </p>
              </div>
              {isMaster && (
                <button onClick={() => setShowResetConfirm(true)}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10">
                  <Trash2 size={10} /> Alle Daten löschen
                </button>
              )}
            </div>
          )}

          {/* Versions warning */}
          {swList.filter(s => s.versionCount > 1).length > 0 && (
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-400">{swList.filter(s => s.versionCount > 1).length} Software-Titel mit verschiedenen Versionen gefunden</p>
                <p className="text-xs text-muted-foreground">Diese sind in der Excel-Datei gelb markiert.</p>
              </div>
            </div>
          )}

          {/* Top 20 table */}
          <div className="bg-card rounded-lg border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/20">
              <p className="text-sm font-semibold text-foreground">Top 20 häufigste Software</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/10">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">#</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Software</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Publisher</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground">Installationen</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground">Versionen</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">Häufigste Version</th>
                  </tr>
                </thead>
                <tbody>
                  {swList.slice(0, 20).map((sw, idx) => (
                    <tr key={idx} className={`border-b border-border/50 ${sw.versionCount > 1 ? 'bg-amber-500/5' : ''}`}>
                      <td className="px-4 py-1.5 text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-1.5 text-foreground font-medium">{sw.name}</td>
                      <td className="px-4 py-1.5 text-muted-foreground">{sw.publisher}</td>
                      <td className="px-4 py-1.5 text-center text-foreground font-mono">{sw.totalInstalls}</td>
                      <td className="px-4 py-1.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sw.versionCount > 1 ? 'bg-amber-500/20 text-amber-400' : 'bg-green-500/20 text-green-400'}`}>{sw.versionCount}</span>
                      </td>
                      <td className="px-4 py-1.5 text-muted-foreground font-mono text-xs">{sw.mostCommon}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* WinRM failed — with retry button (only in fast mode) */}
          {winrmOnlyFailed.length > 0 && (
            <div className="bg-card rounded-lg border border-amber-500/30 overflow-hidden">
              <div className="px-4 py-3 border-b border-amber-500/20 bg-amber-500/5 flex items-center justify-between">
                <p className="text-sm font-semibold text-amber-400 flex items-center gap-1.5">
                  WinRM nicht verfügbar ({winrmOnlyFailed.length}) — Online, aber kein WinRM
                  <button onClick={() => setShowWinrmHelp(true)} className="p-0.5 rounded hover:bg-amber-500/20 text-amber-400/70 hover:text-amber-400" title="Anleitung: WinRM vor Ort aktivieren">
                    <HelpCircle size={14} />
                  </button>
                </p>
                <button onClick={retryWithFullScan} disabled={retrying || winrmFailedList.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 disabled:opacity-50">
                  {retrying ? <Loader size={10} className="animate-spin" /> : <Layers size={10} />}
                  Diese PCs mit Komplett-Scan erneut versuchen
                </button>
              </div>
              <div className="divide-y divide-border/50 max-h-32 overflow-y-auto">
                {winrmOnlyFailed.map((r, idx) => (
                  <div key={idx} className="px-4 py-1 text-xs font-mono text-muted-foreground">{r.hostname}</div>
                ))}
              </div>
            </div>
          )}

          {/* Offline PCs */}
          {offlineResults.length > 0 && (
            <div className="bg-card rounded-lg border border-muted overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/10">
                <p className="text-sm font-semibold text-muted-foreground">Offline-Geräte ({offlineResults.length}) — Ping fehlgeschlagen</p>
              </div>
              <div className="divide-y divide-border/50 max-h-32 overflow-y-auto">
                {offlineResults.map((r, idx) => (
                  <div key={idx} className="px-4 py-1 text-xs font-mono text-muted-foreground">{r.hostname}</div>
                ))}
              </div>
            </div>
          )}

          {/* Unreachable PCs (online but ALL methods failed — only in full mode) */}
          {unreachableResults.length > 0 && (
            <div className="bg-card rounded-lg border border-red-500/20 overflow-hidden">
              <div className="px-4 py-3 border-b border-red-500/20 bg-red-500/5">
                <p className="text-sm font-semibold text-red-400">Nicht zugreifbar ({unreachableResults.length}) — Alle Methoden fehlgeschlagen</p>
              </div>
              <div className="divide-y divide-border/50 max-h-40 overflow-y-auto">
                {unreachableResults.map((r, idx) => (
                  <div key={idx} className="px-4 py-1.5 flex justify-between text-xs">
                    <span className="font-mono text-foreground">{r.hostname}</span>
                    <span className="text-muted-foreground truncate ml-4">{r.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pb-2">
            <button onClick={() => { setScan({ phase: 'idle', total: 0, done: 0, current: '', results: [] }); setSkippedCount(0) }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border border-border text-muted-foreground hover:bg-muted/30 transition-colors">
              <RefreshCw size={14} /> Neuer Scan
            </button>
            <button onClick={exportExcel} disabled={successResults.length === 0}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all ${
                successResults.length > 0 ? 'bg-green-600 text-white hover:bg-green-700 shadow-lg shadow-green-600/25' : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}>
              <Download size={16} /> Als Excel exportieren
            </button>
          </div>
        </>
      )}

      {/* WinRM help modal */}
      {showWinrmHelp && <WinRMHelpModal onClose={() => setShowWinrmHelp(false)} />}

      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-red-500/40 rounded-xl p-5 w-[380px] shadow-2xl space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400" />
              <h3 className="text-sm font-semibold text-foreground">Alle Scan-Daten löschen?</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Alle {persistent?.scannedPCs.length ?? 0} gespeicherten PC-Ergebnisse werden gelöscht.
              Beim nächsten Scan werden ALLE PCs erneut gescannt.
              <br/><br/>
              <strong className="text-foreground">Diese Aktion kann nicht rückgängig gemacht werden.</strong>
            </p>
            <div className="flex gap-2">
              <button onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-2 text-xs rounded-md border border-border hover:bg-accent text-muted-foreground">Abbrechen</button>
              <button onClick={resetData}
                className="flex-1 py-2 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white">Alle Daten löschen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
