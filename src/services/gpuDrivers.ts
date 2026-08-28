// ── Grafik-/Treiber-Verwaltung – Service (Etappe 1: Scan + Bewertung) ─────────
// SolidWorks-Workstations brauchen einen ZERTIFIZIERTEN Grafiktreiber. Der GPU-
// Treiber ist praktisch die einzige Komponente mit eigenem SolidWorks-
// Zertifizierungsprozess (Consumer-/„Game Ready"-Treiber = nicht zertifiziert).
//
// Dieser Service:
//   1. scannt ausgewählte Geräte per WinRM (Win32_VideoController + nvidia-smi),
//   2. bewertet die Eignung (Freigabe-Katalog + Heuristik),
//   3. speichert eine zentrale Übersicht auf dem Netzlaufwerk.
//
// „Zertifiziert" ist versions-/modellspezifisch und ohne öffentliche API — daher
// pflegt die IT einen Freigabe-Katalog (approved.json), gegen den abgeglichen wird.
//
// Speicher:  gpu-drivers/scan_data.json   +   gpu-drivers/approved.json
//
// HINWEIS: Das Modell trägt bereits die Felder für Etappe 2 (Verteilen/Install);
// in Etappe 1 bleiben sie leer und werden beim Re-Scan bewahrt.

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'

const SCAN_FILE = 'gpu-drivers/scan_data.json'
const APPROVED_FILE = 'gpu-drivers/approved.json'

export type Suitability = 'geeignet' | 'nicht-geeignet' | 'unbekannt' | 'fehler'
export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'andere' | ''
export type GpuClass = 'pro' | 'consumer' | 'andere' | ''

export interface GpuDriverRecord {
  hostname: string
  online?: boolean
  cpu: string                // z. B. "Intel(R) Core(TM) i7-12700"
  ramGB: number              // installierter Arbeitsspeicher in GB (gerundet)
  gpuName: string            // z. B. "NVIDIA RTX A2000" oder "NVIDIA GeForce RTX 3060"
  gpuVendor: GpuVendor
  gpuClass: GpuClass         // pro = Quadro/RTX Ax/Ada · consumer = GeForce/GTX
  driverVersion: string      // WMI DriverVersion, z. B. "32.0.15.9686"
  nvidiaVersion: string      // nvidia-smi Anzeige, z. B. "596.86"
  suitability: Suitability
  suitabilityReason: string
  scannedAt: string          // ISO
  error?: string
  // ── Etappe 2 (Verteilen/Install) – in Etappe 1 leer, beim Re-Scan bewahrt ──
  installedViaTool?: boolean
  installedVersion?: string   // neu installierte Version (Paket-/NVIDIA-Version, z. B. 596.86)
  previousVersion?: string    // Version, die VOR der Tool-Installation drauf war
  installedAt?: string
  installedBy?: string
  needsReboot?: boolean
  rebootedAt?: string
  uninstalledViaTool?: boolean  // Treiber wurde über das Tool deinstalliert
  uninstalledAt?: string
  uninstalledBy?: string
}

export interface ApprovedDriver {
  id: string
  label: string              // freie Bezeichnung, z. B. "RTX Enterprise 596.86 (SW 2025)"
  match: string              // Version, gegen die verglichen wird (nvidia-smi ODER WMI)
  gpuContains?: string       // optional: nur für GPUs, deren Name das enthält (z. B. "RTX A")
  note?: string
  addedBy?: string
  addedAt?: string
}

interface ScanFile { lastUpdated: string; devices: GpuDriverRecord[] }
interface ApprovedFile { versions: ApprovedDriver[]; blocked?: ApprovedDriver[] }

// ── Laden / Speichern ─────────────────────────────────────────────────────────

export async function loadScanData(): Promise<GpuDriverRecord[]> {
  try {
    const d = await api().netReadJson<ScanFile>(SCAN_FILE)
    if (d && Array.isArray(d.devices)) return d.devices
  } catch { /* leer */ }
  return []
}

