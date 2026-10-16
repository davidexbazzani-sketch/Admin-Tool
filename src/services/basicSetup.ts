// ── Basic: Grundeinrichtung frisch aufgesetzter PCs, komplett aus der Ferne ──
// Ersetzt die drei bisher von Hand ausgeführten PowerShell-Skripte. Statt ein Skript
// auf den PC zu legen, führt das Tool jeden Schritt einzeln aus — und zwar jeweils auf
// dem Weg, der aus der Ferne tatsächlich funktioniert:
//
//   • Maschinen-Sachen (powercfg, HKLM, lokale Gruppen, System-Locale, Windows-Updates)
//     → direkt per WinRM (die Fernsitzung ist Administrator).
//   • Dateien von Netzfreigaben (Autostart-Skripte, Desktop-Verknüpfungen, COSCOM-Paket)
//     → der ADMIN-PC kopiert sie über die Admin-Freigabe c$ aufs Ziel. Damit entfällt
//       das Double-Hop-Problem, an dem eine Fernsitzung sonst scheitern würde.
//   • Benutzer-Sachen (Sprache, Office-Sprache, Intranetzone, Laufwerk verbinden)
//     → über die Hive HKU\<SID> des Zielbenutzers bzw. eine Aufgabe in dessen Kontext.
//
// Ergebnis je Schritt wird zurückgegeben und in der Geräte-Einrichtung mit Zeitstempel
// vermerkt. Pfade kommen aus dem pathService, nicht hartkodiert. [[setup_scripts_feature]]

import { api } from '../electronAPI'
import { pathService } from './pathService'
import { runInUserContext } from './printerConnections'
import { installWindowsUpdates } from './migrationOps'
import { setGermanEverywhere } from './languageSetup'
import { ensureWinRM } from '../utils/winrmUtils'
import { RESOLVE_USER_HIVE_PS, UNLOAD_USER_HIVE_PS } from '../utils/userHive'
import { ROBOCOPY_PS } from '../utils/robocopy'

export type BasicScriptId = 'elitebook' | 'mini' | 'workstation'

export interface BasicScript {
  id: BasicScriptId
  label: string
  /** Modell-Typen (classifyModel), für die diese Variante gilt */
  kategorien: string[]
}

export const BASIC_SCRIPTS: BasicScript[] = [
  { id: 'elitebook', label: 'EliteBook (Laptop)', kategorien: ['Laptop Standard', 'Laptop light'] },
  { id: 'mini', label: 'Mini-PC', kategorien: ['Desktop Mini'] },
  { id: 'workstation', label: 'ZBook / Tower (Workstation)', kategorien: ['Laptop Workstation', 'Desktop Workstation'] },
]

/** Passende Variante zum Modell-Typ des neuen Geräts — null, wenn keine zugeordnet ist. */
export function basicScriptForCategory(kategorie: string): BasicScript | null {
  const k = (kategorie || '').trim()
  if (!k) return null
  return BASIC_SCRIPTS.find(s => s.kategorien.includes(k)) || null
}

export interface BasicStepResult {
  id: string
  label: string
  status: 'offen' | 'laeuft' | 'ok' | 'fehler' | 'teilweise'
  text?: string
}
export interface BasicRunResult {
  ok: boolean
  steps: BasicStepResult[]
  finishedAt: string
  scriptId: BasicScriptId
}

// ── Schritt-Listen je Variante (auch für die Anzeige VOR dem Lauf) ────────────

interface StepDef { id: string; label: string; run: (c: Ctx) => Promise<StepOut> }
interface StepOut { ok: boolean; text?: string; teilweise?: boolean }
interface Ctx { host: string; corpId: string }

