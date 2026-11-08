// ── Kachel „IT Admin Tool" (Software Installationen): das Tool selbst verteilen ──
// Das Setup („IT Admin Tool Setup x.y.z.exe") liegt auf dem Admin-PC direkt unter C:\.
// Von dort wird es auf andere PCs gebracht und still installiert:
//
//   1. Setup auf diesem PC finden (neuestes unter C:\ oder eine gewählte Datei;
//      Produktname „IT Admin Tool" aus den Dateieigenschaften muss passen)
//   2. Ziel-PC prüfen. NIE auf einem Server (Name/IP aus Server-Monitor und Inventar,
//      danach ProductType ≠ 1 auf dem PC selbst) und NIE auf dem eigenen PC
//      (das Tool würde sich mitten in der Installation selbst beenden).
//   3. Setup über \\<host>\C$ kopieren. Der Admin-PC ist der Mittelsmann, wie bei
//      Jabra/FreeCAD (Doppelhop).
//   4. Desktop-Nachricht „Achtung, neue Version vom IT Admin Tool wird installiert"
//      (msg * → alle angemeldeten Sitzungen), danach die Vorwarnzeit, wenn das Tool läuft
//   5. IT Admin Tool beenden (alle Benutzer)
//   6. Setup still: /S. electron-builder NSIS, perMachine → C:\Program Files\IT Admin Tool.
//      Das Setup beendet selbst noch einmal hängende Reste (build/installer.nsh).
//   7. Gegenprobe statt „Exitcode 0 = fertig": Dateidatum + Größe der app.asar vorher/nachher.
//      ACHTUNG (erster echter Lauf 05.11.2026, DE5CG3485QN8): Die installierten Dateien tragen
//      das Datum des BUILDS (app.asar im Build 14:18:38, Setup 14:19:50), NICHT das der
//      Installation. „Datum ≥ Installationsstart" war deshalb falsch und meldete einen Fehler,
//      obwohl der Stand von 22.10. auf 05.11. gewechselt hatte. Richtig: geändert gegenüber
//      vorher ODER passt zum Setup (Build-Datum kurz vor dem Setup-Datum) = installiert.
//   8. Desktop-Nachricht „Installation ist durch" (bei Fehlern ein ehrlicher Text)
//   9. Setup vom PC löschen

import { api } from '../electronAPI'
import { ROBOCOPY_PS } from '../utils/robocopy'
import { isIpv4, isValidRemoteTarget } from '../utils/remoteTarget'
import { esc, b64, asArr, fernBefehl, getagged, verbinde } from './enaioInstall'

export const TOOL_PRODUKT = 'IT Admin Tool'
export const SETUP_ORDNER_STANDARD = 'C:\\'
const SETUP_MUSTER = 'IT Admin Tool Setup*.exe'
const ZIEL_ORDNER = 'C:\\Windows\\Temp\\itadmintool_selbst'
const INSTALL_MINUTEN = 15
/** Merkt sich eine von Hand gewählte Setup-Datei (nur für diesen Admin-PC). */
const PFAD_KEY = 'itAdminTool.setupPfad'

export function gewaehlteSetupDatei(): string {
  try { return localStorage.getItem(PFAD_KEY) || '' } catch { return '' }
}
export function setzeSetupDatei(pfad: string): void {
  try { if (pfad) localStorage.setItem(PFAD_KEY, pfad); else localStorage.removeItem(PFAD_KEY) } catch { /* egal */ }
}

// ── Zeit-Helfer ──────────────────────────────────────────────────────────────
/** „05.11.2026 11:31" aus einem ISO-Zeitpunkt. Leer bei ungültigem Wert. */
export function zeitText(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const z = (n: number) => String(n).padStart(2, '0')
  return `${z(d.getDate())}.${z(d.getMonth() + 1)}.${d.getFullYear()} ${z(d.getHours())}:${z(d.getMinutes())}`
}
const ms = (iso?: string) => { const t = iso ? new Date(iso).getTime() : NaN; return isNaN(t) ? NaN : t }

// ── 1) Setup auf diesem PC ───────────────────────────────────────────────────
export interface ToolSetup {
  ok: boolean
  fehler?: string
  pfad: string
  name: string
  bytes: number
  groesseMB: number
  /** Dateidatum des Setups (≈ Build-Zeitpunkt), ISO */
  erstellt: string
  version: string
  /** weitere (ältere) Setups im Standardordner, die NICHT genommen werden */
  weitere: string[]
  eigeneWahl: boolean
}

