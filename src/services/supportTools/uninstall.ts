// ── Support Tools · Deinstallation ───────────────────────────────────────────
// Komplettes Entfernen eines Programms auf einem Remote-PC (WinRM/Invoke-Command):
//   1) scanPrograms   – installierte Programme lesen (Uninstall-Registry HKLM/WOW/HKCU)
//   2) previewUninstall– VOR der Bestätigung anzeigen, WAS entfernt wird
//      (Deinstaller-Befehl + Ordner + Registry-Reste + Dienste + Aufgaben + Verknüpfungen)
//   3) runUninstall    – Deinstaller silent ausführen + ausgewählte Reste löschen
//      (mit Sicherheits-Schutzschranken gegen System-/Root-Pfade), Ergebnis protokollieren.
// Alle Schritte read-only außer runUninstall (bewusst opt-in, nach Vorschau + Bestätigung).

import { api } from '../../electronAPI'
import { ensureWinRM } from '../../utils/winrmUtils'
import { logDeviceAction } from '../deviceDossier'

export type Hive = 'machine' | 'machine32' | 'user'

export interface InstalledProgram {
  name: string
  version: string
  publisher: string
  uninstall: string
  quiet: string
  install: string
  child: string          // Registry-Schlüssel-Leaf (MSI-GUID o. Ä.)
  hive: Hive
  installDate?: string
}

export type RemovalKind = 'folder' | 'regkey' | 'service' | 'task' | 'shortcut'

export interface RemovalItem {
  kind: RemovalKind
  label: string
  path: string
  match: 'product' | 'publisher' | ''  // Treffer-Sicherheit (Produkt = sicher, Hersteller = evtl. geteilt)
  detail?: string
}

export interface UninstallPreview {
  ok: boolean
  uninstallCmd: string
  items: RemovalItem[]
  error?: string
}

export interface RemovalLogEntry { kind: string; label: string; ok: boolean; info?: string }

export interface UninstallReport {
  id: string
  host: string
  program: string
  version: string
  publisher: string
  ranAt: string
  ranBy: string
  uninstallRun: boolean
  uninstallOk: boolean
  log: RemovalLogEntry[]
}

export interface UninstallIndexEntry {
  id: string; host: string; program: string; version: string
  ranAt: string; ranBy: string; ok: number; total: number; pfad: string
}

const STORE_DIR = 'support-tools/uninstalls'
const STORE_INDEX = `${STORE_DIR}/index.json`

// ── Hilfen ───────────────────────────────────────────────────────────────────
function asArr<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : v == null ? [] : [v as T] }

function b64(s: string): string {
  // UTF-8 sicher nach Base64 (Payload für Invoke-Command -ArgumentList).
  return btoa(unescape(encodeURIComponent(s)))
}

function extractTagged(stdout: string, tag: string): string {
  const i = stdout.lastIndexOf(tag)
  if (i < 0) throw new Error('Keine gültige Antwort vom Zielrechner (WinRM/Invoke-Command).')
  return stdout.slice(i + tag.length).trim()
}