function psq(s: string): string { return (s || '').replace(/'/g, "''") }

/** PowerShell auf dem Ziel-PC als Administrator (WinRM). */
async function remote(host: string, inner: string, timeoutMs = 120000): Promise<{ ok: boolean; out: string }> {
  const up = await ensureWinRM(host)
  if (!up) return { ok: false, out: 'WinRM nicht erreichbar' }
  const script = `try { $o = Invoke-Command -ComputerName '${psq(host)}' -ErrorAction Stop -ScriptBlock { ${inner} }; Write-Output ([string]$o) } catch { Write-Output ('ERR:' + $_.Exception.Message) }`
  try {
    const r = await api().runPowerShell(script, timeoutMs)
    const out = (r.stdout ?? '').trim()
    return { ok: !out.startsWith('ERR:'), out: out.replace(/^ERR:/, '') }
  } catch (e) { return { ok: false, out: e instanceof Error ? e.message : String(e) } }
}

/** Lokalen Pfad auf dem Ziel-PC in die Admin-Freigabe übersetzen (C:\x → \\host\c$\x). */
function unc(host: string, lokal: string): string {
  return lokal.replace(/^([A-Za-z]):/, (_m, d: string) => `\\\\${host}\\${d}$`)
}

/**
 * Datei(en) vom Netz über den Admin-PC aufs Ziel kopieren. Läuft am Admin-PC, der
 * sowohl die Quelle als auch \\host\c$ erreicht — kein Double Hop.
 * Gibt zurück, wie viele Quellen gefunden und kopiert wurden.
 */
async function copyFiles(host: string, quellen: string[], zielLokal: string): Promise<StepOut> {
  if (quellen.length === 0) return { ok: true, text: 'nichts zu kopieren' }
  const ziel = unc(host, zielLokal)
  const liste = quellen.map(q => `'${psq(q)}'`).join(',')
  const script = [
    `$ziel = '${psq(ziel)}'`,
    `if (-not (Test-Path -LiteralPath $ziel)) { New-Item -ItemType Directory -Force -Path $ziel | Out-Null }`,
    `if (-not (Test-Path -LiteralPath $ziel)) { Write-Output 'ERR:Ziel nicht erreichbar'; return }`,
    `$ok = 0; $fehlt = @(); $err = @()`,
    `foreach ($q in @(${liste})) {`,
    `  if (-not (Test-Path -LiteralPath $q)) { $fehlt += (Split-Path $q -Leaf); continue }`,
    `  try { Copy-Item -LiteralPath $q -Destination $ziel -Force -EA Stop; $ok++ } catch { $err += ((Split-Path $q -Leaf) + ': ' + $_.Exception.Message) }`,
    `}`,
    `Write-Output ('RES:' + $ok + '|' + ($fehlt -join ';') + '|' + ($err -join ';'))`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 180000)
    const line = ((r.stdout ?? '').split(/\r?\n/).find(l => l.trim().startsWith('RES:')) || '').trim()
    if (!line) {
      const out = (r.stdout ?? '').trim()
      return { ok: false, text: out.replace(/^ERR:/, '') || 'keine Antwort' }
    }
    const [n, fehlt, err] = line.slice(4).split('|')
    const teile = [`${n} von ${quellen.length} kopiert`]
    if (fehlt) teile.push(`nicht gefunden: ${fehlt}`)
    if (err) teile.push(`Fehler: ${err}`)
    const alle = Number(n) === quellen.length
    return { ok: Number(n) > 0 || quellen.length === 0, teilweise: !alle && Number(n) > 0, text: teile.join(' · ') }
  } catch (e) { return { ok: false, text: e instanceof Error ? e.message : String(e) } }
}

/** Ordner vom Netz über den Admin-PC aufs Ziel spiegeln (robocopy /E, additiv). */
async function copyFolder(host: string, quelle: string, zielLokal: string): Promise<StepOut> {
  const ziel = unc(host, zielLokal)
  const script = [
    `$q = '${psq(quelle)}'`,
    `if (-not (Test-Path -LiteralPath $q)) { Write-Output 'RES:MISSING'; return }`,
    `$z = '${psq(ziel)}'`,
    `New-Item -ItemType Directory -Force -Path $z | Out-Null`,
    ROBOCOPY_PS,
    `$rc = Copy-SkfTree $q $z`,
    `$n = @(Get-ChildItem -LiteralPath $z -Recurse -File -Force -EA SilentlyContinue).Count`,
    `Write-Output ('RES:' + $rc + '|' + $n)`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 30 * 60 * 1000)
    const line = ((r.stdout ?? '').split(/\r?\n/).find(l => l.trim().startsWith('RES:')) || '').trim()
    if (!line) return { ok: false, text: (r.stdout ?? '').trim().slice(0, 160) || 'keine Antwort' }
    const rest = line.slice(4)
    if (rest === 'MISSING') return { ok: false, text: 'Quelle auf dem Netzlaufwerk nicht gefunden' }
    const [rc, n] = rest.split('|')
    const fehler = Number(rc) >= 8
    return { ok: !fehler, text: fehler ? `robocopy Exit-Code ${rc}` : `${n} Dateien auf dem PC` }
  } catch (e) { return { ok: false, text: e instanceof Error ? e.message : String(e) } }
}

