// ── EuroPAR, Teil 2: Umgebungsvariablen auf dem neuen PC ─────────────────────
// Nur für EuroPAR-Geräte relevant (Altgerät hat C:\EuroPAR & Co. — siehe europar.ts).
// Benutzer-Variablen werden in die Registry-Hive des Zielbenutzers geschrieben
// (HKU\<SID>\Environment); ist niemand angemeldet, wird NTUSER.DAT temporär geladen
// und im finally wieder entladen (Muster aus src/swCheck/applyFix.ts). Die System-
// variable geht über [Environment]::SetEnvironmentVariable(…, 'Machine').
// `Path` wird NIE überschrieben, sondern nur ergänzt, wenn der Eintrag fehlt.
// [[europar_folder_migration]]

import { api } from '../electronAPI'
import { RESOLVE_USER_HIVE_PS, UNLOAD_USER_HIVE_PS } from '../utils/userHive'
import { writeTempFile as writeEnvTempFile, copyToPublicDesktop as copyEnvToPublicDesktop } from './onboardingDeploy'

/** UTF-16LE-Base64 fuer powershell -EncodedCommand. */
function toEnvEncodedCommand(ps: string): string {
  let bin = ''
  for (let i = 0; i < ps.length; i++) { const c = ps.charCodeAt(i); bin += String.fromCharCode(c & 0xff, (c >> 8) & 0xff) }
  return btoa(bin)
}

export interface EuroparEnvVar {
  name: string
  value: string
  scope: 'user' | 'machine'
  /** 'set' = exakt setzen · 'appendPath' = nur anhängen, wenn noch nicht enthalten */
  mode: 'set' | 'appendPath'
}

/** Soll-Zustand des EuroPAR-Arbeitsplatzes (Benutzer- + Systemvariablen). */
export const EUROPAR_ENV_VARS: EuroparEnvVar[] = [
  { name: 'EURO_EURN', value: 'Q:', scope: 'user', mode: 'set' },
  { name: 'EURO_WRKN', value: 'C:\\local', scope: 'user', mode: 'set' },
  { name: 'Path', value: 'Q:\\Eurnc\\cmdnc0', scope: 'user', mode: 'appendPath' },
  { name: 'EURO_EURN', value: 'Q:', scope: 'machine', mode: 'set' },
]

export interface EuroparEnvState {
  name: string
  scope: 'user' | 'machine'
  soll: string
  ist: string
  /** true = Soll erfüllt (bei Path: Eintrag bereits enthalten) */
  erfuellt: boolean
  geaendert?: boolean
  error?: string
}
export interface EuroparEnvResult {
  ok: boolean
  vars: EuroparEnvState[]
  user?: string        // Benutzer, dessen Hive gelesen/geschrieben wurde
  hiveLoaded?: boolean // NTUSER.DAT musste geladen werden (niemand angemeldet)
  text?: string
}

