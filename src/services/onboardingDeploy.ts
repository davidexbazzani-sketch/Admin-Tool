// ── Onboarding-Deployment ─────────────────────────────────────────────────────
// Verteilt die generierte Onboarding-HTML auf den PUBLIC DESKTOP des
// Mitarbeiter-PCs. Ablauf (jeder Schritt einzeln, UI zeigt den Fortschritt):
//   1. DNS-Check (nslookup: Forward-Lookup + PTR-Gegenprobe — veralteter
//      DNS-Eintrag wuerde sonst den FALSCHEN PC treffen!)
//   2. Erreichbarkeit: Ping → SMB 445 → RPC 135 (Muster wie Remote Doc)
//   3. WinRM aktivieren wie Remote Doc (ensureWinRM; bei IP TrustedHosts).
//      Nicht fatal — die Kopie selbst laeuft ueber SMB (\\host\c$).
//   4. HTML lokal in %TEMP% schreiben
//   5. Copy-Item nach \\<host>\c$\Users\Public\Desktop\
//   6. Verifizieren per Test-Path (+ Groesse), Temp-Datei aufraeumen
//
// Voraussetzung: Der angemeldete Benutzer hat Admin-Rechte auf dem Ziel-PC
// (c$-Freigabe) — gleiche Anforderung wie bei Remote Doc.

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import { ensureWinRmTrustedHost, isIpv4 } from '../utils/remoteTarget'
import type { FolderLink } from './onboarding'

export const DESKTOP_FILENAME = 'Willkommen bei SKF Marine.html'
export const BAT_FILENAME = 'Laufwerk I verbinden.bat'

// Ziel-Layout auf dem Mitarbeiter-PC:
//   C:\Users\Public\SKF Onboarding\   → HTML + skf.ico (unauffaellig abgelegt)
//   C:\Users\Public\Desktop\          → Verknuepfung (.url, SKF-Logo-Icon!) + Laufwerk-I-Bat
// Eine .html auf dem Desktop bekaeme immer das Edge-Symbol — nur eine
// Verknuepfung kann ein eigenes Icon (IconFile) tragen.
export const TARGET_SUBDIR = 'SKF Onboarding'
export const SHORTCUT_FILENAME = 'Willkommen bei SKF Marine.url'
export const ICON_FILENAME = 'skf.ico'

// ── "Ordner im Explorer oeffnen" (Protokoll-Handler skf-ordner:) ──────────────
// Browser duerfen den Explorer nicht direkt starten. Loesung: Das Tool verteilt
// eine kleine Handler-VBS und registriert das Protokoll skf-ordner: auf dem
// Ziel-PC. SICHERHEIT: Der Link traegt nur einen INDEX — die Pfade stehen
// ausschliesslich in der VBS (fest einkompilierte Liste). Fremde Webseiten
// koennen darueber also keine beliebigen Pfade oeffnen.

export const FOLDER_VBS_FILENAME = 'open-folder.vbs'
export const FOLDER_PROTOCOL = 'skf-ordner'

/** Handler-VBS mit fest einkompilierter Ordnerliste. Wird als UTF-16 LE + BOM
 *  geschrieben (wscript liest .vbs sonst als ANSI — Umlaute in Pfaden!). */