/** Baut den runPowerShell-Befehl: Invoke-Command auf dem Ziel-PC, optionaler Base64-Payload. */
function buildCommand(host: string, innerLines: string[], sentinel: string, payloadB64: string | null): string {
  const hs = host.replace(/'/g, "''")
  const inner = innerLines.join('\n')
  const head = payloadB64 != null ? `$b64 = '${payloadB64}'\n` : ''
  const paramLine = payloadB64 != null ? '    param($b64)\n' : ''
  const argList = payloadB64 != null ? ' -ArgumentList $b64' : ''
  return `${head}try {
  $r = Invoke-Command -ComputerName '${hs}' -ScriptBlock {
${paramLine}${inner}
  }${argList} -EA Stop
  $r | ForEach-Object { "$_" }
} catch { '${sentinel}' + (@{ ok = $false; error = ("" + $_.Exception.Message) } | ConvertTo-Json -Compress) }`
}

// ── 1) Installierte Programme scannen ────────────────────────────────────────
const SCAN_INNER = [
  "$paths = @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')",
  "$out = New-Object System.Collections.ArrayList",
  "foreach ($pp in $paths) {",
  "  $hive = if ($pp -like 'HKCU*') { 'user' } elseif ($pp -like '*WOW6432Node*') { 'machine32' } else { 'machine' }",
  "  Get-ItemProperty $pp -EA SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {",
  "    if ($_.SystemComponent -eq 1) { return }",
  "    if ($_.ParentKeyName) { return }",
  "    if (\"$($_.ReleaseType)\" -match 'Update|Hotfix|Security') { return }",
  "    if ($_.DisplayName -match '^(KB[0-9]{6,}|Update for|Security Update|Hotfix for|Definition Update)') { return }",
  "    [void]$out.Add([pscustomobject]@{ name = \"$($_.DisplayName)\"; version = \"$($_.DisplayVersion)\"; publisher = \"$($_.Publisher)\"; uninstall = \"$($_.UninstallString)\"; quiet = \"$($_.QuietUninstallString)\"; install = \"$($_.InstallLocation)\"; child = \"$($_.PSChildName)\"; hive = $hive; installDate = \"$($_.InstallDate)\" })",
  "  }",
  "}",
  "'@@SWSCAN@@' + (@($out) | Sort-Object name | ConvertTo-Json -Depth 3 -Compress)",
]

export async function scanPrograms(host: string): Promise<{ ok: boolean; programs: InstalledProgram[]; error?: string; unreachable?: boolean }> {
  const h = host.trim()
  if (!h) return { ok: false, programs: [], error: 'Kein Hostname angegeben.' }
  if (!(await ensureWinRM(h))) return { ok: false, programs: [], error: `„${h}" ist nicht per WinRM erreichbar.`, unreachable: true }
  let res
  try { res = await api().runPowerShell(buildCommand(h, SCAN_INNER, '@@SWSCAN@@', null), 90000) }
  catch (e) { return { ok: false, programs: [], error: 'PowerShell-Fehler: ' + (e instanceof Error ? e.message : String(e)) } }
  let parsed: unknown
  try { parsed = JSON.parse(extractTagged(res.stdout || '', '@@SWSCAN@@')) }
  catch { return { ok: false, programs: [], error: 'Antwort vom Zielrechner nicht lesbar.' } }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && (parsed as { ok?: boolean }).ok === false) {
    return { ok: false, programs: [], error: (parsed as { error?: string }).error || 'Scan fehlgeschlagen.' }
  }
  const raw = asArr<InstalledProgram>(parsed)
  const seen = new Set<string>()
  const programs = raw.filter(p => {
    if (!p || !p.name) return false
    const k = `${p.name}|${p.version}|${p.hive}`
    if (seen.has(k)) return false
    seen.add(k); return true
  }).sort((a, b) => a.name.localeCompare(b.name, 'de'))
  return { ok: true, programs }
}

