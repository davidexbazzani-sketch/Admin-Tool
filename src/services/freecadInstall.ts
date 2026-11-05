// ── FreeCAD: 3D-Modelle (STEP/IGES) ansehen — ohne SOLIDWORKS/eDrawings ──────
// Kachel „3D-Viewer (FreeCAD)" unter Software Installationen. Ersetzt die eDrawings-
// Kachel (deren Ferninstallation lief nicht). FreeCAD ist kostenlos, quelloffen (LGPL,
// auch für Firmen frei nutzbar) und öffnet STEP/IGES-Dateien direkt.
//
// Aus dem Installer-Skript (FreeCAD 1.1.4, package/WindowsInstaller/*.nsi) gelesen:
//   • NSIS-Installer, still mit  /S /AllUsers  → C:\Program Files\FreeCAD 1.1
//   • im stillen Modus bricht er WORTLOS ab, wenn dieselbe Version schon installiert ist,
//     eine neuere installiert ist oder FreeCAD gerade läuft → das prüft das Tool vorher
//   • verknüpft nur .FCStd — STEP/IGES NICHT. Das macht das Tool danach selbst (HKLM),
//     und zwar nur dort, wo noch kein funktionierendes Programm zuständig ist
//     (SOLIDWORKS-/eDrawings-Nutzer behalten ihre Verknüpfung).
//   • legt eine Desktop-Verknüpfung für alle an (optional wieder entfernt).
//
// Dateiweg wie bei Jabra/eDrawings: Admin-PC kopiert über \\<host>\C$ (Doppelhop), die
// Prüfsumme (SHA256 aus der Release-Datei) wird auf dem Ziel-PC nachgerechnet, dann läuft
// der Installer per Invoke-Command in Session 0 — beim Anwender erscheint kein Fenster.

import { api } from '../electronAPI'
import { ROBOCOPY_PS } from '../utils/robocopy'
import { pathService } from './pathService'
import { esc, b64, asArr, fernBefehl, getagged, verbinde } from './enaioInstall'

// ── Quelle ───────────────────────────────────────────────────────────────────
/** I:\700 Application\711 IT Allgemein\SW_INSTA\FreeCAD (I: = \\W3172\SKF Marine). */
export const FREECAD_ORDNER_STANDARD = pathService.getMarineRoot('unc') + '\\700 Application\\711 IT Allgemein\\SW_INSTA\\FreeCAD'
const QUELLE_STORE = 'config/software/freecad/quelle.json'
const ZIEL_ORDNER = 'C:\\Windows\\Temp\\itadmintool_freecad'
/** Endungen, die mit FreeCAD verknüpft werden (STEP + IGES). */
export const CAD_ENDUNGEN = ['.step', '.stp', '.stpz', '.iges', '.igs']
const RELEASE_API = 'https://api.github.com/repos/FreeCAD/FreeCAD/releases/latest'

export interface FreeCadEinstellung { ordner: string }
let cache: FreeCadEinstellung | null = null

export async function ladeFreeCadEinstellung(): Promise<FreeCadEinstellung> {
  if (cache) return cache
  let d: Partial<FreeCadEinstellung> | null = null
  try { d = await api().netReadJson<Partial<FreeCadEinstellung>>(QUELLE_STORE) } catch { /* Standard */ }
  cache = { ordner: (typeof d?.ordner === 'string' && d.ordner.trim()) || FREECAD_ORDNER_STANDARD }
  return cache
}
export async function setzeFreeCadEinstellung(e: FreeCadEinstellung): Promise<boolean> {
  const wert = { ordner: e.ordner.trim() }
  cache = { ordner: wert.ordner || FREECAD_ORDNER_STANDARD }
  try { return await api().netWriteJson(QUELLE_STORE, wert) } catch { return false }
}

/** „1.1.4" < „1.2.0"? (fehlende Teile = 0) */
export function vergleicheVersion(a: string, b: string): number {
  const t = (s: string) => (s.match(/\d+/g) || []).map(Number)
  const x = t(a), y = t(b)
  for (let i = 0; i < Math.max(x.length, y.length, 3); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1 }
  return 0
}
/** Version aus dem Dateinamen „FreeCAD_1.1.4-Windows-x86_64-py311-installer.exe" */
export function versionAusName(name: string): string {
  return /FreeCAD[_-](\d+\.\d+(?:\.\d+)?)/i.exec(name)?.[1] || ''
}
/** Erste 64-stellige Hex-Zahl einer *-SHA256.txt */
export function shaAusText(t: string): string {
  return (/\b([0-9a-fA-F]{64})\b/.exec(t || '')?.[1] || '').toUpperCase()
}

export interface FreeCadQuelle {
  ok: boolean
  fehler?: string
  pfad: string
  name: string
  version: string
  groesseMB: number
  /** SHA256 aus der danebenliegenden *-SHA256.txt (leer = keine Prüfsumme vorhanden) */
  sha256: string
  gesucht: string[]
}

function parseJson<T>(stdout: string): T | null {
  const s = (stdout || '').trim()
  const i = s.indexOf('{'), j = s.lastIndexOf('}')
  if (i < 0 || j <= i) return null
  try { return JSON.parse(s.slice(i, j + 1)) as T } catch { return null }
}