/** Neue Scan-Ergebnisse zentral einmischen (per Hostname), Install-Historie bewahren. */
export async function saveScanResults(newRecords: GpuDriverRecord[]): Promise<GpuDriverRecord[]> {
  const cur = await loadScanData()
  const byHost = new Map(cur.map(r => [r.hostname.toLowerCase(), r]))
  for (const nr of newRecords) {
    const key = nr.hostname.toLowerCase()
    const prev = byHost.get(key)
    byHost.set(key, {
      ...nr,
      // Install-Felder aus dem Vorgänger übernehmen (Etappe 2)
      installedViaTool: prev?.installedViaTool,
      installedVersion: prev?.installedVersion,
      previousVersion: prev?.previousVersion,
      installedAt: prev?.installedAt,
      installedBy: prev?.installedBy,
      needsReboot: prev?.needsReboot,
      rebootedAt: prev?.rebootedAt,
    })
  }
  const all = Array.from(byHost.values())
  try { await api().netWriteJson(SCAN_FILE, { lastUpdated: new Date().toISOString(), devices: all } satisfies ScanFile) } catch { /* ignore */ }
  return all
}

export async function deleteScanRecord(hostname: string): Promise<GpuDriverRecord[]> {
  const cur = await loadScanData()
  const all = cur.filter(r => r.hostname.toLowerCase() !== hostname.toLowerCase())
  try { await api().netWriteJson(SCAN_FILE, { lastUpdated: new Date().toISOString(), devices: all } satisfies ScanFile) } catch { /* ignore */ }
  return all
}

/**
 * Standard-Freigaben (SolidWorks-Workstations bei SKF Marine). Werden EINMALIG
 * vorbelegt, wenn der Katalog auf der Freigabe noch nicht existiert — danach voll
 * bearbeitbar/löschbar über die Oberfläche. Über „Empfohlene einfügen" jederzeit
 * neu einspielbar.
 */
export const DEFAULT_APPROVED: ApprovedDriver[] = [
  { id: 'apv-rtx2000ada',    label: 'RTX 2000 Ada – Empfohlen',    match: '596.86', gpuContains: 'RTX 2000 Ada',    note: 'Praktisch bestätigt bei Mirco',                                addedBy: 'Standard' },
  { id: 'apv-rtxa4000',      label: 'RTX A4000 – Empfohlen',       match: '596.86', gpuContains: 'RTX A4000',       note: 'Mindestversion 537.42 dokumentiert, deutlich übererfüllt',      addedBy: 'Standard' },
]

/**
 * GESPERRTE Treiber-/GPU-Kombinationen: werden bei der Bewertung IMMER als
 * „nicht-geeignet" markiert und aus der Freigabeliste entfernt. Grund real:
 * 596.86 bringt auf der Quadro RTX 4000 den „NVIDIA RTX Desktop Manager" mit,
 * der Edge/Chrome (Chromium) lahmlegt.
 */
export const DEFAULT_BLOCKED: ApprovedDriver[] = [
  { id: 'blk-quadrortx4000-59686', label: 'Quadro RTX 4000 – 596.86 GESPERRT', match: '596.86', gpuContains: 'Quadro RTX 4000', note: 'RTX Desktop Manager bricht Chromium (Edge/Chrome) – nicht verwenden', addedBy: 'Standard' },
]

/** Gleiche Regel? (Version + GPU-Filter) — für Freigabe/Sperre-Abgleich. */
function sameRule(a: ApprovedDriver, b: ApprovedDriver): boolean {
  return (a.match || '').trim() === (b.match || '').trim() &&
    (a.gpuContains || '').trim().toLowerCase() === (b.gpuContains || '').trim().toLowerCase()
}

/** Lädt Freigaben + Sperren, seedet Defaults einmalig und hält sie konsistent
 *  (gesperrte Versionen werden aus der Freigabeliste entfernt). */
async function loadApprovedFile(): Promise<{ versions: ApprovedDriver[]; blocked: ApprovedDriver[] }> {
  let versions: ApprovedDriver[] | null = null
  let blocked: ApprovedDriver[] | null = null
  try {
    const d = await api().netReadJson<ApprovedFile>(APPROVED_FILE)
    if (d && Array.isArray(d.versions)) versions = d.versions
    if (d && Array.isArray(d.blocked)) blocked = d.blocked
  } catch { /* leer */ }
  let changed = false
  if (versions === null) { versions = DEFAULT_APPROVED.map(a => ({ ...a })); changed = true }
  if (blocked === null) { blocked = DEFAULT_BLOCKED.map(a => ({ ...a })); changed = true }   // Migration: Sperre nachziehen
  const before = versions.length
  versions = versions.filter(v => !blocked!.some(b => sameRule(b, v)))                        // Gesperrtes aus Freigaben werfen
  if (versions.length !== before) changed = true
  if (changed) { try { await api().netWriteJson(APPROVED_FILE, { versions, blocked } satisfies ApprovedFile) } catch { /* ignore */ } }
  return { versions, blocked }
}

