// ── Back-Up-Engine: robocopy, Remote-Ordner-Browser, native Windows-Aufgaben ──
// robocopy-Flags: inkrementell/additiv (nur neue/geaenderte Dateien, kein Loeschen).
// Ausfuehrung:
//   - Sofort ("Jetzt ausfuehren"): robocopy laeuft VOM ADMIN-PC (UNC-Quelle → UNC-Ziel),
//     als Hintergrund-Prozess; Fortschritt via Ziel-Dateizahl-Polling. Vermeidet das
//     Double-Hop-Credential-Problem (Admin-Rechte erreichen beide UNC-Enden direkt).
//   - Native Aufgabe (Ziel lokal): robocopy laeuft AUF dem PC (lokal→lokal, SYSTEM).

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import type { BackupJob } from './backups'

// ── Pfad-Helfer ───────────────────────────────────────────────────────────────

/** Einfache Anfuehrungszeichen fuer PowerShell-Single-Quote-Strings escapen. */
function q(s: string): string { return (s ?? '').replace(/'/g, "''") }

/** Absoluter lokaler Laufwerkspfad (C:\x\y)? */
export function isAbsoluteLocalPath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test((p ?? '').trim())
}

/**
 * Vollstaendiger lokaler Pfad (C:\x\y) → UNC-Admin-Share (\\target\C$\x\y).
 * WICHTIG: Gibt bei einem UNGUELTIGEN (nicht absoluten) Pfad einen LEEREN String
 * zurueck — niemals den Pfad unveraendert. Sonst wuerde robocopy einen relativen
 * Pfad ins Arbeitsverzeichnis der App schreiben (fataler Bug).
 */
export function localToUnc(target: string, localPath: string): string {
  const t = (target ?? '').trim()
  const m = /^([A-Za-z]):[\\/]?(.*)$/.exec((localPath ?? '').trim())
  if (!t || !m) return ''
  const drive = m[1].toUpperCase()
  const rest = m[2].replace(/\//g, '\\')
  return `\\\\${t}\\${drive}$\\${rest}`.replace(/\\+$/, '')
}

/** Laufwerksbuchstabe + Pfad zu vollem lokalen Pfad ('C', 'Backups\\x' → 'C:\\Backups\\x'). */
export function driveLocal(drive: string, sub: string): string {
  const d = (drive || 'C').replace(/[:$\\]/g, '').toUpperCase().slice(0, 1) || 'C'
  const s = (sub ?? '').replace(/^[\\/]+/, '')
  return s ? `${d}:\\${s}` : `${d}:\\`
}

/** Letzter Pfadbestandteil (Ordnername). */
function leafName(p: string): string {
  const parts = (p ?? '').replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || 'Ordner'
}

/** Ziel-Basis als vollstaendiger lokaler Pfad auf dem Ziel-PC. */
export function destBaseLocal(job: BackupJob): string {
  return job.dest.path || driveLocal(job.dest.drive, '')
}
/** Ziel-PC (bei lokalem Ziel = Quell-PC). */
export function destTargetOf(job: BackupJob): string {
  return job.dest.kind === 'network' ? (job.dest.target || '') : job.source.target
}

function normPathLower(p: string): string {
  return (p ?? '').trim().replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
}
/** Ist `child` gleich `parent` oder liegt darunter? */
function isUnderOrEqual(child: string, parent: string): boolean {
  const c = normPathLower(child), p = normPathLower(parent)
  if (!c || !p) return false
  return c === p || c.startsWith(p + '\\')
}
/**
 * Schutz: Quelle und Ziel duerfen sich auf DEMSELBEN PC nicht ueberschneiden.
 * Sonst koennte robocopy (v. a. mit /MIR) in ein Quell-Verzeichnis hineinschreiben
 * bzw. eine Schleife erzeugen. Bei getrennten PCs unmoeglich → kein Block.
 */
export function overlapError(job: BackupJob): string | null {
  const sameMachine = job.dest.kind === 'local'
    || (!!job.dest.target && normPathLower(job.dest.target) === normPathLower(job.source.target))
  if (!sameMachine) return null
  const dest = destBaseLocal(job)
  for (const sf of job.source.folders) {
    if (isUnderOrEqual(dest, sf) || isUnderOrEqual(sf, dest)) {
      return `Quelle und Ziel überschneiden sich (${sf} ↔ ${dest}). Bitte ein Ziel außerhalb der Quell-Ordner wählen.`
    }
  }
  return null
}

/**
 * Robocopy-Flags fuer den Job — AUSSCHLIESSLICH kopierend.
 * Die QUELLE wird nur gelesen und NIE veraendert: es gibt bewusst KEIN /MOV
 * bzw. /MOVE (das wuerde Quelldateien nach dem Kopieren loeschen). /MIR (Spiegeln)
 * loescht ggf. nur im ZIEL nicht mehr vorhandene Dateien — niemals in der Quelle.
 * /XJ = Junctions/Symlinks NICHT verfolgen (verhindert Endlosschleifen/ungewolltes
 * Kopieren ueber Verknuepfungen).
 */
function roboFlags(job: BackupJob): string {
  const base = '/FFT /XA:H /XJ /W:5 /R:2 /Z /MT:8'
  // Sicherheitsnetz: selbst wenn hier je etwas ergaenzt wuerde — quell-loeschende
  // Flags sind ausgeschlossen.
  const flags = (job.mirror ? `/MIR ${base}` : `/E ${base}`)
  return flags.split(/\s+/).filter(f => !/^\/(MOV|MOVE)$/i.test(f)).join(' ')
}

// ── Remote-Ordner-Browser (UNC – funktioniert auch per IP, ohne WinRM) ────────

export async function listRemoteDrives(target: string): Promise<string[]> {
  const script = [
    `$out=@()`,
    `foreach ($d in 'C','D','E','F','G','H','I') { try { if (Test-Path ('\\\\${q(target)}\\' + $d + '$')) { $out += $d } } catch {} }`,
    `$out -join ','`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 20000)
    return r.stdout.trim().split(',').map(s => s.trim()).filter(Boolean)
  } catch { return [] }
}

/** Listet Unterordner eines lokalen Pfads auf dem Ziel-PC (via UNC). */
export async function listRemoteDirs(target: string, localPath: string): Promise<{ ok: boolean; dirs: string[]; error?: string }> {
  const unc = localToUnc(target, localPath)
  const script = [
    `$p='${q(unc)}'`,
    `if (!(Test-Path $p)) { Write-Output 'NOTFOUND'; exit 0 }`,
    `$dirs=@()`,
    `try { foreach ($d in [System.IO.Directory]::EnumerateDirectories($p)) { $dirs += (Split-Path $d -Leaf) } } catch { Write-Output ('ERR:' + $_.Exception.Message); exit 0 }`,
    `$dirs -join "\`n"`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 30000)
    const out = r.stdout.trim()
    if (out === 'NOTFOUND') return { ok: false, dirs: [], error: 'Pfad nicht erreichbar' }
    if (out.startsWith('ERR:')) return { ok: false, dirs: [], error: out.slice(4) }
    const dirs = out ? out.split('\n').map(s => s.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'de')) : []
    return { ok: true, dirs }
  } catch (e) { return { ok: false, dirs: [], error: e instanceof Error ? e.message : String(e) } }
}