// ── 2) Vorschau: was wird entfernt? (read-only) ──────────────────────────────
const PREVIEW_INNER = [
  "$p = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json",
  "$stop = @('microsoft','corporation','corp','incorporated','software','gmbh','llc','ltd','limited','systems','system','group','the','and','version','edition','company','technologies','technology','solutions','install','installer','setup','program','programs','common','files','data','user','users','shared','update','updater','service','services')",
  "function Tok($s) { if (-not $s) { return @() } ; ($s -split '[^A-Za-z0-9]+') | Where-Object { $_.Length -ge 4 -and ($stop -notcontains $_.ToLower()) } | ForEach-Object { $_.ToLower() } | Select-Object -Unique }",
  "$prodTok = @(Tok $p.name)",
  "$pubTok = @(Tok $p.publisher)",
  "function MatchKind($name) { $n = \"$name\".ToLower(); foreach ($t in $prodTok) { if ($n.Contains($t)) { return 'product' } } ; foreach ($t in $pubTok) { if ($n.Contains($t)) { return 'publisher' } } ; return '' }",
  "$items = New-Object System.Collections.ArrayList",
  "function AddIt($kind,$label,$path,$match,$detail) { [void]$items.Add([pscustomobject]@{ kind = $kind; label = $label; path = \"$path\"; match = $match; detail = \"$detail\" }) }",
  "$inst = \"$($p.install)\".TrimEnd('\\')",
  "$key = if ($p.hive -eq 'machine32') { 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + $p.child } elseif ($p.hive -eq 'user') { 'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + $p.child } else { 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + $p.child }",
  "if (Test-Path -LiteralPath $key) { AddIt 'regkey' 'Deinstallations-Schlüssel (Uninstall)' $key 'product' '' }",
  "if ($inst -and (Test-Path -LiteralPath $inst)) { AddIt 'folder' 'Installationsordner' $inst 'product' '' }",
  "$baseDirs = @()",
  "if ($env:ProgramFiles) { $baseDirs += $env:ProgramFiles }",
  "$pf86 = (Get-Item 'Env:ProgramFiles(x86)' -EA SilentlyContinue).Value; if ($pf86) { $baseDirs += $pf86 }",
  "if ($env:ProgramData) { $baseDirs += $env:ProgramData }",
  "foreach ($b in $baseDirs) { Get-ChildItem -LiteralPath $b -Directory -EA SilentlyContinue | ForEach-Object { $m = MatchKind $_.Name; if ($m -and ($_.FullName.ToLower() -ne $inst.ToLower())) { AddIt 'folder' ('Ordner: ' + $_.Name) $_.FullName $m $b } } }",
  "Get-ChildItem 'C:\\Users' -Directory -EA SilentlyContinue | ForEach-Object { $un = $_.Name; foreach ($sub in @('AppData\\Local','AppData\\Roaming','AppData\\LocalLow')) { $d = Join-Path $_.FullName $sub; if (Test-Path -LiteralPath $d) { Get-ChildItem -LiteralPath $d -Directory -EA SilentlyContinue | ForEach-Object { $m = MatchKind $_.Name; if ($m) { AddIt 'folder' ('Benutzerdaten: ' + $_.Name) $_.FullName $m ($un + ' · ' + $sub) } } } } }",
  "foreach ($rb in @('HKLM:\\SOFTWARE','HKLM:\\SOFTWARE\\WOW6432Node','HKCU:\\SOFTWARE')) { Get-ChildItem -LiteralPath $rb -EA SilentlyContinue | ForEach-Object { $m = MatchKind $_.PSChildName; if ($m) { AddIt 'regkey' ('Registry: ' + $_.PSChildName) ($rb + '\\' + $_.PSChildName) $m $rb } } }",
  "Get-CimInstance Win32_Service -EA SilentlyContinue | ForEach-Object { $svc = $_; $hit = ''; if ($inst -and $svc.PathName -and ($svc.PathName.ToLower().Contains($inst.ToLower()))) { $hit = 'product' }; if (-not $hit) { $mk = MatchKind (\"$($svc.Name) $($svc.DisplayName)\"); if ($mk) { $hit = $mk } }; if ($hit) { AddIt 'service' ('Dienst: ' + $svc.DisplayName) $svc.Name $hit ('Status ' + $svc.State) } }",
  "try { Get-ScheduledTask -EA SilentlyContinue | ForEach-Object { $t = $_; if ($t.TaskPath -like '\\Microsoft\\Windows\\*') { return }; $ex = ($t.Actions | ForEach-Object { \"$($_.Execute)\" }) -join ' '; $hit = ''; if ($inst -and $ex.ToLower().Contains($inst.ToLower())) { $hit = 'product' }; if (-not $hit) { $mk = MatchKind (\"$($t.TaskName) $ex\"); if ($mk) { $hit = $mk } }; if ($hit) { AddIt 'task' ('Aufgabe: ' + $t.TaskName) ($t.TaskPath + $t.TaskName) $hit '' } } } catch {}",
  "$smDirs = @(\"$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\")",
  "Get-ChildItem 'C:\\Users' -Directory -EA SilentlyContinue | ForEach-Object { $smDirs += (Join-Path $_.FullName 'AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs') }",
  "foreach ($sm in $smDirs) { if (Test-Path -LiteralPath $sm) { Get-ChildItem -LiteralPath $sm -Recurse -Filter *.lnk -EA SilentlyContinue | ForEach-Object { $m = MatchKind $_.BaseName; if ($m) { AddIt 'shortcut' ('Verknüpfung: ' + $_.BaseName) $_.FullName $m '' } } } }",
  "$ucmd = ''",
  "$guid = ''",
  "if ($p.child -match '^\\{') { $guid = $p.child } elseif ($p.uninstall -match '(\\{[A-Fa-f0-9-]+\\})') { $guid = $Matches[1] }",
  "if ($guid) { $ucmd = 'msiexec /x ' + $guid + ' /quiet /norestart' } elseif ($p.quiet) { $ucmd = $p.quiet } elseif ($p.uninstall) { $ucmd = $p.uninstall }",
  "'@@SWPREV@@' + ([pscustomobject]@{ ok = $true; uninstallCmd = $ucmd; items = @($items) } | ConvertTo-Json -Depth 4 -Compress)",
]

