// ── Netzwerk-Diagnose: Tiefenanalyse (zweiter Lesedurchgang, rein lesend) ─────
// Beantwortet die Frage „WER oder WAS trennt das WLAN?" statt nur „wie oft":
//   • Trennungen (Event 8003) mit dem echten Grund (Reason/ReasonCode) und der
//     Verbindungsart; Verbindungen (8001) → automatisch oder von Hand neu verbunden?
//   • Umfeld jeder Trennung (−5 … +2 min): System (Standby/Aufwachen, Treiber, Dienste,
//     Updates), Gruppenrichtlinie, Intune/MDM, Aufgabenplanung, Verbindungsmanager,
//     Netzwerkprofil, Installationen
//   • geplante Aufgaben (Trigger-Uhrzeit, letzter Lauf), Änderungen der letzten 30 Tage
//   • WLAN-Profile (Gruppenrichtlinie? automatisch/manuell? 802.1X Benutzer/Computer)
//   • Netzwerk im Standby, WcmSvc-Richtlinien, HP-BIOS LAN/WLAN, Netzwerk-Software
// Eigener Aufruf, weil das Skript sonst zusammen mit dem Basis-Scan die Grenze der
// Befehlszeile (32 767 Zeichen) sprengt. Schlägt er fehl, bleibt der Basis-Scan gültig.
// Lokal nachgesehen (Windows 11, deutsch): 8003 hat Reason, ReasonCode, ConnectionMode,
// ProfileName; 8001 hat ConnectionMode „Automatische/Manuelle Verbindung mit einem Profil";
// NetworkProfile 10001 nennt das NETZ (z. B. skf_root.skf.net), nicht den Adapter.

import { api } from '../electronAPI'
import type { NetTiefe } from './types'

