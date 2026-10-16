// ── EuroPAR-Ordner alt → Netz-Zwischenspeicher → neuer PC ─────────────────────
// Beim PC-Tausch müssen die drei EuroPAR-Ordner von C:\ des Altgeräts 1:1 auf den
// neuen PC. Ablauf ([[refresh_migration_feature]]):
//   1) Sobald ein Refresh-Gerät in der Geräte-Einrichtung auftaucht, sichert das Tool
//      die vorhandenen Ordner vom Altgerät in einen Unterordner (= Hostname des NEUEN
//      PCs) unter …\Tool IT\Europar  →  stageEuroparFolders().
//   2) Im Migrations-Cockpit (Kachel „EuroPAR-Ordner") werden sie auf C:\ des neuen
//      PCs kopiert und Datei für Datei geprüft  →  applyEuroparFolders().
//   3) Erst wenn ALLES vollständig auf dem neuen PC liegt, wird der Unterordner im
//      Zwischenspeicher gelöscht. Gelöscht wird ausschließlich innerhalb von
//      …\Tool IT\Europar\<Unterordner> (harte Pfad-Schranke in guardedStageDir()).
// Kopiert wird mit robocopy /E (additiv, über Copy-SkfTree) — am Ziel wird NIE gelöscht.
// Alles läuft vom Admin-PC über die Admin-Freigabe c$ (kein WinRM nötig).

import { api } from '../electronAPI'
import { pathService } from './pathService'
import { ROBOCOPY_PS } from '../utils/robocopy'

/** Die drei Ordner, die beim PC-Tausch mitgenommen werden (liegen direkt auf C:\). */
export const EUROPAR_FOLDERS = ['EuroPAR', 'Local', 'SCHNITTDATEN'] as const

export interface EuroparFolderState {
  name: string
  /** 'ok' = vollständig vorhanden/übertragen · 'missing' = auf der Quelle nicht vorhanden · 'incomplete' = Prüfung fehlgeschlagen */
  state: 'ok' | 'missing' | 'incomplete'
  files: number
  bytes: number
  /** Anzahl Dateien, die am Ziel fehlen oder eine andere Größe haben (nur bei 'incomplete') */
  missing?: number
  text?: string
}
export interface EuroparResult {
  ok: boolean
  /** true = eine andere Sicherung läuft gerade (es wird immer nur EINE gleichzeitig kopiert) */
  busy?: boolean
  folders: EuroparFolderState[]
  text?: string
}