export async function previewUninstall(host: string, prog: InstalledProgram): Promise<UninstallPreview> {
  const h = host.trim()
  if (!(await ensureWinRM(h))) return { ok: false, uninstallCmd: '', items: [], error: `„${h}" ist nicht per WinRM erreichbar.` }
  const payload = b64(JSON.stringify({
    name: prog.name, publisher: prog.publisher, uninstall: prog.uninstall,
    quiet: prog.quiet, install: prog.install, child: prog.child, hive: prog.hive,
  }))
  let res
  try { res = await api().runPowerShell(buildCommand(h, PREVIEW_INNER, '@@SWPREV@@', payload), 120000) }
  catch (e) { return { ok: false, uninstallCmd: '', items: [], error: 'PowerShell-Fehler: ' + (e instanceof Error ? e.message : String(e)) } }
  let parsed: { ok?: boolean; error?: string; uninstallCmd?: string; items?: unknown }
  try { parsed = JSON.parse(extractTagged(res.stdout || '', '@@SWPREV@@')) }
  catch { return { ok: false, uninstallCmd: '', items: [], error: 'Vorschau-Antwort nicht lesbar.' } }
  if (parsed.ok === false) return { ok: false, uninstallCmd: '', items: [], error: parsed.error || 'Vorschau fehlgeschlagen.' }
  const items = asArr<RemovalItem>(parsed.items)
    .filter(it => it && it.path)
    // Doppelte Pfade zusammenfassen (z. B. Installationsordner auch als Ordner-Treffer)
    .filter((it, i, all) => all.findIndex(x => x.kind === it.kind && x.path.toLowerCase() === it.path.toLowerCase()) === i)
  return { ok: true, uninstallCmd: parsed.uninstallCmd || '', items }
}