/** Neuestes FreeCAD-Setup im Ordner (Tiefe 2) — nur offizielle Dateinamen, höchste Version gewinnt. */
export async function findeFreeCadSetup(): Promise<FreeCadQuelle> {
  const leer: FreeCadQuelle = { ok: false, pfad: '', name: '', version: '', groesseMB: 0, sha256: '', gesucht: [] }
  const { ordner } = await ladeFreeCadEinstellung()
  const script = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$o = '${esc(ordner)}'
if (-not (Test-Path -LiteralPath $o)) { @{ ok = $false; fehler = ('Ordner nicht erreichbar: ' + $o) } | ConvertTo-Json -Compress; return }
$kand = @()
foreach ($d in @(Get-ChildItem -LiteralPath $o -Recurse -Depth 2 -File -Filter 'FreeCAD_*.exe')) {
  if ($d.Name -notmatch '^FreeCAD_(\d+\.\d+(\.\d+)?).*Windows.*x86_64.*installer.*\.exe$') { continue }
  $v = $null; if (-not [version]::TryParse($Matches[1], [ref]$v)) { continue }
  $kand += [pscustomobject]@{ f = $d; v = $v }
}
$best = @($kand | Sort-Object @{ Expression = 'v'; Descending = $true }, @{ Expression = { $_.f.LastWriteTime }; Descending = $true }) | Select-Object -First 1
if (-not $best) { @{ ok = $false; fehler = ('Kein FreeCAD-Setup (FreeCAD_x.y.z-Windows-x86_64-…-installer.exe) in ' + $o + ' gefunden.') } | ConvertTo-Json -Compress; return }
$sha = ''
$st = $best.f.FullName + '-SHA256.txt'
if (Test-Path -LiteralPath $st) { $sha = [string](Get-Content -LiteralPath $st -Raw) }
@{ ok = $true; pfad = $best.f.FullName; name = $best.f.Name; version = [string]$best.v; groesseMB = [math]::Round($best.f.Length / 1MB, 1); shaText = $sha; anzahl = $kand.Count } | ConvertTo-Json -Compress
`
  const r = await api().runPowerShell(script, 120000)
  const j = parseJson<{ ok?: boolean; fehler?: string; pfad?: string; name?: string; version?: string; groesseMB?: number; shaText?: string; anzahl?: number }>(r.stdout)
  if (!j) return { ...leer, fehler: r.stderr?.trim() || 'Der Netzwerkordner konnte nicht gelesen werden.' }
  if (!j.ok) return { ...leer, fehler: j.fehler || 'Kein Setup gefunden.' }
  return { ok: true, pfad: j.pfad || '', name: j.name || '', version: j.version || versionAusName(j.name || ''), groesseMB: j.groesseMB || 0, sha256: shaAusText(j.shaText || ''), gesucht: [ordner] }
}

// ── Neueste Version herunterladen (auf dem Admin-PC, in den Quellordner) ──────
// Offizielle Release-Seite von FreeCAD (GitHub). Setup + *-SHA256.txt werden geladen,
// die Prüfsumme gerechnet — erst danach wird die Datei unter ihrem Namen abgelegt.
const LADEN_PS = String.raw`
$ErrorActionPreference = 'Stop'
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  function Neu-SkfWc { $w = New-Object System.Net.WebClient; $w.Headers.Add('User-Agent', 'IT-Admin-Tool'); $p = [System.Net.WebRequest]::GetSystemWebProxy(); $p.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials; $w.Proxy = $p; return $w }
  if (-not (Test-Path -LiteralPath $o.ordner)) { New-Item -ItemType Directory -Force -Path $o.ordner | Out-Null }
  $rel = (Neu-SkfWc).DownloadString($o.api) | ConvertFrom-Json
  $inst = @($rel.assets | Where-Object { $_.name -match '^FreeCAD_[\d.]+-Windows-x86_64-.*installer.*\.exe$' }) | Select-Object -First 1
  if (-not $inst) { throw ('Im neuesten Release ' + $rel.tag_name + ' ist kein Windows-Installer enthalten.') }
  $shaAsset = @($rel.assets | Where-Object { $_.name -eq ($inst.name + '-SHA256.txt') }) | Select-Object -First 1
  if (-not $shaAsset) { throw 'Zum Installer gibt es keine SHA256-Datei — Download abgebrochen (ohne Prüfsumme nicht vertrauenswürdig).' }
  $ziel = Join-Path $o.ordner $inst.name
  $shaZiel = $ziel + '-SHA256.txt'
  $shaText = (Neu-SkfWc).DownloadString($shaAsset.browser_download_url)
  if ($shaText -notmatch '([0-9a-fA-F]{64})') { throw 'Die SHA256-Datei enthält keine Prüfsumme.' }
  $soll = $Matches[1].ToUpper()
  if ((Test-Path -LiteralPath $ziel) -and ((Get-Item -LiteralPath $ziel).Length -eq [int64]$inst.size)) {
    if ((Get-FileHash -LiteralPath $ziel -Algorithm SHA256).Hash -eq $soll) {
      Set-Content -LiteralPath $shaZiel -Value $shaText -Encoding ASCII
      '@@FCLADEN@@' + (@{ ok = $true; neu = $false; name = $inst.name; version = [string]$rel.tag_name; mb = [math]::Round($inst.size / 1MB, 1) } | ConvertTo-Json -Compress); return
    }
  }
  $teil = $ziel + '.part'
  Remove-Item -LiteralPath $teil -Force -EA SilentlyContinue
  (Neu-SkfWc).DownloadFile($inst.browser_download_url, $teil)
  $ist = (Get-FileHash -LiteralPath $teil -Algorithm SHA256).Hash
  if ($ist -ne $soll) { Remove-Item -LiteralPath $teil -Force -EA SilentlyContinue; throw ('Prüfsumme stimmt nicht (erwartet ' + $soll + ', erhalten ' + $ist + ') — Datei verworfen.') }
  Move-Item -LiteralPath $teil -Destination $ziel -Force
  Set-Content -LiteralPath $shaZiel -Value $shaText -Encoding ASCII
  '@@FCLADEN@@' + (@{ ok = $true; neu = $true; name = $inst.name; version = [string]$rel.tag_name; mb = [math]::Round($inst.size / 1MB, 1) } | ConvertTo-Json -Compress)
} catch { '@@FCLADEN@@' + (@{ ok = $false; fehler = ('' + $_.Exception.Message) } | ConvertTo-Json -Compress) }
`

export async function ladeFreeCadHerunter(): Promise<{ ok: boolean; neu?: boolean; name?: string; version?: string; mb?: number; fehler?: string }> {
  const { ordner } = await ladeFreeCadEinstellung()
  const r = await api().runPowerShell(`$b64 = '${b64(JSON.stringify({ ordner, api: RELEASE_API }))}'\n${LADEN_PS}`, 45 * 60 * 1000)
  const j = getagged<{ ok?: boolean; neu?: boolean; name?: string; version?: string; mb?: number; fehler?: string }>(r.stdout, '@@FCLADEN@@')
  if (!j) return { ok: false, fehler: r.timedOut ? 'Zeitüberschreitung beim Herunterladen (45 Minuten).' : (r.stderr?.trim() || 'Keine Rückmeldung beim Herunterladen.') }
  return j.ok ? { ok: true, neu: j.neu, name: j.name, version: j.version, mb: j.mb } : { ok: false, fehler: j.fehler || 'Herunterladen fehlgeschlagen.' }
}

// ── Ist-Stand ────────────────────────────────────────────────────────────────
// Gemeinsame PS-Hilfen: installierte FreeCAD-Versionen, wer STEP/IGES öffnet (Computer +
// angemeldete Benutzer), ob das zuständige Programm überhaupt noch existiert.
const PS_HILFEN = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
function Get-SkfFreeCad {
  $out = @()
  foreach ($b in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
    foreach ($k in @(Get-ChildItem -LiteralPath $b)) {
      $p = Get-ItemProperty -LiteralPath $k.PSPath
      $dn = [string]$p.DisplayName
      if ($dn -notmatch '^FreeCAD') { continue }
      $dir = [string](Get-ItemProperty -LiteralPath ('HKLM:\SOFTWARE\' + $k.PSChildName)).'(default)'
      if (-not $dir -and $p.DisplayIcon) { $dir = Split-Path (Split-Path ([string]$p.DisplayIcon -replace '"', '') -Parent) -Parent }
      $exe = ''; if ($dir) { $exe = Join-Path $dir 'bin\freecad.exe'; if (-not (Test-Path -LiteralPath $exe)) { $exe = '' } }
      $out += [pscustomobject]@{ name = $dn; version = [string]$p.DisplayVersion; key = [string]$k.PSChildName; ordner = $dir; exe = $exe }
    }
  }
  return $out
}
# Programm hinter einer ProgID (Computer- oder Benutzer-Klassen); '' = keins / existiert nicht
function Get-SkfProgExe([string]$progid, [string]$sidClasses) {
  if (-not $progid) { return '' }
  if ($progid -like 'AppX*') { return 'App (Store)' }
  $orte = @()
  if ($sidClasses) { $orte += ('Registry::HKEY_USERS\' + $sidClasses + '\' + $progid + '\shell\open\command') }
  $orte += ('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\' + $progid + '\shell\open\command')
  foreach ($o in $orte) {
    $c = [string](Get-ItemProperty -LiteralPath $o).'(default)'
    if (-not $c) { continue }
    $c = [Environment]::ExpandEnvironmentVariables($c)
    $exe = ''
    if ($c -match '^\s*"([^"]+)"') { $exe = $Matches[1] } elseif ($c -match '^\s*(\S+)') { $exe = $Matches[1] }
    if ($exe -and (Test-Path -LiteralPath $exe)) { return $exe }
  }
  return ''
}
function Get-SkfBenutzer {
  $aus = @()
  foreach ($s in @(Get-ChildItem -LiteralPath 'Registry::HKEY_USERS' | Where-Object { $_.PSChildName -match '^S-1-5-21-[\d-]+$' })) {
    $name = $s.PSChildName
    try { $name = (New-Object System.Security.Principal.SecurityIdentifier($s.PSChildName)).Translate([System.Security.Principal.NTAccount]).Value } catch { }
    $aus += [pscustomobject]@{ sid = $s.PSChildName; name = $name }
  }
  return $aus
}
function Get-SkfEndung([string]$ext, $benutzer) {
  $def = [string](Get-ItemProperty -LiteralPath ('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\' + $ext)).'(default)'
  $nutzer = @()
  foreach ($b in $benutzer) {
    $progId = [string](Get-ItemProperty -LiteralPath ('Registry::HKEY_USERS\' + $b.sid + '\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\' + $ext + '\UserChoice')).ProgId
    if ($progId) { $nutzer += [pscustomobject]@{ benutzer = $b.name; sid = $b.sid; progid = $progId; exe = (Get-SkfProgExe $progId ($b.sid + '_Classes')) } }
  }
  return [pscustomobject]@{ ext = $ext; standard = $def; exe = (Get-SkfProgExe $def ''); nutzer = @($nutzer) }
}
`