/** Registry-Werte in der Hive des ZIELBENUTZERS setzen (nicht im Admin-Profil). */
async function setUserRegistry(
  host: string, corpId: string, werte: { relKey: string; name: string; value: string | number; type: 'String' | 'DWord' }[],
): Promise<StepOut> {
  const json = JSON.stringify(werte)
  const inner = [
    `param($wertJson, $corp)`,
    `$out = [ordered]@{ ok=$false; user=$null; hiveLoaded=$false; gesetzt=0; error=$null }`,
    `$uTmp = $null; $uHiveLoaded = $false`,
    `try {`,
    RESOLVE_USER_HIVE_PS,
    `  if (-not $uHive) { $out.error = 'Kein Benutzerprofil auf dem PC gefunden'; return ((New-Object psobject -Property $out) | ConvertTo-Json -Compress) }`,
    `  foreach ($w in @((ConvertFrom-Json $wertJson))) {`,
    `    $pfad = $uHive + '\\' + $w.relKey`,
    `    if (-not (Test-Path -LiteralPath $pfad)) { New-Item -Path $pfad -Force | Out-Null }`,
    `    $val = if ($w.type -eq 'DWord') { [int]$w.value } else { [string]$w.value }`,
    `    New-ItemProperty -LiteralPath $pfad -Name $w.name -PropertyType $w.type -Value $val -Force | Out-Null`,
    `    $out.gesetzt++`,
    `  }`,
    `  $out.ok = $true`,
    `} catch { $out.error = "$_" } finally {`,
    UNLOAD_USER_HIVE_PS,
    `}`,
    `(New-Object psobject -Property $out) | ConvertTo-Json -Compress`,
  ].join('\n')
  const up = await ensureWinRM(host)
  if (!up) return { ok: false, text: 'WinRM nicht erreichbar' }
  const script = [
    `try {`,
    `  $o = Invoke-Command -ComputerName '${psq(host)}' -ErrorAction Stop -ArgumentList '${psq(json)}','${psq(corpId)}' -ScriptBlock {`,
    inner,
    `  }`,
    `  Write-Output ([string]$o)`,
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 120000)
    const t = (r.stdout ?? '').trim()
    if (!t || t.startsWith('ERR:')) return { ok: false, text: t.replace(/^ERR:/, '') || 'keine Antwort' }
    const m = t.match(/\{[\s\S]*\}/)
    if (!m) return { ok: false, text: t.slice(0, 160) }
    const j = JSON.parse(m[0]) as { ok?: boolean; user?: string; gesetzt?: number; error?: string }
    if (!j.ok) return { ok: false, text: j.error || 'fehlgeschlagen' }
    return { ok: true, text: `${j.gesetzt} Wert(e) für ${j.user || 'Benutzer'} gesetzt` }
  } catch (e) { return { ok: false, text: e instanceof Error ? e.message : String(e) } }
}

// ── Netzpfade (aus dem pathService, keine harten Strings) ─────────────────────

const STARTUP_DIR = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\StartUp'
const PUBLIC_DESKTOP = 'C:\\Users\\Public\\Desktop'

function marineRoot() { return pathService.getMarineRoot('unc') }
function publicRoot() { return pathService.getPublicRoot('unc') }

// ── Einzelne Schritte ─────────────────────────────────────────────────────────

