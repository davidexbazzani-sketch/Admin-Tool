// ── Enaio: Ist-Stand, vollständiges Entfernen und Neuinstallation (fern) ───────
// Kachel „Enaio" unter Software Installationen. Ablauf nach der Anleitung
// „Neu Installation Client.docx":
//   1. Ordner I:\Public\Public\Enaio\Client-Ansi_<Version> nach C:\temp kopieren,
//      darin install.bat ausführen
//   2. Outlook Add-In for drag and drop\OS_64bit_outlook_add-in_dd_<Version>.msi
//   3. enaio_outlook_addin_ng.msi
// Davor optional: ALLES von enaio entfernen — Programme (auch pro Benutzer installierte
// Outlook-Add-Ins), Reste in Ordnern, Registry (Herstellerschlüssel, Outlook-Add-In-
// Registrierungen, Windows-Installer-Einträge), Verknüpfungen, Dienste, Aufgaben.
//
// Dateiweg wie bei Jabra/SolidWorks: der ADMIN-PC kopiert über \\<host>\C$ — die
// WinRM-Sitzung auf dem Ziel käme wegen des Doppelhops nicht an \\W3172\….
// Ausgeführt wird per Invoke-Command (Session 0, ohne Fenster beim Anwender).

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import { ROBOCOPY_PS } from '../utils/robocopy'
import { ensureWinRmTrustedHost, isIpv4 } from '../utils/remoteTarget'
import { pathService } from './pathService'

// ── Quelle ───────────────────────────────────────────────────────────────────

/** I:\Public\Public\Enaio — I: ist \\W3172\SKF Marine. */
export const ENAIO_ORDNER_STANDARD = pathService.getPublicRoot('unc') + '\\Enaio'
const QUELLE_STORE = 'config/software/enaio/quelle.json'

export const ZIEL_TEMP = 'C:\\temp'
const ADDIN_ORDNER = 'enaio_addins'
const LOG_ORDNER = 'C:\\Windows\\Temp\\itadmintool_enaio'

let quelleCache: string | null = null

export async function ladeEnaioQuellordner(): Promise<string> {
  if (quelleCache) return quelleCache
  try {
    const d = await api().netReadJson<{ ordner?: string }>(QUELLE_STORE)
    if (d && typeof d.ordner === 'string' && d.ordner.trim()) { quelleCache = d.ordner.trim(); return quelleCache }
  } catch { /* Standard */ }
  quelleCache = ENAIO_ORDNER_STANDARD
  return quelleCache
}

export async function setzeEnaioQuellordner(ordner: string): Promise<boolean> {
  const wert = ordner.trim()
  quelleCache = wert || ENAIO_ORDNER_STANDARD
  try { return await api().netWriteJson(QUELLE_STORE, { ordner: wert }) } catch { return false }
}

