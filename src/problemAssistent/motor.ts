// ── Problem-Assistent: Ausführung der Lösungsbausteine auf dem Ziel-PC ───────
// Drei Arten, weil „aus der Ferne“ sonst oft das falsche Profil getroffen wird:
//   system   – als Admin per WinRM (Maschine: Dienste, HKLM, powercfg …)
//   profil   – als Admin, aber auf Dateien/Registry/Prozesse des ANGEMELDETEN Benutzers
//              ($uProf, $uHive, $uSid, $uDomUser). Über WinRM wären $env:APPDATA & HKCU
//              sonst das Profil des Admin-Kontos.
//   benutzer – in der Sitzung des angemeldeten Benutzers (einmalige geplante Aufgabe):
//              net use, cmdkey, klist, Programme sichtbar starten …
// Der Parameter kommt immer als Base64 an ($P) — nie in den Skripttext eingesetzt.
// Eingebettete Bausteine benutzen NIE `exit` (beendet sonst den Rahmen) — Fehler per throw.

import { api } from '../electronAPI'
import { b64, esc, fernBefehl, getagged, verbinde } from '../services/enaioInstall'

export type PaModus = 'system' | 'profil' | 'benutzer' | 'lokal'
export type PaRisiko = 'lesen' | 'aendern' | 'kritisch'

export interface PaAktion {
  id: string
  titel: string
  beschreibung: string
  modus: PaModus
  risiko: PaRisiko
  /** Eingabe, die der Baustein braucht ($P). */
  param?: { label: string; platzhalter: string; pflicht?: boolean; optionen?: string[]; vorlagen?: string[] }
  /** PowerShell-Rumpf. Verfügbar: Zeile 'text' (Ergebniszeile), $P, Hilfsfunktionen aus KOPF/BENUTZER. */
  ps: string
  timeoutMs?: number
  /** Kann die Verbindung kurz trennen (läuft dann zeitversetzt als Aufgabe). */
  trenntVerbindung?: boolean
}

export interface PaErgebnis { ok: boolean; zeilen: string[]; fehler?: string; benutzer?: string; dauerMs: number }

const TAG = '@@PA@@'

/** Gemeinsame Helfer (alle Arten). */
export const KOPF = String.raw`
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$pa = New-Object System.Collections.Generic.List[string]
function Zeile([string]$t) { [void]$pa.Add($t) }
function Ja([bool]$b) { if ($b) { 'ja' } else { 'nein' } }
function Groesse([double]$b) { if ($b -ge 1GB) { '{0:N1} GB' -f ($b / 1GB) } elseif ($b -ge 1MB) { '{0:N0} MB' -f ($b / 1MB) } else { '{0:N0} KB' -f ($b / 1KB) } }
function OrdnerGroesse([string]$p) { if (-not (Test-Path -LiteralPath $p)) { return 0 }; $s = 0; Get-ChildItem -LiteralPath $p -Recurse -Force -File -EA SilentlyContinue | ForEach-Object { $s += $_.Length }; return $s }
function ClearDir([string]$path, [string]$label) {
  if (-not (Test-Path -LiteralPath $path)) { Zeile ($label + ': nicht vorhanden'); return }
  $vor = OrdnerGroesse $path
  Get-ChildItem -LiteralPath $path -Force -EA SilentlyContinue | Remove-Item -Recurse -Force -EA SilentlyContinue
  $nach = OrdnerGroesse $path
  Zeile ($label + ': ' + (Groesse ($vor - $nach)) + ' entfernt' + $(if ($nach -gt 0) { ' (' + (Groesse $nach) + ' in Benutzung, bleibt)' } else { '' }))
}
function RenameAlt([string]$path, [string]$label) {
  if (-not (Test-Path -LiteralPath $path)) { Zeile ($label + ': nicht vorhanden'); return $false }
  $neu = (Split-Path $path -Leaf) + '.alt_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
  Rename-Item -LiteralPath $path -NewName $neu -Force -EA Stop
  Zeile ($label + ': umbenannt in ' + $neu + ' (wird neu aufgebaut, Altstand bleibt erhalten)')
  return $true
}
function DienstNeu([string]$name) {
  $s = Get-Service -Name $name -EA SilentlyContinue
  if (-not $s) { Zeile ('Dienst ' + $name + ': nicht vorhanden'); return }
  if ($s.StartType -eq 'Disabled') { Zeile ('Dienst ' + $s.DisplayName + ': ist deaktiviert — nicht gestartet'); return }
  Restart-Service -Name $name -Force -EA Stop
  Start-Sleep -Seconds 1
  Zeile ('Dienst ' + $s.DisplayName + ': neu gestartet (' + (Get-Service -Name $name).Status + ')')
}
function Spaeter([string]$ps, [int]$sek) {
  $tn = 'ITAdminTool_PA_' + (Get-Date -Format 'yyyyMMddHHmmssfff')
  $voll = $ps + "; Unregister-ScheduledTask -TaskName '" + $tn + "' -Confirm:" + '$false'
  $e = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($voll))
  $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ' + $e)
  $t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds($sek)
  $pr = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $tn -Action $a -Trigger $t -Principal $pr -Force | Out-Null
}
`