// ── 3) Ausführen: Deinstallation + Reste löschen ─────────────────────────────
const EXEC_INNER = [
  "$plan = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json",
  "$p = $plan.program",
  "$log = New-Object System.Collections.ArrayList",
  "function LogIt($k,$label,$ok,$info) { [void]$log.Add([pscustomobject]@{ kind = $k; label = $label; ok = $ok; info = \"$info\" }) }",
  "$protectedDirs = @('c:\\','c:\\windows','c:\\windows\\system32','c:\\windows\\syswow64','c:\\program files','c:\\program files (x86)','c:\\programdata','c:\\users','c:\\users\\public','c:\\users\\default','c:\\users\\default user','c:\\users\\all users')",
  "function SafeDir($path) { $n = \"$path\".TrimEnd('\\'); if (-not $n) { return $false }; $low = $n.ToLower(); if ($protectedDirs -contains $low) { return $false }; $segs = @(($n -split '\\\\') | Where-Object { $_ -ne '' }); if ($segs.Count -lt 3) { return $false }; if ($low -match '\\\\appdata\\\\(local|roaming|locallow)$') { return $false }; if ($low -match '^[a-z]:\\\\users\\\\[^\\\\]+$') { return $false }; return $true }",
  "$protectedKeys = @('hklm:\\software','hklm:\\software\\microsoft','hklm:\\software\\wow6432node','hklm:\\software\\classes','hkcu:\\software','hkcu:\\software\\microsoft','hklm:\\software\\microsoft\\windows','hklm:\\software\\microsoft\\windows\\currentversion','hklm:\\software\\microsoft\\windows\\currentversion\\uninstall','hklm:\\software\\wow6432node\\microsoft\\windows\\currentversion\\uninstall','hkcu:\\software\\microsoft\\windows\\currentversion\\uninstall')",
  "function SafeKey($path) { $low = \"$path\".TrimEnd('\\').ToLower(); if ($protectedKeys -contains $low) { return $false }; $segs = @(($low -split '\\\\') | Where-Object { $_ -ne '' }); if ($segs.Count -lt 3) { return $false }; return $true }",
  "$uOk = $false; $uText = ''",
  "if ($plan.runUninstall) {",
  "  $paths = @('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')",
  "  $dn = $p.name",
  "  $guid = ''",
  "  if ($p.child -match '^\\{') { $guid = $p.child } elseif ($p.uninstall -match '(\\{[A-Fa-f0-9-]+\\})') { $guid = $Matches[1] }",
  "  $still = { param($nm) [bool](Get-ItemProperty $paths -EA SilentlyContinue | Where-Object { $_.DisplayName -eq $nm }) }",
  "  if ($guid) { $pr = Start-Process msiexec.exe -ArgumentList ('/x ' + $guid + ' /quiet /norestart') -Wait -PassThru -EA SilentlyContinue; $uText += ('MSI exit ' + $pr.ExitCode + '; '); Start-Sleep 3 }",
  "  if (-not (& $still $dn)) { $uOk = $true }",
  "  if (-not $uOk -and $p.quiet) { cmd.exe /c ($p.quiet) 2>&1 | Out-Null; Start-Sleep 5; if (-not (& $still $dn)) { $uOk = $true; $uText += 'Quiet OK; ' } }",
  "  if (-not $uOk -and $p.uninstall) { $u = $p.uninstall; if ($u -match 'msiexec') { $c = $u + ' /quiet /norestart' } elseif ($u -match 'chrome') { $c = $u + ' --force-uninstall --system-level' } elseif ($u -match 'unins[0-9]') { $c = $u + ' /VERYSILENT /SUPPRESSMSGBOXES /NORESTART' } else { $c = $u + ' /S /silent /quiet /norestart' }; cmd.exe /c ($c) 2>&1 | Out-Null; Start-Sleep 8; if (-not (& $still $dn)) { $uOk = $true; $uText += 'EXE OK; ' } }",
  "  if ($uOk) { LogIt 'uninstall' ('Deinstallation: ' + $dn) $true $uText } else { LogIt 'uninstall' ('Deinstallation: ' + $dn) $false ('noch installiert; ' + $uText) }",
  "}",
  "foreach ($it in @($plan.items)) {",
  "  try {",
  "    if ($it.kind -eq 'folder') { if (SafeDir $it.path) { if (Test-Path -LiteralPath $it.path) { Remove-Item -LiteralPath $it.path -Recurse -Force -EA Stop; LogIt 'folder' $it.label $true $it.path } else { LogIt 'folder' $it.label $true ('bereits entfernt: ' + $it.path) } } else { LogIt 'folder' $it.label $false ('geschützter Pfad übersprungen: ' + $it.path) } }",
  "    elseif ($it.kind -eq 'regkey') { if (SafeKey $it.path) { if (Test-Path -LiteralPath $it.path) { Remove-Item -LiteralPath $it.path -Recurse -Force -EA Stop; LogIt 'regkey' $it.label $true $it.path } else { LogIt 'regkey' $it.label $true ('bereits entfernt: ' + $it.path) } } else { LogIt 'regkey' $it.label $false ('geschützter Schlüssel übersprungen: ' + $it.path) } }",
  "    elseif ($it.kind -eq 'service') { $svc = Get-Service -Name $it.path -EA SilentlyContinue; if ($svc) { try { Stop-Service -Name $it.path -Force -EA SilentlyContinue } catch {}; & sc.exe delete $it.path | Out-Null; LogIt 'service' $it.label $true ('Dienst entfernt: ' + $it.path) } else { LogIt 'service' $it.label $true ('Dienst nicht vorhanden') } }",
  "    elseif ($it.kind -eq 'task') { $full = $it.path; $tn = $full.Substring($full.LastIndexOf('\\') + 1); $tp = $full.Substring(0, $full.Length - $tn.Length); if (-not $tp) { $tp = '\\' }; Unregister-ScheduledTask -TaskName $tn -TaskPath $tp -Confirm:$false -EA Stop; LogIt 'task' $it.label $true $full }",
  "    elseif ($it.kind -eq 'shortcut') { if (Test-Path -LiteralPath $it.path) { Remove-Item -LiteralPath $it.path -Force -EA Stop; LogIt 'shortcut' $it.label $true $it.path } else { LogIt 'shortcut' $it.label $true ('bereits entfernt') } }",
  "  } catch { LogIt $it.kind $it.label $false $_.Exception.Message }",
  "}",
  "'@@SWEXEC@@' + ([pscustomobject]@{ ok = $true; uninstallOk = $uOk; log = @($log) } | ConvertTo-Json -Depth 4 -Compress)",
]