/** I: als Autostart hinterlegen (wirkt bei jeder Anmeldung) + sofort verbinden. */
const schrittNetzlaufwerk: StepDef = {
  id: 'drive',
  label: 'Netzlaufwerk I: + Autostart',
  async run({ host }) {
    const netz = marineRoot()
    // Autostart-Datei direkt auf dem Ziel erzeugen (Maschinenebene, kein Netzzugriff nötig).
    const inner = [
      `try {`,
      `  $d = '${psq(STARTUP_DIR)}'`,
      `  if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }`,
      `  $bat = Join-Path $d 'MapI.bat'`,
      `  Set-Content -LiteralPath $bat -Value ('net use I: "' + '${psq(netz)}' + '" /persistent:yes') -Encoding ASCII -Force`,
      `  'OK'`,
      `} catch { 'ERR:' + $_.Exception.Message }`,
    ].join('\n')
    const r = await remote(host, inner, 60000)
    if (!r.ok || !r.out.includes('OK')) return { ok: false, text: r.out || 'Autostart-Datei fehlgeschlagen' }
    // Zusätzlich sofort im Kontext des angemeldeten Benutzers verbinden (best effort).
    const live = await runInUserContext(host, `try { cmd /c 'net use I: "${netz.replace(/"/g, '')}" /persistent:yes' | Out-Null } catch {}`, 60000)
    return { ok: true, teilweise: !live.ok, text: live.ok ? 'Autostart gesetzt, I: sofort verbunden' : 'Autostart gesetzt (sofortiges Verbinden erst bei nächster Anmeldung)' }
  },
}

/** Zusätzliches Mapping-Skript vom Netz in den Autostart (EliteBook). */
const schrittMappingBat: StepDef = {
  id: 'mappingbat',
  label: 'Mapping I.bat in den Autostart',
  run: ({ host }) => copyFiles(host, [`${publicRoot()}\\Davide\\IT-Support\\Mapping I.bat`], STARTUP_DIR),
}

const schrittSprache: StepDef = {
  id: 'language',
  label: 'Sprache komplett auf Deutsch (auch für künftige Benutzer)',
  async run({ host }) {
    // Deckt Sprachpaket, System-Gebietsschema, Default-Profil (= neue Anmeldungen),
    // Anmeldebildschirm, alle vorhandenen Profile und Office ab — siehe languageSetup.ts.
    const r = await setGermanEverywhere(host)
    const fehler = r.steps.filter(st => !st.ok)
    return { ok: r.ok || r.steps.some(st => st.ok), teilweise: !r.ok && r.steps.some(st => st.ok), text: r.text || (fehler.length ? fehler[0].text : undefined) }
  },
}

const schrittEnergie: StepDef = {
  id: 'power',
  label: 'Energieoptionen (kein Standby/Ruhezustand)',
  async run({ host }) {
    const inner = [
      `try {`,
      `  $p = "$env:SystemRoot\\System32\\powercfg.exe"`,
      `  foreach ($a in 'monitor-timeout-ac','monitor-timeout-dc','standby-timeout-ac','standby-timeout-dc','hibernate-timeout-ac','hibernate-timeout-dc') { & $p /change $a 0 | Out-Null }`,
      `  'OK'`,
      `} catch { 'ERR:' + $_.Exception.Message }`,
    ].join('\n')
    const r = await remote(host, inner, 90000)
    return { ok: r.ok && r.out.includes('OK'), text: r.ok && r.out.includes('OK') ? 'alle Zeitlimits auf 0' : r.out }
  },
}

const schrittSperrbildschirm: StepDef = {
  id: 'nolock',
  label: 'Sperrbildschirm deaktivieren',
  async run({ host }) {
    const inner = [
      `try {`,
      `  $k = 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization'`,
      `  if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }`,
      `  New-ItemProperty -Path $k -Name 'NoLockScreen' -PropertyType DWord -Value 1 -Force | Out-Null`,
      `  'OK'`,
      `} catch { 'ERR:' + $_.Exception.Message }`,
    ].join('\n')
    const r = await remote(host, inner, 60000)
    return { ok: r.ok && r.out.includes('OK'), text: r.ok && r.out.includes('OK') ? 'NoLockScreen gesetzt' : r.out }
  },
}

const schrittVerknuepfungen: StepDef = {
  id: 'shortcuts',
  label: 'Desktop-Verknüpfungen (BDE, Instandsetzung, DontSleep)',
  run: ({ host }) => copyFiles(host, [
    `${publicRoot()}\\BDE\\Verknüpfung_Desktop\\BDE Montage.url`,
    `${publicRoot()}\\BDE\\Verknüpfung_Desktop\\BDE.url`,
    `${publicRoot()}\\Davide\\SOFTWARE\\Instandhaltung\\Instandsetzung.url`,
    pathService.getToolExecutable('dontSleep', 'unc'),
  ].filter(Boolean), PUBLIC_DESKTOP),
}