/** Angemeldeter Benutzer + Profil/Hive (Art „profil“). */
export const BENUTZER = String.raw`
$uDomUser = $null; $uName = $null; $uSid = $null; $uProf = $null; $uHive = $null
try { $uDomUser = [string](Get-CimInstance Win32_ComputerSystem -EA Stop).UserName } catch {}
if (-not $uDomUser) {
  try { $ex = Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA Stop | Select-Object -First 1; if ($ex) { $ow = Invoke-CimMethod -InputObject $ex -MethodName GetOwner; if ($ow.User) { $uDomUser = [string]$ow.Domain + '\' + [string]$ow.User } } } catch {}
}
if ($uDomUser) {
  $uName = ($uDomUser -split '\\')[-1]
  try { $uSid = (New-Object System.Security.Principal.NTAccount($uDomUser)).Translate([System.Security.Principal.SecurityIdentifier]).Value } catch {}
  if ($uSid) {
    $uProf = [string](Get-ItemProperty ('HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\' + $uSid) -EA SilentlyContinue).ProfileImagePath
    if (Test-Path ('Registry::HKEY_USERS\' + $uSid)) { $uHive = 'Registry::HKEY_USERS\' + $uSid }
  }
}
$uRoam = $null; $uLocal = $null
if ($uProf) { $uRoam = Join-Path $uProf 'AppData\Roaming'; $uLocal = Join-Path $uProf 'AppData\Local' }
function NeedUser { if (-not $uProf) { throw 'Kein Benutzer angemeldet (oder sein Profil wurde nicht gefunden).' } }
function NeedHive { NeedUser; if (-not $uHive) { throw 'Registry des Benutzers ist nicht geladen (Benutzer nicht angemeldet?).' } }
function UserProcs([string[]]$names) {
  @(Get-Process -Name $names -IncludeUserName -EA SilentlyContinue | Where-Object { $_.UserName -and (($_.UserName -ieq $uDomUser) -or (($_.UserName -split '\\')[-1] -ieq $uName)) })
}
function StopUser([string[]]$names) {
  $p = @(UserProcs $names)
  foreach ($x in $p) { try { Stop-Process -Id $x.Id -Force -EA Stop } catch {} }
  if ($p.Count) { Zeile ('Beendet: ' + ((@($p | ForEach-Object { $_.ProcessName }) | Select-Object -Unique) -join ', ')); Start-Sleep -Seconds 2 } else { Zeile ('Lief nicht: ' + ($names -join ', ')) }
}
`

export function rahmenSystem(a: PaAktion): string {
  return [
    `$__in = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json`,
    `$P = [string]$__in.p`,
    `$S = [string]$__in.s`,
    KOPF,
    a.modus === 'profil' ? BENUTZER : '$uDomUser = $null',
    `$__ok = $true; $__err = $null`,
    `try {`,
    a.ps,
    `} catch { $__ok = $false; $__err = [string]$_.Exception.Message }`,
    `'${TAG}' + (@{ ok = $__ok; fehler = $__err; zeilen = [string[]]$pa.ToArray(); benutzer = [string]$uDomUser } | ConvertTo-Json -Compress -Depth 3)`,
  ].join('\n')
}