function psq(s: string): string { return (s || '').replace(/'/g, "''") }

export function formatEuroparSize(b: number): string {
  if (!b || b < 0) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0, v = b
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${u[i]}`
}

// ── Pfade + Löschschranke ─────────────────────────────────────────────────────

/** Wurzel des Zwischenspeichers: …\Tool IT\Europar */
export function europarRoot(): string { return `${pathService.getToolRoot('unc')}\\Europar` }

/** Ordnername im Zwischenspeicher aus dem Hostnamen des neuen PCs (nur harmlose Zeichen). */
export function europarDirName(newHost: string, fallback = ''): string {
  const clean = (s: string) => (s || '').trim().replace(/[^A-Za-z0-9._-]/g, '')
  return clean(newHost) || clean(fallback)
}

/**
 * Absoluter Pfad des Unterordners im Zwischenspeicher — und die einzige Stelle, an der
 * ein löschbarer Pfad entsteht. Gibt '' zurück, sobald irgendetwas nicht stimmt
 * (leerer Name, Pfadtrenner, `..`, Wurzel heißt nicht `Europar`). Ohne gültigen Pfad
 * wird nichts kopiert und erst recht nichts gelöscht.
 */
function guardedStageDir(dirName: string): string {
  const name = (dirName || '').trim()
  if (!name || name.length > 64) return ''
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return ''
  if (name === '.' || name === '..') return ''
  const root = europarRoot()
  if (!/\\Europar$/i.test(root)) return ''
  return `${root}\\${name}`
}
/** Öffentlicher Getter (nur zur Anzeige/Diagnose). */
export function europarStageDir(dirName: string): string { return guardedStageDir(dirName) }

// ── PowerShell-Bausteine ──────────────────────────────────────────────────────

const FOLDER_LIST_PS = EUROPAR_FOLDERS.map(f => `'${psq(f)}'`).join(',')

/**
 * Baustein: Verzeichnis rekursiv als Hashtable relativer Pfad → Dateigröße einlesen.
 * Damit wird nach dem Kopieren geprüft, ob wirklich JEDE Quelldatei in gleicher Größe
 * am Ziel liegt (statt Robocopy-Ausgabe zu parsen — die ist sprachabhängig).
 */
const PS_HELPERS = [
  `function Get-SkfMap($p) {`,
  `  $m = @{}`,
  `  if (Test-Path -LiteralPath $p) {`,
  `    $root = ([string]$p).TrimEnd('\\')`,
  `    Get-ChildItem -LiteralPath $root -Recurse -File -Force -EA SilentlyContinue | ForEach-Object {`,
  `      if ($_.FullName.Length -gt $root.Length) { $m[$_.FullName.Substring($root.Length).TrimStart('\\').ToLower()] = $_.Length }`,
  `    }`,
  `  }`,
  `  return $m`,
  `}`,
  `function Test-SkfComplete($a, $b) {`,
  `  $src = Get-SkfMap $a; $dst = Get-SkfMap $b`,
  `  $miss = 0; $bytes = 0`,
  `  foreach ($k in $src.Keys) { $bytes += $src[$k]; if (-not $dst.ContainsKey($k) -or $dst[$k] -ne $src[$k]) { $miss++ } }`,
  `  return [pscustomobject]@{ files = $src.Count; bytes = $bytes; missing = $miss }`,
  `}`,
  ROBOCOPY_PS,
].join('\n')

interface RawFolder { name?: string; state?: string; files?: number; bytes?: number; missing?: number; text?: string }

function parseFolders(stdout: string | undefined): { folders: EuroparFolderState[]; err: string } {
  const t = (stdout ?? '').trim()
  if (!t) return { folders: [], err: 'keine Antwort' }
  if (/^ERR:/.test(t)) return { folders: [], err: t.replace(/^ERR:/, '').trim() }
  const m = t.match(/[[{][\s\S]*[\]}]/)
  if (!m) return { folders: [], err: t.slice(0, 200) }
  let parsed: RawFolder[] | RawFolder
  try { parsed = JSON.parse(m[0]) } catch { return { folders: [], err: 'Antwort nicht lesbar' } }
  const arr = Array.isArray(parsed) ? parsed : [parsed]
  return {
    folders: arr.map(f => ({
      name: String(f.name || ''),
      state: f.state === 'ok' ? 'ok' : f.state === 'missing' ? 'missing' : 'incomplete',
      files: Number(f.files) || 0,
      bytes: Number(f.bytes) || 0,
      missing: Number(f.missing) || 0,
      text: f.text ? String(f.text) : undefined,
    })),
    err: '',
  }
}

// ── 0) Schnell-Prüfung: hat das Altgerät die Ordner überhaupt? ────────────────

/**
 * Nur `Test-Path` auf die drei Ordner — ohne die Dateien zu zählen. Das ist der
 * tägliche Scan-Lauf: er entscheidet, ob ein Refresh-Gerät als EuroPAR-Gerät markiert
 * wird. Dateizahl/Größe kommen später beim Sichern dazu (stageEuroparFolders).
 */
export async function probeEuroparOnHost(host: string): Promise<EuroparResult> {
  const h = (host || '').trim()
  if (!h) return { ok: false, folders: [], text: 'Kein Hostname' }
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `try {`,
    `  $base = '\\\\${psq(h)}\\c$'`,
    `  if (-not (Test-Path -LiteralPath $base)) { Write-Output 'ERR:c$-Freigabe nicht erreichbar'; return }`,
    `  $out = @()`,
    `  foreach ($f in @(${FOLDER_LIST_PS})) {`,
    `    $da = Test-Path -LiteralPath (Join-Path $base $f)`,
    `    $out += [pscustomobject]@{ name=$f; state=$(if ($da) { 'ok' } else { 'missing' }); files=0; bytes=0; missing=0 }`,
    `  }`,
    `  ConvertTo-Json -Compress -Depth 4 -InputObject @($out)`,
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 60000)
    const { folders, err } = parseFolders(r.stdout)
    if (err) return { ok: false, folders: [], text: err }
    return { ok: true, folders }
  } catch (e) { return { ok: false, folders: [], text: e instanceof Error ? e.message : String(e) } }
}

// ── 1) Prüfen, welche Ordner das Altgerät überhaupt hat ───────────────────────

/** Liest (ohne zu kopieren), welche der drei Ordner auf C:\ des Altgeräts liegen. */
export async function scanEuroparOnHost(host: string): Promise<EuroparResult> {
  const h = (host || '').trim()
  if (!h) return { ok: false, folders: [], text: 'Kein Hostname' }
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    PS_HELPERS,
    `try {`,
    `  $base = '\\\\${psq(h)}\\c$'`,
    `  if (-not (Test-Path -LiteralPath $base)) { Write-Output 'ERR:c$-Freigabe nicht erreichbar'; return }`,
    `  $out = @()`,
    `  foreach ($f in @(${FOLDER_LIST_PS})) {`,
    `    $p = Join-Path $base $f`,
    `    if (-not (Test-Path -LiteralPath $p)) { $out += [pscustomobject]@{ name=$f; state='missing'; files=0; bytes=0; missing=0 }; continue }`,
    `    $m = Get-SkfMap $p`,
    `    $bytes = 0; foreach ($k in $m.Keys) { $bytes += $m[$k] }`,
    `    $out += [pscustomobject]@{ name=$f; state='ok'; files=$m.Count; bytes=$bytes; missing=0 }`,
    `  }`,
    `  ConvertTo-Json -Compress -Depth 4 -InputObject @($out)`,
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 5 * 60 * 1000)
    const { folders, err } = parseFolders(r.stdout)
    if (err) return { ok: false, folders: [], text: err }
    return { ok: true, folders }
  } catch (e) { return { ok: false, folders: [], text: e instanceof Error ? e.message : String(e) } }
}

// ── 2) Sichern: Altgerät → Netz-Zwischenspeicher ──────────────────────────────

// Kopien sind netzlastig → es läuft immer nur EINE Sicherung gleichzeitig.
let stagingBusy = false
export function isEuroparStagingBusy(): boolean { return stagingBusy }

/**
 * Kopiert die vorhandenen EuroPAR-Ordner vom Altgerät in …\Tool IT\Europar\<dirName>
 * und prüft anschließend jede Datei. Additiv (robocopy /E), löscht nichts.
 */
export async function stageEuroparFolders(oldHost: string, dirName: string): Promise<EuroparResult> {
  const h = (oldHost || '').trim()
  const stage = guardedStageDir(dirName)
  if (!h) return { ok: false, folders: [], text: 'Kein Altgerät-Hostname' }
  if (!stage) return { ok: false, folders: [], text: 'Ungültiger Ordnername für den Zwischenspeicher' }
  if (stagingBusy) return { ok: false, busy: true, folders: [], text: 'Eine andere EuroPAR-Sicherung läuft gerade' }
  stagingBusy = true
  try {
    const script = [
      `$ErrorActionPreference='SilentlyContinue'`,
      PS_HELPERS,
      `try {`,
      `  $base = '\\\\${psq(h)}\\c$'`,
      `  if (-not (Test-Path -LiteralPath $base)) { Write-Output 'ERR:c$-Freigabe des Altgeraets nicht erreichbar'; return }`,
      `  $stage = '${psq(stage)}'`,
      `  New-Item -ItemType Directory -Force -Path $stage | Out-Null`,
      `  if (-not (Test-Path -LiteralPath $stage)) { Write-Output 'ERR:Zwischenspeicher auf dem Netzlaufwerk nicht erreichbar'; return }`,
      `  $out = @()`,
      `  foreach ($f in @(${FOLDER_LIST_PS})) {`,
      `    $src = Join-Path $base $f`,
      `    if (-not (Test-Path -LiteralPath $src)) { $out += [pscustomobject]@{ name=$f; state='missing'; files=0; bytes=0; missing=0 }; continue }`,
      `    $dst = Join-Path $stage $f`,
      `    try {`,
      `      New-Item -ItemType Directory -Force -Path $dst | Out-Null`,
      `      $rc = Copy-SkfTree $src $dst`,
      `      $chk = Test-SkfComplete $src $dst`,
      `      $st = if ($chk.missing -eq 0) { 'ok' } else { 'incomplete' }`,
      `      $out += [pscustomobject]@{ name=$f; state=$st; files=$chk.files; bytes=$chk.bytes; missing=$chk.missing; text=("rc=" + $rc) }`,
      `    } catch { $out += [pscustomobject]@{ name=$f; state='incomplete'; files=0; bytes=0; missing=-1; text=$_.Exception.Message } }`,
      `  }`,
      `  ConvertTo-Json -Compress -Depth 4 -InputObject @($out)`,
      `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
    ].join('\n')
    const r = await api().runPowerShell(script, 60 * 60 * 1000)
    const { folders, err } = parseFolders(r.stdout)
    if (err) return { ok: false, folders: [], text: err }
    const vorhanden = folders.filter(f => f.state !== 'missing')
    const ok = vorhanden.length > 0 && vorhanden.every(f => f.state === 'ok')
    const text = vorhanden.length === 0
      ? 'Auf dem Altgerät liegt keiner der EuroPAR-Ordner.'
      : ok ? `${vorhanden.length} Ordner gesichert.` : `${vorhanden.filter(f => f.state !== 'ok').length} Ordner unvollständig gesichert.`
    return { ok, folders, text }
  } catch (e) {
    return { ok: false, folders: [], text: e instanceof Error ? e.message : String(e) }
  } finally { stagingBusy = false }
}

// ── 3) Übertragen: Zwischenspeicher → neuer PC (+ Aufräumen) ──────────────────

/**
 * Kopiert die gesicherten Ordner aus …\Tool IT\Europar\<dirName> nach C:\ des neuen PCs
 * und prüft jede Datei. Nur wenn ALLE Ordner vollständig angekommen sind, wird der
 * Unterordner im Zwischenspeicher gelöscht (`cleaned`).
 */
export async function applyEuroparFolders(newHost: string, dirName: string): Promise<EuroparResult & { cleaned?: boolean }> {
  const h = (newHost || '').trim()
  const stage = guardedStageDir(dirName)
  if (!h) return { ok: false, folders: [], text: 'Kein Hostname des neuen PCs' }
  if (!stage) return { ok: false, folders: [], text: 'Ungültiger Ordnername im Zwischenspeicher' }
  const script = [
    `$ErrorActionPreference='SilentlyContinue'`,
    PS_HELPERS,
    `try {`,
    `  $stage = '${psq(stage)}'`,
    `  if (-not (Test-Path -LiteralPath $stage)) { Write-Output 'ERR:Keine gesicherten EuroPAR-Ordner gefunden'; return }`,
    `  $base = '\\\\${psq(h)}\\c$'`,
    `  if (-not (Test-Path -LiteralPath $base)) { Write-Output 'ERR:c$-Freigabe des neuen PCs nicht erreichbar'; return }`,
    `  $out = @()`,
    `  foreach ($f in @(${FOLDER_LIST_PS})) {`,
    `    $src = Join-Path $stage $f`,
    `    if (-not (Test-Path -LiteralPath $src)) { $out += [pscustomobject]@{ name=$f; state='missing'; files=0; bytes=0; missing=0 }; continue }`,
    `    $dst = Join-Path $base $f`,
    `    try {`,
    `      New-Item -ItemType Directory -Force -Path $dst | Out-Null`,
    `      $rc = Copy-SkfTree $src $dst`,
    `      $chk = Test-SkfComplete $src $dst`,
    `      $st = if ($chk.missing -eq 0) { 'ok' } else { 'incomplete' }`,
    `      $out += [pscustomobject]@{ name=$f; state=$st; files=$chk.files; bytes=$chk.bytes; missing=$chk.missing; text=("rc=" + $rc) }`,
    `    } catch { $out += [pscustomobject]@{ name=$f; state='incomplete'; files=0; bytes=0; missing=-1; text=$_.Exception.Message } }`,
    `  }`,
    `  ConvertTo-Json -Compress -Depth 4 -InputObject @($out)`,
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
  ].join('\n')
  let folders: EuroparFolderState[] = []
  try {
    const r = await api().runPowerShell(script, 60 * 60 * 1000)
    const p = parseFolders(r.stdout)
    if (p.err) return { ok: false, folders: [], text: p.err }
    folders = p.folders
  } catch (e) { return { ok: false, folders: [], text: e instanceof Error ? e.message : String(e) } }

  const vorhanden = folders.filter(f => f.state !== 'missing')
  const ok = vorhanden.length > 0 && vorhanden.every(f => f.state === 'ok')
  if (!ok) {
    const text = vorhanden.length === 0
      ? 'Im Zwischenspeicher liegen keine EuroPAR-Ordner.'
      : `${vorhanden.filter(f => f.state !== 'ok').length} Ordner unvollständig — Zwischenspeicher bleibt erhalten.`
    return { ok: false, folders, text, cleaned: false }
  }
  // Vollständig angekommen → Zwischenspeicher aufräumen (einziges Löschen des Tools dort).
  const cleaned = await deleteEuroparStage(dirName)
  const sum = vorhanden.reduce((a, f) => a + f.files, 0)
  return {
    ok: true, folders, cleaned,
    text: `${vorhanden.length} Ordner (${sum} Dateien) vollständig übertragen.` + (cleaned ? ' Zwischenspeicher gelöscht.' : ' Zwischenspeicher konnte nicht gelöscht werden.'),
  }
}

/**
 * Löscht NUR …\Tool IT\Europar\<dirName>. Ohne gültigen, abgesicherten Pfad passiert
 * nichts — die Wurzel `Europar` selbst wird nie angefasst.
 */
export async function deleteEuroparStage(dirName: string): Promise<boolean> {
  const stage = guardedStageDir(dirName)
  if (!stage) return false
  try {
    const r = await api().runPowerShell([
      `$p = '${psq(stage)}'`,
      `$root = '${psq(europarRoot())}'`,
      // Doppelte Schranke auch in PowerShell (unabhängig von guardedStageDir): genau eine
      // Ebene unterhalb der Wurzel, kein '..' und kein weiterer Pfadtrenner.
      `$rest = if ($p.ToLower().StartsWith(($root.TrimEnd('\\') + '\\').ToLower())) { $p.Substring($root.TrimEnd('\\').Length + 1) } else { '' }`,
      `if (-not $rest -or $rest.Contains('\\') -or $rest.Contains('..')) { Write-Output 'ERR:Pfad ausserhalb des Zwischenspeichers'; return }`,
      `Remove-Item -LiteralPath $p -Recurse -Force -EA SilentlyContinue`,
      `if (Test-Path -LiteralPath $p) { Write-Output 'ERR:nicht geloescht' } else { Write-Output 'OK' }`,
    ].join('\n'), 120000)
    return (r.stdout || '').includes('OK')
  } catch { return false }
}