const schrittCoscom: StepDef = {
  id: 'coscom',
  label: 'COSCOM-Paket nach C:\\ + Autostart-Mapping',
  async run({ host }) {
    const quelle = `${publicRoot()}\\Davide\\SOFTWARE\\COSCOM\\Coscom Paket`
    const r = await copyFolder(host, quelle, 'C:\\Coscom Paket')
    if (!r.ok) return r
    const bat = await copyFiles(host, [`${quelle}\\Mapping.bat`], STARTUP_DIR)
    return { ok: true, teilweise: !bat.ok, text: `${r.text}${bat.ok ? ' · Mapping.bat im Autostart' : ' · Mapping.bat nicht hinterlegt'}` }
  },
}

const schrittAdminGruppen: StepDef = {
  id: 'admins',
  label: 'Lokale Admin-Gruppen (SolidWorks PortaX)',
  async run({ host }) {
    const gruppen = [
      'CORP\\FS_W3143_Solidworks PortaX Marine_ABD',
      'CORP\\FS_W3143_Solidworks PortaX Marine_FUE',
      'CORP\\FS_W3143_Solidworks PortaX Marine_LAGER',
      'CORP\\FS_W3143_Solidworks PortaX Marine_STABI',
    ]
    const inner = [
      `$g = Get-LocalGroup -SID 'S-1-5-32-544'`,
      `$neu = 0; $schon = 0; $err = @()`,
      `foreach ($m in @(${gruppen.map(g => `'${psq(g)}'`).join(',')})) {`,
      `  try {`,
      `    $mitglieder = Get-LocalGroupMember -Group $g -EA SilentlyContinue`,
      `    if ($mitglieder.Name -contains $m) { $schon++; continue }`,
      `    Add-LocalGroupMember -Group $g -Member $m -EA Stop; $neu++`,
      `  } catch { $err += ($m.Split('\\')[-1] + ': ' + $_.Exception.Message) }`,
      `}`,
      `'RES:' + $neu + '|' + $schon + '|' + ($err -join '; ')`,
    ].join('\n')
    const r = await remote(host, inner, 120000)
    const m = r.out.match(/RES:(\d+)\|(\d+)\|(.*)/s)
    if (!m) return { ok: false, text: r.out || 'keine Antwort' }
    const [, neu, schon, err] = m
    const teile = [`${neu} hinzugefügt`, `${schon} bereits vorhanden`]
    if (err.trim()) teile.push(`Fehler: ${err.trim()}`)
    return { ok: !err.trim(), teilweise: !!err.trim() && Number(neu) + Number(schon) > 0, text: teile.join(' · ') }
  },
}

const schrittIntranetzone: StepDef = {
  id: 'intranet',
  label: 'Intranetzone w3143',
  run: ({ host, corpId }) => setUserRegistry(host, corpId, [
    { relKey: 'Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings\\ZoneMap\\Domains\\skf.net\\w3143.corp', name: 'file', value: 1, type: 'DWord' },
  ]),
}

const schrittUac: StepDef = {
  id: 'uac',
  label: 'UAC auf „nie benachrichtigen"',
  async run({ host }) {
    const inner = [
      `try {`,
      `  $k = 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System'`,
      `  Set-ItemProperty -Path $k -Name 'ConsentPromptBehaviorAdmin' -Value 0 -EA Stop`,
      `  Set-ItemProperty -Path $k -Name 'PromptOnSecureDesktop' -Value 0 -EA Stop`,
      `  'OK'`,
      `} catch { 'ERR:' + $_.Exception.Message }`,
    ].join('\n')
    const r = await remote(host, inner, 60000)
    return { ok: r.ok && r.out.includes('OK'), text: r.ok && r.out.includes('OK') ? 'gesetzt' : r.out }
  },
}