export async function loadApproved(): Promise<ApprovedDriver[]> { return (await loadApprovedFile()).versions }
export async function loadBlocked(): Promise<ApprovedDriver[]> { return (await loadApprovedFile()).blocked }

export async function saveApproved(list: ApprovedDriver[]): Promise<boolean> {
  const cur = await loadApprovedFile()
  // Freigaben, die gesperrt sind, gar nicht erst zulassen.
  const versions = list.filter(v => !cur.blocked.some(b => sameRule(b, v)))
  try { return await api().netWriteJson(APPROVED_FILE, { versions, blocked: cur.blocked } satisfies ApprovedFile) } catch { return false }
}

export async function saveBlocked(list: ApprovedDriver[]): Promise<boolean> {
  const cur = await loadApprovedFile()
  const versions = cur.versions.filter(v => !list.some(b => sameRule(b, v)))   // beim Sperren aus Freigaben entfernen
  try { return await api().netWriteJson(APPROVED_FILE, { versions, blocked: list } satisfies ApprovedFile) } catch { return false }
}

// ── Klassifizierung & Bewertung ───────────────────────────────────────────────

export function classifyGpu(name: string): { vendor: GpuVendor; cls: GpuClass } {
  const n = (name || '').toLowerCase()
  let vendor: GpuVendor = ''
  if (/nvidia|geforce|quadro|\brtx\b|\bgtx\b/.test(n)) vendor = 'nvidia'
  else if (/amd|radeon|firepro/.test(n)) vendor = 'amd'
  else if (/intel/.test(n)) vendor = 'intel'
  else if (n) vendor = 'andere'

  let cls: GpuClass = ''
  if (vendor === 'nvidia') {
    if (/geforce|gtx/.test(n)) cls = 'consumer'
    else if (/quadro|rtx a|ada|\bt\d{3,4}\b|\ba\d{3,4}\b/.test(n)) cls = 'pro'
    else cls = 'andere'
  } else if (vendor === 'amd') {
    cls = /radeon pro|firepro|\bw\d{4}\b/.test(n) ? 'pro' : (/radeon/.test(n) ? 'consumer' : 'andere')
  } else {
    cls = 'andere'
  }
  return { vendor, cls }
}

export function evaluateSuitability(rec: Pick<GpuDriverRecord, 'gpuName' | 'gpuClass' | 'driverVersion' | 'nvidiaVersion'>, approved: ApprovedDriver[], blocked: ApprovedDriver[] = []): { suitability: Suitability; reason: string } {
  const nameL = (rec.gpuName || '').toLowerCase()
  const nv = (rec.nvidiaVersion || '').trim()
  const wmi = (rec.driverVersion || '').trim()

  const matches = (a: ApprovedDriver): boolean => {
    const m = (a.match || '').trim()
    if (!m) return false
    const gc = (a.gpuContains || '').trim().toLowerCase()
    if (gc && !nameL.includes(gc)) return false
    return m === nv || m === wmi
  }

  // Sperre hat Vorrang vor jeder Freigabe.
  const blockedHit = blocked.find(matches)
  if (blockedHit) return { suitability: 'nicht-geeignet', reason: `Gesperrt: ${blockedHit.note || blockedHit.label}` }

  const hit = approved.find(a => {
    const m = (a.match || '').trim()
    if (!m) return false
    const gc = (a.gpuContains || '').trim().toLowerCase()
    if (gc && !nameL.includes(gc)) return false
    return m === nv || m === wmi
  })
  if (hit) return { suitability: 'geeignet', reason: `Freigegebene Version: ${hit.label}` }

  if (rec.gpuClass === 'consumer') {
    return { suitability: 'nicht-geeignet', reason: 'Consumer-/Gaming-GPU (GeForce/GTX) – für SolidWorks nicht zertifiziert.' }
  }
  if (rec.gpuClass === 'pro') {
    return { suitability: 'unbekannt', reason: 'Profi-GPU, aber Treiberversion nicht im Freigabe-Katalog – gegen SolidWorks-Liste prüfen.' }
  }
  return { suitability: 'unbekannt', reason: 'Keine eindeutige NVIDIA-Profi-Konstellation – bitte manuell prüfen.' }
}