const SETUP_PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
function Get-SkfInfo($f) {
  $vi = $f.VersionInfo
  [pscustomobject]@{ pfad = $f.FullName; name = $f.Name; bytes = [int64]$f.Length; erstellt = ($f.LastWriteTime.ToUniversalTime().ToString('s') + 'Z'); produkt = [string]$vi.ProductName; version = [string]$vi.ProductVersion }
}
if ($o.datei) {
  if (-not (Test-Path -LiteralPath $o.datei -PathType Leaf)) { '@@ITSETUP@@' + (@{ ok = $false; fehler = ('Datei nicht gefunden: ' + $o.datei) } | ConvertTo-Json -Compress); return }
  $liste = @(Get-SkfInfo (Get-Item -LiteralPath $o.datei))
} else {
  if (-not (Test-Path -LiteralPath $o.ordner)) { '@@ITSETUP@@' + (@{ ok = $false; fehler = ('Ordner nicht erreichbar: ' + $o.ordner) } | ConvertTo-Json -Compress); return }
  $liste = @(Get-ChildItem -LiteralPath $o.ordner -File -Filter $o.muster | Sort-Object LastWriteTime -Descending | ForEach-Object { Get-SkfInfo $_ })
}
'@@ITSETUP@@' + (@{ ok = $true; liste = @($liste) } | ConvertTo-Json -Depth 4 -Compress)
`

interface SetupRoh { pfad: string; name: string; bytes: number; erstellt: string; produkt: string; version: string }

/** Wählt aus den gefundenen Dateien das Setup aus (rein, testbar). */
export function waehleSetup(liste: SetupRoh[], eigeneWahl: boolean, ordner: string): ToolSetup {
  const leer: ToolSetup = { ok: false, pfad: '', name: '', bytes: 0, groesseMB: 0, erstellt: '', version: '', weitere: [], eigeneWahl }
  if (eigeneWahl) {
    const d = liste[0]
    if (!d) return { ...leer, fehler: 'Die gewählte Datei wurde nicht gefunden.' }
    if (d.produkt !== TOOL_PRODUKT) {
      return { ...leer, pfad: d.pfad, name: d.name, fehler: `„${d.name}" ist kein Setup vom IT Admin Tool (Produktname in den Dateieigenschaften: ${d.produkt ? `„${d.produkt}"` : 'keiner'}).` }
    }
    return { ok: true, pfad: d.pfad, name: d.name, bytes: d.bytes, groesseMB: Math.round(d.bytes / 1048576 * 10) / 10, erstellt: d.erstellt, version: d.version, weitere: [], eigeneWahl }
  }
  const passend = liste.filter(d => d.produkt === TOOL_PRODUKT)
    .sort((a, b) => (ms(b.erstellt) || 0) - (ms(a.erstellt) || 0))
  const best = passend[0]
  if (!best) {
    const fremd = liste.length ? ` (gefunden, aber kein IT-Admin-Tool-Setup laut Dateieigenschaften: ${liste.map(d => d.name).join(', ')})` : ''
    return { ...leer, fehler: `Kein Setup „IT Admin Tool Setup ….exe" unter ${ordner} gefunden${fremd}. Datei dort ablegen oder über „Andere Datei wählen" auswählen.` }
  }
  return {
    ok: true, pfad: best.pfad, name: best.name, bytes: best.bytes, groesseMB: Math.round(best.bytes / 1048576 * 10) / 10,
    erstellt: best.erstellt, version: best.version, weitere: passend.slice(1).map(d => d.name), eigeneWahl,
  }
}

/** Setup suchen: von Hand gewählte Datei, sonst das neueste „IT Admin Tool Setup*.exe" unter C:\. */
export async function findeToolSetup(datei = gewaehlteSetupDatei()): Promise<ToolSetup> {
  const eigene = !!datei.trim()
  const r = await api().runPowerShell(`$b64 = '${b64(JSON.stringify({ datei: datei.trim(), ordner: SETUP_ORDNER_STANDARD, muster: SETUP_MUSTER }))}'\n${SETUP_PS}`, 60000)
  const j = getagged<{ ok?: boolean; fehler?: string; liste?: unknown }>(r.stdout, '@@ITSETUP@@')
  const leer: ToolSetup = { ok: false, pfad: datei, name: '', bytes: 0, groesseMB: 0, erstellt: '', version: '', weitere: [], eigeneWahl: eigene }
  if (!j) return { ...leer, fehler: r.stderr?.trim() || 'Die Suche nach dem Setup lieferte keine Antwort.' }
  if (!j.ok) return { ...leer, fehler: j.fehler || 'Setup nicht gefunden.' }
  return waehleSetup(asArr<SetupRoh>(j.liste).filter(d => d && d.pfad), eigene, SETUP_ORDNER_STANDARD)
}

// ── 2) Schranken: nie auf Servern, nie auf dem eigenen PC ─────────────────────
let eigenerName: Promise<string> | null = null
export function eigenerRechner(): Promise<string> {
  if (!eigenerName) eigenerName = api().getHostname().then(h => (h || '').trim()).catch(() => '')
  return eigenerName
}

let serverCache: { bis: number; namen: Set<string> } | null = null
/** Hostnamen + IPs aller bekannten Server (Server-Monitor-Kacheln + Inventar „Server"). */
async function serverNamen(): Promise<Set<string>> {
  if (serverCache && serverCache.bis > Date.now()) return serverCache.namen
  const namen = new Set<string>()
  const add = (s?: string) => { const t = (s || '').trim().toUpperCase(); if (t) { namen.add(t); namen.add(t.split('.')[0]) } }
  try {
    const c = await api().netReadJsonAsync<{ tiles?: { hostname?: string; ip?: string }[] }>('server_monitor/config.json')
    for (const t of c?.tiles ?? []) { add(t.hostname); add(t.ip) }
  } catch { /* keine Konfiguration */ }
  try {
    const inv = await api().netReadJsonAsync<{ name?: string; ip?: string; category?: string }[]>('inventory/inventory.json')
    for (const i of Array.isArray(inv) ? inv : []) if ((i.category || '').toLowerCase() === 'server') { add(i.name); add(i.ip) }
  } catch { /* kein Inventar */ }
  serverCache = { bis: Date.now() + 5 * 60_000, namen }
  return namen
}

