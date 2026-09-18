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
import { ensureWinRM, clearWinRMCache } from '../utils/winrmUtils'
import { logDeviceAction } from './deviceDossier'

const q = (s: string) => (s || '').replace(/'/g, '')

// WinRM ERNEUT aktivieren (nicht nur den Cache-Wert lesen). ensureWinRM cacht das
// Ergebnis für die ganze Session; nach einem zwischenzeitlichen WinRM-Ausfall am Ziel
// (idle-Abschaltung während langer Läufe) liefert es sonst weiter das alte „true".
// Deshalb Cache leeren und frisch prüfen/starten. Wird vor jeder Installation und
// periodisch als Keep-Alive genutzt, damit auch die LETZTEN Treiber noch durchlaufen.
async function reactivateWinRM(host: string): Promise<boolean> {
  clearWinRMCache(host)
  try { return await ensureWinRM(host) } catch { return false }
}

// PowerShell/HPCMSL schreibt gern deutsche WARNUNG:/VERBOSE-Zeilen in die Ausgabe, die
// vor dem JSON stehen (z. B. PowerShellGet-Formatwarnungen). Ein direktes JSON.parse
// scheitert dann mit „Unexpected token 'W'". Deshalb das erste {…}/[…] heraussuchen.
function looseParse<T>(stdout: string | undefined | null): T | null {
  const s = (stdout || '').trim()
  if (!s) return null
  const i = s.search(/[[{]/)
  const j = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'))
  const cand = (i >= 0 && j > i) ? s.slice(i, j + 1) : s
  try { return JSON.parse(cand) as T } catch { return null }
}

// ── Datenmodell ──────────────────────────────────────────────────────────────
export type DriverKlasse = 'bios' | 'firmware' | 'kritisch' | 'normal'
export type DriverStatus = 'veraltet' | 'aktuell' | 'verfuegbar' | 'unbekannt'

export interface InstalledDriver { name: string; klasse: string; version: string; provider: string; hwid: string; instanceId: string }

// Ein am Ziel vorhandenes PnP-Gerät mit seinen Hardware-IDs (spezifisch → generisch).
// Grundlage fürs Matching „passt dieser SoftPaq zu diesem Rechner?".
export interface PresentDevice { instanceId: string; klasse: string; hwids: string[] }

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
  // Hardware-ID-Matching (neu): ist dieser SoftPaq für DIESEN Rechner bestimmt?
  anwendbar: boolean          // eine Device-ID des SoftPaqs matcht vorhandene Hardware
  ohneHardwareBezug: boolean  // BIOS/Firmware/Software: kein [Devices]-Bezug (wie bisher behandeln)
  matchUnsicher: boolean      // nur über VEN (Hersteller) gematcht — nicht auto-wählen
  matchGrund: string          // welche Hardware-ID/Gerät gematcht hat (oder warum nicht)
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
  hardwareInventarFehlt?: boolean   // PnP-Inventar konnte nicht gelesen werden → ungefiltert
  error?: string
  scannedAt: string
  catalogAt?: string                // Abrufdatum des HP-Katalogs (ISO) für dieses Modell
  catalogStale?: boolean            // true = HP nicht erreichbar → veralteter Katalog verwendet
}

interface RawSoftpaq { id: string; name: string; category: string; version: string; released: string; size: number }
interface RawScan {
  sysId?: string; model?: string; user?: string; build?: number; caption?: string
  bios?: string; gpu?: string
  drivers?: RawDriver[] | RawDriver; driversError?: string; error?: string
  hardware?: RawHw[] | RawHw; hwError?: string
}
interface RawDriver { name?: string; class?: string; ver?: string; prov?: string; hwid?: string; devid?: string }
interface RawHw { id?: string; class?: string; hwids?: string[] | string }

// SoftPaq-Nummer → Device-IDs aus dem CVA-[Devices]-Abschnitt (Admin-PC, gecacht).
export type SoftpaqDeviceMap = Record<string, { ok: boolean; ids: string[] }>


// ── CMSL-Verfügbarkeit (Admin-PC) ────────────────────────────────────────────
export interface CmslStatus { ok: boolean; version: string; error?: string }

/** HPCMSL am Admin-PC sicherstellen. Vorhanden? sonst best-effort installieren. */
export async function ensureCmsl(autoInstall = true): Promise<CmslStatus> {
  const check = `$WarningPreference='SilentlyContinue'; try { $m = Get-Module -ListAvailable -Name HPCMSL | Sort-Object Version -Descending | Select-Object -First 1; if ($m) { @{ ok=$true; version=[string]$m.Version } | ConvertTo-Json -Compress } else { @{ ok=$false } | ConvertTo-Json -Compress } } catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }`
  try {
    const r = await api().runPowerShell(check, 30000)
    const j = looseParse<{ ok?: boolean; version?: string; error?: string }>(r.stdout) ?? {}
    if (j.ok) return { ok: true, version: j.version || '' }
    if (!autoInstall) return { ok: false, version: '', error: 'HPCMSL nicht installiert.' }
    // Bootstrap (braucht Admin-PC-Internet zu PSGallery/hp.com). HPCMSL braucht PowerShellGet 2.x
    // (Modul-Format 2.0) und -AcceptLicense; das mit Windows PS 5.1 mitgelieferte PowerShellGet 1.0.0.1
    // kann HPCMSL NICHT installieren. Deshalb erst PowerShellGet 2.x sicherstellen, dann HPCMSL —
    // und -AcceptLicense nur nutzen, wenn der Befehl es kennt.
    const install = [
      `$env:Path = "$env:SystemRoot\\System32;$env:Path"; $WarningPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'`,
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
    const ij = looseParse<{ ok?: boolean; version?: string; error?: string }>(ir.stdout) ?? {}
    return ij.ok
      ? { ok: true, version: ij.version || '' }
      : { ok: false, version: '', error: ij.error || 'HPCMSL-Installation fehlgeschlagen (Internet/PSGallery am Admin-PC?).' }
  } catch (e) {
    return { ok: false, version: '', error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * HP CMSL EINMALIG SYSTEMWEIT (AllUsers, Program Files) installieren — mit Adminrechten
 * (UAC). Danach ist es für JEDEN Windows-Nutzer des Admin-PCs verfügbar; niemand muss mehr
 * pro Profil installieren. Der Aufruf startet eine elevated PowerShell (Start-Process -Verb
 * RunAs); nach Abschluss prüft der (nicht-elevated) Prozess erneut per Get-Module — die
 * AllUsers-Installation liegt in Program Files und ist damit sofort sichtbar.
 */
export async function installCmslAllUsers(): Promise<CmslStatus> {
  // Inneres, elevated laufendes Skript: NuGet-Provider + PowerShellGet 2.x + HPCMSL AllUsers.
  const inner = [
    `$env:Path = "$env:SystemRoot\\System32;$env:Path"`,
    `$WarningPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'`,
    `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12`,
    `try { Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -ErrorAction SilentlyContinue | Out-Null } catch {}`,
    `try { if (-not (Get-PSRepository -Name PSGallery -ErrorAction SilentlyContinue)) { Register-PSRepository -Default -ErrorAction SilentlyContinue } } catch {}`,
    `try { Set-PSRepository -Name PSGallery -InstallationPolicy Trusted -ErrorAction SilentlyContinue } catch {}`,
    `if (-not (Get-Module -ListAvailable PowerShellGet | Where-Object { $_.Version.Major -ge 2 })) { try { Install-Module PowerShellGet -Force -AllowClobber -ErrorAction SilentlyContinue } catch {} }`,
    `try { Import-Module PowerShellGet -MinimumVersion 2.0.0 -Force -ErrorAction SilentlyContinue } catch {}`,
    `$acc = (Get-Command Install-Module).Parameters.ContainsKey('AcceptLicense')`,
    `try { if ($acc) { Install-Module -Name HPCMSL -Scope AllUsers -Force -AcceptLicense -ErrorAction Stop } else { Install-Module -Name HPCMSL -Scope AllUsers -Force -ErrorAction Stop } } catch {}`,
  ].join('; ')
  // Äußeres Skript: inneres base64-kodiert per RunAs (UAC) elevated ausführen, dann neu prüfen.
  const outer = [
    `$WarningPreference='SilentlyContinue'`,
    `$inner = @'`,
    inner,
    `'@`,
    `$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))`,
    `try {`,
    `  Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',$enc`,
    `} catch { @{ ok=$false; error=('Adminrechte verweigert oder UAC abgebrochen: ' + $_.Exception.Message) } | ConvertTo-Json -Compress; exit }`,
    `$m = Get-Module -ListAvailable -Name HPCMSL | Sort-Object Version -Descending | Select-Object -First 1`,
    `if ($m) { @{ ok=$true; version=[string]$m.Version } | ConvertTo-Json -Compress } else { @{ ok=$false; error='HP CMSL wurde nicht installiert (UAC abgelehnt oder kein Internet/PSGallery).' } | ConvertTo-Json -Compress }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(outer, 420000)
    const j = looseParse<{ ok?: boolean; version?: string; error?: string }>(r.stdout) ?? {}
    return j.ok ? { ok: true, version: j.version || '' } : { ok: false, version: '', error: j.error || 'Installation fehlgeschlagen.' }
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
    // Nur echte Hardware-Treiber (kein Microsoft-Inbox) — Grundlage für die installierte Version.
    // Jetzt inkl. HardWareID + DeviceID, damit die Version dem gematchten Gerät zugeordnet werden kann.
    `try { $out.drivers=@(Get-CimInstance Win32_PnPSignedDriver -EA Stop | Where-Object { $_.DriverVersion -and $_.DeviceName -and $_.DriverProviderName -and $_.DriverProviderName -notmatch 'Microsoft' } | ForEach-Object { @{ name=[string]$_.DeviceName; class=[string]$_.DeviceClass; ver=[string]$_.DriverVersion; prov=[string]$_.DriverProviderName; hwid=[string]$_.HardWareID; devid=[string]$_.DeviceID } } | Sort-Object { $_.name } -Unique) } catch { $out.driversError=$_.Exception.Message }`,
    // Vorhandene PnP-Geräte MIT Hardware-IDs (auch solche auf MS-Inbox-Treiber — eine frische
    // NVIDIA-GPU muss trotzdem den NVIDIA-SoftPaq matchen). HardwareID steht direkt am Objekt als
    // Liste (spezifisch → generisch) — KEIN Get-PnpDeviceProperty je Gerät nötig. Nur Geräte mit
    // echter Hardware-ID (PCI/USB/ACPI …), das filtert Root-/SWD-Pseudogeräte raus.
    `try { $out.hardware=@(Get-PnpDevice -PresentOnly -EA SilentlyContinue | Where-Object { $_.InstanceId -and @($_.HardwareID).Count -gt 0 } | ForEach-Object { @{ id=[string]$_.InstanceId; class=[string]$_.Class; hwids=@($_.HardwareID) } }) } catch { $out.hwError=$_.Exception.Message }`,
    `$out | ConvertTo-Json -Compress -Depth 6`,
  ].join('; ')
  return `try { Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock { ${inner} } } catch { @{ error=$_.Exception.Message } | ConvertTo-Json -Compress }`
}

interface HostScan {
  online: boolean; sysId: string; model: string; osVer: string; biosVersion: string
  loggedOnUser: string; gpu: string; installed: InstalledDriver[]
  hardware: PresentDevice[]; hardwareInventarFehlt: boolean; error?: string
}

async function scanHost(host: string): Promise<HostScan> {
  const empty: HostScan = { online: false, sysId: '', model: '', osVer: '', biosVersion: '', loggedOnUser: '', gpu: '', installed: [], hardware: [], hardwareInventarFehlt: true }
  // WICHTIG: reactivateWinRM (Cache leeren + neu prüfen/starten), NICHT das gecachte
  // ensureWinRM. Sonst liefert ein alter „true"-Cache (z. B. vom Install vor einem
  // Neustart des Ziel-PCs) weiter true, obwohl der WinRM-Dienst nach dem Reboot gar
  // nicht wieder lief → der Scan-Invoke-Command scheiterte mit WinRM-Verbindungsfehler,
  // während andere Menüpunkte (Daylis) den Dienst aktiv neu starten und funktionieren.
  if (!(await reactivateWinRM(host))) return { ...empty, error: 'Nicht erreichbar (WinRM/offline).' }
  const r = await api().runPowerShell(buildScanScript(host), 60000)
  const p = looseParse<RawScan>(r.stdout)
  if (!p) return { ...empty, error: 'Scan-Antwort unlesbar.' }
  if (p.error) return { ...empty, error: p.error }
  const rawDrivers = Array.isArray(p.drivers) ? p.drivers : (p.drivers ? [p.drivers] : [])
  const installed: InstalledDriver[] = rawDrivers.map(d => ({
    name: String(d.name || ''), klasse: String(d.class || ''), version: String(d.ver || ''), provider: String(d.prov || ''),
    hwid: String(d.hwid || ''), instanceId: String(d.devid || ''),
  }))
  const rawHw = Array.isArray(p.hardware) ? p.hardware : (p.hardware ? [p.hardware] : [])
  const hardware: PresentDevice[] = rawHw.map(d => ({
    instanceId: String(d.id || ''), klasse: String(d.class || ''),
    hwids: (Array.isArray(d.hwids) ? d.hwids : (d.hwids ? [d.hwids] : [])).map(x => String(x)).filter(Boolean),
  })).filter(d => d.hwids.length)
  return {
    online: true,
    sysId: String(p.sysId || '').trim(),
    model: String(p.model || '').trim(),
    osVer: osVerFromBuild(Number(p.build) || 0),
    biosVersion: String(p.bios || '').trim(),
    loggedOnUser: String(p.user || '').trim(),
    gpu: String(p.gpu || ''),
    installed,
    hardware,
    // Ohne PnP-Inventar können wir nicht filtern → Fallback (ungefiltert) mit Kennzeichnung.
    hardwareInventarFehlt: hardware.length === 0,
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
    `$env:Path = "$env:SystemRoot\\System32;$env:Path"; $WarningPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'; $VerbosePreference='SilentlyContinue'`,
    `try {`,
    `  Import-Module HPCMSL -ErrorAction Stop -WarningAction SilentlyContinue 3>$null 4>$null`,
    `  $l = Get-SoftpaqList -Platform '${s}' -Os win11 -OsVer '${q(osVer)}' -Bitness 64 -Category BIOS,Driver,Firmware,Dock -ErrorAction Stop -WarningAction SilentlyContinue 3>$null 4>$null`,
    `  @($l | ForEach-Object { @{ id=[string]$_.Id; name=[string]$_.Name; category=[string]$_.Category; version=[string]$_.Version; released=[string]$_.ReleaseDate; size=$(try { [double]$_.Size } catch { 0 }) } }) | ConvertTo-Json -Depth 4`,
    `} catch { @{ error=$_.Exception.Message } | ConvertTo-Json -Compress }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 120000)
    const parsed = looseParse<RawSoftpaq[] | { error?: string }>(r.stdout)
    if (!parsed) return { list: [], error: 'Katalog-Antwort unlesbar (keine gültige JSON-Ausgabe).' }
    if (!Array.isArray(parsed)) return { list: [], error: (parsed as { error?: string }).error || 'Katalog-Abfrage leer.' }
    return { list: parsed }
  } catch (e) {
    return { list: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// Katalog-Cache gilt so lange als „frisch"; danach zieht der nächste Scan automatisch live nach.
const CATALOG_TTL_DAYS = 14

/**
 * Katalog holen (Cache je SysID/OsVer). Nutzt den Cache, solange er jünger als CATALOG_TTL_DAYS ist;
 * sonst (oder bei refresh=true) live von HP nachziehen und den Cache aktualisieren. Ist HP dabei nicht
 * erreichbar, wird auf den vorhandenen (evtl. veralteten) Cache zurückgefallen (stale=true) statt zu leeren.
 */
export async function getCatalog(sysId: string, osVer: string, refresh = false): Promise<{ list: RawSoftpaq[]; error?: string; fromCache: boolean; fetchedAt?: string; stale?: boolean }> {
  if (!sysId) return { list: [], error: 'Keine SysID (Modell) ermittelt.', fromCache: false }
  // Vorhandenen Cache samt Abrufdatum lesen (auch als Fallback für einen fehlgeschlagenen Live-Abruf).
  let cached: { list: RawSoftpaq[]; fetchedAt?: string } | null = null
  try {
    const c = await api().netReadJson<{ list: RawSoftpaq[]; fetchedAt?: string }>(catalogFile(sysId, osVer))
    if (c && Array.isArray(c.list) && c.list.length) cached = c
  } catch { /* kein Cache */ }
  const ageMs = cached?.fetchedAt ? (Date.now() - new Date(cached.fetchedAt).getTime()) : Infinity
  const frisch = !!cached && ageMs < CATALOG_TTL_DAYS * 86400000
  if (!refresh && cached && frisch) return { list: cached.list, fromCache: true, fetchedAt: cached.fetchedAt }
  // stale oder erzwungen → live holen
  const live = await fetchCatalog(sysId, osVer)
  if (!live.error && live.list.length) {
    const fetchedAt = new Date().toISOString()
    try { await api().netWriteJson(catalogFile(sysId, osVer), { list: live.list, fetchedAt }) } catch { /* ignore */ }
    return { list: live.list, fromCache: false, fetchedAt }
  }
  // Live-Abruf fehlgeschlagen → auf (evtl. veralteten) Cache zurückfallen statt Fehler/leer.
  if (cached) return { list: cached.list, fromCache: true, fetchedAt: cached.fetchedAt, stale: true }
  return { list: [], error: live.error, fromCache: false }
}

// ── SoftPaq-[Devices] (Admin-PC, HPCMSL) — welche Hardware-IDs ein SoftPaq bedient ──
// Der CVA-[Devices]-Abschnitt listet die PnP-IDs (z. B. PCI\VEN_10DE&DEV_24B0&SUBSYS_…),
// für die der SoftPaq gedacht ist. Das ist die Gegenseite zum PnP-Inventar des Ziel-PCs.
// Wird je Modell (SysID/OsVer) EINMAL geholt und gecacht — 10 gleiche PCs kosten es nur einmal.
function devicesFile(sysId: string, osVer: string): string {
  return `hp-drivers/devices_${sysId.toLowerCase()}_${osVer.toLowerCase()}.json`
}

/** Für eine Liste SoftPaq-Nummern die Device-IDs aus den CVA-Metadaten am Admin-PC holen. */
async function fetchSoftpaqDevices(numbers: number[]): Promise<SoftpaqDeviceMap> {
  const nums = Array.from(new Set(numbers.filter(n => n > 0)))
  if (!nums.length) return {}
  const list = nums.join(',')
  // In EINEM PowerShell-Aufruf über alle Nummern iterieren (nicht je SoftPaq ein Prozessstart).
  // Get-SoftpaqMetadata (HPCMSL) liefert ein Hashtable; die Sektion ['Devices'] ist ein
  // Hashtable, dessen SCHLÜSSEL die PnP-IDs sind (z. B. 'PCI\VEN_10DE&DEV_1CBD') und dessen
  // WERTE die Klarnamen. Also die KEYS lesen, nicht die Values (an genau diesem Verwechsler
  // scheiterte die Filterung vorher → alles „ohne HW-Bezug"). Verifiziert an 8ABB/24H2:
  // NVIDIA-Treiber = 54 IDs VEN_10DE, Intel-Treiber = 34 IDs VEN_8086.
  const script = [
    `$env:Path = "$env:SystemRoot\\System32;$env:Path"; $WarningPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'; $VerbosePreference='SilentlyContinue'`,
    `$map=@{}`,
    `try { Import-Module HPCMSL -ErrorAction Stop -WarningAction SilentlyContinue 3>$null 4>$null } catch {}`,
    `foreach ($n in @(${list})) {`,
    `  try {`,
    `    $m = Get-SoftpaqMetadata -Number $n -ErrorAction Stop 3>$null 4>$null`,
    `    $ids = New-Object System.Collections.Generic.List[string]`,
    `    $dev = $null`,
    `    try { $dev = $m['Devices'] } catch {}`,
    `    if (-not $dev) { try { $dev = $m.Devices } catch {} }`,
    `    if ($dev) {`,
    `      $keys = $null`,
    `      try { $keys = @($dev.Keys) } catch {}`,
    `      if (-not $keys) { try { $keys = @($dev.GetEnumerator() | ForEach-Object { $_.Key }) } catch {} }`,
    `      foreach ($k in $keys) { $s = "$k".Trim(); if ($s -match '(VEN_|VID_)') { $ids.Add($s) } }`,
    `    }`,
    `    if ($ids.Count -eq 0) {`,
    `      $txt = "$m"`,
    `      if ($txt -match '(?s)\\[Devices\\](.*?)(\\r?\\n\\[|$)') {`,
    `        foreach ($ln in ($Matches[1] -split "\\r?\\n")) { if ($ln -match '^\\s*([^=]+?)\\s*=') { $key=$Matches[1].Trim(); if ($key -match '(VEN_|VID_)') { $ids.Add($key) } } }`,
    `      }`,
    `    }`,
    `    $map["$n"] = @{ ok=$true; ids=@($ids | Select-Object -Unique) }`,
    `  } catch { $map["$n"] = @{ ok=$false; ids=@() } }`,
    `}`,
    `$map | ConvertTo-Json -Depth 5 -Compress`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 300000)
    const parsed = looseParse<SoftpaqDeviceMap>(r.stdout)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch { return {} }
}

// Cache-Schema-Version: bei jeder Änderung der Extraktion HOCHZÄHLEN, damit alte
// (fehlerhafte) Device-Caches ignoriert und neu geholt werden. v1 las versehentlich die
// Klarnamen statt der PnP-IDs → alles leer/„ohne HW-Bezug".
const DEVICES_CACHE_VERSION = 2

/** Device-Map je Modell holen (Cache je SysID/OsVer); ergänzt fehlende Nummern live. */
export async function getSoftpaqDevices(
  sysId: string, osVer: string, numbers: number[], refresh = false,
): Promise<SoftpaqDeviceMap> {
  if (!sysId) return {}
  let cache: SoftpaqDeviceMap = {}
  if (!refresh) {
    try {
      const cached = await api().netReadJson<{ v?: number; map: SoftpaqDeviceMap }>(devicesFile(sysId, osVer))
      // Nur Cache mit passender Schema-Version verwenden (alte/fehlerhafte ignorieren).
      if (cached && cached.map && cached.v === DEVICES_CACHE_VERSION) cache = cached.map
    } catch { /* kein Cache */ }
  }
  // Nur Nummern nachladen, die noch nicht (erfolgreich) im Cache stehen.
  const fehlen = numbers.filter(n => n > 0 && !(cache[String(n)]?.ok))
  if (fehlen.length) {
    const frisch = await fetchSoftpaqDevices(fehlen)
    cache = { ...cache, ...frisch }
    try { await api().netWriteJson(devicesFile(sysId, osVer), { v: DEVICES_CACHE_VERSION, map: cache, fetchedAt: new Date().toISOString() }) } catch { /* ignore */ }
  }
  return cache
}

// ── Installations-Zustand je Host (für einen VERLÄSSLICHEN Nachscan) ──────────
// Problem: HP-Paketversion (SoftPaq) und Windows-Treiberversion sind verschiedene
// Nummernkreise → ein Versionsvergleich kann nach dem Installieren nicht sicher sagen
// „jetzt aktuell". Lösung: nach erfolgreicher Installation merken wir uns je PC, WELCHE
// SoftPaqs mit welcher HP-PAKETVERSION verteilt wurden. Beim nächsten Scan gilt ein
// SoftPaq als „aktuell", wenn seine aktuelle Katalog-Paketversion = die von uns
// installierte Paketversion ist (gleicher Nummernkreis → verlässlich). Damit zeigt der
// Nachscan die frisch installierten Treiber NICHT mehr als offen.
interface InstalledRec { version: string; installedAt: string }
type InstalledMap = Record<string, InstalledRec>   // softpaqId -> Datensatz

function installedFile(host: string): string {
  return `hp-drivers/installed_${host.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`
}
async function loadInstalled(host: string): Promise<InstalledMap> {
  try { const j = await api().netReadJson<{ map: InstalledMap }>(installedFile(host)); return (j && j.map) || {} } catch { return {} }
}
/** Erfolgreich installierte SoftPaqs (mit ihrer Katalog-Paketversion) je Host protokollieren. */
async function recordInstalledSoftpaqs(r: HpDeployResult): Promise<void> {
  try {
    const gut = r.ergebnisse.filter(e => e.verifiziert && e.sollVersion)
    if (!gut.length) return
    const map = await loadInstalled(r.host)
    const now = new Date().toISOString()
    for (const e of gut) map[e.softpaqId] = { version: e.sollVersion, installedAt: now }
    await api().netWriteJson(installedFile(r.host), { map, updatedAt: now })
  } catch { /* Protokoll ist best effort */ }
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

/**
 * Aus einem HP-BIOS-String die vergleichbare Versionsnummer ziehen. SMBIOSBIOSVersion trägt oft ein
 * Familien-Präfix („X83 Ver. 01.08.00"), das cmpVersion sonst als erste Zahl (83) läse und das BIOS
 * fälschlich für neuer als den Katalog hielte → es wurde als „aktuell" ausgeblendet. Wir nehmen die
 * Version NACH „Ver." bzw. die (letzte) punktierte Zahlengruppe.
 */
export function biosVersionClean(s: string): string {
  const t = (s || '').trim()
  let m = t.match(/ver\.?\s*([0-9][0-9.]*[0-9]|[0-9]+)/i)   // „… Ver. 01.09.03"
  if (m) return m[1]
  m = t.match(/([0-9]+(?:\.[0-9]+)+)\s*$/)                   // punktierte Version am Ende
  if (m) return m[1]
  m = t.match(/([0-9]+(?:\.[0-9]+)+)/)                       // irgendeine punktierte Version
  if (m) return m[1]
  return t
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

// Ergebnis des Hardware-ID-Matchings eines SoftPaqs gegen das PnP-Inventar des PCs.
interface MatchErgebnis { anwendbar: boolean; unsicher: boolean; grund: string; instanceId?: string }

/**
 * Matcht die Device-IDs eines SoftPaqs gegen die vorhandenen Hardware-IDs, stufenweise
 * spezifisch → generisch: 1) voller String inkl. SUBSYS, 2) VEN_xxxx&DEV_xxxx, 3) nur
 * VEN_xxxx (Fallback, als „unsicher" markiert). Match = eine Host-Hardware-ID ENTHÄLT die
 * (reduzierte) SoftPaq-Device-ID. So bleibt ein AMD-SoftPaq (VEN_1002) auf einem NVIDIA-PC
 * (VEN_10DE) außen vor, selbst im VEN-Fallback.
 */
function matchHardware(deviceIds: string[], hardware: PresentDevice[]): MatchErgebnis {
  if (!deviceIds.length) return { anwendbar: false, unsicher: false, grund: 'kein [Devices]-Abschnitt' }
  const hostHw = hardware.flatMap(d => d.hwids.map(h => ({ h: h.toUpperCase(), dev: d })))
  const geraet = (dev: PresentDevice) => `${dev.klasse || 'Gerät'} (${dev.instanceId.split('\\').slice(0, 2).join('\\')})`
  // Stufe 1: voller SoftPaq-String
  for (const sp of deviceIds) {
    const S = sp.toUpperCase()
    const hit = hostHw.find(x => x.h.includes(S))
    if (hit) return { anwendbar: true, unsicher: false, grund: `${sp} ↔ ${geraet(hit.dev)}`, instanceId: hit.dev.instanceId }
  }
  // Stufe 2: VEN&DEV
  for (const sp of deviceIds) {
    const m = sp.toUpperCase().match(/VEN_[0-9A-F]{4}&DEV_[0-9A-F]{4}/)
    if (!m) continue
    const hit = hostHw.find(x => x.h.includes(m[0]))
    if (hit) return { anwendbar: true, unsicher: false, grund: `${m[0]} ↔ ${geraet(hit.dev)}`, instanceId: hit.dev.instanceId }
  }
  // Stufe 3: nur VEN (unsicher — richtiger Hersteller, evtl. anderes Modell)
  for (const sp of deviceIds) {
    const m = sp.toUpperCase().match(/VEN_[0-9A-F]{4}/)
    if (!m) continue
    const hit = hostHw.find(x => x.h.includes(m[0]))
    if (hit) return { anwendbar: true, unsicher: true, grund: `nur Hersteller ${m[0]} ↔ ${geraet(hit.dev)} — unsicher`, instanceId: hit.dev.instanceId }
  }
  return { anwendbar: false, unsicher: false, grund: 'keine passende Hardware vorhanden' }
}

/** SoftPaq-Liste + installierte Treiber + Device-Map → bewertete Treiber-Items. */
export function evaluate(scan: HostScan, catalog: RawSoftpaq[], devices: SoftpaqDeviceMap = {}): DriverItem[] {
  const kannFiltern = !scan.hardwareInventarFehlt && scan.hardware.length > 0
  return catalog.map(sp => {
    const klasse = klassifiziere(sp.category, sp.name)
    const num = Number((sp.id.match(/\d+/) || ['0'])[0])
    const meta = devices[String(num)]

    // Anwendbarkeit bestimmen.
    let anwendbar = true, ohneHardwareBezug = false, matchUnsicher = false, matchGrund = ''
    let matchInstanceId: string | undefined
    if (!kannFiltern) {
      // Kein PnP-Inventar → nicht filterbar, wie bisher (ungefiltert), klar gekennzeichnet.
      matchGrund = 'Hardware-Inventar fehlt – ungefiltert'
    } else if (klasse === 'bios' || klasse === 'firmware') {
      ohneHardwareBezug = true; matchGrund = 'BIOS/Firmware – kein Hardware-Bezug'
    } else if (!meta) {
      ohneHardwareBezug = true; matchGrund = 'keine Metadaten geladen'
    } else if (!meta.ok) {
      ohneHardwareBezug = true; matchGrund = 'Metadaten nicht verfügbar'
    } else if (!meta.ids.length) {
      ohneHardwareBezug = true; matchGrund = 'Software/Utility – kein [Devices]-Abschnitt'
    } else {
      const m = matchHardware(meta.ids, scan.hardware)
      anwendbar = m.anwendbar; matchUnsicher = m.unsicher; matchGrund = m.grund; matchInstanceId = m.instanceId
    }

    // Installierte Version: BIOS aus BIOS-Feld; sonst bevorzugt vom gematchten Gerät, sonst Heuristik.
    let installedVersion = ''
    if (klasse === 'bios') {
      installedVersion = scan.biosVersion
    } else {
      if (matchInstanceId) {
        const inst = scan.installed.find(d => d.instanceId && d.instanceId.toUpperCase() === matchInstanceId!.toUpperCase())
        if (inst) installedVersion = inst.version
      }
      if (!installedVersion) installedVersion = matchInstalledVersion(sp, scan.installed)
    }

    let status: DriverStatus
    if (installedVersion) {
      // BIOS: Familien-Präfix aus dem SMBIOS-String herausrechnen, sonst „01.08.00" vs „01.09.03"
      //       vergleichen (nicht „X83…" gegen die Katalogversion) — sonst wird das BIOS nie als veraltet erkannt.
      const inst = klasse === 'bios' ? biosVersionClean(installedVersion) : installedVersion
      const soll = klasse === 'bios' ? biosVersionClean(sp.version) : sp.version
      const c = cmpVersion(inst, soll)
      // Bei BIOS im Zweifel (nicht vergleichbar) NICHT „aktuell" (das würde es ausblenden), sondern verfügbar zeigen.
      status = c === null ? (klasse === 'bios' ? 'verfuegbar' : 'unbekannt') : c < 0 ? 'veraltet' : 'aktuell'
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
      anwendbar, ohneHardwareBezug, matchUnsicher, matchGrund,
    }
  }).sort((a, b) => {
    // Reihenfolge: anwendbare Updates zuerst, Nicht-anwendbare ganz nach unten.
    const rank = (it: DriverItem) => {
      if (!it.anwendbar && !it.ohneHardwareBezug) return 5   // Nicht anwendbar – Hardware fehlt
      if (it.status === 'veraltet') return 0
      if (it.status === 'verfuegbar') return 1
      if (it.status === 'unbekannt') return 2
      if (it.ohneHardwareBezug) return 3
      return 4                                               // aktuell
    }
    return rank(a) - rank(b) || a.name.localeCompare(b.name)
  })
}

// ── Einen Host scannen + bewerten (WinRM-Scan → Katalog → Device-Map → evaluate) ──
// Ausgelagert, damit die Nachprüfung nach der Installation exakt denselben Weg nimmt.
export async function scanOneHost(host: string, refreshCatalog = false): Promise<HpHostReport> {
  const scannedAt = new Date().toISOString()
  const scan = await scanHost(host)
  if (!scan.online || scan.error) {
    return { hostname: host, online: scan.online, sysId: '', model: '', osVer: '', biosVersion: '', loggedOnUser: '', items: [], error: scan.error, scannedAt }
  }
  const cat = await getCatalog(scan.sysId, scan.osVer, refreshCatalog)
  // Device-Metadaten NUR für Treiber-SoftPaqs (nicht BIOS/Firmware) holen und cachen —
  // aber nur, wenn wir überhaupt filtern können (PnP-Inventar vorhanden).
  let devMap: SoftpaqDeviceMap = {}
  if (!cat.error && !scan.hardwareInventarFehlt) {
    const treiberNummern = cat.list
      .filter(sp => { const k = klassifiziere(sp.category, sp.name); return k === 'normal' || k === 'kritisch' })
      .map(sp => Number((sp.id.match(/\d+/) || ['0'])[0]))
    try { devMap = await getSoftpaqDevices(scan.sysId, scan.osVer, treiberNummern, false) } catch { devMap = {} }
  }
  let items = cat.error ? [] : evaluate(scan, cat.list, devMap)
  // Nachscan-Verlässlichkeit: SoftPaqs, die wir bereits in ihrer AKTUELLEN Katalogversion
  // verteilt haben, gelten als „aktuell" (unabhängig vom Treiberversions-Nummernkreis).
  // So zeigt ein erneuter Scan die frisch installierten Treiber nicht mehr als offen.
  if (items.length) {
    const installed = await loadInstalled(host)
    if (Object.keys(installed).length) {
      items = items.map(it => {
        const rec = installed[it.softpaqId]
        if (rec && rec.version && rec.version === it.latestVersion && it.status !== 'aktuell') {
          let wann = ''
          try { wann = new Date(rec.installedAt).toLocaleDateString('de-DE') } catch { /* egal */ }
          return { ...it, status: 'aktuell' as DriverStatus, matchGrund: it.matchGrund || (wann ? `bereits verteilt am ${wann}` : 'bereits verteilt') }
        }
        return it
      })
    }
  }
  return {
    hostname: host, online: true, sysId: scan.sysId, model: scan.model, osVer: scan.osVer,
    biosVersion: scan.biosVersion, loggedOnUser: scan.loggedOnUser, items,
    hardwareInventarFehlt: scan.hardwareInventarFehlt,
    error: cat.error ? `Katalog: ${cat.error}` : undefined, scannedAt,
    catalogAt: cat.fetchedAt, catalogStale: cat.stale,
  }
}

// ── Orchestrierung Scan (Wellen zu 8) ────────────────────────────────────────
export async function scanHosts(
  hosts: string[],
  onProgress?: (done: number, total: number, host: string) => void,
  refreshCatalog = false,
): Promise<HpHostReport[]> {
  const uniq = Array.from(new Set(hosts.map(h => h.trim()).filter(Boolean)))
  const out: HpHostReport[] = []
  let done = 0
  const BATCH = 8
  for (let i = 0; i < uniq.length; i += BATCH) {
    const batch = uniq.slice(i, i + BATCH)
    const settled = await Promise.all(batch.map(async host => {
      const rep = await scanOneHost(host, refreshCatalog)
      done++; onProgress?.(done, uniq.length, host)
      return rep
    }))
    out.push(...settled)
  }
  return out
}

// ══ Installation ══════════════════════════════════════════════════════════════
// Admin-PC lädt den SoftPaq (Get-Softpaq), kopiert ihn nach \\host\c$\Temp und
// startet ihn still am Ziel per Invoke-Command (Start-Process, wie GPU-Verteilung).
export type RebootMode = 'notify' | 'reboot'
export interface HpDeployOptions { rebootMode: RebootMode; by: string; notifyUser?: boolean }
export interface HpDeployStep { host: string; phase: string; status: 'running' | 'ok' | 'error' }

// Ein je Treiber nachgeprüftes Ergebnis (nach Installation + Nachscan + ggf. Wiederholung).
export interface HpDriverErgebnis {
  name: string
  softpaqId: string
  category: string
  klasse: DriverKlasse
  sollVersion: string        // neueste laut HP
  vorher: string             // installiert VOR der Aktion
  nachher: string            // installiert NACH Nachscan
  verifiziert: boolean       // Installation bestätigt (aktuell / Version gestiegen / Neustart nötig)
  neustartNoetig: boolean
  versuche: number
  info: string
}

export interface HpDeployResult {
  host: string
  status: 'installiert' | 'teilweise' | 'fehler'
  message: string
  perItem: { name: string; ok: boolean; info: string }[]
  ergebnisse: HpDriverErgebnis[]        // nachgeprüfte Übersicht (für Anzeige/PDF/Notiz)
  needsReboot?: boolean
  verifyMoeglich: boolean               // false, wenn der Nachscan nicht gelang
  ranAt: string                         // ISO-Zeit des Abschlusses
}

const REBOOT_EXITS = new Set([3010, 1641])
const OK_EXITS = new Set([0, 1, 3010, 1641])

// Zeitbudgets Installation: hängt ein Installer OHNE Fortschritt, wird er abgebrochen und der
// NÄCHSTE Treiber drankommt. Große Treiber (Grafik/Audio/Netzwerk = „kritisch") und BIOS haben
// aber Phasen mit wenig CPU (INF-Install, Geräte-Neustart) → großzügigere Fenster, damit sie
// nicht fälschlich als „hängt" gekillt werden. Ein Stall/Timeout wird NICHT wiederholt (retriable=false),
// kostet also je Treiber nur einmal Zeit.
const INSTALL_HARDMAX_S = 300    // normaler Treiber: harte Obergrenze je Versuch (Sekunden)
const INSTALL_STALL_S = 120      // normaler Treiber: so lange KEIN Fortschritt → abbrechen
const KRIT_HARDMAX_S = 480       // Grafik/Audio/Netzwerk: größer + langsamer
const KRIT_STALL_S = 210
const BIOS_HARDMAX_S = 480       // BIOS vorsichtiger (Flash-Vorbereitung, nicht hart abwürgen)
const BIOS_STALL_S = 240
const FW_DEADLINE_MS = 5 * 60 * 1000   // Firmware-Task: harte Obergrenze
const FW_STALL_MS = 90 * 1000          // Firmware-Task: so lange KEIN CPU-Fortschritt → abbrechen
const MAX_VERSUCHE = 3           // je Treiber höchstens so viele Versuche, dann weiter zum nächsten

// Reihenfolge: unkritisch zuerst, BIOS ganz zuletzt.
function installOrder(items: DriverItem[]): DriverItem[] {
  const rank = (k: DriverKlasse) => k === 'normal' ? 0 : k === 'kritisch' ? 1 : k === 'firmware' ? 2 : 3
  return [...items].sort((a, b) => rank(a.klasse) - rank(b.klasse))
}

// Firmware interaktiv installieren: der HP-Firmware-Installer (HPUP.exe) ist GUI-getrieben und
// hängt in Session 0 (WinRM). Deshalb per geplanter Aufgabe in der SITZUNG des angemeldeten
// Benutzers starten — Interactive + Highest = interaktiv UND elevated (Muster wie SolidWorks-
// Install). Firmware wird meist gestaged und flasht beim nächsten NEUSTART → Erfolg = „Neustart nötig".
// Voraussetzung: ein Benutzer ist am Ziel angemeldet (sonst NOUSER). Die Exe liegt schon in C:\Temp.
async function installFirmwareViaTask(host: string, exeName: string): Promise<{ ok: boolean; info: string; reboot: boolean }> {
  const h = q(host)
  const tn = `HPDrvFW_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const start = [
    `try { Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock {`,
    `  param($exe,$tn)`,
    `  $u = (Get-CimInstance Win32_ComputerSystem).UserName`,
    `  if (-not $u) { 'NOUSER'; return }`,
    `  $action = New-ScheduledTaskAction -Execute ('C:\\Temp\\'+$exe) -Argument '-s'`,
    `  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20)`,
    `  $principal = New-ScheduledTaskPrincipal -UserId $u -RunLevel Highest -LogonType Interactive`,
    `  Register-ScheduledTask -TaskName $tn -Action $action -Principal $principal -Settings $settings -Force | Out-Null`,
    `  Start-ScheduledTask -TaskName $tn`,
    `  'STARTED:'+$u`,
    `} -ArgumentList '${q(exeName)}','${tn}' } catch { 'ERR:'+$_.Exception.Message }`,
  ].join('\n')
  const sr = await api().runPowerShell(start, 60000)
  const so = (sr.stdout || '').trim()
  if (so.includes('NOUSER')) return { ok: false, info: 'Kein Benutzer am Ziel angemeldet — Firmware braucht eine interaktive Sitzung (jemand muss angemeldet sein).', reboot: false }
  if (!so.includes('STARTED')) return { ok: false, info: 'Interaktive Aufgabe nicht startbar: ' + (so.replace(/^ERR:/, '') || 'unbekannt'), reboot: false }

  // Pollen: Task-Status UND CPU-Zeit der Firmware-Installer-Prozesse (Fortschrittssignal).
  // Hängt die GUI in der Benutzersitzung ohne CPU-Fortschritt → NICHT 15 Min warten, sondern
  // nach FW_STALL_MS abbrechen und weitermachen (harte Obergrenze FW_DEADLINE_MS).
  // CPU-Summe robust via Measure-Object (kein `+=`-Scoping-Fallstrick in ForEach-Object).
  const procFilter = `($_.ExecutablePath -like 'C:\\Temp\\*') -or ($_.ExecutablePath -like 'C:\\swsetup\\*') -or ($_.ExecutablePath -like 'C:\\SWSETUP\\*') -or ($_.Name -match 'HPFI|HPUP|HPBIOS|Firmware|Thunderbolt|^sp[0-9]')`
  const poll = `try { Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock { param($tn)`
    + ` $t=Get-ScheduledTask -TaskName $tn -ErrorAction SilentlyContinue;`
    + ` $st= if ($t) { $t.State } else { 'GONE' };`
    + ` $lr= if ($t) { [string]((Get-ScheduledTaskInfo -TaskName $tn -ErrorAction SilentlyContinue).LastTaskResult) } else { '' };`
    + ` $cpu=0.0; try { $s=(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { ${procFilter} } | ForEach-Object { [double]$_.KernelModeTime + [double]$_.UserModeTime } | Measure-Object -Sum).Sum; if ($s) { $cpu=[double]$s } } catch {};`
    + ` 'STATE:'+$st+'|LTR:'+$lr+'|CPU:'+([string]$cpu) } -ArgumentList '${tn}' } catch { 'ERR' }`
  const deadline = Date.now() + FW_DEADLINE_MS
  let state = 'Running'; let ltr = Number.NaN; let lastCpu = -1; let stallSince = 0; let hung = false
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 10000))
    const pr = await api().runPowerShell(poll, 30000)
    const po = (pr.stdout || '').trim()
    if (po.includes('GONE')) { state = 'Ready'; break }
    const m = po.match(/STATE:(\w+)\|LTR:(-?\d*)\|CPU:([\d.eE+]+)/)
    if (!m) continue
    state = m[1]; ltr = m[2] === '' ? Number.NaN : Number(m[2])
    if (state !== 'Running') break
    const cpu = Number(m[3])
    if (Number.isFinite(cpu) && cpu > lastCpu + 1) { lastCpu = cpu; stallSince = 0 }   // Fortschritt
    else { if (!stallSince) stallSince = Date.now(); else if (Date.now() - stallSince >= FW_STALL_MS) { hung = true; break } }
  }
  // Aufräumen: laufende Aufgabe stoppen + Firmware-Prozesse beenden + Aufgabe/Exe entfernen.
  const cleanup = `try { Invoke-Command -ComputerName '${h}' -ErrorAction SilentlyContinue -ScriptBlock { param($tn,$exe)`
    + ` Stop-ScheduledTask -TaskName $tn -ErrorAction SilentlyContinue;`
    + ` try { Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { ${procFilter} } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } } catch {};`
    + ` Unregister-ScheduledTask -TaskName $tn -Confirm:$false -ErrorAction SilentlyContinue;`
    + ` Remove-Item ('C:\\Temp\\'+$exe) -Force -ErrorAction SilentlyContinue } -ArgumentList '${tn}','${q(exeName)}' } catch {}`
  await api().runPowerShell(cleanup, 30000)

  if (hung) return { ok: false, info: 'Firmware-Installer ohne Fortschritt (~90 s) — abgebrochen und übersprungen (evtl. bereits gestaged; beim Neustart prüfen).', reboot: false }
  if (state === 'Running') return { ok: false, info: `Zeitüberschreitung (${Math.round(FW_DEADLINE_MS / 60000)} Min) — Firmware-Installer hängt, übersprungen.`, reboot: false }
  if (OK_EXITS.has(ltr)) return { ok: true, info: `interaktiv installiert (Code ${ltr}) — Neustart zum Flashen nötig`, reboot: true }
  if (!Number.isFinite(ltr)) return { ok: false, info: 'Interaktiver Firmware-Installer: kein Rückgabecode ermittelbar.', reboot: false }
  return { ok: false, info: `Firmware-Installer meldete Code ${ltr} (evtl. bereits aktuell / nicht anwendbar / Neustart erforderlich).`, reboot: false }
}

async function installOne(host: string, item: DriverItem): Promise<{ ok: boolean; info: string; reboot: boolean; retriable?: boolean }> {
  const h = q(host)
  const adminTmp = `$env:TEMP\\hpdrv`
  const localName = `${item.softpaqId}.exe`
  // 1) Am Admin-PC herunterladen (HPCMSL Get-Softpaq)
  const dlScript = [
    `$env:Path = "$env:SystemRoot\\System32;$env:Path"; $WarningPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'`,
    `try {`,
    `  Import-Module HPCMSL -ErrorAction Stop -WarningAction SilentlyContinue 3>$null 4>$null`,
    `  $dir = "${adminTmp}"; if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }`,
    `  $dst = Join-Path $dir '${localName}'`,
    `  Get-Softpaq -Number ${item.softpaqNumber} -SaveAs $dst -Overwrite yes -ErrorAction Stop | Out-Null`,
    `  @{ ok=$true; path=$dst } | ConvertTo-Json -Compress`,
    `} catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }`,
  ].join('\n')
  const dl = await api().runPowerShell(dlScript, 600000)
  const dlj = looseParse<{ ok?: boolean; path?: string; error?: string }>(dl.stdout) ?? {}
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
  const cpj = looseParse<{ ok?: boolean; error?: string }>(cp.stdout) ?? {}
  if (!cpj.ok) return { ok: false, info: 'Kopieren fehlgeschlagen: ' + (cpj.error || 'Adminrechte auf c$?'), reboot: false }

  // WinRM UNMITTELBAR vor der Installation neu aktivieren: Download (bis zu 10 Min am
  // Admin-PC) + Kopieren lassen das Ziel-WinRM idle laufen — es kann in der Zeit
  // abgeschaltet worden sein. Sonst schlägt gerade bei vielen Treibern die letzte
  // Installation fehl. Ein Fehlschlag hier bricht NUR diesen Treiber ab (Schleife läuft weiter).
  if (!(await reactivateWinRM(host))) return { ok: false, info: 'WinRM vor der Installation nicht aktiv (Neuaktivierung fehlgeschlagen).', reboot: false }

  // Firmware: NICHT still in Session 0 (HPUP.exe hängt dort), sondern interaktiv in der
  // Sitzung des angemeldeten Benutzers (geplante Aufgabe). Flasht meist beim Neustart.
  if (item.klasse === 'firmware') return await installFirmwareViaTask(host, localName)

  // 3) Am Ziel installieren UND ÜBERWACHEN (HP-SoftPaq: -s = silent extract+install).
  //    Statt stur bis 15 Min zu warten: Prozess starten (-PassThru, KEIN -Wait) und alle 10 s
  //    prüfen, ob er noch arbeitet (CPU-Zuwachs ODER Kindprozesse). Kein Fortschritt für
  //    `stall` s → abbrechen und weiter zum nächsten Treiber. Harte Obergrenze `hardMax`.
  const hardMax = item.klasse === 'bios' ? BIOS_HARDMAX_S : item.klasse === 'kritisch' ? KRIT_HARDMAX_S : INSTALL_HARDMAX_S
  const stall = item.klasse === 'bios' ? BIOS_STALL_S : item.klasse === 'kritisch' ? KRIT_STALL_S : INSTALL_STALL_S
  const insInner = [
    `param($exe,$hardMax,$stall)`,
    // System32/Wbem/PowerShell in den PATH der Remote-Session voranstellen. Ohne das scheitern viele
    // HP-/Intel-Silent-Installer (Chipset/ME/Power) mit Exit 9009 „Befehl nicht gefunden", weil ihr
    // innerer Setup cmd/reg/msiexec/systeminfo ohne vollen Pfad aufruft (gleiche Ursache wie beim Katalog).
    `$env:Path = "$env:SystemRoot\\System32;$env:SystemRoot\\System32\\Wbem;$env:SystemRoot\\System32\\WindowsPowerShell\\v1.0;$env:SystemRoot\\SysWOW64;$env:Path"`,
    `$path='C:\\Temp\\'+$exe`,
    `try { $p=Start-Process -FilePath $path -ArgumentList '-s' -PassThru -ErrorAction Stop } catch { Remove-Item -LiteralPath $path -Force -EA SilentlyContinue; return (@{status='launch-failed';error=$_.Exception.Message}|ConvertTo-Json -Compress) }`,
    `$deadline=(Get-Date).AddSeconds($hardMax); $lastCpu=-1.0; $stallStart=$null; $status='running'`,
    `while((Get-Date) -lt $deadline){`,
    `  Start-Sleep -Seconds 10`,
    `  try{$p.Refresh()}catch{}`,
    `  if($p.HasExited){$status='exited';break}`,
    `  $cpu=0.0; try{$cpu=[double]$p.TotalProcessorTime.TotalSeconds}catch{}`,
    `  try{ foreach($c in @(Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$p.Id) -EA SilentlyContinue)){ $cpu += ([double]$c.KernelModeTime + [double]$c.UserModeTime)/1e7 } }catch{}`,
    `  if($cpu -gt ($lastCpu+0.5)){$lastCpu=$cpu; $stallStart=$null}`,   // Fortschritt = CPU-Zeit (Eltern+Kinder) waechst
    `  else{ if($null -eq $stallStart){$stallStart=Get-Date} elseif((((Get-Date)-$stallStart).TotalSeconds) -ge $stall){$status='stalled';break} }`,
    `}`,
    `if($status -eq 'running'){$status='timeout'}`,
    `if($status -eq 'stalled' -or $status -eq 'timeout'){ try{Get-CimInstance Win32_Process -Filter ('ParentProcessId='+$p.Id) -EA SilentlyContinue|ForEach-Object{Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue}}catch{}; try{Stop-Process -Id $p.Id -Force -EA SilentlyContinue}catch{} }`,
    `$exit=$null; if($p.HasExited){try{$exit=[int]$p.ExitCode}catch{}}`,
    `Remove-Item -LiteralPath $path -Force -EA SilentlyContinue`,
    `@{status=$status;exit=$exit}|ConvertTo-Json -Compress`,
  ].join('\n')
  const insScript = `try { Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock { ${insInner} } -ArgumentList '${q(localName)}',${hardMax},${stall} } catch { @{status='remote-error';error=$_.Exception.Message}|ConvertTo-Json -Compress }`
  const ins = await api().runPowerShell(insScript, (hardMax + 60) * 1000)
  if (ins.timedOut) return { ok: false, info: `Zeitüberschreitung (~${Math.round(hardMax / 60)} Min) — Installer abgebrochen.`, reboot: false, retriable: false }
  const insj = looseParse<{ status?: string; exit?: number | null; error?: string }>(ins.stdout) ?? {}
  const st = insj.status || ''
  if (st === 'launch-failed' || st === 'remote-error') return { ok: false, info: 'Installer-Start fehlgeschlagen: ' + (insj.error || 'unbekannt'), reboot: false, retriable: true }
  if (st === 'stalled') return { ok: false, info: `Kein Fortschritt (~${stall}s) — Installer hängt, übersprungen.`, reboot: false, retriable: false }
  if (st === 'timeout') return { ok: false, info: `Zeitüberschreitung (${Math.round(hardMax / 60)} Min) — Installer abgebrochen.`, reboot: false, retriable: false }
  // status === 'exited'
  const code = Number(insj.exit)
  if (!Number.isFinite(code)) return { ok: false, info: 'Installer ohne Rückgabecode beendet (evtl. abgebrochen).', reboot: false, retriable: true }
  const reboot = REBOOT_EXITS.has(code)
  if (!OK_EXITS.has(code)) return { ok: false, info: `Installer-Exitcode ${code}.`, reboot, retriable: true }
  return { ok: true, info: `ok (Exit ${code}${reboot ? ', Neustart nötig' : ''})`, reboot, retriable: true }
}

async function deployToHost(
  host: string, items: DriverItem[], opts: HpDeployOptions, onStep?: (s: HpDeployStep) => void,
  isAborted?: () => boolean,
): Promise<HpDeployResult> {
  const h = q(host)
  const step = (phase: string, status: HpDeployStep['status']) => onStep?.({ host, phase, status })
  const jetzt = () => new Date().toISOString()
  const keepAlive = setInterval(() => { void reactivateWinRM(host) }, 240000)
  // Letzter Installationsversuch je SoftPaq + Zähler.
  const versuche = new Map<string, { ok: boolean; info: string; reboot: boolean; n: number }>()
  let anyReboot = false

  // Eine Liste installieren (mit Fortschritt); Ergebnisse landen in `versuche`.
  // Je Treiber bis zu MAX_VERSUCHE SCHNELLE Versuche — aber SOFORT weiter, wenn ein Versuch
  // als aussichtslos gilt (retriable=false: Installer hängt/Timeout). BIOS & Firmware NIE
  // automatisch wiederholen (1 Versuch): BIOS zu riskant, Firmware läuft interaktiv/flasht beim Neustart.
  const installiere = async (liste: DriverItem[], phaseLabel: string) => {
    let i = 0
    for (const item of liste) {
      if (isAborted?.()) { step('Abgebrochen', 'error'); break }   // Stopp-Knopf → laufende Liste beenden
      i++
      const tag = (!item.anwendbar && !item.ohneHardwareBezug) ? ' · erzwungen (nicht anwendbar)'
        : item.matchUnsicher ? ' · Match unsicher' : ''
      const maxV = (item.klasse === 'bios' || item.klasse === 'firmware') ? 1 : MAX_VERSUCHE
      // Jeder Treiber einzeln abgesichert — ein Fehlschlag/Timeout darf den ganzen PC NICHT abbrechen.
      let r: { ok: boolean; info: string; reboot: boolean; retriable?: boolean } = { ok: false, info: 'nicht installiert', reboot: false }
      let n = 0
      while (n < maxV) {
        if (isAborted?.()) break
        n++
        step(`${phaseLabel} (${i}/${liste.length}) ${item.name}${tag}${maxV > 1 ? ` · Versuch ${n}/${maxV}` : ''}`, 'running')
        try { r = await installOne(host, item) }
        catch (e) { r = { ok: false, info: 'Fehler: ' + (e instanceof Error ? e.message : String(e)), reboot: false, retriable: true } }
        if (r.ok || r.retriable === false) break   // Erfolg ODER aussichtslos → nicht weiter probieren
      }
      versuche.set(item.softpaqId, { ok: r.ok, info: r.info, reboot: r.reboot, n })
      if (r.reboot) anyReboot = true
      step(`${phaseLabel} (${i}/${liste.length}) ${item.name}${tag}`, r.ok ? 'ok' : 'error')
    }
  }

  // Einen Treiber bewerten. WICHTIG: NICHT über einen Versionsvergleich urteilen — die
  // HP-Paketversion (SoftPaq) und die Windows-Treiberversion sind unterschiedliche
  // Nummernkreise (z. B. NVIDIA-Paket „596.72" vs. Treiber „32.0.15.9672"), ein Vergleich
  // liefert falsche „weiter veraltet"-Urteile. Maßgeblich ist der ERFOLG des Installers.
  // Ist die installierte Version nachweislich gestiegen, zeigen wir das als starke Bestätigung.
  const bewerte = (item: DriverItem, after: HpHostReport | null): HpDriverErgebnis => {
    const a = versuche.get(item.softpaqId)
    const scanOk = !!after && after.online && !after.error
    const fresh = scanOk ? after!.items.find(x => x.softpaqId === item.softpaqId) : undefined
    const nach = item.klasse === 'bios'
      ? (after?.biosVersion || item.installedVersion)
      : (fresh?.installedVersion || item.installedVersion)
    const reboot = !!a?.reboot
    let verifiziert = false
    let info = 'nicht installiert'
    if (!a) {
      verifiziert = false; info = 'nicht installiert'
    } else if (!a.ok) {
      // Installations-BEFEHL fehlgeschlagen (Download/Kopieren/Exitcode) → echter Fehler.
      verifiziert = false; info = a.info || 'fehlgeschlagen'
    } else {
      // Installer erfolgreich gelaufen.
      verifiziert = true
      if (reboot || item.klasse === 'bios') info = 'installiert – Neustart nötig'
      else if (nach && item.installedVersion && cmpVersion(nach, item.installedVersion) === 1) info = `aktualisiert (${item.installedVersion} → ${nach})`
      else info = scanOk ? 'installiert' : 'installiert (nicht nachgeprüft)'
    }
    return {
      name: item.name, softpaqId: item.softpaqId, category: item.category, klasse: item.klasse,
      sollVersion: item.latestVersion, vorher: item.installedVersion, nachher: nach,
      verifiziert, neustartNoetig: reboot, versuche: a?.n ?? 0, info,
    }
  }

  try {
    step('Erreichbarkeit', 'running')
    if (!(await reactivateWinRM(host))) {
      return { host, status: 'fehler', message: 'Nicht erreichbar (WinRM/offline).', perItem: [], ergebnisse: [], verifyMoeglich: false, ranAt: jetzt() }
    }

    // Warnung an angemeldeten Nutzer, wenn kritische Treiber dabei sind — NUR wenn
    // „Benutzer benachrichtigen" aktiv ist (sonst komplett stille Installation).
    const hatKritisch = items.some(i => i.klasse === 'kritisch' || i.klasse === 'firmware' || i.klasse === 'bios')
    if (opts.notifyUser && hatKritisch) {
      step('Warnung senden', 'running')
      const warn = q('Achtung: In den naechsten Minuten werden Geraetetreiber aktualisiert. Bild/Ton/Netzwerk koennen kurz aussetzen. Bitte offene Arbeit speichern.')
      await api().runPowerShell(`Invoke-Command -ComputerName '${h}' -ErrorAction SilentlyContinue -ScriptBlock { msg * '${warn}' }`, 20000)
    }

    // 1) Installieren
    await installiere(installOrder(items), 'Installieren')

    // 2) Nachprüfen: den PC frisch scannen und schauen, ob die Treiber wirklich drauf sind.
    // Bei Abbruch überspringen (schnell beenden).
    let after: HpHostReport | null = null
    if (!isAborted?.()) {
      step('Prüfen (Nachscan)', 'running')
      try { after = await scanOneHost(host) } catch { after = null }
      step('Prüfen (Nachscan)', after && after.online && !after.error ? 'ok' : 'error')
    }
    const scanOk = !!after && after.online && !after.error

    // (Wiederholung passiert bereits INLINE je Treiber in `installiere` — bis zu MAX_VERSUCHE
    //  schnelle Versuche, sofortiger Abbruch bei Hängern. Kein zweiter, langsamer Installations-
    //  und Nachscan-Durchlauf mehr.)

    // 4) Ergebnisse bauen
    const verifyMoeglich = scanOk
    const ergebnisse = items.map(it => bewerte(it, after))
    const okCount = ergebnisse.filter(e => e.verifiziert).length
    const status: HpDeployResult['status'] = okCount === 0 ? 'fehler' : okCount === ergebnisse.length ? 'installiert' : 'teilweise'
    const perItem = ergebnisse.map(e => ({ name: e.name, ok: e.verifiziert, info: e.info }))

    // 5) Abschluss: Neustart oder Nachricht (auf Basis der bestätigten Installationen)
    step('Abschluss', 'running')
    if (opts.rebootMode === 'reboot' && okCount > 0) {
      await api().runPowerShell(`Invoke-Command -ComputerName '${h}' -ErrorAction SilentlyContinue -ScriptBlock { shutdown /r /t 120 /c 'Treiber aktualisiert - der PC startet in 2 Minuten neu. Bitte Arbeit speichern.' }`, 20000)
    } else if (opts.notifyUser && okCount > 0) {
      // Abschluss-Popup nur bei aktiver Benutzer-Benachrichtigung (sonst still).
      const msg = anyReboot
        ? 'Treiber wurden aktualisiert. Bitte den PC bei Gelegenheit neu starten, damit alle neuen Treiber aktiv werden.'
        : 'Treiber wurden aktualisiert.'
      await api().runPowerShell(`Invoke-Command -ComputerName '${h}' -ErrorAction SilentlyContinue -ScriptBlock { msg * '${q(msg)}' }`, 20000)
    }
    step('Abschluss', 'ok')

    const message = `${okCount}/${ergebnisse.length} Treiber bestätigt${anyReboot ? ' — Neustart nötig' : ''}${verifyMoeglich ? '' : ' (Nachprüfung nicht möglich)'}.`
    return { host, status, message, perItem, ergebnisse, needsReboot: anyReboot, verifyMoeglich, ranAt: jetzt() }
  } catch (e) {
    return { host, status: 'fehler', message: e instanceof Error ? e.message : String(e), perItem: [], ergebnisse: [], verifyMoeglich: false, ranAt: jetzt() }
  } finally {
    clearInterval(keepAlive)   // Keep-Alive IMMER beenden (Erfolg, Fehler, früher return)
  }
}

/** Notiz ins Geräte-Dossier des PCs schreiben (welche Treiber am Datum X installiert wurden). */
async function schreibeDossierNotiz(r: HpDeployResult, by: string): Promise<void> {
  if (!r.ergebnisse.length) return
  const inst = r.ergebnisse.filter(e => e.verifiziert)
  const offen = r.ergebnisse.filter(e => !e.verifiziert)
  const datum = new Date().toLocaleString('de-DE')
  const zeilen = [
    `Treiber-Installation (Tool) am ${datum}: ${inst.length}/${r.ergebnisse.length} bestätigt` +
    `${r.needsReboot ? ', Neustart nötig' : ''}${r.verifyMoeglich ? '' : ' (Nachprüfung war nicht möglich)'}.`,
  ]
  if (inst.length) zeilen.push('Installiert: ' + inst.map(e => `${e.name} → ${e.sollVersion}`).join('; '))
  if (offen.length) zeilen.push('Offen/fehlgeschlagen: ' + offen.map(e => e.name).join('; '))
  // logDeviceAction schluckt Fehler selbst (Protokollierung darf den Ablauf nie stören).
  await logDeviceAction(r.host, undefined, zeilen.join('\n'), by, 'Treiber-Installation')
}

/** Einen EINZELNEN PC installieren (inkl. Nachprüfung/Wiederholung + Dossier-Notiz).
 *  Basis für den parallelen Pro-PC-Betrieb (mehrere PCs gleichzeitig, verwaltet im Store). */
/** Optionale Nachricht an den am Ziel-PC angemeldeten Benutzer (per `msg *`). Best-effort;
 *  wenn deaktiviert oder msg nicht verfügbar, läuft die Installation still weiter. */
async function notifyLoggedInUser(host: string, message: string): Promise<void> {
  const h = host.replace(/'/g, "''")
  const m = message.replace(/"/g, "'")   // Doppelquotes vermeiden (msg-Argument ist doppelt-gequotet)
  const script = `try { Invoke-Command -ComputerName '${h}' -ScriptBlock { msg * /TIME:300 "${m}" } -ErrorAction SilentlyContinue } catch {}`
  try { await api().runPowerShell(script, 30000) } catch { /* egal */ }
}

export async function deployOneHost(
  host: string, items: DriverItem[], opts: HpDeployOptions, onStep?: (s: HpDeployStep) => void,
  isAborted?: () => boolean,
): Promise<HpDeployResult> {
  if (opts.notifyUser) await notifyLoggedInUser(host, 'Die IT aktualisiert jetzt automatisch die Treiber auf diesem PC. Bitte speichern Sie Ihre Arbeit - es kann zu kurzen Unterbrechungen kommen.')
  const r = await deployToHost(host, items, opts, onStep, isAborted)
  await schreibeDossierNotiz(r, opts.by)   // Eintrag „Treiber installiert am …" ins PC-Dossier
  await recordInstalledSoftpaqs(r)         // Zustand für den verlässlichen Nachscan merken
  if (opts.notifyUser) await notifyLoggedInUser(host, r.needsReboot
    ? 'Die Treiber-Aktualisierung ist abgeschlossen. Bitte starten Sie den PC bei Gelegenheit neu. Vielen Dank.'
    : 'Die Treiber-Aktualisierung ist abgeschlossen. Vielen Dank.')
  return r
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
    const settled = await Promise.all(batch.map(async j => {
      const r = await deployOneHost(j.host, j.items, opts, onStep)
      onResult?.(r)
      return r
    }))
    results.push(...settled)
  }
  return results
}
