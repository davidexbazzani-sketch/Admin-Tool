// ── SolidWorks-Analyse: Fehler beseitigen (Anwenden + Backup + Wiederherstellen) ─
// SCHREIBT Einstellungen auf dem Ziel-PC. Sicherheitsprinzipien:
//  • SOLIDWORKS muss GESCHLOSSEN sein (sonst überschreibt es die Registry beim Beenden).
//  • HKCU-Werte werden in die HIVE DES ANGEMELDETEN ANWENDERS geschrieben (HKU\<SID>,
//    NTUSER.DAT-Load falls niemand angemeldet) — NICHT ins Admin-Profil der WinRM-Sitzung.
//  • Vor JEDEM Schreiben wird der Altwert gesichert und je PC persistiert → jederzeit
//    „Ursprünglichen Stand wiederherstellen".
// Die Ausführung läuft über api().runPowerShell(Invoke-Command …) wie bei den Treibern.

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import type { RegFix } from './analyse'

const q = (s: string) => (s || '').replace(/'/g, "''")

export interface AppliedEntry {
  relKey: string; name: string; type: string; scope: 'HKCU' | 'HKLM'
  hkuSid?: string | null
  oldValue: string | null; oldPresent: boolean; newValue: string
  ok: boolean; error?: string | null
}
export interface ApplyResult {
  ok: boolean
  swOffen: boolean            // true = SOLIDWORKS läuft → NICHT angewandt
  sid?: string | null
  applied: AppliedEntry[]
  error?: string
}

// Ein zu schreibender Fix (aus RegFix) — value ist der Zielwert; beim Restore der Altwert.
interface FixWire { scope: 'HKCU' | 'HKLM'; relKey: string; name: string; type: string; value: string; hkuSid?: string }

// Gemeinsamer PS-Kopf: SW-Lauf-Check + angemeldeten Anwender-Hive ermitteln (wie Diagnose).
// Danach `foreach ($fx in $fixes)` je nach $mode ('apply'|'restore') schreiben/zurücksetzen.
function buildRemoteScript(host: string, fixesJson: string, mode: 'apply' | 'restore'): string {
  const h = q(host)
  const inner = [
    `param($fixesJson,$mode)`,
    `$ErrorActionPreference='Stop'`,
    `$out=[ordered]@{ ok=$false; swOffen=$false; sid=$null; hiveLoaded=$false; applied=@(); error=$null }`,
    `$uTmp=$null; $uHiveLoaded=$false`,
    `try {`,
    // SOLIDWORKS läuft? Dann NICHT schreiben (würde beim Beenden überschrieben).
    `  $sw = Get-Process -Name 'SLDWORKS','sldworks' -ErrorAction SilentlyContinue`,
    `  if ($sw) { $out.swOffen=$true; $out.error='SOLIDWORKS laeuft — bitte schliessen. Ohne geschlossenes SOLIDWORKS werden die Aenderungen beim Beenden ueberschrieben.'; return ($out | ConvertTo-Json -Depth 6 -Compress) }`,
    `  $fixesRaw=$fixesJson | ConvertFrom-Json; $fixes=@($fixesRaw)`,   // NICHT @(pipeline) — das faesst das ganze Array als 1 Element (PS-5.1-Fallstrick)
    // Ziel-Hive ROBUST bestimmen (Ursache für „0 gesetzt": Konsolen-User != betroffener User):
    //  1) SID aus der Diagnose (hkuSid) — der Anwender, für den die Werte gelten,
    //  2) der aktuell angemeldete Anwender, 3) letzte Rettung: irgendeine geladene S-1-5-21-Hive
    //  mit SolidWorks-Schlüssel. Ist die Hive nicht geladen, NTUSER.DAT laden (im finally entladen).
    `  $uHive=$null; $uSid=$null; $cand=New-Object System.Collections.ArrayList`,
    `  foreach ($f in $fixes) { if ($f.hkuSid -and (-not ($cand -contains [string]$f.hkuSid))) { [void]$cand.Add([string]$f.hkuSid) } }`,
    `  $ln=(Get-CimInstance Win32_ComputerSystem).UserName; if ($ln) { try { [void]$cand.Add((New-Object System.Security.Principal.NTAccount($ln)).Translate([System.Security.Principal.SecurityIdentifier]).Value) } catch {} }`,
    `  foreach ($sid in $cand) {`,
    `    if ($uHive) { break }`,
    `    if (Test-Path ('Registry::HKEY_USERS\\'+$sid)) { $uHive='Registry::HKEY_USERS\\'+$sid; $uSid=$sid; break }`,
    `    $prof=(Get-ItemProperty ('HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\'+$sid) -ErrorAction SilentlyContinue).ProfileImagePath`,
    `    if ($prof -and (Test-Path (Join-Path $prof 'NTUSER.DAT'))) {`,
    `      $uTmp='SWFIX_'+($sid -replace '[^0-9A-Za-z]','')`,
    `      reg load ('HKU\\'+$uTmp) (Join-Path $prof 'NTUSER.DAT') *> $null`,
    `      if (Test-Path ('Registry::HKEY_USERS\\'+$uTmp)) { $uHive='Registry::HKEY_USERS\\'+$uTmp; $uHiveLoaded=$true; $uSid=$sid; break }`,
    `    }`,
    `  }`,
    `  if (-not $uHive) { foreach ($k in (Get-ChildItem 'Registry::HKEY_USERS' -ErrorAction SilentlyContinue)) { $n=$k.PSChildName; if (($n -match '^S-1-5-21') -and (-not ($n -match '_Classes$')) -and (Test-Path ('Registry::HKEY_USERS\\'+$n+'\\Software\\SolidWorks'))) { $uHive='Registry::HKEY_USERS\\'+$n; $uSid=$n; break } } }`,
    `  $out.sid=$uSid; $out.hiveLoaded=$uHiveLoaded`,
    `  if ((-not $uHive) -and ($fixes | Where-Object { $_.scope -eq 'HKCU' })) { $out.error='Kein Benutzer-Registry-Hive gefunden (niemand angemeldet / Profil nicht ladbar) — HKCU-Werte nicht geschrieben.' }`,
    `  $typeMap=@{ REG_DWORD='DWord'; REG_SZ='String'; REG_QWORD='QWord'; REG_EXPAND_SZ='ExpandString' }`,
    `  $results=@()`,
    `  foreach ($fx in $fixes) {`,
    `    $r=[ordered]@{ relKey=$fx.relKey; name=$fx.name; type=$fx.type; scope=$fx.scope; hkuSid=$fx.hkuSid; oldValue=$null; oldPresent=$false; newValue=$fx.value; ok=$false; error=$null }`,
    `    try {`,
    `      if ($fx.scope -eq 'HKCU') { if (-not $uHive) { throw 'kein Anwender-Hive verfuegbar (niemand angemeldet?)' }; $base=$uHive } else { $base='Registry::HKEY_LOCAL_MACHINE' }`,
    `      $path=$base+'\\'+$fx.relKey`,
    // Altwert IMMER lesen (Backup) — auch beim Restore, damit das Ergebnis stimmt.
    `      $cur=Get-ItemProperty -LiteralPath $path -Name $fx.name -ErrorAction SilentlyContinue`,
    `      if ($cur -and (($cur.PSObject.Properties.Name) -contains $fx.name)) { $r.oldValue=[string]$cur.$($fx.name); $r.oldPresent=$true }`,
    `      $pt=$typeMap["$($fx.type)"]; if (-not $pt) { $pt='DWord' }`,
    `      if ($mode -eq 'restore' -and -not $fx.oldPresent) {`,
    // Restore eines vorher NICHT gesetzten Werts = den von uns hinzugefügten Wert wieder löschen.
    `        if (Test-Path -LiteralPath $path) { Remove-ItemProperty -LiteralPath $path -Name $fx.name -Force -ErrorAction SilentlyContinue }`,
    `        $r.ok=$true`,
    `      } else {`,
    `        if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }`,
    `        $val = if ($pt -eq 'DWord' -or $pt -eq 'QWord') { [int64]$fx.value } else { [string]$fx.value }`,
    `        New-ItemProperty -LiteralPath $path -Name $fx.name -PropertyType $pt -Value $val -Force | Out-Null`,
    `        $r.ok=$true`,
    `      }`,
    `    } catch { $r.error="$_" }`,
    `    $results += (New-Object psobject -Property $r)`,
    `  }`,
    `  $out.applied=$results; $out.ok=$true`,
    `} catch { $out.error="$_" }`,
    `finally { if ($uHiveLoaded -and $uTmp) { [gc]::Collect(); reg unload "HKU\\$uTmp" *> $null } }`,
    `$out | ConvertTo-Json -Depth 6 -Compress`,
  ].join('\n')
  const jb = fixesJson.replace(/'/g, "''")
  return `try { Invoke-Command -ComputerName '${h}' -ErrorAction Stop -ScriptBlock { ${inner} } -ArgumentList '${jb}','${mode}' } catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }`
}

function extractJson(out: string): string {
  const s = (out || '').trim()
  const i = s.indexOf('{'); const j = s.lastIndexOf('}')
  return i >= 0 && j > i ? s.slice(i, j + 1) : s
}

/** Ausgewählte Fixes auf dem Ziel anwenden (mit Backup der Altwerte). */
export async function applyFixes(host: string, fixes: RegFix[]): Promise<ApplyResult> {
  if (!fixes.length) return { ok: true, swOffen: false, applied: [] }
  if (!(await ensureWinRM(host))) return { ok: false, swOffen: false, applied: [], error: `„${host}" nicht per WinRM erreichbar.` }
  const wire: FixWire[] = fixes.map(f => ({ scope: f.scope, relKey: f.relKey, name: f.name, type: f.type, value: f.sollValue, hkuSid: f.hkuSid }))
  const script = buildRemoteScript(host, JSON.stringify(wire), 'apply')
  try {
    const r = await api().runPowerShell(script, 120000)
    const j = JSON.parse(extractJson(r.stdout || '')) as ApplyResult
    return j
  } catch (e) {
    return { ok: false, swOffen: false, applied: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// Ein Backup-Eintrag zum Zurückschreiben: Altwert + ob er ursprünglich gesetzt war.
export type RestoreWire = FixWire & { oldPresent: boolean }

/** Aus einem Apply-Ergebnis die Restore-Sicherung ableiten (nur erfolgreich geänderte Werte). */
export function backupFromApply(applied: AppliedEntry[]): RestoreWire[] {
  return applied.filter(a => a.ok).map(a => ({
    scope: a.scope, relKey: a.relKey, name: a.name, type: a.type, hkuSid: a.hkuSid ?? undefined,
    value: a.oldValue ?? '', oldPresent: a.oldPresent,
  }))
}

/** Gesicherte Altwerte wieder auf das Ziel zurückschreiben. */
export async function restoreFixes(host: string, backup: RestoreWire[]): Promise<ApplyResult> {
  if (!backup.length) return { ok: true, swOffen: false, applied: [] }
  if (!(await ensureWinRM(host))) return { ok: false, swOffen: false, applied: [], error: `„${host}" nicht per WinRM erreichbar.` }
  const script = buildRemoteScript(host, JSON.stringify(backup), 'restore')
  try {
    const r = await api().runPowerShell(script, 120000)
    return JSON.parse(extractJson(r.stdout || '')) as ApplyResult
  } catch (e) {
    return { ok: false, swOffen: false, applied: [], error: e instanceof Error ? e.message : String(e) }
  }
}

// ── Energieplan (powercfg) ────────────────────────────────────────────────────
const GUID_RE = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'

/** Aktives Energie-Schema auf `guid` setzen; liefert das vorherige (für Restore). */
export async function applyPowerplan(host: string, guid: string): Promise<{ ok: boolean; oldGuid?: string; error?: string }> {
  if (!(await ensureWinRM(host))) return { ok: false, error: `„${host}" nicht per WinRM erreichbar.` }
  const g = q(guid)
  const inner = [
    `param($g)`,
    `$before=((powercfg /getactivescheme) -join ' ')`,
    `$old = if ($before -match '(${GUID_RE})') { $Matches[1] } else { '' }`,
    // Falls das Höchstleistungs-Schema versteckt ist, sichtbar machen (idempotent, Fehler egal).
    `try { powercfg -duplicatescheme $g 2>$null | Out-Null } catch {}`,
    `try { powercfg /setactive $g 2>$null } catch {}`,
    `$after=((powercfg /getactivescheme) -join ' ')`,
    `@{ ok=($after -match [regex]::Escape($g)); oldGuid=$old } | ConvertTo-Json -Compress`,
  ].join('; ')
  const script = `try { Invoke-Command -ComputerName '${q(host)}' -ErrorAction Stop -ScriptBlock { ${inner} } -ArgumentList '${g}' } catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }`
  try {
    const r = await api().runPowerShell(script, 60000)
    return JSON.parse(extractJson(r.stdout || '')) as { ok: boolean; oldGuid?: string; error?: string }
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
}

// ── SMB-Client-Konfiguration (Set-SmbClientConfiguration) ─────────────────────
export interface SmbApplied { prop: string; ziel: boolean; old: boolean | null; ok: boolean; error?: string | null }
export interface SmbResult { ok: boolean; applied: SmbApplied[]; error?: string }

/** SMB-Client-Eigenschaften setzen (mit Backup der Altwerte). fixes: {prop, ziel}. */
export async function applySmbConfig(host: string, fixes: { prop: string; ziel: boolean }[]): Promise<SmbResult> {
  if (!fixes.length) return { ok: true, applied: [] }
  if (!(await ensureWinRM(host))) return { ok: false, applied: [], error: `„${host}" nicht per WinRM erreichbar.` }
  const json = JSON.stringify(fixes).replace(/'/g, "''")
  const inner = [
    `param($fixesJson)`,
    `$out=[ordered]@{ ok=$false; applied=@(); error=$null }`,
    `try {`,
    `  $cfg=Get-SmbClientConfiguration`,
    `  $fixesRaw=$fixesJson | ConvertFrom-Json; $fixes=@($fixesRaw)`,   // NICHT @(pipeline) — das faesst das ganze Array als 1 Element (PS-5.1-Fallstrick)
    `  $res=@()`,
    `  foreach ($fx in $fixes) {`,
    `    $r=[ordered]@{ prop=$fx.prop; ziel=[bool]$fx.ziel; old=$null; ok=$false; error=$null }`,
    `    try {`,
    `      $r.old=[bool]($cfg.$($fx.prop))`,
    `      $sp=@{ Force=$true }; $sp[[string]$fx.prop]=[bool]$fx.ziel`,
    `      Set-SmbClientConfiguration @sp`,
    `      $r.ok=$true`,
    `    } catch { $r.error="$_" }`,
    `    $res += (New-Object psobject -Property $r)`,
    `  }`,
    `  $out.applied=$res; $out.ok=$true`,
    `} catch { $out.error="$_" }`,
    `$out | ConvertTo-Json -Depth 5 -Compress`,
  ].join('\n')
  const script = `try { Invoke-Command -ComputerName '${q(host)}' -ErrorAction Stop -ScriptBlock { ${inner} } -ArgumentList '${json}' } catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }`
  try {
    const r = await api().runPowerShell(script, 60000)
    return JSON.parse(extractJson(r.stdout || '')) as SmbResult
  } catch (e) { return { ok: false, applied: [], error: e instanceof Error ? e.message : String(e) } }
}

/** SMB-Eigenschaften auf die gesicherten Altwerte zurücksetzen. */
export async function restoreSmbConfig(host: string, backup: { prop: string; old: boolean }[]): Promise<SmbResult> {
  return applySmbConfig(host, backup.map(b => ({ prop: b.prop, ziel: b.old })))
}

// ── SolidWorks-Pfade am Ziel LIVE ermitteln (für die Defender-Ausnahmen) ───────
// Liefert: gemappte Netzlaufwerke des Anwenders (Laufwerk → UNC, aus HKU\<SID>\Network),
// den ECHTEN SolidWorks-Installationsordner (Registry) und welche der übergebenen lokalen
// Kandidatenpfade tatsächlich EXISTIEREN (Test-Path). So landen NUR reale Pfade im Ticket,
// nichts Geratenes. Hive robust bestimmt (SID-Hinweis → angemeldeter User → geladene SW-Hive).
export async function ermittleSwPfade(host: string, sidHint?: string, lokalKandidaten: string[] = []): Promise<{ map: Record<string, string>; installDir?: string; lokal: string[]; swPaths: string[]; sid?: string; error?: string }> {
  if (!(await ensureWinRM(host))) return { map: {}, lokal: [], swPaths: [], error: `„${host}" nicht per WinRM erreichbar.` }
  const lokalJson = JSON.stringify(lokalKandidaten).replace(/'/g, "''")
  const inner = [
    `param($hint,$lokalJson)`,
    `$out=[ordered]@{ ok=$false; map=@{}; installDir=$null; lokal=@(); swPaths=@(); sid=$null; error=$null }`,
    `$uTmp=$null; $loaded=$false`,
    `try {`,
    `  $uHive=$null; $uSid=$null; $cand=New-Object System.Collections.ArrayList`,
    `  if ($hint) { [void]$cand.Add([string]$hint) }`,
    `  $ln=(Get-CimInstance Win32_ComputerSystem).UserName; if ($ln) { try { [void]$cand.Add((New-Object System.Security.Principal.NTAccount($ln)).Translate([System.Security.Principal.SecurityIdentifier]).Value) } catch {} }`,
    `  foreach ($sid in $cand) {`,
    `    if ($uHive) { break }`,
    `    if (Test-Path ('Registry::HKEY_USERS\\'+$sid)) { $uHive='Registry::HKEY_USERS\\'+$sid; $uSid=$sid; break }`,
    `    $prof=(Get-ItemProperty ('HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\'+$sid) -ErrorAction SilentlyContinue).ProfileImagePath`,
    `    if ($prof -and (Test-Path (Join-Path $prof 'NTUSER.DAT'))) {`,
    `      $uTmp='SWCAD_'+($sid -replace '[^0-9A-Za-z]','')`,
    `      reg load ('HKU\\'+$uTmp) (Join-Path $prof 'NTUSER.DAT') *> $null`,
    `      if (Test-Path ('Registry::HKEY_USERS\\'+$uTmp)) { $uHive='Registry::HKEY_USERS\\'+$uTmp; $loaded=$true; $uSid=$sid; break }`,
    `    }`,
    `  }`,
    `  if (-not $uHive) { foreach ($k in (Get-ChildItem 'Registry::HKEY_USERS' -ErrorAction SilentlyContinue)) { $n=$k.PSChildName; if (($n -match '^S-1-5-21') -and (-not ($n -match '_Classes$')) -and (Test-Path ('Registry::HKEY_USERS\\'+$n+'\\Software\\SolidWorks'))) { $uHive='Registry::HKEY_USERS\\'+$n; $uSid=$n; break } } }`,
    `  $out.sid=$uSid`,
    `  if ($uHive -and (Test-Path ($uHive+'\\Network'))) {`,
    `    foreach ($k in (Get-ChildItem ($uHive+'\\Network') -ErrorAction SilentlyContinue)) {`,
    `      $rp=(Get-ItemProperty $k.PSPath -Name RemotePath -ErrorAction SilentlyContinue).RemotePath`,
    `      if ($rp) { $out.map[($k.PSChildName.ToUpper()+':')]=[string]$rp }`,
    `    }`,
    `  }`,
    // Von SOLIDWORKS referenzierte Pfade DIREKT aus der Registry: Toolbox (General\Toolbox Data
    // Location — maßgeblich, NICHT in Dateipositionen!), Struktur-Profile, Hole-Wizard-DB und ALLE
    // ExtReferences-Dateipositionen. So kommt die Toolbox ins Ticket, auch wenn der Scan sie nicht führte.
    `  $swp=New-Object System.Collections.Generic.List[string]`,
    `  $addP={ param($v) if ($v) { foreach ($t in ([string]$v -split ';')) { $t=$t.Trim(); if ($t -match '^(\\\\|[A-Za-z]:\\\\)') { [void]$swp.Add($t) } } } }`,
    `  if ($uHive) { foreach ($vk in (Get-ChildItem ($uHive+'\\Software\\SolidWorks') -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match '^SOLIDWORKS 20' })) {`,
    `    $gen=Join-Path $vk.PSPath 'General'; $ext=Join-Path $vk.PSPath 'ExtReferences'`,
    `    & $addP (Get-ItemProperty $gen -Name 'Toolbox Data Location' -ErrorAction SilentlyContinue).'Toolbox Data Location'`,
    `    & $addP (Get-ItemProperty $gen -Name 'Structural Member Profile Path' -ErrorAction SilentlyContinue).'Structural Member Profile Path'`,
    `    & $addP (Get-ItemProperty $ext -Name 'Hole Wizard Favorites DB Path' -ErrorAction SilentlyContinue).'Hole Wizard Favorites DB Path'`,
    `    if (Test-Path $ext) { $pp=Get-ItemProperty $ext -ErrorAction SilentlyContinue; if ($pp) { foreach ($prop in ($pp.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' })) { & $addP $prop.Value } } }`,
    `  } }`,
    `  foreach ($hv in @(@{P='HKLM:\\SOFTWARE\\SolidWorks\\Applications\\SolidWorks Toolbox';N='Path'}, @{P='HKLM:\\SOFTWARE\\SolidWorks\\SOLIDWORKS Toolbox';N='Toolbox Data Location'})) { & $addP (Get-ItemProperty $hv.P -Name $hv.N -ErrorAction SilentlyContinue).$($hv.N) }`,
    `  $out.swPaths=@($swp | Select-Object -Unique)`,
    // Echter SolidWorks-Installationsordner: Registry „SolidWorks Folder", sonst Program Files.
    `  $inst=''`,
    `  foreach ($base in 'HKLM:\\SOFTWARE\\SolidWorks','HKLM:\\SOFTWARE\\WOW6432Node\\SolidWorks') {`,
    `    if ($inst -or -not (Test-Path $base)) { continue }`,
    `    foreach ($vk in (Get-ChildItem $base -ErrorAction SilentlyContinue | Where-Object { $_.PSChildName -match 'SOLIDWORKS 20' } | Sort-Object PSChildName -Descending)) {`,
    `      $sf=(Get-ItemProperty (Join-Path $vk.PSPath 'Setup') -Name 'SolidWorks Folder' -ErrorAction SilentlyContinue).'SolidWorks Folder'`,
    `      if ($sf -and (Test-Path -LiteralPath $sf)) { $inst=([string]$sf).TrimEnd('\\'); break }`,
    `    }`,
    `  }`,
    `  if (-not $inst) { foreach ($pf in $env:ProgramFiles,\${env:ProgramFiles(x86)}) { if ($inst -or -not $pf) { continue }; $d=Get-ChildItem $pf -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'SolidWorks*' -or $_.Name -like 'SOLIDWORKS*' } | Select-Object -First 1; if ($d) { $inst=$d.FullName } } }`,
    `  $out.installDir=$inst`,
    // Übergebene lokale Kandidaten auf Existenz prüfen.
    `  $lokRaw=$lokalJson | ConvertFrom-Json; $vorhanden=@(); foreach ($k in @($lokRaw)) { if ($k -and (Test-Path -LiteralPath $k -ErrorAction SilentlyContinue)) { $vorhanden += [string]$k } }`,
    `  $out.lokal=$vorhanden`,
    `  $out.ok=$true`,
    `} catch { $out.error="$_" }`,
    `finally { if ($loaded -and $uTmp) { [gc]::Collect(); reg unload ('HKU\\'+$uTmp) *> $null } }`,
    `$out | ConvertTo-Json -Depth 5 -Compress`,
  ].join('\n')
  const script = `try { Invoke-Command -ComputerName '${q(host)}' -ErrorAction Stop -ScriptBlock { ${inner} } -ArgumentList '${q(sidHint || '')}','${lokalJson}' } catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }`
  // PS ConvertTo-Json macht aus einem 1-Element-Array einen Skalar → immer zu Array normalisieren.
  const toArr = (x: unknown): string[] => Array.isArray(x) ? x as string[] : (x ? [String(x)] : [])
  try {
    const r = await api().runPowerShell(script, 60000)
    const j = JSON.parse(extractJson(r.stdout || '')) as { ok?: boolean; map?: Record<string, string>; installDir?: string; lokal?: unknown; swPaths?: unknown; sid?: string; error?: string }
    return { map: j.map || {}, installDir: j.installDir || undefined, lokal: toArr(j.lokal), swPaths: toArr(j.swPaths), sid: j.sid, error: j.error }
  } catch (e) { return { map: {}, lokal: [], swPaths: [], error: e instanceof Error ? e.message : String(e) } }
}

// ── AutoRecover-/Backup-Zielordner am PC berechnen + anlegen ───────────────────
// Liefert gültige LOKALE Ordner im Anwenderprofil (<Profil>\AppData\Local\SOLIDWORKS\swxauto bzw. \Backup)
// und legt sie an — der berechnete Pfad wird dann als AutoRecover/Backup Directory (REG_SZ) geschrieben.
export async function ermittleAutoRecoverZiel(host: string, sidHint?: string): Promise<{ sid?: string; autorecover?: string; backup?: string; error?: string }> {
  if (!(await ensureWinRM(host))) return { error: `„${host}" nicht per WinRM erreichbar.` }
  const inner = [
    `param($hint)`,
    `$out=[ordered]@{ ok=$false; sid=$null; autorecover=$null; backup=$null; error=$null }`,
    `try {`,
    `  $sid=$null`,
    `  if ($hint) { $sid=[string]$hint }`,
    `  if (-not $sid) { $ln=(Get-CimInstance Win32_ComputerSystem).UserName; if ($ln) { try { $sid=(New-Object System.Security.Principal.NTAccount($ln)).Translate([System.Security.Principal.SecurityIdentifier]).Value } catch {} } }`,
    `  if (-not $sid) { foreach ($k in (Get-ChildItem 'Registry::HKEY_USERS' -ErrorAction SilentlyContinue)) { $n=$k.PSChildName; if (($n -match '^S-1-5-21') -and (-not ($n -match '_Classes$')) -and (Test-Path ('Registry::HKEY_USERS\\'+$n+'\\Software\\SolidWorks'))) { $sid=$n; break } } }`,
    `  $out.sid=$sid`,
    `  $prof=$null`,
    `  if ($sid) { $prof=(Get-ItemProperty ('HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList\\'+$sid) -ErrorAction SilentlyContinue).ProfileImagePath }`,
    `  if (-not $prof) { throw 'Anwenderprofil nicht ermittelbar (SID/ProfileList).' }`,
    `  $base=Join-Path $prof 'AppData\\Local\\SOLIDWORKS'`,
    `  $ar=Join-Path $base 'swxauto'; $bk=Join-Path $base 'Backup'`,
    `  New-Item -ItemType Directory -Force -Path $ar -ErrorAction SilentlyContinue | Out-Null`,
    `  New-Item -ItemType Directory -Force -Path $bk -ErrorAction SilentlyContinue | Out-Null`,
    `  $out.autorecover=$ar; $out.backup=$bk; $out.ok=$true`,
    `} catch { $out.error="$_" }`,
    `$out | ConvertTo-Json -Compress`,
  ].join('\n')
  const script = `try { Invoke-Command -ComputerName '${q(host)}' -ErrorAction Stop -ScriptBlock { ${inner} } -ArgumentList '${q(sidHint || '')}' } catch { @{ ok=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress }`
  try {
    const r = await api().runPowerShell(script, 60000)
    const j = JSON.parse(extractJson(r.stdout || '')) as { sid?: string; autorecover?: string; backup?: string; error?: string }
    return { sid: j.sid, autorecover: j.autorecover || undefined, backup: j.backup || undefined, error: j.error }
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
}

// ── Freigabe-Messung (Durchsatz/Latenz/Auflistung zu einer CAD-Freigabe) ──────
// Läuft am Ziel (WinRM, Systemkontext). Kurzer Timeout — bei Doppelhop/kein Zugriff bricht es
// sauber ab (kein Hänger) und meldet, dass die Messung im Anwenderkontext nötig ist.
export interface FreigabeMessung { ok: boolean; unc: string; erreichbar?: boolean; latenzMs?: number | null; listeMs?: number | null; eintraege?: number | null; durchsatzMBs?: number | null; fehler?: string }
export async function messeFreigabe(host: string, unc: string): Promise<FreigabeMessung> {
  if (!unc || !/^\\\\[^\\]+\\/.test(unc)) return { ok: false, unc, fehler: 'Kein gültiger UNC-Pfad (\\\\Server\\Freigabe).' }
  if (!(await ensureWinRM(host))) return { ok: false, unc, fehler: `„${host}" nicht per WinRM erreichbar.` }
  const inner = [
    `param($unc)`,
    `$out=[ordered]@{ ok=$false; unc=$unc; erreichbar=$false; latenzMs=$null; listeMs=$null; eintraege=$null; durchsatzMBs=$null; fehler=$null }`,
    `try {`,
    `  $srv=($unc -replace '^\\\\\\\\',''); $srv=($srv -split '\\\\')[0]`,
    `  try { $p=(New-Object System.Net.NetworkInformation.Ping).Send($srv,1500); if ($p.Status -eq 'Success') { $out.erreichbar=$true; $out.latenzMs=[int]$p.RoundtripTime } } catch {}`,
    `  $sw=[System.Diagnostics.Stopwatch]::StartNew()`,
    `  $items=@(Get-ChildItem -LiteralPath $unc -Force -ErrorAction Stop | Select-Object -First 300)`,
    `  $sw.Stop(); $out.listeMs=[int]$sw.ElapsedMilliseconds; $out.eintraege=$items.Count; $out.erreichbar=$true`,
    `  $f=$items | Where-Object { -not $_.PSIsContainer -and $_.Length -gt 262144 } | Select-Object -First 1`,
    `  if ($f) { try { $fs=[System.IO.File]::OpenRead($f.FullName); try { $buf=New-Object byte[] 1048576; $ges=0; $sw2=[System.Diagnostics.Stopwatch]::StartNew(); while ($ges -lt 8388608) { $n=$fs.Read($buf,0,$buf.Length); if ($n -le 0) { break }; $ges+=$n }; $sw2.Stop(); if ($sw2.Elapsed.TotalSeconds -gt 0) { $out.durchsatzMBs=[math]::Round(($ges/1MB)/$sw2.Elapsed.TotalSeconds,1) } } finally { $fs.Close() } } catch {} }`,
    `  $out.ok=$true`,
    `} catch { $out.fehler="$_" }`,
    `$out | ConvertTo-Json -Compress`,
  ].join('\n')
  const script = `try { Invoke-Command -ComputerName '${q(host)}' -ErrorAction Stop -ScriptBlock { ${inner} } -ArgumentList '${q(unc)}' } catch { @{ ok=$false; fehler=$_.Exception.Message } | ConvertTo-Json -Compress }`
  try {
    const r = await api().runPowerShell(script, 45000)
    const j = JSON.parse(extractJson(r.stdout || '')) as FreigabeMessung
    return { ...j, unc }
  } catch (e) { return { ok: false, unc, fehler: e instanceof Error ? e.message : String(e) } }
}

// ── Backup-Persistenz je PC ───────────────────────────────────────────────────
export interface SmbBackupEntry { prop: string; old: boolean; titel?: string }
export interface FixBackup {
  host: string
  changedAt: string
  changedBy: string
  entries: (RestoreWire & { titel?: string })[]   // Registry-Altwerte zum Zurückschreiben
  powerplanOld?: string                            // vorheriges Energie-Schema (GUID), falls geändert
  smb?: SmbBackupEntry[]                            // vorherige SMB-Client-Eigenschaften
}

// Backup-Schlüssel (scope+Pfad+Wertname), case-insensitiv wie die Registry.
function bkKey(e: { scope: string; relKey: string; name: string }): string {
  return `${e.scope}|${e.relKey}|${e.name}`.toLowerCase()
}

/**
 * Ein frisches Apply-Backup mit einem bereits gespeicherten zusammenführen, so dass je
 * Schlüssel IMMER der URSPRÜNGLICHE Wert (vor der ersten Tool-Änderung) erhalten bleibt.
 * Für schon gesicherte Schlüssel wird der alte Backup-Eintrag behalten (nicht überschrieben),
 * neue Schlüssel werden ergänzt → „ursprünglichen Stand" bleibt über mehrere Läufe restaurierbar.
 */
export function mergeBackupEntries(
  prev: (RestoreWire & { titel?: string })[],
  fresh: (RestoreWire & { titel?: string })[],
): (RestoreWire & { titel?: string })[] {
  const byKey = new Map<string, RestoreWire & { titel?: string }>()
  for (const e of prev) byKey.set(bkKey(e), e)               // Originale behalten
  for (const f of fresh) if (!byKey.has(bkKey(f))) byKey.set(bkKey(f), f)   // nur neue ergänzen
  return [...byKey.values()]
}

/** SMB-Backup mergen (je Eigenschaft den ursprünglichen Altwert behalten). */
export function mergeSmbBackup(prev: SmbBackupEntry[], fresh: SmbBackupEntry[]): SmbBackupEntry[] {
  const m = new Map<string, SmbBackupEntry>()
  for (const e of prev) m.set(e.prop, e)
  for (const f of fresh) if (!m.has(f.prop)) m.set(f.prop, f)
  return [...m.values()]
}
function backupFile(host: string): string {
  return `solidworks-diagnose/fixbackup_${host.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`
}
export async function saveFixBackup(b: FixBackup): Promise<void> {
  try { await api().netWriteJson(backupFile(b.host), b) } catch { /* best effort */ }
}
export async function loadFixBackup(host: string): Promise<FixBackup | null> {
  try { return await api().netReadJson<FixBackup>(backupFile(host)) } catch { return null }
}