export async function runUninstall(
  host: string, prog: InstalledProgram, items: RemovalItem[], runUninstallStep: boolean, by: string,
): Promise<{ ok: boolean; report?: UninstallReport; error?: string }> {
  const h = host.trim()
  if (!(await ensureWinRM(h))) return { ok: false, error: `„${h}" ist nicht per WinRM erreichbar.` }
  const payload = b64(JSON.stringify({
    program: {
      name: prog.name, publisher: prog.publisher, uninstall: prog.uninstall,
      quiet: prog.quiet, child: prog.child, hive: prog.hive,
    },
    items: items.map(it => ({ kind: it.kind, label: it.label, path: it.path })),
    runUninstall: runUninstallStep,
  }))
  let res
  try { res = await api().runPowerShell(buildCommand(h, EXEC_INNER, '@@SWEXEC@@', payload), 300000) }
  catch (e) { return { ok: false, error: 'PowerShell-Fehler: ' + (e instanceof Error ? e.message : String(e)) } }
  let parsed: { ok?: boolean; error?: string; uninstallOk?: boolean; log?: unknown }
  try { parsed = JSON.parse(extractTagged(res.stdout || '', '@@SWEXEC@@')) }
  catch { return { ok: false, error: 'Ergebnis vom Zielrechner nicht lesbar.' } }
  if (parsed.ok === false) return { ok: false, error: parsed.error || 'Ausführung fehlgeschlagen.' }
  const log = asArr<RemovalLogEntry>(parsed.log)
  const report: UninstallReport = {
    id: `un_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    host: h.toUpperCase(), program: prog.name, version: prog.version, publisher: prog.publisher,
    ranAt: new Date().toISOString(), ranBy: by,
    uninstallRun: runUninstallStep, uninstallOk: !!parsed.uninstallOk, log,
  }
  await saveReport(report)
  // Audit im Geräte-Dossier
  const okN = log.filter(l => l.ok).length
  const zeilen = [
    `Deinstallation: ${prog.name}${prog.version ? ` (${prog.version})` : ''}`,
    runUninstallStep ? `Deinstaller: ${report.uninstallOk ? 'entfernt' : 'nicht bestätigt'}` : 'Deinstaller übersprungen',
    `Reste bereinigt: ${okN}/${log.length}`,
    ...log.filter(l => !l.ok).map(l => `  ✗ ${l.label}${l.info ? ' — ' + l.info : ''}`),
  ]
  try { await logDeviceAction(h, prog.child, zeilen.join('\n'), by, 'Deinstallation') } catch { /* egal */ }
  return { ok: true, report }
}

// ── Protokoll/Historie (Netzlaufwerk, für alle Nutzer) ───────────────────────
async function saveReport(report: UninstallReport): Promise<void> {
  const pfad = `${STORE_DIR}/${report.id}.json`
  try { await api().netWriteJson(pfad, report) } catch { /* egal */ }
  try {
    const idx = (await api().netReadJson<{ items: UninstallIndexEntry[] }>(STORE_INDEX))?.items ?? []
    const ok = report.log.filter(l => l.ok).length
    const entry: UninstallIndexEntry = {
      id: report.id, host: report.host, program: report.program, version: report.version,
      ranAt: report.ranAt, ranBy: report.ranBy, ok, total: report.log.length, pfad,
    }
    await api().netWriteJson(STORE_INDEX, { items: [entry, ...idx].slice(0, 100) })
  } catch { /* egal */ }
}

export async function listUninstalls(): Promise<UninstallIndexEntry[]> {
  try { return (await api().netReadJson<{ items: UninstallIndexEntry[] }>(STORE_INDEX))?.items ?? [] } catch { return [] }
}
export async function loadUninstall(pfad: string): Promise<UninstallReport | null> {
  try { return await api().netReadJson<UninstallReport>(pfad) } catch { return null }
}