/** Grund, warum auf diesem Ziel NICHT installiert wird — oder '' (rein, testbar). */
export function sperrGrund(host: string, eigener: string, server: Set<string>): string {
  const h = (host || '').trim()
  if (!h) return 'Kein Ziel-PC angegeben.'
  if (!isValidRemoteTarget(h)) return `„${h}" ist kein gültiger PC-Name (DE…) und keine IP-Adresse.`
  const kurz = h.split('.')[0].toUpperCase()
  if (eigener && !isIpv4(h) && kurz === eigener.split('.')[0].toUpperCase()) {
    return 'Das ist dieser PC selbst — das Tool würde sich mitten in der Installation selbst beenden. Hier das Setup einfach direkt starten.'
  }
  if (server.has(h.toUpperCase()) || server.has(kurz)) return `${h} steht in der Server-Liste — auf Servern installiert diese Kachel nichts.`
  return ''
}

export async function zielSperre(host: string): Promise<string> {
  return sperrGrund(host, await eigenerRechner(), await serverNamen())
}

// ── Ist-Stand auf dem Ziel-PC (nur lesen) ────────────────────────────────────
const PS_ORT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
function Get-SkfToolOrt {
  foreach ($b in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
    foreach ($k in @(Get-ChildItem -LiteralPath $b)) {
      $p = Get-ItemProperty -LiteralPath $k.PSPath
      if ([string]$p.DisplayName -notlike 'IT Admin Tool*') { continue }
      $dir = [string]$p.InstallLocation
      if (-not $dir -and ([string]$p.UninstallString) -match '^\s*"([^"]+)"') { $dir = [System.IO.Path]::GetDirectoryName($Matches[1]) }
      if ($dir) { return [pscustomobject]@{ ordner = $dir; name = [string]$p.DisplayName; version = [string]$p.DisplayVersion } }
    }
  }
  $std = Join-Path $env:ProgramFiles 'IT Admin Tool'
  if (Test-Path -LiteralPath (Join-Path $std 'IT Admin Tool.exe')) { return [pscustomobject]@{ ordner = $std; name = 'IT Admin Tool'; version = '' } }
  return $null
}
function Get-SkfToolStand {
  $ort = Get-SkfToolOrt
  $exe = $false; $am = ''; $bytes = 0
  if ($ort) {
    $exe = Test-Path -LiteralPath (Join-Path $ort.ordner 'IT Admin Tool.exe')
    $a = Join-Path $ort.ordner 'resources\app.asar'
    if (Test-Path -LiteralPath $a) { $ai = Get-Item -LiteralPath $a; $am = $ai.LastWriteTime.ToUniversalTime().ToString('s') + 'Z'; $bytes = [int64]$ai.Length }
  }
  $proz = @(Get-Process -Name 'IT Admin Tool')
  $nutzer = @(Get-Process -Name 'IT Admin Tool' -IncludeUserName | ForEach-Object { [string]$_.UserName } | Where-Object { $_ } | Select-Object -Unique)
  $os = Get-CimInstance Win32_OperatingSystem
  $angemeldet = ''; try { $angemeldet = [string](Get-CimInstance Win32_ComputerSystem).UserName } catch { }
  [pscustomobject]@{
    ok = $true; rechner = [string]$env:COMPUTERNAME; produktTyp = [int]$os.ProductType; system = [string]$os.Caption
    installiert = [bool]$ort; ordner = $(if ($ort) { [string]$ort.ordner } else { '' }); version = $(if ($ort) { [string]$ort.version } else { '' })
    exe = [bool]$exe; standVom = $am; asarBytes = $bytes; prozesse = $proz.Count; nutzer = @($nutzer); angemeldet = $angemeldet
    jetzt = ((Get-Date).ToUniversalTime().ToString('s') + 'Z')
  }
}
`
const STAND_INNER = PS_ORT + String.raw`
'@@ITSTAND@@' + (Get-SkfToolStand | ConvertTo-Json -Depth 4 -Compress)
`

export interface ToolStand {
  ok: boolean
  fehler?: string
  /** true = Schranke (Server/eigener PC) — dann wurde gar nicht erst verbunden */
  gesperrt?: boolean
  rechner: string
  produktTyp: number
  system: string
  installiert: boolean
  ordner: string
  version: string
  exe: boolean
  /** Dateidatum der app.asar (ISO) = Build-Zeitpunkt der installierten Version, NICHT der Installation */
  standVom: string
  /** Größe der app.asar — zusammen mit standVom die „Unterschrift" des installierten Stands */
  asarBytes: number
  prozesse: number
  nutzer: string[]
  angemeldet: string
}
const LEER_STAND: ToolStand = { ok: false, rechner: '', produktTyp: 0, system: '', installiert: false, ordner: '', version: '', exe: false, standVom: '', asarBytes: 0, prozesse: 0, nutzer: [], angemeldet: '' }

function standAus(j: Record<string, unknown> | null): ToolStand | null {
  if (!j || j.ok !== true) return null
  return {
    ok: true, rechner: String(j.rechner || ''), produktTyp: Number(j.produktTyp) || 0, system: String(j.system || ''),
    installiert: !!j.installiert, ordner: String(j.ordner || ''), version: String(j.version || ''), exe: !!j.exe,
    standVom: String(j.standVom || ''), asarBytes: Number(j.asarBytes) || 0, prozesse: Number(j.prozesse) || 0,
    nutzer: asArr<string>(j.nutzer).map(String).filter(Boolean), angemeldet: String(j.angemeldet || ''),
  }
}

/** Zweite Schranke auf dem PC selbst: Server-Betriebssystem oder in Wahrheit dieser PC (per IP angesprochen). */
export function standSperre(s: ToolStand, eigener: string): string {
  if (s.produktTyp !== 1) return `${s.rechner || 'Der Rechner'} ist ein Server (${s.system || `ProductType ${s.produktTyp}`}) — auf Servern installiert diese Kachel nichts.`
  if (eigener && s.rechner && s.rechner.toUpperCase() === eigener.split('.')[0].toUpperCase()) {
    return 'Das ist dieser PC selbst — das Tool würde sich mitten in der Installation selbst beenden. Hier das Setup einfach direkt starten.'
  }
  return ''
}

async function leseStand(host: string): Promise<ToolStand> {
  const r = await api().runPowerShell(fernBefehl(host, STAND_INNER, '@@ITSTAND@@'), 90000)
  const j = getagged<Record<string, unknown> & { fehler?: string }>(r.stdout, '@@ITSTAND@@')
  const s = standAus(j)
  if (s) return s
  return { ...LEER_STAND, fehler: j?.fehler || r.stderr?.trim() || 'Keine Antwort vom Ziel-PC.' }
}

/** Read-only Ist-Stand. Prüft vorher die Schranken — auf einen Server wird nicht einmal verbunden. */
export async function pruefeToolStand(host: string): Promise<ToolStand> {
  const sperre = await zielSperre(host)
  if (sperre) return { ...LEER_STAND, fehler: sperre, gesperrt: true }
  const f = await verbinde(host)
  if (f) return { ...LEER_STAND, fehler: f }
  const s = await leseStand(host)
  if (!s.ok) return s
  const zweite = standSperre(s, await eigenerRechner())
  return zweite ? { ...s, ok: false, gesperrt: true, fehler: zweite } : s
}

// Build-Zeitfenster: die Programmdateien entstehen beim Bauen kurz VOR der Setup-Datei
// (gemessen: app.asar 14:18:38, Setup 14:19:50). Großzügig 30 Minuten davor, 2 Minuten danach.
const BUILD_VORLAUF_MS = 30 * 60_000
const BUILD_NACHLAUF_MS = 2 * 60_000
export type StandVergleich = 'aelter' | 'gleich' | 'neuer' | 'unbekannt' | 'fehlt'

/** Installierter Stand ↔ Setup (Build-Datum der Programmdateien gegen Dateidatum des Setups). */
export function standVergleich(s: ToolStand, setupErstellt?: string): StandVergleich {
  if (!s.installiert || !s.exe) return 'fehlt'
  const a = ms(s.standVom), b = ms(setupErstellt)
  if (isNaN(a) || isNaN(b)) return 'unbekannt'
  if (a < b - BUILD_VORLAUF_MS) return 'aelter'
  if (a <= b + BUILD_NACHLAUF_MS) return 'gleich'
  return 'neuer'
}

export type InstallBefund = 'neu' | 'gleich' | 'unveraendert' | 'fehlt'
/**
 * Was hat die Installation bewirkt? (rein, testbar)
 *   neu          — Programmdateien anders als vorher (oder vorher nicht installiert)
 *   gleich       — unverändert, aber schon genau der Stand dieses Setups (drübergespielt)
 *   unveraendert — unverändert und passt nicht erkennbar zum Setup
 *   fehlt        — IT Admin Tool.exe / app.asar fehlen danach
 */
export function bewerteInstallation(vor: ToolStand, nach: ToolStand, setupErstellt?: string): InstallBefund {
  if (!nach.installiert || !nach.exe || !nach.standVom) return 'fehlt'
  if (!vor.installiert || !vor.exe || !vor.standVom) return 'neu'
  if (nach.standVom !== vor.standVom || nach.asarBytes !== vor.asarBytes) return 'neu'
  return standVergleich(nach, setupErstellt) === 'gleich' ? 'gleich' : 'unveraendert'
}

// ── Desktop-Nachrichten ──────────────────────────────────────────────────────
// Text als Base64 → keine Quoting-Probleme mit Umlauten/Anführungszeichen. msg * erreicht
// jede angemeldete Sitzung (auch per RDP). Kein msg.exe / niemand angemeldet = kein Abbruch.
const MELDUNG_INNER = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$m = Join-Path $env:SystemRoot 'System32\msg.exe'
if (-not (Test-Path -LiteralPath $m)) { '@@ITMSG@@' + (@{ ok = $false; code = -1; aus = 'msg.exe fehlt auf dem PC' } | ConvertTo-Json -Compress); return }
$aus = & $m '*' ('/TIME:' + [int]$o.sekunden) ([string]$o.text) 2>&1
$code = $LASTEXITCODE
'@@ITMSG@@' + (@{ ok = ($code -eq 0); code = $code; aus = ((@($aus) | ForEach-Object { "$_" }) -join ' ') } | ConvertTo-Json -Compress)
`