/** UTF-16LE-Base64 für -EncodedCommand. */
export function utf16b64(s: string): string {
  let bin = ''
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); bin += String.fromCharCode(c & 0xff, (c >> 8) & 0xff) }
  return btoa(bin)
}

/** Innenskript, das in der Benutzersitzung läuft (schreibt sein Ergebnis in $rf). */
export function innenBenutzer(a: PaAktion, param: string, rf: string): string {
  return [
    `$P = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(param)}'))`,
    KOPF,
    `$__ok = $true; $__err = $null`,
    `try {`,
    a.ps,
    `} catch { $__ok = $false; $__err = [string]$_.Exception.Message }`,
    `try { (@{ ok = $__ok; fehler = $__err; zeilen = [string[]]$pa.ToArray() } | ConvertTo-Json -Compress -Depth 3) | Out-File -LiteralPath '${rf}' -Encoding UTF8 -Force } catch {}`,
  ].join('\r\n')
}

/** Rahmen (läuft als Admin): angemeldeten Benutzer finden, Aufgabe in seiner Sitzung starten, Ergebnis lesen. */
const RAHMEN_BENUTZER = String.raw`
$__in = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$code = [string]$__in.code; $rf = [string]$__in.rf; $warte = [int]$__in.warte
$user = $null
try { $user = [string](Get-CimInstance Win32_ComputerSystem -EA Stop).UserName } catch {}
if (-not $user) {
  try { $ex = Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA Stop | Select-Object -First 1; if ($ex) { $ow = Invoke-CimMethod -InputObject $ex -MethodName GetOwner; if ($ow.User) { $user = [string]$ow.Domain + '\' + [string]$ow.User } } } catch {}
}
if (-not $user) { '@@PA@@' + (@{ ok = $false; fehler = 'NOUSER' } | ConvertTo-Json -Compress); return }
if (-not (Test-Path 'C:\Temp')) { New-Item -Path 'C:\Temp' -ItemType Directory -Force | Out-Null }
Remove-Item -LiteralPath $rf -Force -EA SilentlyContinue
$tn = 'ITAdminTool_PA_' + (Get-Date -Format 'yyyyMMddHHmmssfff')
# Skript als Datei statt -EncodedCommand (Befehlszeile ist auf 32 767 Zeichen begrenzt — große Bausteine passten nicht).
# Ordner nur für SYSTEM/Administratoren beschreibbar, der angemeldete Benutzer darf nur lesen und ausführen.
$sd = 'C:\ProgramData\ITAdminTool\pa'
$skript = Join-Path $sd ($tn + '.ps1')
try {
  if (-not (Test-Path -LiteralPath $sd)) { New-Item -Path $sd -ItemType Directory -Force | Out-Null }
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($sid in 'S-1-5-18', 'S-1-5-32-544') { $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier($sid)), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))) }
  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($user, 'ReadAndExecute', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
  Set-Acl -LiteralPath $sd -AclObject $acl
  [IO.File]::WriteAllText($skript, $code, (New-Object System.Text.UTF8Encoding($true)))
} catch { '@@PA@@' + (@{ ok = $false; fehler = ('Skript für die Benutzersitzung ließ sich nicht ablegen: ' + $_.Exception.Message); benutzer = $user } | ConvertTo-Json -Compress); return }
try {
  # Kleiner Startbefehl liest die Datei als Skriptblock (wie bisher -EncodedCommand: unabhängig von der Ausführungsrichtlinie)
  $boot = "& ([scriptblock]::Create([IO.File]::ReadAllText('" + $skript.Replace("'", "''") + "', [Text.Encoding]::UTF8)))"
  $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($boot))
  $a = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand ' + $enc)
  $t = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5)
  Register-ScheduledTask -TaskName $tn -Action $a -Trigger $t -User $user -Force | Out-Null
  Start-ScheduledTask -TaskName $tn
  $bis = (Get-Date).AddSeconds($warte)
  do { Start-Sleep -Milliseconds 700 } while ((-not (Test-Path -LiteralPath $rf)) -and ((Get-Date) -lt $bis))
  Start-Sleep -Milliseconds 300
} catch {
  Unregister-ScheduledTask -TaskName $tn -Confirm:$false -EA SilentlyContinue
  Remove-Item -LiteralPath $skript -Force -EA SilentlyContinue
  '@@PA@@' + (@{ ok = $false; fehler = ('Aufgabe im Benutzerkontext fehlgeschlagen: ' + $_.Exception.Message); benutzer = $user } | ConvertTo-Json -Compress); return
}
Unregister-ScheduledTask -TaskName $tn -Confirm:$false -EA SilentlyContinue
Remove-Item -LiteralPath $skript -Force -EA SilentlyContinue
if (-not (Test-Path -LiteralPath $rf)) { '@@PA@@' + (@{ ok = $false; fehler = ('Keine Rückmeldung aus der Sitzung von ' + $user + ' (gesperrt oder abgemeldet?)'); benutzer = $user } | ConvertTo-Json -Compress); return }
$txt = (Get-Content -LiteralPath $rf -Raw -EA SilentlyContinue)
Remove-Item -LiteralPath $rf -Force -EA SilentlyContinue
try { $j = $txt | ConvertFrom-Json; '@@PA@@' + (@{ ok = [bool]$j.ok; fehler = $j.fehler; zeilen = @($j.zeilen); benutzer = $user } | ConvertTo-Json -Compress -Depth 3) }
catch { '@@PA@@' + (@{ ok = $false; fehler = 'Antwort aus der Benutzersitzung nicht lesbar'; benutzer = $user } | ConvertTo-Json -Compress) }
`

