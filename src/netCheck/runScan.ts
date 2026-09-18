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

// Der Inner-ScriptBlock läuft auf dem ZIEL-PC. Nur lesende Cmdlets (+ leichter Ping-Test).
const INNER: string = [
  `$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'; $WarningPreference='SilentlyContinue'`,
  `$env:Path = "$env:SystemRoot\\System32;$env:SystemRoot\\System32\\wbem;$env:Path"`,
  `$out=[ordered]@{ ok=$true; hostname=$env:COMPUTERNAME; aktiv=[ordered]@{ wlan=$false; lan=$false }; mehrereAdapter=0; adapter=$null; advanced=@(); powerMgmt=[ordered]@{}; powercfg=[ordered]@{}; verbindung=$null; ereignisse=$null; lan=$null; lanAdvanced=@(); lanPowerMgmt=[ordered]@{}; lanStatistik=$null; lanVerbindung=$null; lanEreignisse=$null; ipconfig=$null; pingTests=@(); tcpGlobal=$null; system=$null }`,
  `$classRoot = 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e972-e325-11ce-bfc1-08002be10318}'`,
  // Hilfsfunktionen (Adapter-Info / Advanced-Props / PnPCapabilities)
  `function AInfo($a) { $dd=''; try { if ($a.DriverDate) { $dd=([datetime]$a.DriverDate).ToString('yyyy-MM-dd') } } catch { $dd=[string]$a.DriverDate }; [ordered]@{ name=[string]$a.Name; ifDesc=[string]$a.InterfaceDescription; mac=[string]$a.MacAddress; status=[string]$a.Status; linkSpeed=[string]$a.LinkSpeed; driverVersion=[string]$a.DriverVersion; driverDate=$dd; driverProvider=[string]$a.DriverProvider } }`,
  `function AAdv($nm) { @(Get-NetAdapterAdvancedProperty -Name $nm -AllProperties -ErrorAction SilentlyContinue | ForEach-Object { [ordered]@{ name=[string]$_.DisplayName; value=[string]$_.DisplayValue; keyword=[string]$_.RegistryKeyword; regValue=[string](@($_.RegistryValue) -join ',') } } | Where-Object { $_.name -and $_.name -ne '-------------------- ' }) }`,
  `function APnp($guid) { $cap=$null; foreach ($k in (Get-ChildItem $classRoot -ErrorAction SilentlyContinue)) { $p=Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue; if ($p.NetCfgInstanceId -and ([string]$p.NetCfgInstanceId).ToUpper() -eq ([string]$guid).ToUpper()) { if ($p.PSObject.Properties.Name -contains 'PnPCapabilities') { $cap=[int]$p.PnPCapabilities }; break } }; $cap }`,
  `function GW($ifx) { (Get-NetIPConfiguration -InterfaceIndex $ifx -ErrorAction SilentlyContinue).IPv4DefaultGateway.NextHop | Select-Object -First 1 }`,
  `function PingT($label,$ziel) { if (-not $ziel) { return }; $c=10; $r=@(Test-Connection -ComputerName $ziel -Count $c -ErrorAction SilentlyContinue); if ($r) { $rt=@($r | ForEach-Object { $_.ResponseTime } | Where-Object { $_ -ne $null }); $recv=$r.Count; $loss=[math]::Round((($c-$recv)/$c)*100,0); $min=($rt|Measure-Object -Minimum).Minimum; $max=($rt|Measure-Object -Maximum).Maximum; $avg=[math]::Round((($rt|Measure-Object -Average).Average),1); $script:pt += ,([ordered]@{ ziel="$label $ziel"; verlust=$loss; min=$min; avg=$avg; max=$max; jitter=[math]::Round(($max-$min),1) }) } else { $script:pt += ,([ordered]@{ ziel="$label $ziel"; verlust=100; min=$null; avg=$null; max=$null; jitter=$null }) } }`,
  `$script:pt=@()`,
  `try {`,
  // ── Adapter-Enumeration: WLAN + LAN ──
  `  $phys = @(Get-NetAdapter -Physical -ErrorAction SilentlyContinue)`,
  `  $wifis = @($phys | Where-Object { $_.PhysicalMediaType -match 'Native 802.11|Wireless' -or $_.InterfaceDescription -match 'Wi-Fi|Wireless|WLAN|802.11' })`,
  `  $eths  = @($phys | Where-Object { ($_.PhysicalMediaType -match '802.3' -or $_.PhysicalMediaType -eq 'Ethernet') -and $_.InterfaceDescription -notmatch 'Virtual|Hyper-V|VPN|TAP|Loopback|Bluetooth|Kernel|WAN Miniport' })`,
  `  $wifi = @($wifis | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1); if (-not $wifi) { $wifi = @($wifis | Select-Object -First 1) }; $wifi = $wifi | Select-Object -First 1`,
  `  $eth  = @($eths  | Where-Object { $_.Status -eq 'Up' } | Select-Object -First 1); if (-not $eth)  { $eth  = @($eths  | Select-Object -First 1) }; $eth  = $eth  | Select-Object -First 1`,
  `  $out.mehrereAdapter = $wifis.Count`,
  // ── WLAN ──
  `  if ($wifi) {`,
  `    $out.adapter = AInfo $wifi; $out.advanced = AAdv $wifi.Name`,
  `    $pm = Get-NetAdapterPowerManagement -Name $wifi.Name -ErrorAction SilentlyContinue`,
  `    if ($pm) { $out.powerMgmt.allowTurnOff = ([string]$pm.AllowComputerToTurnOffDevice -eq 'Enabled'); $out.powerMgmt.wakeMagic = ([string]$pm.WakeOnMagicPacket -eq 'Enabled') } else { $out.powerMgmt.allowTurnOff = $null }`,
  `    $out.powerMgmt.pnpCapabilities = APnp ([string]$wifi.InterfaceGuid)`,
  `    if ($wifi.Status -eq 'Up') { $out.aktiv.wlan = $true }`,
  `    $nsh = (netsh wlan show interfaces 2>$null | Out-String)`,
  `    if ($nsh) { $v=[ordered]@{}; if ($nsh -match '(?im)^\\s*SSID\\s*:\\s*(.+?)\\s*$') { $v.ssid=$matches[1] }; if ($nsh -match '([0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5})') { $v.bssid=$matches[1] }; if ($nsh -match '(?im)Signal\\s*:\\s*(\\d+%)') { $v.signal=$matches[1] }; if ($nsh -match '(?im)(?:Radio type|Funktyp)\\s*:\\s*(\\S+)') { $v.radio=$matches[1] }; if ($nsh -match '(?im)(?:Channel|Kanal)\\s*:\\s*(\\d+)') { $v.kanal=$matches[1] }; if ($nsh -match '(?im)^\\s*Band\\s*:\\s*(.+?)\\s*$') { $v.band=$matches[1] }; if ($nsh -match '(?im)(?:Receive rate|Empfangsrate).*?:\\s*([\\d.]+)') { $v.rxRate=$matches[1] }; if ($nsh -match '(?im)(?:Transmit rate|Sende).*?:\\s*([\\d.]+)') { $v.txRate=$matches[1] }; if ($nsh -match '(?im)^\\s*(?:State|Status)\\s*:\\s*(\\S+)') { $v.state=$matches[1] }; $out.verbindung=$v }`,
  `    $qtext = (powercfg /q SCHEME_CURRENT 19cbb8fa-5279-450e-9fac-8a3d5fedd0c1 12bbebe6-58d6-4636-95bb-3217ef867c1a 2>$null | Out-String)`,
  `    $hex = @([regex]::Matches($qtext,'0x[0-9a-fA-F]{1,8}') | ForEach-Object { [Convert]::ToInt32($_.Value,16) })`,
  `    $out.powercfg.wlanAc = if ($hex.Count -ge 1) { $hex[0] } else { $null }; $out.powercfg.wlanDc = if ($hex.Count -ge 2) { $hex[1] } else { $null }`,
  `    try {`,
  `      $ev = @(Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-WLAN-AutoConfig/Operational'; StartTime=(Get-Date).AddDays(-14) } -MaxEvents 800 -ErrorAction SilentlyContinue)`,
  `      $disc = @($ev | Where-Object { $_.Id -eq 8003 }); $conn = @($ev | Where-Object { $_.Id -eq 8001 }); $sec = @($ev | Where-Object { $_.Id -eq 11004 -or $_.Id -eq 11010 })`,
  `      $auth = @($ev | Where-Object { $_.Id -eq 11006 }); $cfail = @($ev | Where-Object { $_.Id -eq 8002 })`,
  `      $gr = @{}; $bc = @{}`,
  `      foreach ($e in $disc) { $m=([string]$e.Message); $line=($m -split '\\r?\\n')[0]; if ($line.Length -gt 140){$line=$line.Substring(0,140)}; if ($line) { if ($gr.ContainsKey($line)){$gr[$line]++} else {$gr[$line]=1} }; if ($m -match '([0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5})') { $b=$matches[1]; if ($bc.ContainsKey($b)){$bc[$b]++} else {$bc[$b]=1} } }`,
  `      $letzte = @($disc | Select-Object -First 15 | ForEach-Object { $m=[string]$_.Message; $b=$null; if ($m -match '([0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5})'){$b=$matches[1]}; [ordered]@{ id=[int]$_.Id; zeit=$_.TimeCreated.ToString('yyyy-MM-dd HH:mm'); grund=(($m -split '\\r?\\n')[0]); bssid=$b } })`,
  `      $out.ereignisse = [ordered]@{ tage=14; disconnects=$disc.Count; connects=$conn.Count; securityStops=$sec.Count; authFehler=$auth.Count; connectFehler=$cfail.Count; gruende=@($gr.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 6 | ForEach-Object { [ordered]@{ grund=[string]$_.Key; anzahl=[int]$_.Value } }); bssidCluster=@($bc.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 6 | ForEach-Object { [ordered]@{ bssid=[string]$_.Key; anzahl=[int]$_.Value } }); letzte=$letzte }`,
  `    } catch {}`,
  `  }`,
  // ── LAN (Ethernet) ──
  `  if ($eth) {`,
  `    $out.lan = AInfo $eth; $out.lanAdvanced = AAdv $eth.Name`,
  `    $lpm = Get-NetAdapterPowerManagement -Name $eth.Name -ErrorAction SilentlyContinue`,
  `    if ($lpm) { $out.lanPowerMgmt.allowTurnOff = ([string]$lpm.AllowComputerToTurnOffDevice -eq 'Enabled'); $out.lanPowerMgmt.wakeMagic = ([string]$lpm.WakeOnMagicPacket -eq 'Enabled') } else { $out.lanPowerMgmt.allowTurnOff = $null }`,
  `    $out.lanPowerMgmt.pnpCapabilities = APnp ([string]$eth.InterfaceGuid)`,
  `    $st = Get-NetAdapterStatistics -Name $eth.Name -ErrorAction SilentlyContinue`,
  `    if ($st) { $out.lanStatistik = [ordered]@{ rxBytes=[long]$st.ReceivedBytes; txBytes=[long]$st.SentBytes; rxErr=[long]$st.ReceivedPacketErrors; txErr=[long]$st.OutboundPacketErrors; rxDisc=[long]$st.ReceivedDiscardedPackets; txDisc=[long]$st.OutboundDiscardedPackets } }`,
  `    $out.lanVerbindung = [ordered]@{ linkSpeed=[string]$eth.LinkSpeed; mediaState=[string]$eth.MediaConnectionState }`,
  `    if ($eth.Status -eq 'Up') { $out.aktiv.lan = $true }`,
  `    try {`,
  `      $np = @(Get-WinEvent -FilterHashtable @{ LogName='Microsoft-Windows-NetworkProfile/Operational'; StartTime=(Get-Date).AddDays(-14) } -MaxEvents 500 -ErrorAction SilentlyContinue)`,
  `      $ldisc = @($np | Where-Object { $_.Id -eq 10001 }); $lconn = @($np | Where-Object { $_.Id -eq 10000 })`,
  `      $lletzte = @($ldisc | Select-Object -First 15 | ForEach-Object { [ordered]@{ id=[int]$_.Id; zeit=$_.TimeCreated.ToString('yyyy-MM-dd HH:mm'); grund=(([string]$_.Message -split '\\r?\\n')[0]) } })`,
  `      $out.lanEreignisse = [ordered]@{ tage=14; disconnects=$ldisc.Count; connects=$lconn.Count; letzte=$lletzte }`,
  `    } catch {}`,
  `  }`,
  // ── IP-Config (aktives Interface bevorzugt LAN) + Ping-Tests zum Gateway ──
  `  $primAd = if ($eth -and $eth.Status -eq 'Up') { $eth } elseif ($wifi -and $wifi.Status -eq 'Up') { $wifi } else { $null }`,
  `  if ($primAd) { $c = Get-NetIPConfiguration -InterfaceIndex $primAd.ifIndex -ErrorAction SilentlyContinue; if ($c) { $out.ipconfig = [ordered]@{ ip=[string]($c.IPv4Address.IPAddress -join ', '); gateway=[string]($c.IPv4DefaultGateway.NextHop -join ', '); dns=[string](@($c.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | ForEach-Object { $_.ServerAddresses }) -join ', '); profil=[string]$c.NetProfile.Name } } }`,
  `  if ($eth -and $eth.Status -eq 'Up') { PingT 'LAN-Gateway' (GW $eth.ifIndex) }`,
  `  if ($wifi -and $wifi.Status -eq 'Up') { PingT 'WLAN-Gateway' (GW $wifi.ifIndex) }`,
  `  $out.pingTests = @($script:pt)`,
  // ── Energieplan (Name + Modern Standby) ──
  `  $act = (powercfg /getactivescheme 2>$null | Out-String)`,
  `  if ($act -match '\\(([^)]+)\\)\\s*$') { $out.powercfg.schema = $matches[1].Trim() } elseif ($act -match '\\(([^)]+)\\)') { $out.powercfg.schema = $matches[1].Trim() }`,
  `  $pa = (powercfg /a 2>$null | Out-String); $out.powercfg.modernStandby = [bool]($pa -match 'S0\\b')`,
  // ── TCP-Global ──
  `  try { $tg=(netsh int tcp show global 2>$null | Out-String); $out.tcpGlobal=[ordered]@{ autotuning=([regex]::Match($tg,'(?im)Autotuninglevel\\s*:\\s*(\\S+)').Groups[1].Value); rss=([regex]::Match($tg,'(?im)(?:Receive-Side Scaling|Empfangsseitige).*?:\\s*(\\S+)').Groups[1].Value); rsc=([regex]::Match($tg,'(?im)(?:Receive Segment Coalescing).*?:\\s*(\\S+)').Groups[1].Value) } } catch {}`,
  // ── System + angemeldeter Benutzer ──
  `  $cs = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue; $bios = Get-CimInstance Win32_BIOS -ErrorAction SilentlyContinue; $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue`,
  `  $out.system = [ordered]@{ modell=[string]$cs.Model; bios=[string]$bios.SMBIOSBIOSVersion; os=([string]$os.Caption + ' ' + [string]$os.Version); benutzer=[string]$cs.UserName }`,
  `} catch { $out.ok=$false; $out.fehler = "$_" }`,
  `'@@NETJSON@@' + ($out | ConvertTo-Json -Depth 7 -Compress)`,
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
  try { r = await api().runPowerShell(buildScript(h), 120000) }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) } }
  let daten: NetDaten
  try { daten = JSON.parse(extractJson(r.stdout || '')) as NetDaten }
  catch { return { ok: false, error: `Antwort vom Ziel unlesbar. ${(r.stderr || '').slice(0, 180)}`.trim() } }
  if (!daten || daten.ok === false) return { ok: false, error: daten?.fehler || 'Scan fehlgeschlagen.' }
  // Normalisieren (ConvertTo-Json macht aus 1-Element-Arrays evtl. Objekte).
  const arr = <T,>(v: unknown): T[] => Array.isArray(v) ? v as T[] : (v ? [v as T] : [])
  if (!Array.isArray(daten.advanced)) daten.advanced = daten.advanced ? [daten.advanced as never] : []
  daten.lanAdvanced = arr(daten.lanAdvanced)
  daten.pingTests = arr(daten.pingTests)
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