export function esc(s: string): string { return s.replace(/'/g, "''") }

export function b64(s: string): string { return btoa(unescape(encodeURIComponent(s))) }

export function asArr<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : v == null ? [] : [v as T] }

function parseJson<T>(stdout: string): T | null {
  const s = (stdout || '').trim()
  const i = s.indexOf('{'), j = s.lastIndexOf('}')
  if (i < 0 || j <= i) return null
  try { return JSON.parse(s.slice(i, j + 1)) as T } catch { return null }
}

export interface EnaioQuelle {
  ok: boolean
  fehler?: string
  clientOrdner: string        // vollständiger Pfad Client-Ansi_<Version>
  clientName: string          // Ordnername
  clientMB: number
  clientDateien: number
  installBatKopf: string      // erste Zeilen der install.bat (zur Kontrolle)
  ddMsi: string               // Outlook-Add-In Drag & Drop
  ngMsi: string               // enaio Outlook-Add-In (NG)
}

/**
 * Sucht die Installationsdateien (auf dem Admin-PC). Genommen wird jeweils die neueste
 * Version — eine neue Client-Version muss also nur als weiterer Client-Ansi_*-Ordner
 * abgelegt werden.
 */
export async function findeEnaioQuelle(): Promise<EnaioQuelle> {
  const leer: EnaioQuelle = { ok: false, clientOrdner: '', clientName: '', clientMB: 0, clientDateien: 0, installBatKopf: '', ddMsi: '', ngMsi: '' }
  const ordner = await ladeEnaioQuellordner()
  const script = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$o = '${esc(ordner)}'
if (-not (Test-Path -LiteralPath $o)) { @{ ok = $false; fehler = ('Ordner nicht erreichbar: ' + $o) } | ConvertTo-Json -Compress; return }
function Ver($n) { $v = $null; $t = ($n -replace '^[^0-9]*', '') -replace '[^0-9.]', ''; if (-not [version]::TryParse($t, [ref]$v)) { $v = [version]'0.0' }; $v }
$client = @(Get-ChildItem -LiteralPath $o -Directory -Filter 'Client-Ansi*' | Sort-Object @{ Expression = { Ver $_.Name } }, LastWriteTime -Descending) | Select-Object -First 1
if (-not $client) { @{ ok = $false; fehler = ('Kein Ordner Client-Ansi_* in ' + $o) } | ConvertTo-Json -Compress; return }
$bat = Join-Path $client.FullName 'install.bat'
if (-not (Test-Path -LiteralPath $bat)) { @{ ok = $false; fehler = ('install.bat fehlt in ' + $client.FullName) } | ConvertTo-Json -Compress; return }
$dateien = @(Get-ChildItem -LiteralPath $client.FullName -Recurse -File)
$mb = [math]::Round((($dateien | Measure-Object Length -Sum).Sum) / 1MB, 1)
$kopf = (@(Get-Content -LiteralPath $bat -TotalCount 40) -join [char]10)
$dd = @(Get-ChildItem -LiteralPath (Join-Path $o 'Outlook Add-In for drag and drop') -Filter '*.msi' -File | Sort-Object LastWriteTime -Descending) | Select-Object -First 1
$ng = @(Get-ChildItem -LiteralPath $o -Filter 'enaio_outlook_addin_ng*.msi' -File | Sort-Object LastWriteTime -Descending) | Select-Object -First 1
$fehlt = @()
if (-not $dd) { $fehlt += 'Outlook Add-In for drag and drop\*.msi' }
if (-not $ng) { $fehlt += 'enaio_outlook_addin_ng*.msi' }
@{ ok = ($fehlt.Count -eq 0); fehler = $(if ($fehlt.Count) { 'Nicht gefunden: ' + ($fehlt -join ', ') } else { '' });
   clientOrdner = $client.FullName; clientName = $client.Name; clientMB = $mb; clientDateien = $dateien.Count; installBatKopf = $kopf;
   ddMsi = $(if ($dd) { $dd.FullName } else { '' }); ngMsi = $(if ($ng) { $ng.FullName } else { '' }) } | ConvertTo-Json -Compress
`
  const r = await api().runPowerShell(script, 90000)
  const j = parseJson<Partial<EnaioQuelle>>(r.stdout)
  if (!j) return { ...leer, fehler: r.stderr?.trim() || 'Der Netzwerkordner konnte nicht gelesen werden.' }
  return { ...leer, ...j, ok: !!j.ok, fehler: j.fehler || undefined }
}

// ── Gemeinsame PowerShell-Bausteine (laufen AUF dem Ziel-PC) ─────────────────

/**
 * Was zählt als „enaio": Name oder Hersteller (OPTIMAL SYSTEMS). Das Drag-&-Drop-Add-In
 * heißt ggf. nur „OS … Outlook …" — deshalb das dritte Muster.
 */
const PS_GRUNDLAGEN = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$muster = 'enaio|optimal\s*systems'
$namMuster = 'enaio|optimal\s*systems|^os[ _-].*outlook'
function NutzerVon($sid) { try { (New-Object System.Security.Principal.SecurityIdentifier($sid)).Translate([System.Security.Principal.NTAccount]).Value } catch { $sid } }
function Hives { @(Get-ChildItem -LiteralPath 'Registry::HKEY_USERS' | Where-Object { $_.PSChildName -match '^S-1-5-21-[0-9-]+$' } | ForEach-Object { $_.PSChildName }) }
function Get-EnaioProgramme {
  $quellen = @(
    @{ P = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall'; W = 'Computer' },
    @{ P = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall'; W = 'Computer (32 Bit)' }
  )
  foreach ($s in Hives) { $quellen += @{ P = ('Registry::HKEY_USERS\' + $s + '\Software\Microsoft\Windows\CurrentVersion\Uninstall'); W = ('Benutzer ' + (NutzerVon $s)) } }
  $out = @()
  foreach ($q in $quellen) {
    foreach ($k in @(Get-ChildItem -LiteralPath $q.P)) {
      $p = Get-ItemProperty -LiteralPath $k.PSPath
      $dn = [string]$p.DisplayName
      if (-not $dn) { continue }
      if (-not (($dn -match $namMuster) -or ([string]$p.Publisher -match $muster))) { continue }
      $out += [pscustomobject]@{ name = $dn; version = [string]$p.DisplayVersion; publisher = [string]$p.Publisher; wo = $q.W;
        key = ($q.P + '\' + $k.PSChildName); child = [string]$k.PSChildName; uninstall = [string]$p.UninstallString;
        quiet = [string]$p.QuietUninstallString; install = [string]$p.InstallLocation }
    }
  }
  return $out
}
`

// ── Ist-Stand ────────────────────────────────────────────────────────────────

export interface EnaioProgramm { name: string; version: string; publisher: string; wo: string }

export interface EnaioStand {
  ok: boolean
  fehler?: string
  programme: EnaioProgramm[]
  /** Benutzer, unter denen Outlook gerade läuft. */
  outlook: string[]
  angemeldet: string
}

export function fernBefehl(host: string, inner: string, tag: string, payload?: string): string {
  const head = payload !== undefined ? `$b64 = '${payload}'\n` : ''
  const param = payload !== undefined ? 'param($b64)\n' : ''
  const args = payload !== undefined ? ' -ArgumentList $b64' : ''
  return `${head}try {
  $r = Invoke-Command -ComputerName '${esc(host)}' -ScriptBlock {
${param}${inner}
  }${args} -EA Stop
  $r | ForEach-Object { "$_" }
} catch { '${tag}' + (@{ ok = $false; fehler = ('' + $_.Exception.Message) } | ConvertTo-Json -Compress) }`
}

export function getagged<T>(stdout: string, tag: string): T | null {
  const i = (stdout || '').lastIndexOf(tag)
  if (i < 0) return null
  try { return JSON.parse(stdout.slice(i + tag.length).trim()) as T } catch { return null }
}

/** Verbindung herstellen (IP → TrustedHosts, dann WinRM). Liefert einen Fehlertext oder ''. */
export async function verbinde(host: string): Promise<string> {
  if (isIpv4(host)) { try { await ensureWinRmTrustedHost(host) } catch { /* WinRM meldet es */ } }
  try {
    if (!(await ensureWinRM(host))) return `${host} ist über WinRM nicht erreichbar (ausgeschaltet, nicht im Netz oder keine Berechtigung).`
  } catch (e) { return `WinRM-Aktivierung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` }
  return ''
}

const STAND_INNER = PS_GRUNDLAGEN + String.raw`
$ol = @(Get-Process -Name OUTLOOK -IncludeUserName | ForEach-Object { [string]$_.UserName } | Select-Object -Unique)
$angemeldet = ''
try { $angemeldet = [string](Get-CimInstance Win32_ComputerSystem).UserName } catch {}
'@@ENAIOSTAND@@' + ([pscustomobject]@{ ok = $true; programme = @(Get-EnaioProgramme | Select-Object name, version, publisher, wo); outlook = @($ol); angemeldet = $angemeldet } | ConvertTo-Json -Depth 4 -Compress)
`

/** Read-only: welche enaio-Programme sind installiert, läuft Outlook? */
export async function pruefeEnaioStand(host: string): Promise<EnaioStand> {
  const leer: EnaioStand = { ok: false, programme: [], outlook: [], angemeldet: '' }
  const f = await verbinde(host)
  if (f) return { ...leer, fehler: f }
  const r = await api().runPowerShell(fernBefehl(host, STAND_INNER, '@@ENAIOSTAND@@'), 120000)
  const j = getagged<{ ok?: boolean; fehler?: string; programme?: unknown; outlook?: unknown; angemeldet?: string }>(r.stdout, '@@ENAIOSTAND@@')
  if (!j) return { ...leer, fehler: r.stderr?.trim() || 'Keine Antwort vom Ziel-PC.' }
  if (j.ok === false) return { ...leer, fehler: j.fehler || 'Abfrage fehlgeschlagen.' }
  return {
    ok: true,
    programme: asArr<EnaioProgramm>(j.programme).filter(p => p && p.name),
    outlook: asArr<string>(j.outlook).filter(Boolean),
    angemeldet: j.angemeldet || '',
  }
}

// ── Vollständig entfernen ────────────────────────────────────────────────────

export interface EntfernenEintrag { art: string; was: string; ok: boolean; info: string }

/**
 * Schutzschranken wie in der Support-Tools-Deinstallation — sie gelten unabhängig davon,
 * was die Suche findet: keine Laufwerks-, Windows-, Programme-, Benutzer- oder AppData-
 * Wurzeln, keine Registry-Sammelschlüssel (SOFTWARE, Uninstall, Addins, Products …).
 */
const PS_SCHRANKEN = String.raw`
$geschuetzt = @('c:\','c:\windows','c:\windows\system32','c:\windows\syswow64','c:\program files','c:\program files (x86)','c:\programdata','c:\users','c:\users\public','c:\users\default','c:\temp')
function SafeDir($path) {
  $n = ("" + $path).TrimEnd('\'); if (-not $n) { return $false }
  $low = $n.ToLower(); if ($geschuetzt -contains $low) { return $false }
  $segs = @(($n -split '\\') | Where-Object { $_ -ne '' }); if ($segs.Count -lt 3) { return $false }
  if ($low -match '\\appdata\\(local|roaming|locallow)$') { return $false }
  if ($low -match '^[a-z]:\\users\\[^\\]+$') { return $false }
  if ($low -match '\\(desktop|documents|downloads|start menu|programs)$') { return $false }
  return $true
}
$sammel = @('software','microsoft','windows','currentversion','uninstall','classes','installer','products','features','userdata','office','outlook','addins','wow6432node','hkey_local_machine','hkey_users','hkey_current_user')
function SafeKey($path) {
  $n = (("" + $path) -replace '^Microsoft\.PowerShell\.Core\\', '' -replace '^Registry::', '').TrimEnd('\')
  $segs = @(($n -split '\\') | Where-Object { $_ -ne '' })
  if ($segs.Count -lt 3) { return $false }
  $blatt = $segs[$segs.Count - 1].ToLower()
  if ($sammel -contains $blatt) { return $false }
  if ($blatt -match '^s-1-5-') { return $false }
  return $true
}
`

const ENTFERNEN_INNER = PS_GRUNDLAGEN + PS_SCHRANKEN + String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$log = New-Object System.Collections.ArrayList
function L($art, $was, $ok, $info) { [void]$log.Add([pscustomobject]@{ art = $art; was = "$was"; ok = [bool]$ok; info = "$info" }) }
$tmp = '${LOG_ORDNER}'
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

# 1) Outlook (auf Wunsch) und laufende enaio-Programme beenden — sonst sind Dateien gesperrt
if ($o.outlookBeenden) {
  $pp = @(Get-Process -Name OUTLOOK)
  if ($pp.Count) { $pp | Stop-Process -Force; Start-Sleep -Seconds 3; L 'prozess' 'Outlook beendet' $true ('' + $pp.Count + ' Prozess(e)') }
}
foreach ($x in @(Get-Process | Where-Object { $_.Path -and ($_.Path -match $muster) })) {
  try { Stop-Process -Id $x.Id -Force -EA Stop; L 'prozess' ('Beendet: ' + $x.ProcessName) $true $x.Path } catch { L 'prozess' ('Beendet: ' + $x.ProcessName) $false $_.Exception.Message }
}

# 2) Deinstaller jedes enaio-Programms (MSI still, sonst Quiet-/Uninstall-String)
$vorher = @(Get-EnaioProgramme)
$i = 0
foreach ($p in $vorher) {
  $i++
  $guid = ''
  if ($p.child -match '^\{[0-9A-Fa-f-]+\}$') { $guid = $p.child } elseif (($p.uninstall -match 'msiexec') -and ($p.uninstall -match '(\{[0-9A-Fa-f-]+\})')) { $guid = $Matches[1] }
  $info = ''
  try {
    if ($guid) {
      $pr = Start-Process msiexec.exe -ArgumentList ('/x ' + $guid + ' /qn /norestart REBOOT=ReallySuppress /l*v "' + $tmp + '\deinstall_' + $i + '.log"') -Wait -PassThru
      $info = 'msiexec Exitcode ' + $pr.ExitCode
      if ($pr.ExitCode -eq 1605) { $info += ' (für diesen Benutzer nicht installiert — Reste werden entfernt)' }
    } elseif ($p.quiet) {
      $pr = Start-Process cmd.exe -ArgumentList ('/c "' + $p.quiet + '"') -Wait -PassThru -WindowStyle Hidden
      $info = 'Exitcode ' + $pr.ExitCode
    } elseif ($p.uninstall) {
      $u = $p.uninstall
      if ($u -match 'unins[0-9]') { $c = $u + ' /VERYSILENT /SUPPRESSMSGBOXES /NORESTART' } else { $c = $u + ' /S /silent /quiet /norestart' }
      $pr = Start-Process cmd.exe -ArgumentList ('/c "' + $c + '"') -Wait -PassThru -WindowStyle Hidden
      $info = 'Exitcode ' + $pr.ExitCode
    } else { $info = 'kein Deinstaller hinterlegt — nur Reste werden entfernt' }
  } catch { $info = $_.Exception.Message }
  Start-Sleep -Seconds 2
  $noch = Test-Path -LiteralPath $p.key
  L 'deinstallation' ($p.name + ' ' + $p.version + ' (' + $p.wo + ')') (-not $noch) $(if ($noch) { 'Deinstaller hat den Eintrag nicht entfernt — wird unten als Rest gelöscht; ' + $info } else { $info })
}

# 3) Registry-Reste sammeln
$hv = @(Hives | ForEach-Object { 'Registry::HKEY_USERS\' + $_ })
$keys = New-Object System.Collections.ArrayList
function K($pfad, $warum) { if ($pfad -and -not (@($keys) | Where-Object { $_.p -eq $pfad })) { [void]$keys.Add([pscustomobject]@{ p = $pfad; w = $warum }) } }
foreach ($p in @(Get-EnaioProgramme)) { K $p.key ('Deinstallations-Eintrag: ' + $p.name) }
$softBasen = @('Registry::HKEY_LOCAL_MACHINE\SOFTWARE', 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node') + @($hv | ForEach-Object { $_ + '\Software' }) + @($hv | ForEach-Object { $_ + '\Software\WOW6432Node' })
foreach ($b in $softBasen) { foreach ($k in @(Get-ChildItem -LiteralPath $b)) { if ($k.PSChildName -match $muster) { K ($b + '\' + $k.PSChildName) ('Herstellerschlüssel ' + $k.PSChildName) } } }
$addinBasen = @('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Office\Outlook\Addins', 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Office\Outlook\Addins') + @($hv | ForEach-Object { $_ + '\Software\Microsoft\Office\Outlook\Addins' })
foreach ($b in $addinBasen) {
  foreach ($k in @(Get-ChildItem -LiteralPath $b)) {
    $pr = Get-ItemProperty -LiteralPath $k.PSPath
    $txt = ($k.PSChildName + ' ' + [string]$pr.FriendlyName + ' ' + [string]$pr.Description + ' ' + [string]$pr.Manifest)
    if ($txt -match $muster) { K ($b + '\' + $k.PSChildName) ('Outlook-Add-In-Registrierung ' + $k.PSChildName) }
  }
}
# Windows-Installer-Registrierung — bliebe sie stehen, hält msiexec das Produkt für installiert
$prodBasen = @('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Classes\Installer\Products') + @($hv | ForEach-Object { $_ + '\Software\Microsoft\Installer\Products' })
foreach ($b in $prodBasen) {
  foreach ($k in @(Get-ChildItem -LiteralPath $b)) {
    $pn = [string](Get-ItemProperty -LiteralPath $k.PSPath).ProductName
    if ($pn -match $muster) {
      K ($b + '\' + $k.PSChildName) ('Windows-Installer-Produkt ' + $pn)
      $feat = ($b -replace '\\Products$', '\Features') + '\' + $k.PSChildName
      if (Test-Path -LiteralPath $feat) { K $feat ('Windows-Installer-Features ' + $pn) }
    }
  }
}
$ud = 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Installer\UserData'
foreach ($u in @(Get-ChildItem -LiteralPath $ud)) {
  $pb = $ud + '\' + $u.PSChildName + '\Products'
  foreach ($k in @(Get-ChildItem -LiteralPath $pb)) {
    $dn = [string](Get-ItemProperty -LiteralPath ($pb + '\' + $k.PSChildName + '\InstallProperties')).DisplayName
    if ($dn -match $muster) { K ($pb + '\' + $k.PSChildName) ('Windows-Installer-Daten ' + $dn) }
  }
}

# 4) Ordner sammeln
$ordner = New-Object System.Collections.ArrayList
function O($pfad, $warum) { $pfad = ("" + $pfad).TrimEnd('\'); if ($pfad -and -not (@($ordner) | Where-Object { $_.p -eq $pfad })) { [void]$ordner.Add([pscustomobject]@{ p = $pfad; w = $warum }) } }
foreach ($p in $vorher) { if ($p.install) { O $p.install ('Installationsordner ' + $p.name) } }
$pf86 = (Get-Item 'Env:ProgramFiles(x86)').Value
foreach ($b in @($env:ProgramFiles, $pf86, $env:ProgramData)) { if ($b) { foreach ($d in @(Get-ChildItem -LiteralPath $b -Directory)) { if ($d.Name -match $muster) { O $d.FullName ('Ordner ' + $d.Name) } } } }
$profilOrdner = @(Get-ChildItem -LiteralPath 'C:\Users' -Directory -Force | Where-Object { $_.Name -notmatch '^(Public|Default|Default User|All Users)$' })
foreach ($pr in $profilOrdner) {
  foreach ($sub in @('AppData\Local', 'AppData\Roaming', 'AppData\LocalLow')) {
    foreach ($d in @(Get-ChildItem -LiteralPath (Join-Path $pr.FullName $sub) -Directory -Force)) { if ($d.Name -match $muster) { O $d.FullName ('Benutzerdaten ' + $pr.Name + ': ' + $d.Name) } }
  }
}
# Startmenü-Ordner
$sm = @("$env:ProgramData\Microsoft\Windows\Start Menu\Programs") + @($profilOrdner | ForEach-Object { Join-Path $_.FullName 'AppData\Roaming\Microsoft\Windows\Start Menu\Programs' })
foreach ($s in $sm) { foreach ($d in @(Get-ChildItem -LiteralPath $s -Directory -Recurse)) { if ($d.Name -match $muster) { O $d.FullName ('Startmenü-Ordner ' + $d.Name) } } }

# 5) Dienste und Aufgaben
foreach ($svc in @(Get-CimInstance Win32_Service | Where-Object { (("" + $_.Name + ' ' + $_.DisplayName + ' ' + $_.PathName) -match $muster) })) {
  try { Stop-Service -Name $svc.Name -Force -EA SilentlyContinue; & sc.exe delete $svc.Name | Out-Null; L 'dienst' ('Dienst ' + $svc.DisplayName) $true $svc.Name } catch { L 'dienst' ('Dienst ' + $svc.DisplayName) $false $_.Exception.Message }
}
try {
  foreach ($t in @(Get-ScheduledTask | Where-Object { $_.TaskPath -notlike '\Microsoft\*' })) {
    $ex = (@($t.Actions | ForEach-Object { "" + $_.Execute }) -join ' ')
    if (($t.TaskName + ' ' + $ex) -match $muster) {
      try { Unregister-ScheduledTask -TaskName $t.TaskName -TaskPath $t.TaskPath -Confirm:$false -EA Stop; L 'aufgabe' ('Aufgabe ' + $t.TaskName) $true $t.TaskPath } catch { L 'aufgabe' ('Aufgabe ' + $t.TaskName) $false $_.Exception.Message }
    }
  }
} catch {}

# 6) Löschen — Registry, Ordner, Verknüpfungen
foreach ($k in @($keys)) {
  if (-not (SafeKey $k.p)) { L 'registry' $k.w $false ('geschützt, übersprungen: ' + $k.p); continue }
  if (-not (Test-Path -LiteralPath $k.p)) { L 'registry' $k.w $true 'bereits entfernt'; continue }
  try { Remove-Item -LiteralPath $k.p -Recurse -Force -EA Stop; L 'registry' $k.w $true ($k.p -replace '^Registry::', '') } catch { L 'registry' $k.w $false $_.Exception.Message }
}
foreach ($d in @($ordner)) {
  if (-not (SafeDir $d.p)) { L 'ordner' $d.w $false ('geschützt, übersprungen: ' + $d.p); continue }
  if (-not (Test-Path -LiteralPath $d.p)) { L 'ordner' $d.w $true 'bereits entfernt'; continue }
  try { Remove-Item -LiteralPath $d.p -Recurse -Force -EA Stop } catch { & cmd.exe /c ('rd /s /q "' + $d.p + '"') 2>&1 | Out-Null }
  if (Test-Path -LiteralPath $d.p) { L 'ordner' $d.w $false ('nicht vollständig löschbar (Datei in Benutzung?): ' + $d.p) } else { L 'ordner' $d.w $true $d.p }
}
$lnkOrte = @('C:\Users\Public\Desktop') + $sm + @($profilOrdner | ForEach-Object { Join-Path $_.FullName 'Desktop' })
foreach ($ort in $lnkOrte) {
  foreach ($f in @(Get-ChildItem -LiteralPath $ort -Filter '*.lnk' -File -Recurse)) {
    if ($f.BaseName -match $muster) { try { Remove-Item -LiteralPath $f.FullName -Force -EA Stop; L 'verknuepfung' ('Verknüpfung ' + $f.BaseName) $true $f.FullName } catch { L 'verknuepfung' ('Verknüpfung ' + $f.BaseName) $false $_.Exception.Message } }
  }
}

$rest = @(Get-EnaioProgramme | ForEach-Object { $_.name + ' (' + $_.wo + ')' })
'@@ENAIOWEG@@' + ([pscustomobject]@{ ok = $true; log = @($log); rest = @($rest) } | ConvertTo-Json -Depth 4 -Compress)
`

export async function entferneEnaio(host: string, outlookBeenden: boolean): Promise<{ ok: boolean; fehler?: string; log: EntfernenEintrag[]; rest: string[] }> {
  const payload = b64(JSON.stringify({ outlookBeenden }))
  const r = await api().runPowerShell(fernBefehl(host, ENTFERNEN_INNER, '@@ENAIOWEG@@', payload), 30 * 60 * 1000)
  const j = getagged<{ ok?: boolean; fehler?: string; log?: unknown; rest?: unknown }>(r.stdout, '@@ENAIOWEG@@')
  if (!j) return { ok: false, fehler: r.timedOut ? 'Zeitüberschreitung beim Entfernen (30 Minuten).' : (r.stderr?.trim() || 'Keine Antwort vom Ziel-PC.'), log: [], rest: [] }
  if (j.ok === false) return { ok: false, fehler: j.fehler || 'Entfernen fehlgeschlagen.', log: [], rest: [] }
  return { ok: true, log: asArr<EntfernenEintrag>(j.log), rest: asArr<string>(j.rest).filter(Boolean) }
}

// ── Installation ─────────────────────────────────────────────────────────────

export type SchrittStatus = 'offen' | 'laeuft' | 'ok' | 'fehler' | 'warnung'
export interface EnaioSchritt { id: string; label: string; status: SchrittStatus; info?: string }

export function enaioSchritte(mitEntfernen: boolean): { id: string; label: string }[] {
  return [
    { id: 'quelle', label: 'Installationsdateien im Netzwerk suchen' },
    { id: 'ziel', label: 'Ziel-PC erreichbar prüfen' },
    ...(mitEntfernen ? [{ id: 'entfernen', label: 'Enaio vollständig entfernen (Programme, Add-Ins, Ordner, Registry)' }] : []),
    { id: 'kopie', label: `Client-Ordner und Add-Ins nach ${ZIEL_TEMP} kopieren` },
    { id: 'client', label: 'enaio Client installieren (install.bat)' },
    { id: 'dd', label: 'Outlook-Add-In „Drag and Drop" installieren' },
    { id: 'ng', label: 'enaio Outlook-Add-In (NG) installieren' },
    { id: 'pruefen', label: 'Installation prüfen' },
  ]
}

export interface EnaioErgebnis {
  ok: boolean
  text: string
  neustartNoetig?: boolean
  /** Protokoll des Entfernens (falls gewählt). */
  entfernt?: EntfernenEintrag[]
  installiert?: EnaioProgramm[]
}

function deuteMsi(code: number): { ok: boolean; neustart: boolean; text: string } {
  if (code === 0) return { ok: true, neustart: false, text: 'erfolgreich' }
  if (code === 3010 || code === 1641) return { ok: true, neustart: true, text: 'erfolgreich — Neustart ausstehend' }
  if (code === 1618) return { ok: false, neustart: false, text: 'eine andere Installation läuft gerade (1618)' }
  if (code === 1638) return { ok: false, neustart: false, text: 'eine andere Version ist bereits installiert (1638) — „vorher entfernen" wählen' }
  if (code === 1603) return { ok: false, neustart: false, text: 'fehlgeschlagen (1603) — Details im Protokoll auf dem PC' }
  if (code === 1625) return { ok: false, neustart: false, text: 'durch Richtlinie verboten (1625)' }
  return { ok: false, neustart: false, text: `Exitcode ${code}` }
}

type Melder = (id: string, status: SchrittStatus, info?: string) => void

const MSI_INNER = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
try {
  # ALLUSERS=1: für alle Benutzer des PCs — die Sitzung läuft als Admin, eine Benutzer-
  # Installation landete sonst im Profil des Admins statt beim Anwender.
  $pr = Start-Process msiexec.exe -ArgumentList ('/i "' + $o.msi + '" /qn /norestart ALLUSERS=1 /l*v "' + $o.log + '"') -Wait -PassThru
  '@@ENAIOMSI@@' + (@{ ok = $true; code = $pr.ExitCode } | ConvertTo-Json -Compress)
} catch { '@@ENAIOMSI@@' + (@{ ok = $false; fehler = $_.Exception.Message } | ConvertTo-Json -Compress) }
`

const CLIENT_INNER = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
try {
  $bat = Join-Path $o.ordner 'install.bat'
  # < nul: ein „pause" in der Batch hält nicht an · Ausgabe ins Protokoll
  $arg = '/c ""' + $bat + '" < nul > "' + $o.log + '" 2>&1"'
  $pr = Start-Process cmd.exe -ArgumentList $arg -WorkingDirectory $o.ordner -Wait -PassThru -WindowStyle Hidden
  $ende = (@(Get-Content -LiteralPath $o.log -Tail 12) -join [char]10)
  '@@ENAIOCLIENT@@' + (@{ ok = $true; code = $pr.ExitCode; ende = $ende } | ConvertTo-Json -Compress)
} catch { '@@ENAIOCLIENT@@' + (@{ ok = $false; fehler = $_.Exception.Message } | ConvertTo-Json -Compress) }
`

function dateiname(pfad: string): string { return pfad.split('\\').pop() || pfad }

/**
 * Enaio auf dem Ziel-PC installieren — auf Wunsch vorher vollständig entfernen.
 * Meldet jeden Schritt über `melde`.
 */
export async function installiereEnaio(
  host: string, opt: { entfernen: boolean; outlookBeenden: boolean }, melde: Melder,
): Promise<EnaioErgebnis> {
  // 1) Quelle
  melde('quelle', 'laeuft')
  const q = await findeEnaioQuelle()
  if (!q.ok) { melde('quelle', 'fehler', q.fehler); return { ok: false, text: q.fehler || 'Installationsdateien nicht gefunden.' } }
  melde('quelle', 'ok', `${q.clientName} (${q.clientDateien} Dateien, ${q.clientMB} MB) · ${dateiname(q.ddMsi)} · ${dateiname(q.ngMsi)}`)

  // 2) Ziel
  melde('ziel', 'laeuft')
  const f = await verbinde(host)
  if (f) { melde('ziel', 'fehler', f); return { ok: false, text: f } }
  const tempUnc = `\\\\${host}\\C$\\temp`
  const share = await api().runPowerShell(`if (Test-Path -LiteralPath '\\\\${esc(host)}\\C$\\Windows') { 'OK' } else { 'NEIN' }`, 45000)
  if (!(share.stdout || '').includes('OK')) {
    const t = `Auf die Admin-Freigabe \\\\${host}\\C$ ist kein Zugriff möglich — ohne sie lassen sich die Dateien nicht übertragen.`
    melde('ziel', 'fehler', t); return { ok: false, text: t }
  }
  melde('ziel', 'ok', `${host} erreichbar`)

  // 3) Entfernen (optional)
  let entfernt: EntfernenEintrag[] | undefined
  if (opt.entfernen) {
    melde('entfernen', 'laeuft', 'Deinstallieren und Reste löschen — dauert meist 2–10 Minuten.')
    const w = await entferneEnaio(host, opt.outlookBeenden)
    if (!w.ok) { melde('entfernen', 'fehler', w.fehler); return { ok: false, text: `Entfernen fehlgeschlagen: ${w.fehler}` } }
    entfernt = w.log
    const schief = w.log.filter(l => !l.ok)
    const zahl = (a: string) => w.log.filter(l => l.art === a && l.ok).length
    const info = `${zahl('deinstallation')} Programm(e) deinstalliert · ${zahl('registry')} Registry-Schlüssel · ${zahl('ordner')} Ordner · ${zahl('verknuepfung')} Verknüpfungen entfernt`
      + (schief.length ? ` · ${schief.length} Punkt(e) nicht entfernt` : '')
      + (w.rest.length ? ` · noch gelistet: ${w.rest.join(', ')}` : '')
    melde('entfernen', schief.length || w.rest.length ? 'warnung' : 'ok', info)
  }

  // 4) Kopieren (Admin-PC als Mittelsmann)
  melde('kopie', 'laeuft', `${q.clientMB} MB werden übertragen …`)
  const zielClient = `${tempUnc}\\${q.clientName}`
  const zielAddins = `${tempUnc}\\${ADDIN_ORDNER}`
  const kopie = await api().runPowerShell([
    ROBOCOPY_PS,
    `$c = Copy-SkfTree '${esc(q.clientOrdner)}' '${esc(zielClient)}'`,
    `$qn = @(Get-ChildItem -LiteralPath '${esc(q.clientOrdner)}' -Recurse -File).Count`,
    `$zn = @(Get-ChildItem -LiteralPath '${esc(zielClient)}' -Recurse -File).Count`,
    `$d1 = Copy-SkfFile '${esc(q.ddMsi)}' '${esc(zielAddins)}'`,
    `$d2 = Copy-SkfFile '${esc(q.ngMsi)}' '${esc(zielAddins)}'`,
    `$bat = Test-Path -LiteralPath '${esc(zielClient)}\\install.bat'`,
    `$m1 = Test-Path -LiteralPath '${esc(zielAddins)}\\${esc(dateiname(q.ddMsi))}'`,
    `$m2 = Test-Path -LiteralPath '${esc(zielAddins)}\\${esc(dateiname(q.ngMsi))}'`,
    `if ($bat -and $m1 -and $m2 -and $zn -ge $qn) { 'OK:' + $zn } else { 'ERR:Kopie unvollständig (robocopy ' + $c + '/' + $d1 + '/' + $d2 + ', ' + $zn + ' von ' + $qn + ' Dateien)' }`,
  ].join('\n'), 30 * 60 * 1000)
  const kz = (kopie.stdout || '').split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith('OK:') || l.startsWith('ERR:'))
  if (!kz || kz.startsWith('ERR:')) {
    const t = kz ? kz.slice(4) : (kopie.stderr?.trim() || 'Die Kopie auf den Ziel-PC ist fehlgeschlagen.')
    melde('kopie', 'fehler', t); return { ok: false, text: t, entfernt }
  }
  melde('kopie', 'ok', `${kz.slice(3)} Dateien nach ${ZIEL_TEMP}\\${q.clientName}, Add-Ins nach ${ZIEL_TEMP}\\${ADDIN_ORDNER}`)

  // 5) Client
  melde('client', 'laeuft', 'install.bat läuft im Hintergrund — das kann 5–20 Minuten dauern.')
  const clientLog = `${ZIEL_TEMP}\\enaio_install_client.log`
  const cr = await api().runPowerShell(fernBefehl(host, CLIENT_INNER, '@@ENAIOCLIENT@@',
    b64(JSON.stringify({ ordner: `${ZIEL_TEMP}\\${q.clientName}`, log: clientLog }))), 45 * 60 * 1000)
  const cj = getagged<{ ok?: boolean; code?: number; ende?: string; fehler?: string }>(cr.stdout, '@@ENAIOCLIENT@@')
  if (!cj || cj.ok === false) {
    const t = cj?.fehler || (cr.timedOut ? 'Zeitüberschreitung: install.bat hat sich nicht innerhalb von 45 Minuten beendet (wartet sie evtl. auf eine Eingabe?).' : (cr.stderr?.trim() || 'Keine Rückmeldung vom Ziel-PC.'))
    melde('client', 'fehler', t); return { ok: false, text: t, entfernt }
  }
  // Der Exitcode einer Batch ist nur der des letzten Befehls — maßgeblich ist die Gegenprobe am Ende.
  const clientCode = cj.code ?? 0
  const clientOk = clientCode === 0 || clientCode === 3010 || clientCode === 1641
  melde('client', clientOk ? 'ok' : 'warnung', `Exitcode ${clientCode}${cj.ende ? ` · Ende des Protokolls: ${cj.ende.replace(/\s+/g, ' ').slice(-300)}` : ''} · Protokoll: ${clientLog}`)
  let neustart = clientCode === 3010 || clientCode === 1641

  // 6) + 7) Outlook-Add-Ins
  for (const [id, msi] of [['dd', q.ddMsi], ['ng', q.ngMsi]] as const) {
    melde(id, 'laeuft')
    const name = dateiname(msi)
    const log = `${ZIEL_TEMP}\\${ADDIN_ORDNER}\\${name.replace(/\.msi$/i, '')}.log`
    const mr = await api().runPowerShell(fernBefehl(host, MSI_INNER, '@@ENAIOMSI@@',
      b64(JSON.stringify({ msi: `${ZIEL_TEMP}\\${ADDIN_ORDNER}\\${name}`, log }))), 20 * 60 * 1000)
    const mj = getagged<{ ok?: boolean; code?: number; fehler?: string }>(mr.stdout, '@@ENAIOMSI@@')
    if (!mj || mj.ok === false) {
      const t = mj?.fehler || (mr.stderr?.trim() || 'Keine Rückmeldung vom Ziel-PC.')
      melde(id, 'fehler', t); return { ok: false, text: `${name}: ${t}`, entfernt }
    }
    const d = deuteMsi(mj.code ?? -1)
    neustart = neustart || d.neustart
    melde(id, d.ok ? 'ok' : 'fehler', `${name}: ${d.text}${d.ok ? '' : ` · Protokoll: ${log}`}`)
    if (!d.ok) return { ok: false, text: `${name}: ${d.text}. Protokoll auf dem PC: ${log}`, entfernt }
  }

  // 8) Gegenprobe — „Exitcode 0" allein ist kein Beweis
  melde('pruefen', 'laeuft')
  const nach = await pruefeEnaioStand(host)
  if (!nach.ok) {
    melde('pruefen', 'warnung', nach.fehler || 'Nachprüfung nicht möglich.')
    return { ok: true, text: `Enaio wurde auf ${host} installiert; die Nachprüfung war nicht möglich.`, neustartNoetig: neustart, entfernt }
  }
  const progs = nach.programme
  const istAddin = (n: string) => /outlook|add-?in/i.test(n)
  const client = progs.filter(p => !istAddin(p.name))
  const addins = progs.filter(p => istAddin(p.name))
  const liste = progs.map(p => `${p.name}${p.version ? ' ' + p.version : ''}`).join(' · ')
  if (!progs.length) {
    const t = 'Die Installer liefen durch, in der Programmliste des PCs steht aber kein enaio-Programm.'
    melde('pruefen', 'fehler', t); return { ok: false, text: t, entfernt }
  }
  const vollstaendig = client.length > 0 && addins.length >= 2
  melde('pruefen', vollstaendig ? 'ok' : 'warnung', (vollstaendig ? '' : 'Nicht alle drei Teile eindeutig erkannt — bitte Liste prüfen: ') + liste)
  const outlookHinweis = nach.outlook.length ? ' Outlook läuft noch — die Add-Ins erscheinen nach einem Neustart von Outlook.' : ''
  return {
    ok: true,
    text: `Enaio wurde auf ${host} ${opt.entfernen ? 'sauber neu ' : ''}installiert: ${liste}.${outlookHinweis}`,
    neustartNoetig: neustart,
    entfernt,
    installiert: progs,
  }
}

/** Die Fern-Skripte — exportiert, damit sie sich ohne Ziel-PC auf Syntax prüfen lassen. */
export const ENAIO_SKRIPTE = { PS_GRUNDLAGEN, PS_SCHRANKEN, STAND_INNER, ENTFERNEN_INNER, CLIENT_INNER, MSI_INNER, fernBefehl }