/** Vollständiges Admin-Skript für einen Baustein (für Tests und Ausführung).
 *  `sam` = angemeldeter Benutzer des Ziel-PCs (für Bausteine der Art „lokal“ als $S). */
export function baueSkript(host: string, a: PaAktion, param: string, sam = ''): string {
  if (a.modus === 'lokal') {
    // Läuft auf dem Admin-PC (z. B. AD-Abfragen — vom Ziel-PC aus fehlt die Anmeldung am DC).
    return `$b64 = '${b64(JSON.stringify({ p: param, s: sam }))}'\n${rahmenSystem(a)}`
  }
  if (a.modus === 'benutzer') {
    const rf = `C:\\Temp\\ITAdminTool_pa_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}.json`
    // Innenskript nur EINMAL kodiert (im JSON-Paket). Früher doppelt Base64 → die Befehlszeile auf dem
    // Admin-PC (powershell -Command, max. 32 767 Zeichen) war bei großen Bausteinen fast voll.
    // Der Rahmen legt es als .ps1-Datei ab — auf dem Ziel-PC gibt es keine Längengrenze.
    const code = innenBenutzer(a, param, rf)
    const warte = Math.max(20, Math.round((a.timeoutMs ?? 60000) / 1000) - 10)
    return fernBefehl(host, RAHMEN_BENUTZER, TAG, b64(JSON.stringify({ code, rf, warte })))
  }
  return fernBefehl(host, rahmenSystem(a), TAG, b64(JSON.stringify({ p: param })))
}

function asArr<T>(v: unknown): T[] { return Array.isArray(v) ? v as T[] : v === undefined || v === null || v === '' ? [] : [v as T] }

