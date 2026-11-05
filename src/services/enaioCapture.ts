// ── Enaio Capture (Scan-Arbeitsplatz) — Zusatzbaustein der Kachel „Enaio" ─────
// NUR für den Spezial-PC am Scanner (Fujitsu fi-7160). Für die normale enaio-Installation
// nicht nötig. Grundlage: „Installation enaio Capture 9.0 Arbeitsplatz TWAIN.docx" (und
// die ältere 8.10-Fassung). Was das Tool gegenüber der Anleitung vereinfacht:
//
//   · Laufwerk: D:\OS\OSECM nur, wenn der PC wirklich eine LOKALE Platte D: hat — sonst
//     C:\OS\OSECM. Die Anleitung verlangte D:, weil die Konfiguration absolute Pfade
//     enthält; diese Pfade werden nach dem Kopieren automatisch umgeschrieben.
//   · Quellen statt Laufwerksbuchstaben (S:, D:): zentral einstellbare UNC-Pfade.
//   · ODBC „OSCAPTURE" (32 Bit, Access) wird angelegt bzw. korrigiert — kein Klicken
//     im ODBC-Dialog mehr.
//   · Capture-Setup (InstallShield): beim ERSTEN Mal sichtbar am PC (das Tool zeigt, was
//     anzuklicken ist) und dabei mit /r aufgezeichnet. Die Antwortdatei liegt danach
//     zentral — ab dem nächsten PC läuft das Setup still (/s).
//   · Kofax Retrieval Engine, TWAIN-Treiber, DATA2SAP-Registrierung: sichtbar auf dem
//     Bildschirm des Anwenders (PsExec -i -s), weil diese Setups Klicks erwarten.
//
// Was Handarbeit bleibt (vom Tool als Checkliste angezeigt): Capture-Lizenzen im enaio
// Enterprise Manager zuweisen, DATA2SAP „config", Feinheiten der Scan-Konfiguration.

import { api } from '../electronAPI'
import { ROBOCOPY_PS } from '../utils/robocopy'
import { pathService } from './pathService'
import { esc, b64, asArr, fernBefehl, getagged, verbinde, ladeEnaioQuellordner } from './enaioInstall'

// ── Quellen ──────────────────────────────────────────────────────────────────
// Die Anleitungen nennen \\vm0127\D$\INSTALL\enaio-9.0SP1_Win32 — den Server gibt es
// NICHT mehr. Deshalb sucht das Tool das Capture-Setup über eine Kette von Ausweich-
// Quellen und sagt zu jeder, warum sie nicht ging (Server weg / kein Zugriff / fehlt):
//   1. selbst gewählter Ordner
//   2. der aktuelle enaio-Ordner (I:\Public\Public\Enaio — dort liegt Client-Ansi_11.x)
//   3. SW_INSTA\ENAIO (das frühere „S:")
//   4. ein vorhandener Scan-Arbeitsplatz (Vorlage-PC) — laut 8.10-Anleitung lag das
//      Setup dort unter D:\enaio-…; die Konfiguration soll ohnehin von dort kommen
//   5. (beim Lauf) eine Kopie aus einem früheren Versuch auf dem Ziel-PC

/**
 * „S:\SW_INSTA\ENAIO\Scanclient" aus der Anleitung. S: war früher \\MS70_M\…; heute liegt
 * SW_INSTA unter \\W3172\SKF Marine\700 Application\711 IT Allgemein — daraus abgeleitet,
 * in der Kachel prüf- und änderbar.
 */
export const SCANCLIENT_STANDARD = pathService.getMarineRoot('unc') + '\\700 Application\\711 IT Allgemein\\SW_INSTA\\ENAIO\\Scanclient'

const QUELLE_STORE = 'config/software/enaio_capture/quelle.json'
/** Aufgezeichnete Setup-Antworten (zentral, für alle Admin-PCs). */
export const ANTWORT_DATEI = pathService.getToolRoot('unc') + '\\config\\software\\enaio_capture\\capture_setup.iss'

/** Arbeitsordner auf dem Ziel-PC — bewusst OHNE Leerzeichen (Setup-Schalter /f1"…"). */
const ZIEL = 'C:\\Install\\enaio_capture'

export interface CaptureQuellen {
  /** Ordner mit dem Capture-Setup — leer = automatisch suchen. */
  setup: string
  scanclient: string
  /** Scan-Konfiguration — leer = automatisch. */
  konfig: string
  /** Vorhandener Scan-Arbeitsplatz als Vorlage (Hostname) — optional. */
  vorlagePc: string
  /** enaio-Server für den Setup-Dialog — leer = aus dem Client-Paket ermitteln. */
  server: string
}

const LEER_QUELLEN: CaptureQuellen = { setup: '', scanclient: SCANCLIENT_STANDARD, konfig: '', vorlagePc: '', server: '' }

export async function ladeCaptureQuellen(): Promise<CaptureQuellen> {
  try {
    const d = await api().netReadJson<Partial<CaptureQuellen>>(QUELLE_STORE)
    const setup = (d?.setup || '').trim()
    return {
      // Alt-Eintrag auf den abgeschalteten Server nicht mehr verwenden
      setup: /\\\\vm0127\\/i.test(setup) ? '' : setup,
      scanclient: d?.scanclient?.trim() || SCANCLIENT_STANDARD,
      konfig: d?.konfig?.trim() || '',
      vorlagePc: d?.vorlagePc?.trim() || '',
      server: d?.server?.trim() || '',
    }
  } catch { return { ...LEER_QUELLEN } }
}

export async function setzeCaptureQuellen(q: CaptureQuellen): Promise<boolean> {
  try { return await api().netWriteJson(QUELLE_STORE, q) } catch { return false }
}

export interface QuellDiagnose { was: string; pfad: string; ergebnis: string }

export interface CaptureFund {
  ok: boolean               // Setup gefunden (alles andere ist optional)
  fehler: string[]          // Hinweise zu fehlenden Teilen
  setupExe: string
  setupOrdner: string       // wird komplett kopiert
  setupRel: string          // Pfad der setup.exe innerhalb von setupOrdner
  setupQuelle: string       // woher (Klartext)
  setupMB: number
  setupVersion: string      // aus dem Pfad, z. B. „9.0" oder „11.10"
  /** Capture als MSI (enaio 10/11, „Frontend\Capture") — hat Vorrang, wenn mindestens so neu wie das Setup */
  msiPfad: string
  msiOrdner: string
  msiName: string
  msiVersion: string
  msiQuelle: string
  msiMB: number
  clientVersion: string     // Version des normalen enaio-Client-Pakets (Client-Ansi_11.10 → „11.10")
  kofaxExe: string
  kofaxOrdner: string
  twainExe: string          // fi-7160 TWAIN 32 Bit
  isisExe: string           // fi-6140 ISIS (alt)
  konfigOrdner: string
  konfigDateien: number
  konfigVonPc: boolean      // Konfiguration kommt vom Vorlage-PC (ohne Programmdateien kopieren)
  data2sapOrdner: string
  antwortDatei: boolean     // Setup-Antworten schon aufgezeichnet?
  server: string            // für den Setup-Dialog
  serverKandidaten: string[] // SERVERn-Einträge der Client-asinit.cfg (z. B. enaioprod/enaiotest)
  comstring: string          // „Comstring=" der Client-asinit.cfg, z. B. „enaioprod.skf.net#4000"
  asinitPfad: string
  diagnose: QuellDiagnose[]
}

