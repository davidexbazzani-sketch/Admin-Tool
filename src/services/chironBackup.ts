// ── Chiron Backup (AMCube-Sync) — Verteilen, Einrichten, Steuern, Status ────────
// Die Daten der Chiron-AMCube-Anlagen werden NICHT vom Tool kopiert. Mein PC erreicht die
// Anlagen nicht, nur den Server w3294. Dort läuft scripts/amcube-sync/AMCubeSync.ps1 als
// geplante Aufgabe (SYSTEM, stündlich + beim Start). Das Tool
//   - verteilt Skript + config.json nach C:\ProgramData\AMCubeSync und legt die Aufgabe an,
//   - gibt Aufträge (Jetzt ausführen, Probelauf, Vergleich, Größe) als Datei in auftraege\
//     und startet die Aufgabe — gearbeitet wird IMMER als SYSTEM auf dem Server,
//   - liest status.json / verlauf.jsonl und zeigt sie an.
// Fernzugriff: zuerst WinRM (Invoke-Command), sonst \\server\C$ + schtasks /S.
// Auf dem Server wird WinRM NICHT eingeschaltet (kein ensureWinRM).
// Passwort von skf1: wird hier im Fenster mit dem öffentlichen Schlüssel des Servers
// verschlüsselt (WebCrypto RSA-OAEP-256) — es steht in keiner Befehlszeile, keinem
// PowerShell-Protokoll und keiner Datei im Klartext. Der Server speichert es per DPAPI.

import { api } from '../electronAPI'
import SKRIPT_ROH from '../../scripts/amcube-sync/AMCubeSync.ps1?raw'
import BEISPIEL_ROH from '../../scripts/amcube-sync/config.example.json?raw'
import { grundZuCode } from './backupBericht'

export const CHIRON_AUFGABE = '\\SKF\\AMCubeSync'
export const CHIRON_REMOTE = 'C:\\ProgramData\\AMCubeSync'
export const CHIRON_SKRIPT: string = SKRIPT_ROH
export const CHIRON_SKRIPT_VERSION = (/AMCubeSync-Version:\s*([\d.]+)/.exec(SKRIPT_ROH)?.[1]) || '0'
export const ROOT_TEST = '02_Serienproduktion_Test'
export const ROOT_PROD = '02_Serienproduktion'

/** Nur für Tests: anderer Ablageordner, keine Rechte-Änderung. */
export const CHIRON_TEST = { basis: '', ohneAcl: false, winrmLokal: false }
const remoteBasis = () => CHIRON_TEST.basis || CHIRON_REMOTE

// ── Datenmodell ───────────────────────────────────────────────────────────────

export interface ChironZusatz { quellordner: string; aktiv: boolean }
export interface ChironAnlage {
  id: string; name: string; hostname: string; ip: string
  freigabe: string; quellordner: string; zielordner: string; aktiv: boolean
  zusatzordner: ChironZusatz[]
}
export interface ChironKonfig {
  version: number
  basePath: string; shareName: string
  targetRoot: typeof ROOT_TEST | typeof ROOT_PROD
  benutzer: string
  slots: string[]
  minFreeGB: number; warnStunden: number; logTage: number
  robocopy: { threads: number; retries: number; wait: number }
  anlagen: ChironAnlage[]
}
export interface ChironFehler { art: string; text: string; code?: number; rc?: number; original?: string; am?: string; log?: string; anzahl?: number }
export interface ChironAnlageStatus {
  id: string; name?: string; hostname?: string; ip?: string; aktiv?: boolean; zielordner?: string
  erreichbar?: boolean | null; geprueftAm?: string
  letzterErfolg?: string; letzterErfolgZiel?: string; letzterVersuch?: string
  ergebnis?: 'ok' | 'nicht_erreichbar' | 'fehler'
  kopiert?: number; bytes?: number; rc?: number; dauerSek?: number; log?: string
  fehler?: ChironFehler | null
  probelauf?: { am: string; ergebnis: string; wuerdeKopieren: number; bytes: number; rc?: number; fehler?: ChironFehler | null; log?: string }
}
export interface ChironStatus {
  skriptVersion?: string; rechner?: string; aktualisiert?: string
  laeuft?: { seit: string; pid: number; anlage: string; kopiert: number; aktualisiert?: string } | null
  modus?: 'test' | 'produktiv'; targetRoot?: string; basePath?: string; slots?: string[]
  server?: { freigabeOk: boolean; freigabeFehler?: string; freiBytes?: number | null; minFreeGB?: number; geprueftAm?: string }
  anlagen?: Record<string, ChironAnlageStatus>
  passwort?: { gesetztAm: string; von: string }
  passwortFehler?: { am: string; text: string }
  schluessel?: boolean
  fehler?: ChironFehler
  letzterLauf?: { ende: string; exitCode: number }
}
export interface ChironVerlauf {
  runId: string; anlage: string; start: string; ende?: string; dauerSek?: number
  ergebnis: 'ok' | 'nicht_erreichbar' | 'fehler'; kopiert: number; bytes: number; rc?: number | null
  dryRun?: boolean; ausloeser?: string; ziel?: string; fehler?: string; fehlerArt?: string; code?: number; log?: string
}
export interface ChironAktion { am: string; von: string; aktion: string; details?: unknown; rechner?: string; quelle?: string; server?: string }

export interface ChironJobDaten {
  server: string
  konfig: ChironKonfig
  eingerichtetAm?: string
  eingerichtetVon?: string
  skriptVersion?: string
}

export interface ChironServerStand {
  erreichbar: boolean
  fehler?: string
  gelesenAm: string
  zugriff?: 'winrm' | 'smb'
  eingerichtet: boolean
  status: ChironStatus | null
  konfig: ChironKonfig | null
  schluessel: { n: string; e: string } | null
  aufgabe: { vorhanden: boolean; aktiv: boolean | null; fehler?: string } | null
  skriptVersion?: string
}

export function standardKonfig(): ChironKonfig {
  const k = JSON.parse(BEISPIEL_ROH) as ChironKonfig
  return normalisiereKonfig(k)
}