export async function fuehreAus(host: string, a: PaAktion, param = '', ctx: { sam?: string } = {}): Promise<PaErgebnis> {
  const t0 = Date.now()
  const h = host.trim()
  if (!h) return { ok: false, zeilen: [], fehler: 'Kein Ziel-PC gewählt.', dauerMs: 0 }
  if (a.param?.pflicht && !param.trim()) return { ok: false, zeilen: [], fehler: `Bitte „${a.param.label}“ angeben.`, dauerMs: 0 }
  try {
    const r = await api().runPowerShell(baueSkript(h, a, param, ctx.sam || ''), (a.timeoutMs ?? 60000) + 30000)
    const j = getagged<{ ok?: boolean; fehler?: string | null; zeilen?: unknown; benutzer?: string }>(r.stdout, TAG)
    if (!j) {
      if (a.trenntVerbindung) return { ok: true, zeilen: ['Befehl abgesetzt — die Verbindung wurde dabei wie erwartet kurz getrennt.'], dauerMs: Date.now() - t0 }
      return { ok: false, zeilen: [], fehler: (r.stderr || '').trim().slice(0, 400) || (r.timedOut ? 'Zeitüberschreitung' : 'Keine Antwort vom Ziel-PC'), dauerMs: Date.now() - t0 }
    }
    const fehler = j.fehler === 'NOUSER' ? 'Kein Benutzer angemeldet — dieser Schritt läuft nur in der Sitzung des Benutzers.' : (j.fehler || undefined)
    return { ok: j.ok !== false, zeilen: asArr<string>(j.zeilen).map(String), fehler: fehler || undefined, benutzer: j.benutzer || undefined, dauerMs: Date.now() - t0 }
  } catch (e) {
    return { ok: false, zeilen: [], fehler: e instanceof Error ? e.message : String(e), dauerMs: Date.now() - t0 }
  }
}

// ── Verbindung + angemeldeter Benutzer ───────────────────────────────────────

export interface PaVerbindung {
  ok: boolean
  fehler?: string
  online: boolean
  winrm: boolean
  benutzer?: string        // DOMAIN\sam
  sam?: string
  gesperrt?: boolean
  sitzung?: string         // Konsole/RDP
  modell?: string
  os?: string
  boot?: string
  ip?: string
  /** Hat der PC einen Akku bzw. einen WLAN-Adapter? (für die Suche: Desktop → Akku-Themen nach hinten) */
  akku?: boolean
  wlan?: boolean
}

const INFO_INNER = String.raw`
$o = [ordered]@{ ok = $true }
try { $cs = Get-CimInstance Win32_ComputerSystem -EA Stop; $o.benutzer = [string]$cs.UserName; $o.modell = ([string]$cs.Manufacturer + ' ' + [string]$cs.Model).Trim() } catch {}
if (-not $o.benutzer) { try { $ex = Get-CimInstance Win32_Process -Filter "Name='explorer.exe'" -EA Stop | Select-Object -First 1; if ($ex) { $ow = Invoke-CimMethod -InputObject $ex -MethodName GetOwner; if ($ow.User) { $o.benutzer = [string]$ow.Domain + '\' + [string]$ow.User } } } catch {} }
try { $os = Get-CimInstance Win32_OperatingSystem -EA Stop; $o.os = ([string]$os.Caption + ' (Build ' + [string]$os.BuildNumber + ')'); $o.boot = $os.LastBootUpTime.ToString('o') } catch {}
$o.gesperrt = [bool](Get-Process -Name LogonUI -EA SilentlyContinue)
try { $o.akku = [bool](Get-CimInstance Win32_Battery -EA Stop | Select-Object -First 1) } catch {}
try { $o.wlan = [bool](Get-NetAdapter -Physical -EA Stop | Where-Object { $_.PhysicalMediaType -match '802\.11' -or $_.InterfaceDescription -match 'Wi-?Fi|Wireless|WLAN' } | Select-Object -First 1) } catch {}
try { $q = @(quser 2>$null | Select-Object -Skip 1); $akt = $q | Where-Object { $_ -match '(Aktiv|Active)' } | Select-Object -First 1; if ($akt) { $o.sitzung = $(if ($akt -match 'rdp-') { 'RDP' } else { 'Konsole' }) } } catch {}
try { $o.ip = [string](Get-NetIPAddress -AddressFamily IPv4 -EA Stop | Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } | Select-Object -First 1).IPAddress } catch {}
'@@PAINFO@@' + ($o | ConvertTo-Json -Compress)
`

