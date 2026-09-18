// ── WinRM-Operationen fürs Migrations-Cockpit ─────────────────────────────────
// Sammelt die einzelnen Kachel-Aktionen (Sprache, Umgebungsvariablen, Netzlauf-
// werke/WLAN, Windows-Updates, Neustart). Alle best-effort, nicht destruktiv,
// laufen über WinRM/Invoke-Command; per-User-Dinge über runInUserContext.
// HINWEIS: Windows-Update-Install über PSRemoting ist token-bedingt heikel →
// Fallback UsoClient; im echten Betrieb testen.

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import { runInUserContext, type ClientActionResult } from './printerConnections'
import { psGetNetworkDrives, psTransferWlanProfiles, psTransferEnvVars } from '../utils/migrationCommands'
import { writeTempFile, copyToPublicDesktop } from './onboardingDeploy'

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

// ── Sprache ───────────────────────────────────────────────────────────────────
export interface LangInfo { systemLocale: string; culture: string; uiOverride: string }
export async function getLanguage(host: string): Promise<{ ok: boolean; info?: LangInfo; text?: string }> {
  const up = await ensureWinRM(host)
  if (!up) return { ok: false, text: 'WinRM nicht erreichbar' }
  const inner = `[pscustomobject]@{ systemLocale=(Get-WinSystemLocale).Name; culture=(Get-Culture).Name; uiOverride=[string](Get-WinUILanguageOverride) } | ConvertTo-Json -Compress`
  const script = `try { $o = Invoke-Command -ComputerName '${psq(host)}' -ErrorAction Stop -ScriptBlock { ${inner} }; $o | ConvertTo-Json -Compress } catch { 'ERR:' + $_.Exception.Message }`
  try {
    const r = await api().runPowerShell(script, 45000)
    const j = parseJson<LangInfo>(r.stdout)
    if (!j) return { ok: false, text: (r.stdout || '').replace(/^ERR:/, '').trim() || 'keine Antwort' }
    return { ok: true, info: { systemLocale: String(j.systemLocale || ''), culture: String(j.culture || ''), uiOverride: String(j.uiOverride || '') } }
  } catch (e) { return { ok: false, text: e instanceof Error ? e.message : String(e) } }
}
/** Setzt die Sprache komplett auf Deutsch (de-DE): per-User im Benutzerkontext + System-Locale via Admin. */
export async function setGermanLanguage(newHost: string): Promise<ClientActionResult> {
  const userOp = [
    `$lang='de-DE'`,
    `$list = Get-WinUserLanguageList`,
    `if ($list.LanguageTag -notcontains $lang) { $list.Add($lang); Set-WinUserLanguageList $list -Force }`,
    `Set-WinUILanguageOverride -Language $lang`,
    `Set-Culture $lang`,
  ].join('\n')
  const userRes = await runInUserContext(newHost, userOp, 60000)
  // System-Locale + GeoId (Maschine, Admin-Kontext)
  const sys = await invoke(newHost, `try { Set-WinSystemLocale de-DE; Set-WinHomeLocation -GeoId 94; 'OK' } catch { 'ERR:' + $_.Exception.Message }`, 45000)
  const sysOk = sys.ok && sys.out.includes('OK')
  const text = `Benutzer: ${userRes.ok ? 'de-DE gesetzt' : 'Fehler (' + userRes.text + ')'} · System: ${sysOk ? 'de-DE gesetzt' : 'Fehler'}. Neuanmeldung/Neustart nötig.`
  return { ok: userRes.ok || sysOk, text }
}

/** Sprache-Umstellung (de-DE) als .cmd auf den Public Desktop legen (User führt sie aus →
 *  per-User-Sprache greift zuverlässig; System-Locale nur mit Adminrechten). Selbstlöschend. */