export function buildOpenFolderVbs(folderLinks: FolderLink[]): string {
  const items = folderLinks.map(f => '"' + (f.path || '').trim().replace(/"/g, '') + '"').join(', _\r\n  ')
  return [
    `' SKF Onboarding — oeffnet freigegebene Ordner im Explorer (Protokoll ${FOLDER_PROTOCOL}:)`,
    `' Es sind NUR die unten einkompilierten Pfade erreichbar (Index-basiert).`,
    'On Error Resume Next',
    'Dim paths',
    folderLinks.length > 0 ? 'paths = Array( _\r\n  ' + items + ')' : 'paths = Array()',
    'If WScript.Arguments.Count < 1 Then WScript.Quit 0',
    'Dim arg : arg = WScript.Arguments(0)',
    `' Argument kommt als "${FOLDER_PROTOCOL}:<index>" (evtl. mit abschliessendem /)`,
    'Dim idxStr : idxStr = arg',
    `If InStr(LCase(idxStr), "${FOLDER_PROTOCOL}:") = 1 Then idxStr = Mid(idxStr, ${FOLDER_PROTOCOL.length + 2})`,
    'idxStr = Replace(Replace(idxStr, "/", ""), "\\", "")',
    'If Not IsNumeric(idxStr) Then WScript.Quit 0',
    'Dim idx : idx = CInt(idxStr)',
    'If idx < 0 Or idx > UBound(paths) Then WScript.Quit 0',
    'Dim sh : Set sh = CreateObject("WScript.Shell")',
    'sh.Run "explorer.exe """ & paths(idx) & """", 1, False',
    '',
  ].join('\r\n')
}

/**
 * Registriert das Protokoll skf-ordner: auf dem Ziel-PC (HKLM, gilt fuer alle
 * Benutzer). Laeuft ueber WinRM (Invoke-Command) — WinRM wurde von der
 * Pipeline bereits aktiviert. Idempotent (reg add /f).
 */
export async function registerFolderProtocol(hostname: string): Promise<{ ok: boolean; message?: string }> {
  const h = psq(hostname.trim())
  // Bewusst der PS-Registry-Provider statt reg.exe: alle Werte bleiben in
  // Single-Quotes — kein Escaping-Problem mit den Anfuehrungszeichen im Command.
  const key = `HKLM:\\Software\\Classes\\${FOLDER_PROTOCOL}`
  const cmdValue = `wscript.exe //B "C:\\Users\\Public\\${TARGET_SUBDIR}\\${FOLDER_VBS_FILENAME}" "%1"`
  const script = [
    `try {`,
    `  Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock {`,
    `    New-Item -Path '${key}\\shell\\open\\command' -Force | Out-Null`,
    `    Set-Item -Path '${key}' -Value 'URL:SKF Ordner'`,
    `    Set-ItemProperty -Path '${key}' -Name 'URL Protocol' -Value ''`,
    `    Set-Item -Path '${key}\\shell\\open\\command' -Value '${cmdValue}'`,
    `  }`,
    `  @{ ok = $true } | ConvertTo-Json -Compress`,
    `} catch { @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress }`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 45000)
    const p = parseJson<{ ok: boolean; error?: string }>(res.stdout)
    if (!p) return { ok: false, message: res.stderr?.trim() || 'Keine Antwort bei der Registrierung' }
    return p.ok ? { ok: true } : { ok: false, message: p.error || 'reg add fehlgeschlagen' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Registrierung fehlgeschlagen' }
  }
}

/** Inhalt der Desktop-Verknuepfung (.url, INI-Format) mit SKF-Icon. */
export function buildShortcutUrlFile(): string {
  return [
    '[InternetShortcut]',
    `URL=file:///C:/Users/Public/${TARGET_SUBDIR.replace(/ /g, '%20')}/${DESKTOP_FILENAME.replace(/ /g, '%20')}`,
    `IconFile=C:\\Users\\Public\\${TARGET_SUBDIR}\\${ICON_FILENAME}`,
    'IconIndex=0',
    '',
  ].join('\r\n')
}

/**
 * Baut die Laufwerk-I-Bat, die MIT auf den Public Desktop kopiert wird.
 * Browser fuehren .bat-Links nie aus (zeigen nur den Inhalt) — die Datei direkt
 * auf dem Desktop ist der einzige zuverlaessige Ein-Klick-Weg.
 */
export function buildDriveMappingBat(manualCommand: string): string {
  const cmd = (manualCommand || '').trim().replace(/^net(\.exe)?\s+/i, 'C:\\Windows\\System32\\net.exe ')
  return [
    '@echo off',
    'C:\\Windows\\System32\\net.exe use I: /delete /yes 2>nul',
    cmd || 'C:\\Windows\\System32\\net.exe use I: "\\\\W3172\\SKF Marine" /persistent:no',
    'echo.',
    'echo Laufwerk I: wurde verbunden - du findest es jetzt im Explorer.',
    'pause',
    '',
  ].join('\r\n')
}

function psq(s: string): string { return s.replace(/'/g, "''") }

function parseJson<T>(stdout: string): T | null {
  try {
    const line = (stdout || '').split(/\r?\n/).map(l => l.trim()).filter(l => l.startsWith('{')).pop()
    return line ? JSON.parse(line) as T : null
  } catch { return null }
}

// ── 1) DNS ────────────────────────────────────────────────────────────────────

export interface DnsCheckResult {
  ok: boolean
  ip?: string
  reverse?: string
  mismatch?: boolean   // PTR zeigt auf einen ANDEREN Hostnamen -> Warnung
  error?: string
}

export async function checkDns(hostname: string): Promise<DnsCheckResult> {
  const h = psq(hostname.trim())
  // IP direkt eingegeben -> Forward-Lookup entfaellt, nur PTR zur Info
  if (isIpv4(hostname)) {
    const script = [
      `$rev = ''`,
      `try { $rev = (Resolve-DnsName -Name '${h}' -Type PTR -EA Stop | Select-Object -First 1).NameHost } catch {}`,
      `@{ ok = $true; ip = '${h}'; reverse = [string]$rev } | ConvertTo-Json -Compress`,
    ].join('\n')
    const res = await api().runPowerShell(script, 15000)
    const p = parseJson<{ ok: boolean; ip: string; reverse: string }>(res.stdout)
    return p ? { ok: true, ip: p.ip, reverse: p.reverse || undefined } : { ok: true, ip: hostname }
  }
  const script = [
    `$r = Resolve-DnsName -Name '${h}' -Type A -ErrorAction SilentlyContinue`,
    `if (-not $r) { @{ ok = $false } | ConvertTo-Json -Compress; exit }`,
    `$ip = (@($r | Where-Object { $_.IPAddress }) | Select-Object -First 1).IPAddress`,
    `$rev = ''`,
    `try { $rev = (Resolve-DnsName -Name $ip -Type PTR -EA Stop | Select-Object -First 1).NameHost } catch {}`,
    `@{ ok = $true; ip = [string]$ip; reverse = [string]$rev } | ConvertTo-Json -Compress`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 15000)
    const p = parseJson<{ ok: boolean; ip?: string; reverse?: string }>(res.stdout)
    if (!p || !p.ok) return { ok: false, error: 'Hostname nicht im DNS gefunden (nslookup fehlgeschlagen).' }
    const rev = (p.reverse || '').toLowerCase()
    const mismatch = !!rev && !rev.startsWith(hostname.trim().toLowerCase())
    return { ok: true, ip: p.ip, reverse: p.reverse || undefined, mismatch }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'DNS-Prüfung fehlgeschlagen' }
  }
}

// ── 2) Erreichbarkeit (Ping → SMB 445 → RPC 135, wie Remote Doc) ─────────────

export interface ReachResult {
  online: boolean
  method?: string
  error?: string
}

export async function checkReachability(hostname: string): Promise<ReachResult> {
  const h = psq(hostname.trim())
  const script = [
    `$online = $false; $m = 'none'`,
    `try { if (Test-Connection -ComputerName '${h}' -Count 1 -Quiet -EA SilentlyContinue) { $online = $true; $m = 'Ping' } } catch {}`,
    `if (-not $online) { try { $t = New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync('${h}', 445).Wait(2000)) { $online = $true; $m = 'SMB' }; $t.Close() } catch {} }`,
    `if (-not $online) { try { $t = New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync('${h}', 135).Wait(2000)) { $online = $true; $m = 'RPC' }; $t.Close() } catch {} }`,
    `@{ online = $online; method = $m } | ConvertTo-Json -Compress`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 20000)
    const p = parseJson<{ online: boolean; method: string }>(res.stdout)
    if (!p) return { online: false, error: 'Keine Antwort von der Prüfung' }
    return { online: p.online, method: p.method !== 'none' ? p.method : undefined }
  } catch (e) {
    return { online: false, error: e instanceof Error ? e.message : 'Erreichbarkeits-Prüfung fehlgeschlagen' }
  }
}

// ── 3) WinRM (wie Remote Doc; nicht fatal) ────────────────────────────────────

export async function enableWinRM(hostname: string): Promise<{ ok: boolean; message?: string }> {
  try {
    if (isIpv4(hostname)) {
      const th = await ensureWinRmTrustedHost(hostname)
      if (!th.ok) return { ok: false, message: th.message }
    }
    const ok = await ensureWinRM(hostname.trim())
    return ok ? { ok: true } : { ok: false, message: 'WinRM konnte nicht gestartet werden' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'WinRM-Aktivierung fehlgeschlagen' }
  }
}

// ── 4) HTML in %TEMP% schreiben ───────────────────────────────────────────────

let tempDirCache = ''

async function getTempDir(): Promise<string> {
  if (tempDirCache) return tempDirCache
  const res = await api().runPowerShell(`[System.IO.Path]::GetTempPath()`, 10000)
  const dir = (res.stdout || '').trim().split(/\r?\n/).pop() || ''
  if (!dir) throw new Error('Temp-Verzeichnis nicht ermittelbar')
  tempDirCache = dir.replace(/[\\/]+$/, '')
  return tempDirCache
}

function htmlToBase64(html: string): string {
  const bytes = new TextEncoder().encode(html)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

export async function writeTempFile(content: string, marker: string, ext: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const dir = await getTempDir()
    const safe = (marker || 'onboarding').replace(/[^A-Za-z0-9_-]/g, '_')
    const path = `${dir}\\onboarding_${safe}_${Date.now().toString(36)}.${ext}`
    const r = await api().writeFile(path, htmlToBase64(content))
    if (!r.success) return { ok: false, error: r.error || 'Temp-Datei konnte nicht geschrieben werden' }
    return { ok: true, path }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Temp-Datei fehlgeschlagen' }
  }
}

export function writeTempHtml(html: string, marker: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  return writeTempFile(html, marker, 'html')
}

/** VBS-Temp als UTF-16 LE + BOM (wscript liest .vbs sonst als ANSI — Umlaute!). */
export async function writeTempFileUtf16(content: string, marker: string, ext: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const dir = await getTempDir()
    const safe = (marker || 'onboarding').replace(/[^A-Za-z0-9_-]/g, '_')
    const path = `${dir}\\onboarding_${safe}_${Date.now().toString(36)}.${ext}`
    const text = '﻿' + content
    const bytes = new Uint8Array(text.length * 2)
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i)
      bytes[i * 2] = c & 0xff
      bytes[i * 2 + 1] = c >> 8
    }
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    const r = await api().writeFile(path, btoa(bin))
    if (!r.success) return { ok: false, error: r.error || 'Temp-Datei konnte nicht geschrieben werden' }
    return { ok: true, path }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Temp-Datei fehlgeschlagen' }
  }
}

