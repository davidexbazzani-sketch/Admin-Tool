// ── Netzwerk-Diagnose: Änderungs-Engine (remote per WinRM) ───────────────────
// Wendet die gewählten Fixes an (powercfg / Geräte-Energieverwaltung / Adapter-
// Advanced-Settings), liest IMMER den Altwert (Backup) und ändert Advanced-
// Settings mit -NoRestart, damit die WinRM-Sitzung über das WLAN nicht abreißt.
// Adapter-Advanced-Änderungen werden erst nach Neuverbindung/Neustart aktiv.

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import type { NetFix } from './types'

function q(s: string): string { return (s || '').replace(/'/g, "''") }
function extractJson(stdout: string): string {
  const s = stdout || ''
  const i = s.indexOf('@@NETJSON@@')
  const body = i >= 0 ? s.slice(i + '@@NETJSON@@'.length) : s
  const a = body.indexOf('{'); const b = body.lastIndexOf('}')
  if (a < 0 || b < 0 || b < a) throw new Error('keine JSON-Antwort')
  return body.slice(a, b + 1)
}

export interface NetFixWire {
  id: string; titel: string; art: NetFix['art']
  adapter?: 'wlan' | 'lan'
  keyword?: string; displayName?: string; zielRegValue?: string; zielDisplay?: string
  powercfg?: string; powermgmt?: string
  profil?: string; aufgabePfad?: string; aufgabeName?: string
  /** reconnect-task: Aktion der Aufgabe als UTF-16-Base64 (für -EncodedCommand) */
  skriptB64?: string
}
export interface NetApplied {
  id: string; titel: string; art: string; adapter?: 'wlan' | 'lan'; keyword?: string
  profil?: string; aufgabePfad?: string; aufgabeName?: string
  alt: string; neu: string; ok: boolean; fehler?: string
  oldRegValue?: string | null; oldAc?: number | null; oldDc?: number | null; oldTurnOff?: boolean | null
}
export interface NetApplyResult { ok: boolean; results: NetApplied[]; neustartNoetig: boolean; error?: string }

// Gemeinsamer PS-Kopf: WLAN-Adapter finden, powercfg-Helfer.
const HEAD = [
  `$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'; $WarningPreference='SilentlyContinue'`,
  `$env:Path = "$env:SystemRoot\\System32;$env:SystemRoot\\System32\\wbem;$env:Path"`,
  `$wifis = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.PhysicalMediaType -match 'Native 802.11|Wireless' -or $_.InterfaceDescription -match 'Wi-Fi|Wireless|WLAN|802.11' })`,
  `if (-not $wifis -or $wifis.Count -eq 0) { $wifis = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -match 'Wi-Fi|Wireless|WLAN|802.11' }) }`,
  `$up = @($wifis | Where-Object { $_.Status -eq 'Up' }) | Select-Object -First 1`,
  `$wifi = if ($up) { $up } else { $wifis | Select-Object -First 1 }`,
  `$eths = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { ($_.PhysicalMediaType -match '802.3' -or $_.PhysicalMediaType -eq 'Ethernet') -and $_.InterfaceDescription -notmatch 'Virtual|Hyper-V|VPN|TAP|Loopback|Bluetooth|Kernel|WAN Miniport' })`,
  `$ethUp = @($eths | Where-Object { $_.Status -eq 'Up' }) | Select-Object -First 1`,
  `$eth = if ($ethUp) { $ethUp } else { $eths | Select-Object -First 1 }`,
  `$sub='19cbb8fa-5279-450e-9fac-8a3d5fedd0c1'; $set='12bbebe6-58d6-4636-95bb-3217ef867c1a'`,
  `$pnames=@('Höchstleistung','Geringe Energieeinsparung','Mittlere Energieeinsparung','Maximale Energieeinsparung')`,
  `function Read-WlanIdx { $t=(powercfg /q SCHEME_CURRENT $sub $set 2>$null | Out-String); @([regex]::Matches($t,'0x[0-9a-fA-F]{1,8}') | ForEach-Object { [Convert]::ToInt32($_.Value,16) }) }`,
  `function PName([object]$i){ if ($i -eq $null){'unbekannt'} else { $n=[int]$i; if ($n -ge 0 -and $n -lt $pnames.Count){$pnames[$n]}else{[string]$i} } }`,
  `$cr='HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e972-e325-11ce-bfc1-08002be10318}'`,
  `function Read-SbIdx { $t=(powercfg /qh SCHEME_CURRENT SUB_NONE CONNECTIVITYINSTANDBY 2>$null | Out-String); @([regex]::Matches($t,'0x[0-9a-fA-F]{1,8}') | ForEach-Object { [Convert]::ToInt32($_.Value,16) }) }`,
  `function SbName([object]$i){ if ($i -eq $null){'unbekannt'} else { switch ([int]$i) { 0 {'Deaktivieren'} 1 {'Aktivieren'} 2 {'Von Windows verwaltet'} default {[string]$i} } } }`,
  `function ProfModus([string]$n){ $o=(netsh wlan show profiles name="$n" 2>&1 | Out-String); if ($o -match '(?im)(Verbindungsmodus|Connection mode)\\s*:\\s*(.+?)\\s*$') { $matches[2] } else { '' } }`,
  `$tnNeu='ITAdminTool WLAN-Neuverbindung'`,
].join('\n')

// ── Anwenden ─────────────────────────────────────────────────────────────────
const APPLY_BODY = [
  `$parsed = $fj | ConvertFrom-Json; $fixes = @($parsed)`,
  `$results=@(); $needRestart=$false`,
  `foreach ($f in $fixes) {`,
  `  $r=[ordered]@{ id=[string]$f.id; titel=[string]$f.titel; art=[string]$f.art; adapter=[string]$f.adapter; keyword=[string]$f.keyword; profil=[string]$f.profil; aufgabePfad=[string]$f.aufgabePfad; aufgabeName=[string]$f.aufgabeName; alt=''; neu=''; ok=$false; fehler=$null; oldRegValue=$null; oldAc=$null; oldDc=$null; oldTurnOff=$null }`,
  `  $dev = if ([string]$f.adapter -eq 'lan') { $eth } else { $wifi }`,
  `  try {`,
  `    if ($f.art -eq 'powercfg') {`,
  `      $o=Read-WlanIdx; $r.oldAc = $(if($o.Count -ge 1){$o[0]}else{$null}); $r.oldDc = $(if($o.Count -ge 2){$o[1]}else{$null})`,
  `      $r.alt = "Netz: $(PName $r.oldAc) / Akku: $(PName $r.oldDc)"`,
  `      powercfg /setacvalueindex SCHEME_CURRENT $sub $set 0 | Out-Null; powercfg /setdcvalueindex SCHEME_CURRENT $sub $set 0 | Out-Null; powercfg /S SCHEME_CURRENT | Out-Null`,
  `      $n=Read-WlanIdx; $na=$(if($n.Count -ge 1){$n[0]}else{$null}); $nd=$(if($n.Count -ge 2){$n[1]}else{$null})`,
  `      $r.neu = "Netz: $(PName $na) / Akku: $(PName $nd)"; $r.ok = ($na -eq 0 -and $nd -eq 0)`,
  `    }`,
  `    elseif ($f.art -eq 'powermgmt') {`,
  `      if ($dev) {`,
  `        $pm = Get-NetAdapterPowerManagement -Name $dev.Name -ErrorAction SilentlyContinue`,
  `        if ($pm) { $r.oldTurnOff = ([string]$pm.AllowComputerToTurnOffDevice -eq 'Enabled'); $r.alt = $(if($r.oldTurnOff){'aktiviert'}else{'deaktiviert'}); try { $pm.AllowComputerToTurnOffDevice='Disabled'; $pm | Set-NetAdapterPowerManagement -ErrorAction SilentlyContinue } catch {} }`,
  `        $guid=[string]$dev.InterfaceGuid`,
  `        foreach($k in (Get-ChildItem $cr -ErrorAction SilentlyContinue)){ $p=Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue; if($p.NetCfgInstanceId -and ([string]$p.NetCfgInstanceId).ToUpper() -eq $guid.ToUpper()){ if($r.oldTurnOff -eq $null -and ($p.PSObject.Properties.Name -contains 'PnPCapabilities')){ $r.oldTurnOff = (([int]$p.PnPCapabilities -band 24) -ne 24) }; New-ItemProperty -Path $k.PSPath -Name PnPCapabilities -Value 24 -PropertyType DWord -Force | Out-Null; break } }`,
  `        if ($r.alt -eq '') { $r.alt = 'aktiviert' }; $r.neu='deaktiviert'`,
  `        $pm2 = Get-NetAdapterPowerManagement -Name $dev.Name -ErrorAction SilentlyContinue; $now = $(if($pm2){[string]$pm2.AllowComputerToTurnOffDevice -eq 'Enabled'}else{$false}); $r.ok = (-not $now)`,
  `      } else { $r.fehler='Kein Adapter' }`,
  `    }`,
  `    elseif ($f.art -eq 'standby-netz') {`,
  `      $o=Read-SbIdx; $r.oldAc = $(if($o.Count -ge 1){$o[0]}else{$null}); $r.oldDc = $(if($o.Count -ge 2){$o[1]}else{$null})`,
  `      $r.alt = "Netz: $(SbName $r.oldAc) / Akku: $(SbName $r.oldDc)"`,
  `      powercfg /setacvalueindex SCHEME_CURRENT SUB_NONE CONNECTIVITYINSTANDBY 1 | Out-Null; powercfg /S SCHEME_CURRENT | Out-Null`,
  `      $n=Read-SbIdx; $na=$(if($n.Count -ge 1){$n[0]}else{$null}); $nd=$(if($n.Count -ge 2){$n[1]}else{$null})`,
  `      $r.neu = "Netz: $(SbName $na) / Akku: $(SbName $nd)"; $r.ok = ($na -eq 1)`,
  `      if (-not $r.ok) { $r.fehler = 'Wert nicht übernommen (evtl. per Gruppenrichtlinie festgelegt)' }`,
  `    }`,
  `    elseif ($f.art -eq 'profil-auto') {`,
  `      $pn=[string]$f.profil; $r.alt = ProfModus $pn; $r.oldRegValue = $(if ($r.alt -match 'manuell|manual') { 'manual' } else { 'auto' })`,
  `      $o = (netsh wlan set profileparameter name="$pn" connectionmode=auto 2>&1 | Out-String)`,
  `      $r.neu = ProfModus $pn; $r.ok = ($r.neu -match 'automati')`,
  `      if (-not $r.ok) { $r.fehler = (@($o -split '\\r?\\n' | Where-Object { $_.Trim() }) | Select-Object -First 1) }`,
  `    }`,
  `    elseif ($f.art -eq 'aufgabe-aus') {`,
  `      $tk = Get-ScheduledTask -TaskPath ([string]$f.aufgabePfad) -TaskName ([string]$f.aufgabeName) -ErrorAction SilentlyContinue`,
  `      if ($tk) { $r.oldRegValue = [string]$tk.State; $r.alt = [string]$tk.State; Disable-ScheduledTask -InputObject $tk -ErrorAction SilentlyContinue | Out-Null; $n2 = Get-ScheduledTask -TaskPath ([string]$f.aufgabePfad) -TaskName ([string]$f.aufgabeName) -ErrorAction SilentlyContinue; $r.neu = [string]$n2.State; $r.ok = ($r.neu -eq 'Disabled') } else { $r.fehler = 'Aufgabe nicht gefunden' }`,
  `    }`,
  `    elseif ($f.art -eq 'reconnect-task') {`,
  `      $vorh = Get-ScheduledTask -TaskName $tnNeu -ErrorAction SilentlyContinue`,
  `      $r.oldRegValue = $(if ($vorh) { 'vorhanden' } else { 'neu' }); $r.alt = $(if ($vorh) { 'Aufgabe schon vorhanden' } else { 'keine' })`,
  `      $pn=[string]$f.profil`,
  `      $flt = '*[System[EventID=8003]]'; if ($pn -and $pn -notmatch '[''"<>&]') { $flt = "*[System[EventID=8003]] and *[EventData[Data[@Name='ProfileName']='" + $pn + "']]" }`,
  `      $sub = "<QueryList><Query Id='0' Path='Microsoft-Windows-WLAN-AutoConfig/Operational'><Select Path='Microsoft-Windows-WLAN-AutoConfig/Operational'>" + $flt + '</Select></Query></QueryList>'`,
  `      $tr = New-CimInstance -CimClass (Get-CimClass -Namespace Root/Microsoft/Windows/TaskScheduler -ClassName MSFT_TaskEventTrigger) -ClientOnly`,
  `      $tr.Enabled = $true; $tr.Delay = 'PT20S'; $tr.Subscription = $sub`,
  `      $ac = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand ' + [string]$f.skriptB64)`,
  `      $grp = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-545')).Translate([System.Security.Principal.NTAccount]).Value`,
  `      $pr = New-ScheduledTaskPrincipal -GroupId $grp -RunLevel Limited`,
  `      $st = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew`,
  `      try { Register-ScheduledTask -TaskName $tnNeu -TaskPath '\\' -Trigger $tr -Action $ac -Principal $pr -Settings $st -Description ('IT Admin Tool: verbindet das WLAN-Profil ' + $pn + ' nach einer Trennung automatisch neu (Notlösung).') -Force -ErrorAction Stop | Out-Null; $chk = Get-ScheduledTask -TaskName $tnNeu -ErrorAction SilentlyContinue; $r.ok = [bool]$chk; $r.neu = $(if ($chk) { 'Aufgabe aktiv (' + $pn + ')' } else { 'nicht angelegt' }) } catch { $r.fehler = "$_" }`,
  `    }`,
  `    elseif ($f.art -eq 'advanced') {`,
  `      if ($dev -and $f.keyword) {`,
  `        $cur = Get-NetAdapterAdvancedProperty -Name $dev.Name -RegistryKeyword $f.keyword -ErrorAction SilentlyContinue`,
  `        if (-not $cur -and $f.displayName) { $cur = Get-NetAdapterAdvancedProperty -Name $dev.Name -DisplayName $f.displayName -ErrorAction SilentlyContinue }`,
  `        if ($cur) { $r.oldRegValue = [string](@($cur.RegistryValue) -join ','); $r.alt = [string]$cur.DisplayValue + ' (' + $r.oldRegValue + ')' }`,
  `        $done=$false`,
  `        if ($f.zielRegValue -ne $null -and $f.zielRegValue -ne '') { try { Set-NetAdapterAdvancedProperty -Name $dev.Name -RegistryKeyword $f.keyword -RegistryValue $f.zielRegValue -NoRestart -ErrorAction Stop; $done=$true } catch { $r.fehler="$_" } }`,
  `        if (-not $done -and $f.zielDisplay) { try { Set-NetAdapterAdvancedProperty -Name $dev.Name -RegistryKeyword $f.keyword -DisplayValue $f.zielDisplay -NoRestart -ErrorAction Stop; $done=$true; $r.fehler=$null } catch { $r.fehler="$_" } }`,
  `        $chk = Get-NetAdapterAdvancedProperty -Name $dev.Name -RegistryKeyword $f.keyword -ErrorAction SilentlyContinue; if ($chk) { $r.neu = [string]$chk.DisplayValue + ' (' + [string](@($chk.RegistryValue) -join ',') + ')' }`,
  `        $r.ok = $done; if ($done) { $needRestart=$true }`,
  `      } else { $r.fehler='Kein Adapter/Keyword' }`,
  `    }`,
  `  } catch { $r.fehler = "$_" }`,
  `  $results += $r`,
  `}`,
  `'@@NETJSON@@' + (@{ ok=$true; results=$results; neustartNoetig=$needRestart } | ConvertTo-Json -Depth 6 -Compress)`,
].join('\n')

// ── Wiederherstellen ─────────────────────────────────────────────────────────
const RESTORE_BODY = [
  `$parsed = $fj | ConvertFrom-Json; $fixes = @($parsed)`,
  `$results=@(); $needRestart=$false`,
  `foreach ($f in $fixes) {`,
  `  $r=[ordered]@{ id=[string]$f.id; titel=[string]$f.titel; art=[string]$f.art; keyword=[string]$f.keyword; alt=''; neu=''; ok=$false; fehler=$null }`,
  `  $dev = if ([string]$f.adapter -eq 'lan') { $eth } else { $wifi }`,
  `  try {`,
  `    if ($f.art -eq 'powercfg') {`,
  `      $ac=[int]$f.oldAc; $dc=[int]$f.oldDc`,
  `      powercfg /setacvalueindex SCHEME_CURRENT $sub $set $ac | Out-Null; powercfg /setdcvalueindex SCHEME_CURRENT $sub $set $dc | Out-Null; powercfg /S SCHEME_CURRENT | Out-Null`,
  `      $r.neu = "Netz: $(PName $ac) / Akku: $(PName $dc)"; $r.ok=$true`,
  `    }`,
  `    elseif ($f.art -eq 'powermgmt') {`,
  `      if ($dev) {`,
  `        $ziel = $(if($f.oldTurnOff -eq $true){'Enabled'}else{'Disabled'})`,
  `        $pm = Get-NetAdapterPowerManagement -Name $dev.Name -ErrorAction SilentlyContinue; if ($pm) { try { $pm.AllowComputerToTurnOffDevice=$ziel; $pm | Set-NetAdapterPowerManagement -ErrorAction SilentlyContinue } catch {} }`,
  `        $guid=[string]$dev.InterfaceGuid; $val = $(if($f.oldTurnOff -eq $true){0}else{24})`,
  `        foreach($k in (Get-ChildItem $cr -ErrorAction SilentlyContinue)){ $p=Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue; if($p.NetCfgInstanceId -and ([string]$p.NetCfgInstanceId).ToUpper() -eq $guid.ToUpper()){ New-ItemProperty -Path $k.PSPath -Name PnPCapabilities -Value $val -PropertyType DWord -Force | Out-Null; break } }`,
  `        $r.neu=$ziel; $r.ok=$true`,
  `      } else { $r.fehler='Kein Adapter' }`,
  `    }`,
  `    elseif ($f.art -eq 'standby-netz') {`,
  `      if ($f.oldAc -ne $null) { powercfg /setacvalueindex SCHEME_CURRENT SUB_NONE CONNECTIVITYINSTANDBY ([int]$f.oldAc) | Out-Null; powercfg /S SCHEME_CURRENT | Out-Null; $r.neu = "Netz: $(SbName $f.oldAc)"; $r.ok=$true } else { $r.fehler='Kein Altwert' }`,
  `    }`,
  `    elseif ($f.art -eq 'profil-auto') {`,
  `      if ([string]$f.oldRegValue -eq 'manual') { $pn=[string]$f.profil; netsh wlan set profileparameter name="$pn" connectionmode=manual 2>&1 | Out-Null; $r.neu = ProfModus $pn; $r.ok = ($r.neu -match 'manu') } else { $r.ok=$true; $r.neu='unverändert (war schon automatisch)' }`,
  `    }`,
  `    elseif ($f.art -eq 'aufgabe-aus') {`,
  `      if ([string]$f.oldRegValue -and [string]$f.oldRegValue -ne 'Disabled') { $tk = Get-ScheduledTask -TaskPath ([string]$f.aufgabePfad) -TaskName ([string]$f.aufgabeName) -ErrorAction SilentlyContinue; if ($tk) { Enable-ScheduledTask -InputObject $tk -ErrorAction SilentlyContinue | Out-Null; $r.neu = [string](Get-ScheduledTask -TaskPath ([string]$f.aufgabePfad) -TaskName ([string]$f.aufgabeName)).State; $r.ok = ($r.neu -ne 'Disabled') } else { $r.fehler='Aufgabe nicht gefunden' } } else { $r.ok=$true; $r.neu='unverändert' }`,
  `    }`,
  `    elseif ($f.art -eq 'reconnect-task') {`,
  `      if ([string]$f.oldRegValue -eq 'neu') { Unregister-ScheduledTask -TaskName $tnNeu -Confirm:$false -ErrorAction SilentlyContinue; $r.ok = -not (Get-ScheduledTask -TaskName $tnNeu -ErrorAction SilentlyContinue); $r.neu = $(if ($r.ok) { 'Aufgabe entfernt' } else { 'Aufgabe noch da' }) } else { $r.ok=$true; $r.neu='unverändert (bestand schon vorher)' }`,
  `    }`,
  `    elseif ($f.art -eq 'advanced') {`,
  `      if ($dev -and $f.keyword -and $f.oldRegValue -ne $null -and $f.oldRegValue -ne '') {`,
  `        try { Set-NetAdapterAdvancedProperty -Name $dev.Name -RegistryKeyword $f.keyword -RegistryValue $f.oldRegValue -NoRestart -ErrorAction Stop; $r.ok=$true; $needRestart=$true; $r.neu=[string]$f.oldRegValue } catch { $r.fehler="$_" }`,
  `      } else { $r.fehler='Kein Altwert' }`,
  `    }`,
  `  } catch { $r.fehler = "$_" }`,
  `  $results += $r`,
  `}`,
  `'@@NETJSON@@' + (@{ ok=$true; results=$results; neustartNoetig=$needRestart } | ConvertTo-Json -Depth 6 -Compress)`,
].join('\n')

function buildScript(host: string, body: string, fixesJson: string): string {
  // param() MUSS die erste Anweisung im ScriptBlock sein → HEAD/Body danach.
  const inner = `param($fj)\n${HEAD}\n${body}`
  return `try { Invoke-Command -ComputerName '${q(host)}' -ErrorAction Stop -ArgumentList '${q(fixesJson)}' -ScriptBlock { ${inner} } } catch { '@@NETJSON@@' + (@{ ok=$false; results=@(); neustartNoetig=$false; error=$_.Exception.Message } | ConvertTo-Json -Compress) }`
}

async function run(host: string, body: string, fixesJson: string): Promise<NetApplyResult> {
  const h = (host || '').trim()
  if (!h) return { ok: false, results: [], neustartNoetig: false, error: 'Kein Host.' }
  if (!(await ensureWinRM(h))) return { ok: false, results: [], neustartNoetig: false, error: `„${h}" nicht per WinRM erreichbar.` }
  let r
  try { r = await api().runPowerShell(buildScript(h, body, fixesJson), 120000) }
  catch (e) { return { ok: false, results: [], neustartNoetig: false, error: e instanceof Error ? e.message : String(e) } }
  try {
    const j = JSON.parse(extractJson(r.stdout || '')) as NetApplyResult
    if (!Array.isArray(j.results)) j.results = j.results ? [j.results as never] : []
    return j
  } catch { return { ok: false, results: [], neustartNoetig: false, error: `Antwort unlesbar. ${(r.stderr || '').slice(0, 180)}`.trim() } }
}

export async function applyNetFixes(host: string, fixes: NetFixWire[]): Promise<NetApplyResult> {
  return run(host, APPLY_BODY, JSON.stringify(fixes))
}
export async function restoreNetFixes(host: string, backup: NetApplied[]): Promise<NetApplyResult> {
  return run(host, RESTORE_BODY, JSON.stringify(backup))
}

/** NetBefund.fix → Wire-Objekt fürs Remote-Skript. */
export function fixToWire(id: string, titel: string, fix: NetFix): NetFixWire {
  return {
    id, titel, art: fix.art, adapter: fix.adapter, keyword: fix.keyword, displayName: fix.displayName,
    zielRegValue: fix.zielRegValue, zielDisplay: fix.zielDisplay,
    powercfg: fix.powercfg, powermgmt: fix.powermgmt,
    profil: fix.profil, aufgabePfad: fix.aufgabePfad, aufgabeName: fix.aufgabeName,
    skriptB64: fix.art === 'reconnect-task' && fix.profil ? utf16b64(neuverbindungsSkript(fix.profil)) : undefined,
  }
}

/**
 * Aktion der Notlösungs-Aufgabe (läuft 20 s nach Event 8003 für den angemeldeten Benutzer).
 * Verbindet NUR, wenn kein LAN-Kabel aktiv ist, das WLAN gerade nicht verbunden ist und der
 * Benutzer nicht selbst ein anderes Netz gewählt hat (ReasonCode 3 = „neue Verbindung").
 */
export function neuverbindungsSkript(profil: string): string {
  const p = profil.replace(/'/g, "''")
  return [
    "$ErrorActionPreference='SilentlyContinue'",
    "if (@(Get-NetAdapter -Physical | Where-Object { $_.Status -eq 'Up' -and $_.PhysicalMediaType -match '802.3' }).Count) { return }",
    "$w = @(Get-NetAdapter -Physical | Where-Object { $_.PhysicalMediaType -match 'Native 802.11|Wireless' -or $_.InterfaceDescription -match 'Wi-Fi|Wireless|WLAN' }) | Select-Object -First 1",
    "if (-not $w -or $w.Status -eq 'Up') { return }",
    "$ev = Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-WLAN-AutoConfig/Operational'; Id=8003 } -MaxEvents 1",
    "if ($ev) { $rc = (([xml]$ev.ToXml()).Event.EventData.Data | Where-Object { $_.Name -eq 'ReasonCode' }).'#text'; if ($rc -eq '3') { return } }",
    "& \"$env:SystemRoot\\System32\\netsh.exe\" wlan connect ('name=' + '" + p + "')",
  ].join('\n')
}

/** String → UTF-16LE → Base64 (Format für powershell -EncodedCommand) */
export function utf16b64(s: string): string {
  let bin = ''
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); bin += String.fromCharCode(c & 255, c >> 8) }
  return btoa(bin)
}

// ── Backup je PC (für „Rückgängig") ──────────────────────────────────────────
export interface NetFixBackup { host: string; changedAt: string; changedBy: string; entries: NetApplied[]; neustartNoetig?: boolean }

function slugHost(h: string): string { return (h || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') }
const backupPath = (host: string) => `netzwerk-diagnose/fixbackup_${slugHost(host)}.json`

export async function saveFixBackup(b: NetFixBackup): Promise<void> {
  try { await api().netWriteJson(backupPath(b.host), b) } catch { /* egal */ }
}
export async function loadFixBackup(host: string): Promise<NetFixBackup | null> {
  try { return await api().netReadJson<NetFixBackup>(backupPath(host)) } catch { return null }
}
