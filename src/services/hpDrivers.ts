// ── Treiber-Installation (HP-Flotte) — Service ───────────────────────────────
// Die Flotte ist zu 100 % HP-Business-Hardware. „Was ist der neueste Treiber?"
// beantwortet HP selbst über die HP Client Management Script Library (HPCMSL):
// Get-SoftpaqList liefert live pro Modell (SysID) den aktuellen Treiber-/BIOS-/
// Firmware-Stand. Kein manueller Katalog — HP hält ihn aktuell.
//
// WO läuft was (Doppelhop!):
//   • Katalog-Abfrage + SoftPaq-Download  → AM ADMIN-PC (hat Internet zu hp.com).
//   • Installierte Treiber lesen           → am Ziel per WinRM (Invoke-Command).
//   • SoftPaq aufs Ziel bringen             → Copy-Item Admin-PC → \\host\c$\Temp.
//   • Stille Installation                   → Invoke-Command Start-Process am Ziel.
// (Muster übernommen aus gpuDrivers.ts / gpuDeployStore.ts.)
//
// Sicherheit: BIOS wird NIE automatisch angehakt (Opt-in + Bestätigung im UI);
// kritische Treiber (GPU/Audio/Netzwerk) sind orange und opt-in.

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'

const q = (s: string) => (s || '').replace(/'/g, '')

// ── Datenmodell ──────────────────────────────────────────────────────────────
export type DriverKlasse = 'bios' | 'firmware' | 'kritisch' | 'normal'
export type DriverStatus = 'veraltet' | 'aktuell' | 'verfuegbar' | 'unbekannt'

export interface InstalledDriver { name: string; klasse: string; version: string; provider: string }

export interface DriverItem {
  softpaqId: string        // 'sp149467'
  softpaqNumber: number    // 149467
  name: string             // z. B. "Intel HD Graphics Driver"
  category: string         // HP-Kategorie, z. B. "Driver - Graphics"
  klasse: DriverKlasse
  latestVersion: string
  releaseDate: string
  sizeMB: number
  installedVersion: string // best-effort zugeordnet, '' wenn unbekannt
  status: DriverStatus
}

export interface HpHostReport {
  hostname: string
  online: boolean
  sysId: string
  model: string
  osVer: string
  biosVersion: string
  loggedOnUser: string
  items: DriverItem[]
  error?: string
  scannedAt: string
}

interface RawSoftpaq { id: string; name: string; category: string; version: string; released: string; size: number }
interface RawScan {
  sysId?: string; model?: string; user?: string; build?: number; caption?: string
  bios?: string; gpu?: string
  drivers?: RawDriver[] | RawDriver; driversError?: string; error?: string
}
interface RawDriver { name?: string; class?: string; ver?: string; prov?: string }

// ── CMSL-Verfügbarkeit (Admin-PC) ────────────────────────────────────────────
export interface CmslStatus { ok: boolean; version: string; error?: string }

/** HPCMSL am Admin-PC sicherstellen. Vorhanden? sonst best-effort installieren. */
export async function ensureCmsl(autoInstall = true): Promise<CmslStatus> {
  const check = `try { $m = Get-Module -ListAvailable -Name HPCMSL | Sort-Object Version -Descending | Select-Object -First 1; if ($m) { @{ ok=$true; version=[string]$m.Version } | ConvertTo-Json -Compress } else { @{ ok=$false } | ConvertTo-Json -Compress } } catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }`
  try {
    const r = await api().runPowerShell(check, 30000)
    const j = JSON.parse((r.stdout || '').trim() || '{}') as { ok?: boolean; version?: string; error?: string }
    if (j.ok) return { ok: true, version: j.version || '' }
    if (!autoInstall) return { ok: false, version: '', error: 'HPCMSL nicht installiert.' }
    // Bootstrap (braucht Admin-PC-Internet zu PSGallery/hp.com). HPCMSL braucht PowerShellGet 2.x
    // (Modul-Format 2.0) und -AcceptLicense; das mit Windows PS 5.1 mitgelieferte PowerShellGet 1.0.0.1
    // kann HPCMSL NICHT installieren. Deshalb erst PowerShellGet 2.x sicherstellen, dann HPCMSL —
    // und -AcceptLicense nur nutzen, wenn der Befehl es kennt.
    const install = [
      `$env:Path = "$env:SystemRoot\\System32;$env:Path"`,
      `try {`,
      `  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12`,
      `  try { Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Scope CurrentUser -Force -ErrorAction SilentlyContinue | Out-Null } catch {}`,
      `  try { Set-PSRepository -Name PSGallery -InstallationPolicy Trusted -ErrorAction SilentlyContinue } catch {}`,
      `  if (-not (Get-Module -ListAvailable PowerShellGet | Where-Object { $_.Version.Major -ge 2 })) { try { Install-Module PowerShellGet -Scope CurrentUser -Force -AllowClobber -ErrorAction Stop } catch {} }`,
      `  try { Import-Module PowerShellGet -MinimumVersion 2.0.0 -Force -ErrorAction SilentlyContinue } catch {}`,
      `  $acc = (Get-Command Install-Module).Parameters.ContainsKey('AcceptLicense')`,
      `  if ($acc) { Install-Module -Name HPCMSL -Scope CurrentUser -Force -AcceptLicense -ErrorAction Stop }`,
      `  else { Install-Module -Name HPCMSL -Scope CurrentUser -Force -ErrorAction Stop }`,
      `  $m = Get-Module -ListAvailable -Name HPCMSL | Sort-Object Version -Descending | Select-Object -First 1`,
      `  @{ ok=($null -ne $m); version=[string]$m.Version } | ConvertTo-Json -Compress`,
      `} catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }`,
    ].join('\n')
    const ir = await api().runPowerShell(install, 300000)
    const ij = JSON.parse((ir.stdout || '').trim() || '{}') as { ok?: boolean; version?: string; error?: string }
    return ij.ok
      ? { ok: true, version: ij.version || '' }
      : { ok: false, version: '', error: ij.error || 'HPCMSL-Installation fehlgeschlagen (Internet/PSGallery am Admin-PC?).' }
  } catch (e) {
    return { ok: false, version: '', error: e instanceof Error ? e.message : String(e) }
  }
}

// ── OS-Build → CMSL OsVer ────────────────────────────────────────────────────
function osVerFromBuild(build: number): string {
  if (build >= 26100) return '24H2'
  if (build >= 22631) return '23H2'
  if (build >= 22621) return '22H2'
  if (build >= 22000) return '21H2'
  return '24H2'   // Fallback: neuester bekannter Stand
}

// ── Ziel-PC scannen (WinRM): SysID, OS, installierte Treiber, BIOS ────────────
function buildScanScript(hostname: string): string {
  const h = q(hostname)
  const inner = [
    `$out=@{}`,
    `try { $out.sysId=[string]((Get-CimInstance Win32_BaseBoard -EA Stop).Product) } catch {}`,
    `try { $cs=Get-CimInstance Win32_ComputerSystem -EA Stop; $out.model=[string]$cs.Model; $out.user=[string]$cs.UserName } catch {}`,
    `try { $os=Get-CimInstance Win32_OperatingSystem -EA Stop; $out.build=[int]$os.BuildNumber; $out.caption=[string]$os.Caption } catch {}`,
    `try { $out.bios=[string]((Get-CimInstance Win32_BIOS -EA Stop).SMBIOSBIOSVersion) } catch {}`,
    `try { $out.gpu=(@(Get-CimInstance Win32_VideoController -EA SilentlyContinue | ForEach-Object { $_.Name }) -join ', ') } catch {}`,
    // Nur echte Hardware-Treiber (kein Microsoft-Inbox), das reduziert die Nutzlast drastisch.
    `try { $out.drivers=@(Get-CimInstance Win32_PnPSignedDriver -EA Stop | Where-Object { $_.DriverVersion -and $_.DeviceName -and $_.DriverProviderName -and $_.DriverProviderName -notmatch 'Microsoft' } | ForEach-Object { @{ name=[string]$_.DeviceName; class=[string]$_.DeviceClass; ver=[string]$_.DriverVersion; prov=[string]$_.DriverProviderName } } | Sort-Object { $_.name } -Unique) } catch { $out.driversError=$_.Exception.Message }`,
    `$out | ConvertTo-Json -Compress -Depth 5`,
  ].join('; ')
  return `try { Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock { ${inner} } } catch { @{ error=$_.Exception.Message } | ConvertTo-Json -Compress }`
}

interface HostScan {
  online: boolean; sysId: string; model: string; osVer: string; biosVersion: string
  loggedOnUser: string; gpu: string; installed: InstalledDriver[]; error?: string
}

async function scanHost(host: string): Promise<HostScan> {
  const empty: HostScan = { online: false, sysId: '', model: '', osVer: '', biosVersion: '', loggedOnUser: '', gpu: '', installed: [] }
  if (!(await ensureWinRM(host))) return { ...empty, error: 'Nicht erreichbar (WinRM/offline).' }
  const r = await api().runPowerShell(buildScanScript(host), 60000)
  let p: RawScan = {}
  try { p = JSON.parse((r.stdout || '').trim() || '{}') as RawScan } catch { return { ...empty, error: 'Scan-Antwort unlesbar.' } }
  if (p.error) return { ...empty, error: p.error }
  const rawDrivers = Array.isArray(p.drivers) ? p.drivers : (p.drivers ? [p.drivers] : [])
  const installed: InstalledDriver[] = rawDrivers.map(d => ({
    name: String(d.name || ''), klasse: String(d.class || ''), version: String(d.ver || ''), provider: String(d.prov || ''),
  }))
  return {
    online: true,
    sysId: String(p.sysId || '').trim(),
    model: String(p.model || '').trim(),
    osVer: osVerFromBuild(Number(p.build) || 0),
    biosVersion: String(p.bios || '').trim(),
    loggedOnUser: String(p.user || '').trim(),
    gpu: String(p.gpu || ''),
    installed,
  }
}

// ── HP-Live-Katalog (Admin-PC, HPCMSL) — pro SysID/OsVer, gecacht ────────────
function catalogFile(sysId: string, osVer: string): string {
  return `hp-drivers/catalog_${sysId.toLowerCase()}_${osVer.toLowerCase()}.json`
}

async function fetchCatalog(sysId: string, osVer: string): Promise<{ list: RawSoftpaq[]; error?: string }> {
  const s = q(sysId)
  const script = [
    // HP-CMSL ruft intern `systeminfo | findstr` auf (OS-Bitness-Erkennung, HP.Private). Startet die
    // App in einer Umgebung ohne System32 im PATH, scheitert das mit „systeminfo nicht erkannt".
    // Abhilfe: System32 voranstellen UND -Bitness 64 vorgeben (überspringt den systeminfo-Aufruf ganz).
    `$env:Path = "$env:SystemRoot\\System32;$env:Path"`,
    `try {`,
    `  Import-Module HPCMSL -ErrorAction Stop`,
    `  $l = Get-SoftpaqList -Platform '${s}' -Os win11 -OsVer '${q(osVer)}' -Bitness 64 -Category BIOS,Driver,Firmware,Dock -ErrorAction Stop`,
    `  @($l | ForEach-Object { @{ id=[string]$_.Id; name=[string]$_.Name; category=[string]$_.Category; version=[string]$_.Version; released=[string]$_.ReleaseDate; size=$(try { [double]$_.Size } catch { 0 }) } }) | ConvertTo-Json -Depth 4`,
    `} catch { @{ error=$_.Exception.Message } | ConvertTo-Json -Compress }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 120000)
    const txt = (r.stdout || '').trim()
    const parsed = JSON.parse(txt || '[]') as RawSoftpaq[] | { error?: string }
    if (!Array.isArray(parsed)) return { list: [], error: (parsed as { error?: string }).error || 'Katalog-Abfrage leer.' }
    return { list: parsed }
  } catch (e) {
    return { list: [], error: e instanceof Error ? e.message : String(e) }
  }
}

/** Katalog holen (Cache je SysID/OsVer); refresh=true holt live neu und schreibt den Cache. */
export async function getCatalog(sysId: string, osVer: string, refresh = false): Promise<{ list: RawSoftpaq[]; error?: string; fromCache: boolean }> {
  if (!sysId) return { list: [], error: 'Keine SysID (Modell) ermittelt.', fromCache: false }
  if (!refresh) {
    try {
      const cached = await api().netReadJson<{ list: RawSoftpaq[] }>(catalogFile(sysId, osVer))
      if (cached && Array.isArray(cached.list) && cached.list.length) return { list: cached.list, fromCache: true }
    } catch { /* kein Cache -> live */ }
  }
  const live = await fetchCatalog(sysId, osVer)
  if (!live.error && live.list.length) {
    try { await api().netWriteJson(catalogFile(sysId, osVer), { list: live.list, fetchedAt: new Date().toISOString() }) } catch { /* ignore */ }
  }
  return { ...live, fromCache: false }
}

// ── Klassifizierung + Versionsvergleich ──────────────────────────────────────
const KRITISCH_RE = /graphics|grafik|video|display|audio|sound|network|netzwerk|wireless|wlan|\bwi-?fi\b|bluetooth|\blan\b|ethernet|realtek.*(audio|network)/i
const FIRMWARE_RE = /firmware|dock|thunderbolt/i

export function klassifiziere(category: string, name: string): DriverKlasse {
  const c = (category || '') + ' ' + (name || '')
  if (/^bios\b/i.test(category) || /\bbios\b/i.test(category)) return 'bios'
  if (FIRMWARE_RE.test(c)) return 'firmware'
  if (KRITISCH_RE.test(c)) return 'kritisch'
  return 'normal'
}

/** Numerischer Versionsvergleich (best effort). null = nicht vergleichbar. */
export function cmpVersion(a: string, b: string): number | null {
  const seg = (v: string) => (v.match(/\d+/g) || []).map(Number)
  const A = seg(a), B = seg(b)
  if (!A.length || !B.length) return null
  const n = Math.max(A.length, B.length)
  for (let i = 0; i < n; i++) {
    const x = A[i] ?? 0, y = B[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

// SoftPaq-Kategorie → Schlüsselwörter, um den installierten Treiber zuzuordnen.
const CATEGORY_KEYWORDS: [RegExp, RegExp][] = [
  [/graphics|video|display/i, /display|video|graphics|grafik/i],
  [/audio|sound/i, /audio|sound|realtek|conexant/i],
  [/network|ethernet|\blan\b/i, /net$|ethernet|network|realtek.*pcie/i],
  [/wireless|wlan|wi-?fi/i, /net$|wireless|wlan|wi-?fi|intel.*wi/i],
  [/bluetooth/i, /bluetooth/i],
  [/chipset/i, /system|chipset/i],
  [/storage|nvme|ssd/i, /storage|disk|nvme/i],
  [/keyboard|mouse|input/i, /keyboard|mouse|hidclass|input/i],
]

function matchInstalledVersion(item: { category: string; name: string }, installed: InstalledDriver[]): string {
  const kw = CATEGORY_KEYWORDS.find(([cat]) => cat.test(item.category))
  if (!kw) return ''
  const [, deviceRe] = kw
  const hit = installed.find(d => deviceRe.test(d.klasse) || deviceRe.test(d.name))
  return hit ? hit.version : ''
}

/** SoftPaq-Liste + installierte Treiber → bewertete Treiber-Items. */
export function evaluate(scan: HostScan, catalog: RawSoftpaq[]): DriverItem[] {
  return catalog.map(sp => {
    const klasse = klassifiziere(sp.category, sp.name)
    const num = Number((sp.id.match(/\d+/) || ['0'])[0])
    // Installierte Version: BIOS aus dem BIOS-Feld, sonst best-effort Zuordnung.
    const installedVersion = klasse === 'bios' ? scan.biosVersion : matchInstalledVersion(sp, scan.installed)
    let status: DriverStatus = 'verfuegbar'
    if (installedVersion) {
      const c = cmpVersion(installedVersion, sp.version)
      status = c === null ? 'unbekannt' : c < 0 ? 'veraltet' : 'aktuell'
    } else {
      status = 'verfuegbar'  // im HP-Katalog verfügbar, installierter Stand nicht sicher zuordenbar
    }
    return {
      softpaqId: sp.id.startsWith('sp') ? sp.id : `sp${sp.id}`,
      softpaqNumber: num,
      name: sp.name,
      category: sp.category,
      klasse,
      latestVersion: sp.version,
      releaseDate: sp.released,
      sizeMB: Math.round((sp.size || 0) / 1024 / 1024),
      installedVersion,
      status,
    }
  }).sort((a, b) => {
    const rank = (s: DriverStatus) => s === 'veraltet' ? 0 : s === 'verfuegbar' ? 1 : s === 'unbekannt' ? 2 : 3
    return rank(a.status) - rank(b.status) || a.name.localeCompare(b.name)
  })
}

// ── Orchestrierung Scan (Wellen zu 8) ────────────────────────────────────────
export async function scanHosts(
  hosts: string[],
  onProgress?: (done: number, total: number, host: string) => void,
): Promise<HpHostReport[]> {
  const uniq = Array.from(new Set(hosts.map(h => h.trim()).filter(Boolean)))
  const out: HpHostReport[] = []
  let done = 0
  const BATCH = 8
  for (let i = 0; i < uniq.length; i += BATCH) {
    const batch = uniq.slice(i, i + BATCH)
    const settled = await Promise.all(batch.map(async host => {
      const scannedAt = new Date().toISOString()
      const scan = await scanHost(host)
      if (!scan.online || scan.error) {
        done++; onProgress?.(done, uniq.length, host)
        return { hostname: host, online: scan.online, sysId: '', model: '', osVer: '', biosVersion: '', loggedOnUser: '', items: [], error: scan.error, scannedAt }
      }
      const cat = await getCatalog(scan.sysId, scan.osVer, false)
      const items = cat.error ? [] : evaluate(scan, cat.list)
      done++; onProgress?.(done, uniq.length, host)
      return {
        hostname: host, online: true, sysId: scan.sysId, model: scan.model, osVer: scan.osVer,
        biosVersion: scan.biosVersion, loggedOnUser: scan.loggedOnUser, items,
        error: cat.error ? `Katalog: ${cat.error}` : undefined, scannedAt,
      }
    }))
    out.push(...settled)
  }
  return out
}

// ══ Installation ══════════════════════════════════════════════════════════════
// Admin-PC lädt den SoftPaq (Get-Softpaq), kopiert ihn nach \\host\c$\Temp und
// startet ihn still am Ziel per Invoke-Command (Start-Process, wie GPU-Verteilung).
export type RebootMode = 'notify' | 'reboot'
export interface HpDeployOptions { rebootMode: RebootMode; by: string }
export interface HpDeployStep { host: string; phase: string; status: 'running' | 'ok' | 'error' }
export interface HpDeployResult {
  host: string
  status: 'installiert' | 'teilweise' | 'fehler'
  message: string
  perItem: { name: string; ok: boolean; info: string }[]
  needsReboot?: boolean
}

const REBOOT_EXITS = new Set([3010, 1641])
const OK_EXITS = new Set([0, 1, 3010, 1641])

// Reihenfolge: unkritisch zuerst, BIOS ganz zuletzt.
function installOrder(items: DriverItem[]): DriverItem[] {
  const rank = (k: DriverKlasse) => k === 'normal' ? 0 : k === 'kritisch' ? 1 : k === 'firmware' ? 2 : 3
  return [...items].sort((a, b) => rank(a.klasse) - rank(b.klasse))
}

async function installOne(host: string, item: DriverItem): Promise<{ ok: boolean; info: string; reboot: boolean }> {
  const h = q(host)
  const adminTmp = `$env:TEMP\\hpdrv`
  const localName = `${item.softpaqId}.exe`
  // 1) Am Admin-PC herunterladen (HPCMSL Get-Softpaq)
  const dlScript = [
    `$env:Path = "$env:SystemRoot\\System32;$env:Path"`,
    `try {`,
    `  Import-Module HPCMSL -ErrorAction Stop`,
    `  $dir = "${adminTmp}"; if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }`,
    `  $dst = Join-Path $dir '${localName}'`,
    `  Get-Softpaq -Number ${item.softpaqNumber} -SaveAs $dst -Overwrite yes -ErrorAction Stop | Out-Null`,
    `  @{ ok=$true; path=$dst } | ConvertTo-Json -Compress`,
    `} catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }`,
  ].join('\n')
  const dl = await api().runPowerShell(dlScript, 600000)
  const dlj = JSON.parse((dl.stdout || '').trim() || '{}') as { ok?: boolean; path?: string; error?: string }
  if (!dlj.ok || !dlj.path) return { ok: false, info: 'Download fehlgeschlagen: ' + (dlj.error || 'unbekannt'), reboot: false }

  // 2) Nach \\host\c$\Temp kopieren (Admin-PC hat Zugriff auf beide Seiten)
  const tempDir = `\\\\${h}\\c$\\Temp`
  const dst = `${tempDir}\\${localName}`
  const copyScript = [
    `try {`,
    `  if (-not (Test-Path -LiteralPath '${q(tempDir)}')) { New-Item -ItemType Directory -Force -Path '${q(tempDir)}' | Out-Null }`,
    `  Copy-Item -LiteralPath '${q(dlj.path)}' -Destination '${q(dst)}' -Force -ErrorAction Stop`,
    `  @{ ok=$true } | ConvertTo-Json -Compress`,
    `} catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }`,
  ].join('\n')
  const cp = await api().runPowerShell(copyScript, 600000)
  const cpj = JSON.parse((cp.stdout || '').trim() || '{}') as { ok?: boolean; error?: string }
  if (!cpj.ok) return { ok: false, info: 'Kopieren fehlgeschlagen: ' + (cpj.error || 'Adminrechte auf c$?'), reboot: false }

  // 3) Still installieren am Ziel (HP-SoftPaq: -s = silent extract+install)
  const insScript = `try { Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock { $p = Start-Process -FilePath 'C:\\Temp\\${q(localName)}' -ArgumentList '-s' -Wait -PassThru; Remove-Item -LiteralPath 'C:\\Temp\\${q(localName)}' -Force -ErrorAction SilentlyContinue; @{ exit=[int]$p.ExitCode } | ConvertTo-Json -Compress } } catch { @{ error=$_.Exception.Message } | ConvertTo-Json -Compress }`
  const ins = await api().runPowerShell(insScript, 900000)
  const insj = JSON.parse((ins.stdout || '').trim() || '{}') as { exit?: number; error?: string }
  if (insj.error) return { ok: false, info: 'Installation fehlgeschlagen: ' + insj.error, reboot: false }
  const code = Number(insj.exit)
  const reboot = REBOOT_EXITS.has(code)
  if (!OK_EXITS.has(code)) return { ok: false, info: `Installer-Exitcode ${code}.`, reboot }
  return { ok: true, info: `ok (Exit ${code}${reboot ? ', Neustart nötig' : ''})`, reboot }
}

async function deployToHost(
  host: string, items: DriverItem[], opts: HpDeployOptions, onStep?: (s: HpDeployStep) => void,
): Promise<HpDeployResult> {
  const h = q(host)
  const step = (phase: string, status: HpDeployStep['status']) => onStep?.({ host, phase, status })
  const perItem: HpDeployResult['perItem'] = []
  try {
    step('Erreichbarkeit', 'running')
    if (!(await ensureWinRM(host))) return { host, status: 'fehler', message: 'Nicht erreichbar (WinRM/offline).', perItem }

    // Warnung an angemeldeten Nutzer, wenn kritische Treiber dabei sind.
    const hatKritisch = items.some(i => i.klasse === 'kritisch' || i.klasse === 'firmware' || i.klasse === 'bios')
    if (hatKritisch) {
      step('Warnung senden', 'running')
      const warn = q('Achtung: In den naechsten Minuten werden Geraetetreiber aktualisiert. Bild/Ton/Netzwerk koennen kurz aussetzen. Bitte offene Arbeit speichern.')
      await api().runPowerShell(`Invoke-Command -ComputerName '${h}' -ErrorAction SilentlyContinue -ScriptBlock { msg * '${warn}' }`, 20000)
    }

    let anyReboot = false
    const ordered = installOrder(items)
    for (const item of ordered) {
      step(`${item.name}`, 'running')
      const r = await installOne(host, item)
      perItem.push({ name: item.name, ok: r.ok, info: r.info })
      if (r.reboot) anyReboot = true
      step(`${item.name}`, r.ok ? 'ok' : 'error')
    }

    const okCount = perItem.filter(p => p.ok).length
    const status: HpDeployResult['status'] = okCount === 0 ? 'fehler' : okCount === perItem.length ? 'installiert' : 'teilweise'

    // Abschluss: Neustart oder Nachricht
    step('Abschluss', 'running')
    if (opts.rebootMode === 'reboot' && okCount > 0) {
      await api().runPowerShell(`Invoke-Command -ComputerName '${h}' -ErrorAction SilentlyContinue -ScriptBlock { shutdown /r /t 120 /c 'Treiber aktualisiert - der PC startet in 2 Minuten neu. Bitte Arbeit speichern.' }`, 20000)
    } else if (okCount > 0) {
      const msg = anyReboot
        ? 'Treiber wurden aktualisiert. Bitte den PC bei Gelegenheit neu starten, damit alle neuen Treiber aktiv werden.'
        : 'Treiber wurden aktualisiert.'
      await api().runPowerShell(`Invoke-Command -ComputerName '${h}' -ErrorAction SilentlyContinue -ScriptBlock { msg * '${q(msg)}' }`, 20000)
    }
    step('Abschluss', 'ok')

    const msg = `${okCount}/${perItem.length} Treiber installiert${anyReboot ? ' — Neustart nötig' : ''}.`
    return { host, status, message: msg, perItem, needsReboot: anyReboot }
  } catch (e) {
    return { host, status: 'fehler', message: e instanceof Error ? e.message : String(e), perItem }
  }
}

/** Installiert die je Host gewählten Treiber (kleine Wellen — Installation ist schwer). */
export async function installDrivers(
  plan: { host: string; items: DriverItem[] }[], opts: HpDeployOptions,
  onStep?: (s: HpDeployStep) => void, onResult?: (r: HpDeployResult) => void,
): Promise<HpDeployResult[]> {
  const jobs = plan.filter(p => p.items.length)
  const results: HpDeployResult[] = []
  const BATCH = 4
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH)
    const settled = await Promise.all(batch.map(async j => { const r = await deployToHost(j.host, j.items, opts, onStep); onResult?.(r); return r }))
    results.push(...settled)
  }
  return results
}
