// ── WinRM-Operationen fürs Migrations-Cockpit ─────────────────────────────────
// Sammelt die einzelnen Kachel-Aktionen (Netzlaufwerke/WLAN, Windows-Updates,
// Neustart). Sprache steckt jetzt in languageSetup.ts (Basic-Kachel). Alle best-effort, nicht destruktiv,
// laufen über WinRM/Invoke-Command; per-User-Dinge über runInUserContext.
// HINWEIS: Windows-Update-Install über PSRemoting ist token-bedingt heikel →
// Fallback UsoClient; im echten Betrieb testen.

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import { runInUserContext, type ClientActionResult } from './printerConnections'
import { psTransferWlanProfiles } from '../utils/migrationCommands'
import { writeTempFile, copyToPublicDesktop } from './onboardingDeploy'
import { pathService } from './pathService'
import { refreshNetworkDrivesLive, type NetDriveEntry } from './deviceNetworkDrives'

function psq(s: string): string { return (s || '').replace(/'/g, "''") }
/** UTF-16LE-Base64 für `powershell -EncodedCommand`. */
function toEncodedCommand(ps: string): string {
  let bin = ''
  for (let i = 0; i < ps.length; i++) { const c = ps.charCodeAt(i); bin += String.fromCharCode(c & 0xff, (c >> 8) & 0xff) }
  return btoa(bin)
}
function parseJson<T>(s: string | undefined): T | null {
  const t = (s ?? '').trim(); if (!t) return null
  const m = t.match(/[[{][\s\S]*[\]}]/); if (!m) return null
  try { return JSON.parse(m[0]) as T } catch { return null }
}
async function invoke(host: string, inner: string, timeoutMs = 60000): Promise<{ ok: boolean; out: string }> {
  const up = await ensureWinRM(host)
  if (!up) return { ok: false, out: 'WinRM nicht erreichbar' }
  const script = `try { $o = Invoke-Command -ComputerName '${psq(host)}' -ErrorAction Stop -ScriptBlock { ${inner} }; Write-Output ([string]$o) } catch { Write-Output ('ERR:' + $_.Exception.Message) }`
  try { const r = await api().runPowerShell(script, timeoutMs); return { ok: true, out: (r.stdout ?? '').trim() } }
  catch (e) { return { ok: false, out: e instanceof Error ? e.message : String(e) } }
}

// ── Netzlaufwerke + WLAN ───────────────────────────────────────────────────────
// Das AUSLESEN der Laufwerke steckt bewusst NICHT hier, sondern in
// deviceNetworkDrives.refreshNetworkDrivesLive: der frühere Weg über
// `Win32_MappedLogicalDisk` in einer WinRM-Sitzung lieferte immer eine leere Liste,
// weil verbundene Laufwerke zur Anmeldesitzung gehören. [[network_drive_migration]]
export type NetDrive = NetDriveEntry

/** Netzlaufwerke im Benutzerkontext des Neugeräts verbinden (persistent). */
export async function mapNetworkDrives(newHost: string, drives: NetDrive[]): Promise<ClientActionResult> {
  if (!drives.length) return { ok: false, text: 'Keine Netzlaufwerke zum Übernehmen.' }
  const op = drives.map(d => {
    const letter = d.letter.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase()
    return `try { cmd /c "net use ${letter}: ""${psq(d.unc)}"" /persistent:yes" | Out-Null } catch {}`
  }).join('\n')
  return runInUserContext(newHost, op, 90000)
}

/**
 * Verbindet nur die Laufwerke, die auf dem neuen PC noch NICHT vorhanden sind — gleicher
 * Buchstabe mit gleicher Freigabe wird übersprungen. Ein bereits belegter Buchstabe mit
 * ANDEREM Ziel wird ebenfalls in Ruhe gelassen und gemeldet, statt ihn zu überschreiben.
 */
export async function mapMissingNetworkDrives(newHost: string, drives: NetDrive[]): Promise<ClientActionResult & { neu: number; schonDa: number; konflikt: string[] }> {
  const leer = { neu: 0, schonDa: 0, konflikt: [] as string[] }
  if (!drives.length) return { ok: false, text: 'Keine Netzlaufwerke zum Übernehmen.', ...leer }

  const vorhanden = await refreshNetworkDrivesLive(newHost, 'auto-setup').catch(() => null)
  const belegt = new Map<string, string>()
  for (const d of vorhanden?.drives || []) belegt.set(d.letter.toUpperCase(), d.unc.replace(/\\+$/, '').toLowerCase())

  const fehlend: NetDrive[] = []
  const konflikt: string[] = []
  let schonDa = 0
  for (const d of drives) {
    const letter = d.letter.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase()
    if (!letter) continue
    const ziel = d.unc.replace(/\\+$/, '').toLowerCase()
    const ist = belegt.get(letter)
    if (ist === undefined) { fehlend.push(d); continue }
    if (ist === ziel) { schonDa++; continue }
    konflikt.push(`${letter}: zeigt bereits auf ${ist}`)
  }

  if (!fehlend.length) {
    const teile = [`${schonDa} bereits vorhanden`]
    if (konflikt.length) teile.push(...konflikt)
    return { ok: true, text: teile.join(' · '), neu: 0, schonDa, konflikt }
  }

  const r = await mapNetworkDrives(newHost, fehlend)
  const teile = [r.ok ? `${fehlend.length} neu verbunden` : (r.text || 'Verbinden fehlgeschlagen')]
  if (schonDa) teile.push(`${schonDa} bereits vorhanden`)
  if (konflikt.length) teile.push(...konflikt)
  return { ok: r.ok, text: teile.join(' · '), neu: r.ok ? fehlend.length : 0, schonDa, konflikt }
}
/** Markerdatei, die die .bat nach erfolgreichem Verbinden schreibt — daran erkennt das
 *  Tool, dass der Anwender sie ausgeführt hat (die .bat läuft ohne Rückkanal). */
function drivesMarker(id: string): string {
  return `${pathService.getToolRoot('unc')}\\refresh_migration\\${id}\\netzlaufwerke_verbunden.txt`
}

/** Hat der Anwender die .bat vom Desktop ausgeführt? */
export async function checkDrivesApplied(id: string): Promise<boolean> {
  try {
    const r = await api().runPowerShell(`if (Test-Path -LiteralPath '${psq(drivesMarker(id))}') { 'JA' } else { 'NEIN' }`, 30000)
    return (r.stdout || '').includes('JA')
  } catch { return false }
}

/**
 * Netzlaufwerke als .bat auf den Public Desktop des Neugeräts legen — die Rückfallebene,
 * wenn niemand angemeldet ist und das Hintergrund-Verbinden deshalb nicht greift. Der
 * Anwender führt sie nach seiner Anmeldung aus, sie mappt in seinem eigenen Kontext.
 * Zeigt ihr Ergebnis an (vorher blitzte das Fenster kommentarlos durch) und hinterlässt
 * eine Markerdatei, damit das Tool den Punkt als erledigt erkennt.
 */
export async function deployDrivesScript(newHost: string, drives: NetDrive[], id: string): Promise<{ ok: boolean; text?: string }> {
  if (!drives.length) return { ok: false, text: 'Keine Netzlaufwerke zum Übernehmen.' }
  const fileName = 'SKF-Netzlaufwerke-verbinden.bat'
  const marker = drivesMarker(id)
  const lines = [
    '@echo off',
    'title SKF Netzlaufwerke verbinden',
    'echo Verbinde die Netzlaufwerke vom alten PC...',
    'echo.',
    'set SKFFEHLER=0',
  ]
  for (const d of drives) {
    const letter = d.letter.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase()
    if (!letter) continue
    const unc = d.unc.replace(/"/g, '')
    // Bestehende Belegung vorher lösen, sonst scheitert net use mit „bereits verwendet".
    lines.push(`net use ${letter}: /delete /y >nul 2>&1`)
    lines.push(`net use ${letter}: "${unc}" /persistent:yes`)
    lines.push(`if errorlevel 1 (set SKFFEHLER=1& echo   FEHLER bei ${letter}: ${unc}) else (echo   OK   ${letter}: ${unc})`)
  }
  lines.push(
    'echo.',
    'if "%SKFFEHLER%"=="1" (echo Mindestens ein Laufwerk konnte nicht verbunden werden - bitte bei der IT melden.) else (echo Fertig - alle Laufwerke sind verbunden.)',
    // Marker nur bei vollem Erfolg; schlägt das Schreiben fehl, ist das nicht schlimm.
    `if "%SKFFEHLER%"=="0" (>"${marker}" echo %COMPUTERNAME%^|%USERNAME%^|%DATE% %TIME% 2>nul)`,
    'pause',
    // (goto) 2>nul beendet die Batch sauber, bevor sie sich selbst löscht.
    '(goto) 2>nul & del "%~f0"',
  )
  const tmp = await writeTempFile(lines.join('\r\n'), `drives_${Date.now().toString(36)}`, 'bat')
  if (!tmp.ok || !tmp.path) return { ok: false, text: tmp.error }
  const cp = await copyToPublicDesktop(newHost, tmp.path, fileName)
  return { ok: cp.ok, text: cp.ok ? `„${fileName}" liegt auf dem Desktop von ${newHost} — der angemeldete Benutzer startet sie per Doppelklick.` : cp.error }
}

/** Modell-Typen (classifyModel), bei denen WLAN-Profile übernommen werden — Desktops
 *  haben keinen WLAN-Adapter, dort wird die Übernahme gar nicht erst angeboten. */
export const WLAN_KATEGORIEN = ['Laptop Standard', 'Laptop light', 'Laptop Workstation']
export function wlanSinnvoll(modelKategorie: string): boolean {
  return WLAN_KATEGORIEN.includes((modelKategorie || '').trim())
}

/**
 * WLAN-Profile vom Alt- aufs Neugerät. Erfolg heißt: Profile wurden tatsächlich
 * importiert — `SKIPPED:` (keine Profile / kein Adapter) galt früher fälschlich als
 * Erfolg und verdeckte, dass nichts passiert war.
 */
export async function transferWlan(oldHost: string, newHost: string): Promise<{ ok: boolean; text?: string }> {
  try {
    const r = await api().runPowerShell(psTransferWlanProfiles(oldHost, newHost), 60000)
    const t = (r.stdout || '').trim()
    if (/^ERR/i.test(t)) return { ok: false, text: t.replace(/^ERR:/i, '').slice(0, 300) }
    if (/^SKIPPED/i.test(t)) return { ok: false, text: t.replace(/^SKIPPED:/i, '').slice(0, 300) || 'nichts zu übertragen' }
    return { ok: /OK/.test(t), text: t.replace(/^OK:?/, '').trim().slice(0, 300) || 'Profile übernommen' }
  } catch (e) { return { ok: false, text: e instanceof Error ? e.message : String(e) } }
}

// ── Windows-Updates ────────────────────────────────────────────────────────────
export interface WinUpdate { title: string; kb: string; size: number }
export async function searchWindowsUpdates(host: string): Promise<{ ok: boolean; updates?: WinUpdate[]; text?: string }> {
  const up = await ensureWinRM(host)
  if (!up) return { ok: false, text: 'WinRM nicht erreichbar' }
  const inner = [
    `try {`,
    `  $sess = New-Object -ComObject Microsoft.Update.Session`,
    `  $res = $sess.CreateUpdateSearcher().Search("IsInstalled=0 and Type='Software'")`,
    `  @($res.Updates) | ForEach-Object { [pscustomobject]@{ title=[string]$_.Title; kb=(($_.KBArticleIDs) -join ','); size=[math]::Round((($_.MaxDownloadSize)/1MB),1) } }`,
    `} catch { [pscustomobject]@{ title='ERR:' + $_.Exception.Message; kb=''; size=0 } }`,
  ].join('\n')
  const script = `try { $o = Invoke-Command -ComputerName '${psq(host)}' -ErrorAction Stop -ScriptBlock { ${inner} }; $o | Select-Object title,kb,size | ConvertTo-Json -Compress -Depth 4 } catch { 'ERR:' + $_.Exception.Message }`
  try {
    const r = await api().runPowerShell(script, 120000)
    const t = (r.stdout ?? '').trim()
    if (!t || t.startsWith('ERR:')) return { ok: false, text: t.replace(/^ERR:/, '').trim() || 'keine Antwort' }
    const parsed = parseJson<WinUpdate[] | WinUpdate>(t)
    const arr = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    const err = arr.find(u => String(u.title).startsWith('ERR:'))
    if (err) return { ok: false, text: String(err.title).replace(/^ERR:/, '') }
    return { ok: true, updates: arr.map(u => ({ title: String(u.title || ''), kb: String(u.kb || ''), size: Number(u.size) || 0 })) }
  } catch (e) { return { ok: false, text: e instanceof Error ? e.message : String(e) } }
}
/** Installiert alle verfügbaren Updates (PSWindowsUpdate, Fallback UsoClient), ohne Auto-Neustart. */
export async function installWindowsUpdates(host: string): Promise<{ ok: boolean; text?: string }> {
  const up = await ensureWinRM(host)
  if (!up) return { ok: false, text: 'WinRM nicht erreichbar' }
  const inner = [
    `try {`,
    `  if (-not (Get-Module -ListAvailable PSWindowsUpdate)) {`,
    `    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12`,
    `    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Confirm:$false | Out-Null`,
    `    Install-Module PSWindowsUpdate -Force -SkipPublisherCheck -Confirm:$false -Scope AllUsers | Out-Null`,
    `  }`,
    `  Import-Module PSWindowsUpdate -ErrorAction Stop`,
    `  $r = Get-WindowsUpdate -AcceptAll -Install -IgnoreReboot -ErrorAction Stop`,
    `  'OK:' + (@($r).Count) + ' Update(s) verarbeitet'`,
    `} catch {`,
    `  try { Start-Process -FilePath 'UsoClient.exe' -ArgumentList 'StartInstall' -NoNewWindow; 'USO:Update-Installation angestossen (kein Detailergebnis)' } catch { 'ERR:' + $_.Exception.Message }`,
    `}`,
  ].join('\n')
  const r = await invoke(host, inner, 40 * 60 * 1000)
  if (!r.ok) return { ok: false, text: r.out }
  const out = r.out
  if (out.startsWith('OK:') || out.startsWith('USO:')) return { ok: true, text: out.replace(/^OK:|^USO:/, '') }
  return { ok: false, text: out.replace(/^ERR:/, '') || 'unbekanntes Ergebnis' }
}

// ── Neustart ───────────────────────────────────────────────────────────────────
export async function rebootHost(host: string): Promise<{ ok: boolean; text?: string }> {
  try {
    const r = await api().runPowerShell(`try { Restart-Computer -ComputerName '${psq(host)}' -Force -ErrorAction Stop; 'OK' } catch { 'ERR:' + $_.Exception.Message }`, 30000)
    const t = (r.stdout || '').trim()
    return t.includes('OK') ? { ok: true, text: 'Neustart ausgelöst' } : { ok: false, text: t.replace(/^ERR:/, '') || 'Neustart fehlgeschlagen' }
  } catch (e) { return { ok: false, text: e instanceof Error ? e.message : String(e) } }
}
