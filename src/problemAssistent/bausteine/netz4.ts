// ── Problem-Assistent: Lösungsbausteine Runde 4, Gruppe „netz“ ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Alles wirkt nur auf dem Ziel-PC (Bindungen, Routen, Dienste, Treiberwerte, Registry von Windows/.NET).
// Switches, Router, DHCP-/DNS-Server, Firewall-Regeln, Gruppenrichtlinien und Zscaler ändert nichts davon.
// Schutz der eigenen Fernverbindung: Was Routen oder IP-Bindungen ändert, fasst den Adapter bzw. die Route,
// über die gerade die WinRM-Verbindung des Tools läuft (Port 5985/5986), nie an.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** Physische LAN- und WLAN-Adapter (ohne Bluetooth-PAN). */
const ADAPTER_PS = String.raw`
function LanAdapter { @(Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { $_.PhysicalMediaType -match '802\.3' -and $_.InterfaceDescription -notmatch 'Wi-?Fi|Wireless|WLAN|Bluetooth' }) }
function WlanAdapter { @(Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { $_.PhysicalMediaType -match '802\.11' -or ($_.InterfaceDescription -match 'Wi-?Fi|Wireless|WLAN' -and $_.PhysicalMediaType -notmatch 'Bluetooth') }) }
`

/** Routen, über die gerade die Fernverbindung des Tools läuft (WinRM 5985/5986). */
const FERN_PS = String.raw`
function FernRouten {
  $l = @()
  foreach ($c in @(Get-NetTCPConnection -LocalPort 5985, 5986 -State Established -EA SilentlyContinue)) {
    $ra = [string]$c.RemoteAddress
    if ($ra -match '^(127\.|::1$)') { continue }
    try { $l += @(Find-NetRoute -RemoteIPAddress $ra -EA Stop | Where-Object { $_.DestinationPrefix }) } catch {}
  }
  return $l
}
`

/** Präfixlänge → Subnetzmaske, Text kürzen. */
const HILFE_PS = String.raw`
function Maske([int]$len) { $o = @(); for ($i = 0; $i -lt 4; $i++) { $b = [math]::Min(8, [math]::Max(0, $len - 8 * $i)); $o += [string](256 - [math]::Pow(2, 8 - $b)) }; return ($o -join '.') }
function Kurz([string]$t, [int]$max) { $t = ($t -replace '\s+', ' ').Trim(); if ($t.Length -gt $max) { return $t.Substring(0, $max) + ' …' }; return $t }
`