/** Binaerdatei (bereits Base64) in %TEMP% schreiben (z. B. skf.ico). */
export async function writeTempBinary(base64: string, marker: string, ext: string): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const dir = await getTempDir()
    const safe = (marker || 'onboarding').replace(/[^A-Za-z0-9_-]/g, '_')
    const path = `${dir}\\onboarding_${safe}_${Date.now().toString(36)}.${ext}`
    const r = await api().writeFile(path, base64)
    if (!r.success) return { ok: false, error: r.error || 'Temp-Datei konnte nicht geschrieben werden' }
    return { ok: true, path }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Temp-Datei fehlgeschlagen' }
  }
}

// ── 5) Kopieren auf den Public Desktop ────────────────────────────────────────

export function publicDesktopPath(hostname: string, filename = DESKTOP_FILENAME): string {
  return `\\\\${hostname.trim()}\\c$\\Users\\Public\\Desktop\\${filename}`
}

export async function copyToPublicDesktop(
  hostname: string, tempPath: string, filename = DESKTOP_FILENAME,
): Promise<{ ok: boolean; error?: string }> {
  const dest = psq(publicDesktopPath(hostname, filename))
  const src = psq(tempPath)
  const script = [
    `try {`,
    `  Copy-Item -LiteralPath '${src}' -Destination '${dest}' -Force -ErrorAction Stop`,
    `  @{ ok = $true } | ConvertTo-Json -Compress`,
    `} catch { @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress }`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 45000)
    const p = parseJson<{ ok: boolean; error?: string }>(res.stdout)
    if (!p) return { ok: false, error: res.stderr?.trim() || 'Keine Antwort beim Kopieren' }
    if (!p.ok) {
      const err = p.error || 'Kopieren fehlgeschlagen'
      const hint = /denied|verweigert|zugriff/i.test(err)
        ? ' — Zugriff auf \\\\' + hostname + '\\c$ braucht Admin-Rechte auf dem Ziel-PC.'
        : ''
      return { ok: false, error: err + hint }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Kopieren fehlgeschlagen' }
  }
}

