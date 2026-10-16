// ── Jabra Direct: Erkennung + stille Ferninstallation ───────────────────────
// Gehört zur Kachel „Jabra Software" (Software Installationen) und zum 4. Schritt
// in Daylis → „Sound Fix". Beide nutzen dieselbe Oberfläche (JabraPanel.tsx).
//
// Installationsweg (wie SolidWorks/EuroPAR): der ADMIN-PC ist Datei-Mittelsmann.
// Eine WinRM-Sitzung auf dem Ziel-PC kommt NICHT an \\W3172\… heran (Doppelhop —
// die Sitzung hat keine Netz-Anmeldeinformationen). Deshalb kopiert der Admin-PC den
// Installer über die Admin-Freigabe nach C:\Windows\Temp des Ziels und startet ihn
// dort lokal.
//
// Der Installer ist ein WiX-Burn-Bootstrapper (aus der Datei gelesen: „WixBundle",
// „Burn"; vorhandene Schalter /quiet /passive /norestart /log /uninstall /repair).
// Mit /quiet erscheint beim angemeldeten Benutzer KEIN Fenster — die Installation
// läuft unbemerkt. Dass Invoke-Command in Session 0 startet, ist hier also erwünscht
// (umgekehrt zu „Zscaler öffnen", siehe zscalerStart.ts).

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import { ROBOCOPY_PS } from '../utils/robocopy'

// ── Quelle des Installers ────────────────────────────────────────────────────

/**
 * Standard-Netzwerkordner mit dem Setup (I: = \\W3172\SKF Marine, danach der Pfad aus
 * dem Explorer: Public\Public\Davide\SOFTWARE\Jabra).
 */
export const JABRA_NETZ_ORDNER_STANDARD = '\\\\W3172\\SKF Marine\\Public\\Public\\Davide\\SOFTWARE\\Jabra'

// Der Ordner liegt zusätzlich zentral auf dem Netzlaufwerk, damit er sich ohne neues
// Programm-Paket korrigieren lässt (gleiches Vorgehen wie beim Xelion-Installer).
const QUELLE_STORE = 'config/software/jabra/quelle.json'

let quelleCache: string | null = null

/** Aktuell eingestellter Quellordner (zentral gespeichert, sonst der Standard). */
export async function ladeJabraQuellordner(): Promise<string> {
  if (quelleCache) return quelleCache
  try {
    const d = await api().netReadJson<{ ordner?: string }>(QUELLE_STORE)
    if (d && typeof d.ordner === 'string' && d.ordner.trim()) { quelleCache = d.ordner.trim(); return quelleCache }
  } catch { /* Standard verwenden */ }
  quelleCache = JABRA_NETZ_ORDNER_STANDARD
  return quelleCache
}

/** Quellordner zentral setzen (leer = zurück auf den Standard). */
export async function setzeJabraQuellordner(ordner: string): Promise<boolean> {
  const wert = ordner.trim()
  quelleCache = wert || JABRA_NETZ_ORDNER_STANDARD
  try { return await api().netWriteJson(QUELLE_STORE, { ordner: wert }) } catch { return false }
}

/** Dateimuster — deckt auch künftige Versionen und „ (1)"-Dubletten ab. */
const SETUP_MUSTER = 'JabraDirect*.exe'

/** Zielordner auf dem Ziel-PC (unterhalb von C:\Windows\Temp, wird aufgeräumt). */
const ZIEL_ORDNER = 'C:\\Windows\\Temp\\itadmintool_jabra'

const LOG_DATEI = ZIEL_ORDNER + '\\jabra_install.log'