export function normalisiereKonfig(k: Partial<ChironKonfig>): ChironKonfig {
  const anlagen = (Array.isArray(k.anlagen) ? k.anlagen : []).map(a => ({
    id: String(a.id ?? '').trim(), name: String(a.name ?? a.id ?? '').trim(), hostname: String(a.hostname ?? '').trim(), ip: String(a.ip ?? '').trim(),
    freigabe: String(a.freigabe ?? 'Daten').trim(), quellordner: String(a.quellordner ?? 'dataline_am').trim(), zielordner: String(a.zielordner ?? '').trim(),
    aktiv: a.aktiv === true,
    zusatzordner: (Array.isArray(a.zusatzordner) ? a.zusatzordner : []).map(z => ({ quellordner: String(z.quellordner ?? '').trim(), aktiv: z.aktiv === true })).filter(z => z.quellordner),
  }))
  return {
    version: 1,
    basePath: String(k.basePath || 'D:\\Chiron'),
    shareName: String(k.shareName || 'Chiron'),
    targetRoot: k.targetRoot === ROOT_PROD ? ROOT_PROD : ROOT_TEST,
    benutzer: String(k.benutzer || 'skf1'),
    slots: (Array.isArray(k.slots) && k.slots.length ? k.slots : ['06:00', '18:00']).map(String),
    minFreeGB: Number(k.minFreeGB) > 0 ? Number(k.minFreeGB) : 10,
    warnStunden: Number(k.warnStunden) > 0 ? Number(k.warnStunden) : 48,
    logTage: Number(k.logTage) > 0 ? Number(k.logTage) : 90,
    robocopy: { threads: Number(k.robocopy?.threads) || 8, retries: k.robocopy?.retries != null ? Number(k.robocopy.retries) : 2, wait: k.robocopy?.wait != null ? Number(k.robocopy.wait) : 10 },
    anlagen,
  }
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
const ORDNER = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/
function teilpfadOk(p: string): boolean {
  if (!p || /[/:*?"<>|]/.test(p) || p.startsWith('\\') || p.endsWith('\\')) return false
  return p.split('\\').every(t => t && t !== '.' && t !== '..')
}

/** Prüft die Konfiguration; liefert verständliche Beanstandungen (leer = ok). */
export function pruefeKonfig(k: ChironKonfig): string[] {
  const f: string[] = []
  if (!/^[A-Za-z]:\\[^:*?"<>|]*$/.test(k.basePath)) f.push('Basispfad muss ein lokaler Pfad auf dem Server sein (z. B. D:\\Chiron).')
  if (!k.shareName.trim()) f.push('Name der Freigabe fehlt (z. B. Chiron).')
  if (!/^[A-Za-z0-9._-]+$/.test(k.benutzer)) f.push('Benutzername (z. B. skf1) ist ungültig.')
  if (!k.slots.length) f.push('Mindestens eine Uhrzeit für den Zeitplan eintragen.')
  for (const s of k.slots) if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) f.push(`Uhrzeit „${s}" ist ungültig (HH:MM).`)
  if (new Set(k.slots).size !== k.slots.length) f.push('Eine Uhrzeit ist doppelt eingetragen.')
  if (!(k.minFreeGB >= 1)) f.push('Mindest-Speicherplatz muss mindestens 1 GB sein.')
  const ids = new Set<string>(), ziele = new Set<string>()
  if (!k.anlagen.length) f.push('Keine Anlage eingetragen.')
  for (const a of k.anlagen) {
    const n = a.id || '(ohne Namen)'
    if (!a.id) f.push('Eine Anlage hat keinen Namen.')
    if (ids.has(a.id.toLowerCase())) f.push(`Anlage ${n} ist doppelt.`)
    ids.add(a.id.toLowerCase())
    if (!ORDNER.test(a.zielordner) || a.zielordner.includes('..')) f.push(`${n}: Zielordner „${a.zielordner}" ist ungültig (nur Buchstaben, Ziffern, Leerzeichen, . _ -).`)
    if (ziele.has(a.zielordner.toLowerCase())) f.push(`${n}: Zielordner „${a.zielordner}" wird schon von einer anderen Anlage benutzt.`)
    ziele.add(a.zielordner.toLowerCase())
    if (!a.aktiv) continue
    if (!IPV4.test(a.ip)) f.push(`${n}: IP-Adresse „${a.ip}" ist ungültig.`)
    if (!/^[A-Za-z0-9._-]+$/.test(a.hostname)) f.push(`${n}: Hostname fehlt oder ist ungültig (für die Anmeldung <Hostname>\\${k.benutzer}).`)
    if (!/^[^\\/:*?"<>|]+$/.test(a.freigabe)) f.push(`${n}: Freigabe „${a.freigabe}" ist ungültig.`)
    if (!teilpfadOk(a.quellordner)) f.push(`${n}: Quellordner „${a.quellordner}" ist ungültig.`)
    for (const z of a.zusatzordner) if (!teilpfadOk(z.quellordner)) f.push(`${n}: Zusatzordner „${z.quellordner}" ist ungültig.`)
  }
  return f
}

export const quellPfad = (a: ChironAnlage) => `\\\\${a.ip || '?'}\\${a.freigabe}\\${a.quellordner}`
export const zielPfad = (k: Pick<ChironKonfig, 'basePath' | 'targetRoot'>, a: Pick<ChironAnlage, 'zielordner'>, root?: string) => `${k.basePath.replace(/\\+$/, '')}\\${root || k.targetRoot}\\${a.zielordner}`

// ── Fernzugriff ───────────────────────────────────────────────────────────────

function q(s: string): string { return (s ?? '').replace(/'/g, "''") }
function b64(s: string): string { return btoa(unescape(encodeURIComponent(s))) }

interface Zugriff { art: 'winrm' | 'smb' | null; winrmFehler?: string; smbFehler?: string; am: number }
const zugriffCache = new Map<string, Zugriff>()

/** Wie erreiche ich den Server? WinRM zuerst, sonst Admin-Freigabe C$. Nur lesend geprüft. */
export async function ermittleZugriff(host: string, frisch = false): Promise<Zugriff> {
  const key = host.toLowerCase()
  const c = zugriffCache.get(key)
  if (!frisch && c && Date.now() - c.am < (c.art ? 10 : 2) * 60_000) return c
  const script = [
    `$r = @{ winrm = $false; winrmFehler = ''; smb = $false; smbFehler = '' }`,
    `try { $o = New-PSSessionOption -OpenTimeout 15000 -OperationTimeout 30000; [void](Invoke-Command -ComputerName '${q(host)}' -SessionOption $o -ScriptBlock { $env:COMPUTERNAME } -ErrorAction Stop); $r.winrm = $true } catch { $r.winrmFehler = $_.Exception.Message }`,
    `try { $r.smb = [System.IO.Directory]::Exists('\\\\${q(host)}\\C$\\ProgramData'); if (-not $r.smb) { $r.smbFehler = 'Admin-Freigabe \\\\${q(host)}\\C$ nicht erreichbar' } } catch { $r.smbFehler = $_.Exception.Message }`,
    `ConvertTo-Json -InputObject $r -Compress`,
  ].join('\n')
  let z: Zugriff = { art: null, am: Date.now() }
  try {
    const r = await api().runPowerShell(script, 60000)
    const m = r.stdout.match(/\{[\s\S]*\}/)
    if (m) {
      const o = JSON.parse(m[0]) as { winrm: boolean; winrmFehler: string; smb: boolean; smbFehler: string }
      z = { art: o.winrm ? 'winrm' : o.smb ? 'smb' : null, winrmFehler: o.winrmFehler || undefined, smbFehler: o.smbFehler || undefined, am: Date.now() }
    } else z.smbFehler = r.stderr || 'keine Antwort'
  } catch (e) { z.smbFehler = e instanceof Error ? e.message : String(e) }
  zugriffCache.set(key, z)
  return z
}

let _temp = ''
async function tempOrdner(): Promise<string> {
  if (_temp) return _temp
  const r = await api().runPowerShell('[System.IO.Path]::GetTempPath()', 15000)
  _temp = r.stdout.trim().replace(/\\+$/, '')
  return _temp
}

// Gemeinsame Bausteine jeder Server-Aktion. Verfügbar: $B (Ablageordner — lokal bei WinRM,
// UNC bei Fallback), $S (schtasks-Zusatz: leer bzw. /S <Server>), $A (Argumente), $D (Dateiinhalte).
const OP_KOPF = String.raw`
$TN = '\SKF\AMCubeSync'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
function Invoke-SkfSt([string]$verb, [string[]]$rest) {
  $exe = Join-Path $env:SystemRoot 'System32\schtasks.exe'
  $o = & { $ErrorActionPreference = 'Continue'; & $exe $verb @S @rest 2>&1 | Out-String }
  return @{ rc = $LASTEXITCODE; out = ([string]$o).Trim() }
}
function Add-SkfAktion([string]$aktion, $details) {
  try { [IO.File]::AppendAllText((Join-Path $B 'aktionen.jsonl'), (ConvertTo-Json -InputObject @{ am = (Get-Date).ToString('o'); von = [string]$A.von; aktion = $aktion; details = $details; rechner = [string]$A.rechner; quelle = 'Tool' } -Depth 5 -Compress) + "` + '`n' + String.raw`", $Utf8) } catch { }
}
function Write-SkfAuftrag($json, [string]$id) {
  $d = Join-Path $B 'auftraege'
  if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
  [IO.File]::WriteAllText((Join-Path $d ($id + '.json')), [string]$json, $Utf8)
}
function Read-SkfText([string]$p) { if ([IO.File]::Exists($p)) { return [IO.File]::ReadAllText($p) }; return '' }
`

export interface OpErgebnis<T = Record<string, unknown>> { ok: boolean; daten?: T; fehler?: string; zugriff?: 'winrm' | 'smb' }

/** Führt PowerShell-Code auf dem Server aus (WinRM) bzw. gegen dessen Admin-Freigabe (Fallback). */
async function aufServer<T = Record<string, unknown>>(host: string, code: string, args: Record<string, unknown> = {}, dateien: Record<string, string> = {}, timeoutMs = 120000): Promise<OpErgebnis<T>> {
  const z = CHIRON_TEST.winrmLokal ? { art: 'winrm' as const, am: Date.now() } : await ermittleZugriff(host)
  if (!z.art) {
    return { ok: false, fehler: `Server ${host} nicht erreichbar — WinRM: ${kurz(z.winrmFehler) || 'nein'} · Admin-Freigabe: ${kurz(z.smbFehler) || 'nein'}` }
  }
  const temp = await tempOrdner()
  const tmpDateien: [string, string][] = []
  for (const [name, inhalt] of Object.entries(dateien)) {
    const p = `${temp}\\amcube_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${name}`
    const w = await api().writeFile(p, b64(inhalt))
    if (!w.success) return { ok: false, fehler: `Temporäre Datei konnte nicht geschrieben werden: ${w.error}` }
    tmpDateien.push([name, p])
  }
  const basis = remoteBasis()
  const basisUnc = `\\\\${host}\\${basis[0]}$\\${basis.slice(3)}`
  const voll = OP_KOPF + '\n' + code
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `$A = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(JSON.stringify(args))}')) | ConvertFrom-Json`,
    `$D = @{}`,
    ...tmpDateien.map(([n, p]) => `$D['${q(n)}'] = [System.IO.File]::ReadAllText('${q(p)}')`),
    `$code = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64(voll)}'))`,
    `try {`,
    z.art === 'winrm'
      ? (CHIRON_TEST.winrmLokal
        // Test: Hintergrund-Job serialisiert Argumente/Ergebnis wie Remoting (CliXml)
        ? `  $r = Start-Job -ScriptBlock { param($c, $A, $D, $basis) $ErrorActionPreference = 'Stop'; $B = $basis; $S = @(); . ([scriptblock]::Create($c)) } -ArgumentList $code, $A, $D, '${q(basis)}' | Receive-Job -Wait -AutoRemoveJob -ErrorAction Stop`
        : `  $o = New-PSSessionOption -OpenTimeout 20000 -OperationTimeout ${Math.max(60000, timeoutMs - 10000)}; $r = Invoke-Command -ComputerName '${q(host)}' -SessionOption $o -ScriptBlock { param($c, $A, $D, $basis) $ErrorActionPreference = 'Stop'; $B = $basis; $S = @(); . ([scriptblock]::Create($c)) } -ArgumentList $code, $A, $D, '${q(basis)}' -ErrorAction Stop`)
      : `  $B = '${q(basisUnc)}'; $S = @('/S', '${q(host)}'); $r = . ([scriptblock]::Create($code))`,
    `  '@@SKF@@' + (ConvertTo-Json -InputObject $r -Depth 10 -Compress)`,
    `} catch { '@@SKFERR@@' + $_.Exception.Message }`,
    `finally { ${tmpDateien.map(([, p]) => `Remove-Item -LiteralPath '${q(p)}' -Force -ErrorAction SilentlyContinue`).join('; ') || '$null = 0'} }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, timeoutMs)
    const i = r.stdout.indexOf('@@SKF@@'), e = r.stdout.indexOf('@@SKFERR@@')
    if (i >= 0) {
      const t = r.stdout.slice(i + 7).trim()
      let daten: T | undefined
      try { daten = t ? JSON.parse(t) as T : undefined } catch { return { ok: false, fehler: `Antwort nicht lesbar: ${t.slice(0, 200)}`, zugriff: z.art } }
      return { ok: true, daten, zugriff: z.art }
    }
    if (e >= 0) { zugriffCache.delete(host.toLowerCase()); return { ok: false, fehler: r.stdout.slice(e + 10).trim(), zugriff: z.art } }
    return { ok: false, fehler: (r.stderr || r.stdout || (r.timedOut ? 'Zeitüberschreitung' : 'keine Antwort')).slice(0, 400), zugriff: z.art }
  } catch (err) { return { ok: false, fehler: err instanceof Error ? err.message : String(err), zugriff: z.art } }
}

function kurz(s?: string): string { return (s || '').replace(/\s+/g, ' ').slice(0, 180) }

/** Aufgaben-XML (UTF-16): stündlich + beim Systemstart, SYSTEM, keine Doppelinstanz. */
export function aufgabenXml(aktiv: boolean, basis = remoteBasis()): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Author>IT Admin Tool</Author><Description>AMCube-Sync (Chiron): Anlagen -&gt; D:\\Chiron, einseitig, nie loeschen. Stuendlich + beim Start, holt verpasste Slots nach.</Description></RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <Repetition><Interval>PT1H</Interval><Duration>P1D</Duration><StopAtDurationEnd>false</StopAtDurationEnd></Repetition>
      <StartBoundary>2026-01-01T00:01:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
    <BootTrigger><Delay>PT5M</Delay><Enabled>true</Enabled></BootTrigger>
  </Triggers>
  <Principals><Principal id="Author"><UserId>S-1-5-18</UserId><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>${aktiv ? 'true' : 'false'}</Enabled>
    <Hidden>false</Hidden>
    <ExecutionTimeLimit>PT23H</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe</Command>
      <Arguments>-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${esc(basis)}\\AMCubeSync.ps1"</Arguments>
    </Exec>
  </Actions>
</Task>`
}

function konfigText(k: ChironKonfig): string { return JSON.stringify(k, null, 2) }

function auftragsId(): string { return `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8)}` }

// ── Aktionen ──────────────────────────────────────────────────────────────────

/** Skript + Konfiguration verteilen, Rechte setzen, Aufgabe anlegen/aktualisieren, ersten Lauf (Schlüssel) starten. */
export async function richteEin(host: string, k: ChironKonfig, x: { von: string; rechner: string; aktiv: boolean }): Promise<OpErgebnis<{ create: { rc: number; out: string }; run: { rc: number; out: string }; acl: number; neu: boolean; targetRoot: string }>> {
  const f = pruefeKonfig(k)
  if (f.length) return { ok: false, fehler: f.join(' ') }
  const id = auftragsId()
  const code = String.raw`
$neu = -not (Test-Path -LiteralPath $B)
foreach ($u in @('', 'logs', 'auftraege', 'auftraege\ergebnisse')) { $p = $B; if ($u) { $p = Join-Path $B $u }; if (-not (Test-Path -LiteralPath $p)) { New-Item -ItemType Directory -Force -Path $p | Out-Null } }
$aclRc = 0
if (-not $A.ohneAcl) {
  $ic = Join-Path $env:SystemRoot 'System32\icacls.exe'
  [void](& { $ErrorActionPreference = 'Continue'; & $ic $B /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' 2>&1 | Out-String })
  $aclRc = $LASTEXITCODE
}
[IO.File]::WriteAllText((Join-Path $B 'AMCubeSync.ps1'), $D['AMCubeSync.ps1'], (New-Object System.Text.UTF8Encoding($true)))
# targetRoot bleibt wie auf dem Server — umgeschaltet wird nur bewusst ("Produktiv schalten")
$cfgPfad = Join-Path $B 'config.json'
$text = [string]$D['config.json']
$root = ''
if (Test-Path -LiteralPath $cfgPfad) { try { $root = [string](([IO.File]::ReadAllText($cfgPfad)) | ConvertFrom-Json).targetRoot } catch { } }
if ($root -eq '02_Serienproduktion' -or $root -eq '02_Serienproduktion_Test') { $text = [regex]::Replace($text, '"targetRoot"\s*:\s*"[^"]*"', ('"targetRoot": "' + $root + '"')) } else { $root = [string]($text | ConvertFrom-Json).targetRoot }
[IO.File]::WriteAllText($cfgPfad, $text, $Utf8)
$xml = Join-Path $B 'aufgabe.xml'
[IO.File]::WriteAllText($xml, $D['aufgabe.xml'], [System.Text.Encoding]::Unicode)
$create = Invoke-SkfSt '/Create' @('/TN', $TN, '/XML', $xml, '/F')
Write-SkfAuftrag $A.auftrag ([string]$A.auftragId)
$run = @{ rc = -1; out = '' }
if ($create.rc -eq 0 -and $A.aktiv) { $run = Invoke-SkfSt '/Run' @('/TN', $TN) }
Add-SkfAktion 'einrichten' @{ skriptVersion = [string]$A.version; aufgabe = $create.rc; neu = $neu; targetRoot = $root }
@{ create = $create; run = $run; acl = $aclRc; neu = $neu; targetRoot = $root }
`
  const r = await aufServer<{ create: { rc: number; out: string }; run: { rc: number; out: string }; acl: number; neu: boolean; targetRoot: string }>(host, code,
    { von: x.von, rechner: x.rechner, version: CHIRON_SKRIPT_VERSION, aktiv: x.aktiv, ohneAcl: CHIRON_TEST.ohneAcl, auftragId: id, auftrag: JSON.stringify({ id, art: 'schluessel', von: x.von, am: new Date().toISOString() }) },
    { 'AMCubeSync.ps1': CHIRON_SKRIPT, 'config.json': konfigText(k), 'aufgabe.xml': aufgabenXml(x.aktiv) }, 180000)
  if (r.ok && r.daten && r.daten.create.rc !== 0) return { ...r, ok: false, fehler: `Dateien verteilt, aber die geplante Aufgabe konnte nicht angelegt werden: ${schtasksText(r.daten.create.out)}` }
  if (r.ok && r.daten && r.daten.acl && !CHIRON_TEST.ohneAcl) return { ...r, ok: false, fehler: 'Aufgabe angelegt, aber die Ordnerrechte (nur SYSTEM + Administratoren) konnten nicht gesetzt werden.' }
  return r
}

function schtasksText(out: string): string {
  const t = (out || '').replace(/\s+/g, ' ').trim()
  if (/Zugriff verweigert|Access is denied/i.test(t)) return 'Zugriff verweigert (Admin-Rechte auf dem Server?)'
  if (/RPC|Remoteprozeduraufruf/i.test(t)) return `Aufgabenplanung des Servers nicht erreichbar (RPC/Firewall): ${t.slice(0, 160)}`
  return t.slice(0, 240) || 'unbekannter Fehler'
}

/** Nur die Konfiguration schreiben (targetRoot bleibt wie auf dem Server). */
export async function speichereKonfigAufServer(host: string, k: ChironKonfig, x: { von: string; rechner: string; aenderung?: string }): Promise<OpErgebnis<{ targetRoot: string }>> {
  const f = pruefeKonfig(k)
  if (f.length) return { ok: false, fehler: f.join(' ') }
  const code = String.raw`
$cfgPfad = Join-Path $B 'config.json'
if (-not (Test-Path -LiteralPath $B)) { throw 'Noch nicht auf dem Server eingerichtet' }
$text = [string]$D['config.json']
$root = ''
if (Test-Path -LiteralPath $cfgPfad) { try { $root = [string](([IO.File]::ReadAllText($cfgPfad)) | ConvertFrom-Json).targetRoot } catch { } }
if ($root -eq '02_Serienproduktion' -or $root -eq '02_Serienproduktion_Test') { $text = [regex]::Replace($text, '"targetRoot"\s*:\s*"[^"]*"', ('"targetRoot": "' + $root + '"')) }
[IO.File]::WriteAllText($cfgPfad, $text, $Utf8)
Add-SkfAktion 'konfiguration' @{ aenderung = [string]$A.aenderung }
@{ targetRoot = $root }
`
  return aufServer(host, code, { von: x.von, rechner: x.rechner, aenderung: x.aenderung || '' }, { 'config.json': konfigText(k) })
}

/** TEST ↔ PRODUKTIV umschalten (nur dieses Feld in der config.json des Servers). */
export async function setzeZielstamm(host: string, root: typeof ROOT_TEST | typeof ROOT_PROD, x: { von: string; rechner: string }): Promise<OpErgebnis<{ vorher: string; nachher: string }>> {
  const code = String.raw`
$cfgPfad = Join-Path $B 'config.json'
if (-not (Test-Path -LiteralPath $cfgPfad)) { throw 'config.json auf dem Server fehlt - erst einrichten' }
$text = [IO.File]::ReadAllText($cfgPfad)
$vorher = [string]($text | ConvertFrom-Json).targetRoot
$neu = [string]$A.root
if ($neu -ne '02_Serienproduktion' -and $neu -ne '02_Serienproduktion_Test') { throw 'Ungueltiger Zielstamm' }
$text = [regex]::Replace($text, '"targetRoot"\s*:\s*"[^"]*"', ('"targetRoot": "' + $neu + '"'))
[IO.File]::WriteAllText($cfgPfad, $text, $Utf8)
$nachher = [string](([IO.File]::ReadAllText($cfgPfad)) | ConvertFrom-Json).targetRoot
Add-SkfAktion 'zielstamm' @{ vorher = $vorher; nachher = $nachher }
@{ vorher = $vorher; nachher = $nachher }
`
  const r = await aufServer<{ vorher: string; nachher: string }>(host, code, { von: x.von, rechner: x.rechner, root })
  if (r.ok && r.daten?.nachher !== root) return { ...r, ok: false, fehler: 'Umschalten wurde auf dem Server nicht übernommen.' }
  return r
}

export type AuftragArt = 'sync' | 'pruefen' | 'groesse' | 'vergleich' | 'schluessel'

/** Auftrag ablegen und die Aufgabe sofort starten. Läuft schon ein Sync, wird der Auftrag danach erledigt. */
export async function starteAuftrag(host: string, art: AuftragArt, x: { von: string; rechner: string; anlagen?: string[]; dryRun?: boolean }): Promise<OpErgebnis<{ id: string; run: { rc: number; out: string }; aufgabeAktiv: boolean | null }>> {
  const id = auftragsId()
  const code = String.raw`
if (-not (Test-Path -LiteralPath (Join-Path $B 'AMCubeSync.ps1'))) { throw 'Noch nicht auf dem Server eingerichtet' }
Write-SkfAuftrag $A.auftrag ([string]$A.id)
$run = Invoke-SkfSt '/Run' @('/TN', $TN)
Add-SkfAktion ('auftrag-' + [string]$A.art) @{ id = [string]$A.id; anlagen = @($A.anlagen); dryRun = [bool]$A.dryRun }
@{ id = [string]$A.id; run = $run }
`
  const auftrag = JSON.stringify({ id, art, von: x.von, am: new Date().toISOString(), anlagen: x.anlagen ?? [], dryRun: !!x.dryRun })
  const r = await aufServer<{ id: string; run: { rc: number; out: string }; aufgabeAktiv: boolean | null }>(host, code, { von: x.von, rechner: x.rechner, id, art, anlagen: x.anlagen ?? [], dryRun: !!x.dryRun, auftrag })
  if (r.ok && r.daten && r.daten.run.rc !== 0) return { ...r, ok: false, fehler: `Auftrag abgelegt, aber die Aufgabe ließ sich nicht starten: ${schtasksText(r.daten.run.out)}. Er wird beim nächsten stündlichen Lauf erledigt.` }
  return r
}

/** Wartet auf das Ergebnis eines Auftrags (auftraege\ergebnisse\<id>.json). */
export async function warteAufAuftrag<T = unknown>(host: string, id: string, maxMs = 20 * 60_000, onTick?: (status: ChironStatus | null) => void): Promise<{ ok: boolean; daten?: T; fehler?: string }> {
  const t0 = Date.now()
  let fehlversuche = 0
  while (Date.now() - t0 < maxMs) {
    await new Promise(r => setTimeout(r, 5000))
    const code = String.raw`
$p = Join-Path $B ('auftraege\ergebnisse\' + [string]$A.id + '.json')
@{ ergebnis = (Read-SkfText $p); status = (Read-SkfText (Join-Path $B 'status.json')) }
`
    const r = await aufServer<{ ergebnis: string; status: string }>(host, code, { id }, {}, 60000)
    if (!r.ok) { if (++fehlversuche > 6) return { ok: false, fehler: r.fehler }; continue }
    fehlversuche = 0
    let st: ChironStatus | null = null
    try { st = r.daten?.status ? JSON.parse(r.daten.status.replace(/^\uFEFF/, '')) : null } catch { /* halb geschrieben */ }
    onTick?.(st)
    if (r.daten?.ergebnis) {
      try {
        const e = JSON.parse(r.daten.ergebnis.replace(/^\uFEFF/, '')) as { ok: boolean; fehler?: string; daten?: T }
        return e.ok ? { ok: true, daten: e.daten } : { ok: false, fehler: umlaute(e.fehler || 'Auftrag fehlgeschlagen'), daten: e.daten }
      } catch { /* nächster Durchgang */ }
    }
  }
  return { ok: false, fehler: 'Der Server hat den Auftrag in der Zeit nicht erledigt. Ist die Aufgabe pausiert oder läuft noch ein großer Sync? Das Ergebnis erscheint später im Log.' }
}

/** Status, Konfiguration, Schlüssel, Aufgabe und Skriptstand lesen. */
export async function liesServerStand(host: string): Promise<ChironServerStand> {
  const code = String.raw`
$skript = Read-SkfText (Join-Path $B 'AMCubeSync.ps1')
$ver = ''; $m = [regex]::Match($skript, 'AMCubeSync-Version:\s*([\d.]+)'); if ($m.Success) { $ver = $m.Groups[1].Value }
$q = Invoke-SkfSt '/Query' @('/TN', $TN, '/XML')
$aktiv = $null
if ($q.rc -eq 0) { $mm = [regex]::Match($q.out, '<Settings>[\s\S]*?<Enabled>(true|false)</Enabled>'); if ($mm.Success) { $aktiv = ($mm.Groups[1].Value -eq 'true') } else { $aktiv = $true } }
@{ eingerichtet = [bool]$skript; version = $ver; status = (Read-SkfText (Join-Path $B 'status.json')); konfig = (Read-SkfText (Join-Path $B 'config.json')); schluessel = (Read-SkfText (Join-Path $B 'schluessel.json')); aufgabeRc = $q.rc; aufgabeAktiv = $aktiv; aufgabeOut = $(if ($q.rc -ne 0) { $q.out } else { '' }) }
`
  const r = await aufServer<{ eingerichtet: boolean; version: string; status: string; konfig: string; schluessel: string; aufgabeRc: number; aufgabeAktiv: boolean | null; aufgabeOut: string }>(host, code, {}, {}, 90000)
  const gelesenAm = new Date().toISOString()
  if (!r.ok || !r.daten) return { erreichbar: false, fehler: r.fehler, gelesenAm, eingerichtet: false, status: null, konfig: null, schluessel: null, aufgabe: null }
  const d = r.daten
  const json = <T,>(s: string): T | null => { try { return s ? JSON.parse(s.replace(/^\uFEFF/, '')) as T : null } catch { return null } }
  const vorhanden = d.aufgabeRc === 0
  // schtasks meldet „nicht gefunden" mit rc 1; andere Fehler (RPC) = unbekannt
  const unbekannt = !vorhanden && !/nicht gefunden|cannot find|does not exist|existiert nicht/i.test(d.aufgabeOut || '')
  const k = json<ChironKonfig>(d.konfig)
  return {
    erreichbar: true, gelesenAm, zugriff: r.zugriff, eingerichtet: d.eingerichtet,
    status: json<ChironStatus>(d.status), konfig: k ? normalisiereKonfig(k) : null,
    schluessel: json<{ n: string; e: string }>(d.schluessel),
    aufgabe: { vorhanden, aktiv: vorhanden ? d.aufgabeAktiv : null, fehler: unbekannt ? schtasksText(d.aufgabeOut) : undefined },
    skriptVersion: d.version || undefined,
  }
}

/** Verlauf (letzte Läufe je Anlage) + Aktionsprotokoll des Servers. */
export async function liesVerlauf(host: string, max = 400): Promise<{ ok: boolean; fehler?: string; verlauf: ChironVerlauf[]; aktionen: ChironAktion[] }> {
  const code = String.raw`
function Get-SkfLetzte([string]$p, [int]$n) { if (-not [IO.File]::Exists($p)) { return }; $z = [IO.File]::ReadAllLines($p); if ($z.Count -le $n) { $z } else { $z[($z.Count - $n)..($z.Count - 1)] } }
@{ verlauf = @(Get-SkfLetzte (Join-Path $B 'verlauf.jsonl') ([int]$A.max)); aktionen = @(Get-SkfLetzte (Join-Path $B 'aktionen.jsonl') 200) }
`
  const r = await aufServer<{ verlauf: string[] | string; aktionen: string[] | string }>(host, code, { max }, {}, 90000)
  if (!r.ok || !r.daten) return { ok: false, fehler: r.fehler, verlauf: [], aktionen: [] }
  const zeilen = <T,>(v: string[] | string | undefined): T[] => ([] as string[]).concat(v ?? []).map(l => { try { return JSON.parse(String(l).replace(/^\uFEFF/, '')) as T } catch { return null } }).filter((x): x is T => !!x)
  return { ok: true, verlauf: zeilen<ChironVerlauf>(r.daten.verlauf).reverse(), aktionen: zeilen<ChironAktion>(r.daten.aktionen).reverse() }
}

/** Passwort von skf1 verschlüsselt übermitteln; danach prüft der Server die Anmeldung an allen Anlagen. */
export async function setzePasswort(host: string, pw: string, schluessel: { n: string; e: string }, x: { von: string; rechner: string }): Promise<OpErgebnis<{ id: string; run: { rc: number; out: string } }>> {
  if (!pw) return { ok: false, fehler: 'Kein Passwort eingegeben.' }
  let daten: string
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: schluessel.n, e: schluessel.e, alg: 'RSA-OAEP-256', ext: true }, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt'])
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, new TextEncoder().encode(pw)))
    let s = ''; ct.forEach(b => { s += String.fromCharCode(b) })
    daten = btoa(s)
  } catch (e) { return { ok: false, fehler: `Verschlüsseln fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` } }
  const id = auftragsId()
  const code = String.raw`
if (-not (Test-Path -LiteralPath (Join-Path $B 'AMCubeSync.ps1'))) { throw 'Noch nicht auf dem Server eingerichtet' }
[IO.File]::WriteAllText((Join-Path $B 'passwort.neu'), [string]$A.neu, $Utf8)
Write-SkfAuftrag $A.auftrag ([string]$A.id)
$run = Invoke-SkfSt '/Run' @('/TN', $TN)
Add-SkfAktion 'passwort-uebermittelt' @{ benutzer = 'skf1' }
@{ id = [string]$A.id; run = $run }
`
  const neu = JSON.stringify({ daten, von: x.von, am: new Date().toISOString() })
  return aufServer(host, code, { von: x.von, rechner: x.rechner, neu, id, auftrag: JSON.stringify({ id, art: 'pruefen', von: x.von, am: new Date().toISOString() }) })
}

/** Aufgabe pausieren/fortsetzen. */
export async function setzeAufgabeAktiv(host: string, aktiv: boolean, x: { von: string; rechner: string }): Promise<OpErgebnis<{ rc: number; out: string }>> {
  const code = String.raw`
$r = Invoke-SkfSt '/Change' @('/TN', $TN, $(if ($A.aktiv) { '/ENABLE' } else { '/DISABLE' }))
Add-SkfAktion $(if ($A.aktiv) { 'fortsetzen' } else { 'pausieren' }) $null
$r
`
  const r = await aufServer<{ rc: number; out: string }>(host, code, { von: x.von, rechner: x.rechner, aktiv })
  if (r.ok && r.daten && r.daten.rc !== 0) return { ...r, ok: false, fehler: schtasksText(r.daten.out) }
  return r
}

/** Aufgabe + Skript (+ Konfiguration, Status, Protokolle) vom Server entfernen. Die kopierten Daten unter D:\Chiron bleiben IMMER. */
export async function entferneVomServer(host: string): Promise<OpErgebnis<{ rc: number; out: string; ordnerWeg: boolean }>> {
  const code = String.raw`
$r = Invoke-SkfSt '/Delete' @('/TN', $TN, '/F')
$weg = $false
if ($B -match 'AMCubeSync$') { try { Remove-Item -LiteralPath $B -Recurse -Force -ErrorAction Stop; $weg = $true } catch { } }
if (-not $S.Count) {
  try { Add-Type -AssemblyName System.Core; $p = [System.Security.Cryptography.CngProvider]::MicrosoftSoftwareKeyStorageProvider; $o = [System.Security.Cryptography.CngKeyOpenOptions]::MachineKey; if ([System.Security.Cryptography.CngKey]::Exists('AMCubeSync-Passwort', $p, $o)) { [System.Security.Cryptography.CngKey]::Open('AMCubeSync-Passwort', $p, $o).Delete() } } catch { }
}
@{ rc = $r.rc; out = $r.out; ordnerWeg = $weg }
`
  const r = await aufServer<{ rc: number; out: string; ordnerWeg: boolean }>(host, code)
  if (r.ok && r.daten && r.daten.rc !== 0 && !/nicht gefunden|cannot find|does not exist/i.test(r.daten.out)) return { ...r, ok: false, fehler: `Aufgabe konnte nicht entfernt werden: ${schtasksText(r.daten.out)}` }
  return r
}

// ── Protokoll der Tool-Aktionen auf dem Netzlaufwerk ──────────────────────────

const AKTIONEN_DATEI = 'backups/chiron_aktionen.json'
export async function protokolliere(server: string, von: string, aktion: string, details?: unknown): Promise<void> {
  try {
    const d = (await api().netReadJsonAsync<{ eintraege: ChironAktion[] }>(AKTIONEN_DATEI)) ?? { eintraege: [] }
    const eintraege = Array.isArray(d.eintraege) ? d.eintraege : []
    eintraege.push({ am: new Date().toISOString(), von, aktion, details, server, quelle: 'Tool' })
    await api().netWriteJsonAsync(AKTIONEN_DATEI, { eintraege: eintraege.slice(-2000) })
  } catch { /* best effort */ }
}
export async function liesToolAktionen(server: string): Promise<ChironAktion[]> {
  try {
    const d = await api().netReadJsonAsync<{ eintraege: ChironAktion[] }>(AKTIONEN_DATEI)
    return (Array.isArray(d?.eintraege) ? d!.eintraege : []).filter(e => !e.server || e.server.toLowerCase() === server.toLowerCase()).reverse()
  } catch { return [] }
}

// Letzter bekannter Stand (für „Server nicht erreichbar, Status vom …") — auf dem Netzlaufwerk,
// damit alle Admins ihn sehen.
const cacheDatei = (jobId: string) => `backups/chiron_status_${jobId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`
export async function liesStandCache(jobId: string): Promise<ChironServerStand | null> {
  try { return await api().netReadJsonAsync<ChironServerStand>(cacheDatei(jobId)) } catch { return null }
}
export async function schreibeStandCache(jobId: string, s: ChironServerStand): Promise<void> {
  if (!s.erreichbar) return
  try { await api().netWriteJsonAsync(cacheDatei(jobId), s) } catch { /* egal */ }
}

// ── Anzeige-Hilfen ────────────────────────────────────────────────────────────

const WOERTER: [RegExp, string][] = [
  [/\bfuer\b/g, 'für'], [/\bFuer\b/g, 'Für'], [/\bueber/g, 'über'], [/benoetigt/g, 'benötigt'], [/ungueltig/g, 'ungültig'], [/Ungueltig/g, 'Ungültig'],
  [/verlaesst/g, 'verlässt'], [/naechsten/g, 'nächsten'], [/uebersprungen/g, 'übersprungen'], [/geaendert/g, 'geändert'],
  [/Kontoeinschraenkung/g, 'Kontoeinschränkung'], [/pruefen/g, 'prüfen'], [/Schluessel/g, 'Schlüssel'], [/uebernommen/g, 'übernommen'],
  [/laeuft/g, 'läuft'], [/erlaubt/g, 'erlaubt'], [/abgeschlossen/g, 'abgeschlossen'], [/Aenderung/g, 'Änderung'], [/loeschen/g, 'löschen'],
]
export function umlaute(t: string): string { let s = t || ''; for (const [r, w] of WOERTER) s = s.replace(r, w); return s }

/** Fehlertext + Abhilfe für die Kachel. */
export function fehlerAnzeige(f: ChironFehler): { text: string; hilfe?: string } {
  const text = umlaute(f.text)
  if (f.art === 'anmeldung') return { text, hilfe: 'Passwort von skf1 unter „Bearbeiten" neu setzen bzw. auf der Anlage prüfen, ob das Konto gesperrt/abgelaufen ist.' }
  if (f.art === 'kein_passwort') return { text, hilfe: 'Unter „Bearbeiten" das Passwort von skf1 eingeben und übermitteln.' }
  if (f.art === 'platz') return { text, hilfe: 'Auf w3294 (D:) Speicher freigeben oder den Mindest-Speicherplatz anpassen.' }
  if (f.art === 'freigabe') return { text, hilfe: 'Freigabe „Daten" auf der Anlage und die Firewall-Regel „Zugriff von w3294" prüfen.' }
  if (f.art === 'quelle') return { text, hilfe: 'Quellordner in der Konfiguration prüfen (Name richtig geschrieben?).' }
  if (f.art === 'robocopy' && f.code) {
    const g = grundZuCode(f.code)
    if (g) return { text, hilfe: g.hilfe }
  }
  if (f.art === 'skript') return { text, hilfe: 'Fehler im Sync-Skript — Details im Log; ggf. „Auf Server aktualisieren".' }
  return { text }
}

/** Server-Pfad (C:\ProgramData\…) → über die Admin-Freigabe öffenbar. */
export function serverPfadUnc(host: string, p?: string): string {
  if (!p) return ''
  const m = /^([A-Za-z]):\\(.*)$/.exec(p)
  return m ? `\\\\${host}\\${m[1].toUpperCase()}$\\${m[2]}` : p
}

/** Ampel der Kachel. */
export function chironAmpel(stand: ChironServerStand | null, konfig: ChironKonfig, jetzt = Date.now()): { farbe: 'gruen' | 'gelb' | 'rot' | 'grau'; grund: string } {
  if (!stand) return { farbe: 'grau', grund: 'Status wird geladen' }
  if (!stand.erreichbar) return { farbe: 'gelb', grund: 'Server nicht erreichbar' }
  if (!stand.eingerichtet) return { farbe: 'grau', grund: 'Noch nicht eingerichtet' }
  const st = stand.status
  if (st?.fehler || st?.server?.freigabeOk === false) return { farbe: 'rot', grund: umlaute(st?.fehler?.text || st?.server?.freigabeFehler || 'Fehler') }
  const aktive = konfig.anlagen.filter(a => a.aktiv)
  const as = aktive.map(a => st?.anlagen?.[a.id])
  const mitFehler = aktive.filter((a, i) => as[i]?.fehler)
  if (mitFehler.length) return { farbe: 'rot', grund: `Fehler bei ${mitFehler.map(a => a.id).join(', ')}` }
  const warn = aktive.filter((a, i) => {
    const s = as[i]
    if (!s) return true
    if (s.ergebnis === 'nicht_erreichbar') return true
    return ueberfaellig(s, konfig, jetzt)
  })
  if (warn.length) return { farbe: 'gelb', grund: `Nicht erreichbar oder überfällig: ${warn.map(a => a.id).join(', ')}` }
  if (stand.aufgabe && stand.aufgabe.vorhanden === false) return { farbe: 'gelb', grund: 'Geplante Aufgabe fehlt auf dem Server' }
  return { farbe: 'gruen', grund: 'Alle Anlagen ok' }
}

export function ueberfaellig(s: ChironAnlageStatus | undefined, k: ChironKonfig, jetzt = Date.now()): boolean {
  if (!s?.letzterErfolg) return !!s?.letzterVersuch   // schon versucht, aber nie erfolgreich
  return jetzt - new Date(s.letzterErfolg).getTime() > k.warnStunden * 3600_000
}