export const AKTIONEN_NETZ4: PaAktion[] = [
  // ══ IP-Konfiguration (lesend) ═══════════════════════════════════════════════
  A({ id: 'netz4-ip-details', titel: 'IP-Konfiguration im Detail (DHCP, Gateway, Routen, Konflikte, Verbindungen, AD-Standort)', modus: 'system', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Je verbundenem Adapter: IP-Adressen mit Subnetzmaske und Herkunft (DHCP/fest/169.254), mehrere Adressen, DHCP-Server und Lease-Zeiten, Gateway mit Metrik und MAC, DNS, Suffix, NetBIOS, Netzwerkprofil und Paketfehler. Dazu Standardgateways an mehreren Adaptern, fest eingetragene Routen, feste ARP-Einträge, IP-Konflikte und DHCP-Fehler der letzten 7 Tage, Netzwerk-Trennungen, TCP-Verbindungen je Programm (Portknappheit), lauschende Ports, von Windows reservierte Portbereiche, getaktete Verbindung sowie AD-Standort und Domänencontroller. Ändert nichts.',
    ps: String.raw`
${HILFE_PS}
$cfg = @{}
foreach ($w in @(Get-CimInstance Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=TRUE' -EA SilentlyContinue)) { $cfg[[int]$w.InterfaceIndex] = $w }
$alle = @(Get-NetAdapter -EA SilentlyContinue | Sort-Object @{ Expression = { $_.Status -ne 'Up' } }, Name)
foreach ($a in $alle) {
  $phys = [bool]$a.HardwareInterface
  if ($a.Status -ne 'Up') { if ($phys) { Zeile ('' + $a.Name + ' (' + $a.InterfaceDescription + '): ' + $a.Status + ' · MAC ' + $a.MacAddress) }; continue }
  Zeile ('' + $a.Name + ' (' + $a.InterfaceDescription + '): verbunden · ' + $a.LinkSpeed + ' · MAC ' + $a.MacAddress + $(if (-not $phys) { ' · virtuell' } else { '' }))
  $i4 = Get-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -EA SilentlyContinue
  if (-not $i4) { Zeile '  IPv4 ist an diesem Adapter nicht gebunden (Haken „Internetprotokoll, Version 4“ fehlt)!'; continue }
  $ips = @(Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -EA SilentlyContinue)
  foreach ($ip in $ips) {
    $herk = switch ([string]$ip.PrefixOrigin) { 'Dhcp' { 'per DHCP' } 'Manual' { 'FEST eingetragen' } 'WellKnown' { 'automatisch (APIPA)' } default { [string]$ip.PrefixOrigin } }
    Zeile ('  IPv4 ' + $ip.IPAddress + '/' + $ip.PrefixLength + ' (Maske ' + (Maske ([int]$ip.PrefixLength)) + ') · ' + $herk + $(if ([string]$ip.AddressState -ne 'Preferred') { ' · Zustand ' + $ip.AddressState } else { '' }))
  }
  if ($ips.Count -gt 1) { Zeile '  Achtung: mehrere IPv4-Adressen an diesem Adapter — Antworten können von der falschen Adresse kommen.' }
  if (@($ips | Where-Object { $_.IPAddress -like '169.254.*' }).Count) { Zeile '  Achtung: 169.254.x.x = keine Adresse vom DHCP-Server bekommen.' }
  $w = $cfg[[int]$a.ifIndex]
  if ($w) {
    if ($w.DHCPEnabled) { Zeile ('  DHCP: an · Server ' + $w.DHCPServer + ' · erhalten ' + $(if ($w.DHCPLeaseObtained) { ([datetime]$w.DHCPLeaseObtained).ToString('dd.MM. HH:mm') } else { '?' }) + ' · gültig bis ' + $(if ($w.DHCPLeaseExpires) { ([datetime]$w.DHCPLeaseExpires).ToString('dd.MM. HH:mm') } else { '?' })) }
    else { Zeile '  DHCP: AUS (feste IP-Konfiguration)' }
    $nb = switch ([int]$w.TcpipNetbiosOptions) { 0 { 'Standard (per DHCP)' } 1 { 'an' } 2 { 'aus' } default { '?' } }
    Zeile ('  DNS-Server ' + ((@($w.DNSServerSearchOrder) | Where-Object { $_ }) -join ', ') + ' · Suffix ' + $(if ($w.DNSDomain) { $w.DNSDomain } else { '—' }) + ' · NetBIOS über TCP/IP ' + $nb)
  }
  foreach ($gw in @(Get-NetRoute -InterfaceIndex $a.ifIndex -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue)) {
    $mac = [string](Get-NetNeighbor -InterfaceIndex $a.ifIndex -IPAddress $gw.NextHop -EA SilentlyContinue | Select-Object -First 1).LinkLayerAddress
    Zeile ('  Gateway ' + $gw.NextHop + ' · Metrik ' + ([int]$gw.RouteMetric + [int]$i4.InterfaceMetric) + $(if ($mac) { ' · MAC des Gateways ' + $mac } else { '' }))
  }
  $cp = Get-NetConnectionProfile -InterfaceIndex $a.ifIndex -EA SilentlyContinue
  if ($cp) { Zeile ('  Netzwerk „' + $cp.Name + '“ · Profil ' + $cp.NetworkCategory + ' · IPv4 ' + $cp.IPv4Connectivity) }
  if ($phys) {
    $st = Get-NetAdapterStatistics -Name $a.Name -EA SilentlyContinue
    if ($st) { Zeile ('  Paketfehler seit Adapterstart: ' + ([int64]$st.ReceivedPacketErrors + [int64]$st.OutboundPacketErrors) + ' bei ' + ([int64]$st.ReceivedUnicastPackets + [int64]$st.SentUnicastPackets) + ' Paketen · verworfen ' + ([int64]$st.ReceivedDiscardedPackets + [int64]$st.OutboundDiscardedPackets)) }
  }
}
$def = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue)
$defIf = @($def | ForEach-Object { $_.InterfaceIndex } | Select-Object -Unique)
if ($defIf.Count -gt 1) { Zeile ('Achtung: Standardgateways an ' + $defIf.Count + ' Adaptern (' + ((@($def | ForEach-Object { $_.InterfaceAlias + ' → ' + $_.NextHop })) -join ', ') + ') — Windows nimmt die kleinste Metrik; ein Gateway am Anlagen-/Maschinenadapter stört Internet und Firmenserver.') }
elseif (-not $def.Count) { Zeile 'Kein Standardgateway — außerhalb des eigenen Netzes ist nichts erreichbar.' }
$pers = @(Get-NetRoute -PolicyStore PersistentStore -AddressFamily IPv4 -EA SilentlyContinue)
if ($pers.Count) {
  Zeile ('Fest eingetragene (dauerhafte) Routen: ' + $pers.Count)
  foreach ($r in $pers | Select-Object -First 10) { Zeile ('  ' + $r.DestinationPrefix + ' über ' + $r.NextHop + ' · Adapter ' + $(if ($r.InterfaceAlias) { $r.InterfaceAlias } else { 'Index ' + $r.InterfaceIndex }) + ' · Metrik ' + $r.RouteMetric) }
} else { Zeile 'Fest eingetragene (dauerhafte) Routen: keine' }
$perm = @(Get-NetNeighbor -AddressFamily IPv4 -State Permanent -EA SilentlyContinue | Where-Object { $_.LinkLayerAddress -and $_.IPAddress -notmatch '^(22[4-9]|23\d|255)\.|\.255$' -and $_.LinkLayerAddress -notmatch '^(FF-FF-FF-FF-FF-FF|01-00-5E|00-00-00-00-00-00)' })
if ($perm.Count) { Zeile ('Fest eingetragene ARP-Einträge (IP → MAC): ' + ((@($perm | Select-Object -First 8 | ForEach-Object { $_.IPAddress + ' → ' + $_.LinkLayerAddress })) -join ', ')) }
$seit = (Get-Date).AddDays(-7)
$kon = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Tcpip'; Id = 4199; StartTime = $seit } -MaxEvents 20 -EA SilentlyContinue)
Zeile ('IP-Adresskonflikte (7 Tage): ' + $kon.Count + $(if ($kon.Count) { ' — die Meldung nennt die MAC-Adresse des anderen Geräts:' } else { '' }))
foreach ($e in $kon | Select-Object -First 3) { Zeile ('  ' + $e.TimeCreated.ToString('dd.MM. HH:mm') + ' ' + (Kurz ([string]$e.Message) 220)) }
$dh = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Microsoft-Windows-Dhcp-Client'; Level = 2, 3; StartTime = $seit } -MaxEvents 30 -EA SilentlyContinue)
Zeile ('DHCP-Warnungen/-Fehler (7 Tage): ' + $dh.Count)
foreach ($e in $dh | Select-Object -First 3) { Zeile ('  ' + $e.TimeCreated.ToString('dd.MM. HH:mm') + ' ' + (Kurz ([string]$e.Message) 200)) }
$tr = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-NetworkProfile/Operational'; Id = 10001; StartTime = $seit } -MaxEvents 300 -EA SilentlyContinue)
Zeile ('Netzwerk getrennt laut Windows (7 Tage): ' + $tr.Count + '×' + $(if ($tr.Count) { ' · zuletzt ' + $tr[0].TimeCreated.ToString('dd.MM. HH:mm') } else { '' }))
$tcp = @(Get-NetTCPConnection -EA SilentlyContinue)
$dyn = (& netsh.exe int ipv4 show dynamicport tcp 2>&1 | Out-String)
$anz = 0; if ($dyn -match '(Anzahl[^:\r\n]*Ports|Number of Ports)\s*:\s*(\d+)') { $anz = [int]$matches[2] }
$nichtLauschend = @($tcp | Where-Object { [string]$_.State -ne 'Listen' })
Zeile ('TCP-Verbindungen: ' + $nichtLauschend.Count + ' (aufgebaut ' + @($tcp | Where-Object { [string]$_.State -eq 'Established' }).Count + ', TIME_WAIT ' + @($tcp | Where-Object { [string]$_.State -eq 'TimeWait' }).Count + ') · dynamische Ports ' + $(if ($anz) { [string]$anz } else { '?' }))
foreach ($g in @($nichtLauschend | Where-Object { [int]$_.OwningProcess -gt 4 } | Group-Object OwningProcess | Sort-Object Count -Descending | Select-Object -First 4)) {
  $pn = [string](Get-Process -Id ([int]$g.Name) -EA SilentlyContinue).ProcessName
  Zeile ('  ' + $g.Count + ' Verbindungen: ' + $(if ($pn) { $pn } else { 'Prozess ' + $g.Name }))
}
if ($anz -and $nichtLauschend.Count -gt ($anz * 0.7)) { Zeile 'Achtung: Die dynamischen Ports sind fast aufgebraucht (Socket-Fehler 10055) — das Programm mit den meisten Verbindungen beenden bzw. den PC neu starten.' }
$lis = @($tcp | Where-Object { [string]$_.State -eq 'Listen' -and [int]$_.LocalPort -lt 49152 -and @(135, 139, 445, 3389, 5040, 5357, 5985, 5986, 7680, 47001) -notcontains [int]$_.LocalPort } | Sort-Object LocalPort -Unique)
if ($lis.Count) { Zeile ('Lauschende Ports (Programme, die Verbindungen annehmen): ' + ((@($lis | Select-Object -First 12 | ForEach-Object { '' + $_.LocalPort + ' ' + [string](Get-Process -Id $_.OwningProcess -EA SilentlyContinue).ProcessName })) -join ' · ')) }
$ex = (& netsh.exe int ipv4 show excludedportrange protocol=tcp 2>&1 | Out-String)
$ber = @([regex]::Matches($ex, '(?m)^\s*(\d+)\s+(\d+)') | ForEach-Object { $_.Groups[1].Value + '–' + $_.Groups[2].Value })
if ($ber.Count) { Zeile ('Von Windows reservierte TCP-Portbereiche (Hyper-V, WinNAT …): ' + ((@($ber | Select-Object -First 8)) -join ', ') + $(if ($ber.Count -gt 8) { ' …' } else { '' })) }
$mc = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\DefaultMediaCost' -EA SilentlyContinue
if ($mc) { Zeile ('Getaktet (Voreinstellung je Verbindungsart): Kabel ' + $(if ($mc.Ethernet -eq 2) { 'JA' } else { 'nein' }) + ' · WLAN ' + $(if ($mc.WiFi -eq 2) { 'ja' } else { 'nein' }) + ' · Mobilfunk ' + $(if ($mc.'4G' -eq 2 -or $mc.'3G' -eq 2) { 'ja' } else { 'nein' })) }
try {
  $icp = [Windows.Networking.Connectivity.NetworkInformation, Windows.Networking.Connectivity, ContentType = WindowsRuntime]::GetInternetConnectionProfile()
  if ($icp) { Zeile ('Aktuelle Internetverbindung „' + $icp.ProfileName + '“: Kosten ' + [string]$icp.GetConnectionCost().NetworkCostType + ' (Fixed/Variable = getaktet)') }
} catch {}
$cs = Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue
if ($cs -and $cs.PartOfDomain -and (Get-Command nltest.exe -EA SilentlyContinue)) {
  $site = ((& nltest.exe /dsgetsite 2>&1 | Select-Object -First 1) | Out-String).Trim()
  $dc = (& nltest.exe ('/dsgetdc:' + $cs.Domain) 2>&1 | Out-String)
  $dcn = ''; if ($dc -match '(?m)^\s*DC:\s*\\\\(\S+)') { $dcn = $matches[1] }
  $dcs = ''; if ($dc -match '(?m)^\s*Dc Site Name:\s*(\S+)') { $dcs = $matches[1] }
  Zeile ('AD-Standort dieses PCs: ' + $site + ' · Domänencontroller ' + $(if ($dcn) { $dcn } else { 'nicht gefunden' }) + $(if ($dcs) { ' (Standort ' + $dcs + ')' } else { '' }))
  if ($site -match '1919|NO_SITENAME|fehlgeschlagen|failed') { Zeile 'Achtung: Die IP-Adresse gehört zu keinem AD-Standort (Subnetz fehlt in „Standorte und Dienste“) — Anmeldung und Richtlinien laufen dann über beliebige, evtl. ferne Domänencontroller.' }
}` }),

  // ══ Namensauflösung und Weg (lesend) ════════════════════════════════════════
  A({ id: 'netz4-dns-pruefen', titel: 'Namensauflösung und Weg prüfen (jeder DNS-Server einzeln, Suffixe, hosts, Cache, SQL-Alias, Traceroute)', modus: 'system', risiko: 'lesen', timeoutMs: 150000,
    beschreibung: 'Zeigt die DNS-Einstellungen (Dienst, DNS-Server je Adapter, Suffixe, DNS über HTTPS, NRPT, LLMNR, hosts/LMHOSTS, SQL-Client-Aliase). Mit Name: Antwort von Windows insgesamt und von JEDEM DNS-Server einzeln (mit Suffixen, Dauer, NXDOMAIN/SERVFAIL/Zeitüberschreitung, Alias), LLMNR/NetBIOS, hosts-Treffer, Cache-Eintrag und der Weg dorthin (tracert). Mit IP-Adresse: Rückwärtsauflösung (PTR) je DNS-Server und Weg. Ändert nichts.',
    param: { label: 'Name oder IP-Adresse (optional)', platzhalter: 'z. B. w3172, sqlserver01.corp.skf.net oder 10.20.30.40 (leer = nur Einstellungen)', vorlagen: ['w3172', 'login.microsoftonline.com', 'www.skf.com'] },
    ps: String.raw`
${HILFE_PS}
$ziel = $P.Trim()
if ($ziel -and $ziel -notmatch '^[A-Za-z0-9][A-Za-z0-9._\-]{0,252}$') { throw 'Bitte nur einen Namen (z. B. w3172 oder server.corp.skf.net) oder eine IPv4-Adresse angeben — ohne http://, Pfad oder Port.' }
$istIp = $ziel -match '^\d{1,3}(\.\d{1,3}){3}$'
function DnsFehler([string]$m) {
  if ($m -match 'does not exist|nicht vorhanden|existiert nicht|9003') { return 'NXDOMAIN — dieser DNS-Server kennt den Namen nicht' }
  if ($m -match 'timeout|timed out|Zeit|1460') { return 'keine Antwort (Zeitüberschreitung)' }
  if ($m -match 'server failure|Serverfehler|9002') { return 'SERVFAIL (Serverfehler beim DNS-Server)' }
  if ($m -match 'refused|verweigert|9005') { return 'Anfrage abgelehnt' }
  return (Kurz $m 140)
}
$ds = Get-Service Dnscache -EA SilentlyContinue
Zeile ('DNS-Client-Dienst: ' + $(if ($ds) { [string]$ds.Status + ' · Start ' + [string]$ds.StartType } else { 'fehlt' }))
$gs = Get-DnsClientGlobalSetting -EA SilentlyContinue
$tp = Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters' -EA SilentlyContinue
$prim = [string]$tp.Domain; $hn = [string]$tp.Hostname
Zeile ('Computername (NetBIOS): ' + $env:COMPUTERNAME + ' · DNS-Hostname: ' + $hn + $(if ($hn.Length -gt 15) { ' — länger als 15 Zeichen: NetBIOS, ältere Programme und manche Lizenzen kennen nur „' + $env:COMPUTERNAME + '“' } else { '' }))
Zeile ('Primäres DNS-Suffix: ' + $(if ($prim) { $prim } else { '—' }) + ' · Suffix-Suchliste: ' + $(if ($gs -and @($gs.SuffixSearchList | Where-Object { $_ }).Count) { (@($gs.SuffixSearchList) -join ', ') } else { 'automatisch (primär + Verbindung)' }))
$server = @(); $verbSuf = @()
foreach ($a in @(Get-NetAdapter -EA SilentlyContinue | Where-Object { $_.Status -eq 'Up' })) {
  $d4 = @((Get-DnsClientServerAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -EA SilentlyContinue).ServerAddresses | Where-Object { $_ })
  $d6 = @((Get-DnsClientServerAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv6 -EA SilentlyContinue).ServerAddresses | Where-Object { $_ -and $_ -notmatch '^fec0:0:0:ffff' })
  $dd = @((@($d4) + @($d6)) | Select-Object -Unique)
  if (-not $dd.Count) { continue }
  $cl = Get-DnsClient -InterfaceIndex $a.ifIndex -EA SilentlyContinue
  if ($cl.ConnectionSpecificSuffix) { $verbSuf += [string]$cl.ConnectionSpecificSuffix }
  Zeile ('' + $a.Name + ': DNS ' + ($dd -join ', ') + ' · Suffix ' + $(if ($cl.ConnectionSpecificSuffix) { $cl.ConnectionSpecificSuffix } else { '—' }) + ' · im DNS registrieren ' + (Ja ([bool]$cl.RegisterThisConnectionsAddress)))
  if (@($d4 | Where-Object { $_ -match '^(8\.8\.[48]\.[48]|1\.1\.1\.1|1\.0\.0\.1|9\.9\.9\.9|208\.67\.22[02]\.22[02])$' }).Count) { Zeile '  Achtung: öffentlicher DNS-Server von Hand eingetragen — interne Firmennamen sind darüber nicht auflösbar.' }
  $server += $dd
}
$server = @($server | Select-Object -Unique)
$dohIf = @(Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Services\Dnscache\InterfaceSpecificParameters' -Recurse -EA SilentlyContinue | Where-Object { $_.Name -match 'DohInterfaceSettings\\Doh6?\\' })
if ($dohIf.Count) { Zeile ('Achtung: DNS-Verschlüsselung (DNS über HTTPS) ist an einem Adapter für ' + ((@($dohIf | ForEach-Object { $_.PSChildName }) | Select-Object -Unique) -join ', ') + ' eingestellt (Einstellungen → Netzwerk → DNS-Serverzuweisung).') }
$pol = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\DNSClient' -EA SilentlyContinue
Zeile ('LLMNR (Namenssuche im eigenen Netz ohne DNS): ' + $(if ($pol -and $pol.EnableMulticast -eq 0) { 'per Richtlinie AUS' } else { 'an' }) + $(if ($pol -and $pol.DoHPolicy) { ' · DoH-Richtlinie ' + [string]$pol.DoHPolicy } else { '' }))
try { $nr = @(Get-DnsClientNrptPolicy -EA Stop); if ($nr.Count) { Zeile ('Sonderregeln für Namensräume (NRPT): ' + $nr.Count + ' — ' + ((@($nr | ForEach-Object { [string]$_.Namespace }) | Select-Object -Unique -First 5) -join ', ')) } } catch {}
$hf = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$hz = @(Get-Content -LiteralPath $hf -EA SilentlyContinue | Where-Object { $_ -match '\S' -and $_ -notmatch '^\s*#' })
Zeile ('hosts-Datei: ' + $hz.Count + ' Einträge' + $(if (Test-Path -LiteralPath ($hf + '.txt')) { ' · ACHTUNG: zusätzlich „hosts.txt“ vorhanden — die wirkt nicht (falsch gespeichert)' } else { '' }))
$lm = Join-Path $env:SystemRoot 'System32\drivers\etc\lmhosts'
if (Test-Path -LiteralPath $lm) { Zeile ('LMHOSTS-Datei vorhanden: ' + @(Get-Content -LiteralPath $lm -EA SilentlyContinue | Where-Object { $_ -match '\S' -and $_ -notmatch '^\s*#\s' }).Count + ' Einträge (alte NetBIOS-Zuordnungen)') }
$al = @()
foreach ($k in 'HKLM:\SOFTWARE\Microsoft\MSSQLServer\Client\ConnectTo', 'HKLM:\SOFTWARE\Wow6432Node\Microsoft\MSSQLServer\Client\ConnectTo') {
  $kv = Get-ItemProperty $k -EA SilentlyContinue
  if ($kv) { foreach ($e in @($kv.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' })) { $al += ('' + $e.Name + ' → ' + $e.Value + $(if ($k -match 'Wow6432') { ' (32 Bit)' } else { ' (64 Bit)' })) } }
}
if ($al.Count) { Zeile ('SQL-Client-Aliase (cliconfg): ' + $al.Count); foreach ($x in $al | Select-Object -First 10) { Zeile ('  ' + $x) } }
if ($ziel) {
  Zeile ('── Prüfung für „' + $ziel + '“')
  $sys = @()
  if ($istIp) {
    try { $he = [System.Net.Dns]::GetHostEntry($ziel); Zeile ('Windows (alle Wege): ' + $ziel + ' → ' + $he.HostName) } catch { Zeile ('Windows (alle Wege): kein Name zu ' + $ziel) }
    foreach ($s in $server | Select-Object -First 4) {
      try { $r = @(Resolve-DnsName -Name $ziel -Type PTR -Server $s -DnsOnly -QuickTimeout -EA Stop | Where-Object { $_.NameHost }); Zeile ('DNS-Server ' + $s + ': ' + $(if ($r.Count) { ((@($r | ForEach-Object { [string]$_.NameHost }) | Select-Object -Unique -First 4) -join ', ') } else { 'kein Rückwärts-Eintrag (PTR)' })) }
      catch { Zeile ('DNS-Server ' + $s + ': ' + (DnsFehler $_.Exception.Message)) }
    }
  } else {
    $t0 = Get-Date; $fe = ''
    try { $sys = @([System.Net.Dns]::GetHostAddresses($ziel) | ForEach-Object { $_.IPAddressToString }) } catch { $fe = [string]$_.Exception.InnerException.Message; if (-not $fe) { $fe = [string]$_.Exception.Message } }
    $ms = [int]((Get-Date) - $t0).TotalMilliseconds
    Zeile ('Windows insgesamt (DNS, Suffixe, hosts, Cache, LLMNR/NetBIOS): ' + $(if ($sys.Count) { ($sys -join ', ') } else { 'NICHT auflösbar — ' + (Kurz $fe 120) }) + ' · ' + $ms + ' ms')
    $namen = @($ziel)
    if ($ziel -notmatch '\.') {
      $suf = @(); if ($gs) { $suf += @($gs.SuffixSearchList) }; if ($prim) { $suf += $prim }; $suf += $verbSuf
      $namen = @($suf | Where-Object { $_ } | Select-Object -Unique -First 3 | ForEach-Object { $ziel + '.' + $_ })
      if (-not $namen.Count) { $namen = @($ziel) }
    }
    foreach ($s in $server | Select-Object -First 4) {
      foreach ($n in $namen) {
        $t1 = Get-Date
        try {
          $r = @(Resolve-DnsName -Name $n -Server $s -DnsOnly -QuickTimeout -EA Stop)
          $adr = @($r | Where-Object { $_.IPAddress } | ForEach-Object { $_.IPAddress })
          $cn = @($r | Where-Object { [string]$_.Type -eq 'CNAME' } | ForEach-Object { $_.NameHost })
          Zeile ('DNS-Server ' + $s + ' · ' + $n + ': ' + $(if ($adr.Count) { $adr -join ', ' } else { 'Name bekannt, aber keine Adresse (Fehler 11004)' }) + $(if ($cn.Count) { ' · Alias auf ' + ($cn -join ', ') } else { '' }) + ' · ' + [int]((Get-Date) - $t1).TotalMilliseconds + ' ms')
        } catch { Zeile ('DNS-Server ' + $s + ' · ' + $n + ': ' + (DnsFehler $_.Exception.Message) + ' · ' + [int]((Get-Date) - $t1).TotalMilliseconds + ' ms') }
      }
    }
    if (-not $server.Count) { Zeile 'Kein DNS-Server eingetragen — nur hosts, Cache und LLMNR/NetBIOS können antworten.' }
    if ($ziel -notmatch '\.') {
      try { $r = @(Resolve-DnsName -Name $ziel -LlmnrNetbiosOnly -QuickTimeout -EA Stop | Where-Object { $_.IPAddress }); Zeile ('LLMNR/NetBIOS (ohne DNS): ' + $(if ($r.Count) { (@($r | ForEach-Object { $_.IPAddress }) -join ', ') } else { 'keine Antwort' })) } catch { Zeile 'LLMNR/NetBIOS (ohne DNS): keine Antwort' }
    }
    $hm = @($hz | Where-Object { @($_.Trim() -split '\s+' | Select-Object -Skip 1) -contains $ziel })
    if ($hm.Count) { Zeile ('Eintrag in der hosts-Datei (hat Vorrang vor DNS): ' + ((@($hm | ForEach-Object { $_.Trim() })) -join ' | ')) }
    if (Test-Path -LiteralPath $lm) {
      $kurz = ($ziel -split '\.')[0]
      $lmm = @(Get-Content -LiteralPath $lm -EA SilentlyContinue | Where-Object { $_ -notmatch '^\s*#\s' -and @($_.Trim() -split '\s+' | Select-Object -Skip 1) -contains $kurz })
      if ($lmm.Count) { Zeile ('Eintrag in der LMHOSTS-Datei (NetBIOS-Name, #PRE = fest im Cache): ' + ((@($lmm | ForEach-Object { $_.Trim() })) -join ' | ')) }
    }
    foreach ($c in @(Get-DnsClientCache -EA SilentlyContinue | Where-Object { $_.Entry -like ($ziel + '*') }) | Select-Object -First 4) { Zeile ('Im DNS-Cache: ' + $c.Entry + ' → ' + $(if ($c.Data) { [string]$c.Data } else { 'Status ' + $c.Status + ' (gemerkter Fehlschlag)' }) + ' · noch ' + $c.TimeToLive + ' s') }
  }
  $zip = $null; if ($istIp) { $zip = $ziel } else { $zip = @($sys | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' })[0] }
  if ($zip) {
    Zeile ('Weg zu ' + $zip + ' (tracert, höchstens 15 Stationen; * = Station antwortet nicht auf Ping):')
    $trz = @(& tracert.exe -d -h 15 -w 700 $zip 2>&1 | ForEach-Object { [string]$_ } | Where-Object { $_ -match '^\s*\d+\s' })
    foreach ($z in $trz) {
      if ($z -match '^\s*(\d+)\s+(.*?)\s+(\d{1,3}(\.\d{1,3}){3})\s*$') { Zeile ('  ' + $matches[1] + ': ' + $matches[3] + ' (' + ($matches[2] -replace '\s{2,}', ' ') + ')') }
      elseif ($z -match '^\s*(\d+)\s+\*\s+\*\s+\*') { Zeile ('  ' + $matches[1] + ': * * * keine Antwort') }
      else { Zeile ('  ' + (Kurz $z 120)) }
    }
    if (-not $trz.Count) { Zeile '  keine Ausgabe' }
  }
}` }),

  // ══ Grundeinstellungen reparieren ═══════════════════════════════════════════
  A({ id: 'netz4-grundeinstellung', titel: 'Netzwerk-Grundeinstellung reparieren (Bindungen, Internet-Erkennung, Dienste, Treiberwerte, ARP, fremde Netze, TCP)', modus: 'system', risiko: 'aendern', timeoutMs: 90000,
    beschreibung: 'Repariert eine gewählte Grundeinstellung und zeigt vorher/nachher: abgehakte Adapter-Bindungen (IPv4, IPv6, Client, Datei- und Druckerfreigabe) wieder an · Internet-Erkennung (NCSI-Prüfadressen, aktive Prüfung) auf Windows-Standard und Netzwerkerkennung neu starten · deaktivierte Netzwerkdienste (DHCP, DNS-Client, Netzwerkliste, Server, WinHTTP-Proxy-Erkennung, 802.1X, WLAN/WWAN, Funktionssuche …) auf Standard-Starttyp · von Hand gesetzte Treiberwerte (MAC-Adresse, VLAN-ID, Jumbo-Paket) zurück · ARP-, Ziel- und NetBIOS-Zwischenspeicher leeren · fremde (Heim-/Hotel-)Netze von „Privat“ auf „Öffentlich“ · abgeschaltetes TCP-Auto-Tuning wieder auf „normal“. Der Adapter der Fernverbindung behält IPv4/IPv6.',
    param: { label: 'Was reparieren', platzhalter: 'Adapter-Bindungen (IPv4, IPv6, Client, Datei- und Druckerfreigabe)', pflicht: true, optionen: ['Adapter-Bindungen (IPv4, IPv6, Client, Datei- und Druckerfreigabe)', 'Internet-Erkennung (NCSI) auf Standard', 'Netzwerkdienste auf Standard-Starttyp', 'Treiberwerte zurücksetzen (MAC-Adresse, VLAN-ID, Jumbo-Paket)', 'ARP- und NetBIOS-Zwischenspeicher leeren', 'Fremde Netzwerke (Heim, Hotel) auf Öffentlich stellen', 'TCP-Einstellungen auf Standard (Auto-Tuning)'] },
    ps: String.raw`
${ADAPTER_PS}
${FERN_PS}
${HILFE_PS}
$teil = ''
if ($P.Trim() -match '^(Adapter-Bindungen|Internet-Erkennung|Netzwerkdienste|Treiberwerte|ARP|Fremde Netzwerke|TCP-Einstellungen)\b') { $teil = $matches[1] }
else { throw 'Bitte eine der angebotenen Einstellungen wählen (Adapter-Bindungen, Internet-Erkennung, Netzwerkdienste, Treiberwerte, ARP, Fremde Netzwerke, TCP-Einstellungen).' }
$n = 0
if ($teil -eq 'Adapter-Bindungen') {
  $fern = @(FernRouten | ForEach-Object { [int]$_.InterfaceIndex } | Select-Object -Unique)
  $komp = [ordered]@{ 'ms_tcpip' = 'IPv4'; 'ms_tcpip6' = 'IPv6'; 'ms_msclient' = 'Client für Microsoft-Netzwerke'; 'ms_server' = 'Datei- und Druckerfreigabe' }
  foreach ($a in (@(LanAdapter) + @(WlanAdapter))) {
    $b = @(Get-NetAdapterBinding -Name $a.Name -EA SilentlyContinue)
    $virt = @($b | Where-Object { @('vms_pp', 'ms_bridge') -contains [string]$_.ComponentID -and $_.Enabled })
    if ($virt.Count) { Zeile ('' + $a.Name + ': gehört zu einem virtuellen Hyper-V-Switch bzw. einer Netzwerkbrücke (' + ((@($virt | ForEach-Object { $_.DisplayName })) -join ', ') + ') — Bindungen bewusst nicht angefasst'); continue }
    foreach ($id in @($komp.Keys)) {
      $x = @($b | Where-Object { $_.ComponentID -eq $id })[0]
      if (-not $x) { Zeile ('' + $a.Name + ': ' + $komp[$id] + ' ist gar nicht installiert — „Netzwerk-Stack zurücksetzen“ bzw. Treiber neu installieren'); continue }
      if ($x.Enabled) { continue }
      if (($id -like 'ms_tcpip*') -and ($fern -contains [int]$a.ifIndex)) { Zeile ('' + $a.Name + ': ' + $komp[$id] + ' ist AUS — nicht angefasst, weil die Fernverbindung des Tools über diesen Adapter läuft'); continue }
      Enable-NetAdapterBinding -Name $a.Name -ComponentID $id -EA Stop
      $neu = [bool](@(Get-NetAdapterBinding -Name $a.Name -ComponentID $id -EA SilentlyContinue)[0].Enabled)
      Zeile ('' + $a.Name + ': ' + $komp[$id] + ' vorher AUS → jetzt ' + $(if ($neu) { 'an' } else { 'weiter aus' })); $n++
    }
  }
  if (-not $n) { Zeile 'IPv4, IPv6, Client und Datei- und Druckerfreigabe waren an allen LAN-/WLAN-Adaptern schon eingeschaltet.' }
  $kat = (& netsh.exe winsock show catalog 2>&1 | Out-String)
  $fremd = @([regex]::Matches($kat, '(?m)^\s*(Beschreibung|Description)\s*:\s*(.+?)\s*$') | ForEach-Object { $_.Groups[2].Value } | Where-Object { $_ -notmatch 'MSAFD|Hyper-V|RSVP|vSockets|AF_UNIX|Tcpip|TCP/IP|Bluetooth|NLA|nlasvc|Pnrp|NTDS|E-?mail|Namenshim|Name Shim|Network Location' } | Select-Object -Unique)
  Zeile ('Winsock-Katalog: ' + $(if ($fremd.Count) { 'fremde Einträge: ' + ((@($fremd | Select-Object -First 5)) -join ', ') + ' — bei „Netzwerkprotokoll fehlt“ zusätzlich den Netzwerk-Stack zurücksetzen' } else { 'nur Windows-Einträge' }))
}
elseif ($teil -eq 'Internet-Erkennung') {
  $k = 'HKLM:\SYSTEM\CurrentControlSet\Services\NlaSvc\Parameters\Internet'
  if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
  $soll = [ordered]@{ ActiveWebProbeHost = 'www.msftconnecttest.com'; ActiveWebProbePath = 'connecttest.txt'; ActiveWebProbeContent = 'Microsoft Connect Test'; ActiveDnsProbeHost = 'dns.msftncsi.com'; ActiveDnsProbeContent = '131.107.255.255'; ActiveWebProbeHostV6 = 'ipv6.msftconnecttest.com'; ActiveWebProbePathV6 = 'connecttest.txt'; ActiveWebProbeContentV6 = 'Microsoft Connect Test'; ActiveDnsProbeHostV6 = 'dns.msftncsi.com'; ActiveDnsProbeContentV6 = 'fd3e:4f5a:5b81::1' }
  $ist = Get-ItemProperty $k -EA SilentlyContinue
  $ap = $ist.EnableActiveProbing
  if ($ap -ne 1) { Set-ItemProperty -Path $k -Name EnableActiveProbing -Value 1 -Type DWord; Zeile ('Aktive Internet-Prüfung (EnableActiveProbing): vorher ' + $(if ($null -eq $ap) { 'nicht gesetzt' } else { [string]$ap }) + ' → jetzt 1'); $n++ }
  foreach ($nm in @($soll.Keys)) {
    $alt = [string]$ist.$nm
    if ($alt -eq $soll[$nm]) { continue }
    Set-ItemProperty -Path $k -Name $nm -Value $soll[$nm] -Type String
    Zeile ('' + $nm + ': vorher „' + $(if ($alt) { $alt } else { 'nicht gesetzt' }) + '“ → jetzt „' + $soll[$nm] + '“'); $n++
  }
  $pk = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\NetworkConnectivityStatusIndicator' -EA SilentlyContinue
  if ($pk) {
    $pn = @($pk.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS|^\(default\)$' -and ('' + $_.Value) -ne '' } | ForEach-Object { $_.Name + '=' + $_.Value })
    if ($pn.Count) { Zeile ('Richtlinie für die Internet-Erkennung aktiv: ' + ($pn -join ', ') + $(if ($pk.NoActiveProbe -eq 1) { ' — die aktive Prüfung ist per Richtlinie AUS, Windows meldet dann weiter „Kein Internet“ (ändert nur DXC)' } else { '' })) }
  }
  $inh = ''
  try { $rq = [System.Net.WebRequest]::Create('http://www.msftconnecttest.com/connecttest.txt'); $rq.Timeout = 6000; $rs = $rq.GetResponse(); $sr = New-Object System.IO.StreamReader($rs.GetResponseStream()); $inh = $sr.ReadToEnd(); $sr.Close(); $rs.Close() } catch { $inh = 'Fehler: ' + $_.Exception.Message }
  Zeile ('Prüfadresse http://www.msftconnecttest.com/connecttest.txt liefert: ' + $(if ($inh -eq 'Microsoft Connect Test') { '„Microsoft Connect Test“ (richtig)' } else { '„' + (Kurz $inh 120) + '“ — wird abgefangen (Proxy, Zscaler-Sperrseite oder Anmeldeseite)' }))
  if ($n) {
    $nla = Get-Service NlaSvc -EA SilentlyContinue
    if ($nla -and [string]$nla.Status -eq 'Running') {
      try { Restart-Service NlaSvc -Force -EA Stop; Start-Sleep -Seconds 6 } catch { Zeile ('Netzwerkerkennung nicht neu gestartet (' + (Kurz $_.Exception.Message 100) + ')') }
    } else { Zeile 'Die neuen Prüfeinstellungen greifen beim nächsten Netzwechsel bzw. Neustart (optional „Netzwerkerkennung neu starten“).' }
    foreach ($cp in @(Get-NetConnectionProfile -EA SilentlyContinue)) { Zeile ('Netzwerkprofil jetzt: ' + $cp.InterfaceAlias + ' · ' + $cp.NetworkCategory + ' · IPv4 ' + $cp.IPv4Connectivity) }
  } else { Zeile 'Die Prüfeinstellungen waren schon Windows-Standard — nichts geändert.' }
}
elseif ($teil -eq 'Netzwerkdienste') {
  $liste = [ordered]@{ Dhcp = 'Automatic'; Dnscache = 'Automatic'; nsi = 'Automatic'; NlaSvc = 'Manual'; netprofm = 'Manual'; Netman = 'Manual'; LanmanWorkstation = 'Automatic'; LanmanServer = 'Automatic'; WinHttpAutoProxySvc = 'Manual'; iphlpsvc = 'Automatic'; lmhosts = 'Manual'; dot3svc = 'Manual'; WlanSvc = 'Automatic'; WwanSvc = 'Manual'; fdPHost = 'Manual'; FDResPub = 'Manual'; SSDPSRV = 'Manual'; upnphost = 'Manual' }
  $wert = @{ Automatic = 2; Manual = 3 }
  $geprueft = 0
  foreach ($nm in @($liste.Keys)) {
    $s = Get-Service -Name $nm -EA SilentlyContinue
    if (-not $s) { continue }
    if ($nm -eq 'WlanSvc' -and -not @(WlanAdapter).Count) { continue }
    $geprueft++
    $soll = $liste[$nm]
    if ([string]$s.StartType -eq 'Disabled') {
      $wie = ''
      try { Set-Service -Name $nm -StartupType $soll -EA Stop; $wie = '' }
      catch {
        try { Set-ItemProperty -Path ('HKLM:\SYSTEM\CurrentControlSet\Services\' + $nm) -Name Start -Value $wert[$soll] -Type DWord -EA Stop; $wie = ' (in der Registry gesetzt — wirkt nach einem Neustart)' }
        catch { Zeile ('' + $s.DisplayName + ' (' + $nm + '): deaktiviert — Starttyp nicht änderbar (' + (Kurz $_.Exception.Message 100) + ')'); continue }
      }
      Zeile ('' + $s.DisplayName + ' (' + $nm + '): Starttyp vorher Deaktiviert → jetzt ' + $(if ($soll -eq 'Automatic') { 'Automatisch' } else { 'Manuell' }) + $wie); $n++
      $s = Get-Service -Name $nm -EA SilentlyContinue
    }
    if ($soll -eq 'Automatic' -and [string]$s.Status -ne 'Running' -and [string]$s.StartType -ne 'Disabled') {
      try { Start-Service -Name $nm -EA Stop; Start-Sleep -Milliseconds 500; Zeile ('' + $s.DisplayName + ' (' + $nm + '): war gestoppt → jetzt ' + [string](Get-Service -Name $nm).Status); $n++ }
      catch { Zeile ('' + $s.DisplayName + ' (' + $nm + '): Start fehlgeschlagen (' + (Kurz $_.Exception.Message 100) + ') — nach einem Neustart erneut prüfen') }
    }
  }
  Zeile ('Geprüft: ' + $geprueft + ' Netzwerkdienste · geändert/gestartet: ' + $n + ' (laufende Dienste werden nie neu gestartet)')
  $auto = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters' -EA SilentlyContinue).AutoShareWks
  $adm = @(Get-SmbShare -EA SilentlyContinue | Where-Object { $_.Name -match '^(ADMIN|IPC|[A-Z])\$$' } | ForEach-Object { $_.Name })
  Zeile ('Administrative Freigaben: ' + $(if ($adm.Count) { $adm -join ', ' } else { 'KEINE' }) + $(if ($auto -eq 0) { ' · AutoShareWks = 0 (per Härtung/Richtlinie abgeschaltet — ändert nur DXC)' } else { '' }))
}
elseif ($teil -eq 'Treiberwerte') {
  $fern = @(FernRouten | ForEach-Object { [int]$_.InterfaceIndex } | Select-Object -Unique)
  foreach ($a in (@(LanAdapter) + @(WlanAdapter))) {
    foreach ($e in @(Get-NetAdapterAdvancedProperty -Name $a.Name -EA SilentlyContinue)) {
      $kw = [string]$e.RegistryKeyword; $rv = [string]$e.RegistryValue; $grund = ''
      if ($kw -eq 'NetworkAddress' -and $rv -match '\w') { $grund = 'von Hand gesetzte MAC-Adresse' }
      elseif (($kw -match '^\*?VlanID$' -or $e.DisplayName -match '^VLAN.?ID') -and $rv -match '^[1-9]\d*$') { $grund = 'VLAN-ID im Treiber' }
      elseif ($kw -eq '*JumboPacket' -and $rv -match '^\d+$' -and [int]$rv -gt 1514) { $grund = 'Jumbo-Paket' }
      if (-not $grund) { continue }
      $vorher = [string]$e.DisplayValue
      Reset-NetAdapterAdvancedProperty -Name $a.Name -RegistryKeyword $kw -NoRestart -EA Stop
      $nach = [string](@(Get-NetAdapterAdvancedProperty -Name $a.Name -RegistryKeyword $kw -EA SilentlyContinue)[0].DisplayValue)
      Zeile ('' + $a.Name + ' · ' + $e.DisplayName + ' (' + $grund + '): vorher „' + $vorher + '“ → jetzt „' + $(if ($nach) { $nach } else { 'Standard' }) + '“' + $(if ($fern -contains [int]$a.ifIndex) { ' — über diesen Adapter läuft die Fernverbindung; nach dem Adapter-Neustart kann er eine andere IP-Adresse bekommen' } else { '' })); $n++
    }
  }
  if ($n) { Zeile ('' + $n + ' Treiberwert(e) zurückgesetzt — wirken beim nächsten Neustart des Adapters (PC-Neustart, Ab-/Andocken oder „Netzwerkadapter neu starten“).') }
  else { Zeile 'Keine von Hand gesetzte MAC-Adresse, VLAN-ID oder Jumbo-Einstellung gefunden — nichts geändert.' }
}
elseif ($teil -eq 'ARP') {
  $dyn = @(Get-NetNeighbor -AddressFamily IPv4 -EA SilentlyContinue | Where-Object { @('Reachable', 'Stale', 'Delay', 'Probe', 'Incomplete', 'Unreachable') -contains [string]$_.State })
  $dyn | Remove-NetNeighbor -Confirm:$false -EA SilentlyContinue
  & netsh.exe interface ip delete destinationcache 2>&1 | Out-Null
  & nbtstat.exe -R 2>&1 | Out-Null
  Zeile ('ARP-Zwischenspeicher: ' + $dyn.Count + ' gelernte Einträge (IP → MAC) entfernt — Windows fragt beim nächsten Zugriff neu. Ziel-Zwischenspeicher und NetBIOS-Namen-Cache geleert.')
  $perm = @(Get-NetNeighbor -AddressFamily IPv4 -State Permanent -EA SilentlyContinue | Where-Object { $_.LinkLayerAddress -and $_.IPAddress -notmatch '^(22[4-9]|23\d|255)\.|\.255$' -and $_.LinkLayerAddress -notmatch '^(FF-FF-FF-FF-FF-FF|01-00-5E|00-00-00-00-00-00)' })
  if ($perm.Count) { Zeile ('Fest eingetragene ARP-Einträge bleiben (bewusst gesetzt, z. B. von einer Anlagensoftware): ' + ((@($perm | Select-Object -First 8 | ForEach-Object { $_.IPAddress + ' → ' + $_.LinkLayerAddress })) -join ', ') + ' — zeigt einer davon auf ein getauschtes Gerät, per Remote Doc entfernen.') }
  else { Zeile 'Fest eingetragene ARP-Einträge: keine.' }
}
elseif ($teil -eq 'TCP-Einstellungen') {
  function TcpStand { $t = @(Get-NetTCPSetting -EA SilentlyContinue | Where-Object { @('Internet', 'InternetCustom') -contains [string]$_.SettingName })[0]; $o = Get-NetOffloadGlobalSetting -EA SilentlyContinue; return @{ Auto = [string]$t.AutoTuningLevelLocal; Heur = [string]$t.ScalingHeuristics; Rss = [string]$o.ReceiveSideScaling } }
  $vor = TcpStand
  if ($vor.Auto -and $vor.Auto -ne 'Normal') { & netsh.exe int tcp set global autotuninglevel=normal 2>&1 | Out-Null; $n++ }
  if ($vor.Heur -eq 'Enabled') { & netsh.exe int tcp set heuristics disabled 2>&1 | Out-Null; $n++ }
  $nach = TcpStand
  Zeile ('Automatische Abstimmung des Empfangsfensters (Auto-Tuning): vorher ' + $vor.Auto + ' → jetzt ' + $nach.Auto + $(if ($nach.Auto -ne 'Normal') { ' — nicht änderbar, evtl. per Richtlinie festgelegt' } else { '' }))
  Zeile ('Skalierungs-Heuristik: vorher ' + $vor.Heur + ' → jetzt ' + $nach.Heur)
  Zeile ('Receive Side Scaling (nur angezeigt): ' + $nach.Rss)
  if ($n) { Zeile 'Gilt für neue Verbindungen sofort (laufende Downloads/Kopien neu starten); bestehende Verbindungen werden nicht getrennt.' }
  else { Zeile 'TCP-Einstellungen waren schon Windows-Standard — nichts geändert.' }
}
else {
  foreach ($cp in @(Get-NetConnectionProfile -EA SilentlyContinue)) {
    if ([string]$cp.NetworkCategory -ne 'Private') { Zeile ('' + $cp.InterfaceAlias + ' („' + $cp.Name + '“): ' + $cp.NetworkCategory + ' — bleibt'); continue }
    $i4 = Get-NetIPInterface -InterfaceIndex $cp.InterfaceIndex -AddressFamily IPv4 -EA SilentlyContinue
    if ($i4 -and [string]$i4.Dhcp -eq 'Disabled') { Zeile ('' + $cp.InterfaceAlias + ' („' + $cp.Name + '“): Privat mit fester IP-Adresse — vermutlich Anlagen-/Maschinennetz, nicht geändert'); continue }
    Set-NetConnectionProfile -InterfaceIndex $cp.InterfaceIndex -NetworkCategory Public -EA Stop
    Zeile ('' + $cp.InterfaceAlias + ' („' + $cp.Name + '“): vorher Privat → jetzt Öffentlich'); $n++
  }
  $aktuell = @(Get-NetConnectionProfile -EA SilentlyContinue | ForEach-Object { [string]$_.Name })
  foreach ($pr in @(Get-ChildItem 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\Profiles' -EA SilentlyContinue)) {
    $v = Get-ItemProperty $pr.PSPath -EA SilentlyContinue
    if ($v.Category -ne 1 -or $aktuell -contains [string]$v.ProfileName) { continue }
    if (@(71, 243) -notcontains [int]$v.NameType) { Zeile ('Gespeichertes Kabel-Netz „' + $v.ProfileName + '“ ist Privat — nicht geändert (kann ein Anlagennetz sein)'); continue }
    Set-ItemProperty -Path $pr.PSPath -Name Category -Value 0 -Type DWord
    Zeile ('Gespeichertes Netz „' + $v.ProfileName + '“: vorher Privat → jetzt Öffentlich'); $n++
  }
  if (-not $n) { Zeile 'Kein fremdes Netz stand auf „Privat“ — nichts geändert.' }
  else { Zeile 'In öffentlichen Netzen ist der Laptop für andere Geräte unsichtbar (keine Netzwerkerkennung, keine Freigaben). Das Firmennetz bleibt „Domäne“.' }
}` }),

  // ══ Routen ══════════════════════════════════════════════════════════════════
  A({ id: 'netz4-route-entfernen', titel: 'Fest eingetragene Route bzw. Gateway am Anlagenadapter entfernen', modus: 'system', risiko: 'kritisch',
    beschreibung: '„10.50.0.0/16“: entfernt eine von Hand dauerhaft eingetragene Route (route -p) mit diesem Ziel — automatische Routen von Windows/DHCP bleiben. „Gateway: Ethernet 3“: entfernt das Standardgateway eines FEST eingestellten Adapters (Anlagen-/Maschinennetz), damit Internet und Firmenserver wieder über den Firmen-Adapter laufen; das Anlagennetz selbst bleibt erreichbar. Nie am Domänen-Adapter, an DHCP-Adaptern oder auf dem Weg der Fernverbindung. Zeigt die alten Werte und wie man sie wieder einträgt.',
    param: { label: 'Route (Ziel/Präfix) oder „Gateway: Adaptername“', platzhalter: 'z. B. 10.50.0.0/16 oder Gateway: Ethernet 3', pflicht: true, vorlagen: ['Gateway: Ethernet 2', 'Gateway: Ethernet 3', '0.0.0.0/0'] },
    ps: String.raw`
${FERN_PS}
${HILFE_PS}
$roh = $P.Trim()
$fernR = @(FernRouten)
$n = 0
if ($roh -match '^(?i:gateway)\s*[:=]\s*(.{1,80})$') {
  $name = $matches[1].Trim()
  $ad = @(Get-NetAdapter -EA SilentlyContinue | Where-Object { $_.Name -ieq $name })
  if (-not $ad.Count) { throw ('Adapter „' + $name + '“ nicht gefunden. Vorhanden: ' + ((@(Get-NetAdapter -EA SilentlyContinue | ForEach-Object { $_.Name })) -join ', ')) }
  $a = $ad[0]
  $i4 = Get-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -EA Stop
  if ([string]$i4.Dhcp -eq 'Enabled') { throw ('„' + $a.Name + '“ bezieht Adresse und Gateway per DHCP — das Gateway käme sofort wieder. Nur fest eingestellte Adapter (Anlagen-/Maschinennetz) werden bearbeitet.') }
  $cp = Get-NetConnectionProfile -InterfaceIndex $a.ifIndex -EA SilentlyContinue
  if ($cp -and [string]$cp.NetworkCategory -eq 'DomainAuthenticated') { throw ('„' + $a.Name + '“ ist mit dem Firmennetz (Domäne) verbunden — dort bleibt das Gateway.') }
  if (@($fernR | Where-Object { [int]$_.InterfaceIndex -eq [int]$a.ifIndex }).Count) { throw ('Über „' + $a.Name + '“ läuft gerade die Fernverbindung des Tools — das Gateway wird hier nicht entfernt.') }
  $gw = @(Get-NetRoute -InterfaceIndex $a.ifIndex -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue) + @(Get-NetRoute -InterfaceIndex $a.ifIndex -DestinationPrefix '0.0.0.0/0' -PolicyStore PersistentStore -EA SilentlyContinue)
  if (-not $gw.Count) { Zeile ('„' + $a.Name + '“ hat kein Standardgateway — nichts zu tun.') }
  else {
    $alt = @($gw | ForEach-Object { [string]$_.NextHop } | Select-Object -Unique)
    Remove-NetRoute -InterfaceIndex $a.ifIndex -DestinationPrefix '0.0.0.0/0' -Confirm:$false -EA SilentlyContinue
    Remove-NetRoute -InterfaceIndex $a.ifIndex -DestinationPrefix '0.0.0.0/0' -PolicyStore PersistentStore -Confirm:$false -EA SilentlyContinue
    $rk = 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\' + $a.InterfaceGuid
    $rg = @((Get-ItemProperty $rk -EA SilentlyContinue).DefaultGateway | Where-Object { $_ })
    if ($rg.Count) {
      foreach ($wn in 'DefaultGateway', 'DefaultGatewayMetric') {
        try { Set-ItemProperty -Path $rk -Name $wn -Value ([string[]]@()) -Type MultiString -EA Stop } catch { Set-ItemProperty -Path $rk -Name $wn -Value ([string[]]@('')) -Type MultiString }
      }
    }
    $rest = @(Get-NetRoute -InterfaceIndex $a.ifIndex -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue)
    Zeile ('„' + $a.Name + '“: Standardgateway vorher ' + ($alt -join ', ') + ' → jetzt ' + $(if ($rest.Count) { 'NOCH VORHANDEN (' + ((@($rest | ForEach-Object { $_.NextHop })) -join ', ') + ')' } else { 'keins' }))
    Zeile ('Das eigene Netz des Adapters (' + ((@(Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -EA SilentlyContinue | ForEach-Object { $_.IPAddress + '/' + $_.PrefixLength })) -join ', ') + ') bleibt direkt erreichbar; Internet und Firmenserver laufen wieder über den Firmen-Adapter.')
    Zeile ('Rückgängig: in den IPv4-Eigenschaften von „' + $a.Name + '“ das Gateway ' + ($alt -join ', ') + ' wieder eintragen.')
  }
}
elseif ($roh -match '^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})/(\d{1,2})$') {
  $okt = @([int]$matches[1], [int]$matches[2], [int]$matches[3], [int]$matches[4]); $len = [int]$matches[5]
  if (@($okt | Where-Object { $_ -gt 255 }).Count -or $len -gt 32) { throw ('„' + $roh + '“ ist keine gültige Netzangabe (z. B. 10.50.0.0/16).') }
  $pre = $roh
  $pers = @(Get-NetRoute -PolicyStore PersistentStore -AddressFamily IPv4 -DestinationPrefix $pre -EA SilentlyContinue)
  if (-not $pers.Count) {
    $akt = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix $pre -EA SilentlyContinue)
    throw ('Keine fest eingetragene (dauerhafte) Route für ' + $pre + $(if ($akt.Count) { ' — es gibt nur automatische Routen (' + ((@($akt | ForEach-Object { $_.InterfaceAlias + ' → ' + $_.NextHop })) -join ', ') + '), die Windows bzw. DHCP selbst setzen' } else { '' }) + '. Übersicht: „IP-Konfiguration im Detail“.')
  }
  foreach ($r in $pers) {
    $idx = [int]$r.InterfaceIndex; $nh = [string]$r.NextHop
    $alias = [string](Get-NetAdapter -InterfaceIndex $idx -EA SilentlyContinue).Name
    if ($pre -eq '0.0.0.0/0') {
      $i4 = Get-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4 -EA SilentlyContinue
      if ($i4 -and [string]$i4.Dhcp -ne 'Enabled') { Zeile ('Standardgateway ' + $nh + ' an „' + $alias + '“ gehört zur festen IP-Konfiguration — dafür „Gateway: ' + $alias + '“ verwenden. Nicht geändert.'); continue }
    }
    if (@($fernR | Where-Object { [int]$_.InterfaceIndex -eq $idx -and [string]$_.DestinationPrefix -eq $pre -and [string]$_.NextHop -eq $nh }).Count) { Zeile ('Route ' + $pre + ' über ' + $nh + ' trägt gerade die Fernverbindung des Tools — nicht geändert.'); continue }
    Remove-NetRoute -DestinationPrefix $pre -InterfaceIndex $idx -NextHop $nh -Confirm:$false -EA SilentlyContinue
    if (@(Get-NetRoute -PolicyStore PersistentStore -DestinationPrefix $pre -InterfaceIndex $idx -NextHop $nh -EA SilentlyContinue).Count) { Remove-NetRoute -DestinationPrefix $pre -InterfaceIndex $idx -NextHop $nh -PolicyStore PersistentStore -Confirm:$false -EA Stop }
    Zeile ('Route ' + $pre + ' über ' + $nh + ' (' + $(if ($alias) { $alias } else { 'Adapter ' + $idx }) + ', Metrik ' + $r.RouteMetric + '): entfernt.')
    Zeile ('  Rückgängig: route -p add ' + ($pre -split '/')[0] + ' mask ' + (Maske $len) + ' ' + $nh + ' metric ' + $r.RouteMetric)
    $n++
  }
  if (-not $n) { Zeile 'Nichts entfernt.' }
}
else { throw 'Bitte so angeben: „10.50.0.0/16“ (fest eingetragene Route) oder „Gateway: Ethernet 3“ (Standardgateway eines fest eingestellten Adapters).' }` }),

  // ══ Mobilfunk (lesend) ══════════════════════════════════════════════════════
  A({ id: 'netz4-mobilfunk-status', titel: 'Mobilfunk prüfen (Modul, SIM/eSIM, PIN, Anbieter, Signal, Roaming, Zugangspunkt)', modus: 'system', risiko: 'lesen', timeoutMs: 60000,
    beschreibung: 'Für eingebaute LTE-/5G-Module: Dienst „WWAN – automatische Konfiguration“, Flugzeugmodus, Modem im Geräte-Manager, Mobilfunk-Adapter, Bereitschaft der SIM (keine SIM, PIN/PUK verlangt, nicht aktiviert), Funk an/aus, Anbieter, Signal, Roaming, Verbindung, mobile Daten und Roaming-Erlaubnis, SIM-Steckplätze (eSIM), gespeicherte Zugangspunkte (APN, nie Kennwörter) und ob Mobilfunk als getaktet gilt. Lange Nummern (IMSI, ICCID, Telefonnummer) werden gekürzt. Ändert nichts.',
    ps: String.raw`
${HILFE_PS}
function Maskiert([string]$t) { return ([regex]::Replace($t, '\d{7,}', { param($m) '…' + $m.Value.Substring($m.Value.Length - 4) })) }
$s = Get-Service WwanSvc -EA SilentlyContinue
Zeile ('Dienst „WWAN – automatische Konfiguration“: ' + $(if ($s) { [string]$s.Status + ' · Start ' + [string]$s.StartType } else { 'nicht vorhanden' }))
$flug = (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\RadioManagement\SystemRadioState' -EA SilentlyContinue).'(default)'
Zeile ('Flugzeugmodus: ' + $(if ($flug -eq 1) { 'AN' } elseif ($flug -eq 0) { 'aus' } else { 'unbekannt' }))
$mod = @(Get-PnpDevice -EA SilentlyContinue | Where-Object { $_.FriendlyName -match 'Mobile Broadband|WWAN|\bLTE\b|\b5G\b|Snapdragon X\d|Quectel|Fibocom|Sierra Wireless|XMM\d|Telit|Mobilfunk|Cellular|MBIM' })
foreach ($d in $mod | Select-Object -First 6) { Zeile ('Gerät: ' + $d.FriendlyName + ' · ' + $d.Status + ' (' + $d.Class + ')' + $(if ([string]$d.Status -eq 'Unknown') { ' — nicht angeschlossen bzw. im BIOS aus' } else { '' })) }
$ad = @(Get-NetAdapter -IncludeHidden -EA SilentlyContinue | Where-Object { [string]$_.MediaType -match 'Wireless WAN' -or [string]$_.PhysicalMediaType -match 'Wireless WAN|Mobile' -or $_.InterfaceDescription -match 'Mobile Broadband|WWAN|Cellular' })
foreach ($a in $ad) { Zeile ('Adapter: ' + $a.Name + ' (' + $a.InterfaceDescription + '): ' + $a.Status) }
$mi = (& netsh.exe mbn show interfaces 2>&1 | Out-String)
$namen = @([regex]::Matches($mi, '(?m)^\s*Name\s*:\s*(.+?)\s*$') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
if (-not $namen.Count) {
  Zeile ('netsh mbn: ' + (Kurz $mi 200))
  if (-not ($mod.Count + $ad.Count)) { Zeile 'Kein Mobilfunkmodul erkannt — der Laptop hat keins, es ist im BIOS abgeschaltet oder der Treiber fehlt.' }
}
$muster = 'Status|State|Zustand|Bereit|Ready|SIM|Anbieter|Provider|Roaming|Signal|RSSI|Mobilfunkklasse|Cellular class|Firmware|Ger.tetyp|Device type|Hardware|Software|Funk|Radio|Profil|Profile|PIN|Versuche|Attempts|Daten|Data|Slot|eUICC|Zugriff|Access|Fehler|Error'
foreach ($nm in $namen | Select-Object -First 2) {
  Zeile ('── Mobilfunk-Schnittstelle „' + $nm + '“')
  $gesehen = @{}
  foreach ($cmd in @('interfaces', 'readyinfo', 'radio', 'pin', 'connection', 'dataenablement', 'dataroamcontrol', 'slotmapping')) {
    if ($cmd -eq 'interfaces') { $t = $mi } else { $t = (& netsh.exe mbn show $cmd ('interface=' + $nm) 2>&1 | Out-String) }
    foreach ($z in @($t -split '\r?\n' | Where-Object { $_ -match '^\s*[^:]{2,60}:\s*\S' -and $_ -match $muster -and $_ -notmatch 'Teilnehmer|Subscriber|ICC|Telefonnummer|Telephone|Kennwort|Password' })) {
      $zt = Maskiert (($z.Trim()) -replace '\s{2,}', ' ')
      if ($gesehen.ContainsKey($zt)) { continue }
      $gesehen[$zt] = 1
      Zeile ('  ' + $zt)
    }
  }
  $pl = (& netsh.exe mbn show profiles ('interface=' + $nm) 2>&1 | Out-String)
  $prof = @($pl -split '\r?\n' | Where-Object { $_ -match '^\s{2,}\S' -and $_ -notmatch ':' -and $_ -notmatch '^\s*-+\s*$' } | ForEach-Object { $_.Trim() } | Select-Object -First 4)
  if (-not $prof.Count) { Zeile '  Gespeicherte Mobilfunk-Profile: keine' }
  foreach ($pf in $prof) {
    $x = (& netsh.exe mbn show profiles ('name=' + $pf) ('interface=' + $nm) 2>&1 | Out-String)
    $apn = ''; if ($x -match '<AccessString>([^<]*)</AccessString>') { $apn = $matches[1] }
    $ben = $x -match '<UserName>[^<]+</UserName>'
    Zeile ('  Profil „' + $pf + '“: Zugangspunkt (APN) ' + $(if ($apn) { $apn } else { 'automatisch/leer' }) + $(if ($ben) { ' · mit Benutzername' } else { '' }))
  }
}
$mc = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\NetworkList\DefaultMediaCost' -EA SilentlyContinue
if ($mc) { Zeile ('Mobilfunk gilt als getaktet: ' + $(if ($mc.'4G' -eq 2 -or $mc.'3G' -eq 2) { 'ja (Windows-Standard: Updates und OneDrive halten sich zurück)' } else { 'nein' })) }` }),

]