export async function deployLanguageScript(newHost: string): Promise<{ ok: boolean; text?: string }> {
  const fileName = 'SKF-Sprache-Deutsch.cmd'
  const desktop = `C:\\Users\\Public\\Desktop\\${fileName}`
  const ps = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$lang='de-DE'`,
    `$list = Get-WinUserLanguageList`,
    `if ($list.LanguageTag -notcontains $lang) { $list.Add($lang); Set-WinUserLanguageList $list -Force }`,
    `Set-WinUILanguageOverride -Language $lang`,
    `Set-Culture $lang`,
    `try { Set-WinSystemLocale $lang; Set-WinHomeLocation -GeoId 94 } catch {}`,
    `Remove-Item '${psq(desktop)}' -Force -EA SilentlyContinue`,
  ].join('\n')
  const enc = toEncodedCommand(ps)
  const cmd = ['@echo off', 'title SKF Sprache auf Deutsch', 'echo Setze Sprache auf Deutsch, bitte warten...', `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${enc}`, 'echo Fertig - bitte neu anmelden.', 'timeout /t 4 >nul'].join('\r\n')
  const tmp = await writeTempFile(cmd, `lang_${Date.now().toString(36)}`, 'cmd')
  if (!tmp.ok || !tmp.path) return { ok: false, text: tmp.error }
  const cp = await copyToPublicDesktop(newHost, tmp.path, fileName)
  return { ok: cp.ok, text: cp.error }
}

// ── Umgebungsvariablen ─────────────────────────────────────────────────────────
export interface EnvVar { name: string; value: string; scope: 'System' | 'Benutzer' }
export async function getEnvVars(host: string): Promise<{ ok: boolean; vars?: EnvVar[]; text?: string }> {
  const inner = [
    `$out=@()`,
    `try { (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment' -EA Stop).PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $out += [pscustomobject]@{ name=$_.Name; value=[string]$_.Value; scope='System' } } } catch {}`,
    `foreach ($hv in @(Get-ChildItem 'registry::HKEY_USERS' -EA SilentlyContinue | Where-Object { $_.PSChildName -like 'S-1-5-21-*' -and $_.PSChildName -notlike '*_Classes' })) { try { (Get-ItemProperty ('registry::HKU\\'+$hv.PSChildName+'\\Environment') -EA Stop).PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $out += [pscustomobject]@{ name=$_.Name; value=[string]$_.Value; scope='Benutzer' } } } catch {} }`,
    `@($out)`,
  ].join('\n')
  const script = `try { $o = Invoke-Command -ComputerName '${psq(host)}' -ErrorAction Stop -ScriptBlock { ${inner} }; $o | Select-Object name,value,scope | ConvertTo-Json -Compress -Depth 4 } catch { 'ERR:' + $_.Exception.Message }`
  try {
    const r = await api().runPowerShell(script, 45000)
    const t = (r.stdout ?? '').trim()
    if (!t || t.startsWith('ERR:')) return { ok: false, text: t.replace(/^ERR:/, '').trim() || 'keine Antwort' }
    const parsed = parseJson<EnvVar[] | EnvVar>(t)
    const arr = Array.isArray(parsed) ? parsed : parsed ? [parsed] : []
    return { ok: true, vars: arr.map(v => ({ name: String(v.name || ''), value: String(v.value || ''), scope: v.scope === 'System' ? 'System' : 'Benutzer' })) }
  } catch (e) { return { ok: false, text: e instanceof Error ? e.message : String(e) } }
}
/** Umgebungsvariablen (Benutzer + System) vom Alt- aufs Neugerät übernehmen. */
export async function transferEnvVars(oldHost: string, newHost: string, corpId: string): Promise<{ ok: boolean; text?: string }> {
  // Benutzer-Variablen: bewährter Builder (SID-Auflösung via ProfileList).
  let userText = 'übersprungen (keine Corp-ID)'
  if (corpId) {
    try { const r = await api().runPowerShell(psTransferEnvVars(oldHost, newHost, corpId), 60000); userText = (r.stdout || '').trim().slice(0, 200) || 'ok' }
    catch (e) { userText = 'Fehler: ' + (e instanceof Error ? e.message : String(e)) }
  }
  // System-Variablen: HKLM Session Manager vom Alt lesen, aufs Neu schreiben (nur nicht-Standard).
  const std = "'Path','TEMP','TMP','windir','OS','PROCESSOR_ARCHITECTURE','NUMBER_OF_PROCESSORS','PATHEXT','ComSpec','DriverData','PSModulePath'"
  const sysScript = [
    `try {`,
    `  $src = Invoke-Command -ComputerName '${psq(oldHost)}' -EA Stop -ScriptBlock { (Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment') } | Select-Object *`,
    `  $skip = @(${std})`,
    `  $pairs = @(); $src.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' -and $skip -notcontains $_.Name } | ForEach-Object { $pairs += ($_.Name + '=' + [string]$_.Value) }`,
    `  Invoke-Command -ComputerName '${psq(newHost)}' -EA Stop -ArgumentList (,$pairs) -ScriptBlock { param($pairs) foreach ($p in $pairs) { $i=$p.IndexOf('='); if($i -gt 0){ [Environment]::SetEnvironmentVariable($p.Substring(0,$i), $p.Substring($i+1), 'Machine') } } }`,
    `  Write-Output ('OK:' + $pairs.Count + ' System-Variablen')`,
    `} catch { Write-Output ('ERR:' + $_.Exception.Message) }`,
  ].join('\n')
  let sysText = ''
  try { const r = await api().runPowerShell(sysScript, 60000); sysText = (r.stdout || '').trim() } catch (e) { sysText = 'ERR:' + (e instanceof Error ? e.message : String(e)) }
  const ok = !/^ERR|Fehler/i.test(userText) || sysText.startsWith('OK:')
  return { ok, text: `Benutzer: ${userText} · System: ${sysText.replace(/^OK:/, '').replace(/^ERR:/, 'Fehler: ')}` }
}

// ── Netzlaufwerke + WLAN ───────────────────────────────────────────────────────
export interface NetDrive { letter: string; unc: string }
export async function getNetworkDrives(oldHost: string): Promise<{ ok: boolean; drives?: NetDrive[]; text?: string }> {
  try {
    const r = await api().runPowerShell(psGetNetworkDrives(oldHost), 45000)
    const t = (r.stdout ?? '').trim()
    const parsed = parseJson<{ letter?: string; uncPath?: string }[] | { letter?: string; uncPath?: string }>(t)
    if (!parsed) return t.startsWith('ERR') || t.startsWith('SKIP') ? { ok: false, text: t } : { ok: true, drives: [] }
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return { ok: true, drives: arr.filter(d => d.letter && d.uncPath).map(d => ({ letter: String(d.letter), unc: String(d.uncPath) })) }
  } catch (e) { return { ok: false, text: e instanceof Error ? e.message : String(e) } }
}
/** Netzlaufwerke im Benutzerkontext des Neugeräts verbinden (persistent). */
export async function mapNetworkDrives(newHost: string, drives: NetDrive[]): Promise<ClientActionResult> {
  if (!drives.length) return { ok: false, text: 'Keine Netzlaufwerke zum Übernehmen.' }
  const op = drives.map(d => {
    const letter = d.letter.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase()
    return `try { cmd /c "net use ${letter}: ""${psq(d.unc)}"" /persistent:yes" | Out-Null } catch {}`
  }).join('\n')
  return runInUserContext(newHost, op, 90000)
}
/** Netzlaufwerke als .bat auf den Public Desktop des Neugeräts legen (der User führt sie
 *  nach der Anmeldung aus → mappt im eigenen Kontext). Selbstlöschend. */
export async function deployDrivesScript(newHost: string, drives: NetDrive[]): Promise<{ ok: boolean; text?: string }> {
  if (!drives.length) return { ok: false, text: 'Keine Netzlaufwerke zum Übernehmen.' }
  const fileName = 'SKF-Netzlaufwerke-verbinden.bat'
  const lines = ['@echo off', 'title SKF Netzlaufwerke verbinden', 'echo Verbinde Netzlaufwerke, bitte warten...']
  for (const d of drives) {
    const letter = d.letter.replace(/[^A-Za-z]/g, '').slice(0, 1).toUpperCase()
    if (!letter) continue
    lines.push(`net use ${letter}: "${d.unc.replace(/"/g, '')}" /persistent:yes`)
  }
  lines.push('echo Fertig.', 'timeout /t 3 >nul', 'del "%~f0"')
  const tmp = await writeTempFile(lines.join('\r\n'), `drives_${Date.now().toString(36)}`, 'bat')
  if (!tmp.ok || !tmp.path) return { ok: false, text: tmp.error }
  const cp = await copyToPublicDesktop(newHost, tmp.path, fileName)
  return { ok: cp.ok, text: cp.error }
}

export async function transferWlan(oldHost: string, newHost: string): Promise<{ ok: boolean; text?: string }> {
  try { const r = await api().runPowerShell(psTransferWlanProfiles(oldHost, newHost), 60000); const t = (r.stdout || '').trim(); return { ok: !/^ERR/i.test(t), text: t.slice(0, 300) || 'ok' } }
  catch (e) { return { ok: false, text: e instanceof Error ? e.message : String(e) } }
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