const STAND_INNER = PS_HILFEN + String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$sw = @()
foreach ($b in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
  $sw += @(Get-ItemProperty $b | Where-Object { ([string]$_.DisplayName) -match '^SOLIDWORKS 20\d\d|eDrawings' } | ForEach-Object { ([string]$_.DisplayName + ' ' + [string]$_.DisplayVersion).Trim() })
}
$lauf = @(Get-Process -Name freecad, freecadcmd -IncludeUserName | ForEach-Object { [string]$_.UserName } | Select-Object -Unique)
$ben = @(Get-SkfBenutzer)
$end = @(foreach ($e in @($o.endungen)) { Get-SkfEndung ([string]$e) $ben })
$angemeldet = ''; try { $angemeldet = [string](Get-CimInstance Win32_ComputerSystem).UserName } catch { }
'@@FCSTAND@@' + ([pscustomobject]@{ ok = $true; freecad = @(Get-SkfFreeCad); solidworks = @($sw | Select-Object -Unique); laeuft = @($lauf); endungen = $end; angemeldet = $angemeldet } | ConvertTo-Json -Depth 6 -Compress)
`

export interface FreeCadInstalliert { name: string; version: string; key: string; ordner: string; exe: string }
export interface EndungNutzer { benutzer: string; sid: string; progid: string; exe: string }
export interface EndungStand { ext: string; standard: string; exe: string; nutzer: EndungNutzer[] }
export interface FreeCadStand {
  ok: boolean
  fehler?: string
  freecad: FreeCadInstalliert[]
  solidworks: string[]
  laeuft: string[]
  endungen: EndungStand[]
  angemeldet: string
}

/** Neueste installierte FreeCAD-Version mit vorhandener freecad.exe */
export function neuestesFreeCad(s: FreeCadStand): FreeCadInstalliert | undefined {
  return s.freecad.filter(f => f.exe).sort((a, b) => vergleicheVersion(b.version, a.version))[0]
}
/** Öffnet FreeCAD die Endung per Doppelklick? (Benutzerwahl schlägt Computer-Standard) */
export function oeffnetMit(e: EndungStand, benutzerSid?: string): { programm: string; mitFreeCad: boolean; quelle: 'benutzer' | 'computer' | 'keins' } {
  const n = e.nutzer.find(x => !benutzerSid || x.sid === benutzerSid)
  if (n && n.exe) return { programm: n.exe, mitFreeCad: /freecad\.exe$/i.test(n.exe), quelle: 'benutzer' }
  if (e.exe) return { programm: e.exe, mitFreeCad: /freecad\.exe$/i.test(e.exe), quelle: 'computer' }
  return { programm: '', mitFreeCad: false, quelle: 'keins' }
}

/** Read-only: FreeCAD-Version(en), wer STEP/IGES öffnet, läuft FreeCAD, SOLIDWORKS vorhanden? */
export async function pruefeFreeCadStand(host: string): Promise<FreeCadStand> {
  const leer: FreeCadStand = { ok: false, freecad: [], solidworks: [], laeuft: [], endungen: [], angemeldet: '' }
  const f = await verbinde(host)
  if (f) return { ...leer, fehler: f }
  const r = await api().runPowerShell(fernBefehl(host, STAND_INNER, '@@FCSTAND@@', b64(JSON.stringify({ endungen: CAD_ENDUNGEN }))), 120000)
  const j = getagged<Record<string, unknown> & { ok?: boolean; fehler?: string; angemeldet?: string }>(r.stdout, '@@FCSTAND@@')
  if (!j) return { ...leer, fehler: r.stderr?.trim() || 'Keine Antwort vom Ziel-PC.' }
  if (j.ok === false) return { ...leer, fehler: j.fehler || 'Abfrage fehlgeschlagen.' }
  return {
    ok: true,
    freecad: asArr<FreeCadInstalliert>(j.freecad).filter(x => x && x.name),
    solidworks: asArr<string>(j.solidworks).filter(Boolean),
    laeuft: asArr<string>(j.laeuft).filter(Boolean),
    endungen: asArr<EndungStand>(j.endungen).map(e => ({ ...e, nutzer: asArr<EndungNutzer>(e.nutzer) })),
    angemeldet: j.angemeldet || '',
  }
}

// ── Installation ─────────────────────────────────────────────────────────────
export type SchrittStatus = 'offen' | 'laeuft' | 'ok' | 'fehler' | 'warnung'
export interface FreeCadSchritt { id: string; label: string; status: SchrittStatus; info?: string }
export interface FreeCadOptionen {
  beenden: boolean        // laufendes FreeCAD vorher schließen
  desktop: boolean        // Desktop-Verknüpfung für alle behalten
  verknuepfen: boolean    // STEP/IGES mit FreeCAD öffnen
  erzwingen: boolean      // … auch wenn ein anderes Programm (z. B. SOLIDWORKS) zuständig ist
}
export interface FreeCadErgebnis { ok: boolean; text: string; version?: string; uebersprungen?: boolean }

export function freeCadSchritte(): { id: string; label: string }[] {
  return [
    { id: 'quelle', label: 'Setup im Netzwerk suchen' },
    { id: 'ziel', label: 'Ziel-PC erreichbar prüfen (Ist-Stand)' },
    { id: 'kopie', label: 'Setup auf den Ziel-PC kopieren (rund 500 MB) und Prüfsumme kontrollieren' },
    { id: 'install', label: 'FreeCAD still installieren (für alle Benutzer)' },
    { id: 'verknuepfen', label: 'STEP-/IGES-Dateien mit FreeCAD verknüpfen' },
    { id: 'pruefen', label: 'Installation prüfen' },
    { id: 'aufraeumen', label: 'Aufräumen' },
  ]
}

const INSTALL_MINUTEN = 30

const INSTALL_INNER = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
try {
  if (-not (Test-Path -LiteralPath $o.exe)) { throw ('Setup nicht gefunden: ' + $o.exe) }
  if ($o.sha) {
    $ist = (Get-FileHash -LiteralPath $o.exe -Algorithm SHA256).Hash
    if ($ist -ne $o.sha) { throw ('Prüfsumme des kopierten Setups stimmt nicht (erwartet ' + $o.sha + ', ist ' + $ist + ') — Installation abgebrochen.') }
  }
  # FreeCAD darf nicht laufen — sonst bricht das Setup im stillen Modus wortlos ab
  $lauf = @(Get-Process -Name freecad, freecadcmd -EA SilentlyContinue)
  if ($lauf.Count) {
    if ($o.beenden) { $lauf | Stop-Process -Force -EA SilentlyContinue; Start-Sleep -Seconds 3 }
    else { throw 'FreeCAD ist auf dem PC geöffnet — bitte schließen lassen oder „geöffnetes FreeCAD vorher schließen" wählen.' }
  }
  # Reste eines hängenden früheren Versuchs beenden
  $haenger = @(Get-CimInstance Win32_Process | Where-Object { ([string]$_.ExecutablePath -like '*itadmintool_freecad*') })
  foreach ($p in $haenger) { Stop-Process -Id $p.ProcessId -Force -EA SilentlyContinue }
  $pr = Start-Process -FilePath $o.exe -ArgumentList '/S /AllUsers' -PassThru
  $null = $pr.Handle
  $fertig = $pr.WaitForExit([int]$o.minuten * 60000)
  $code = -1
  if ($fertig) { $code = $pr.ExitCode } else { Stop-Process -Id $pr.Id -Force -EA SilentlyContinue }
  '@@FCINST@@' + (@{ ok = $true; fertig = [bool]$fertig; code = $code; haenger = $haenger.Count } | ConvertTo-Json -Compress)
} catch { '@@FCINST@@' + (@{ ok = $false; fehler = ('' + $_.Exception.Message) } | ConvertTo-Json -Compress) }
`

