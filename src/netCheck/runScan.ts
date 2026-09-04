// ── Netzwerk-Diagnose: Scan-Orchestrierung (rein lesend, per WinRM) ───────────
// Führt EIN Collector-Skript per Invoke-Command auf dem Ziel-PC aus und liefert
// die maschinenlesbaren Rohdaten (NetDaten) zurück. Sprach-robust: Energieplan-
// Indizes/BSSID über GUID-/Registry-/MAC-Muster statt lokalisierter Labels.

import { api } from '../electronAPI'
import { ensureWinRM } from '../utils/winrmUtils'
import type { NetDaten, NetLauf, HostRolle } from './types'

function q(s: string): string { return (s || '').replace(/'/g, "''") }

/** JSON aus der (evtl. verrauschten) Standardausgabe herausschneiden. */
function extractJson(stdout: string): string {
  const s = stdout || ''
  const i = s.indexOf('@@NETJSON@@')
  const body = i >= 0 ? s.slice(i + '@@NETJSON@@'.length) : s
  const a = body.indexOf('{'); const b = body.lastIndexOf('}')
  if (a < 0 || b < 0 || b < a) throw new Error('keine JSON-Antwort')
  return body.slice(a, b + 1)
}

// Der Inner-ScriptBlock läuft auf dem ZIEL-PC. Nur lesende Cmdlets.
const INNER: string = [
  `$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'; $WarningPreference='SilentlyContinue'`,
  `$env:Path = "$env:SystemRoot\\System32;$env:SystemRoot\\System32\\wbem;$env:Path"`,
  `$out=[ordered]@{ ok=$true; hostname=$env:COMPUTERNAME; mehrereAdapter=0; adapter=$null; advanced=@(); powerMgmt=[ordered]@{}; powercfg=[ordered]@{}; verbindung=$null; ereignisse=$null; system=$null }`,
  `try {`,
  // ── WLAN-Adapter finden ──
  `  $wifis = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue | Where-Object { $_.PhysicalMediaType -match 'Native 802.11|Wireless' -or $_.InterfaceDescription -match 'Wi-Fi|Wireless|WLAN|802.11' })`,
  `  if (-not $wifis -or $wifis.Count -eq 0) { $wifis = @(Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.InterfaceDescription -match 'Wi-Fi|Wireless|WLAN|802.11' }) }`,
  `  $out.mehrereAdapter = $wifis.Count`,
  `  $up = @($wifis | Where-Object { $_.Status -eq 'Up' }) | Select-Object -First 1`,
  `  $wifi = if ($up) { $up } else { $wifis | Select-Object -First 1 }`,
  `  if ($wifi) {`,
  `    $dd = ''; try { if ($wifi.DriverDate) { $dd = ([datetime]$wifi.DriverDate).ToString('yyyy-MM-dd') } } catch { $dd = [string]$wifi.DriverDate }`,
  `    $out.adapter = [ordered]@{ name=[string]$wifi.Name; ifDesc=[string]$wifi.InterfaceDescription; mac=[string]$wifi.MacAddress; status=[string]$wifi.Status; linkSpeed=[string]$wifi.LinkSpeed; driverVersion=[string]$wifi.DriverVersion; driverDate=$dd; driverProvider=[string]$wifi.DriverProvider }`,
  // ── Advanced-Properties ──
  `    $ap = @(Get-NetAdapterAdvancedProperty -Name $wifi.Name -AllProperties -ErrorAction SilentlyContinue)`,
  `    $out.advanced = @($ap | ForEach-Object { [ordered]@{ name=[string]$_.DisplayName; value=[string]$_.DisplayValue; keyword=[string]$_.RegistryKeyword; regValue=[string](@($_.RegistryValue) -join ',') } } | Where-Object { $_.name -and $_.name -ne '-------------------- ' })`,
  // ── Geräte-Energieverwaltung ──
  `    $pm = Get-NetAdapterPowerManagement -Name $wifi.Name -ErrorAction SilentlyContinue`,
  `    if ($pm) { $out.powerMgmt.allowTurnOff = ([string]$pm.AllowComputerToTurnOffDevice -eq 'Enabled'); $out.powerMgmt.wakeMagic = ([string]$pm.WakeOnMagicPacket -eq 'Enabled') } else { $out.powerMgmt.allowTurnOff = $null }`,
  // PnPCapabilities über die Class-Key (per InterfaceGuid)
  `    $guid = [string]$wifi.InterfaceGuid`,
  `    $out.powerMgmt.pnpCapabilities = $null`,
  `    $classRoot = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e972-e325-11ce-bfc1-08002be10318}'`,
  `    foreach ($k in (Get-ChildItem $classRoot -ErrorAction SilentlyContinue)) { $p = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue; if ($p.NetCfgInstanceId -and ([string]$p.NetCfgInstanceId).ToUpper() -eq $guid.ToUpper()) { if ($p.PSObject.Properties.Name -contains 'PnPCapabilities') { $out.powerMgmt.pnpCapabilities = [int]$p.PnPCapabilities }; break } }`,
  // ── Aktuelle Verbindung (netsh, zweisprachige Muster) ──
  `    $nsh = (netsh wlan show interfaces 2>$null | Out-String)`,
  `    if ($nsh) { $v=[ordered]@{}; if ($nsh -match '(?im)^\\s*SSID\\s*:\\s*(.+?)\\s*$') { $v.ssid=$matches[1] }; if ($nsh -match '([0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5})') { $v.bssid=$matches[1] }; if ($nsh -match '(?im)Signal\\s*:\\s*(\\d+%)') { $v.signal=$matches[1] }; if ($nsh -match '(?im)(?:Radio type|Funktyp)\\s*:\\s*(\\S+)') { $v.radio=$matches[1] }; if ($nsh -match '(?im)(?:Channel|Kanal)\\s*:\\s*(\\d+)') { $v.kanal=$matches[1] }; if ($nsh -match '(?im)^\\s*Band\\s*:\\s*(.+?)\\s*$') { $v.band=$matches[1] }; if ($nsh -match '(?im)(?:Receive rate|Empfangsrate).*?:\\s*([\\d.]+)') { $v.rxRate=$matches[1] }; if ($nsh -match '(?im)(?:Transmit rate|Sende).*?:\\s*([\\d.]+)') { $v.txRate=$matches[1] }; if ($nsh -match '(?im)^\\s*(?:State|Status)\\s*:\\s*(\\S+)') { $v.state=$matches[1] }; $out.verbindung=$v }`,
  `  }`,
  // ── Energieplan: WLAN-Energiesparmodus (AC/DC), sprach-robust über 0x-Indizes ──
  `  $act = (powercfg /getactivescheme 2>$null | Out-String)`,
  `  if ($act -match '\\(([^)]+)\\)\\s*$') { $out.powercfg.schema = $matches[1].Trim() } elseif ($act -match '\\(([^)]+)\\)') { $out.powercfg.schema = $matches[1].Trim() }`,
  `  $qtext = (powercfg /q SCHEME_CURRENT 19cbb8fa-5279-450e-9fac-8a3d5fedd0c1 12bbebe6-58d6-4636-95bb-3217ef867c1a 2>$null | Out-String)`,
  `  $hex = @([regex]::Matches($qtext,'0x[0-9a-fA-F]{1,8}') | ForEach-Object { [Convert]::ToInt32($_.Value,16) })`,
  `  $out.powercfg.wlanAc = if ($hex.Count -ge 1) { $hex[0] } else { $null }`,
  `  $out.powercfg.wlanDc = if ($hex.Count -ge 2) { $hex[1] } else { $null }`,
  `  $pa = (powercfg /a 2>$null | Out-String); $out.powercfg.modernStandby = [bool]($pa -match 'S0\\b')`,
  // ── WLAN-Ereignisse (Aussetzer-Historie, 14 Tage) ──
  `  try {`,
  `    $ev = @(Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-WLAN-AutoConfig/Operational'; StartTime=(Get-Date).AddDays(-14) } -MaxEvents 800 -ErrorAction SilentlyContinue)`,
  `    $disc = @($ev | Where-Object { $_.Id -eq 8003 }); $conn = @($ev | Where-Object { $_.Id -eq 8001 }); $sec = @($ev | Where-Object { $_.Id -eq 11004 -or $_.Id -eq 11010 })`,
  `    $gr = @{}; $bc = @{}`,
  `    foreach ($e in $disc) { $m=([string]$e.Message); $line=($m -split '\\r?\\n')[0]; if ($line.Length -gt 140){$line=$line.Substring(0,140)}; if ($line) { if ($gr.ContainsKey($line)){$gr[$line]++} else {$gr[$line]=1} }; if ($m -match '([0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5})') { $b=$matches[1]; if ($bc.ContainsKey($b)){$bc[$b]++} else {$bc[$b]=1} } }`,
  `    $letzte = @($disc | Select-Object -First 15 | ForEach-Object { $m=[string]$_.Message; $b=$null; if ($m -match '([0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5})'){$b=$matches[1]}; [ordered]@{ id=[int]$_.Id; zeit=$_.TimeCreated.ToString('yyyy-MM-dd HH:mm'); grund=(($m -split '\\r?\\n')[0]); bssid=$b } })`,
  `    $out.ereignisse = [ordered]@{ tage=14; disconnects=$disc.Count; connects=$conn.Count; securityStops=$sec.Count; gruende=@($gr.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 6 | ForEach-Object { [ordered]@{ grund=[string]$_.Key; anzahl=[int]$_.Value } }); bssidCluster=@($bc.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 6 | ForEach-Object { [ordered]@{ bssid=[string]$_.Key; anzahl=[int]$_.Value } }); letzte=$letzte }`,
  `  } catch {}`,
  // ── System ──
  `  $cs = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue; $bios = Get-CimInstance Win32_BIOS -ErrorAction SilentlyContinue; $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue`,
  `  $out.system = [ordered]@{ modell=[string]$cs.Model; bios=[string]$bios.SMBIOSBIOSVersion; os=([string]$os.Caption + ' ' + [string]$os.Version) }`,
  `} catch { $out.ok=$false; $out.fehler = "$_" }`,
  `'@@NETJSON@@' + ($out | ConvertTo-Json -Depth 6 -Compress)`,
].join('\n')

function buildScript(host: string): string {
  return `try { Invoke-Command -ComputerName '${q(host)}' -ErrorAction Stop -ScriptBlock { ${INNER} } } catch { '@@NETJSON@@' + (@{ ok=$false; fehler=$_.Exception.Message } | ConvertTo-Json -Compress) }`
}

export interface RunNetOpts { isAborted?: () => boolean }

export async function runNetScan(
  host: string, by: string, rolle: HostRolle, opts?: RunNetOpts,
): Promise<{ ok: boolean; lauf?: NetLauf; error?: string }> {
  const h = (host || '').trim()
  if (!h) return { ok: false, error: 'Kein Host angegeben.' }
  if (opts?.isAborted?.()) return { ok: false, error: 'Abgebrochen' }
  if (!(await ensureWinRM(h))) return { ok: false, error: `„${h}" ist nicht per WinRM erreichbar (Netzwerk/WinRM prüfen).` }
  let r
  try { r = await api().runPowerShell(buildScript(h), 90000) }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
  let daten: NetDaten
  try { daten = JSON.parse(extractJson(r.stdout || '')) as NetDaten }
  catch { return { ok: false, error: `Antwort vom Ziel unlesbar. ${(r.stderr || '').slice(0, 180)}`.trim() } }
  if (!daten || daten.ok === false) return { ok: false, error: daten?.fehler || 'Scan fehlgeschlagen.' }
  // Normalisieren (ConvertTo-Json macht aus 1-Element-Arrays evtl. Objekte).
  if (!Array.isArray(daten.advanced)) daten.advanced = daten.advanced ? [daten.advanced as never] : []
  const lauf: NetLauf = {
    pc: (daten.hostname || h).toUpperCase(),
    ip: /^\d+\.\d+\.\d+\.\d+$/.test(h) ? h : undefined,
    rolle,
    ranAt: new Date().toISOString(),
    ranBy: by,
    ok: true,
    daten,
  }
  return { ok: true, lauf }
}