function psq(s: string): string { return (s || '').replace(/'/g, "''") }

/** Skript, das auf dem Zielrechner läuft — liest ('read') bzw. setzt ('apply'). */
const INNER_PS = [
  `param($varsJson, $mode, $corp)`,
  `$out = [ordered]@{ ok=$false; user=$null; hiveLoaded=$false; vars=@(); error=$null }`,
  `$uTmp = $null; $uHiveLoaded = $false`,
  `try {`,
  `  $defs = @((ConvertFrom-Json $varsJson))`,
  RESOLVE_USER_HIVE_PS,
  `  $envKey = $null`,
  `  if ($uHive) { $envKey = $uHive + '\\Environment' }`,
  `  if ($envKey -and -not (Test-Path -LiteralPath $envKey)) { New-Item -Path $envKey -Force | Out-Null }`,
  `  $res = @()`,
  `  foreach ($d in $defs) {`,
  `    $r = [ordered]@{ name=$d.name; scope=$d.scope; soll=$d.value; ist=''; erfuellt=$false; geaendert=$false; error=$null }`,
  `    try {`,
  `      if ($d.scope -eq 'machine') {`,
  `        $alt = [string][Environment]::GetEnvironmentVariable($d.name, 'Machine')`,
  `        $r.ist = $alt`,
  `        $r.erfuellt = ($alt -ieq [string]$d.value)`,
  `        if ($mode -eq 'apply' -and -not $r.erfuellt) {`,
  `          [Environment]::SetEnvironmentVariable($d.name, [string]$d.value, 'Machine')`,
  `          $r.ist = [string]$d.value; $r.geaendert = $true; $r.erfuellt = $true`,
  `        }`,
  `      } else {`,
  `        if (-not $envKey) { throw 'Kein Benutzerprofil auf dem Zielrechner gefunden' }`,
  `        $cur = Get-ItemProperty -LiteralPath $envKey -Name $d.name -EA SilentlyContinue`,
  `        $alt = ''`,
  `        if ($cur -and (($cur.PSObject.Properties.Name) -contains $d.name)) { $alt = [string]$cur.$($d.name) }`,
  `        $r.ist = $alt`,
  `        $kind = 'String'`,
  `        if ($d.name -ieq 'Path') { $kind = 'ExpandString' }`,
  `        try { if ((Get-Item -LiteralPath $envKey).GetValueKind($d.name) -eq 'ExpandString') { $kind = 'ExpandString' } } catch { }`,
  `        if ($d.mode -eq 'appendPath') {`,
  `          $teile = @($alt -split ';' | Where-Object { $_ -ne '' })`,
  `          $drin = @($teile | Where-Object { $_.Trim().TrimEnd('\\') -ieq ([string]$d.value).TrimEnd('\\') }).Count -gt 0`,
  `          $r.erfuellt = $drin`,
  `          if ($mode -eq 'apply' -and -not $drin) {`,
  `            $neu = [string]$d.value`,
  `            if ($alt) { $neu = $alt.TrimEnd(';') + ';' + [string]$d.value }`,
  `            New-ItemProperty -LiteralPath $envKey -Name $d.name -PropertyType $kind -Value $neu -Force | Out-Null`,
  `            $r.ist = $neu; $r.geaendert = $true; $r.erfuellt = $true`,
  `          }`,
  `        } else {`,
  `          $r.erfuellt = ($alt -ieq [string]$d.value)`,
  `          if ($mode -eq 'apply' -and -not $r.erfuellt) {`,
  `            New-ItemProperty -LiteralPath $envKey -Name $d.name -PropertyType $kind -Value ([string]$d.value) -Force | Out-Null`,
  `            $r.ist = [string]$d.value; $r.geaendert = $true; $r.erfuellt = $true`,
  `          }`,
  `        }`,
  `      }`,
  `    } catch { $r.error = "$_" }`,
  `    $res += (New-Object psobject -Property $r)`,
  `  }`,
  `  $out.vars = $res`,
  `  $out.ok = (@($res | Where-Object { $_.error }).Count -eq 0)`,
  `} catch { $out.error = "$_" } finally {`,
  UNLOAD_USER_HIVE_PS,
  `}`,
  `(New-Object psobject -Property $out) | ConvertTo-Json -Depth 6 -Compress`,
].join('\n')

interface RawEnv { name?: string; scope?: string; soll?: string; ist?: string; erfuellt?: boolean; geaendert?: boolean; error?: string }

async function runEuroparEnv(newHost: string, corpId: string, mode: 'read' | 'apply'): Promise<EuroparEnvResult> {
  const h = (newHost || '').trim()
  if (!h) return { ok: false, vars: [], text: 'Kein Hostname des neuen PCs' }
  const defs = JSON.stringify(EUROPAR_ENV_VARS.map(v => ({ name: v.name, value: v.value, scope: v.scope, mode: v.mode })))
  const script = [
    `try {`,
    `  $o = Invoke-Command -ComputerName '${psq(h)}' -ErrorAction Stop -ArgumentList '${psq(defs)}','${mode}','${psq((corpId || '').trim())}' -ScriptBlock {`,
    INNER_PS,
    `  }`,
    `  Write-Output ([string]$o)`,
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
  ].join('\n')
  try {
    const r = await api().runPowerShell(script, 120000)
    const t = (r.stdout ?? '').trim()
    if (!t || t.startsWith('ERR:')) return { ok: false, vars: [], text: t.replace(/^ERR:/, '').trim() || 'keine Antwort' }
    const m = t.match(/\{[\s\S]*\}/)
    if (!m) return { ok: false, vars: [], text: t.slice(0, 200) }
    const j = JSON.parse(m[0]) as { ok?: boolean; user?: string; hiveLoaded?: boolean; error?: string; vars?: RawEnv[] | RawEnv }
    const raw = Array.isArray(j.vars) ? j.vars : j.vars ? [j.vars] : []
    const vars: EuroparEnvState[] = raw.map(v => ({
      name: String(v.name || ''),
      scope: v.scope === 'machine' ? 'machine' : 'user',
      soll: String(v.soll ?? ''),
      ist: String(v.ist ?? ''),
      erfuellt: !!v.erfuellt,
      geaendert: !!v.geaendert,
      error: v.error ? String(v.error) : undefined,
    }))
    const fehler = vars.filter(v => v.error)
    return {
      ok: !!j.ok && !j.error,
      vars,
      user: j.user ? String(j.user) : undefined,
      hiveLoaded: !!j.hiveLoaded,
      text: j.error ? String(j.error) : fehler.length ? `${fehler.length} Variable(n) fehlgeschlagen` : undefined,
    }
  } catch (e) { return { ok: false, vars: [], text: e instanceof Error ? e.message : String(e) } }
}

/** Ist-Zustand auf dem neuen PC lesen — verändert nichts. */
export function readEuroparEnvVars(newHost: string, corpId: string): Promise<EuroparEnvResult> {
  return runEuroparEnv(newHost, corpId, 'read')
}

/** Soll-Zustand herstellen. Bereits passende Werte bleiben unangetastet, `Path` wird nur ergänzt. */
export async function applyEuroparEnvVars(newHost: string, corpId: string): Promise<EuroparEnvResult> {
  const r = await runEuroparEnv(newHost, corpId, 'apply')
  if (!r.ok) return r
  const n = r.vars.filter(v => v.geaendert).length
  return {
    ...r,
    text: n === 0
      ? 'Alle Variablen waren bereits gesetzt.'
      : `${n} von ${r.vars.length} Variablen gesetzt${r.user ? ` (Benutzer ${r.user})` : ''}. Neuanmeldung nötig.`,
  }
}

/** true = alle Soll-Variablen sind auf dem Zielrechner erfüllt. */
export function europarEnvKomplett(vars?: EuroparEnvState[]): boolean {
  return !!vars && vars.length === EUROPAR_ENV_VARS.length && vars.every(v => v.erfuellt)
}

// ── Variante ohne Adminrechte: .bat auf dem öffentlichen Desktop ─────────────

/**
 * Legt eine .bat auf den öffentlichen Desktop, die der Anwender OHNE Adminrechte
 * ausführen kann. Sie setzt die drei BENUTZER-Variablen über
 * [Environment]::SetEnvironmentVariable(…, 'User') — das schreibt nach HKCU und braucht
 * keine erhöhten Rechte. `Path` wird wie im Tool nur ergänzt, nie überschrieben.
 *
 * Die SYSTEM-Variable EURO_EURN kann eine Nicht-Admin-Sitzung nicht setzen; das bleibt
 * Aufgabe des Tools (applyEuroparEnvVars). Die .bat sagt das dem Anwender auch.
 */
export async function deployEuroparEnvScript(newHost: string): Promise<{ ok: boolean; text?: string }> {
  const fileName = 'SKF-EuroPAR-Variablen.cmd'
  const benutzer = EUROPAR_ENV_VARS.filter(v => v.scope === 'user')

  const ps: string[] = [`$ErrorActionPreference='Continue'`, `$n=0`]
  for (const v of benutzer) {
    const name = psq(v.name)
    const wert = psq(v.value)
    if (v.mode === 'appendPath') {
      ps.push(
        `$p=[Environment]::GetEnvironmentVariable('${name}','User')`,
        `$teile=@(($p -split ';') | Where-Object { $_ -ne '' })`,
        `if (-not ($teile | Where-Object { $_.Trim().TrimEnd('\') -ieq '${wert}' })) {`,
        `  $neu = if ($p) { $p.TrimEnd(';') + ';' + '${wert}' } else { '${wert}' }`,
        `  [Environment]::SetEnvironmentVariable('${name}', $neu, 'User'); $n++`,
        `  Write-Host '  ${name}: Eintrag ergaenzt'`,
        `} else { Write-Host '  ${name}: Eintrag war schon vorhanden' }`,
      )
    } else {
      ps.push(
        `if ([Environment]::GetEnvironmentVariable('${name}','User') -ne '${wert}') {`,
        `  [Environment]::SetEnvironmentVariable('${name}', '${wert}', 'User'); $n++`,
        `  Write-Host '  ${name} = ${wert}'`,
        `} else { Write-Host '  ${name}: war schon gesetzt' }`,
      )
    }
  }
  ps.push(`Write-Host ''`, `Write-Host ("$n Variable(n) geaendert.")`, `exit 0`)

  const enc = toEnvEncodedCommand(ps.join('\n'))
  const cmd = [
    `@echo off`,
    `title SKF EuroPAR-Umgebungsvariablen`,
    `echo Setze die EuroPAR-Variablen fuer Ihren Benutzer...`,
    `echo.`,
    `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${enc}`,
    `echo.`,
    `echo Bitte einmal ab- und wieder anmelden, damit die Variablen greifen.`,
    `echo (Die System-Variable EURO_EURN setzt die IT - dafuer werden Adminrechte benoetigt.)`,
    `pause`,
    `(goto) 2>nul & del "%~f0"`,
  ].join('\r\n')

  const tmp = await writeEnvTempFile(cmd, `europarenv_${Date.now().toString(36)}`, 'cmd')
  if (!tmp.ok || !tmp.path) return { ok: false, text: tmp.error }
  const cp = await copyEnvToPublicDesktop(newHost, tmp.path, fileName)
  return { ok: cp.ok, text: cp.ok ? `„${fileName}" liegt auf dem Desktop von ${newHost} — der Anwender startet sie ohne Adminrechte.` : cp.error }
}