export async function createRemoteDir(target: string, localPath: string): Promise<{ ok: boolean; error?: string }> {
  const unc = localToUnc(target, localPath)
  const script = `try { New-Item -ItemType Directory -Force -Path '${q(unc)}' | Out-Null; 'OK' } catch { 'ERR:' + $_.Exception.Message }`
  try {
    const r = await api().runPowerShell(script, 20000)
    return r.stdout.includes('OK') ? { ok: true } : { ok: false, error: r.stdout.replace(/^ERR:/, '').trim() || 'Fehler' }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

/** Prueft Erreichbarkeit eines Ziels (Ping) + ob mind. ein Admin-Share da ist. */
export async function checkTargetReachable(target: string): Promise<{ ok: boolean; error?: string }> {
  const script = [
    `if (-not (Test-Connection -ComputerName '${q(target)}' -Count 1 -Quiet)) { Write-Output 'PING_FAIL'; exit 0 }`,
    `if (Test-Path '\\\\${q(target)}\\C$') { Write-Output 'OK' } else { Write-Output 'SHARE_FAIL' }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 15000)
    const o = r.stdout.trim()
    if (o.includes('OK')) return { ok: true }
    if (o.includes('PING_FAIL')) return { ok: false, error: 'PC nicht erreichbar (Ping fehlgeschlagen).' }
    return { ok: false, error: 'Admin-Freigabe (C$) nicht erreichbar — Rechte/Freigabe prüfen.' }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

// ── Sofort-Backup (Admin-PC, Hintergrund-Prozess + Fortschritts-Polling) ──────

export interface RunHandle { id: string; expectedFiles: number; destBaseUnc: string }

function buildRunScript(job: BackupJob, id: string): { script: string; destBaseUnc: string } {
  const destTarget = destTargetOf(job)
  const destBaseLocalPath = destBaseLocal(job)
  const destBaseUnc = localToUnc(destTarget, destBaseLocalPath)
  const flags = roboFlags(job)

  const lines: string[] = [
    `$ErrorActionPreference='Continue'`,
    // Sicheres Arbeitsverzeichnis — verhindert, dass ein (theoretisch) relativer
    // Pfad je ins App-Verzeichnis geschrieben wird.
    `try { Set-Location -LiteralPath $env:TEMP } catch {}`,
    `$log = Join-Path $env:TEMP '${id}.log'`,
    `$done = Join-Path $env:TEMP '${id}.done'`,
    `Remove-Item $log,$done -Force -EA SilentlyContinue`,
    `$roboExe = Join-Path $env:SystemRoot 'System32\\Robocopy.exe'`,
    `if (!(Test-Path $roboExe)) { $roboExe = Join-Path $env:SystemRoot 'Sysnative\\Robocopy.exe' }`,
    `$rcMax = 0`,
    `try { if (!(Test-Path '${q(destBaseUnc)}')) { New-Item -ItemType Directory -Force -Path '${q(destBaseUnc)}' | Out-Null } } catch {}`,
  ]
  const usedLeaves = new Set<string>()
  for (const folder of job.source.folders) {
    const srcUnc = localToUnc(job.source.target, folder)
    if (!srcUnc.startsWith('\\\\')) continue   // ungueltige Quelle -> ueberspringen
    let leaf = leafName(folder)
    if (usedLeaves.has(leaf.toLowerCase())) leaf = `${folder.slice(0, 1).toUpperCase()}_${leaf}`
    usedLeaves.add(leaf.toLowerCase())
    const dstUnc = `${destBaseUnc}\\${leaf}`
    lines.push(`"### ${q(srcUnc)} -> ${q(dstUnc)}" | Out-File -Append -Encoding UTF8 $log`)
    lines.push(`& $roboExe '${q(srcUnc)}' '${q(dstUnc)}' ${flags} >> $log 2>&1`)
    lines.push(`if ($LASTEXITCODE -gt $rcMax) { $rcMax = $LASTEXITCODE }`)
  }
  lines.push(`$res = if ($rcMax -lt 8) { 'OK' } else { 'ERR' }`)
  lines.push(`"RESULT:$res" | Out-File -Encoding UTF8 $done`)
  lines.push(`"RC:$rcMax" | Out-File -Append -Encoding UTF8 $done`)
  return { script: lines.join('\n'), destBaseUnc }
}

/** Startet ein Sofort-Backup als Hintergrund-Prozess auf dem Admin-PC. */
export async function startRunNow(job: BackupJob): Promise<{ ok: boolean; handle?: RunHandle; error?: string }> {
  // ── Strikte Pfad-Validierung — VERHINDERT relative/falsche Ziele ─────────────
  if (!job.source.target?.trim()) return { ok: false, error: 'Kein Quell-PC angegeben.' }
  const badFolder = job.source.folders.find(f => !isAbsoluteLocalPath(f))
  if (!job.source.folders.length) return { ok: false, error: 'Keine Quell-Ordner ausgewählt.' }
  if (badFolder) return { ok: false, error: `Ungültiger Quell-Ordner (voller Pfad mit Laufwerk nötig): ${badFolder}` }
  const destTarget = destTargetOf(job)
  if (!destTarget?.trim()) return { ok: false, error: job.dest.kind === 'network' ? 'Kein Ziel-PC angegeben.' : 'Kein Quell-PC angegeben.' }
  const destBasePath = destBaseLocal(job)
  if (!isAbsoluteLocalPath(destBasePath)) {
    return { ok: false, error: 'Ungültiger Zielordner — bitte einen vollständigen Pfad mit Laufwerk angeben (z. B. D:\\Backups\\PC01).' }
  }
  const destBaseUncCheck = localToUnc(destTarget, destBasePath)
  if (!destBaseUncCheck.startsWith('\\\\')) return { ok: false, error: 'Zielpfad konnte nicht als Netzwerkpfad aufgelöst werden.' }
  const ovl = overlapError(job)
  if (ovl) return { ok: false, error: ovl }

  const id = `itbackup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const { script, destBaseUnc } = buildRunScript(job, id)

  // Erwartete Dateizahl (Summe ueber alle Quell-Ordner) fuer den Fortschritt.
  let expectedFiles = 0
  try {
    const srcUncs = job.source.folders.map(f => localToUnc(job.source.target, f))
    const countScript = [
      `$c=0`,
      ...srcUncs.map(u => `try { $c += @([System.IO.Directory]::EnumerateFiles('${q(u)}','*',[System.IO.SearchOption]::AllDirectories)).Count } catch {}`),
      `Write-Output ('CNT:' + $c)`,
    ].join('\n')
    const cr = await api().runPowerShell(countScript, 120000)
    const m = cr.stdout.match(/CNT:(\d+)/)
    if (m) expectedFiles = parseInt(m[1], 10) || 0
  } catch { /* Fortschritt dann nur nach kopierten Dateien */ }

  // Script auf den Admin-PC schreiben (Base64) + als Hintergrund-Prozess starten.
  const b64 = btoa(unescape(encodeURIComponent(script)))
  const startScript = [
    `$dir = $env:TEMP`,
    `$ps1 = Join-Path $dir '${id}_run.ps1'`,
    `$bytes = [System.Convert]::FromBase64String('${b64}')`,
    `$text = [System.Text.Encoding]::UTF8.GetString($bytes)`,
    `[System.IO.File]::WriteAllText($ps1, $text, [System.Text.Encoding]::UTF8)`,
    `Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$ps1 -WindowStyle Hidden`,
    `Write-Output 'STARTED'`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(startScript, 30000)
    if (!r.stdout.includes('STARTED')) return { ok: false, error: r.stderr || r.stdout || 'Start fehlgeschlagen' }
    return { ok: true, handle: { id, expectedFiles, destBaseUnc } }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

export interface RunProgress { done: boolean; copiedFiles: number; result?: 'success' | 'error'; rc?: number; error?: string }

/** Fragt den Fortschritt/Abschluss eines laufenden Sofort-Backups ab. */
export async function pollRunNow(handle: RunHandle): Promise<RunProgress> {
  const script = [
    `$done = Join-Path $env:TEMP '${handle.id}.done'`,
    `if (Test-Path $done) { Write-Output 'DONE'; Get-Content $done -Raw }`,
    `else { $c=0; try { $c=@([System.IO.Directory]::EnumerateFiles('${q(handle.destBaseUnc)}','*',[System.IO.SearchOption]::AllDirectories)).Count } catch {}; Write-Output ('PROG:' + $c) }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 30000)
    const out = r.stdout
    if (out.includes('DONE')) {
      const rc = parseInt(out.match(/RC:(\d+)/)?.[1] ?? '0', 10)
      const ok = /RESULT:OK/.test(out)
      return { done: true, copiedFiles: handle.expectedFiles, result: ok ? 'success' : 'error', rc, error: ok ? undefined : `robocopy Exit-Code ${rc}` }
    }
    const c = parseInt(out.match(/PROG:(\d+)/)?.[1] ?? '0', 10)
    return { done: false, copiedFiles: c }
  } catch (e) { return { done: false, copiedFiles: 0, error: e instanceof Error ? e.message : String(e) } }
}

// ── Native Windows-Aufgabe (Ziel lokal, laeuft autonom auf dem PC) ────────────

export function nativeTaskName(job: BackupJob): string { return job.nativeTaskName || `ITAdminBackup_${job.id}` }

function buildLocalTaskScript(job: BackupJob, logPath: string): string {
  const flags = roboFlags(job)
  const destBase = destBaseLocal(job)
  const lines: string[] = [
    `$ErrorActionPreference='Continue'`,
    `try { Set-Location -LiteralPath $env:TEMP } catch {}`,
    `$log='${q(logPath)}'`,
    `"[" + (Get-Date -Format o) + "] Backup Start" | Out-File -Encoding UTF8 $log`,
    `$roboExe = Join-Path $env:SystemRoot 'System32\\Robocopy.exe'`,
    `if (!(Test-Path $roboExe)) { $roboExe = Join-Path $env:SystemRoot 'Sysnative\\Robocopy.exe' }`,
    `try { if (!(Test-Path '${q(destBase)}')) { New-Item -ItemType Directory -Force -Path '${q(destBase)}' | Out-Null } } catch {}`,
  ]
  const usedLeaves = new Set<string>()
  for (const folder of job.source.folders) {
    if (!isAbsoluteLocalPath(folder)) continue
    let leaf = leafName(folder)
    if (usedLeaves.has(leaf.toLowerCase())) leaf = `${folder.slice(0, 1).toUpperCase()}_${leaf}`
    usedLeaves.add(leaf.toLowerCase())
    const dst = `${destBase}\\${leaf}`
    lines.push(`& $roboExe '${q(folder)}' '${q(dst)}' ${flags} >> $log 2>&1`)
  }
  lines.push(`"[" + (Get-Date -Format o) + "] Backup Ende (RC=$LASTEXITCODE)" | Out-File -Append -Encoding UTF8 $log`)
  return lines.join('\n')
}

function buildTriggerPs(job: BackupJob): string {
  const s = job.schedule
  if (!s) return `New-ScheduledTaskTrigger -Daily -At '08:00'`
  const time = s.time || '08:00'
  if (s.type === 'once' && s.date) {
    return `New-ScheduledTaskTrigger -Once -At '${q(s.date)}T${q(time)}:00'`
  }
  if (s.type === 'recurring' && s.repeat === 'weekly') {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const days = (s.days && s.days.length ? s.days : [1]).map(d => names[d]).filter(Boolean)
    return `New-ScheduledTaskTrigger -Weekly -DaysOfWeek ${days.join(',')} -At '${q(time)}'`
  }
  return `New-ScheduledTaskTrigger -Daily -At '${q(time)}'`
}

/** Registriert die native Aufgabe auf dem (Quell-=Ziel-)PC. Nur fuer lokales Ziel. */
export async function registerNativeTask(job: BackupJob): Promise<{ ok: boolean; error?: string }> {
  // Strikte Validierung: nur absolute Laufwerkspfade (sonst wuerde die Aufgabe
  // relativ ins Arbeitsverzeichnis schreiben).
  if (!isAbsoluteLocalPath(destBaseLocal(job))) return { ok: false, error: 'Ungültiger Zielordner — voller Pfad mit Laufwerk nötig (z. B. D:\\Backups).' }
  if (!job.source.folders.length || job.source.folders.some(f => !isAbsoluteLocalPath(f))) return { ok: false, error: 'Ungültige Quell-Ordner — voller Pfad mit Laufwerk nötig.' }
  const ovl = overlapError(job)
  if (ovl) return { ok: false, error: ovl }
  const host = job.source.target
  const taskName = nativeTaskName(job)
  const ps1Path = `C:\\Windows\\Temp\\${taskName}.ps1`
  const logPath = `C:\\Windows\\Temp\\${taskName}.log`
  const taskScript = buildLocalTaskScript(job, logPath)
  const b64 = btoa(unescape(encodeURIComponent(taskScript)))

  try { await ensureWinRM(host) } catch { /* egal */ }

  // 1) Script per UNC auf den PC schreiben
  const uncPs1 = `\\\\${host}\\C$\\Windows\\Temp\\${taskName}.ps1`
  const writeScript = [
    `$bytes=[System.Convert]::FromBase64String('${b64}')`,
    `$text=[System.Text.Encoding]::UTF8.GetString($bytes)`,
    `[System.IO.File]::WriteAllText('${q(uncPs1)}', $text, [System.Text.Encoding]::UTF8)`,
    `if (Test-Path '${q(uncPs1)}') { 'OK' } else { 'ERR' }`,
  ].join('\n')
  try {
    const w = await api().runPowerShell(writeScript, 30000)
    if (!w.stdout.includes('OK')) return { ok: false, error: 'Skript konnte nicht auf den PC geschrieben werden (Admin-Share?).' }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }

  // 2) Aufgabe registrieren (SYSTEM, StartWhenAvailable = verpasste Laeufe nachholen)
  const trigger = buildTriggerPs(job)
  const regScript = [
    `Invoke-Command -ComputerName '${q(host)}' -ScriptBlock {`,
    `  param($tn,$ps1)`,
    `  $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -File "' + $ps1 + '"')`,
    `  $t = ${trigger}`,
    `  $p = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest -LogonType ServiceAccount`,
    `  $s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable`,
    `  Register-ScheduledTask -TaskName $tn -Action $a -Trigger $t -Principal $p -Settings $s -Force | Out-Null`,
    `  'OK'`,
    `} -ArgumentList '${q(taskName)}','${q(ps1Path)}' -EA Stop`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(regScript, 40000)
    if (r.stdout.includes('OK')) return { ok: true }
    return { ok: false, error: (r.stdout || r.stderr || 'Registrierung fehlgeschlagen').trim() }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

export async function unregisterNativeTask(job: BackupJob): Promise<{ ok: boolean; error?: string }> {
  const host = job.source.target
  const taskName = nativeTaskName(job)
  try { await ensureWinRM(host) } catch { /* egal */ }
  const script = [
    `Invoke-Command -ComputerName '${q(host)}' -ScriptBlock {`,
    `  param($tn)`,
    `  Unregister-ScheduledTask -TaskName $tn -Confirm:$false -EA SilentlyContinue`,
    `  Remove-Item ('C:\\Windows\\Temp\\' + $tn + '.ps1') -Force -EA SilentlyContinue`,
    `  'OK'`,
    `} -ArgumentList '${q(taskName)}' -EA SilentlyContinue`,
  ].join('\n')
  try { await api().runPowerShell(script, 30000); return { ok: true } }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

export interface NativeTaskInfo { exists: boolean; state?: string; lastRun?: string; nextRun?: string; lastResult?: number }

/** Liest Live-Status der nativen Aufgabe vom PC. */
export async function queryNativeTask(job: BackupJob): Promise<NativeTaskInfo> {
  const host = job.source.target
  const taskName = nativeTaskName(job)
  const script = [
    `Invoke-Command -ComputerName '${q(host)}' -ScriptBlock {`,
    `  param($tn)`,
    `  $t = Get-ScheduledTask -TaskName $tn -EA SilentlyContinue`,
    `  if (-not $t) { '{"exists":false}'; return }`,
    `  $i = $t | Get-ScheduledTaskInfo`,
    `  @{ exists=$true; state=[string]$t.State; lastRun=[string]$i.LastRunTime; nextRun=[string]$i.NextRunTime; lastResult=$i.LastTaskResult } | ConvertTo-Json -Compress`,
    `} -ArgumentList '${q(taskName)}' -EA SilentlyContinue`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 25000)
    const m = r.stdout.match(/\{.*\}/s)
    if (!m) return { exists: false }
    const j = JSON.parse(m[0]) as NativeTaskInfo
    return j
  } catch { return { exists: false } }
}