function q(s: string): string { return (s || '').replace(/'/g, "''") }

export const TIEFE_INNER = String.raw`
$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'; $WarningPreference='SilentlyContinue'
$env:Path = "$env:SystemRoot\System32;$env:SystemRoot\System32\wbem;$env:Path"
$t0 = Get-Date
function Iso($d) { if ($d) { ([datetime]$d).ToString('yyyy-MM-ddTHH:mm:sszzz') } else { $null } }
function EvD($e) { $h = @{}; try { foreach ($x in ([xml]$e.ToXml()).Event.EventData.Data) { if ($x.Name) { $h[[string]$x.Name] = [string]$x.'#text' } } } catch {}; $h }
function Kurz($s, $n) { $z = ([string]$s -split '\r?\n')[0].Trim(); if ($z.Length -gt $n) { $z.Substring(0, $n) } else { $z } }
function Hex2($txt) { @([regex]::Matches([string]$txt, '0x[0-9a-fA-F]{1,8}') | ForEach-Object { [Convert]::ToInt32($_.Value, 16) }) }
$T = [ordered]@{ ok=$true; trennungen=@(); verbindungen=@(); umfeld=@(); aufgaben=@(); aenderungen=@(); profile=@(); standbyNetz=$null; wcm=$null; bios=@(); software=@(); netshBlockiert=$false; netzprofil=@(); taskLogAktiv=$false; dauerMs=0 }
try {
  $seit = (Get-Date).AddDays(-14)
  # ── 1) Trennungen (8003) + Verbindungen (8001) mit den echten Feldern ──
  $tr = New-Object System.Collections.ArrayList; $trZeit = New-Object System.Collections.ArrayList; $vb = New-Object System.Collections.ArrayList
  foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-WLAN-AutoConfig/Operational'; Id=8001,8003; StartTime=$seit } -MaxEvents 400)) {
    $d = EvD $e
    if ($e.Id -eq 8003) {
      if ($tr.Count -lt 60) { [void]$tr.Add([ordered]@{ zeit=(Iso $e.TimeCreated); grund=[string]$d['Reason']; code=[string]$d['ReasonCode']; modus=[string]$d['ConnectionMode']; profil=[string]$d['ProfileName']; ssid=[string]$d['SSID'] }); [void]$trZeit.Add($e.TimeCreated) }
    } elseif ($vb.Count -lt 80) {
      [void]$vb.Add([ordered]@{ zeit=(Iso $e.TimeCreated); modus=[string]$d['ConnectionMode']; profil=[string]$d['ProfileName']; ssid=[string]$d['SSID']; auth=[string]$d['AuthenticationAlgorithm']; onex=[string]$d['OnexEnabled']; phy=[string]$d['PHYType'] })
    }
  }
  $T.trennungen = @($tr); $T.verbindungen = @($vb)
  $np = New-Object System.Collections.ArrayList
  foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-NetworkProfile/Operational'; Id=10000,10001; StartTime=$seit } -MaxEvents 120)) { $d = EvD $e; [void]$np.Add([ordered]@{ zeit=(Iso $e.TimeCreated); id=[int]$e.Id; name=[string]$d['Name'] }) }
  $T.netzprofil = @($np)

  # ── 2) Umfeld der letzten 6 Trennungen (−5 … +2 min) ──
  $tl = Get-WinEvent -ListLog 'Microsoft-Windows-TaskScheduler/Operational'; $T.taskLogAktiv = [bool]($tl -and $tl.IsEnabled)
  $sysQ = 'Kernel-Power|Power-Troubleshooter|Kernel-PnP|UserPnp|WindowsUpdateClient|Netwtw|rtw|Realtek|RTWlan|e1d|e1i|e1r|e2f|NDIS|Tcpip|Dhcp|WLAN|Wlan|Wcm|NetAdapter|Kernel-General|Winlogon|BTHUSB|Intel'
  $umf = New-Object System.Collections.ArrayList
  for ($i = 0; $i -lt [Math]::Min(6, $trZeit.Count); $i++) {
    # ACHTUNG: PowerShell-Variablen kennen keine Groß-/Kleinschreibung — $tz, nie $t (wäre $T!)
    $tz = [datetime]$trZeit[$i]; $von = $tz.AddMinutes(-5); $bis = $tz.AddMinutes(2)
    $L = New-Object System.Collections.ArrayList
    $add = { param($log, $e, $extra) if ($L.Count -lt 60) { [void]$L.Add([ordered]@{ log=$log; zeit=(Iso $e.TimeCreated); quelle=[string]$e.ProviderName; id=[int]$e.Id; text=(Kurz $e.Message 180); extra=$extra }) } }
    $n = 0
    foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='System'; StartTime=$von; EndTime=$bis } -MaxEvents 250)) {
      if ($n -ge 25) { break }
      $p = [string]$e.ProviderName
      if ($p -match 'Service Control Manager') { if ($e.Id -eq 7036 -and ([string]$e.Message) -notmatch 'WLAN|Wlan|WWAN|Netzwerk|Network|NLA|Dhcp|Wcm|Zscaler|Cisco|VPN|HP|Intel|Realtek|Wi-?Fi') { continue } }
      elseif (-not ($p -match $sysQ -or ($e.Level -ge 1 -and $e.Level -le 3))) { continue }
      & $add 'System' $e $null; $n++
    }
    $n = 0
    foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='Application'; StartTime=$von; EndTime=$bis } -MaxEvents 120)) { if ($n -ge 8) { break }; if ([string]$e.ProviderName -match 'MsiInstaller' -or ($e.Level -ge 1 -and $e.Level -le 2)) { & $add 'Anwendung' $e $null; $n++ } }
    foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-WLAN-AutoConfig/Operational'; StartTime=$von; EndTime=$bis } -MaxEvents 15)) { $d = EvD $e; $x = $null; if ($d['Reason']) { $x = [string]$d['Reason'] } elseif ($d['FailureReason']) { $x = [string]$d['FailureReason'] }; & $add 'WLAN' $e $x }
    foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-GroupPolicy/Operational'; StartTime=$von; EndTime=$bis } -MaxEvents 15)) { & $add 'Richtlinie' $e $null }
    foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-DeviceManagement-Enterprise-Diagnostics-Provider/Admin'; StartTime=$von; EndTime=$bis } -MaxEvents 8)) { & $add 'MDM' $e $null }
    foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-Wcmsvc/Operational'; StartTime=$von; EndTime=$bis } -MaxEvents 10)) { & $add 'Verbindungsmanager' $e $null }
    foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-NetworkProfile/Operational'; Id=10000,10001; StartTime=$von; EndTime=$bis } -MaxEvents 8)) { $d = EvD $e; & $add 'Netzprofil' $e ([string]$d['Name']) }
    if ($T.taskLogAktiv) { foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-TaskScheduler/Operational'; Id=100,102,129,200,201; StartTime=$von; EndTime=$bis } -MaxEvents 20)) { $d = EvD $e; & $add 'Aufgabe' $e ([string]$d['TaskName']) } }
    [void]$umf.Add([ordered]@{ trennung=(Iso $tz); ereignisse=@($L) })
  }
  $T.umfeld = @($umf)

  # ── 3) Geplante Aufgaben (aktiv): Trigger-Uhrzeit, letzter Lauf, Aktion ──
  $af = New-Object System.Collections.ArrayList; $grenze = (Get-Date).AddDays(-30)
  foreach ($a in @(Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' })) {
    $trg = New-Object System.Collections.ArrayList
    foreach ($g in @($a.Triggers)) { if (-not $g) { continue }; $typ = ([string]$g.CimClass.CimClassName) -replace '^MSFT_Task', '' -replace 'Trigger$', ''; [void]$trg.Add([ordered]@{ typ=$typ; start=[string]$g.StartBoundary; wdh=[string]$g.Repetition.Interval; aktiv=[bool]$g.Enabled }) }
    $lr = $null; try { $inf = Get-ScheduledTaskInfo -InputObject $a -ErrorAction Stop; if ($inf.LastRunTime -and $inf.LastRunTime.Year -gt 2000) { $lr = Iso $inf.LastRunTime } } catch {}
    $ms = [string]$a.TaskPath -like '\Microsoft\*'
    $akt = ''; if (-not $ms) { $akt = (@($a.Actions | ForEach-Object { ((([string]$_.Execute) + ' ' + ([string]$_.Arguments)).Trim()) }) -join ' ; '); if ($akt.Length -gt 160) { $akt = $akt.Substring(0, 160) } }
    $reg = $null; $regDt = $null; try { $rd = [string]$a.Date; if ($rd) { $regDt = [datetime]$rd; $reg = Iso $regDt } } catch {}
    [void]$af.Add([ordered]@{ pfad=[string]$a.TaskPath; name=[string]$a.TaskName; autor=[string]$a.Author; zustand=[string]$a.State; letzterLauf=$lr; registriert=$reg; trigger=@($trg); aktion=$akt })
    if ($regDt -and $regDt -gt $grenze -and -not $ms) { $T.aenderungen += ,([ordered]@{ art='Aufgabe'; zeit=$reg; text=('Neue Aufgabe ' + [string]$a.TaskPath + [string]$a.TaskName) }) }
  }
  $T.aufgaben = @($af)

  # ── 4) Änderungen der letzten 30 Tage ──
  $ae = New-Object System.Collections.ArrayList
  foreach ($h in @(Get-HotFix | Where-Object { $_.InstalledOn -and $_.InstalledOn -gt $grenze })) { [void]$ae.Add([ordered]@{ art='Update'; zeit=(Iso $h.InstalledOn); text=([string]$h.HotFixID + ' ' + [string]$h.Description).Trim() }) }
  foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='Microsoft-Windows-WindowsUpdateClient'; Id=19; StartTime=$grenze } -MaxEvents 30)) { $d = EvD $e; [void]$ae.Add([ordered]@{ art='Update'; zeit=(Iso $e.TimeCreated); text=(Kurz ([string]$d['updateTitle']) 160) }) }
  foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='Microsoft-Windows-UserPnp'; Id=20001,20003; StartTime=$grenze } -MaxEvents 20)) { [void]$ae.Add([ordered]@{ art='Treiber'; zeit=(Iso $e.TimeCreated); text=(Kurz $e.Message 160) }) }
  foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='System'; ProviderName='Service Control Manager'; Id=7045; StartTime=$grenze } -MaxEvents 10)) { [void]$ae.Add([ordered]@{ art='Dienst'; zeit=(Iso $e.TimeCreated); text=(Kurz $e.Message 160) }) }
  foreach ($e in @(Get-WinEvent -FilterHashtable @{ LogName='Application'; ProviderName='MsiInstaller'; Id=11707,11724; StartTime=$grenze } -MaxEvents 20)) { [void]$ae.Add([ordered]@{ art='Software'; zeit=(Iso $e.TimeCreated); text=(Kurz $e.Message 160) }) }
  $sw = New-Object System.Collections.ArrayList
  $swMuster = 'Cisco|AnyConnect|Secure Client|Network Access Manager|Zscaler|Forti|GlobalProtect|Pulse|Ivanti|Check Point|HP Connection Optimizer|HP Wolf|HP Sure|HP Smart Connect|Intel.*(PROSet|Wireless|Connectivity)|Killer|Realtek.*(WLAN|Wireless)|Absolute|NetMotion|Mobility|SmartByte|Wi-?Fi'
  foreach ($k in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')) {
    foreach ($p in @(Get-ItemProperty $k)) {
      $dn = [string]$p.DisplayName; if (-not $dn) { continue }
      $dat = $null; if ([string]$p.InstallDate -match '^(\d{4})(\d{2})(\d{2})$') { $dat = $matches[1] + '-' + $matches[2] + '-' + $matches[3] }
      if ($dn -match $swMuster -and $sw.Count -lt 25) { [void]$sw.Add([ordered]@{ name=$dn; version=[string]$p.DisplayVersion; datum=$dat }) }
      if ($dat -and ([datetime]$dat) -gt $grenze -and $ae.Count -lt 120) { [void]$ae.Add([ordered]@{ art='Software'; zeit=($dat + 'T00:00:00'); text=($dn + ' ' + [string]$p.DisplayVersion).Trim() }) }
    }
  }
  $T.aenderungen = @($T.aenderungen) + @($ae); $T.software = @($sw)

  # ── 5) WLAN-Profile: Gruppenrichtlinie? automatisch/manuell? 802.1X Benutzer/Computer ──
  $nsh = (netsh wlan show interfaces 2>&1 | Out-String); $T.netshBlockiert = [bool]($nsh -match 'Standort|location')
  $pl = (netsh wlan show profiles 2>&1 | Out-String)
  $pr = New-Object System.Collections.ArrayList; $abschnitt = ''
  foreach ($z in ($pl -split '\r?\n')) {
    if ($z -match 'Gruppenrichtlinie|Group policy') { $abschnitt = 'Gruppenrichtlinie'; continue }
    if ($z -match '^\s*(Benutzerprofile|User profiles)') { $abschnitt = 'Benutzer'; continue }
    if ($z -match '^\s*-+\s*$' -or -not $z.Trim()) { continue }
    if ($z -match '^\s+(.+?)\s*:\s*(.+?)\s*$') { $art = $matches[1]; $pn = $matches[2]; $q = $(if ($art -match 'alle|All') { 'Alle Benutzer' } else { 'Benutzer' }); [void]$pr.Add([ordered]@{ name=$pn; quelle=$q }) }
    elseif ($abschnitt -eq 'Gruppenrichtlinie' -and $z -match '^\s{2,}(\S.*?)\s*$' -and $z -notmatch '<') { [void]$pr.Add([ordered]@{ name=$matches[1]; quelle='Gruppenrichtlinie' }) }
  }
  $genutzt = @(@($tr | ForEach-Object { $_.profil }) + @($vb | ForEach-Object { $_.profil }) | Where-Object { $_ } | Select-Object -Unique | Select-Object -First 4)
  $xmlDateien = @(Get-ChildItem 'C:\ProgramData\Microsoft\Wlansvc\Profiles\Interfaces' -Recurse -Filter *.xml)
  foreach ($nm in $genutzt) {
    $o = $pr | Where-Object { $_.name -eq $nm } | Select-Object -First 1
    if (-not $o) { $o = [ordered]@{ name=$nm; quelle=$null }; [void]$pr.Add($o) }
    $sp = (netsh wlan show profiles name="$nm" 2>&1 | Out-String)
    if ($sp -match '(?im)(Verbindungsmodus|Connection mode)\s*:\s*(.+?)\s*$') { $o.modus = $matches[2] }
    if ($sp -match '(?im)(Authentifizierung|Authentication)\s*:\s*(.+?)\s*$') { $o.auth = $matches[2] }
    foreach ($f in $xmlDateien) { $x = ''; try { $x = [IO.File]::ReadAllText($f.FullName) } catch { continue }; if ($x -match ('<name>' + [regex]::Escape($nm) + '</name>')) { if ($x -match '<authMode>([^<]+)</authMode>') { $o.authMode = $matches[1] }; if ($x -match '<connectionMode>([^<]+)</connectionMode>' -and -not $o.modus) { $o.modus = $matches[1] }; if ($x -match '<(?:\w+:)?Type[^>]*>(\d+)</(?:\w+:)?Type>') { $o.eap = $matches[1] }; break } }
  }
  $T.profile = @($pr | Select-Object -First 20)

  # ── 6) Netzwerk im Standby, WcmSvc-Richtlinien, HP-BIOS ──
  $sb = Hex2 (powercfg /qh SCHEME_CURRENT SUB_NONE CONNECTIVITYINSTANDBY 2>$null | Out-String)
  $sp = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Power\PowerSettings\f15576e8-98b7-4186-b944-eafa664402d9'
  $T.standbyNetz = [ordered]@{ ac=$(if ($sb.Count -ge 1) { $sb[0] } else { $null }); dc=$(if ($sb.Count -ge 2) { $sb[1] } else { $null }); richtlinieAc=$sp.ACSettingIndex; richtlinieDc=$sp.DCSettingIndex }
  $w = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WcmSvc\GroupPolicy'
  $T.wcm = [ordered]@{ minimize=$w.fMinimizeConnections; blockNonDomain=$w.fBlockNonDomain; softDisconnect=$w.fSoftDisconnectConnections }
  try { $T.bios = @(Get-CimInstance -Namespace 'root\HP\InstrumentedBIOS' -ClassName HP_BIOSEnumeration -ErrorAction Stop | Where-Object { $_.Name -match 'LAN|WLAN|Wireless|Wake' } | Select-Object -First 15 | ForEach-Object { [ordered]@{ name=[string]$_.Name; wert=[string]$_.CurrentValue } }) } catch {}
} catch { $T.ok = $false; $T.fehler = "$_" }
$T.dauerMs = [int]((Get-Date) - $t0).TotalMilliseconds
'@@NETTIEFE@@' + ($T | ConvertTo-Json -Depth 7 -Compress)
`

function buildScript(host: string): string {
  return `try { Invoke-Command -ComputerName '${q(host)}' -ErrorAction Stop -ScriptBlock { ${TIEFE_INNER} } } catch { '@@NETTIEFE@@' + (@{ ok=$false; fehler=$_.Exception.Message } | ConvertTo-Json -Compress) }`
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v ? [v as T] : [])

/** Rohantwort → NetTiefe (ConvertTo-Json macht aus 1-Element-Listen Objekte). */
export function normalisiereTiefe(roh: unknown): NetTiefe {
  const t = (roh && typeof roh === 'object' ? roh : {}) as Partial<NetTiefe>
  return {
    ...t,
    trennungen: arr(t.trennungen),
    verbindungen: arr(t.verbindungen),
    umfeld: arr<NetTiefe['umfeld'][number]>(t.umfeld).map(f => ({ ...f, ereignisse: arr(f?.ereignisse) })),
    aufgaben: arr<NetTiefe['aufgaben'][number]>(t.aufgaben).map(a => ({ ...a, trigger: arr(a?.trigger) })),
    aenderungen: arr(t.aenderungen),
    profile: arr(t.profile),
    bios: arr(t.bios),
    software: arr(t.software),
    netzprofil: arr(t.netzprofil),
  }
}

export function leseTiefeAntwort(stdout: string): NetTiefe | null {
  const s = stdout || ''
  const i = s.lastIndexOf('@@NETTIEFE@@')
  if (i < 0) return null
  const body = s.slice(i + '@@NETTIEFE@@'.length)
  const a = body.indexOf('{'), b = body.lastIndexOf('}')
  if (a < 0 || b < a) return null
  try { return normalisiereTiefe(JSON.parse(body.slice(a, b + 1))) } catch { return null }
}

/** Tiefenanalyse auf dem Ziel-PC (WinRM muss schon erreichbar sein). */
export async function runTiefe(host: string): Promise<NetTiefe> {
  let r
  try { r = await api().runPowerShell(buildScript(host.trim()), 150000) }
  catch (e) { return normalisiereTiefe({ ok: false, fehler: e instanceof Error ? e.message : String(e) }) }
  const t = leseTiefeAntwort(r.stdout || '')
  if (t) return t
  return normalisiereTiefe({ ok: false, fehler: r.timedOut ? 'Tiefenanalyse: Zeitüberschreitung (150 s).' : `Tiefenanalyse: Antwort unlesbar. ${(r.stderr || '').slice(0, 160)}`.trim() })
}