export function ankuendigungsText(vorwarnSekunden: number, laeuft: boolean): string {
  const wann = vorwarnSekunden <= 0 ? 'jetzt' : vorwarnSekunden < 60 ? `in ${vorwarnSekunden} Sekunden` : vorwarnSekunden === 60 ? 'in 1 Minute' : `in ${Math.round(vorwarnSekunden / 60)} Minuten`
  return laeuft
    ? `Achtung: Eine neue Version vom IT Admin Tool wird installiert. Das IT Admin Tool wird dafür ${wann} automatisch beendet. Bitte erst wieder öffnen, wenn die Meldung kommt, dass die Installation durch ist.`
    : 'Achtung: Eine neue Version vom IT Admin Tool wird installiert. Bitte das IT Admin Tool erst öffnen, wenn die Meldung kommt, dass die Installation durch ist.'
}
export const FERTIG_TEXT = 'Die Installation der neuen Version vom IT Admin Tool ist durch. Das IT Admin Tool kann jetzt wieder geöffnet werden.'
export const FEHLER_TEXT_ALT_DA = 'Die Installation der neuen Version vom IT Admin Tool hat leider nicht geklappt. Das IT Admin Tool kann wie bisher weiter benutzt werden.'
export const FEHLER_TEXT_WEG = 'Die Installation vom IT Admin Tool hat leider nicht geklappt — das Tool ist gerade nicht nutzbar. Die IT kümmert sich darum.'