const schrittSolidWorksRobocopy: StepDef = {
  id: 'swrobocopy',
  label: 'C:\\TEMP + SolidWorks-Robocopy anstoßen',
  async run({ host }) {
    const mk = await remote(host, `try { if (-not (Test-Path 'C:\\TEMP')) { New-Item -Path 'C:\\TEMP' -ItemType Directory -Force | Out-Null }; 'OK' } catch { 'ERR:' + $_.Exception.Message }`, 60000)
    if (!mk.ok) return { ok: false, text: mk.out }
    // Die .bat liegt auf einer Netzfreigabe → im Benutzerkontext starten (dessen
    // Anmeldedaten gelten auf dem Server). Läuft dort im Hintergrund weiter.
    const bat = pathService.getSoftwarePath('solidworks', 'robocopyFallback', 'unc')
    if (!bat) return { ok: false, text: 'Kein Robocopy-Skript in den Pfaden hinterlegt' }
    const r = await runInUserContext(host, `if (Test-Path '${psq(bat)}') { Start-Process '${psq(bat)}' } else { throw 'Robocopy-Skript nicht erreichbar' }`, 90000)
    return { ok: r.ok, text: r.ok ? 'C:\\TEMP angelegt, Robocopy im Hintergrund gestartet' : `C:\\TEMP angelegt · Robocopy: ${r.text}` }
  },
}

const schrittUpdates: StepDef = {
  id: 'winupdate',
  label: 'Windows-Updates installieren (dauert)',
  async run({ host }) {
    const r = await installWindowsUpdates(host)
    return { ok: r.ok, text: r.text }
  },
}

/** Reihenfolge je Variante — genau das, was die bisherigen Skripte gemacht haben. */
function stepsFor(id: BasicScriptId): StepDef[] {
  const gemeinsamEnde = [schrittSprache, schrittEnergie, schrittUpdates]
  if (id === 'elitebook') return [schrittNetzlaufwerk, schrittMappingBat, ...gemeinsamEnde]
  if (id === 'mini') return [schrittNetzlaufwerk, schrittSprache, schrittEnergie, schrittSperrbildschirm, schrittVerknuepfungen, schrittCoscom, schrittUpdates]
  return [schrittAdminGruppen, schrittIntranetzone, schrittUac, schrittNetzlaufwerk, schrittSolidWorksRobocopy, ...gemeinsamEnde]
}

/** Schritte einer Variante zur Anzeige (ohne sie auszuführen). */
export function basicStepList(id: BasicScriptId): BasicStepResult[] {
  return stepsFor(id).map(s => ({ id: s.id, label: s.label, status: 'offen' as const }))
}

// ── Fortschritt (modulweit, damit ein Kachelwechsel den Lauf nicht abschneidet) ─

type Listener = () => void
const fortschritt = new Map<string, BasicStepResult[]>()
const listeners = new Set<Listener>()
function key(host: string) { return host.toLowerCase() }
function melden() { for (const l of listeners) l() }

export function subscribeBasicProgress(l: Listener): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}
export function basicProgress(host: string): BasicStepResult[] | undefined {
  return fortschritt.get(key(host))
}

// ── Lauf ──────────────────────────────────────────────────────────────────────

/**
 * Führt die Grundeinrichtung komplett aus der Ferne aus. Bricht NICHT bei einem
 * fehlgeschlagenen Schritt ab — jeder Schritt wird einzeln bewertet, damit am Ende
 * sichtbar ist, was durchlief und was nicht.
 */
export async function runBasicSetup(newHost: string, corpId: string, scriptId: BasicScriptId, nurSchritt?: string): Promise<BasicRunResult> {
  const host = (newHost || '').trim()
  // nurSchritt = einzelnen Schritt nachziehen, ohne den ganzen Lauf (z. B. nur die Sprache).
  const defs = nurSchritt ? stepsFor(scriptId).filter(s => s.id === nurSchritt) : stepsFor(scriptId)
  const stand: BasicStepResult[] = defs.map(s => ({ id: s.id, label: s.label, status: 'offen' }))
  fortschritt.set(key(host), stand)
  melden()

  for (let i = 0; i < defs.length; i++) {
    stand[i] = { ...stand[i], status: 'laeuft' }
    fortschritt.set(key(host), [...stand]); melden()
    let out: StepOut
    try { out = await defs[i].run({ host, corpId: (corpId || '').trim() }) }
    catch (e) { out = { ok: false, text: e instanceof Error ? e.message : String(e) } }
    stand[i] = {
      ...stand[i],
      status: out.ok ? (out.teilweise ? 'teilweise' : 'ok') : 'fehler',
      text: out.text,
    }
    fortschritt.set(key(host), [...stand]); melden()
  }

  const ok = stand.every(s => s.status === 'ok' || s.status === 'teilweise')
  return { ok, steps: stand, finishedAt: new Date().toISOString(), scriptId }
}