function escPs(s: string): string { return s.replace(/'/g, "''") }

async function ps(script: string, timeoutMs: number) {
  return api().runPowerShell(script, timeoutMs)
}

/** JSON aus einer PowerShell-Ausgabe lösen. */
function parseJson<T>(stdout: string): T | null {
  const s = (stdout || '').trim()
  if (!s) return null
  const kandidaten = [s.indexOf('{'), s.indexOf('[')].filter(x => x >= 0)
  const i = kandidaten.length ? Math.min(...kandidaten) : -1
  const j = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
  try { return JSON.parse(i >= 0 && j > i ? s.slice(i, j + 1) : s) as T } catch { return null }
}

export interface JabraQuelle {
  ok: boolean
  pfad: string        // vollständiger Pfad zum Setup
  name: string
  groesseMB: number
  version: string
  fehler?: string
}

/**
 * Das Setup suchen (auf dem Admin-PC ausgeführt). Genommen wird die NEUESTE passende
 * Datei im Ordner — so wirkt ein dort abgelegtes neueres Setup ohne Code-Änderung.
 */
export async function findeJabraSetup(): Promise<JabraQuelle> {
  const ordner = await ladeJabraQuellordner()
  const ordnerListe = [ordner].map(o => `'${escPs(o)}'`).join(',')
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$gefunden = $null`,
    `foreach ($o in @(${ordnerListe})) {`,
    `  if (-not (Test-Path -LiteralPath $o)) { continue }`,
    `  $d = @(Get-ChildItem -LiteralPath $o -Filter '${SETUP_MUSTER}' -File | Sort-Object LastWriteTime -Descending) | Select-Object -First 1`,
    `  if ($d) { $gefunden = $d; break }`,
    `}`,
    `if (-not $gefunden) { @{ ok=$false; fehler='Kein Setup gefunden. Erwartet wird eine Datei ${SETUP_MUSTER} in: ' + (@(${ordnerListe}) -join ' | ') } | ConvertTo-Json -Compress; return }`,
    `$v = ''`,
    `try { $v = [string]$gefunden.VersionInfo.ProductVersion } catch { }`,
    `@{ ok=$true; pfad=$gefunden.FullName; name=$gefunden.Name; groesseMB=[math]::Round($gefunden.Length/1MB,1); version=$v } | ConvertTo-Json -Compress`,
  ].join('\n')
  const r = await ps(script, 60000)
  const j = parseJson<{ ok: boolean; pfad?: string; name?: string; groesseMB?: number; version?: string; fehler?: string }>(r.stdout)
  if (!j) return { ok: false, pfad: '', name: '', groesseMB: 0, version: '', fehler: r.stderr?.trim() || 'Der Netzwerkordner konnte nicht gelesen werden.' }
  if (!j.ok) return { ok: false, pfad: '', name: '', groesseMB: 0, version: '', fehler: j.fehler || 'Kein Setup gefunden.' }
  return { ok: true, pfad: j.pfad || '', name: j.name || '', groesseMB: j.groesseMB || 0, version: j.version || '' }
}

// ── Erkennung angeschlossener Jabra-Geräte ───────────────────────────────────

export interface JabraGeraet {
  name: string
  klassen: string     // z. B. „USB, AudioEndpoint"
  quellen: string     // „Geraete-Manager, Wiedergabe"
  status: string
}

export interface JabraErkennung {
  ok: boolean
  geraete: JabraGeraet[]
  installiert: boolean
  version: string
  fehler?: string
}

// Jabra gehört zu GN Netcom — USB-Herstellerkennung 0B0E. Über den Namen allein
// würde ein Gerät fehlen, das sich generisch meldet; über die VID allein eines, das
// per Bluetooth statt USB hängt. Deshalb beides.
const JABRA_VID = 'VID_0B0E'

// Reine Software-Knoten (von Jabra Direct selbst angelegt) beweisen KEIN
// angeschlossenes Gerät und zählen deshalb nicht als Treffer.
const SOFTWARE_KLASSEN = `@('SoftwareComponent','AudioProcessingObject','SoftwareDevice')`

function erkennungsSkript(): string {
  return [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$treffer = @()`,
    // 1) Geräte-Manager: Dongle (Jabra Link), Headset, HID und Audio-Endpunkte
    `foreach ($d in @(Get-PnpDevice -PresentOnly)) {`,
    `  if (${SOFTWARE_KLASSEN} -contains [string]$d.Class) { continue }`,
    `  $n = [string]$d.FriendlyName; $id = [string]$d.InstanceId`,
    `  if (($n -and $n -like '*Jabra*') -or ($id -and $id -like '*${JABRA_VID}*')) {`,
    `    $treffer += [pscustomobject]@{ Quelle='Geraete-Manager'; Name=$n; Klasse=[string]$d.Class; Status=[string]$d.Status }`,
    `  }`,
    `}`,
    // 2) Audio-Endpunkte aus der Registry — genau die Namen, die der Sound-Dialog zeigt
    `foreach ($art in @(@{P='Render';T='Wiedergabe'}, @{P='Capture';T='Aufnahme'})) {`,
    `  $basis = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\MMDevices\\Audio\\' + $art.P`,
    `  foreach ($k in @(Get-ChildItem $basis)) {`,
    `    $roh = (Get-ItemProperty $k.PSPath -Name DeviceState).DeviceState`,
    `    if ($null -eq $roh) { continue }`,
    // DeviceState ist ein Bitfeld — nur die unteren 4 Bit sind der Zustand (1 = aktiv).
    `    if (([int]$roh -band 0xF) -ne 1) { continue }`,
    `    $p = Get-ItemProperty (Join-Path $k.PSPath 'Properties')`,
    `    $geraet = [string]$p.'{a45c254e-df1c-4efd-8020-67d146a850e0},2'`,
    `    $treiber = [string]$p.'{b3f8fa53-0004-438e-9003-51a46e139bfc},6'`,
    `    if (-not $geraet) { continue }`,
    `    $name = if ($treiber) { "$geraet ($treiber)" } else { $geraet }`,
    `    if ($name -like '*Jabra*') { $treffer += [pscustomobject]@{ Quelle=$art.T; Name=$name; Klasse='AudioEndpoint'; Status='OK' } }`,
    `  }`,
    `}`,
    // Ein Headset erscheint mehrfach (USB + HID + Audio + Endpunkt) — zusammenfassen.
    `$geraete = @($treffer | Group-Object Name | ForEach-Object {`,
    `  [pscustomobject]@{`,
    `    Name = $_.Name`,
    `    Klassen = (($_.Group | ForEach-Object { $_.Klasse } | Select-Object -Unique) -join ', ')`,
    `    Quellen = (($_.Group | ForEach-Object { $_.Quelle } | Select-Object -Unique) -join ', ')`,
    `    Status  = (($_.Group | ForEach-Object { $_.Status } | Select-Object -Unique) -join ', ')`,
    `  }`,
    `} | Sort-Object Name)`,
    // 3) Ist Jabra Direct schon installiert?
    `$prog = @(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' | Where-Object { $_.DisplayName -like 'Jabra Direct*' })`,
    `$v = if ($prog.Count) { [string]$prog[0].DisplayVersion } else { '' }`,
    `@{ geraete=$geraete; installiert=($prog.Count -gt 0); version=$v } | ConvertTo-Json -Depth 4 -Compress`,
  ].join('\n')
}

/** Prüft auf dem Ziel-PC, ob ein Jabra-Gerät angeschlossen und ob Jabra Direct installiert ist. */
export async function erkenneJabra(host: string): Promise<JabraErkennung> {
  const leer: JabraErkennung = { ok: false, geraete: [], installiert: false, version: '' }
  try {
    const rm = await ensureWinRM(host)
    if (!rm) return { ...leer, fehler: `WinRM konnte auf ${host} nicht aktiviert werden — Gerät nicht erreichbar oder Berechtigungen fehlen.` }
  } catch (e) {
    return { ...leer, fehler: `WinRM-Aktivierung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` }
  }
  const script = `try { Invoke-Command -ComputerName '${escPs(host)}' -ScriptBlock { ${erkennungsSkript()} } -EA Stop } catch { Write-Output ('FEHLER:' + $_.Exception.Message) }`
  const r = await ps(script, 120000)
  const out = (r.stdout || '').trim()
  if (out.startsWith('FEHLER:')) return { ...leer, fehler: out.slice(7) }
  const j = parseJson<{ geraete?: unknown; installiert?: boolean; version?: string }>(out)
  if (!j) return { ...leer, fehler: r.stderr?.trim() || 'Keine Antwort vom Ziel-PC.' }
  const roh = Array.isArray(j.geraete) ? j.geraete : j.geraete ? [j.geraete] : []
  const geraete: JabraGeraet[] = (roh as Record<string, unknown>[]).map(x => ({
    name: String(x.Name ?? ''),
    klassen: String(x.Klassen ?? ''),
    quellen: String(x.Quellen ?? ''),
    status: String(x.Status ?? ''),
  })).filter(g => g.name)
  return { ok: true, geraete, installiert: Boolean(j.installiert), version: String(j.version ?? '') }
}

// ── Installation ─────────────────────────────────────────────────────────────

export type SchrittStatus = 'offen' | 'laeuft' | 'ok' | 'fehler' | 'warnung'

export interface JabraSchritt { id: string; label: string; status: SchrittStatus; info?: string }

export const JABRA_SCHRITTE: { id: string; label: string }[] = [
  { id: 'quelle', label: 'Setup im Netzwerk suchen' },
  { id: 'ziel', label: 'Ziel-PC erreichbar prüfen' },
  { id: 'kopie', label: 'Setup auf den Ziel-PC kopieren' },
  { id: 'install', label: 'Jabra Direct still installieren' },
  { id: 'pruefen', label: 'Installation prüfen' },
  { id: 'aufraeumen', label: 'Aufräumen' },
]

export interface JabraErgebnis {
  ok: boolean
  text: string
  version?: string
  neustartNoetig?: boolean
}

/** Burn-Exitcodes in Klartext. */
function deuteExitCode(code: number): { ok: boolean; neustart: boolean; text: string } {
  if (code === 0) return { ok: true, neustart: false, text: 'Installation erfolgreich abgeschlossen.' }
  if (code === 3010 || code === 1641) return { ok: true, neustart: true, text: 'Installation erfolgreich — der PC muss bei Gelegenheit neu gestartet werden.' }
  if (code === 1602) return { ok: false, neustart: false, text: 'Die Installation wurde abgebrochen (Exitcode 1602).' }
  if (code === 1603) return { ok: false, neustart: false, text: 'Die Installation ist fehlgeschlagen (Exitcode 1603 — Details stehen im Installationsprotokoll auf dem Ziel-PC).' }
  if (code === 1618) return { ok: false, neustart: false, text: 'Auf dem PC läuft bereits eine andere Installation (Exitcode 1618). Später erneut versuchen.' }
  if (code === 5) return { ok: false, neustart: false, text: 'Zugriff verweigert (Exitcode 5) — fehlen die Administratorrechte auf dem Ziel-PC?' }
  return { ok: false, neustart: false, text: `Die Installation endete mit Exitcode ${code}.` }
}

type Melder = (id: string, status: SchrittStatus, info?: string) => void

/**
 * Jabra Direct still auf dem Ziel-PC installieren.
 * Meldet jeden Schritt über `melde`; der Rückgabewert ist die Bestätigung fürs Tool.
 */
export async function installiereJabra(host: string, melde: Melder): Promise<JabraErgebnis> {
  const h = escPs(host)

  // 1) Quelle
  melde('quelle', 'laeuft')
  const quelle = await findeJabraSetup()
  if (!quelle.ok) { melde('quelle', 'fehler', quelle.fehler); return { ok: false, text: quelle.fehler || 'Setup nicht gefunden.' } }
  melde('quelle', 'ok', `${quelle.name}${quelle.version ? ` · Version ${quelle.version}` : ''} · ${quelle.groesseMB} MB`)

  // 2) Ziel erreichbar + WinRM
  melde('ziel', 'laeuft')
  try {
    const rm = await ensureWinRM(host)
    if (!rm) { const t = `${host} ist über WinRM nicht erreichbar.`; melde('ziel', 'fehler', t); return { ok: false, text: t } }
  } catch (e) {
    const t = `WinRM-Aktivierung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`
    melde('ziel', 'fehler', t); return { ok: false, text: t }
  }
  // Die Admin-Freigabe muss erreichbar sein, sonst scheitert die Kopie später hart.
  const adminShare = `\\\\${host}\\C$\\Windows\\Temp`
  const zielPruef = await ps(`if (Test-Path -LiteralPath '${escPs(adminShare)}') { 'OK' } else { 'KEINZUGRIFF' }`, 45000)
  if (!(zielPruef.stdout || '').includes('OK')) {
    const t = `Auf die Admin-Freigabe \\\\${host}\\C$ ist kein Zugriff möglich — ohne sie lässt sich das Setup nicht übertragen.`
    melde('ziel', 'fehler', t); return { ok: false, text: t }
  }
  melde('ziel', 'ok', `${host} erreichbar`)

  // 3) Kopieren (Admin-PC als Mittelsmann — der Ziel-PC käme selbst nicht ans Netzlaufwerk)
  melde('kopie', 'laeuft', `${quelle.groesseMB} MB werden übertragen — das dauert je nach Netz ein bis mehrere Minuten.`)
  const zielUnc = `\\\\${host}\\C$\\Windows\\Temp\\itadmintool_jabra`
  const kopieSkript = [
    ROBOCOPY_PS,
    `$code = Copy-SkfFile '${escPs(quelle.pfad)}' '${escPs(zielUnc)}'`,
    `$ziel = Join-Path '${escPs(zielUnc)}' '${escPs(quelle.name)}'`,
    `if (Test-Path -LiteralPath $ziel) {`,
    `  $gr = [math]::Round((Get-Item -LiteralPath $ziel).Length/1MB,1)`,
    `  Write-Output ('OK:' + $gr)`,
    `} else { Write-Output ('ERR:robocopy-Code ' + $code + ' — Datei kam am Ziel nicht an') }`,
  ].join('\n')
  const kopie = await ps(kopieSkript, 20 * 60 * 1000)
  const kopieZeile = (kopie.stdout || '').split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith('OK:') || l.startsWith('ERR:'))
  if (!kopieZeile || kopieZeile.startsWith('ERR:')) {
    const t = kopieZeile ? kopieZeile.slice(4) : (kopie.stderr?.trim() || 'Die Kopie auf den Ziel-PC ist fehlgeschlagen.')
    melde('kopie', 'fehler', t); return { ok: false, text: t }
  }
  melde('kopie', 'ok', `${kopieZeile.slice(3)} MB auf ${host} abgelegt`)

  // 4) Still installieren. /quiet = keinerlei Oberfläche beim angemeldeten Benutzer.
  melde('install', 'laeuft', 'Läuft unbemerkt im Hintergrund — bitte nicht abbrechen.')
  const zielExe = `${ZIEL_ORDNER}\\${quelle.name}`
  const installInner = [
    `$ErrorActionPreference='Stop'`,
    `try {`,
    `  $p = Start-Process -FilePath '${escPs(zielExe)}' -ArgumentList '/quiet','/norestart','/log','${escPs(LOG_DATEI)}' -Wait -PassThru`,
    `  Write-Output ('CODE:' + $p.ExitCode)`,
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
  ].join('\n')
  const inst = await ps(
    `try { Invoke-Command -ComputerName '${h}' -ScriptBlock { ${installInner} } -EA Stop } catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
    25 * 60 * 1000,
  )
  const instZeile = (inst.stdout || '').split(/\r?\n/).map(l => l.trim()).find(l => l.startsWith('CODE:') || l.startsWith('ERR:'))
  if (!instZeile) {
    const t = inst.timedOut ? 'Zeitüberschreitung: der Installer hat sich nicht innerhalb von 25 Minuten gemeldet.' : (inst.stderr?.trim() || 'Keine Rückmeldung vom Ziel-PC.')
    melde('install', 'fehler', t); return { ok: false, text: t }
  }
  if (instZeile.startsWith('ERR:')) { const t = instZeile.slice(4); melde('install', 'fehler', t); return { ok: false, text: t } }
  const deutung = deuteExitCode(Number(instZeile.slice(5)) || 0)
  melde('install', deutung.ok ? 'ok' : 'fehler', deutung.text)
  if (!deutung.ok) {
    // Installer-Datei stehen lassen wäre unnötig; das PROTOKOLL bleibt für die Fehlersuche.
    await aufraeumen(host, quelle.name, false)
    return { ok: false, text: `${deutung.text} Das Protokoll liegt auf dem PC unter ${LOG_DATEI}.` }
  }

  // 5) Gegenprobe über die Registry — „Exitcode 0" allein ist kein Beweis
  melde('pruefen', 'laeuft')
  const nach = await erkenneJabra(host)
  if (!nach.ok) { melde('pruefen', 'warnung', nach.fehler || 'Nachprüfung nicht möglich.') }
  else if (!nach.installiert) {
    const t = 'Der Installer meldete Erfolg, Jabra Direct ist aber nicht in der Programmliste des PCs zu finden.'
    melde('pruefen', 'fehler', t)
    await aufraeumen(host, quelle.name, false)
    return { ok: false, text: t }
  } else {
    melde('pruefen', 'ok', `Jabra Direct ${nach.version || ''} ist installiert.`)
  }

  // 6) Aufräumen — Installer und Protokoll vom Ziel-PC entfernen
  melde('aufraeumen', 'laeuft')
  const sauber = await aufraeumen(host, quelle.name, true)
  melde('aufraeumen', sauber ? 'ok' : 'warnung', sauber ? 'Temporäre Dateien entfernt.' : `Die temporären Dateien unter ${ZIEL_ORDNER} konnten nicht entfernt werden.`)

  return {
    ok: true,
    text: `Jabra Direct ${nach.version || quelle.version || ''} wurde auf ${host} still installiert.`.replace('  ', ' '),
    version: nach.version || quelle.version,
    neustartNoetig: deutung.neustart,
  }
}

/** Setup (und auf Wunsch das Protokoll) vom Ziel-PC entfernen. */
async function aufraeumen(host: string, setupName: string, auchProtokoll: boolean): Promise<boolean> {
  const unc = `\\\\${host}\\C$\\Windows\\Temp\\itadmintool_jabra`
  const befehle = [
    `Remove-Item -LiteralPath '${escPs(unc + '\\' + setupName)}' -Force -EA SilentlyContinue`,
    auchProtokoll ? `Remove-Item -LiteralPath '${escPs(unc + '\\jabra_install.log')}' -Force -EA SilentlyContinue` : '',
    auchProtokoll ? `Remove-Item -LiteralPath '${escPs(unc)}' -Recurse -Force -EA SilentlyContinue` : '',
    `if (Test-Path -LiteralPath '${escPs(unc + '\\' + setupName)}') { 'REST' } else { 'OK' }`,
  ].filter(Boolean).join('\n')
  try {
    const r = await ps(befehle, 60000)
    return (r.stdout || '').includes('OK')
  } catch { return false }
}