async function desktopNachricht(host: string, text: string, sekunden: number): Promise<{ ok: boolean; info: string }> {
  try {
    const r = await api().runPowerShell(fernBefehl(host, MELDUNG_INNER, '@@ITMSG@@', b64(JSON.stringify({ text, sekunden }))), 45000)
    const j = getagged<{ ok?: boolean; code?: number; aus?: string; fehler?: string }>(r.stdout, '@@ITMSG@@')
    if (!j) return { ok: false, info: r.stderr?.trim() || 'keine Antwort' }
    if (j.ok) return { ok: true, info: '' }
    return { ok: false, info: (j.aus || j.fehler || `msg-Code ${j.code ?? '?'}`).trim() }
  } catch (e) { return { ok: false, info: e instanceof Error ? e.message : String(e) } }
}

// ── Installation ─────────────────────────────────────────────────────────────
export type SchrittStatus = 'offen' | 'laeuft' | 'ok' | 'fehler' | 'warnung'
export interface ToolSchritt { id: string; label: string; status: SchrittStatus; info?: string }
export interface ToolOptionen {
  /** Wartezeit zwischen Nachricht und Beenden (nur wenn das Tool gerade läuft) */
  vorwarnSekunden: number
}
export interface ToolErgebnis { ok: boolean; text: string; warnung?: boolean }

export function toolSchritte(): { id: string; label: string }[] {
  return [
    { id: 'setup', label: 'Setup auf diesem PC prüfen' },
    { id: 'ziel', label: 'Ziel-PC prüfen (kein Server, erreichbar, Ist-Stand)' },
    { id: 'kopie', label: 'Setup auf den Ziel-PC kopieren' },
    { id: 'ankuendigen', label: 'Desktop-Nachricht: „Achtung, neue Version vom IT Admin Tool wird installiert"' },
    { id: 'beenden', label: 'IT Admin Tool auf dem PC beenden' },
    { id: 'install', label: 'Neue Version still installieren' },
    { id: 'pruefen', label: 'Installation prüfen' },
    { id: 'fertig', label: 'Desktop-Nachricht: „Installation ist durch"' },
    { id: 'aufraeumen', label: 'Setup vom PC löschen' },
  ]
}

const BEENDEN_INNER = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$n = 'IT Admin Tool'
$vorher = @(Get-Process -Name $n).Count
if ($vorher) {
  Get-Process -Name $n | Stop-Process -Force
  for ($i = 0; $i -lt 15 -and @(Get-Process -Name $n).Count; $i++) { Start-Sleep -Seconds 1 }
  if (@(Get-Process -Name $n).Count) {
    $tk = Join-Path $env:SystemRoot 'System32\taskkill.exe'
    & $tk /F /T /IM 'IT Admin Tool.exe' 2>&1 | Out-Null
    for ($i = 0; $i -lt 10 -and @(Get-Process -Name $n).Count; $i++) { Start-Sleep -Seconds 1 }
  }
}
'@@ITKILL@@' + (@{ ok = $true; vorher = $vorher; rest = @(Get-Process -Name $n).Count } | ConvertTo-Json -Compress)
`

const INSTALL_INNER = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
try {
  if (-not (Test-Path -LiteralPath $o.exe -PathType Leaf)) { throw ('Setup nicht gefunden: ' + $o.exe) }
  $f = Get-Item -LiteralPath $o.exe
  if ([string]$f.VersionInfo.ProductName -ne 'IT Admin Tool') { throw ('Die kopierte Datei ist kein Setup vom IT Admin Tool (Produktname: ' + [string]$f.VersionInfo.ProductName + ').') }
  if ([int64]$f.Length -ne [int64]$o.bytes) { throw ('Die Kopie ist unvollständig (' + $f.Length + ' statt ' + $o.bytes + ' Bytes).') }
  $start = Get-Date
  $pr = Start-Process -FilePath $o.exe -ArgumentList '/S' -PassThru -WindowStyle Hidden
  $null = $pr.Handle
  $fertig = $pr.WaitForExit([int]$o.minuten * 60000)
  $code = -1
  if ($fertig) { $code = $pr.ExitCode } else { Stop-Process -Id $pr.Id -Force -EA SilentlyContinue }
  '@@ITINST@@' + (@{ ok = $true; fertig = [bool]$fertig; code = $code; start = ($start.ToUniversalTime().ToString('s') + 'Z') } | ConvertTo-Json -Compress)
} catch { '@@ITINST@@' + (@{ ok = $false; fehler = ('' + $_.Exception.Message) } | ConvertTo-Json -Compress) }
`