/** Alle Bestandteile über die Ausweich-Kette suchen (auf dem Admin-PC). */
export async function findeCaptureQuellen(): Promise<CaptureFund> {
  const q = await ladeCaptureQuellen()
  const enaioOrdner = await ladeEnaioQuellordner()
  const swInsta = q.scanclient.replace(/\\Scanclient\\?$/i, '')
  // enaio-Server als Setup-Quelle (Medien unter D$\INSTALL wie früher bei VM0127) — ohne SQL
  const srvNamen = new Set<string>([zerlegeServer(STANDARD_SERVER).name])
  try {
    const inv = await api().netReadJson<{ name?: string; description?: string; category?: string }[]>('inventory/inventory.json')
    for (const it of Array.isArray(inv) ? inv : []) {
      const t = `${it.name || ''} ${it.description || ''}`
      if (it.category === 'Server' && it.name && /enaio/i.test(t) && !/\bsql\b/i.test(t)) srvNamen.add(it.name.trim())
    }
  } catch { /* ohne Inventar nur der Standard */ }
  const q2srv = [...srvNamen].map(n => `'${esc(n)}'`).join(', ')
  const script = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$q = @{ setup = '${esc(q.setup)}'; sc = '${esc(q.scanclient)}'; kf = '${esc(q.konfig)}'; pc = '${esc(q.vorlagePc)}'; enaio = '${esc(enaioOrdner)}'; sw = '${esc(swInsta)}' }
$diag = New-Object System.Collections.ArrayList
function D($was, $pfad, $erg) { [void]$diag.Add([pscustomobject]@{ was = $was; pfad = "$pfad"; ergebnis = "$erg" }) }
$hostOk = @{}
function Grund($p) {
  if ($p -match '^\\\\([^\\]+)\\') {
    $h = $Matches[1].ToLower()
    if (-not $hostOk.ContainsKey($h)) { $hostOk[$h] = [bool](Test-Connection -ComputerName $h -Count 1 -Quiet) }
    if (-not $hostOk[$h]) { return ('Rechner ' + $h + ' antwortet nicht (gibt es ihn noch?)') }
  }
  try { $null = Get-ChildItem -LiteralPath $p -EA Stop | Select-Object -First 1; return '' } catch { return $_.Exception.Message }
}
$fremd = 'kofax|treiber|twain|isis|paperstream|scan_konfig|data2sap'
# Version aus dem Pfad (enaio-9.0SP1, enaio-11.10 …) — die setup.exe selbst trägt oft nur
# die InstallShield-Version. Gewählt wird die HÖCHSTE enaio-Version, nicht die neueste Datei.
function Ver($f) {
  $v = $null
  if ($f.FullName -match '(?i)enaio[^\\]*?(\d{1,2})[._](\d{1,2})') { $v = [version]($Matches[1] + '.' + $Matches[2]) }
  elseif ($f.FullName -match '(?i)\\(\d{1,2})\.(\d{1,2})[^\\]*\\') { $v = [version]($Matches[1] + '.' + $Matches[2]) }
  else { $v = [version]'0.0' }
  return $v
}
function SucheSetup($wurzel, $tiefe, $nurEnaio = $false) {
  $alle = @(Get-ChildItem -LiteralPath $wurzel -Recurse -Depth $tiefe -Filter 'setup.exe' -File | Where-Object { $_.FullName -notmatch $fremd -and (-not $nurEnaio -or $_.FullName -match '(?i)enaio') })
  $w = @($alle | Where-Object { $_.FullName -match '\\Win32\\Disk1\\setup\.exe$' } | Sort-Object @{ Expression = { Ver $_ } }, LastWriteTime -Descending) | Select-Object -First 1
  if ($w) { return $w }
  return (@($alle | Sort-Object @{ Expression = { Ver $_ } }, LastWriteTime -Descending) | Select-Object -First 1)
}
# ── Kandidaten für das Capture-Setup ──
$kand = New-Object System.Collections.ArrayList
if ($q.setup) { [void]$kand.Add(@{ w = 'selbst gewählter Ordner'; p = $q.setup; t = 6; eigen = $true }) }
foreach ($d in @(Get-ChildItem -LiteralPath $q.enaio -Directory | Where-Object { $_.Name -match 'capture' })) { [void]$kand.Add(@{ w = 'enaio-Ordner (Capture)'; p = $d.FullName; t = 5 }) }
foreach ($d in @(Get-ChildItem -LiteralPath $q.enaio -Directory -Filter 'Client-Ansi*' | Sort-Object LastWriteTime -Descending)) { [void]$kand.Add(@{ w = 'enaio-Client-Paket'; p = $d.FullName; t = 4 }) }
[void]$kand.Add(@{ w = 'enaio-Ordner'; p = $q.enaio; t = 4 })
[void]$kand.Add(@{ w = 'SW_INSTA\ENAIO'; p = $q.sw; t = 5 })
if ($q.pc) {
  foreach ($lw in @('D$', 'C$')) {
    $wurzel = '\\' + $q.pc + '\' + $lw
    foreach ($d in @(Get-ChildItem -LiteralPath $wurzel -Directory | Where-Object { $_.Name -match '^(enaio.*|install|setup|software)$' })) { [void]$kand.Add(@{ w = ('Vorlage-PC ' + $q.pc); p = $d.FullName; t = 5 }) }
  }
}
# Wie früher \\vm0127\D$\INSTALL: die Installationsmedien liegen oft auf dem enaio-Server selbst
foreach ($s in @(${q2srv})) {
  foreach ($sub in @('D$\INSTALL', 'INSTALL', 'C$\INSTALL', 'D$\Install\enaio', 'D$\enaio')) { [void]$kand.Add(@{ w = ('enaio-Server ' + $s); p = ('\\' + $s + '\' + $sub); t = 4; nurEnaio = $true }) }
}
# Nicht beim ersten Fund aufhören: über ALLE Quellen gewinnt die HÖCHSTE Version (ein selbst
# gewählter Ordner gilt immer). Sonst bliebe man an einem alten 9.0 hängen, obwohl 11.x existiert.
$exe = $null; $quelle = ''
foreach ($k in $kand) {
  $g = Grund $k.p
  if ($g) { D 'Capture-Setup' $k.p $g; continue }
  $e = SucheSetup $k.p $k.t ([bool]$k.nurEnaio)
  if (-not $e) { D 'Capture-Setup' $k.p 'erreichbar, aber kein enaio-Setup darin'; continue }
  D 'Capture-Setup' $k.p ('gefunden (Version ' + (Ver $e) + '): ' + $e.FullName)
  if ($k.eigen) { $exe = $e; $quelle = $k.w + ': ' + $k.p; break }
  if (-not $exe -or (Ver $e) -gt (Ver $exe)) { $exe = $e; $quelle = $k.w + ': ' + $k.p }
}
# ── Capture als MSI (ab enaio 10/11: \Frontend\Capture\enaio_capture_ansi.msi) ──
# Liegt auf dem Installationsmedium — meist dort, wo der enaio-Server installiert wurde.
# Die Version kommt aus der MSI selbst (Property-Tabelle), nicht aus dem Pfad.
function MsiVer($pfad) {
  try {
    $i = New-Object -ComObject WindowsInstaller.Installer
    $db = $i.GetType().InvokeMember('OpenDatabase', 'InvokeMethod', $null, $i, @($pfad, 0))
    $v = $db.GetType().InvokeMember('OpenView', 'InvokeMethod', $null, $db, @("SELECT Value FROM Property WHERE Property='ProductVersion'"))
    [void]$v.GetType().InvokeMember('Execute', 'InvokeMethod', $null, $v, $null)
    $r = $v.GetType().InvokeMember('Fetch', 'InvokeMethod', $null, $v, $null)
    $w = [string]$r.GetType().InvokeMember('StringData', 'GetProperty', $null, $r, 1)
    [void]$v.GetType().InvokeMember('Close', 'InvokeMethod', $null, $v, $null)
    return $w
  } catch { return '' }
}
function V2($s) { if ("$s" -match '(\d+)[.,](\d+)') { return [version]($Matches[1] + '.' + $Matches[2]) }; return [version]'0.0' }
$msi = $null; $msiV = ''; $msiQuelle = ''
$msiOrte = New-Object System.Collections.ArrayList
foreach ($k in $kand) { [void]$msiOrte.Add(@{ w = $k.w; p = $k.p; t = 6 }) }
foreach ($s in @(${q2srv})) {
  foreach ($sub in @('D$', 'E$', 'C$\INSTALL', 'C$\Program Files (x86)\OPTIMAL SYSTEMS', 'C$\Program Files\OPTIMAL SYSTEMS')) { [void]$msiOrte.Add(@{ w = ('enaio-Server ' + $s); p = ('\\' + $s + '\' + $sub); t = 5 }) }
}
$uhr = [Diagnostics.Stopwatch]::StartNew()
$gesehen = @{}
foreach ($m in $msiOrte) {
  if ($gesehen.ContainsKey($m.p.ToLower())) { continue }; $gesehen[$m.p.ToLower()] = 1
  if ($uhr.Elapsed.TotalSeconds -gt 150) { D 'Capture-MSI' $m.p 'übersprungen — Zeitbudget der Suche aufgebraucht'; continue }
  if (Grund $m.p) { continue }
  foreach ($f in @(Get-ChildItem -LiteralPath $m.p -Recurse -Depth $m.t -Filter 'enaio_capture*.msi' -File -EA SilentlyContinue)) {
    $v = MsiVer $f.FullName
    D 'Capture-MSI' $f.FullName ('gefunden (Version ' + $(if ($v) { $v } else { '?' }) + ')')
    $besser = (-not $msi) -or ((V2 $v) -gt (V2 $msiV)) -or (((V2 $v) -eq (V2 $msiV)) -and $f.Name -match 'ansi' -and $msi.Name -notmatch 'ansi')
    if ($besser) { $msi = $f; $msiV = $v; $msiQuelle = $m.w + ': ' + $f.DirectoryName }
  }
}
if (-not $msi) { D 'Capture-MSI' '' 'kein enaio_capture*.msi gefunden (gesucht in allen Quellen und auf den enaio-Servern)' }
$ordner = ''; $rel = ''; $mb = 0
if ($exe) {
  if ($exe.FullName -match '\\Win32\\Disk1\\setup\.exe$') { $ordner = $exe.Directory.Parent.FullName } else { $ordner = $exe.Directory.FullName }
  $rel = $exe.FullName.Substring($ordner.Length).TrimStart('\')
  $mb = [math]::Round(((Get-ChildItem -LiteralPath $ordner -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB, 0)
}
# ── Treiber / Kofax / DATA2SAP: Scanclient, dann SW_INSTA\ENAIO, dann enaio-Ordner ──
$baeume = @($q.sc, $q.sw, $q.enaio)
function Finde($was, $block) {
  foreach ($b in $baeume) {
    $g = Grund $b
    if ($g) { D $was $b $g; continue }
    $r = & $block $b
    if ($r) { D $was $b ('gefunden: ' + $r.FullName); return $r }
    D $was $b 'nicht darin'
  }
  return $null
}
$kofax = Finde 'Kofax' { param($b) @(Get-ChildItem -LiteralPath $b -Directory -Recurse -Depth 2 -Filter 'kofax*') | ForEach-Object { @(Get-ChildItem -LiteralPath $_.FullName -Recurse -Filter 'setup.exe' -File) } | Select-Object -First 1 }
$kofaxOrdner = ''
if ($kofax) { $p = $kofax.Directory; while ($p -and $p.Name -notmatch '^kofax') { $p = $p.Parent }; $kofaxOrdner = $(if ($p) { $p.FullName } else { $kofax.Directory.FullName }) }
$tw = Finde 'TWAIN fi-7160' { param($b) @(Get-ChildItem -LiteralPath $b -Recurse -Depth 3 -Filter 'PSIPTWAIN*.exe' -File) + @(Get-ChildItem -LiteralPath $b -Directory -Recurse -Depth 2 -Filter '*7160*' | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Filter '*.exe' -File }) | Sort-Object LastWriteTime -Descending | Select-Object -First 1 }
$isis = Finde 'ISIS fi-6140' { param($b) @(Get-ChildItem -LiteralPath $b -Directory -Recurse -Depth 2 -Filter '*6140*' | ForEach-Object { Get-ChildItem -LiteralPath $_.FullName -Filter '*.exe' -File }) | Sort-Object LastWriteTime -Descending | Select-Object -First 1 }
$d2s = Finde 'DATA2SAP' { param($b) @(Get-ChildItem -LiteralPath $b -Directory -Recurse -Depth 3 | Where-Object { $_.Name -match 'data2sap' }) | Select-Object -First 1 }
# ── Scan-Konfiguration: eigener Ordner → Scan_Konfig → Vorlage-PC ──
$kf = $null; $vonPc = $false
if ($q.kf) { $g = Grund $q.kf; if ($g) { D 'Konfiguration' $q.kf $g } else { $kf = Get-Item -LiteralPath $q.kf; D 'Konfiguration' $q.kf 'gefunden' } }
if (-not $kf) {
  foreach ($b in $baeume) {
    $kb = @(Get-ChildItem -LiteralPath $b -Directory -Recurse -Depth 2 -Filter 'Scan_Konfig') | Select-Object -First 1
    if (-not $kb) { continue }
    $ks = @(Get-ChildItem -LiteralPath $kb.FullName -Directory)
    $kf = @($ks | Where-Object { $_.Name -match '9[.,]?0|1[01][.,]' } | Sort-Object LastWriteTime -Descending) | Select-Object -First 1
    if (-not $kf) { $kf = @($ks | Sort-Object LastWriteTime -Descending) | Select-Object -First 1 }
    if ($kf) { D 'Konfiguration' $kb.FullName ('gefunden: ' + $kf.Name); break }
  }
}
if (-not $kf -and $q.pc) {
  foreach ($k in @('D$\OS\OSECM\clients\asindex', 'C$\OS\OSECM\clients\asindex', 'C$\Program Files (x86)\OPTIMAL SYSTEMS\OSECM\clients\asindex')) {
    $p = '\\' + $q.pc + '\' + $k
    $g = Grund $p
    if ($g) { D 'Konfiguration (Vorlage-PC)' $p $g; continue }
    $kf = Get-Item -LiteralPath $p; $vonPc = $true; D 'Konfiguration (Vorlage-PC)' $p 'gefunden'; break
  }
}
if (-not $kf) { D 'Konfiguration' '' 'keine gefunden — Vorlage-PC angeben oder Ordner wählen' }
$kfn = 0; if ($kf) { $kfn = @(Get-ChildItem -LiteralPath $kf.FullName -Recurse -File | Where-Object { -not $vonPc -or $_.Extension -notmatch '^\.(exe|dll|ocx|chm|sys|msi|cab)$' }).Count }
# ── enaio-Server aus der asinit.cfg des normalen enaio Clients ──
# Format (echte Datei des Client-Pakets):  [ARCHIV]  Comstring=enaioprod.skf.net#4000
#                                          [SERVER]  SERVER0=enaioprod…#4000  SERVER1=enaiotest…#4000
$comstring = ''; $asinitPfad = ''; $srv = @()
# Achtung: im Client-PAKET steht oft nur der Platzhalter „SERVER#PORT" (das Setup ersetzt ihn).
# Echte Werte hat ein INSTALLIERTER Client — deshalb auch dessen Datei auf diesem Admin-PC.
function Echt($v) { return ($v -match '^[A-Za-z0-9][A-Za-z0-9._-]*#\d+$' -and $v -notmatch '^(SERVER|HOST|SERVERNAME)#') }
$asinitDateien = @()
foreach ($d in @(Get-ChildItem -LiteralPath $q.enaio -Directory -Filter 'Client-Ansi*' | Sort-Object LastWriteTime -Descending)) { $asinitDateien += @(Get-ChildItem -LiteralPath $d.FullName -Recurse -Depth 4 -Filter 'asinit.cfg' -File) }
$asinitDateien += @(Get-ChildItem -LiteralPath $q.enaio -Recurse -Depth 3 -Filter 'asinit.cfg' -File)
foreach ($lp in @('C:\Program Files (x86)\OPTIMAL SYSTEMS\OSECM\clients\client32\asinit.cfg', 'C:\Program Files\OPTIMAL SYSTEMS\OSECM\clients\client32\asinit.cfg')) { if (Test-Path -LiteralPath $lp) { $asinitDateien += Get-Item -LiteralPath $lp } }
foreach ($a in @($asinitDateien | Sort-Object FullName -Unique)) {
  $t = Get-Content -LiteralPath $a.FullName -Raw
  $m = [regex]::Match($t, '(?im)^\s*Comstring\s*=\s*([^\r\n;]+)')
  foreach ($s in [regex]::Matches($t, '(?im)^\s*SERVER\d+\s*=\s*([^\r\n;]+)')) { $v = $s.Groups[1].Value.Trim(); if (Echt $v) { $srv += $v } }
  if (-not $m.Success) { continue }
  $v = $m.Groups[1].Value.Trim()
  if (-not (Echt $v)) { D 'enaio-Server' $a.FullName ('nur Platzhalter „Comstring=' + $v + '" — übersprungen'); continue }
  if (-not $comstring) { $comstring = $v; $asinitPfad = $a.FullName }
  D 'enaio-Server' $a.FullName ('Comstring=' + $v)
}
if (-not $comstring) { D 'enaio-Server' $q.enaio 'keine asinit.cfg mit echtem „Comstring=" gefunden — es gilt der bekannte Standard' }
$srv = @($srv | Select-Object -Unique)
$clientVer = ''
$cd = @(Get-ChildItem -LiteralPath $q.enaio -Directory -Filter 'Client-Ansi*' | Sort-Object LastWriteTime -Descending) | Select-Object -First 1
if ($cd -and $cd.Name -match '(\d+)\.(\d+)') { $clientVer = $Matches[1] + '.' + $Matches[2] }
$msiMB = 0; if ($msi) { $msiMB = [math]::Round(((Get-ChildItem -LiteralPath $msi.DirectoryName -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB, 0) }
@{ msiPfad = $(if ($msi) { $msi.FullName } else { '' }); msiOrdner = $(if ($msi) { $msi.DirectoryName } else { '' }); msiName = $(if ($msi) { $msi.Name } else { '' });
   msiVersion = $msiV; msiQuelle = $msiQuelle; msiMB = $msiMB;
   setupExe = $(if ($exe) { $exe.FullName } else { '' }); setupOrdner = $ordner; setupRel = $rel; setupQuelle = $quelle; setupMB = $mb;
   setupVersion = $(if ($exe) { [string](Ver $exe) } else { '' }); clientVersion = $clientVer;
   kofaxExe = $(if ($kofax) { $kofax.FullName } else { '' }); kofaxOrdner = $kofaxOrdner;
   twainExe = $(if ($tw) { $tw.FullName } else { '' }); isisExe = $(if ($isis) { $isis.FullName } else { '' });
   konfigOrdner = $(if ($kf) { $kf.FullName } else { '' }); konfigDateien = $kfn; konfigVonPc = $vonPc;
   data2sapOrdner = $(if ($d2s) { $d2s.FullName } else { '' });
   antwortDatei = [bool](Test-Path -LiteralPath '${esc(ANTWORT_DATEI)}');
   comstring = $comstring; asinitPfad = $asinitPfad;
   serverKandidaten = @($srv); diagnose = @($diag) } | ConvertTo-Json -Depth 4 -Compress
`
  const r = await api().runPowerShell(script, 6 * 60 * 1000)
  const s = (r.stdout || '').trim()
  const i = s.indexOf('{'), j = s.lastIndexOf('}')
  let roh: Partial<CaptureFund> & { serverKandidaten?: unknown; diagnose?: unknown } = {}
  try { roh = JSON.parse(s.slice(i, j + 1)) } catch { /* unten */ }
  const fehler: string[] = []
  if (i < 0) fehler.push(r.timedOut ? 'Die Suche hat zu lange gedauert (6 Minuten).' : (r.stderr?.trim() || 'Die Quellen konnten nicht gelesen werden.'))
  if (!roh.setupExe && !roh.msiPfad) fehler.push('Capture-Setup nicht gefunden')
  if (!roh.kofaxExe) fehler.push('Kofax nicht gefunden')
  if (!roh.twainExe) fehler.push('TWAIN-Treiber fi-7160 nicht gefunden')
  if (!roh.konfigOrdner) fehler.push('Scan-Konfiguration nicht gefunden')
  const kandidaten = asArr<string>(roh.serverKandidaten).filter(Boolean)
  return {
    ok: !!roh.setupExe || !!roh.msiPfad,
    fehler,
    setupExe: roh.setupExe || '', setupOrdner: roh.setupOrdner || '', setupRel: roh.setupRel || '',
    setupQuelle: roh.setupQuelle || '', setupMB: roh.setupMB || 0,
    setupVersion: roh.setupVersion || '', clientVersion: roh.clientVersion || '',
    msiPfad: roh.msiPfad || '', msiOrdner: roh.msiOrdner || '', msiName: roh.msiName || '',
    msiVersion: roh.msiVersion || '', msiQuelle: roh.msiQuelle || '', msiMB: roh.msiMB || 0,
    kofaxExe: roh.kofaxExe || '', kofaxOrdner: roh.kofaxOrdner || '',
    twainExe: roh.twainExe || '', isisExe: roh.isisExe || '',
    konfigOrdner: roh.konfigOrdner || '', konfigDateien: roh.konfigDateien || 0, konfigVonPc: !!roh.konfigVonPc,
    data2sapOrdner: roh.data2sapOrdner || '', antwortDatei: !!roh.antwortDatei,
    // Nur der von Hand eingetragene Server zählt — die Werte aus dem Client-Paket sind
    // teils Abschnittsnamen („osserver_ssl_section") statt Rechnernamen. Der echte Server
    // wird per Portprüfung ermittelt (ermittleEnaioServer).
    server: q.server,
    serverKandidaten: kandidaten,
    comstring: (roh as { comstring?: string }).comstring || '',
    asinitPfad: (roh as { asinitPfad?: string }).asinitPfad || '',
    diagnose: asArr<QuellDiagnose>(roh.diagnose).filter(d => d && d.was),
  }
}

// ── enaio-Server ermitteln ───────────────────────────────────────────────────
// Maßgeblich ist die asinit.cfg des NORMALEN enaio Clients (liegt im Client-Paket):
//   [ARCHIV]  Comstring=enaioprod.skf.net#4000
// Das ist ein DNS-Name — aus keiner Server-Liste ableitbar. Weitere Kandidaten (Gegenprobe
// und Ersatz, falls die Datei fehlt): von Hand eingetragener Server, SERVERn-Einträge der
// asinit.cfg und die Server der Standort-Übersicht mit „enaio" in der Beschreibung.
// Geprüft wird VOM ZIEL-PC aus, wer auf seinem Port antwortet. Nie gewählt: Test, SQL.

export const ENAIO_PORT = 4000
/** Aus der asinit.cfg eines installierten enaio Clients (vom Nutzer am 22.10.2026 gezeigt). */
export const STANDARD_SERVER = 'enaioprod.skf.net#4000'

export interface EnaioServer {
  name: string
  ip: string
  port: number
  beschreibung: string
  offen: boolean | null      // Port vom Ziel-PC erreichbar? null = nicht geprüft
  aufgeloest?: string        // IP laut DNS (vom Ziel-PC aus)
  rolle: 'client' | 'core' | 'application' | 'sql' | 'test' | 'sonst'
}

export interface ServerWahl { server: EnaioServer[]; gewaehlt: string; port: number; grund: string; geprueftVon: string }

function rolleVon(t: string): EnaioServer['rolle'] {
  const s = t.toLowerCase()
  if (/test/.test(s)) return 'test'
  if (/\bsql\b|datenbank|database/.test(s)) return 'sql'
  if (/\bcore\b/.test(s)) return 'core'
  if (/application|applikation|\bapp\b/.test(s)) return 'application'
  return 'sonst'
}

/** „enaioprod.skf.net#4000" / „W3168:4000" / „W3168" → Name + Port */
export function zerlegeServer(s: string): { name: string; port: number } {
  const m = (s || '').trim().match(/^([^#:\s]+)(?:[#:](\d+))?$/)
  return m ? { name: m[1], port: Number(m[2]) || ENAIO_PORT } : { name: '', port: ENAIO_PORT }
}

export async function ermittleEnaioServer(zielHost: string, vorgabe = '', comstring = '', weitere: string[] = []): Promise<ServerWahl> {
  const liste: EnaioServer[] = []
  const add = (s: EnaioServer) => { if (s.name && !liste.some(x => x.name.toLowerCase() === s.name.toLowerCase())) liste.push(s) }
  const hand = zerlegeServer(vorgabe)
  if (hand.name) add({ name: hand.name, ip: '', port: hand.port, beschreibung: 'von Hand eingetragen', offen: null, rolle: 'sonst' })
  const cs = zerlegeServer(comstring || STANDARD_SERVER)
  if (cs.name) add({ name: cs.name, ip: '', port: cs.port, beschreibung: comstring ? 'laut asinit.cfg des enaio Clients' : 'bekannter Standard (asinit.cfg eines installierten enaio Clients)', offen: null, rolle: rolleVon(cs.name) === 'test' ? 'test' : 'client' })
  for (const w of weitere) { const z = zerlegeServer(w); if (z.name) add({ name: z.name, ip: '', port: z.port, beschreibung: 'Serverliste der asinit.cfg', offen: null, rolle: rolleVon(z.name) }) }
  try {
    const inv = await api().netReadJson<{ name?: string; ip?: string; description?: string; category?: string }[]>('inventory/inventory.json')
    for (const it of Array.isArray(inv) ? inv : []) {
      const text = `${it.name || ''} ${it.description || ''}`
      if (it.category === 'Server' && it.name && /enaio/i.test(text)) {
        add({ name: it.name.trim().toUpperCase(), ip: (it.ip || '').trim(), port: ENAIO_PORT, beschreibung: (it.description || '').trim(), offen: null, rolle: rolleVon(text) })
      }
    }
  } catch { /* ohne Inventar */ }
  if (!liste.length) return { server: [], gewaehlt: '', port: ENAIO_PORT, grund: 'Kein enaio-Server bekannt: weder asinit.cfg im Client-Paket noch Server in der Standort-Übersicht noch von Hand eingetragen.', geprueftVon: '' }

  // Portprüfung — erst über den Namen, sonst über die IP; jeder mit seinem eigenen Port
  const pruefung = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
function Offen($ziel, $port) { if (-not $ziel) { return $false }; try { $c = New-Object Net.Sockets.TcpClient; $a = $c.BeginConnect($ziel, $port, $null, $null); $ok = $a.AsyncWaitHandle.WaitOne(2000) -and $c.Connected; $c.Close(); return [bool]$ok } catch { return $false } }
function Ip($n) { try { return [string](@([Net.Dns]::GetHostAddresses($n) | Where-Object { $_.AddressFamily -eq 'InterNetwork' }) | Select-Object -First 1).IPAddressToString } catch { return '' } }
$r = @(foreach ($s in @($o.liste)) { [pscustomobject]@{ name = $s.name; aufgeloest = (Ip $s.name); offen = ((Offen $s.name ([int]$s.port)) -or (Offen $s.ip ([int]$s.port))) } })
'@@CAPSRV@@' + (ConvertTo-Json -InputObject @($r) -Compress)
`
  const payload = b64(JSON.stringify({ liste: liste.map(s => ({ name: s.name, ip: s.ip, port: s.port })) }))
  let von = zielHost
  let r = await api().runPowerShell(fernBefehl(zielHost, pruefung, '@@CAPSRV@@', payload), 120000)
  let ergebnis = getagged<{ name: string; offen: boolean }[] | { ok?: boolean }>(r.stdout, '@@CAPSRV@@')
  if (!Array.isArray(ergebnis)) {
    // Ziel-PC nicht erreichbar → wenigstens vom Admin-PC aus prüfen
    von = 'diesem Admin-PC'
    r = await api().runPowerShell(`$b64 = '${payload}'\n` + pruefung, 120000)
    ergebnis = getagged<{ name: string; offen: boolean }[]>(r.stdout, '@@CAPSRV@@')
  }
  for (const e of asArr<{ name: string; offen: boolean; aufgeloest?: string }>(ergebnis)) {
    const s = liste.find(x => x.name === e.name)
    if (s) { s.offen = !!e.offen; s.aufgeloest = e.aufgeloest || '' }
  }
  // DNS-Namen (enaioprod.skf.net) der passenden Maschine aus der Standort-Übersicht zuordnen
  for (const s of liste) {
    if (!s.aufgeloest || s.ip) continue
    const m = liste.find(x => x !== s && (x.ip === s.aufgeloest || x.aufgeloest === s.aufgeloest) && /^W\d+/i.test(x.name))
    s.beschreibung += ` · ${s.aufgeloest}${m ? ` = ${m.name}` : ''}`
  }
  const rang: Record<EnaioServer['rolle'], number> = { client: 0, core: 1, sonst: 2, application: 3, test: 8, sql: 9 }
  const handName = hand.name.toLowerCase()
  const kand = liste.filter(s => s.offen && s.rolle !== 'sql' && (s.rolle !== 'test' || s.name.toLowerCase() === handName))
    .sort((a, b) => (a.name.toLowerCase() === handName ? -1 : 0) - (b.name.toLowerCase() === handName ? -1 : 0) || rang[a.rolle] - rang[b.rolle])
  let g = kand[0]
  let grund = g ? `${g.name}${g.beschreibung ? ` (${g.beschreibung})` : ''} antwortet von ${von} aus auf Port ${g.port}` : ''
  // Antwortet nichts, aber die Client-asinit.cfg nennt einen Server → trotzdem den nehmen
  // (Port-Test kann an einer Firewall scheitern, Capture spricht womöglich trotzdem).
  if (!g) {
    const c = liste.find(s => s.rolle === 'client')
    if (c) { g = c; grund = `${c.name} laut asinit.cfg des enaio Clients — antwortet von ${von} aus NICHT auf Port ${c.port} (Netz/Firewall prüfen)` }
  }
  return {
    server: liste,
    gewaehlt: g?.name || '',
    port: g?.port || ENAIO_PORT,
    grund: g ? grund : `Kein enaio-Server antwortet von ${von} aus (geprüft: ${liste.map(s => `${s.name}:${s.port}`).join(', ')}).`,
    geprueftVon: von,
  }
}

// ── Ziel-PC ──────────────────────────────────────────────────────────────────

export interface CaptureZiel {
  ok: boolean
  fehler?: string
  basis: string             // D:\OS\OSECM oder C:\OS\OSECM
  lokalesD: boolean
  sitzung: number | null    // Sitzungs-ID des angemeldeten Benutzers (für sichtbare Fenster)
  benutzer: string
  capturePfad: string       // vorhandene axindex.exe (falls schon installiert)
  captureVersion: string    // Dateiversion von axindex.exe, z. B. "9.0" — leer, wenn nicht installiert
  clientVorhanden: boolean  // normaler enaio Client (client32) auf dem PC?
}

const ZIEL_INNER = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$d = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='D:'"
$lokalD = [bool]($d -and $d.DriveType -eq 3)
$basis = $(if ($lokalD) { 'D:\OS\OSECM' } else { 'C:\OS\OSECM' })
$e = @(Get-Process explorer -IncludeUserName | Where-Object { $_.UserName }) | Select-Object -First 1
$cap = ''
foreach ($k in @('C:\Program Files (x86)\OPTIMAL SYSTEMS\OSECM\clients\asindex', 'C:\Program Files\OPTIMAL SYSTEMS\OSECM\clients\asindex', 'D:\OS\OSECM\clients\asindex', 'C:\OS\OSECM\clients\asindex')) {
  if (Test-Path -LiteralPath (Join-Path $k 'axindex.exe')) { $cap = (Join-Path $k 'axindex.exe'); break }
}
# Eigener Ordner im Setup gewählt? Dann unter den üblichen Wurzeln suchen.
if (-not $cap) {
  foreach ($w in @('C:\Program Files (x86)\OPTIMAL SYSTEMS', 'C:\Program Files\OPTIMAL SYSTEMS', 'D:\OS', 'C:\OS', 'D:\OPTIMAL SYSTEMS')) {
    $f = @(Get-ChildItem -LiteralPath $w -Recurse -Depth 5 -Filter 'axindex.exe' -File) | Select-Object -First 1
    if ($f) { $cap = $f.FullName; break }
  }
}
$capVer = ''
if ($cap) { $fv = [string](Get-Item -LiteralPath $cap).VersionInfo.FileVersion; if ($fv -match '^(\d+)[.,](\d+)') { $capVer = $Matches[1] + '.' + $Matches[2] } }
'@@CAPZIEL@@' + (@{ ok = $true; basis = $basis; lokalesD = $lokalD; sitzung = $(if ($e) { $e.SessionId } else { $null }); benutzer = $(if ($e) { [string]$e.UserName } else { '' }); capturePfad = $cap; captureVersion = $capVer; clientVorhanden = [bool](Test-Path -LiteralPath 'C:\Program Files (x86)\OPTIMAL SYSTEMS\OSECM\clients\client32') } | ConvertTo-Json -Compress)
`

export async function pruefeCaptureZiel(host: string): Promise<CaptureZiel> {
  const leer: CaptureZiel = { ok: false, basis: '', lokalesD: false, sitzung: null, benutzer: '', capturePfad: '', captureVersion: '', clientVorhanden: false }
  const f = await verbinde(host)
  if (f) return { ...leer, fehler: f }
  const r = await api().runPowerShell(fernBefehl(host, ZIEL_INNER, '@@CAPZIEL@@'), 90000)
  const j = getagged<Partial<CaptureZiel> & { ok?: boolean; fehler?: string }>(r.stdout, '@@CAPZIEL@@')
  if (!j) return { ...leer, fehler: r.stderr?.trim() || 'Keine Antwort vom Ziel-PC.' }
  if (j.ok === false) return { ...leer, fehler: j.fehler || 'Abfrage fehlgeschlagen.' }
  return {
    ok: true, basis: j.basis || 'C:\\OS\\OSECM', lokalesD: !!j.lokalesD,
    sitzung: typeof j.sitzung === 'number' ? j.sitzung : null, benutzer: j.benutzer || '', capturePfad: j.capturePfad || '', captureVersion: j.captureVersion || '', clientVorhanden: !!j.clientVorhanden,
  }
}

// ── Sichtbar am PC ausführen (PsExec -i <Sitzung> -s) ────────────────────────

/**
 * Startet ein Setup auf dem Bildschirm des angemeldeten Benutzers (mit Systemrechten,
 * damit keine UAC-Abfrage kommt) und wartet, bis es beendet ist. Liefert '' oder Fehler.
 */
async function sichtbarAusfuehren(
  host: string, sitzung: number, exe: string, args: string[], arbeitsordner: string,
  timeoutMin: number, warte: (sek: number) => void,
): Promise<string> {
  const dir = pathService.getPsExecDir('unc')
  const argPs = args.map(a => `'${esc(a)}'`).join(', ')
  const start = await api().runPowerShell([
    `$dir = '${esc(dir)}'`,
    `$ps = @("$dir\\PsExec64.exe", "$dir\\PsExec.exe") | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1`,
    `if (-not $ps) { 'ERR:PsExec nicht gefunden unter ' + $dir; return }`,
    `$a = @('\\\\${esc(host)}', '-accepteula', '-nobanner', '-i', '${sitzung}', '-s', '-d', '-w', '${esc(arbeitsordner)}', '${esc(exe)}'${argPs ? ', ' + argPs : ''})`,
    `$null = & $ps @a 2>&1`,
    `'PID:' + $LASTEXITCODE`,
  ].join('\n'), 120000)
  const z = (start.stdout || '').split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith('PID:') || l.startsWith('ERR:'))
  if (!z) return start.stderr?.trim() || 'PsExec hat nicht geantwortet.'
  if (z.startsWith('ERR:')) return z.slice(4)
  const pid = Number(z.slice(4))
  // Mit -d liefert PsExec die Prozess-ID als Exitcode; kleine Werte sind Fehlercodes.
  if (!pid || pid < 8) return `Das Programm konnte am PC nicht gestartet werden (PsExec-Code ${z.slice(4)}).`

  // InstallShield-Starter beenden sich oft und übergeben an einen zweiten Prozess (aus
  // %TEMP%). Deshalb zählt nicht nur die PID, sondern auch jeder typische Setup-Prozess
  // in der Sitzung des Anwenders. Zweimal hintereinander „ENDE", damit eine Übergabe
  // zwischen zwei Prozessen nicht als Ende gilt.
  const basis = exe.slice(exe.lastIndexOf('\\') + 1).replace(/\.exe$/i, '').toLowerCase()
  const bis = Date.now() + timeoutMin * 60_000
  const t0 = Date.now()
  let endeInFolge = 0
  while (Date.now() < bis) {
    await new Promise(r => setTimeout(r, 10_000))
    warte(Math.round((Date.now() - t0) / 1000))
    const r = await api().runPowerShell(
      `try { Invoke-Command -ComputerName '${esc(host)}' -ScriptBlock { ` +
      `$l = @(Get-Process -EA SilentlyContinue | Where-Object { $_.Id -eq ${pid} -or ($_.SessionId -eq ${sitzung} -and ($_.Name.ToLower() -match '^(setup|isbew64|idriver|_ins\\d+|_isdel|${basis.replace(/[^a-z0-9_.-]/g, '')})$')) }); ` +
      `if ($l.Count) { 'LAEUFT' } else { 'ENDE' } } -EA Stop } catch { 'UNKLAR' }`,
      60000)
    if ((r.stdout || '').includes('ENDE')) { if (++endeInFolge >= 2) return '' } else endeInFolge = 0
  }
  return `Zeitüberschreitung: das Fenster am PC wurde nicht innerhalb von ${timeoutMin} Minuten abgeschlossen.`
}

// ── Ablauf ───────────────────────────────────────────────────────────────────

export type SchrittStatus = 'offen' | 'laeuft' | 'ok' | 'fehler' | 'warnung'
export interface CaptureSchritt { id: string; label: string; status: SchrittStatus; info?: string }
export interface CaptureOptionen {
  kofax: boolean; twain: boolean; isis: boolean; data2sap: boolean; starten: boolean
  /** Vorhandenes Capture vorher entfernen (z. B. Wechsel 9.0 → 11.x) */
  neuInstallieren?: boolean
}

// ── Programme auf dem Ziel-PC (für „schon installiert?" und gezieltes Entfernen) ──
interface Prog { name: string; version: string; publisher: string; uninstall: string; quiet: string; install: string; child: string; key: string }

const PROG_INNER = String.raw`
$o = @()
foreach ($p in @('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'Registry::HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
  foreach ($k in @(Get-ChildItem -LiteralPath $p -EA SilentlyContinue)) {
    $v = Get-ItemProperty -LiteralPath $k.PSPath -EA SilentlyContinue
    if (-not $v.DisplayName) { continue }
    $o += [pscustomobject]@{ name = [string]$v.DisplayName; version = [string]$v.DisplayVersion; publisher = [string]$v.Publisher; uninstall = [string]$v.UninstallString; quiet = [string]$v.QuietUninstallString; install = [string]$v.InstallLocation; child = [string]$k.PSChildName; key = ($p + '\' + $k.PSChildName) }
  }
}
'@@CAPPROG@@' + (ConvertTo-Json -InputObject @($o) -Compress)
`

async function ladeProgramme(host: string): Promise<Prog[]> {
  const r = await api().runPowerShell(fernBefehl(host, PROG_INNER, '@@CAPPROG@@'), 90000)
  return asArr<Prog>(getagged<Prog[]>(r.stdout, '@@CAPPROG@@')).filter(p => p && p.name)
}

/** „"C:\…\setup.exe" -runfromtemp -removeonly" → exe + einzelne Argumente (ohne umschließende Anführungszeichen). */
export function zerlegeBefehl(cmd: string): { exe: string; args: string[] } {
  const c = (cmd || '').trim()
  const m = c.match(/^"([^"]+)"\s*(.*)$/) || c.match(/^(\S+\.exe)\s*(.*)$/i) || c.match(/^(\S+)\s*(.*)$/)
  if (!m) return { exe: '', args: [] }
  const args = (m[2].match(/"[^"]*"|\S+/g) || []).map(a => a.replace(/^"(.*)"$/, '$1'))
  return { exe: m[1], args }
}

/** Welche Einträge der Programmliste gehören zu Capture? */
export function captureEintraege(progs: Prog[], clientVorhanden: boolean): Prog[] {
  const enaio = progs.filter(p => /enaio|optimal\s*systems/i.test(`${p.name} ${p.publisher}`))
  const gezielt = enaio.filter(p => /capture/i.test(p.name) || /asindex/i.test(`${p.install} ${p.uninstall}`))
  if (gezielt.length) return gezielt
  // Ohne normalen enaio Client gehört alles von enaio auf dem PC zu Capture
  return clientVorhanden ? [] : enaio
}
export interface CaptureHinweis { titel: string; punkte: string[] }

export function captureSchritte(o: CaptureOptionen): { id: string; label: string }[] {
  return [
    { id: 'quelle', label: 'Installationsdateien suchen' },
    { id: 'ziel', label: 'Ziel-PC prüfen (angemeldeter Benutzer, vorhandenes Capture)' },
    ...(o.neuInstallieren ? [{ id: 'alt', label: 'Vorhandenes Capture entfernen' }] : []),
    { id: 'server', label: 'enaio-Server ermitteln (asinit.cfg des enaio Clients + Verbindungstest)' },
    { id: 'kopie', label: `Dateien nach ${ZIEL} kopieren` },
    { id: 'capture', label: 'enaio Capture installieren' },
    ...(o.kofax ? [{ id: 'kofax', label: 'Kofax Retrieval Engine 3.1 installieren' }] : []),
    ...(o.kofax ? [{ id: 'kofaxpfad', label: 'Kofax-Ordner „imgctls\\BIN" in den Systempfad (PATH) eintragen' }] : []),
    ...(o.twain ? [{ id: 'twain', label: 'Scanner-Treiber fi-7160 (TWAIN) installieren' }] : []),
    ...(o.isis ? [{ id: 'isis', label: 'Scanner-Treiber fi-6140 (ISIS, alt) installieren' }] : []),
    { id: 'konfig', label: 'Scan-Konfiguration nach asindex übernehmen' },
    { id: 'asinit', label: 'enaio-Server in asinit.cfg eintragen und Verbindung testen' },
    { id: 'odbc', label: 'ODBC-Verbindung „OSCAPTURE" (32 Bit) einrichten' },
    ...(o.data2sap ? [{ id: 'data2sap', label: 'DATA2SAP kopieren und registrieren' }] : []),
    { id: 'pruefen', label: 'Installation prüfen' },
    ...(o.starten ? [{ id: 'starten', label: 'Capture beim Anwender starten (meldet den Arbeitsplatz an)' }] : []),
  ]
}

export interface CaptureErgebnis { ok: boolean; text: string; nacharbeit: string[] }

type Melder = (id: string, status: SchrittStatus, info?: string) => void

const KLICK_STANDARD = ['„Weiter" klicken', 'Lizenzbedingungen annehmen', '„Installieren" klicken', 'Am Ende „Fertigstellen" — einen Neustart jetzt ablehnen']

const LIZENZEN = 'AIX, REK, RER, SCA, SFI, SIC, STW, VAL'

export async function installiereCapture(
  host: string, o: CaptureOptionen, melde: Melder, hinweis: (h: CaptureHinweis | null) => void,
): Promise<CaptureErgebnis> {
  const nacharbeit = [
    `Im enaio Enterprise Manager die Capture-Lizenzen dieser Arbeitsstation zuweisen: ${LIZENZEN}. Die Anzahl der Scan-Lizenzen ist begrenzt — ggf. vom alten Scanplatz übertragen.`,
    'Capture einmal als Administrator starten und prüfen, ob die Subprogramme/Scankonfigurationen aus der kopierten Konfiguration da sind.',
  ]
  const fehl = (id: string, t: string): CaptureErgebnis => { melde(id, 'fehler', t); hinweis(null); return { ok: false, text: t, nacharbeit } }
  const diagText = (fund: CaptureFund, was: string) => fund.diagnose.filter(d => d.was.startsWith(was)).map(d => `${d.pfad || '—'}: ${d.ergebnis}`).join(' | ')

  // 1) Quellen — fehlende Teile brechen hier NICHT ab; entschieden wird nach dem Blick auf den Ziel-PC
  melde('quelle', 'laeuft', 'Suche über alle Ausweich-Quellen — kann 1–3 Minuten dauern.')
  const q = await findeCaptureQuellen()
  const hauptVer = (v: string) => Number((v || '').split('.')[0]) || 0
  // Quelle: das MSI (enaio 10/11) geht vor, wenn es mindestens so neu ist wie ein InstallShield-Setup
  const nutzeMsi = !!q.msiPfad && (!q.setupExe || hauptVer(q.msiVersion) >= hauptVer(q.setupVersion))
  const quellVersion = nutzeMsi ? q.msiVersion : q.setupVersion
  const hatQuelle = nutzeMsi || !!q.setupExe
  const fehlt = [
    !hatQuelle && 'Capture-Setup',
    o.kofax && !q.kofaxExe && 'Kofax', o.twain && !q.twainExe && 'TWAIN fi-7160', o.isis && !q.isisExe && 'ISIS fi-6140',
    o.data2sap && !q.data2sapOrdner && 'DATA2SAP', !q.konfigOrdner && 'Scan-Konfiguration',
  ].filter(Boolean) as string[]
  const zuAlt = hatQuelle && hauptVer(quellVersion) > 0 && hauptVer(q.clientVersion) > 0 && hauptVer(quellVersion) < hauptVer(q.clientVersion)
  if (zuAlt) {
    nacharbeit.push(`Das gefundene Capture ist Version ${quellVersion}, der normale enaio Client ist ${q.clientVersion}. Mit der älteren Version scheitert der Verbindungsaufbau zum enaio-Server — das MSI „enaio_capture_ansi.msi" (Installationsmedium enaio ${q.clientVersion}, Ordner Frontend\\Capture) bei der enaio-Betreuung anfordern und unter „Capture-Setup" dessen Ordner wählen.`)
  }
  melde('quelle', fehlt.length || zuAlt ? 'warnung' : 'ok',
    `${nutzeMsi ? `Capture-MSI ${q.msiName} Version ${q.msiVersion || '?'} aus ${q.msiQuelle} (${q.msiMB} MB)` : q.setupExe ? `Setup ${q.setupVersion ? `Version ${q.setupVersion} ` : ''}aus ${q.setupQuelle} (${q.setupMB} MB)` : 'Setup nicht gefunden'}`
    + `${zuAlt ? ` — älter als der enaio Client ${q.clientVersion}` : ''}`
    + `${q.konfigOrdner ? ` · Konfiguration ${q.konfigDateien} Dateien${q.konfigVonPc ? ' (vom Vorlage-PC)' : ''}` : ''}`
    + `${fehlt.length ? ` · fehlt: ${fehlt.join(', ')}` : ''}`)

  // 2) Ziel
  melde('ziel', 'laeuft')
  let z = await pruefeCaptureZiel(host)
  if (!z.ok) return fehl('ziel', z.fehler || 'Ziel-PC nicht erreichbar.')
  const zu = `\\\\${host}\\C$\\Install\\enaio_capture`
  const progs = await ladeProgramme(host)
  const findeProg = (re: RegExp) => progs.find(p => re.test(p.name))
  const KOFAX_RE = /kofax|retri[e]?val/i, TWAIN_RE = /paperstream\s*ip/i, ISIS_RE = /\bisis\b|fi-6140/i
  const kofaxDa = findeProg(KOFAX_RE), twainDa = findeProg(TWAIN_RE), isisDa = findeProg(ISIS_RE)
  const kofaxNoetig = o.kofax && !!q.kofaxExe && !kofaxDa, twainNoetig = o.twain && !!q.twainExe && !twainDa, isisNoetig = o.isis && !!q.isisExe && !isisDa

  // Version: Capture muss zur enaio-Version passen (9.0-Kommunikation gegen enaio 11 scheitert)
  const capHaupt = hauptVer(z.captureVersion), setupHaupt = hauptVer(quellVersion), clientHaupt = hauptVer(q.clientVersion)
  if (z.capturePfad && !o.neuInstallieren && capHaupt > 0 && setupHaupt > capHaupt) {
    nacharbeit.push(`Auf dem PC ist Capture ${z.captureVersion}, gefunden wurde Capture ${quellVersion}: mit angehakter Option „Capture neu installieren" erneut ausführen.`)
  }
  if (capHaupt > 0 && clientHaupt > capHaupt && setupHaupt <= capHaupt) {
    nacharbeit.push(`Auf dem PC ist Capture ${z.captureVersion}, euer enaio ist ${q.clientVersion}. Capture ${clientHaupt}.x („enaio_capture_ansi.msi") wurde nirgends gefunden — auch nicht auf den enaio-Servern. `
      + `Mit der älteren Version scheitert der Verbindungsaufbau. Das MSI liegt auf dem Installationsmedium enaio ${q.clientVersion} unter Frontend\\Capture — bei der enaio-Betreuung (OPTIMAL SYSTEMS) anfordern und unter „Capture-Setup" dessen Ordner wählen.`)
  }

  // 2a) Vorhandenes Capture entfernen (nur auf Wunsch)
  if (o.neuInstallieren && z.capturePfad) {
    if (!hatQuelle) return fehl('alt', 'Zum Neuinstallieren fehlt ein Capture-Setup — erst die Quelle klären, sonst wäre Capture danach ganz weg.')
    if (z.sitzung === null) return fehl('alt', 'Am PC ist niemand angemeldet — die Deinstallation zeigt ggf. ein Fenster.')
    melde('alt', 'laeuft')
    const weg = captureEintraege(progs, z.clientVorhanden)
    if (!weg.length) {
      return fehl('alt', 'Der Eintrag von Capture in „Programme und Features" ist nicht eindeutig (auf dem PC ist auch der normale enaio Client). Bitte über Support Tools → Deinstallation entfernen und dann erneut ausführen.')
    }
    for (const p of weg) {
      const guid = (p.child.match(/^\{[0-9A-F-]+\}$/i) || (/msiexec/i.test(p.uninstall) ? p.uninstall.match(/\{[0-9A-F-]+\}/i) : null))?.[0]
      if (guid) {
        melde('alt', 'laeuft', `${p.name} ${p.version} wird still deinstalliert …`)
        await api().runPowerShell(`try { Invoke-Command -ComputerName '${esc(host)}' -ScriptBlock { Start-Process msiexec.exe -ArgumentList '/x ${guid} /qn /norestart REBOOT=ReallySuppress' -Wait } -EA Stop } catch {}`, 30 * 60 * 1000)
      } else {
        const b = zerlegeBefehl(p.quiet || p.uninstall)
        if (!b.exe) continue
        melde('alt', 'laeuft', `${p.name} ${p.version}: Deinstallation am PC offen — bitte dort bestätigen.`)
        hinweis({ titel: `${p.name} am PC deinstallieren`, punkte: ['„Entfernen" bzw. „Deinstallieren" wählen und bestätigen', 'Fragen nach gemeinsam genutzten Dateien mit „Ja/Alle entfernen" beantworten', 'Am Ende „Fertigstellen" — einen Neustart jetzt ablehnen'] })
        const f = await sichtbarAusfuehren(host, z.sitzung, b.exe, b.args, b.exe.includes('\\') ? b.exe.slice(0, b.exe.lastIndexOf('\\')) : 'C:\\Windows', 40, () => undefined)
        hinweis(null)
        if (f) return fehl('alt', `${p.name}: ${f}`)
      }
    }
    // Reste des alten asindex-Ordners beiseitelegen (nicht löschen — dort liegt evtl. eine gepflegte Konfiguration)
    const altOrdner = z.capturePfad.slice(0, z.capturePfad.lastIndexOf('\\'))
    await api().runPowerShell(`try { Invoke-Command -ComputerName '${esc(host)}' -ScriptBlock { if (Test-Path -LiteralPath '${esc(altOrdner)}') { Rename-Item -LiteralPath '${esc(altOrdner)}' -NewName ('asindex.alt_' + (Get-Date -Format 'yyyyMMdd_HHmm')) -EA SilentlyContinue } } -EA Stop } catch {}`, 120000)
    z = await pruefeCaptureZiel(host)
    if (z.capturePfad) return fehl('alt', `Capture ist nach dem Entfernen noch vorhanden (${z.capturePfad}) — bitte über Support Tools → Deinstallation entfernen.`)
    melde('alt', 'ok', `entfernt: ${weg.map(p => `${p.name} ${p.version}`).join(', ')} · alter Ordner gesichert als asindex.alt_…`)
  } else if (o.neuInstallieren) {
    melde('alt', 'ok', 'kein Capture auf dem PC — nichts zu entfernen')
  }

  // Setup: gefundene Quelle — sonst eine Kopie aus einem früheren Versuch auf dem Ziel-PC
  let setupAmZiel = '', msiAmZiel = ''
  if (!z.capturePfad && !hatQuelle) {
    const alt = await api().runPowerShell(
      `$m = @(Get-ChildItem -LiteralPath '${esc(zu)}\\Msi' -Filter '*capture*.msi' -File -EA SilentlyContinue) | Sort-Object { $_.Name -notmatch 'ansi' } | Select-Object -First 1; if ($m) { 'MSI:' + $m.FullName; return }`
      + `\n$e = @(Get-ChildItem -LiteralPath '${esc(zu)}\\Setup', '${esc(zu)}\\Win32' -Recurse -Depth 4 -Filter 'setup.exe' -File -EA SilentlyContinue) | Select-Object -First 1; if ($e) { 'GEF:' + $e.FullName } else { 'NEIN' }`, 60000)
    const zeilen = (alt.stdout || '').split(/\r?\n/).map(l => l.trim())
    const g = zeilen.find(l => l.startsWith('GEF:')), m = zeilen.find(l => l.startsWith('MSI:'))
    if (m) msiAmZiel = m.slice(4).replace(`\\\\${host}\\C$`, 'C:')
    else if (g) setupAmZiel = g.slice(4).replace(`\\\\${host}\\C$`, 'C:')
    else {
      return fehl('ziel', `Capture ist auf ${host} nicht installiert und das Setup wurde nirgends gefunden. Geprüft: ${diagText(q, 'Capture-Setup')}. `
        + 'Lösung: unter „Herkunft der Installationsdateien" den Ordner mit dem Capture-Setup wählen oder einen vorhandenen Scan-Arbeitsplatz als Vorlage-PC eintragen.')
    }
  }
  const msiWeg = !z.capturePfad && (nutzeMsi || !!msiAmZiel)
  const brauchtFenster = (!z.capturePfad && !msiWeg && !q.antwortDatei) || kofaxNoetig || twainNoetig
    || isisNoetig || (o.data2sap && !!q.data2sapOrdner) || o.starten
  if (brauchtFenster && z.sitzung === null) {
    return fehl('ziel', 'Am PC ist niemand angemeldet. Für die Setups mit Fenster (und den Start am Ende) muss jemand angemeldet und der Bildschirm entsperrt sein.')
  }
  // Wo Capture landet, entscheidet das Setup (Standard übernehmen) — danach wird der echte
  // Ort ermittelt und Konfiguration/ODBC/Server dorthin gelegt.
  let asindex = z.capturePfad ? z.capturePfad.slice(0, z.capturePfad.lastIndexOf('\\')) : `${z.basis}\\clients\\asindex`
  melde('ziel', 'ok', `${z.benutzer ? `angemeldet: ${z.benutzer}` : 'niemand angemeldet'}`
    + `${z.capturePfad ? ` · Capture schon installiert (${asindex}) — Setup entfällt, Konfiguration/Server werden korrigiert` : ''}${setupAmZiel || msiAmZiel ? ' · Setup aus früherem Versuch auf dem PC' : ''}`)

  // 2b) enaio-Server — VOR dem Setup, damit die Klick-Anleitung den richtigen Namen zeigt
  melde('server', 'laeuft', 'Prüfe vom Ziel-PC aus alle enaio-Server der Standort-Übersicht …')
  const sw = await ermittleEnaioServer(host, q.server, q.comstring, q.serverKandidaten)
  const ziele = sw.server.map(s => `${s.name}${s.beschreibung ? ` (${s.beschreibung})` : ''}: ${s.offen === null ? '?' : s.offen ? `Port ${s.port} offen` : 'antwortet nicht'}`).join(' · ')
  if (sw.gewaehlt) melde('server', 'ok', `Gewählt: ${sw.gewaehlt} · Port ${sw.port} — ${sw.grund}. Geprüft: ${ziele}`)
  else {
    melde('server', 'warnung', `${sw.grund}${ziele ? ` Geprüft: ${ziele}` : ''}`)
    nacharbeit.push(`enaio-Server: keiner antwortete. Unter „Herkunft der Installationsdateien" den Server von Hand eintragen und Capture erneut ausführen (das Setup entfällt dann, nur der Server wird gesetzt).`)
  }
  if (sw.server.some(s => s.offen && s.rolle !== 'sql' && s.name !== sw.gewaehlt && s.rolle !== 'test')) {
    nacharbeit.push(`Mehrere enaio-Server antworten (${sw.server.filter(s => s.offen && s.rolle !== 'sql').map(s => s.name).join(', ')}). Gewählt wurde ${sw.gewaehlt}. Meldet Capture „Verbindungsaufbau fehlgeschlagen", den anderen unter „Herkunft der Installationsdateien" eintragen und erneut ausführen.`)
  }

  // 3) Kopieren — nur, was gefunden wurde und gebraucht wird
  const mitMsi = !z.capturePfad && nutzeMsi
  const mitSetup = !z.capturePfad && !nutzeMsi && !!q.setupExe
  melde('kopie', 'laeuft', `${mitMsi ? `${q.msiMB} MB Capture-MSI + ` : mitSetup ? `${q.setupMB} MB Setup + ` : ''}Treiber + Konfiguration …`)
  const kopie = await api().runPowerShell([
    ROBOCOPY_PS,
    `$fehler = @()`,
    mitSetup ? `$c = Copy-SkfTree '${esc(q.setupOrdner)}' '${esc(zu)}\\Setup'; if ($c -ge 8) { $fehler += 'Setup (' + $c + ')' }` : '',
    // Ganzer Ordner: neben dem MSI können externe .cab-Dateien liegen
    mitMsi ? `$c = Copy-SkfTree '${esc(q.msiOrdner)}' '${esc(zu)}\\Msi'; if ($c -ge 8) { $fehler += 'Capture-MSI (' + $c + ')' }` : '',
    mitMsi ? `if (-not (Test-Path -LiteralPath '${esc(zu)}\\Msi\\${esc(q.msiName)}')) { $fehler += 'MSI fehlt am Ziel' }` : '',
    q.konfigOrdner ? `$c = Copy-SkfTree '${esc(q.konfigOrdner)}' '${esc(zu)}\\Konfig'; if ($c -ge 8) { $fehler += 'Konfiguration (' + $c + ')' }` : '',
    kofaxNoetig ? `$c = Copy-SkfTree '${esc(q.kofaxOrdner)}' '${esc(zu)}\\Kofax'; if ($c -ge 8) { $fehler += 'Kofax (' + $c + ')' }` : '',
    // Der TWAIN-Entpacker fragt sonst in einer Konsole „Folder Disk1 is exist, delete folder (Yes/No)?"
    (twainNoetig || isisNoetig) ? `Remove-Item -LiteralPath '${esc(zu)}\\Treiber\\Disk1' -Recurse -Force -EA SilentlyContinue` : '',
    twainNoetig ? `$c = Copy-SkfFile '${esc(q.twainExe)}' '${esc(zu)}\\Treiber'; if ($c -ge 8) { $fehler += 'TWAIN (' + $c + ')' }` : '',
    isisNoetig ? `$c = Copy-SkfFile '${esc(q.isisExe)}' '${esc(zu)}\\Treiber'; if ($c -ge 8) { $fehler += 'ISIS (' + $c + ')' }` : '',
    o.data2sap && q.data2sapOrdner ? `$c = Copy-SkfTree '${esc(q.data2sapOrdner)}' '${esc(zu)}\\DATA2SAP'; if ($c -ge 8) { $fehler += 'DATA2SAP (' + $c + ')' }` : '',
    mitSetup ? `if (-not (Test-Path -LiteralPath '${esc(zu)}\\Setup\\${esc(q.setupRel)}')) { $fehler += 'setup.exe fehlt am Ziel' }` : '',
    `if ($fehler.Count) { 'ERR:' + ($fehler -join ', ') } else { 'OK' }`,
  ].filter(Boolean).join('\n'), 60 * 60 * 1000)
  const kz = (kopie.stdout || '').split(/\r?\n/).map(l => l.trim()).find(l => l === 'OK' || l.startsWith('ERR:'))
  if (kz !== 'OK') return fehl('kopie', kz ? `Kopie unvollständig: ${kz.slice(4)}` : (kopie.stderr?.trim() || 'Kopie fehlgeschlagen.'))
  melde('kopie', 'ok', `abgelegt unter ${ZIEL}`)

  const setupExe = setupAmZiel || `${ZIEL}\\Setup\\${q.setupRel}`
  const setupOrdnerZiel = setupExe.slice(0, setupExe.lastIndexOf('\\'))
  const iss = `${ZIEL}\\capture.iss`
  const serverZeile = sw.gewaehlt
    ? `Fenster „Verbindung zum Server": Server = ${sw.gewaehlt}  ·  Port = ${sw.port}  (genau so eintragen, sonst nichts ändern)`
    : `Fenster „Verbindung zum Server": irgendeinen Wert lassen — das Tool trägt den Server danach selbst ein`

  // 4) Capture — Weg 1: still mit aufgezeichneten Antworten · Weg 2: mit Fenster + Aufzeichnung
  //    · Weg 3: mit Fenster ohne Aufzeichnung (falls das Setup /r nicht kennt)
  const pruefeAxindex = async (): Promise<boolean> => !!(await pruefeCaptureZiel(host)).capturePfad

  const still = async (): Promise<string> => {
    // Antwortdatei holen und den Installationsordner auf diesen PC umschreiben (D:↔C:)
    const vorb = await api().runPowerShell([
      `$t = [IO.File]::ReadAllText('${esc(ANTWORT_DATEI)}', [Text.Encoding]::Default)`,
      // Im Ersetzungstext ist „\" kein Escape-Zeichen (nur „$") — Pfad also unverändert einsetzen.
      `$t = [regex]::Replace($t, '[CD]:\\\\OS\\\\OSECM', '${esc(z.basis)}', 'IgnoreCase')`,
      `[IO.File]::WriteAllText('${esc(zu)}\\capture.iss', $t, [Text.Encoding]::Default)`,
      `'OK'`,
    ].join('\n'), 60000)
    if (!(vorb.stdout || '').includes('OK')) return 'Antwortdatei nicht übertragbar'
    const inner = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$p = Start-Process -FilePath $o.exe -ArgumentList '/s', ('/f1"' + $o.iss + '"'), ('/f2"' + $o.log + '"') -WorkingDirectory ([IO.Path]::GetDirectoryName($o.exe)) -Wait -PassThru
$bis = (Get-Date).AddMinutes(15)
while ((Get-Process -Name ISBEW64, IDriver -EA SilentlyContinue) -and (Get-Date) -lt $bis) { Start-Sleep -Seconds 5 }
$rc = ''
if (Test-Path -LiteralPath $o.log) { $m = Select-String -LiteralPath $o.log -Pattern 'ResultCode=(-?\d+)' | Select-Object -First 1; if ($m) { $rc = $m.Matches[0].Groups[1].Value } }
'@@CAPSETUP@@' + (@{ ok = $true; code = $p.ExitCode; rc = $rc } | ConvertTo-Json -Compress)
`
    const r = await api().runPowerShell(fernBefehl(host, inner, '@@CAPSETUP@@', b64(JSON.stringify({ exe: setupExe, iss, log: `${ZIEL}\\capture_setup.log` }))), 45 * 60 * 1000)
    const j = getagged<{ ok?: boolean; code?: number; rc?: string; fehler?: string }>(r.stdout, '@@CAPSETUP@@')
    if (!j || j.ok === false) return j?.fehler || (r.timedOut ? 'Zeitüberschreitung' : 'keine Rückmeldung')
    // InstallShield: ResultCode 0 = ok; -3 = Antwortdatei passt nicht zu den Dialogen (andere Setup-Version)
    if (j.rc && j.rc !== '0') return `ResultCode ${j.rc}${j.rc === '-3' ? ' — Antworten passen nicht zu diesem Setup' : ''}`
    if (!(await pruefeAxindex())) return 'Setup lief durch, Capture ist aber nicht vorhanden'
    return ''
  }

  const mitFenster = async (aufzeichnen: boolean): Promise<string> => {
    hinweis({
      titel: `enaio Capture-Setup am PC durchklicken${aufzeichnen ? ' (wird aufgezeichnet)' : ''}`,
      punkte: [
        'Fenster „Art der Installation": auf „Client Installation" klicken',
        'Fenster „Komponenten wählen": unter „enaio : Clientkomponenten" NUR das Häkchen bei „enaio : Capture" setzen — alle anderen Häkchen weg — „Weiter"',
        'Fenster „Installationsverzeichnisse" (Zielordner): NICHTS ändern, den vorgeschlagenen Ordner übernehmen — „Weiter". Das Tool findet Capture danach selbst und richtet alles am richtigen Ort ein.',
        serverZeile,
        'Fenster „Log_Client-Verzeichnis" bzw. alle weiteren: Vorgabe lassen — „Weiter"',
        'Zum Schluss „Fertigstellen" — einen Neustart jetzt ablehnen',
        ...(aufzeichnen ? ['Diese Antworten werden gespeichert — ab dem nächsten PC läuft das Setup ohne Fenster.'] : []),
      ],
    })
    const t0 = Date.now()
    const f = await sichtbarAusfuehren(host, z.sitzung!, setupExe, aufzeichnen ? ['/r', `/f1"${iss}"`] : [], setupOrdnerZiel, 60,
      s => melde('capture', 'laeuft', `Fenster am PC offen seit ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} — bitte dort durchklicken.`))
    hinweis(null)
    if (f) return f
    if (await pruefeAxindex()) return ''
    // Sofort wieder zu und nichts installiert → das Setup kennt /r vermutlich nicht
    return Date.now() - t0 < 45_000 && aufzeichnen ? 'SOFORT_ZU' : 'Das Setup wurde beendet, Capture ist aber nicht installiert (abgebrochen oder Komponente „Capture" nicht gewählt?).'
  }

  // Weg MSI (enaio 10/11): still per msiexec, kein Fenster beim Anwender. SERVER_IP/SERVER_PORT
  // sind die öffentlichen Eigenschaften des Capture-MSI; den Comstring setzt danach ohnehin Schritt „asinit".
  const perMsi = async (msi: string): Promise<string> => {
    const log = `${ZIEL}\\capture_msi.log`
    const inner = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$arg = @('/i', ('"' + $o.msi + '"'), '/qn', '/norestart', 'REBOOT=ReallySuppress', 'ALLUSERS=1', ('/l*v "' + $o.log + '"'))
if ($o.server) { $arg += ('SERVER_IP=' + $o.server); $arg += ('SERVER_PORT=' + $o.port) }
$p = Start-Process msiexec.exe -ArgumentList $arg -Wait -PassThru
$z = ''
if (Test-Path -LiteralPath $o.log) { $z = @(Get-Content -LiteralPath $o.log -EA SilentlyContinue | Select-String -Pattern 'Return value 3|Fehler \d{4}|Error \d{4}' | Select-Object -First 3 | ForEach-Object { $_.Line.Trim() }) -join ' | ' }
'@@CAPMSI@@' + (@{ ok = $true; code = $p.ExitCode; zeilen = $z } | ConvertTo-Json -Compress)
`
    const r = await api().runPowerShell(fernBefehl(host, inner, '@@CAPMSI@@', b64(JSON.stringify({ msi, log, server: sw.gewaehlt, port: sw.port }))), 45 * 60 * 1000)
    const j = getagged<{ ok?: boolean; code?: number; zeilen?: string; fehler?: string }>(r.stdout, '@@CAPMSI@@')
    if (!j || j.ok === false) return j?.fehler || (r.timedOut ? 'Zeitüberschreitung' : 'keine Rückmeldung')
    const code = Number(j.code)
    if (code === 1618) return 'Gerade läuft eine andere Installation am PC (msiexec 1618) — kurz warten und erneut ausführen.'
    if (code === 1638) return 'Eine andere Capture-Version ist installiert (msiexec 1638) — mit „Capture neu installieren" erneut ausführen.'
    if (![0, 1641, 3010].includes(code)) return `msiexec Rückgabe ${code}${j.zeilen ? ` — ${j.zeilen}` : ''} (Protokoll am PC: ${log})`
    if (!(await pruefeAxindex())) return `msiexec meldet Erfolg, axindex.exe ist aber nicht zu finden (Protokoll am PC: ${log})`
    return code === 0 ? '' : 'NEUSTART'
  }

  if (z.capturePfad) {
    melde('capture', 'ok', `Bereits installiert: ${z.capturePfad} — Setup übersprungen.`)
  } else if (msiWeg) {
    const msi = msiAmZiel || `${ZIEL}\\Msi\\${q.msiName}`
    melde('capture', 'laeuft', `Capture ${q.msiVersion || ''} wird still per MSI installiert (kein Fenster beim Anwender) …`)
    const f = await perMsi(msi)
    if (f && f !== 'NEUSTART') return fehl('capture', f)
    melde('capture', 'ok', `still installiert per MSI${f === 'NEUSTART' ? ' — Neustart des PCs nötig' : ''}`)
    if (f === 'NEUSTART') nacharbeit.push('Capture: msiexec verlangt einen Neustart des PCs — bitte zu passender Zeit neu starten.')
  } else {
    let geschafft = false
    let grund = ''
    if (q.antwortDatei) {
      melde('capture', 'laeuft', 'Weg 1: still mit den aufgezeichneten Antworten — ohne Fenster beim Anwender.')
      grund = await still()
      if (!grund) { geschafft = true; melde('capture', 'ok', 'still installiert (aufgezeichnete Antworten)') }
    }
    if (!geschafft) {
      if (z.sitzung === null) {
        return fehl('capture', `${grund ? `Stilles Setup ging nicht (${grund}). ` : ''}Für das Setup mit Fenster muss am PC jemand angemeldet und der Bildschirm entsperrt sein.`)
      }
      melde('capture', 'laeuft', `${grund ? `Weg 1 ging nicht (${grund}) — ` : ''}Weg 2: Setup mit Fenster am PC, Antworten werden aufgezeichnet.`)
      let f = await mitFenster(true)
      if (f === 'SOFORT_ZU') {
        melde('capture', 'laeuft', 'Weg 2 ging nicht (Setup kennt die Aufzeichnung offenbar nicht) — Weg 3: Setup normal mit Fenster.')
        f = await mitFenster(false)
      }
      if (f) return fehl('capture', f)
      // Aufzeichnung zentral sichern (die alte als .bak behalten)
      const sich = await api().runPowerShell([
        `$q = '${esc(zu)}\\capture.iss'; $z = '${esc(ANTWORT_DATEI)}'`,
        `if (-not (Test-Path -LiteralPath $q)) { 'KEINE'; return }`,
        `New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($z)) | Out-Null`,
        `if (Test-Path -LiteralPath $z) { Copy-Item -LiteralPath $z -Destination ($z + '.bak') -Force }`,
        `Copy-Item -LiteralPath $q -Destination $z -Force; 'OK'`,
      ].join('\n'), 60000)
      const gesichert = (sich.stdout || '').includes('OK')
      melde('capture', 'ok', gesichert ? 'Setup abgeschlossen — Antworten gespeichert, nächste PCs laufen still.' : 'Setup abgeschlossen.')
    }
  }

  // Wo ist Capture wirklich? (Standard des Setups, D:\OS, C:\OS oder ein eigener Ordner)
  const ist = await pruefeCaptureZiel(host)
  if (ist.capturePfad) asindex = ist.capturePfad.slice(0, ist.capturePfad.lastIndexOf('\\'))
  const basisIst = asindex.replace(/\\clients\\asindex$/i, '')
  if (ist.capturePfad && !z.capturePfad) melde('capture', 'ok', `installiert unter ${asindex}${msiWeg ? ` (still per MSI${ist.captureVersion ? `, Version ${ist.captureVersion}` : ''})` : ''}`)

  // 5–7) Kofax und Treiber — Setups mit Fenster
  const fenster = async (id: string, titel: string, exe: string, args: string[], ordner: string) => {
    melde(id, 'laeuft', 'Fenster am PC offen — bitte dort durchklicken.')
    hinweis({ titel, punkte: KLICK_STANDARD })
    const f = await sichtbarAusfuehren(host, z.sitzung!, exe, args, ordner, 40,
      s => melde(id, 'laeuft', `Fenster am PC offen seit ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} — bitte dort durchklicken.`))
    hinweis(null)
    if (f) { melde(id, 'warnung', f); return false }
    melde(id, 'ok', 'abgeschlossen')
    return true
  }
  // Nicht gefunden → überspringen, aber sagen wo gesucht wurde und was zu tun ist
  const uebersprungen = (id: string, was: string, tipp: string) => {
    melde(id, 'warnung', `nicht gefunden — übersprungen. Gesucht: ${diagText(q, was) || '—'}`)
    nacharbeit.push(`${tipp}`)
  }
  const schonDa = (id: string, p: Prog | undefined) => {
    if (!p) return false
    melde(id, 'ok', `bereits installiert: ${p.name}${p.version ? ' ' + p.version : ''} — übersprungen`)
    return true
  }
  if (o.kofax && schonDa('kofax', kofaxDa)) { /* nichts zu tun */ }
  else if (o.kofax) {
    if (!q.kofaxExe) uebersprungen('kofax', 'Kofax', 'Kofax Retrieval Engine 3.1 von Hand installieren (oder den Ordner „kofax…" in SW_INSTA\\ENAIO\\Scanclient ablegen und Capture erneut starten).')
    else {
      const rel = q.kofaxExe.slice(q.kofaxOrdner.length).replace(/^\\/, '')
      const exe = `${ZIEL}\\Kofax\\${rel}`
      await fenster('kofax', 'Kofax Retrieval Engine 3.1 am PC installieren', exe, [], exe.slice(0, exe.lastIndexOf('\\')))
    }
  }
  // Capture findet die Kofax-Bildbibliothek nur über den Systempfad (Installationshandbuch enaio Capture)
  if (o.kofax) {
    const pfadInner = String.raw`
$kand = @("${'$'}{env:ProgramFiles(x86)}\Kofax\imgctls\BIN", "$env:ProgramFiles\Kofax\imgctls\BIN") | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
$bin = @($kand)[0]
if (-not $bin) { '@@CAPPFAD@@' + (@{ ok = $true; art = 'fehlt' } | ConvertTo-Json -Compress); return }
$p = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$teile = @($p -split ';' | ForEach-Object { $_.Trim().TrimEnd('\') } | Where-Object { $_ })
if ($teile -contains $bin.TrimEnd('\')) { '@@CAPPFAD@@' + (@{ ok = $true; art = 'da'; bin = $bin } | ConvertTo-Json -Compress); return }
[Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';') + ';' + $bin), 'Machine')
'@@CAPPFAD@@' + (@{ ok = $true; art = 'neu'; bin = $bin } | ConvertTo-Json -Compress)
`
    melde('kofaxpfad', 'laeuft')
    const r = await api().runPowerShell(fernBefehl(host, pfadInner, '@@CAPPFAD@@', b64('{}')), 120000)
    const j = getagged<{ ok?: boolean; art?: string; bin?: string; fehler?: string }>(r.stdout, '@@CAPPFAD@@')
    if (!j || j.ok === false) melde('kofaxpfad', 'warnung', j?.fehler || 'keine Rückmeldung')
    else if (j.art === 'fehlt') {
      melde('kofaxpfad', 'warnung', 'Ordner Kofax\\imgctls\\BIN nicht gefunden — ist Kofax installiert?')
      nacharbeit.push('Kofax: nach der Installation „…\\Kofax\\imgctls\\BIN" in den System-PATH eintragen (oder Capture erneut ausführen, das Tool trägt ihn dann ein).')
    } else melde('kofaxpfad', 'ok', j.art === 'da' ? `schon eingetragen: ${j.bin}` : `eingetragen: ${j.bin} (gilt ab der nächsten Anmeldung)`)
  }
  const dateiname = (p: string) => p.slice(p.lastIndexOf('\\') + 1)
  if (o.twain && schonDa('twain', twainDa)) { /* nichts zu tun */ }
  else if (o.twain) {
    if (!q.twainExe) uebersprungen('twain', 'TWAIN', 'Scanner-Treiber fi-7160 „PaperStream IP (TWAIN)" von der Hersteller-Seite (Ricoh/PFU, fi-7160) laden und installieren — oder die PSIPTWAIN-*.exe in SW_INSTA\\ENAIO\\Scanclient ablegen.')
    else await fenster('twain', 'Scanner-Treiber fi-7160 (PaperStream IP TWAIN) am PC installieren', `${ZIEL}\\Treiber\\${dateiname(q.twainExe)}`, [], `${ZIEL}\\Treiber`)
  }
  if (o.isis && schonDa('isis', isisDa)) { /* nichts zu tun */ }
  else if (o.isis) {
    if (!q.isisExe) uebersprungen('isis', 'ISIS', 'ISIS-Treiber fi-6140 von Hand installieren (nur für den alten Scanner nötig).')
    else await fenster('isis', 'Scanner-Treiber fi-6140 (ISIS) am PC installieren', `${ZIEL}\\Treiber\\${dateiname(q.isisExe)}`, [], `${ZIEL}\\Treiber`)
  }

  // 8) Konfiguration nach asindex + Pfade umschreiben
  if (!q.konfigOrdner) {
    uebersprungen('konfig', 'Konfiguration', 'Scan-Konfiguration fehlt: unter „Herkunft der Installationsdateien" einen vorhandenen Scan-Arbeitsplatz als Vorlage-PC eintragen und Capture erneut ausführen — oder Subprogramm/Scankonfiguration in Capture als Administrator von Hand anlegen.')
  } else {
  melde('konfig', 'laeuft')
  const konfInner = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$ziel = $o.asindex
if (-not (Test-Path -LiteralPath $ziel)) { New-Item -ItemType Directory -Force -Path $ziel | Out-Null }
$quelle = $o.quelle
$n = 0; $um = 0; $err = @()
foreach ($f in @(Get-ChildItem -LiteralPath $quelle -Recurse -File)) {
  # Vom Vorlage-PC nur die Konfiguration — nie dessen (evtl. ältere) Programmdateien
  if ($o.ohneProgramme -and $f.Extension -match '^\.(exe|dll|ocx|chm|sys|msi|cab)$') { continue }
  $rel = $f.FullName.Substring($quelle.Length).TrimStart('\')
  $dst = Join-Path $ziel $rel
  try {
    New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($dst)) | Out-Null
    Copy-Item -LiteralPath $f.FullName -Destination $dst -Force -EA Stop; $n++
    if ($f.Extension -match '^\.(cfg|ini|txt|xml|inf|bat|cmd|reg|dat)$' -and $f.Length -lt 5MB) {
      $bytes = [IO.File]::ReadAllBytes($dst)
      $uni = ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE)
      if (-not $uni -and ($bytes -contains 0)) { continue }
      $enc = $(if ($uni) { [Text.Encoding]::Unicode } else { [Text.Encoding]::Default })
      $t = $enc.GetString($bytes)
      $neu = [regex]::Replace($t, '[CD]:\\OS\\OSECM', [string]$o.basis, 'IgnoreCase')
      if ($neu -ne $t) { [IO.File]::WriteAllText($dst, $neu.TrimStart([char]0xFEFF), $enc); $um++ }
    }
  } catch { $err += ($rel + ': ' + $_.Exception.Message) }
}
'@@CAPKONF@@' + (@{ ok = $true; n = $n; um = $um; err = @($err) } | ConvertTo-Json -Compress)
`
  const kr = await api().runPowerShell(fernBefehl(host, konfInner, '@@CAPKONF@@',
    b64(JSON.stringify({ quelle: `${ZIEL}\\Konfig`, asindex, basis: basisIst, ohneProgramme: q.konfigVonPc }))), 10 * 60 * 1000)
  const kj = getagged<{ ok?: boolean; n?: number; um?: number; err?: unknown; fehler?: string }>(kr.stdout, '@@CAPKONF@@')
  if (!kj || kj.ok === false) {
    melde('konfig', 'warnung', `${kj?.fehler || 'Keine Rückmeldung vom Ziel-PC.'} — Konfiguration nicht übernommen.`)
    nacharbeit.push(`Scan-Konfiguration von Hand nach ${asindex} kopieren (Quelle: ${q.konfigOrdner}).`)
  } else {
    const kerr = asArr<string>(kj.err)
    melde('konfig', kerr.length ? 'warnung' : 'ok', `${kj.n} Datei(en) nach ${asindex}${q.konfigVonPc ? ' (vom Vorlage-PC, ohne Programmdateien)' : ''}${kj.um ? ` · Pfade in ${kj.um} Datei(en) auf ${basisIst} angepasst` : ''}${kerr.length ? ` · nicht kopiert: ${kerr.slice(0, 3).join('; ')}` : ''}`)
  }
  }

  // 8b) Server in asinit.cfg — NACH der Konfiguration (die kann eine alte asinit.cfg mit
  //     VM0127 mitbringen) und unabhängig davon, was im Setup eingetippt wurde.
  if (!sw.gewaehlt) {
    melde('asinit', 'warnung', 'kein erreichbarer enaio-Server ermittelt — asinit.cfg unverändert')
  } else {
    melde('asinit', 'laeuft')
    // Format wie im enaio-Client-Paket:  [ARCHIV]  Comstring=enaioprod.skf.net#4000
    // Vorhandene Comstring-Zeile ersetzen · sonst unter [ARCHIV] einfügen · sonst [ARCHIV]
    // samt Zeile voranstellen · keine Datei → neu anlegen. Alle anderen Zeilen bleiben.
    const asInner = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$wert = [string]$o.server + '#' + [string]$o.port
$dateien = @(Get-ChildItem -LiteralPath $o.asindex -Filter 'asinit.cfg' -File -EA SilentlyContinue)
$alt = @(); $aktion = @()
if (-not $dateien.Count) {
  $p = Join-Path $o.asindex 'asinit.cfg'
  $crlf = [string][char]13 + [char]10
  [IO.File]::WriteAllText($p, ('[ARCHIV]' + $crlf + 'Comstring=' + $wert + $crlf), [Text.Encoding]::Default)
  $aktion += 'neu angelegt'
}
foreach ($d in $dateien) {
  $bytes = [IO.File]::ReadAllBytes($d.FullName)
  $uni = ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE)
  $enc = $(if ($uni) { [Text.Encoding]::Unicode } else { [Text.Encoding]::Default })
  $t = $enc.GetString($bytes).TrimStart([char]0xFEFF)
  if (-not (Test-Path -LiteralPath ($d.FullName + '.itadmin.bak'))) { Copy-Item -LiteralPath $d.FullName -Destination ($d.FullName + '.itadmin.bak') }
  $nl = $(if ($t.Contains([string][char]13 + [char]10)) { [string][char]13 + [char]10 } else { [string][char]10 })
  $muster = '(?im)^([ \t]*Comstring[ \t]*=[ \t]*)([^\r\n]*)'
  $treffer = [regex]::Matches($t, $muster)
  if ($treffer.Count) {
    foreach ($m in $treffer) { $alt += $m.Groups[2].Value.Trim() }
    $neu = [regex]::Replace($t, $muster, { param($m) $m.Groups[1].Value + $wert })
    $aktion += 'Comstring ersetzt'
  } elseif ($t -match '(?im)^[ \t]*\[ARCHIV\][ \t]*\r?$') {
    # Das \r des Zeilenendes gehört nicht zum Abschnittsnamen — sonst entstünde ein zweites [ARCHIV].
    # Instanz-Replace mit Anzahl 1 (das statische [regex]::Replace kennt keine Anzahl).
    $neu = ([regex]'(?im)^([ \t]*\[ARCHIV\][ \t]*)(\r?)$').Replace($t, { param($m) $m.Groups[1].Value + $nl + 'Comstring=' + $wert + $m.Groups[2].Value }, 1)
    $aktion += 'Comstring unter [ARCHIV] ergänzt'
  } else {
    $neu = '[ARCHIV]' + $nl + 'Comstring=' + $wert + $nl + $nl + $t
    $aktion += '[ARCHIV] mit Comstring ergänzt'
  }
  if ($neu -ne $t) { [IO.File]::WriteAllText($d.FullName, $neu, $enc) }
}
# Verbindung von hier (Ziel-PC) zum Server testen
$ok = $false
try { $c = New-Object Net.Sockets.TcpClient; $a = $c.BeginConnect([string]$o.server, [int]$o.port, $null, $null); $ok = $a.AsyncWaitHandle.WaitOne(3000) -and $c.Connected; $c.Close() } catch {}
'@@CAPASINIT@@' + (@{ ok = $true; dateien = $dateien.Count; alt = @($alt | Select-Object -Unique); aktion = @($aktion | Select-Object -Unique); verbindung = [bool]$ok } | ConvertTo-Json -Compress)
`
    const ar = await api().runPowerShell(fernBefehl(host, asInner, '@@CAPASINIT@@', b64(JSON.stringify({ asindex, server: sw.gewaehlt, port: sw.port }))), 90000)
    const aj = getagged<{ ok?: boolean; dateien?: number; alt?: unknown; aktion?: unknown; verbindung?: boolean; fehler?: string }>(ar.stdout, '@@CAPASINIT@@')
    if (!aj || aj.ok === false) {
      melde('asinit', 'warnung', aj?.fehler || 'Keine Rückmeldung vom Ziel-PC.')
      nacharbeit.push(`In ${asindex}\\asinit.cfg im Abschnitt [ARCHIV] die Zeile „Comstring=${sw.gewaehlt}#${sw.port}" eintragen.`)
    } else {
      const alt = asArr<string>(aj.alt).filter(Boolean)
      const aktion = asArr<string>(aj.aktion).filter(Boolean)
      melde('asinit', aj.verbindung ? 'ok' : 'warnung',
        `Comstring=${sw.gewaehlt}#${sw.port}${alt.length ? ` (vorher: ${alt.join(', ')})` : ''} · ${aktion.join(', ') || 'unverändert'}`
        + ` · Verbindung vom PC ${aj.verbindung ? 'klappt' : 'klappt NICHT — Netz/Firewall zum enaio-Server prüfen'}`
        + `${aj.dateien ? ' · Sicherung: asinit.cfg.itadmin.bak' : ''}`)
      if (!aj.verbindung) nacharbeit.push(`Vom Scan-PC aus ist ${sw.gewaehlt}:${sw.port} nicht erreichbar — Netz/Firewall prüfen, sonst kann Capture keine Verbindung aufbauen.`)
    }
  }

  // 9) ODBC
  melde('odbc', 'laeuft')
  const odbcInner = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$drv = 'Microsoft Access Driver (*.mdb)'
$dbq = Join-Path $o.asindex 'oscapture.mdb'
try {
  if (-not (Get-OdbcDriver -Name $drv -Platform '32-bit' -EA SilentlyContinue)) { throw ('32-Bit-Treiber „' + $drv + '" fehlt') }
  $d = Get-OdbcDsn -Name 'OSCAPTURE' -DsnType 'System' -Platform '32-bit' -EA SilentlyContinue
  if ($d) { Set-OdbcDsn -Name 'OSCAPTURE' -DsnType 'System' -Platform '32-bit' -SetPropertyValue ('Dbq=' + $dbq) -EA Stop; $art = 'angepasst' }
  else { Add-OdbcDsn -Name 'OSCAPTURE' -DriverName $drv -DsnType 'System' -Platform '32-bit' -SetPropertyValue @('Dbq=' + $dbq) -EA Stop; $art = 'angelegt' }
  '@@CAPODBC@@' + (@{ ok = $true; art = $art; dbq = $dbq; mdb = [bool](Test-Path -LiteralPath $dbq) } | ConvertTo-Json -Compress)
} catch { '@@CAPODBC@@' + (@{ ok = $false; fehler = $_.Exception.Message } | ConvertTo-Json -Compress) }
`
  const or = await api().runPowerShell(fernBefehl(host, odbcInner, '@@CAPODBC@@', b64(JSON.stringify({ asindex }))), 120000)
  const oj = getagged<{ ok?: boolean; art?: string; dbq?: string; mdb?: boolean; fehler?: string }>(or.stdout, '@@CAPODBC@@')
  if (!oj || oj.ok === false) melde('odbc', 'warnung', `${oj?.fehler || 'Keine Rückmeldung.'} — bitte im 32-Bit-ODBC-Dialog (C:\\Windows\\SysWOW64\\odbcad32.exe) prüfen.`)
  else melde('odbc', oj.mdb ? 'ok' : 'warnung', `OSCAPTURE ${oj.art} → ${oj.dbq}${oj.mdb ? '' : ' (Datenbankdatei fehlt noch — sie sollte mit der Konfiguration kommen)'}`)

  // 10) DATA2SAP (Meldung „OK" erscheint am PC)
  if (o.data2sap) {
    const client32 = 'C:\\Program Files (x86)\\OPTIMAL SYSTEMS\\OSECM\\clients\\client32'
    melde('data2sap', 'laeuft')
    // Ohne gefundenen DATA2SAP-Ordner: bringt der enaio Client axData2SAP.exe schon mit,
    // genügt das Registrieren — sonst überspringen.
    const dk = await api().runPowerShell([
      ROBOCOPY_PS,
      `$z = '\\\\${esc(host)}\\C$\\Program Files (x86)\\OPTIMAL SYSTEMS\\OSECM\\clients\\client32'`,
      `if (-not (Test-Path -LiteralPath $z)) { 'ERR:Der enaio Client (client32) ist auf dem PC nicht installiert — erst die normale Enaio-Installation ausführen.'; return }`,
      q.data2sapOrdner
        ? `$c = Copy-SkfTree '${esc(zu)}\\DATA2SAP' $z; if ($c -ge 8) { 'ERR:Kopie fehlgeschlagen (' + $c + ')' } else { 'OK' }`
        : `if (Test-Path -LiteralPath (Join-Path $z 'axData2SAP.exe')) { 'OK' } else { 'ERR:DATA2SAP nicht gefunden (weder in den Quellen noch im enaio Client) — übersprungen.' }`,
    ].join('\n'), 10 * 60 * 1000)
    const dz = (dk.stdout || '').split(/\r?\n/).map(l => l.trim()).find(l => l === 'OK' || l.startsWith('ERR:'))
    if (dz !== 'OK') { melde('data2sap', 'warnung', dz ? dz.slice(4) : 'Kopie fehlgeschlagen.'); nacharbeit.push('DATA2SAP von Hand ins client32-Verzeichnis kopieren und mit „axData2SAP.exe register" registrieren.') }
    else {
      hinweis({ titel: 'DATA2SAP wird registriert', punkte: ['Am PC erscheint eine Meldung — mit „OK" bestätigen.'] })
      const f = await sichtbarAusfuehren(host, z.sitzung!, `${client32}\\axData2SAP.exe`, ['register'], client32, 10, () => undefined)
      hinweis(null)
      melde('data2sap', f ? 'warnung' : 'ok', f || 'registriert')
      nacharbeit.push(`DATA2SAP einrichten: am PC „${client32}\\axData2SAP.exe" config ausführen und im Capture-Client unter Enaio\\Batchoptionen die Felder festlegen.`)
    }
  }

  // 11) Prüfen
  melde('pruefen', 'laeuft')
  const nach = await pruefeCaptureZiel(host)
  if (!nach.ok) melde('pruefen', 'warnung', nach.fehler || 'Nachprüfung nicht möglich.')
  else if (!nach.capturePfad) return fehl('pruefen', `Capture ist nicht zu finden (axindex.exe fehlt unter ${asindex}). Wurde im Setup ein anderer Zielordner gewählt?`)
  else melde('pruefen', 'ok', `Capture vorhanden: ${nach.capturePfad}`)

  // 12) Beim Anwender starten — trägt den Arbeitsplatz in die Lizenzdatenbank ein
  if (o.starten && nach.capturePfad) {
    melde('starten', 'laeuft')
    const startInner = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
try {
  $u = [string](Get-CimInstance Win32_ComputerSystem).UserName
  if (-not $u) { $e = @(Get-Process explorer -IncludeUserName | Where-Object { $_.UserName }) | Select-Object -First 1; if ($e) { $u = [string]$e.UserName } }
  if (-not $u) { '@@CAPSTART@@' + (@{ ok = $false; fehler = 'niemand angemeldet' } | ConvertTo-Json -Compress); return }
  $n = 'ITAdminCapture_' + [guid]::NewGuid().ToString('N').Substring(0, 8)
  $a = New-ScheduledTaskAction -Execute $o.exe -WorkingDirectory ([IO.Path]::GetDirectoryName($o.exe))
  $p = New-ScheduledTaskPrincipal -UserId $u -LogonType Interactive
  $s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $n -Action $a -Principal $p -Settings $s -Force | Out-Null
  Start-ScheduledTask -TaskName $n; Start-Sleep -Seconds 5
  Unregister-ScheduledTask -TaskName $n -Confirm:$false
  '@@CAPSTART@@' + (@{ ok = $true; wer = $u } | ConvertTo-Json -Compress)
} catch { '@@CAPSTART@@' + (@{ ok = $false; fehler = $_.Exception.Message } | ConvertTo-Json -Compress) }
`
    const sr = await api().runPowerShell(fernBefehl(host, startInner, '@@CAPSTART@@', b64(JSON.stringify({ exe: nach.capturePfad }))), 90000)
    const sj = getagged<{ ok?: boolean; wer?: string; fehler?: string }>(sr.stdout, '@@CAPSTART@@')
    melde('starten', sj?.ok ? 'ok' : 'warnung', sj?.ok ? `bei ${sj.wer} gestartet — ein Lizenzfehler (AIX) ist beim ersten Start normal` : (sj?.fehler || 'Start nicht möglich'))
  }

  hinweis(null)
  return {
    ok: true,
    text: `enaio Capture ist auf ${host} unter ${asindex} eingerichtet${sw.gewaehlt ? ` — Server ${sw.gewaehlt}#${sw.port}` : ''}.`,
    nacharbeit,
  }
}