// ── Dashboard-Dateien kopieren (HTML+Icon in den Ordner, Verknuepfung auf den Desktop) ──

export function targetDirPath(hostname: string): string {
  return `\\\\${hostname.trim()}\\c$\\Users\\Public\\${TARGET_SUBDIR}`
}

export async function copyDashboardFiles(
  hostname: string,
  temps: { html: string; ico?: string; url: string; vbs?: string },
): Promise<{ ok: boolean; error?: string }> {
  const dir = psq(targetDirPath(hostname))
  const desktop = psq(`\\\\${hostname.trim()}\\c$\\Users\\Public\\Desktop`)
  const script = [
    `try {`,
    `  New-Item -ItemType Directory -Force -Path '${dir}' | Out-Null`,
    `  Copy-Item -LiteralPath '${psq(temps.html)}' -Destination '${dir}\\${psq(DESKTOP_FILENAME)}' -Force -ErrorAction Stop`,
    temps.ico ? `  Copy-Item -LiteralPath '${psq(temps.ico)}' -Destination '${dir}\\${ICON_FILENAME}' -Force -ErrorAction Stop` : '',
    temps.vbs ? `  Copy-Item -LiteralPath '${psq(temps.vbs)}' -Destination '${dir}\\${FOLDER_VBS_FILENAME}' -Force -ErrorAction Stop` : '',
    `  Copy-Item -LiteralPath '${psq(temps.url)}' -Destination '${desktop}\\${psq(SHORTCUT_FILENAME)}' -Force -ErrorAction Stop`,
    // Alt-Deployment aufraeumen: HTML direkt auf dem Desktop (hatte Edge-Symbol)
    `  Remove-Item -LiteralPath '${desktop}\\${psq(DESKTOP_FILENAME)}' -Force -ErrorAction SilentlyContinue`,
    `  @{ ok = $true } | ConvertTo-Json -Compress`,
    `} catch { @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress }`,
  ].filter(Boolean).join('\n')
  try {
    const res = await api().runPowerShell(script, 60000)
    const p = parseJson<{ ok: boolean; error?: string }>(res.stdout)
    if (!p) return { ok: false, error: res.stderr?.trim() || 'Keine Antwort beim Kopieren' }
    if (!p.ok) {
      const err = p.error || 'Kopieren fehlgeschlagen'
      const hint = /denied|verweigert|zugriff/i.test(err)
        ? ' — Zugriff auf \\\\' + hostname + '\\c$ braucht Admin-Rechte auf dem Ziel-PC.'
        : ''
      return { ok: false, error: err + hint }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Kopieren fehlgeschlagen' }
  }
}

// ── 6) Verifizieren + Aufraeumen ──────────────────────────────────────────────

export async function verifyDeployed(
  hostname: string,
): Promise<{ ok: boolean; sizeKb?: number; error?: string }> {
  const htmlPath = psq(`${targetDirPath(hostname)}\\${DESKTOP_FILENAME}`)
  const urlPath = psq(publicDesktopPath(hostname, SHORTCUT_FILENAME))
  const script = [
    `$html = Test-Path -LiteralPath '${htmlPath}'`,
    `$url = Test-Path -LiteralPath '${urlPath}'`,
    `$size = 0`,
    `if ($html) { $size = (Get-Item -LiteralPath '${htmlPath}').Length }`,
    `@{ html = $html; url = $url; size = $size } | ConvertTo-Json -Compress`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 20000)
    const p = parseJson<{ html: boolean; url: boolean; size?: number }>(res.stdout)
    if (!p) return { ok: false, error: 'Keine Antwort bei der Verifikation' }
    if (!p.html) return { ok: false, error: 'HTML liegt NICHT im Zielordner (Test-Path negativ).' }
    if (!p.url) return { ok: false, error: 'HTML liegt im Zielordner, aber die Desktop-Verknüpfung fehlt.' }
    return { ok: true, sizeKb: p.size ? Math.round(p.size / 1024) : undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Verifikation fehlgeschlagen' }
  }
}

/**
 * Schneller Status fuer die Uebersicht: Liegt das Dashboard auf dem PC?
 * Prueft erst SMB 445 (1,5 s) — offline-PCs blockieren so keine langen
 * SMB-Timeouts — dann neue Ablage (Ordner) ODER Alt-Deployment (Desktop-HTML).
 */
export type DesktopStatus = 'present' | 'missing' | 'offline'

export async function checkDesktopStatus(hostname: string): Promise<DesktopStatus> {
  const h = psq(hostname.trim())
  const newPath = psq(`${targetDirPath(hostname)}\\${DESKTOP_FILENAME}`)
  const legacy = psq(publicDesktopPath(hostname, DESKTOP_FILENAME))
  const script = [
    `$up = $false`,
    `try { $t = New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync('${h}', 445).Wait(1500)) { $up = $true }; $t.Close() } catch {}`,
    `if (-not $up) { @{ status = 'offline' } | ConvertTo-Json -Compress; exit }`,
    `if ((Test-Path -LiteralPath '${newPath}') -or (Test-Path -LiteralPath '${legacy}')) { @{ status = 'present' } | ConvertTo-Json -Compress }`,
    `else { @{ status = 'missing' } | ConvertTo-Json -Compress }`,
  ].join('\n')
  try {
    const res = await api().runPowerShell(script, 20000)
    const p = parseJson<{ status: DesktopStatus }>(res.stdout)
    return p?.status ?? 'offline'
  } catch { return 'offline' }
}

export async function cleanupTemp(tempPath: string): Promise<void> {
  try {
    await api().runPowerShell(`Remove-Item -LiteralPath '${psq(tempPath)}' -Force -EA SilentlyContinue`, 10000)
  } catch { /* best effort */ }
}