// ── Scan (WinRM) ──────────────────────────────────────────────────────────────

interface RawGpu { name: string; driver: string }

function pickGpu(gpus: RawGpu[]): RawGpu {
  if (!gpus.length) return { name: '', driver: '' }
  const nv = gpus.find(g => /nvidia|geforce|quadro|rtx/i.test(g.name || ''))
  if (nv) return nv
  const amd = gpus.find(g => /amd|radeon|firepro/i.test(g.name || ''))
  if (amd) return amd
  const real = gpus.find(g => g.name && !/microsoft basic|remote display|meta|parsec/i.test(g.name))
  return real || gpus[0]
}

/** Baut das lokal auszuführende PowerShell (Invoke-Command auf den Ziel-PC). */
function buildScanScript(hostname: string): string {
  const h = hostname.replace(/'/g, '')
  const inner = [
    `$out = @{}`,
    `try { $out.gpus = @(Get-CimInstance Win32_VideoController -ErrorAction Stop | ForEach-Object { @{ name = [string]$_.Name; driver = [string]$_.DriverVersion } }) } catch { $out.error = $_.Exception.Message }`,
    `$out.cpu = ''`,
    `try { $out.cpu = ([string]((Get-CimInstance Win32_Processor -ErrorAction Stop | Select-Object -First 1).Name)).Trim() } catch {}`,
    `$out.ram = 0`,
    `try { $out.ram = [int][math]::Round((Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).TotalPhysicalMemory / 1GB) } catch {}`,
    `$nv = ''`,
    `foreach ($p in @("$env:SystemRoot\\System32\\nvidia-smi.exe","$env:ProgramFiles\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe")) { if (Test-Path -LiteralPath $p) { try { $nv = ((& $p --query-gpu=driver_version --format=csv,noheader) | Select-Object -First 1).ToString().Trim() } catch {} ; break } }`,
    `$out.nvidia = $nv`,
    `$out | ConvertTo-Json -Compress -Depth 4`,
  ].join('; ')
  return `try { Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock { ${inner} } } catch { @{ error = $_.Exception.Message } | ConvertTo-Json -Compress }`
}

async function scanOne(host: string, approved: ApprovedDriver[], blocked: ApprovedDriver[] = []): Promise<GpuDriverRecord> {
  const base: GpuDriverRecord = {
    hostname: host, cpu: '', ramGB: 0, gpuName: '', gpuVendor: '', gpuClass: '', driverVersion: '', nvidiaVersion: '',
    suitability: 'unbekannt', suitabilityReason: '', scannedAt: new Date().toISOString(),
  }
  try {
    const up = await ensureWinRM(host)
    if (!up) {
      return { ...base, online: false, suitability: 'fehler', suitabilityReason: 'Nicht erreichbar', error: 'WinRM/PC nicht erreichbar (offline oder kein Zugriff).' }
    }
    const res = await api().runPowerShell(buildScanScript(host), 45000)
    const parsed = JSON.parse((res.stdout || '').trim() || '{}') as { gpus?: RawGpu | RawGpu[]; nvidia?: string; cpu?: string; ram?: number; error?: string }
    const cpu = String(parsed.cpu || '').replace(/\s+/g, ' ').trim()
    const ramGB = Number(parsed.ram) || 0
    const gpus = Array.isArray(parsed.gpus) ? parsed.gpus : (parsed.gpus ? [parsed.gpus] : [])
    if (parsed.error && gpus.length === 0) {
      return { ...base, online: true, cpu, ramGB, suitability: 'fehler', suitabilityReason: 'Scan-Fehler', error: String(parsed.error) }
    }
    const g = pickGpu(gpus)
    const { vendor, cls } = classifyGpu(g.name || '')
    const rec: GpuDriverRecord = {
      ...base, online: true, cpu, ramGB, gpuName: g.name || '', gpuVendor: vendor, gpuClass: cls,
      driverVersion: g.driver || '', nvidiaVersion: String(parsed.nvidia || '').trim(),
    }
    const ev = evaluateSuitability(rec, approved, blocked)
    return { ...rec, suitability: ev.suitability, suitabilityReason: ev.reason }
  } catch (e) {
    return { ...base, suitability: 'fehler', suitabilityReason: 'Fehler beim Scan', error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Scannt mehrere Hosts – in Wellen zu max. 8 gleichzeitig (WinRM-Limit; siehe
 * Performance-Regeln). onProgress meldet (fertig, gesamt, aktueller Host).
 */
export async function scanGpuDrivers(
  hostnames: string[],
  approved: ApprovedDriver[],
  onProgress?: (done: number, total: number, host: string) => void,
  blocked: ApprovedDriver[] = [],
): Promise<GpuDriverRecord[]> {
  const uniq = Array.from(new Set(hostnames.map(h => h.trim()).filter(Boolean)))
  const results: GpuDriverRecord[] = []
  let done = 0
  const BATCH = 8
  for (let i = 0; i < uniq.length; i += BATCH) {
    const batch = uniq.slice(i, i + BATCH)
    const settled = await Promise.all(batch.map(async host => {
      const rec = await scanOne(host, approved, blocked)
      done++
      onProgress?.(done, uniq.length, host)
      return rec
    }))
    results.push(...settled)
  }
  return results
}

// ── Anzeige-Helfer ────────────────────────────────────────────────────────────

export const SUITABILITY_LABEL: Record<Suitability, string> = {
  'geeignet': 'Geeignet',
  'nicht-geeignet': 'Nicht geeignet',
  'unbekannt': 'Unbekannt',
  'fehler': 'Fehler',
}

// ══ Etappe 2: Treiber verteilen + installieren ════════════════════════════════
// Treiber-.exe liegen auf der Freigabe unter gpu-drivers/packages. Das Tool
// kopiert sie per Copy-Item auf \\host\c$\Temp und installiert sie still.
// SICHERHEIT: Installation NUR, wenn niemand angemeldet ist und SolidWorks nicht
// läuft (Vorgabe). Neustart pro Verteilung wählbar (Nachricht ODER Countdown).

export const PACKAGES_DIR = 'gpu-drivers/packages'

// Geschätzte Installationsdauer (Kopieren des großen Treibers + stille Installation).
// Fließt in die Vorab-Warnung an den Nutzer ein.
export const INSTALL_ETA_MIN = 15

/** Treiberversion aus dem Dateinamen ziehen (z. B. "596.86-quadro-…exe"). */
export function parseDriverVersion(filename: string): string {
  const m = (filename || '').match(/(\d{3}\.\d{2,3})/)
  return m ? m[1] : ''
}

export interface DriverPackage { name: string; version: string }

/** Verfügbare Treiber-Pakete (.exe) aus gpu-drivers/packages auf der Freigabe. */
export async function listDriverPackages(): Promise<DriverPackage[]> {
  try {
    const files = await api().netListDir(PACKAGES_DIR)
    return (files || [])
      .filter(f => /\.exe$/i.test(f))
      .map(f => ({ name: f, version: parseDriverVersion(f) }))
      .sort((a, b) => b.name.localeCompare(a.name))
  } catch { return [] }
}

export type RebootMode = 'notify' | 'reboot'
export type DeployMode = 'install' | 'uninstall'
export interface DeployOptions {
  rebootMode: RebootMode
  by: string
  version: string
  /** true = laufendes SolidWorks/HiCAD nach Vorwarnung hart beenden statt zu überspringen. */
  forceCloseCad?: boolean
  /** 'uninstall' = Treiber deinstallieren statt installieren. */
  mode?: DeployMode
}
export interface DeployStep { host: string; phase: string; status: 'running' | 'ok' | 'blocked' | 'error' }
export interface DeployResult { host: string; status: 'installiert' | 'deinstalliert' | 'blockiert' | 'fehler'; message: string; newVersion?: string; needsReboot?: boolean }

const q = (s: string) => (s || '').replace(/'/g, '')

/** Markiert ein Gerät in der Übersicht als „über das Tool installiert". */
export async function markDriverInstalled(host: string, info: { version: string; by: string; newVersion?: string; needsReboot?: boolean }): Promise<void> {
  const cur = await loadScanData()
  const now = new Date().toISOString()
  const idx = cur.findIndex(r => r.hostname.toLowerCase() === host.toLowerCase())
  if (idx >= 0) {
    // Version VOR der Installation festhalten (fürs „vorher"-Feld in der Übersicht).
    const prevVer = cur[idx].nvidiaVersion || cur[idx].driverVersion || ''
    cur[idx] = {
      ...cur[idx], installedViaTool: true, installedVersion: info.version, installedAt: now, installedBy: info.by,
      needsReboot: info.needsReboot, previousVersion: prevVer,
      nvidiaVersion: info.version || cur[idx].nvidiaVersion,
      driverVersion: info.newVersion || cur[idx].driverVersion,
    }
  } else {
    cur.push({
      hostname: host, cpu: '', ramGB: 0, gpuName: '', gpuVendor: '', gpuClass: '', driverVersion: info.newVersion || '',
      nvidiaVersion: '', suitability: 'unbekannt', suitabilityReason: '', scannedAt: now,
      installedViaTool: true, installedVersion: info.version, installedAt: now, installedBy: info.by, needsReboot: info.needsReboot,
    })
  }
  try { await api().netWriteJson(SCAN_FILE, { lastUpdated: now, devices: cur }) } catch { /* ignore */ }
}

/** Markiert ein Gerät als „über das Tool deinstalliert" (Treiber entfernt). */
export async function markDriverUninstalled(host: string, info: { by: string }): Promise<void> {
  const cur = await loadScanData()
  const now = new Date().toISOString()
  const idx = cur.findIndex(r => r.hostname.toLowerCase() === host.toLowerCase())
  if (idx >= 0) {
    cur[idx] = {
      ...cur[idx], installedViaTool: false, uninstalledViaTool: true, uninstalledAt: now, uninstalledBy: info.by,
      needsReboot: true, nvidiaVersion: '', driverVersion: '',
      suitability: 'unbekannt', suitabilityReason: 'Treiber deinstalliert – Basis-Anzeige aktiv, bitte neu scannen',
    }
    try { await api().netWriteJson(SCAN_FILE, { lastUpdated: now, devices: cur }) } catch { /* ignore */ }
  }
}

async function deployToHost(host: string, packageName: string, opts: DeployOptions, onStep?: (s: DeployStep) => void): Promise<DeployResult> {
  const h = q(host)
  const uninstall = opts.mode === 'uninstall'
  const verb = uninstall ? 'deinstalliert' : 'installiert'
  const step = (phase: string, status: DeployStep['status']) => onStep?.({ host, phase, status })
  try {
    // 1. Erreichbarkeit / WinRM
    step('Erreichbarkeit', 'running')
    if (!(await ensureWinRM(host))) return { host, status: 'fehler', message: 'Nicht erreichbar (WinRM/offline).' }

    // 2. CAD-Check — SolidWorks/HiCAD inkl. HINTERGRUNDPROZESSE erkennen.
    // Die SolidWorks-Familie läuft mit mehreren Prozessen (SLDWORKS, sldworks_fs,
    // sldProcMon, sldShellExtServer, Scheduler …) — diese laufen auch im Hintergrund
    // weiter. cadFamilyRegex fängt die ganze Familie; cadMainRegex ist die
    // Hauptanwendung, deren Weiterlaufen die Installation wirklich blockiert.
    step('Prüfe CAD', 'running')
    const cadFamilyRegex = '^sld|^solidworks|swscheduler|swspmanager|HiCAD'
    const cadMainRegex = '^SLDWORKS$|HiCAD'
    const cadScript = `try { Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock { $p=@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '${cadFamilyRegex}' } | ForEach-Object { $_.Name } | Select-Object -Unique); @{ apps=$p } | ConvertTo-Json -Compress } } catch { @{ error=$_.Exception.Message } | ConvertTo-Json -Compress }`
    const cadRes = await api().runPowerShell(cadScript, 30000)
    const cad = JSON.parse((cadRes.stdout || '').trim() || '{}') as { apps?: string | string[]; error?: string }
    if (cad.error) return { host, status: 'fehler', message: 'CAD-Prüfung fehlgeschlagen: ' + cad.error }
    const apps = Array.isArray(cad.apps) ? cad.apps : (cad.apps ? [cad.apps] : [])
    if (apps.length > 0) {
      if (!opts.forceCloseCad) {
        step('Prüfe CAD', 'blocked')
        return { host, status: 'blockiert', message: `Übersprungen — ${apps.join(', ')} läuft. Über „Beenden erzwingen" kann der Treiber trotzdem installiert werden.` }
      }
      // Erzwungenes Beenden: Nutzer warnen (SPEICHERN!), kurze Frist, dann die GANZE
      // SolidWorks-/HiCAD-Familie (inkl. Hintergrundprozesse) in mehreren Runden hart
      // beenden und nachprüfen. Abgebrochen wird nur, wenn die HAUPTanwendung übrig bleibt.
      step('CAD beenden', 'running')
      const warnMsg = q(`Achtung: Fuer eine Grafiktreiber-Installation werden SolidWorks/HiCAD (inkl. Hintergrundprozesse) in ca. 30 Sekunden automatisch geschlossen. Bitte JETZT alle offene Arbeit speichern!`)
      const killScript = [
        `try { Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock {`,
        `  try { msg * '${warnMsg}' } catch {}`,
        `  Start-Sleep -Seconds 30`,
        `  for ($i=0; $i -lt 3; $i++) {`,
        `    Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '${cadFamilyRegex}' } | Stop-Process -Force -ErrorAction SilentlyContinue`,
        `    Start-Sleep -Milliseconds 800`,
        `  }`,
        `  Start-Sleep -Seconds 2`,
        `  $familyLeft=@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '${cadFamilyRegex}' } | ForEach-Object { $_.Name } | Select-Object -Unique)`,
        `  $mainLeft=@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '${cadMainRegex}' } | ForEach-Object { $_.Name } | Select-Object -Unique)`,
        `  @{ familyLeft=$familyLeft; mainLeft=$mainLeft } | ConvertTo-Json -Compress`,
        `} } catch { @{ error=$_.Exception.Message } | ConvertTo-Json -Compress }`,
      ].join('\n')
      const killRes = await api().runPowerShell(killScript, 60000)
      const kill = JSON.parse((killRes.stdout || '').trim() || '{}') as { familyLeft?: string | string[]; mainLeft?: string | string[]; error?: string }
      if (kill.error) return { host, status: 'fehler', message: 'Beenden fehlgeschlagen: ' + kill.error }
      const mainLeft = Array.isArray(kill.mainLeft) ? kill.mainLeft : (kill.mainLeft ? [kill.mainLeft] : [])
      if (mainLeft.length > 0) {
        step('CAD beenden', 'blocked')
        return { host, status: 'blockiert', message: `${mainLeft.join(', ')} ließ sich nicht beenden — Installation abgebrochen.` }
      }
      step('CAD beenden', 'ok')
    }

    // 2b. Vorab-Warnung an den Nutzer (Desktop-Nachricht), bevor los geht.
    step('Warnung senden', 'running')
    const warnUser = uninstall
      ? `msg * 'Achtung: In den naechsten Minuten wird der Grafiktreiber entfernt. Der Bildschirm kann kurz flackern; bitte KEIN SolidWorks oder HiCAD starten, bis der PC neu gestartet wurde.'`
      : `msg * 'Achtung: In den naechsten ca. ${INSTALL_ETA_MIN} Minuten wird ein neuer Grafiktreiber installiert. Bitte KEIN SolidWorks oder HiCAD starten, bis die Installation abgeschlossen ist.'`
    await api().runPowerShell(`Invoke-Command -ComputerName '${h}' -ErrorAction SilentlyContinue -ScriptBlock { ${warnUser} }`, 20000)

    // 3. Treiber auf \\host\c$\Temp kopieren (Freigabe -> Ziel, ohne base64)
    step('Kopieren', 'running')
    const base = await api().netGetBasePath()
    const sharePath = `${base}\\${PACKAGES_DIR.replace(/\//g, '\\')}\\${packageName}`
    const tempDir = `\\\\${h}\\c$\\Temp`
    const dst = `${tempDir}\\${packageName}`
    const copyScript = [
      `try {`,
      `  if (-not (Test-Path -LiteralPath '${q(tempDir)}')) { New-Item -ItemType Directory -Force -Path '${q(tempDir)}' | Out-Null }`,
      `  Copy-Item -LiteralPath '${q(sharePath)}' -Destination '${q(dst)}' -Force -ErrorAction Stop`,
      `  @{ ok=$true } | ConvertTo-Json -Compress`,
      `} catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }`,
    ].join('\n')
    const copyRes = await api().runPowerShell(copyScript, 600000)
    const copy = JSON.parse((copyRes.stdout || '').trim() || '{}') as { ok?: boolean; error?: string }
    if (!copy.ok) return { host, status: 'fehler', message: 'Kopieren fehlgeschlagen: ' + (copy.error || 'unbekannt (Adminrechte auf c$?)') }

    // 4. Stille Installation/Deinstallation (NVIDIA-Setup: -s -noreboot bzw. -uninstall -s -noreboot)
    step(uninstall ? 'Deinstallieren' : 'Installieren', 'running')
    const pkg = q(packageName)
    const argList = uninstall ? `'-uninstall','-s','-noreboot'` : `'-s','-noreboot'`
    const installScript = `try { Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock { $p = Start-Process -FilePath 'C:\\Temp\\${pkg}' -ArgumentList ${argList} -Wait -PassThru; $ver=''; try { $ver=([string]((Get-CimInstance Win32_VideoController | Where-Object { $_.Name -match 'nvidia|quadro|rtx' } | Select-Object -First 1).DriverVersion)) } catch {}; Remove-Item -LiteralPath 'C:\\Temp\\${pkg}' -Force -ErrorAction SilentlyContinue; @{ exit=[int]$p.ExitCode; ver=$ver } | ConvertTo-Json -Compress } } catch { @{ error=$_.Exception.Message } | ConvertTo-Json -Compress }`
    const insRes = await api().runPowerShell(installScript, 900000)
    const ins = JSON.parse((insRes.stdout || '').trim() || '{}') as { exit?: number; ver?: string; error?: string }
    if (ins.error) return { host, status: 'fehler', message: `${uninstall ? 'Deinstallation' : 'Installation'} fehlgeschlagen: ` + ins.error }
    const exitCode = Number(ins.exit)
    if (!(exitCode === 0 || exitCode === 1)) {
      return { host, status: 'fehler', message: `Installer-Exitcode ${exitCode} (0/1 = ok).`, newVersion: String(ins.ver || '') }
    }

    // 5. Neustart / Nachricht
    step('Abschluss', 'running')
    const doneMsg = uninstall
      ? 'Der Grafiktreiber wurde entfernt. Bitte den PC einmal neu starten; danach ggf. einen neuen Treiber installieren.'
      : 'Es wurde ein neuer Grafiktreiber installiert. Bitte den PC einmal neu starten, damit der neue Grafiktreiber aktiv wird.'
    if (opts.rebootMode === 'reboot') {
      await api().runPowerShell(`Invoke-Command -ComputerName '${h}' -ErrorAction SilentlyContinue -ScriptBlock { shutdown /r /t 120 /c 'Grafiktreiber ${verb} - der PC startet in 2 Minuten neu. Bitte Arbeit speichern.' }`, 20000)
    } else {
      await api().runPowerShell(`Invoke-Command -ComputerName '${h}' -ErrorAction SilentlyContinue -ScriptBlock { msg * '${q(doneMsg)}' }`, 20000)
    }

    if (uninstall) await markDriverUninstalled(host, { by: opts.by })
    else await markDriverInstalled(host, { version: opts.version || parseDriverVersion(packageName), by: opts.by, newVersion: String(ins.ver || ''), needsReboot: true })
    step('Abschluss', 'ok')
    return { host, status: uninstall ? 'deinstalliert' : 'installiert', message: `${uninstall ? 'Deinstalliert' : 'Installiert'}${opts.rebootMode === 'reboot' ? ' — Neustart in 2 Min. angestoßen' : ' — Nachricht an Nutzer gesendet'}.`, newVersion: String(ins.ver || ''), needsReboot: true }
  } catch (e) {
    return { host, status: 'fehler', message: e instanceof Error ? e.message : String(e) }
  }
}

/** Verteilt einen Treiber an mehrere Hosts (kleine Wellen — Installation ist schwer). */
export async function deployDriver(
  hosts: string[], packageName: string, opts: DeployOptions,
  onStep?: (s: DeployStep) => void, onResult?: (r: DeployResult) => void,
): Promise<DeployResult[]> {
  const uniq = Array.from(new Set(hosts.map(x => x.trim()).filter(Boolean)))
  const results: DeployResult[] = []
  const BATCH = 4
  for (let i = 0; i < uniq.length; i += BATCH) {
    const batch = uniq.slice(i, i + BATCH)
    const settled = await Promise.all(batch.map(async host => { const r = await deployToHost(host, packageName, opts, onStep); onResult?.(r); return r }))
    results.push(...settled)
  }
  return results
}