/** Online prüfen, WinRM aktivieren (wie Remote Doc), angemeldeten Benutzer lesen. */
export async function verbindeUndLies(host: string): Promise<PaVerbindung> {
  const h = host.trim()
  const leer: PaVerbindung = { ok: false, online: false, winrm: false }
  if (!h) return { ...leer, fehler: 'Kein Ziel-PC gewählt.' }
  try {
    const p = await api().runPowerShell(
      `$h='${esc(h)}'; $on=$false; try { $on = Test-Connection -ComputerName $h -Count 1 -Quiet -EA SilentlyContinue } catch {}; ` +
      `if (-not $on) { foreach ($port in 445,135,5985) { try { $t = New-Object System.Net.Sockets.TcpClient; if ($t.ConnectAsync($h, $port).Wait(2000)) { $on = $true }; $t.Close() } catch {}; if ($on) { break } } }; ` +
      `if ($on) { 'ONLINE' } else { 'OFFLINE' }`, 20000)
    if (!(p.stdout || '').includes('ONLINE')) return { ...leer, fehler: `${h} antwortet nicht (ausgeschaltet, nicht im Netz oder falscher Name).` }
  } catch { /* weiter mit WinRM — der Ping kann geblockt sein */ }
  const f = await verbinde(h)
  if (f) return { ...leer, online: true, fehler: f }
  try {
    const r = await api().runPowerShell(fernBefehl(h, INFO_INNER, '@@PAINFO@@'), 45000)
    const j = getagged<{ benutzer?: string; modell?: string; os?: string; boot?: string; gesperrt?: boolean; sitzung?: string; ip?: string; akku?: boolean; wlan?: boolean; fehler?: string }>(r.stdout, '@@PAINFO@@')
    if (!j) return { ok: true, online: true, winrm: true, fehler: 'Geräteinformationen nicht lesbar.' }
    const benutzer = (j.benutzer || '').trim() || undefined
    return {
      ok: true, online: true, winrm: true, benutzer, sam: benutzer ? benutzer.split('\\').pop() : undefined,
      gesperrt: !!j.gesperrt, sitzung: j.sitzung || undefined, modell: j.modell || undefined, os: j.os || undefined, boot: j.boot || undefined, ip: j.ip || undefined,
      akku: typeof j.akku === 'boolean' ? j.akku : undefined, wlan: typeof j.wlan === 'boolean' ? j.wlan : undefined,
    }
  } catch (e) { return { ok: true, online: true, winrm: true, fehler: e instanceof Error ? e.message : String(e) } }
}

// ── Desktop-Nachricht (msg *, wie beim Verteilen des IT Admin Tools) ─────────

const MELDUNG_INNER = String.raw`
$o = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) | ConvertFrom-Json
$m = Join-Path $env:SystemRoot 'System32\msg.exe'
if (-not (Test-Path -LiteralPath $m)) { '@@PAMSG@@' + (@{ ok = $false; aus = 'msg.exe fehlt auf dem PC' } | ConvertTo-Json -Compress); return }
$aus = & $m '*' ('/TIME:' + [int]$o.sekunden) ([string]$o.text) 2>&1
$code = $LASTEXITCODE
'@@PAMSG@@' + (@{ ok = ($code -eq 0); code = $code; aus = ((@($aus) | ForEach-Object { "$_" }) -join ' ') } | ConvertTo-Json -Compress)
`

export async function sendeDesktopNachricht(host: string, text: string, sekunden = 3600): Promise<{ ok: boolean; info: string }> {
  const t = text.trim()
  if (!t) return { ok: false, info: 'Kein Text.' }
  try {
    const r = await api().runPowerShell(fernBefehl(host.trim(), MELDUNG_INNER, '@@PAMSG@@', b64(JSON.stringify({ text: t.slice(0, 900), sekunden }))), 45000)
    const j = getagged<{ ok?: boolean; aus?: string; fehler?: string; code?: number }>(r.stdout, '@@PAMSG@@')
    if (!j) return { ok: false, info: (r.stderr || '').trim() || 'keine Antwort' }
    return j.ok ? { ok: true, info: '' } : { ok: false, info: (j.aus || j.fehler || `msg-Code ${j.code ?? '?'}`).trim() }
  } catch (e) { return { ok: false, info: e instanceof Error ? e.message : String(e) } }
}