// STEP/IGES verknüpfen — nur HKLM-Klassen + defekte Benutzerwahl entfernen. Ein Programm,
// das funktioniert (z. B. SOLIDWORKS), bleibt zuständig, außer `erzwingen`.
const VERKNUEPFEN_INNER = PS_HILFEN + String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
try {
  $exe = [string]$o.exe
  if (-not (Test-Path -LiteralPath $exe)) { throw ('freecad.exe nicht gefunden: ' + $exe) }
  $cmd = '"' + $exe + '" --single-instance "%1"'
  # WICHTIG: New-Item -Force auf einen VORHANDENEN Registry-Schlüssel legt ihn neu an und löscht
  # alle seine Werte (z. B. die OpenWithProgids von SOLIDWORKS) → nur anlegen, wenn er fehlt.
  function New-SkfKey([string]$p) { if (-not (Test-Path -LiteralPath $p)) { New-Item -Path $p -Force | Out-Null } }
  $typen = @{ 'FreeCAD.STEP' = 'STEP-3D-Modell'; 'FreeCAD.IGES' = 'IGES-3D-Modell' }
  if (@($o.endungen).Count) { foreach ($progId in $typen.Keys) {
    $k = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\' + $progId
    New-SkfKey $k; New-SkfKey ($k + '\shell'); New-SkfKey ($k + '\shell\open'); New-SkfKey ($k + '\shell\open\command'); New-SkfKey ($k + '\DefaultIcon')
    Set-ItemProperty -LiteralPath $k -Name '(default)' -Value $typen[$progId]
    Set-ItemProperty -LiteralPath $k -Name 'FriendlyTypeName' -Value $typen[$progId]
    Set-ItemProperty -LiteralPath ($k + '\DefaultIcon') -Name '(default)' -Value ($exe + ',0')
    Set-ItemProperty -LiteralPath ($k + '\shell\open\command') -Name '(default)' -Value $cmd
  } }
  $ben = @(Get-SkfBenutzer)
  $log = @()
  foreach ($e in @($o.endungen)) {
    $ext = [string]$e
    $progId = $(if ($ext -match 'ig') { 'FreeCAD.IGES' } else { 'FreeCAD.STEP' })
    $ek = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\' + $ext
    New-SkfKey $ek; New-SkfKey ($ek + '\OpenWithProgids')
    New-ItemProperty -LiteralPath ($ek + '\OpenWithProgids') -Name $progId -Value '' -PropertyType String -Force | Out-Null
    $def = [string](Get-ItemProperty -LiteralPath $ek).'(default)'
    $defExe = Get-SkfProgExe $def ''
    $aktion = ''
    if (-not $def -or -not $defExe -or $def -like 'FreeCAD.*' -or $o.erzwingen) {
      Set-ItemProperty -LiteralPath $ek -Name '(default)' -Value $progId
      $aktion = $(if (-not $def) { 'Standard gesetzt (vorher keiner)' } elseif ($def -like 'FreeCAD.*') { 'Standard aktualisiert' } elseif (-not $defExe) { 'Standard gesetzt (vorher ' + $def + ', Programm fehlt)' } else { 'Standard ersetzt (vorher ' + $def + ')' })
    } else { $aktion = 'Standard bleibt ' + $def + ' (' + [IO.Path]::GetFileName($defExe) + ')' }
    # Benutzerwahl („Immer mit … öffnen"): nur entfernen, wenn das gewählte Programm nicht mehr existiert
    foreach ($b in $ben) {
      $uk = 'Registry::HKEY_USERS\' + $b.sid + '\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\' + $ext + '\UserChoice'
      $up = [string](Get-ItemProperty -LiteralPath $uk).ProgId
      if (-not $up) { continue }
      $uexe = Get-SkfProgExe $up ($b.sid + '_Classes')
      if ($uexe) { $aktion += (' · ' + $b.name + ' öffnet weiter mit ' + [IO.Path]::GetFileName($uexe)) }
      else {
        try { Remove-Item -LiteralPath $uk -Recurse -Force -ErrorAction Stop; $aktion += (' · defekte Wahl von ' + $b.name + ' (' + $up + ') entfernt') }
        catch { $aktion += (' · defekte Wahl von ' + $b.name + ' (' + $up + ') nicht entfernbar') }
      }
    }
    $log += [pscustomobject]@{ ext = $ext; aktion = $aktion }
  }
  # Explorer über die geänderten Verknüpfungen informieren
  try {
    if (-not ('Skf.SkfShell' -as [type])) { Add-Type -Namespace 'Skf' -Name 'SkfShell' -MemberDefinition '[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, uint f, IntPtr a, IntPtr b);' }
    [Skf.SkfShell]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
  } catch { }
  # Desktop-Verknüpfung (legt das Setup für alle an) ggf. wieder entfernen
  $desk = @()
  if (-not $o.desktop) { foreach ($l in @(Get-ChildItem -LiteralPath (Join-Path $env:PUBLIC 'Desktop') -Filter 'FreeCAD*.lnk' -File)) { Remove-Item -LiteralPath $l.FullName -Force; $desk += $l.Name } }
  '@@FCVERK@@' + (@{ ok = $true; log = @($log); desktopEntfernt = @($desk) } | ConvertTo-Json -Depth 4 -Compress)
} catch { '@@FCVERK@@' + (@{ ok = $false; fehler = ('' + $_.Exception.Message) } | ConvertTo-Json -Compress) }
`

type Melder = (id: string, status: SchrittStatus, info?: string) => void

function deuteCode(code: number): { ok: boolean; text: string } {
  if (code === 0) return { ok: true, text: 'Setup erfolgreich beendet' }
  if (code === 1) return { ok: false, text: 'Setup abgebrochen (Exitcode 1)' }
  if (code === 2) return { ok: false, text: 'Setup vom Installer-Skript abgebrochen (Exitcode 2) — z. B. Windows zu alt oder FreeCAD lief' }
  return { ok: false, text: `Setup endete mit Exitcode ${code}` }
}

/** FreeCAD still auf dem Ziel-PC installieren und STEP/IGES verknüpfen. */
export async function installiereFreeCad(host: string, opt: FreeCadOptionen, melde: Melder): Promise<FreeCadErgebnis> {
  // 1) Quelle
  melde('quelle', 'laeuft')
  const q = await findeFreeCadSetup()
  if (!q.ok) { melde('quelle', 'fehler', q.fehler); return { ok: false, text: q.fehler || 'Setup nicht gefunden.' } }
  melde('quelle', q.sha256 ? 'ok' : 'warnung', `${q.name} · Version ${q.version} · ${q.groesseMB} MB${q.sha256 ? ' · Prüfsumme vorhanden' : ' · KEINE Prüfsumme (…-SHA256.txt fehlt) — Datei wird ungeprüft verwendet'}`)

  // 2) Ziel + Ist-Stand
  melde('ziel', 'laeuft')
  const f = await verbinde(host)
  if (f) { melde('ziel', 'fehler', f); return { ok: false, text: f } }
  const vor = await pruefeFreeCadStand(host)
  if (!vor.ok) { melde('ziel', 'fehler', vor.fehler); return { ok: false, text: vor.fehler || 'Ist-Stand nicht lesbar.' } }
  const da = neuestesFreeCad(vor)
  const schonDa = !!da && vergleicheVersion(da.version, q.version) >= 0
  if (!schonDa && vor.laeuft.length && !opt.beenden) {
    const t = `FreeCAD ist auf ${host} geöffnet (${vor.laeuft.join(', ')}) — bitte schließen lassen oder „geöffnetes FreeCAD vorher schließen" wählen.`
    melde('ziel', 'fehler', t); return { ok: false, text: t }
  }
  melde('ziel', 'ok', `${host} erreichbar · ${da ? `installiert: FreeCAD ${da.version}` : 'FreeCAD nicht installiert'}${vor.solidworks.length ? ` · vorhanden: ${vor.solidworks.join(', ')}` : ''}`)

  let exe = da?.exe || ''
  let version = da?.version || ''
  if (schonDa) {
    melde('kopie', 'ok', `übersprungen — FreeCAD ${da!.version} ist schon installiert (Setup: ${q.version})`)
    melde('install', 'ok', 'übersprungen — nichts zu installieren')
  } else {
    const share = await api().runPowerShell(`if (Test-Path -LiteralPath '\\\\${esc(host)}\\C$\\Windows\\Temp') { 'OK' } else { 'NEIN' }`, 45000)
    if (!(share.stdout || '').includes('OK')) {
      const t = `Auf die Admin-Freigabe \\\\${host}\\C$ ist kein Zugriff möglich — ohne sie lässt sich das Setup nicht übertragen.`
      melde('kopie', 'fehler', t); return { ok: false, text: t }
    }
    // 3) Kopieren (Admin-PC als Mittelsmann)
    melde('kopie', 'laeuft', `${q.groesseMB} MB werden übertragen — je nach Netz einige Minuten.`)
    const zielUnc = `\\\\${host}\\C$\\Windows\\Temp\\itadmintool_freecad`
    const kopie = await api().runPowerShell([
      ROBOCOPY_PS,
      `$code = Copy-SkfFile '${esc(q.pfad)}' '${esc(zielUnc)}'`,
      `$ziel = Join-Path '${esc(zielUnc)}' '${esc(q.name)}'`,
      `$soll = (Get-Item -LiteralPath '${esc(q.pfad)}').Length`,
      `if ((Test-Path -LiteralPath $ziel) -and (Get-Item -LiteralPath $ziel).Length -eq $soll) { 'OK:' + [math]::Round($soll/1MB,1) }`,
      `else { 'ERR:Kopie unvollständig (robocopy-Code ' + $code + ')' }`,
    ].join('\n'), 45 * 60 * 1000)
    const kz = (kopie.stdout || '').split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith('OK:') || l.startsWith('ERR:'))
    if (!kz || kz.startsWith('ERR:')) {
      const t = kz ? kz.slice(4) : (kopie.stderr?.trim() || 'Die Kopie auf den Ziel-PC ist fehlgeschlagen.')
      melde('kopie', 'fehler', t); return { ok: false, text: t }
    }
    melde('kopie', 'ok', `${kz.slice(3)} MB nach ${ZIEL_ORDNER}${q.sha256 ? ' — Prüfsumme wird vor dem Start auf dem PC kontrolliert' : ''}`)

    // 4) Still installieren
    melde('install', 'laeuft', `Läuft unbemerkt im Hintergrund — meist 3–8 Minuten, Abbruch spätestens nach ${INSTALL_MINUTEN} Minuten.`)
    const ir = await api().runPowerShell(fernBefehl(host, INSTALL_INNER, '@@FCINST@@',
      b64(JSON.stringify({ exe: `${ZIEL_ORDNER}\\${q.name}`, sha: q.sha256, beenden: opt.beenden, minuten: INSTALL_MINUTEN }))),
      (INSTALL_MINUTEN + 10) * 60 * 1000)
    const ij = getagged<{ ok?: boolean; fertig?: boolean; code?: number; haenger?: number; fehler?: string }>(ir.stdout, '@@FCINST@@')
    if (!ij || ij.ok === false) {
      const t = ij?.fehler || (ir.timedOut ? `Keine Rückmeldung vom Ziel-PC innerhalb von ${INSTALL_MINUTEN + 10} Minuten.` : (ir.stderr?.trim() || 'Keine Rückmeldung vom Ziel-PC.'))
      melde('install', 'fehler', t); await aufraeumen(host); return { ok: false, text: t }
    }
    if (!ij.fertig) {
      const t = `Das Setup hat sich nach ${INSTALL_MINUTEN} Minuten nicht beendet und wurde abgebrochen.`
      melde('install', 'fehler', t); await aufraeumen(host); return { ok: false, text: t }
    }
    const d = deuteCode(ij.code ?? -1)
    // Gegenprobe statt „Exitcode 0 = fertig": steht FreeCAD jetzt in der Programmliste?
    const nach = await pruefeFreeCadStand(host)
    const neu = nach.ok ? neuestesFreeCad(nach) : undefined
    if (!neu || vergleicheVersion(neu.version, q.version) < 0) {
      const t = `${d.text}, FreeCAD ${q.version} steht aber nicht in der Programmliste des PCs.`
      melde('install', 'fehler', t); await aufraeumen(host); return { ok: false, text: t }
    }
    exe = neu.exe; version = neu.version
    melde('install', 'ok', `${d.ok ? d.text : `${d.text} — trotzdem installiert`}: FreeCAD ${neu.version} in ${neu.ordner}`)
  }

  // 5) STEP/IGES verknüpfen
  let verkText = ''
  if (!opt.verknuepfen && opt.desktop) {
    melde('verknuepfen', 'ok', 'nicht gewünscht — Dateien lassen sich über „Öffnen mit" bzw. in FreeCAD über Datei → Öffnen laden')
  } else {
    melde('verknuepfen', 'laeuft')
    const endungen = opt.verknuepfen ? CAD_ENDUNGEN : []
    const vr = await api().runPowerShell(fernBefehl(host, VERKNUEPFEN_INNER, '@@FCVERK@@',
      b64(JSON.stringify({ exe, endungen, erzwingen: opt.erzwingen, desktop: opt.desktop }))), 120000)
    const vj = getagged<{ ok?: boolean; fehler?: string; log?: unknown; desktopEntfernt?: unknown }>(vr.stdout, '@@FCVERK@@')
    if (!vj || vj.ok === false) {
      melde('verknuepfen', 'warnung', vj?.fehler || vr.stderr?.trim() || 'Keine Rückmeldung vom Ziel-PC.')
    } else {
      const log = asArr<{ ext: string; aktion: string }>(vj.log)
      const desk = asArr<string>(vj.desktopEntfernt)
      verkText = log.map(l => `${l.ext}: ${l.aktion}`).join(' · ')
      melde('verknuepfen', 'ok', [verkText || (opt.verknuepfen ? '' : 'Verknüpfung nicht gewünscht'), desk.length ? `Desktop-Verknüpfung entfernt (${desk.join(', ')})` : ''].filter(Boolean).join(' · '))
    }
  }

  // 6) Gegenprobe
  melde('pruefen', 'laeuft')
  const end = await pruefeFreeCadStand(host)
  if (!end.ok) melde('pruefen', 'warnung', end.fehler || 'Nachprüfung nicht möglich.')
  else {
    const fc = neuestesFreeCad(end)
    const step = end.endungen.find(e => e.ext === '.step')
    const wer = step ? oeffnetMit(step) : undefined
    melde('pruefen', fc ? 'ok' : 'fehler',
      `${fc ? `FreeCAD ${fc.version} vorhanden` : 'FreeCAD fehlt'} · .step öffnet ${wer?.programm ? `mit ${wer.mitFreeCad ? 'FreeCAD' : wer.programm.split('\\').pop()}` : 'mit keinem Programm'}`)
  }

  // 7) Aufräumen
  if (!schonDa) {
    melde('aufraeumen', 'laeuft')
    const sauber = await aufraeumen(host)
    melde('aufraeumen', sauber ? 'ok' : 'warnung', sauber ? 'Setup vom PC entfernt.' : `Das Setup unter ${ZIEL_ORDNER} konnte nicht entfernt werden.`)
  } else melde('aufraeumen', 'ok', 'nichts zu tun')

  return {
    ok: true, version, uebersprungen: schonDa,
    text: schonDa
      ? `FreeCAD ${version} war auf ${host} schon installiert — ${opt.verknuepfen ? 'STEP/IGES-Verknüpfung geprüft' : 'nichts geändert'}.`
      : `FreeCAD ${version} wurde auf ${host} still installiert${opt.verknuepfen ? ' und mit STEP/IGES verknüpft' : ''}.`,
  }
}

/** Setup vom Ziel-PC löschen. */
async function aufraeumen(host: string): Promise<boolean> {
  const ordner = `\\\\${host}\\C$\\Windows\\Temp\\itadmintool_freecad`
  try {
    const r = await api().runPowerShell([
      `Get-ChildItem -LiteralPath '${esc(ordner)}' -File -EA SilentlyContinue | Where-Object { $_.Extension -eq '.exe' } | Remove-Item -Force -EA SilentlyContinue`,
      `if (@(Get-ChildItem -LiteralPath '${esc(ordner)}' -File -EA SilentlyContinue | Where-Object { $_.Extension -eq '.exe' }).Count) { 'REST' } else { 'OK' }`,
    ].join('\n'), 60000)
    return (r.stdout || '').includes('OK')
  } catch { return false }
}

/** Die Skripte — exportiert, damit sie sich ohne Ziel-PC prüfen lassen. */
export const FREECAD_SKRIPTE = { PS_HILFEN, STAND_INNER, INSTALL_INNER, VERKNUEPFEN_INNER, LADEN_PS }