type Melder = (id: string, status: SchrittStatus, info?: string) => void
const sleep = (n: number) => new Promise(r => setTimeout(r, n))

/** NSIS-Exitcodes: 0 ok, 1 abgebrochen, 2 vom Skript abgebrochen. */
export function deuteCode(code: number): string {
  if (code === 0) return 'Setup erfolgreich beendet'
  if (code === 1) return 'Setup abgebrochen (Exitcode 1)'
  if (code === 2) return 'Setup vom Installer abgebrochen (Exitcode 2)'
  return `Setup endete mit Exitcode ${code}`
}

/** Kurztext zum installierten Stand für Schritt-Infos. */
function standText(s: ToolStand, setupErstellt?: string): string {
  if (!s.installiert || !s.exe) return 'IT Admin Tool noch nicht installiert'
  const v = standVergleich(s, setupErstellt)
  return `installierter Stand vom ${zeitText(s.standVom) || '?'}${v === 'aelter' ? ' (älter als dieses Setup)' : v === 'gleich' ? ' (schon der Stand dieses Setups)' : v === 'neuer' ? ' (neuer als dieses Setup!)' : ''}`
}

/** IT Admin Tool auf dem Ziel-PC ankündigen, beenden, still neu installieren, prüfen, melden. */
export async function installiereTool(host: string, setup: ToolSetup, opt: ToolOptionen, melde: Melder): Promise<ToolErgebnis> {
  // 1) Setup — genau die Datei, die in der Kachel angezeigt wurde, frisch nachsehen
  //    (könnte inzwischen ersetzt oder gelöscht sein; Produktname muss weiter passen)
  melde('setup', 'laeuft')
  const s = await findeToolSetup(setup.pfad)
  if (!s.ok) { melde('setup', 'fehler', s.fehler); return { ok: false, text: s.fehler || 'Setup nicht gefunden.' } }
  melde('setup', 'ok', `${s.name} · ${s.groesseMB} MB · erstellt ${zeitText(s.erstellt)}`)

  // 2) Ziel-PC
  melde('ziel', 'laeuft')
  const vor = await pruefeToolStand(host)
  if (!vor.ok) { melde('ziel', 'fehler', vor.fehler); return { ok: false, text: vor.fehler || 'Ziel-PC nicht prüfbar.' } }
  melde('ziel', 'ok', [
    `${vor.rechner || host} erreichbar`,
    standText(vor, s.erstellt),
    vor.prozesse ? `läuft gerade${vor.nutzer.length ? ` (${vor.nutzer.join(', ')})` : ''}` : 'läuft nicht',
    `angemeldet: ${vor.angemeldet || 'niemand'}`,
  ].join(' · '))

  // 3) Kopieren (Admin-PC als Mittelsmann)
  const zielUnc = `\\\\${host}\\C$\\Windows\\Temp\\itadmintool_selbst`
  melde('kopie', 'laeuft', `${s.groesseMB} MB werden übertragen — je nach Netz ein bis einige Minuten.`)
  const kopie = await api().runPowerShell([
    ROBOCOPY_PS,
    `if (-not (Test-Path -LiteralPath '\\\\${esc(host)}\\C$\\Windows\\Temp')) { 'ERR:Kein Zugriff auf die Admin-Freigabe \\\\${esc(host)}\\C$ — ohne sie lässt sich das Setup nicht übertragen.'; return }`,
    // alte Setups früherer Läufe weg, damit nie eine falsche Datei liegen bleibt
    `if (Test-Path -LiteralPath '${esc(zielUnc)}') { Get-ChildItem -LiteralPath '${esc(zielUnc)}' -File -Filter '*.exe' -EA SilentlyContinue | Where-Object { $_.Name -ne '${esc(s.name)}' } | Remove-Item -Force -EA SilentlyContinue }`,
    `$code = Copy-SkfFile '${esc(s.pfad)}' '${esc(zielUnc)}'`,
    `$ziel = Join-Path '${esc(zielUnc)}' '${esc(s.name)}'`,
    `if ((Test-Path -LiteralPath $ziel) -and (Get-Item -LiteralPath $ziel).Length -eq ${s.bytes}) { 'OK:' + [math]::Round(${s.bytes}/1MB,1) }`,
    `else { 'ERR:Kopie unvollständig (robocopy-Code ' + $code + ')' }`,
  ].join('\n'), 45 * 60 * 1000)
  const kz = (kopie.stdout || '').split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith('OK:') || l.startsWith('ERR:'))
  if (!kz || kz.startsWith('ERR:')) {
    const t = kz ? kz.slice(4) : (kopie.timedOut ? 'Zeitüberschreitung beim Kopieren (45 Minuten).' : (kopie.stderr?.trim() || 'Die Kopie auf den Ziel-PC ist fehlgeschlagen.'))
    melde('kopie', 'fehler', t); await aufraeumen(host); return { ok: false, text: `${t} Auf dem PC wurde nichts geändert.` }
  }
  melde('kopie', 'ok', `${kz.slice(3)} MB nach ${ZIEL_ORDNER}`)

  // 4) Ankündigen
  melde('ankuendigen', 'laeuft')
  const laeuft = vor.prozesse > 0
  const n1 = await desktopNachricht(host, ankuendigungsText(opt.vorwarnSekunden, laeuft), 900)
  const jemand = !!vor.angemeldet || vor.nutzer.length > 0
  const nInfo = n1.ok ? 'angezeigt' : jemand ? `konnte nicht angezeigt werden (${n1.info}) — es geht trotzdem weiter` : 'niemand angemeldet — keine Nachricht nötig'
  if (laeuft && opt.vorwarnSekunden > 0) {
    for (let rest = opt.vorwarnSekunden; rest > 0; rest -= 5) {
      melde('ankuendigen', 'laeuft', `${nInfo} · Tool wird in ${rest} s beendet`)
      await sleep(Math.min(5, rest) * 1000)
    }
  }
  melde('ankuendigen', n1.ok || !jemand ? 'ok' : 'warnung', laeuft && opt.vorwarnSekunden > 0 ? `${nInfo} · ${opt.vorwarnSekunden} s Vorwarnzeit abgewartet` : nInfo)

  // Ab hier weiß der Anwender Bescheid → auch im Fehlerfall eine Abschlussnachricht schicken.
  const scheitern = async (id: string, t: string, altDa: boolean): Promise<ToolErgebnis> => {
    melde(id, 'fehler', t)
    const n = await desktopNachricht(host, altDa ? FEHLER_TEXT_ALT_DA : FEHLER_TEXT_WEG, 1800)
    melde('fertig', n.ok || !jemand ? 'warnung' : 'fehler', `${n.ok ? 'Hinweis angezeigt' : 'Hinweis nicht angezeigt'}: „${altDa ? FEHLER_TEXT_ALT_DA : FEHLER_TEXT_WEG}"`)
    const sauber = await aufraeumen(host)
    melde('aufraeumen', sauber ? 'ok' : 'warnung', sauber ? 'Setup vom PC entfernt.' : `Das Setup unter ${ZIEL_ORDNER} konnte nicht entfernt werden.`)
    return { ok: false, text: t }
  }

  // 5) Beenden
  melde('beenden', 'laeuft')
  const br = await api().runPowerShell(fernBefehl(host, BEENDEN_INNER, '@@ITKILL@@'), 90000)
  const bj = getagged<{ ok?: boolean; vorher?: number; rest?: number; fehler?: string }>(br.stdout, '@@ITKILL@@')
  if (!bj || bj.ok === false) return scheitern('beenden', `Beenden fehlgeschlagen: ${bj?.fehler || br.stderr?.trim() || 'keine Antwort vom Ziel-PC'} — Installation nicht gestartet.`, true)
  if ((bj.rest ?? 0) > 0) return scheitern('beenden', `Das IT Admin Tool ließ sich nicht beenden (${bj.rest} Prozess(e) laufen noch) — Installation nicht gestartet.`, true)
  melde('beenden', 'ok', bj.vorher ? `${bj.vorher} Prozess(e) beendet` : 'lief nicht — nichts zu beenden')

  // 6) Still installieren
  melde('install', 'laeuft', `Läuft unbemerkt im Hintergrund — meist 1–3 Minuten, Abbruch spätestens nach ${INSTALL_MINUTEN} Minuten.`)
  const ir = await api().runPowerShell(fernBefehl(host, INSTALL_INNER, '@@ITINST@@',
    b64(JSON.stringify({ exe: `${ZIEL_ORDNER}\\${s.name}`, bytes: s.bytes, minuten: INSTALL_MINUTEN }))),
    (INSTALL_MINUTEN + 5) * 60 * 1000)
  const ij = getagged<{ ok?: boolean; fertig?: boolean; code?: number; start?: string; fehler?: string }>(ir.stdout, '@@ITINST@@')

  // 7) Gegenprobe — auch wenn das Setup einen Fehler meldete, zählt, was wirklich auf der Platte liegt
  melde('pruefen', 'laeuft')
  const nach = await leseStand(host)
  const altDa = nach.ok ? nach.exe : vor.exe
  // Zustand nach einem unklaren Setup-Ende ehrlich beschreiben (ohne Erfolg zu behaupten)
  const zustand = () => !nach.ok ? (nach.fehler || 'nicht prüfbar')
    : !nach.exe ? 'Programmdatei fehlt'
      : bewerteInstallation(vor, nach, s.erstellt) === 'neu' ? `Programmdateien geändert (Stand vom ${zeitText(nach.standVom)}) — ob das Setup vollständig durchlief, ist unklar`
        : `Programmdatei vorhanden, Stand unverändert vom ${zeitText(nach.standVom) || '?'}`
  if (!ij || ij.ok === false) {
    melde('pruefen', nach.ok ? 'warnung' : 'fehler', zustand())
    return scheitern('install', ij?.fehler || (ir.timedOut ? `Keine Rückmeldung vom Ziel-PC innerhalb von ${INSTALL_MINUTEN + 5} Minuten.` : (ir.stderr?.trim() || 'Keine Rückmeldung vom Ziel-PC.')), altDa)
  }
  if (!ij.fertig) {
    melde('pruefen', 'warnung', zustand())
    return scheitern('install', `Das Setup hat sich nach ${INSTALL_MINUTEN} Minuten nicht beendet und wurde abgebrochen.`, altDa)
  }
  const codeText = deuteCode(ij.code ?? -1)
  if (!nach.ok) {
    melde('install', ij.code === 0 ? 'ok' : 'warnung', codeText)
    return scheitern('pruefen', `${codeText}, die Nachprüfung war aber nicht möglich: ${nach.fehler || 'keine Antwort'}.`, true)
  }
  // Die Dateien tragen das BUILD-Datum (nicht die Installationszeit) → vorher/nachher vergleichen
  const befund = bewerteInstallation(vor, nach, s.erstellt)
  const codeOk = ij.code === 0
  if (befund === 'fehlt') {
    melde('install', codeOk ? 'warnung' : 'fehler', codeText)
    return scheitern('pruefen', `${codeText}, danach fehlen aber die Programmdateien (IT Admin Tool.exe / app.asar).`, false)
  }
  if (befund === 'unveraendert' && !codeOk) {
    melde('install', 'fehler', codeText)
    return scheitern('pruefen', `${codeText} — die Programmdateien sind unverändert (Stand weiter vom ${zeitText(nach.standVom) || '?'}).`, true)
  }
  const vonBis = `Stand vom ${zeitText(vor.standVom) || '–'} → ${zeitText(nach.standVom)}`
  let pruefText = ''
  let pruefWarn = false
  if (befund === 'neu') pruefText = `Programmdateien erneuert: ${vor.installiert && vor.exe ? vonBis : `neu installiert, Stand vom ${zeitText(nach.standVom)}`}${standVergleich(nach, s.erstellt) === 'gleich' ? ' — passt zum Setup' : ''} · ${nach.ordner}`
  else if (befund === 'gleich') pruefText = `Es war schon genau der Stand dieses Setups (vom ${zeitText(nach.standVom)}) — neu drübergespielt · ${nach.ordner}`
  else { pruefWarn = true; pruefText = `Setup meldet Erfolg, die Programmdateien sind aber unverändert (Stand vom ${zeitText(nach.standVom)}) und passen nicht erkennbar zum Setup (erstellt ${zeitText(s.erstellt)}) — vermutlich war dieser Stand schon installiert.` }
  melde('install', codeOk ? 'ok' : 'warnung', codeOk ? codeText : `${codeText} — die Programmdateien stimmen trotzdem`)
  melde('pruefen', pruefWarn ? 'warnung' : 'ok', pruefText)

  // 8) Fertig-Nachricht
  melde('fertig', 'laeuft')
  const n2 = await desktopNachricht(host, FERTIG_TEXT, 1800)
  melde('fertig', n2.ok || !jemand ? 'ok' : 'warnung', n2.ok ? 'angezeigt' : jemand ? `konnte nicht angezeigt werden (${n2.info})` : 'niemand angemeldet — keine Nachricht nötig')

  // 9) Aufräumen
  melde('aufraeumen', 'laeuft')
  const sauber = await aufraeumen(host)
  melde('aufraeumen', sauber ? 'ok' : 'warnung', sauber ? 'Setup vom PC entfernt.' : `Das Setup unter ${ZIEL_ORDNER} konnte nicht entfernt werden.`)

  const warn = !codeOk || pruefWarn || !sauber || (!n1.ok && jemand) || (!n2.ok && jemand)
  const was = befund === 'neu'
    ? (vor.installiert && vor.exe ? `neu installiert (${vonBis})` : `neu installiert (Stand vom ${zeitText(nach.standVom)})`)
    : befund === 'gleich' ? `neu drübergespielt — es war schon der Stand dieses Setups (vom ${zeitText(nach.standVom)})`
      : `Setup gelaufen, Programmdateien unverändert (Stand vom ${zeitText(nach.standVom)})`
  return {
    ok: true, warnung: warn,
    text: `IT Admin Tool auf ${host} ${was}.${bj.vorher ? ' Das laufende Tool wurde vorher beendet.' : ''}`,
  }
}

/** Setup vom Ziel-PC löschen. */
async function aufraeumen(host: string): Promise<boolean> {
  const ordner = `\\\\${host}\\C$\\Windows\\Temp\\itadmintool_selbst`
  try {
    const r = await api().runPowerShell([
      `if (-not (Test-Path -LiteralPath '${esc(ordner)}')) { 'OK'; return }`,
      `Get-ChildItem -LiteralPath '${esc(ordner)}' -File -Filter '*.exe' -EA SilentlyContinue | Remove-Item -Force -EA SilentlyContinue`,
      `if (@(Get-ChildItem -LiteralPath '${esc(ordner)}' -File -Filter '*.exe' -EA SilentlyContinue).Count) { 'REST' } else { 'OK' }`,
    ].join('\n'), 60000)
    return (r.stdout || '').includes('OK')
  } catch { return false }
}

/** Die Skripte — exportiert, damit sie sich ohne Ziel-PC prüfen lassen. */
export const TOOL_SKRIPTE = { SETUP_PS, PS_ORT, STAND_INNER, MELDUNG_INNER, BEENDEN_INNER, INSTALL_INNER }
