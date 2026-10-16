// ── Refresh-Migrations-Helfer (Drucker & Explorer-Schnellzugriffe alt→neu) ────
// Wiederverwendbare Bausteine für das Migrations-Cockpit ([[refresh_migration_feature]]):
//   • Drucker des Altgeräts aus dem Verbindungs-Scan lesen und auf dem Neugerät
//     via SEAL `sealapw -queue` anwenden (bzw. als .cmd auf den Public Desktop legen).
//   • Explorer-Schnellzugriffe (AutomaticDestinations/CustomDestinations) des Altprofils
//     sichern und ins Zielprofil kopieren (bzw. als .cmd auf den Public Desktop legen).
// Postfächer entfallen (Exchange-AutoMapping). Nicht destruktiv/idempotent.

import { api } from '../electronAPI'
import { pathService } from './pathService'
import { loadConnData, forComputer, runInUserContext } from './printerConnections'
import { queryLivePrinters } from './livePrinters'
import { serialFromHostname } from './deviceMasterData'
import { normalizeSerial } from './hardwareInventory'
import { writeTempFile, copyToPublicDesktop } from './onboardingDeploy'
import type { ClientActionResult } from './printerConnections'

export interface MigrationPrinter { name: string; isDefault: boolean }

function istHostname(s: string): boolean { return /^(DEHAM|DESCH|DE)[A-Z0-9]/.test((s || '').trim().toUpperCase().replace(/\s+/g, '')) }
function serialOf(v: string): string { return istHostname(v) ? (serialFromHostname(v) || '') : normalizeSerial(v) }
function psq(s: string): string { return (s || '').replace(/'/g, "''") }
function toEncodedCommand(ps: string): string {
  let bin = ''
  for (let i = 0; i < ps.length; i++) { const c = ps.charCodeAt(i); bin += String.fromCharCode(c & 0xff, (c >> 8) & 0xff) }
  return btoa(bin)
}
/** Netzlaufwerk-Ablage (absolute UNC) für die gesicherten Schnellzugriffe je Auftrag/Checkliste. */
function bundleDir(id: string): string { return `${pathService.getToolRoot('unc')}\\refresh_migration\\${id}\\quickaccess` }

/** Gesicherte Schnellzugriffe eines Auftrags vom Netzlaufwerk löschen (nach dem Übertragen
 *  aufs Neugerät) — das EINZIGE, was das Tool selbstständig löscht. */
export async function deleteQuickAccessBundle(id: string): Promise<void> {
  const dir = bundleDir(id)
  const marker = quickAccessMarker(id)
  try {
    await api().runPowerShell([
      `Remove-Item -Recurse -Force -LiteralPath '${psq(dir)}' -ErrorAction SilentlyContinue`,
      `Remove-Item -Force -LiteralPath '${psq(marker)}' -ErrorAction SilentlyContinue`,
    ].join('\n'), 30000)
  } catch { /* egal */ }
}

/** Drucker des Altgeräts LIVE lesen (Fallback, wenn der Verbindungs-Scan nichts hat, das
 *  Altgerät aber online ist). Standard wird aus der Live-Abfrage übernommen. */
export async function readOldPrintersLive(oldHost: string): Promise<MigrationPrinter[]> {
  try {
    const r = await queryLivePrinters(oldHost)
    if (r.ok) return r.printers.map(p => ({ name: p.name, isDefault: p.isDefault }))
  } catch { /* egal */ }
  return []
}

// ── Drucker des Altgeräts aus dem Verbindungs-Scan lesen ──────────────────────
export async function readOldPrinters(oldRaw: string): Promise<MigrationPrinter[]> {
  const data = await loadConnData()
  if (!data) return []
  const ser = serialOf(oldRaw)
  const cands = [oldRaw, ser ? 'DE' + ser : '', ser ? 'DEHAM' + ser : '', ser ? 'DESCH' + ser : ''].filter(Boolean)
  for (const c of cands) {
    const rows = forComputer(data, c)
    if (rows.length > 0) {
      const seen = new Set<string>()
      const out: MigrationPrinter[] = []
      for (const r of rows) {
        const key = r.printerName.toUpperCase()
        if (seen.has(key)) { if (r.isDefault) { const e = out.find(o => o.name.toUpperCase() === key); if (e) e.isDefault = true } continue }
        seen.add(key); out.push({ name: r.printerName, isDefault: r.isDefault })
      }
      return out
    }
  }
  return []
}

// ── PowerShell-Bausteine (laufen als der am Ziel-PC angemeldete Benutzer) ─────
const SEAL_APW_LOCATE = [
  `$apw='C:\\Program Files\\SEAL Systems\\SEAL Add Printer Wizard\\sealapw.exe'`,
  `if(-not(Test-Path $apw)){$apw='C:\\Program Files (x86)\\SEAL Systems\\SEAL Add Printer Wizard\\sealapw.exe'}`,
].join('\n')

function buildPrinterOp(printers: MigrationPrinter[], selfDeleteFile?: string): string {
  const def = printers.find(p => p.isDefault)
  const lines = [
    `$ErrorActionPreference='SilentlyContinue'`,
    SEAL_APW_LOCATE,
    `if(Test-Path $apw){`,
    ...printers.map(p => `  & $apw -queue '${psq(p.name)}' -retry 3 | Out-Null`),
    def ? `  & $apw -default -queue '${psq(def.name)}' | Out-Null` : ``,
    `}`,
  ]
  if (selfDeleteFile) lines.push(`Start-Sleep -Seconds 2`, `Remove-Item '${psq(selfDeleteFile)}' -Force -EA SilentlyContinue`)
  return lines.filter(Boolean).join('\n')
}

/** Markerdatei, die der Anwender-Lauf schreibt — daran erkennt das Tool, dass die
 *  Schnellzugriffe angekommen sind (die .cmd läuft im Benutzerkontext, ohne Rückkanal). */
function quickAccessMarker(id: string): string {
  return `${pathService.getToolRoot('unc')}\\refresh_migration\\${id}\\quickaccess_uebertragen.txt`
}

/**
 * Kopiert die gesicherten Schnellzugriffe ins Profil des AUSFÜHRENDEN Benutzers — also
 * entweder als geplante Aufgabe im Benutzerkontext (applyQuickAccessLive) oder aus der
 * .cmd auf dem öffentlichen Desktop.
 *
 * `mitExitCode` steuert die Fehlerbehandlung — das ist wichtig, nicht kosmetisch:
 *  • true  (.cmd auf dem Desktop): Write-Host + `exit 0/1`, damit die .cmd dem Anwender
 *    „Fertig" bzw. „Fehlgeschlagen" anzeigen kann.
 *  • false (applyQuickAccessLive): NIEMALS `exit` — die Op läuft dort eingebettet in das
 *    Skript von runInUserContext, das nach der Op erst seine Ergebnisdatei schreibt.
 *    Ein `exit` würde den Prozess vorher beenden und der Lauf gälte als fehlgeschlagen.
 *    Stattdessen `throw`, das der umgebende try/catch sauber einsammelt.
 */
function buildQuickAccessOp(id: string, mitExitCode = false): string {
  const fehler = (text: string) => mitExitCode
    ? `{ Write-Host '${text}'; exit 1 }`
    : `{ throw '${text}' }`
  return [
    `$ErrorActionPreference='Continue'`,
    `$bundle='${psq(bundleDir(id))}'`,
    `$dst="$env:APPDATA\\Microsoft\\Windows\\Recent"`,
    `if(-not (Test-Path $bundle)) ${fehler('Keine gesicherten Schnellzugriffe gefunden - bitte zuerst im IT-Tool vom Altgeraet sichern.')}`,
    `$n=0`,
    `foreach($f in 'AutomaticDestinations','CustomDestinations'){`,
    `  $q = Join-Path $bundle $f`,
    `  if(Test-Path $q){`,
    `    New-Item -ItemType Directory -Force (Join-Path $dst $f) | Out-Null`,
    `    Copy-Item (Join-Path $q '*') (Join-Path $dst $f) -Force -Recurse -EA SilentlyContinue`,
    `    $n += @(Get-ChildItem -LiteralPath $q -File -Force -EA SilentlyContinue).Count`,
    `  }`,
    `}`,
    `if($n -eq 0) ${fehler('Im Zwischenspeicher lagen keine Dateien.')}`,
    // Marker fürs Tool — schlägt er fehl (keine Schreibrechte), ist das nicht schlimm.
    `try { Set-Content -LiteralPath '${psq(quickAccessMarker(id))}' -Value ("$env:COMPUTERNAME|$env:USERNAME|" + (Get-Date -Format 'o')) -Force -EA Stop } catch { }`,
    `Stop-Process -Name explorer -Force -EA SilentlyContinue`,
    mitExitCode ? `Write-Host ("$n Datei(en) uebertragen.")` : ``,
    mitExitCode ? `exit 0` : ``,
  ].filter(Boolean).join('\n')
}

// ── Drucker: live anwenden bzw. als .cmd auf den Public Desktop ───────────────
export async function applyPrintersLive(newHost: string, printers: MigrationPrinter[]): Promise<ClientActionResult> {
  if (!printers.length) return { ok: false, text: 'Keine Drucker zum Übertragen.' }
  return runInUserContext(newHost, buildPrinterOp(printers), 120000)
}
export async function deployPrinterScript(newHost: string, printers: MigrationPrinter[]): Promise<{ ok: boolean; text?: string }> {
  if (!printers.length) return { ok: false, text: 'Keine Drucker zum Übertragen.' }
  const fileName = 'SKF-Drucker-einrichten.cmd'
  const desktop = `C:\\Users\\Public\\Desktop\\${fileName}`
  const enc = toEncodedCommand(buildPrinterOp(printers, desktop))
  const cmd = [`@echo off`, `title SKF Drucker einrichten`, `echo Richte Drucker ein, bitte warten...`, `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${enc}`].join('\r\n')
  const tmp = await writeTempFile(cmd, `prn_${Date.now().toString(36)}`, 'cmd')
  if (!tmp.ok || !tmp.path) return { ok: false, text: tmp.error }
  const cp = await copyToPublicDesktop(newHost, tmp.path, fileName)
  return { ok: cp.ok, text: cp.error }
}

// ── Schnellzugriffe: vom Altgerät sichern, live anwenden bzw. als .cmd ────────
export async function stageOldQuickAccess(oldHost: string, corpId: string, id: string): Promise<{ ok: boolean; text?: string }> {
  const dst = bundleDir(id)
  const base = `\\\\${psq(oldHost)}\\c$\\Users`
  const corp = psq(corpId)
  const script = [
    `try {`,
    `  $base = '${base}'`,
    `  $prof = $null`,
    corp ? `  if (Test-Path (Join-Path $base '${corp}')) { $prof = Join-Path $base '${corp}' }` : ``,
    `  if (-not $prof) { $prof = (Get-ChildItem $base -Directory -EA SilentlyContinue | Where-Object { $_.Name -notmatch '^(Public|Default|Default User|defaultuser0|All Users|Administrator|MSSQL|classic)' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }`,
    `  if (-not $prof) { Write-Output 'ERR:kein Benutzerprofil auf dem Altgeraet gefunden'; return }`,
    `  $src = Join-Path $prof 'AppData\\Roaming\\Microsoft\\Windows\\Recent'`,
    `  New-Item -ItemType Directory -Force '${psq(dst)}' | Out-Null`,
    `  $any = $false`,
    `  foreach ($f in 'AutomaticDestinations','CustomDestinations') { if (Test-Path (Join-Path $src $f)) { Copy-Item (Join-Path $src $f) '${psq(dst)}' -Recurse -Force -EA Stop; $any = $true } }`,
    `  if ($any) { Write-Output 'OK' } else { Write-Output 'ERR:keine Schnellzugriff-Daten im Altprofil' }`,
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
  ].filter(Boolean).join('\n')
  try {
    const r = await api().runPowerShell(script, 60000)
    const out = (r.stdout ?? '').trim()
    return out.includes('OK') ? { ok: true } : { ok: false, text: out.replace(/^ERR:/, '').trim() || 'Sichern fehlgeschlagen' }
  } catch (e) { return { ok: false, text: e instanceof Error ? e.message : String(e) } }
}
export async function applyQuickAccessLive(newHost: string, id: string): Promise<ClientActionResult> {
  return runInUserContext(newHost, buildQuickAccessOp(id), 90000)
}
export async function deployQuickAccessScript(newHost: string, id: string): Promise<{ ok: boolean; text?: string }> {
  const fileName = 'SKF-Schnellzugriffe.cmd'
  const enc = toEncodedCommand(buildQuickAccessOp(id, true))
  // Mit Ergebnis-Ausgabe und pause: vorher blitzte das Fenster durch und der Anwender
  // wusste nicht, ob es geklappt hat. Selbstlöschung über (goto) 2>nul, sonst meckert cmd.
  const cmd = [
    `@echo off`,
    `title SKF Explorer-Schnellzugriffe`,
    `echo Uebertrage die Schnellzugriffe vom alten PC...`,
    `echo Der Explorer startet dabei kurz neu - der Desktop blinkt einmal.`,
    `echo.`,
    `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${enc}`,
    `echo.`,
    `if errorlevel 1 (echo FEHLGESCHLAGEN - bitte bei der IT melden.) else (echo Fertig - die Ordner stehen im Explorer unter "Schnellzugriff".)`,
    `pause`,
    `(goto) 2>nul & del "%~f0"`,
  ].join('\r\n')
  const tmp = await writeTempFile(cmd, `qa_${Date.now().toString(36)}`, 'cmd')
  if (!tmp.ok || !tmp.path) return { ok: false, text: tmp.error }
  const cp = await copyToPublicDesktop(newHost, tmp.path, fileName)
  return { ok: cp.ok, text: cp.ok ? `„${fileName}" liegt auf dem Desktop von ${newHost} — der angemeldete Benutzer startet sie per Doppelklick.` : cp.error }
}

/**
 * Hat der Anwender die .cmd ausgeführt? Erkennbar an der Markerdatei, die sie schreibt.
 * Nötig, weil die .cmd im Benutzerkontext läuft und dem Tool sonst nichts zurückmeldet.
 */
export async function checkQuickAccessApplied(id: string): Promise<boolean> {
  try {
    const r = await api().runPowerShell(`if (Test-Path -LiteralPath '${psq(quickAccessMarker(id))}') { 'JA' } else { 'NEIN' }`, 30000)
    return (r.stdout || '').includes('JA')
  } catch { return false }
}
