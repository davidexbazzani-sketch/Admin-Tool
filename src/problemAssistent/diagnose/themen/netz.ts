// ── Diagnose-Thema „Netzwerk & Internet“ ─────────────────────────────────────
// Sonden: lan = Netzwerkkarte/Kabel/IP/Dienste · dnsweb = DNS, hosts, Firmenserver, Systemproxy
//         dnsprx = Proxy und „sicheres DNS“ des angemeldeten Benutzers. Alles NUR LESEND.
import { ja, liste, nein, num, txt } from '../motor'
import type { DgFakten, DgOber, DgSonde } from '../types'

const da = (f: DgFakten, k: string): boolean => f[k] !== null && f[k] !== undefined && f[k] !== ''

export const SONDEN_NETZ: DgSonde[] = [
  {
    id: 'lan', titel: 'Netzwerkkarte, Kabel, IP-Adresse und Netzdienste', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
$cs = Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue
Fakt 'domaenePc' ([bool]($cs -and $cs.PartOfDomain))
$phys = @(Get-NetAdapter -Physical -EA SilentlyContinue)
$lanA = @($phys | Where-Object { [string]$_.PhysicalMediaType -notmatch '(?i)802\.11|Wireless|Bluetooth|WWAN|Mobile' -and [string]$_.InterfaceDescription -notmatch '(?i)Wi-?Fi|Wireless|WLAN|Bluetooth|Mobile Broadband|WWAN|LTE' })
$lanUp = @($lanA | Where-Object { $_.Status -eq 'Up' })
$lanAus = @($lanA | Where-Object { [string]$_.Status -eq 'Disabled' })
$haupt = $null
if ($lanUp.Count) { $haupt = $lanUp[0] } elseif ($lanA.Count) { $haupt = @($lanA | Where-Object { [string]$_.Status -ne 'Disabled' } | Select-Object -First 1)[0]; if (-not $haupt) { $haupt = $lanA[0] } }
Fakt 'lanAnzahl' $lanA.Count; Fakt 'lanVerbunden' ($lanUp.Count -gt 0); Fakt 'lanDeaktiviert' ($lanAus.Count -gt 0)
if (-not $lanA.Count) {
  Fakt 'lanStatus' $null
  Punkt 'Netzwerkkarte (Kabel)' 'info' 'keine LAN-Netzwerkkarte gefunden (Laptop ohne Buchse, Dock/USB-Adapter nicht angesteckt?)'
} else {
  Fakt 'lanStatus' ([string]$haupt.Status); Fakt 'lanName' ([string]$haupt.InterfaceDescription)
  $lanTxt = @($lanA | ForEach-Object { [string]$_.Name + ': ' + [string]$_.Status + $(if ($_.Status -eq 'Up') { ' (' + [string]$_.LinkSpeed + ')' } else { '' }) }) -join ', '
  Punkt 'Netzwerkkarte (Kabel)' $(if ($lanUp.Count) { 'ok' } elseif ($lanAus.Count) { 'fehler' } else { 'warn' }) $(if ($lanUp.Count -or $lanAus.Count) { $lanTxt } else { $lanTxt + ' – kein Link (Kabel, Dose oder Dock)' })
}
$mbit = $null
if ($lanUp.Count) { $mbit = [math]::Round([double]$lanUp[0].Speed / 1000000) }
Fakt 'lanMbit' $mbit
if ($null -ne $mbit) { Punkt 'Geschwindigkeit am Kabel' $(if ($mbit -lt 1000) { 'warn' } else { 'ok' }) ('' + $mbit + ' MBit/s' + $(if ($mbit -lt 1000) { ' – normal wären 1000 MBit/s (Kabel, Dose, Dock oder Einstellung)' } else { '' })) }
$usb = $false; if ($haupt) { $usb = ([string]$haupt.PnPDeviceID -match '^USB') }
Fakt 'lanUsb' $usb
$duplexFest = $false; $jumbo = $null; $vlan = $null; $eee = $false; $macFest = $false
if ($haupt) {
  $erw = @(); try { $erw = @(Get-NetAdapterAdvancedProperty -Name $haupt.Name -AllProperties -EA Stop) } catch {}
  foreach ($ep in $erw) {
    $kw = [string]$ep.RegistryKeyword; $wert = [string](@($ep.RegistryValue) -join '')
    if ($kw -eq '*SpeedDuplex' -and $wert -ne '' -and $wert -ne '0') { $duplexFest = $true }
    if ($kw -eq '*JumboPacket' -and $wert -match '^\d+$') { $jumbo = [int]$wert }
    if ($kw -match '^\*?VlanID$' -and $wert -match '^\d+$') { if ([int]$wert -gt 0) { $vlan = [int]$wert } }
    if (($kw -eq '*EEE' -or $kw -match 'EEELinkAdvertisement') -and $wert -ne '' -and $wert -ne '0') { $eee = $true }
    if ($kw -eq 'NetworkAddress' -and $wert -match '^[0-9A-Fa-f]{12}$') { $macFest = $true }
  }
  $hin = @()
  if ($duplexFest) { $hin += 'Geschwindigkeit/Duplex fest eingestellt' }
  if ($jumbo -gt 1514) { $hin += ('Jumbo-Pakete ' + $jumbo + ' Bytes') }
  if ($vlan) { $hin += ('VLAN-ID ' + $vlan + ' im Treiber') }
  if ($macFest) { $hin += 'MAC-Adresse von Hand gesetzt' }
  if ($eee) { $hin += 'Energiesparendes Ethernet an' }
  Punkt 'Treiber-Einstellungen der LAN-Karte' $(if ($duplexFest -or $vlan -or $macFest -or $jumbo -gt 1514) { 'warn' } else { 'ok' }) $(if ($hin.Count) { $hin -join ', ' } else { 'Standard (automatisch)' })
}
Fakt 'lanDuplexFest' $duplexFest; Fakt 'lanJumbo' $jumbo; Fakt 'lanVlanId' $vlan; Fakt 'lanEee' $eee; Fakt 'lanMacFest' $macFest
$gf = @(Get-CimInstance Win32_PnPEntity -Filter "PNPClass='Net' AND ConfigManagerErrorCode<>0" -EA SilentlyContinue | Where-Object { $_.ConfigManagerErrorCode -ne 22 -and $_.ConfigManagerErrorCode -ne 45 })
Fakt 'geraeteFehler' @($gf | ForEach-Object { [string]$_.Name + ' (Code ' + $_.ConfigManagerErrorCode + ')' })
Punkt 'Netzwerkgeräte im Geräte-Manager' $(if ($gf.Count) { 'fehler' } else { 'ok' }) $(if ($gf.Count) { (@($gf | ForEach-Object { [string]$_.Name + ' (Code ' + $_.ConfigManagerErrorCode + ')' }) -join ', ') } else { 'kein Gerät mit Fehler' })
$v4aus = @()
foreach ($a in $lanUp) { $bd = Get-NetAdapterBinding -Name $a.Name -ComponentID ms_tcpip -EA SilentlyContinue; if ($bd -and -not $bd.Enabled) { $v4aus += [string]$a.Name } }
Fakt 'ipv4Aus' ($v4aus.Count -gt 0)
if ($v4aus.Count) { Punkt 'Internetprotokoll Version 4' 'fehler' ('am Adapter abgeschaltet: ' + ($v4aus -join ', ')) }
$dhcpAus = $false; $festeIp = $null; $mehrereIp = $false; $apipaLan = $false; $lanIp = $null
if ($lanUp.Count) {
  $idx = $lanUp[0].ifIndex
  $ipi = Get-NetIPInterface -InterfaceIndex $idx -AddressFamily IPv4 -EA SilentlyContinue
  $adr = @(Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -EA SilentlyContinue)
  $gut4 = @($adr | Where-Object { $_.IPAddress -notmatch '^169\.254\.' })
  $apipaLan = ($adr.Count -gt 0 -and $gut4.Count -eq 0)
  if ($gut4.Count) { $lanIp = [string]$gut4[0].IPAddress }
  if ($ipi -and [string]$ipi.Dhcp -eq 'Disabled') { $dhcpAus = $true; $festeIp = $lanIp }
  $mehrereIp = $gut4.Count -gt 1
  Punkt 'IP-Adresse am Kabel' $(if ($apipaLan) { 'fehler' } elseif ($dhcpAus -or $mehrereIp) { 'warn' } elseif ($lanIp) { 'ok' } else { 'fehler' }) $(if ($apipaLan) { 'nur 169.254.x.x – keine Adresse vom DHCP-Server' } elseif ($lanIp) { (@($gut4 | ForEach-Object { [string]$_.IPAddress + '/' + $_.PrefixLength }) -join ', ') + $(if ($dhcpAus) { ' – FEST eingetragen (kein DHCP)' } else { ' (DHCP)' }) } else { 'keine IPv4-Adresse' })
}
Fakt 'lanIp' $lanIp; Fakt 'apipa' $apipaLan; Fakt 'dhcpAus' $dhcpAus; Fakt 'festeIp' $festeIp; Fakt 'mehrereIp' $mehrereIp
$alleIf = @(Get-NetAdapter -IncludeHidden -EA SilentlyContinue)
$tunnelIdx = @($alleIf | Where-Object { [string]$_.InterfaceDescription -match '(?i)Zscaler|Cisco|AnyConnect|TAP-|Wintun|WireGuard|Fortinet|PANGP|VPN' } | ForEach-Object { $_.ifIndex })
$rt = @(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue | Where-Object { $_.NextHop -ne '0.0.0.0' -and $tunnelIdx -notcontains $_.ifIndex })
$gwIf = @($rt | ForEach-Object { $_.ifIndex } | Select-Object -Unique)
Fakt 'standardRouten' $gwIf.Count
Punkt 'Standard-Gateways' $(if ($gwIf.Count -gt 1) { 'warn' } elseif ($gwIf.Count) { 'ok' } else { 'fehler' }) $(if ($gwIf.Count) { (@($rt | ForEach-Object { [string]$_.InterfaceAlias + ' → ' + [string]$_.NextHop }) | Select-Object -Unique) -join ', ' } else { 'kein Standard-Gateway' })
$wlanStatt = $false; $kat = $null
if ($rt.Count) {
  $best = $null; $bestM = [int]::MaxValue
  foreach ($ro in $rt) { $im = [int](Get-NetIPInterface -InterfaceIndex $ro.ifIndex -AddressFamily IPv4 -EA SilentlyContinue).InterfaceMetric; $mw = [int]$ro.RouteMetric + $im; if ($mw -lt $bestM) { $bestM = $mw; $best = $ro } }
  if ($best) {
    $kat = [string](Get-NetConnectionProfile -InterfaceIndex $best.ifIndex -EA SilentlyContinue | Select-Object -First 1).NetworkCategory
    $bestA = @($phys | Where-Object { $_.ifIndex -eq $best.ifIndex } | Select-Object -First 1)
    if ($lanUp.Count -and $bestA.Count -and [string]$bestA[0].PhysicalMediaType -match '802\.11') { $wlanStatt = $true }
  }
}
Fakt 'wlanStattLan' $wlanStatt; Fakt 'kategorie' $kat
if ($wlanStatt) { Punkt 'Bevorzugte Verbindung' 'warn' 'Kabel steckt, der PC schickt den Verkehr aber über das WLAN' }
if ($kat) { Punkt 'Netzwerkprofil' $(if ($kat -eq 'DomainAuthenticated') { 'ok' } else { 'info' }) $(if ($kat -eq 'DomainAuthenticated') { 'Domäne (Firmennetz erkannt)' } elseif ($kat -eq 'Public') { 'Öffentlich' } else { 'Privat' }) }
$persKey = Get-Item -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\PersistentRoutes' -EA SilentlyContinue
$pers = @(); if ($persKey) { $pers = @($persKey.Property) }
Fakt 'persistenteRouten' $pers.Count
if ($pers.Count) { Punkt 'Feste Routen (route -p)' 'warn' ('' + $pers.Count + ': ' + (($pers | Select-Object -First 4) -join ' | ')) }
$ab7 = (Get-Date).AddDays(-7)
$konf = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; ProviderName = 'Tcpip'; Id = 4199; StartTime = $ab7 } -MaxEvents 50 -EA SilentlyContinue).Count
Fakt 'ipKonflikt7' $konf
Punkt 'IP-Adresskonflikte (7 Tage)' $(if ($konf) { 'fehler' } else { 'ok' }) $(if ($konf) { '' + $konf + ' Meldung(en) „IP-Adresskonflikt“' } else { 'keine' })
$lanRx = @($lanA | ForEach-Object { [regex]::Escape([string]$_.InterfaceDescription) }) -join '|'
$trenn = 0
if ($lanRx) {
  $trenn = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-NetworkProfile/Operational'; Id = 10001; StartTime = $ab7 } -MaxEvents 500 -EA SilentlyContinue | Where-Object { (@($_.Properties | ForEach-Object { [string]$_.Value }) -join ' | ') -match $lanRx }).Count
}
Fakt 'lanTrennungen7' $trenn
Punkt 'Kabelverbindung getrennt (7 Tage)' $(if ($trenn -ge 10) { 'warn' } else { 'ok' }) ('' + $trenn + ' Mal')
foreach ($d in @(@('Dhcp', 'dhcpDienst', 'DHCP-Client'), @('Dnscache', 'dnsDienst', 'DNS-Client'), @('NlaSvc', 'nlaDienst', 'Netzwerkerkennung (NLA)'), @('dot3svc', 'dot3Dienst', 'Automatische Konfiguration (Kabel, 802.1X)'))) {
  $sv = Get-Service -Name $d[0] -EA SilentlyContinue
  Fakt $d[1] $(if ($sv) { [string]$sv.Status } else { $null }); Fakt ($d[1] + 'Start') $(if ($sv) { [string]$sv.StartType } else { $null })
  $soll = ($d[0] -eq 'Dhcp' -or $d[0] -eq 'Dnscache')
  Punkt ('Dienst ' + $d[2]) $(if (-not $sv) { 'info' } elseif ($sv.Status -eq 'Running') { 'ok' } elseif ([string]$sv.StartType -eq 'Disabled') { 'fehler' } elseif ($soll) { 'fehler' } else { 'info' }) $(if ($sv) { [string]$sv.Status + ' (' + [string]$sv.StartType + ')' } else { 'nicht vorhanden' })
}
$x1 = @(Get-WinEvent -FilterHashtable @{ LogName = 'Microsoft-Windows-Wired-AutoConfig/Operational'; Level = 2, 3; StartTime = $ab7 } -MaxEvents 200 -EA SilentlyContinue).Count
Fakt 'dot1xFehler7' $x1
Punkt 'Netzwerk-Anmeldung am Kabel (802.1X, 7 Tage)' $(if ($x1) { 'warn' } else { 'ok' }) $(if ($x1) { '' + $x1 + ' Fehler/Warnung(en)' } else { 'keine Fehler' })
$cnRx = [regex]::Escape([string]$env:COMPUTERNAME)
$zert = @(Get-ChildItem -Path 'Cert:\LocalMachine\My' -EA SilentlyContinue | Where-Object { $_.HasPrivateKey -and (@($_.EnhancedKeyUsageList | ForEach-Object { [string]$_.ObjectId }) -contains '1.3.6.1.5.5.7.3.2') -and (([string]$_.Subject -match $cnRx) -or ((@($_.DnsNameList | ForEach-Object { [string]$_ }) -join ' ') -match $cnRx)) })
$zertGut = @($zert | Where-Object { $_.NotAfter -gt (Get-Date) })
$zertTage = $null; if ($zert.Count) { $zertTage = [math]::Round((($zert | Sort-Object NotAfter -Descending | Select-Object -First 1).NotAfter - (Get-Date)).TotalDays) }
Fakt 'computerZert' ($zertGut.Count -gt 0); Fakt 'computerZertTage' $zertTage
Punkt 'Computerzertifikat (Netzanmeldung)' $(if ($zertGut.Count -and $zertTage -ge 14) { 'ok' } elseif ($zertGut.Count) { 'warn' } else { 'info' }) $(if ($zertGut.Count) { 'gültig, noch ' + $zertTage + ' Tage' } elseif ($zert.Count) { 'ABGELAUFEN (vor ' + (-$zertTage) + ' Tagen)' } else { 'keins vorhanden' })
$bruecke = @($alleIf | Where-Object { [string]$_.InterfaceDescription -match '(?i)MAC Bridge|Bridge Miniport' }).Count -gt 0
$virt = @($alleIf | Where-Object { $_.Status -eq 'Up' -and [string]$_.InterfaceDescription -match '(?i)Hyper-V Virtual Ethernet|VirtualBox|VMware|Docker' } | ForEach-Object { [string]$_.Name })
Fakt 'bruecke' $bruecke; Fakt 'virtuelleAdapter' @($virt)
if ($bruecke) { Punkt 'Netzwerkbrücke' 'fehler' 'Netzwerkbrücke ist eingerichtet' }
Punkt 'Virtuelle Netzwerkadapter' $(if ($virt.Count) { 'info' } else { 'ok' }) $(if ($virt.Count) { ($virt -join ', ') } else { 'keine aktiv' })
`,
  },
  {
    id: 'dnsweb', titel: 'Namensauflösung (DNS), hosts-Datei, Firmenserver, Systemproxy', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
function TcpDns([string]$hn, [int]$port) { try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($hn, $port).Wait(3000) -and $t.Connected; $t.Close(); return [bool]$ok } catch { return $false } }
$cs = Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue
$dom = ''; if ($cs -and $cs.PartOfDomain) { $dom = [string]$cs.Domain }
Fakt 'domaenePc' ([bool]$dom); Fakt 'domaene' $(if ($dom) { $dom } else { $null })
$phys = @(Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { $_.Status -eq 'Up' })
$srv = @(); $manuell = @()
foreach ($a in $phys) {
  $srv += @(Get-DnsClientServerAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -EA SilentlyContinue | ForEach-Object { $_.ServerAddresses })
  $ns = [string](Get-ItemProperty -LiteralPath ('HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\' + [string]$a.InterfaceGuid) -Name NameServer -EA SilentlyContinue).NameServer
  if ($ns.Trim()) { $manuell += [string]$a.Name }
}
$srv = @($srv | Where-Object { $_ } | ForEach-Object { [string]$_ } | Select-Object -Unique)
$oeff = @($srv | Where-Object { $_ -match '^(8\.8\.|1\.1\.1\.1$|1\.0\.0\.1$|9\.9\.9\.|149\.112\.|208\.67\.|94\.140\.|76\.76\.)' })
Fakt 'dnsServer' @($srv); Fakt 'dnsManuell' ($manuell.Count -gt 0); Fakt 'dnsOeffentlich' ($oeff.Count -gt 0); Fakt 'dnsExtern' ($manuell.Count -gt 0 -and $oeff.Count -gt 0)
Punkt 'DNS-Server' $(if (-not $srv.Count) { 'fehler' } elseif ($manuell.Count -and $oeff.Count) { 'fehler' } elseif ($manuell.Count) { 'warn' } else { 'ok' }) $(if ($srv.Count) { ($srv -join ', ') + $(if ($manuell.Count) { ' – VON HAND eingetragen (' + ($manuell -join ', ') + ')' } else { ' (automatisch)' }) } else { 'keine DNS-Server' })
$ms = $null
if ($srv.Count) {
  $uhr = [Diagnostics.Stopwatch]::StartNew(); $ok1 = $false
  try { $ok1 = [bool](Resolve-DnsName 'www.microsoft.com' -Server $srv[0] -DnsOnly -QuickTimeout -EA Stop | Select-Object -First 1) } catch {}
  $uhr.Stop(); if ($ok1) { $ms = [int]$uhr.ElapsedMilliseconds }
}
Fakt 'dnsAntwortMs' $ms
Punkt 'Antwortzeit des DNS-Servers' $(if ($null -eq $ms) { 'fehler' } elseif ($ms -gt 1000) { 'warn' } else { 'ok' }) $(if ($null -eq $ms) { 'keine Antwort' } else { '' + $ms + ' ms' })
$extOk = $false; try { $extOk = [bool](Resolve-DnsName 'www.google.com' -DnsOnly -EA Stop | Select-Object -First 1) } catch {}
Fakt 'externAufgeloest' $extOk
Punkt 'Externe Namen (www.google.com)' $(if ($extOk) { 'ok' } else { 'fehler' }) $(if ($extOk) { 'werden aufgelöst' } else { 'werden NICHT aufgelöst' })
$ncsiDns = $false; try { $ncsiDns = [bool](@(Resolve-DnsName 'dns.msftncsi.com' -Type A -DnsOnly -EA Stop | Where-Object { $_.IPAddress -eq '131.107.255.255' }).Count) } catch {}
Fakt 'ncsiDns' $ncsiDns
if ($dom) {
  $domOk = $false; try { $domOk = [bool](Resolve-DnsName $dom -DnsOnly -EA Stop | Select-Object -First 1) } catch {}
  $dc = $null; try { $dc = [string](@(Resolve-DnsName ('_ldap._tcp.dc._msdcs.' + $dom) -Type SRV -DnsOnly -EA Stop | Where-Object { $_.NameTarget } | Select-Object -First 1)[0].NameTarget) } catch {}
  Fakt 'domaeneAufgeloest' $domOk; Fakt 'dcGefunden' ([bool]$dc); Fakt 'dcName' $dc
  $ldap = $false; $smb = $false; $krb = $false
  if ($dc) { $ldap = TcpDns $dc 389; $smb = TcpDns $dc 445; $krb = TcpDns $dc 88 }
  Fakt 'dcLdap' $ldap; Fakt 'dcSmb' $smb; Fakt 'dcKerberos' $krb
  Punkt 'Domäne im DNS' $(if ($dc) { 'ok' } elseif ($domOk) { 'warn' } else { 'fehler' }) $(if ($dc) { $dom + ' → Anmeldeserver ' + $dc } elseif ($domOk) { $dom + ' wird aufgelöst, aber kein Anmeldeserver (SRV) gefunden' } else { $dom + ' wird NICHT aufgelöst' })
  if ($dc) { Punkt 'Anmeldeserver erreichbar' $(if ($ldap -and $smb -and $krb) { 'ok' } elseif ($ldap -or $smb) { 'warn' } else { 'fehler' }) ('LDAP ' + (Ja $ldap) + ', Dateifreigaben ' + (Ja $smb) + ', Kerberos ' + (Ja $krb)) }
  $tp = Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters' -EA SilentlyContinue
  $prim = [string]$tp.'NV Domain'; if (-not $prim) { $prim = [string]$tp.Domain }
  $such = @((Get-DnsClientGlobalSetting -EA SilentlyContinue).SuffixSearchList | ForEach-Object { [string]$_ })
  $suffixFehlt = (-not $prim) -and ($such -notcontains $dom)
  Fakt 'suffixFehlt' $suffixFehlt
  Punkt 'DNS-Suffix' $(if ($suffixFehlt) { 'warn' } else { 'ok' }) $(if ($prim) { $prim } elseif ($such.Count) { 'Suchliste: ' + ($such -join ', ') } else { 'kein Suffix – Kurznamen von Servern gehen nicht' })
} else { Punkt 'Domäne' 'info' 'PC ist kein Domänenmitglied' }
$hf = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$he = @(Get-Content -LiteralPath $hf -EA SilentlyContinue | ForEach-Object { ([string]$_ -replace '#.*$', '').Trim() } | Where-Object { $_ })
$hms = @($he | Where-Object { $_ -match '(?i)microsoft|office|live\.com|windowsupdate|msftncsi|msftconnecttest|zscaler|skype|teams|sharepoint|onedrive|azure' })
Fakt 'hostsEintraege' $he.Count; Fakt 'hostsListe' @($he | Select-Object -First 8 | ForEach-Object { $_ -replace '\s+', ' ' }); Fakt 'hostsMs' ($hms.Count -gt 0)
Punkt 'hosts-Datei' $(if ($hms.Count) { 'fehler' } elseif ($he.Count) { 'warn' } else { 'ok' }) $(if ($hms.Count) { '' + $hms.Count + ' Eintrag/Einträge sperren Microsoft-/Zscaler-Adressen' } elseif ($he.Count) { '' + $he.Count + ' Eintrag/Einträge: ' + ((@($he | Select-Object -First 3)) -join ' | ') } else { 'leer (Standard)' })
$wp = [string](netsh winhttp show proxy 2>$null | Out-String)
$direkt = $wp -match '(?i)Direkt|Direct ?access|kein Proxy|no proxy'
$whp = $null; if (-not $direkt -and $wp -match '(?im)(Proxyserver|Proxy Server)[^:\r\n]*:\s*(\S+)') { $whp = $Matches[2] }
Fakt 'winhttpDirekt' $direkt; Fakt 'winhttpProxy' $whp
Punkt 'Systemproxy (WinHTTP)' $(if ($direkt) { 'ok' } else { 'info' }) $(if ($direkt) { 'direkt (Standard)' } else { 'eingetragen: ' + $whp })
$probe = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\NlaSvc\Parameters\Internet' -Name EnableActiveProbing -EA SilentlyContinue).EnableActiveProbing
$ncsiPol = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\NetworkConnectivityStatusIndicator' -Name NoActiveProbe -EA SilentlyContinue).NoActiveProbe
Fakt 'ncsiAus' ($probe -eq 0); Fakt 'ncsiRichtlinie' ($ncsiPol -eq 1)
Punkt 'Internet-Erkennung von Windows (NCSI)' $(if ($probe -eq 0) { 'warn' } else { 'ok' }) $(if ($probe -eq 0) { 'abgeschaltet (Tuning-Tool?) – Windows zeigt dann „Kein Internet“' } elseif ($ncsiPol -eq 1) { 'per Richtlinie aus' } else { 'aktiv' + $(if ($ncsiDns) { '' } else { ', Prüfadresse dns.msftncsi.com nicht korrekt aufgelöst' }) })
$autoDoh = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters' -Name EnableAutoDoh -EA SilentlyContinue).EnableAutoDoh
$dohK = @(Get-ChildItem -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\Dnscache\InterfaceSpecificParameters' -Recurse -EA SilentlyContinue | Where-Object { $fl = (Get-ItemProperty -LiteralPath $_.PSPath -Name DohFlags -EA SilentlyContinue).DohFlags; $null -ne $fl -and [int64]$fl -ne 0 })
$doh = ($autoDoh -eq 2) -or ($dohK.Count -gt 0)
Fakt 'dohWindows' $doh
if ($doh) { Punkt 'DNS über HTTPS (Windows)' 'warn' 'eingeschaltet – interne Namen können dann fehlen' }
$v6 = (Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters' -Name DisabledComponents -EA SilentlyContinue).DisabledComponents
Fakt 'ipv6Komponenten' $(if ($null -ne $v6) { [int64]$v6 } else { $null })
$tg = [string](netsh interface tcp show global 2>$null | Out-String)
$at = $null; if ($tg -match '(?im)(Auto-?Tuning|Abstimmungsgrad)[^:\r\n]*:\s*(\S+)') { $at = [string]$Matches[2] }
Fakt 'autotuning' $at; Fakt 'autotuningAus' ([string]$at -match '(?i)^(disabled|deaktiviert)$')
if ($at) { Punkt 'TCP-Empfangsfenster (Autotuning)' $(if ([string]$at -match '(?i)^(disabled|deaktiviert)$') { 'warn' } else { 'ok' }) $at }
$mtus = @(foreach ($a in $phys) { (Get-NetIPInterface -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -EA SilentlyContinue).NlMtu })
$mtus = @($mtus | Where-Object { $_ })
$mtu = $null; if ($mtus.Count) { $mtu = [int](($mtus | Measure-Object -Minimum).Minimum) }
Fakt 'mtu' $mtu
if ($null -ne $mtu) { Punkt 'Paketgröße (MTU)' $(if ($mtu -lt 1400) { 'warn' } else { 'ok' }) ('' + $mtu + ' Bytes' + $(if ($mtu -lt 1400) { ' – verkleinert' } else { '' })) }
`,
  },
  {
    id: 'dnsprx', titel: 'Proxy und „sicheres DNS“ des Benutzers', modus: 'profil', timeoutMs: 60000,
    ps: String.raw`
NeedHive
function TcpPrx([string]$hn, [int]$port) { try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($hn, $port).Wait(3000) -and $t.Connected; $t.Close(); return [bool]$ok } catch { return $false } }
$is = Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Internet Settings') -EA SilentlyContinue
$an = ($is.ProxyEnable -eq 1); $pxs = [string]$is.ProxyServer; $pac = [string]$is.AutoConfigURL
$zsP = ($pxs -match '127\.0\.0\.1:9000|localhost:9000') -or ($pac -match '(?i)127\.0\.0\.1|localhost|zscaler')
$fremd = [bool]($an -and $pxs -and ($pxs -notmatch '(?i)127\.0\.0\.1|localhost|zscaler'))
Fakt 'proxyAn' $an; Fakt 'proxyServer' $(if ($pxs) { $pxs } else { $null }); Fakt 'pacUrl' $(if ($pac) { $pac } else { $null }); Fakt 'proxyZscaler' ([bool]$zsP); Fakt 'proxyFremd' $fremd
$erreichbar = $null
if ($fremd -and $pxs -match '([A-Za-z0-9\.\-]+):(\d+)') { $erreichbar = TcpPrx $Matches[1] ([int]$Matches[2]) }
Fakt 'proxyErreichbar' $erreichbar
Punkt 'Proxy des Benutzers' $(if ($fremd -and $erreichbar -eq $false) { 'fehler' } elseif ($fremd) { 'warn' } else { 'ok' }) $(if ($an) { 'AN → ' + $pxs + $(if ($erreichbar -eq $false) { ' (antwortet NICHT)' } else { '' }) } else { 'aus' })
Punkt 'Proxy-Skript (PAC)' 'info' $(if ($pac) { $pac } else { 'keins' })
$auto = $null
$dcs = (Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Internet Settings\Connections') -Name DefaultConnectionSettings -EA SilentlyContinue).DefaultConnectionSettings
if ($dcs -and $dcs.Length -gt 8) { $auto = (([int]$dcs[8] -band 8) -ne 0) }
Fakt 'autoErkennen' $auto
$sicher = @()
foreach ($b in @(@('Chrome', 'Google\Chrome\User Data\Local State'), @('Edge', 'Microsoft\Edge\User Data\Local State'))) {
  $lf = Join-Path $uLocal $b[1]
  if (Test-Path -LiteralPath $lf) { $raw = [string](Get-Content -LiteralPath $lf -Raw -EA SilentlyContinue); if ($raw -match '"dns_over_https"\s*:\s*\{[^}]*"mode"\s*:\s*"secure"') { $sicher += $b[0] } }
}
foreach ($pf in @(Get-ChildItem -LiteralPath (Join-Path $uRoam 'Mozilla\Firefox\Profiles') -Directory -EA SilentlyContinue)) {
  $pj = Join-Path $pf.FullName 'prefs.js'
  if ((Test-Path -LiteralPath $pj) -and (Select-String -LiteralPath $pj -Pattern 'network\.trr\.mode",\s*[23]\)' -Quiet -EA SilentlyContinue)) { $sicher += 'Firefox'; break }
}
Fakt 'sicheresDns' @($sicher | Select-Object -Unique)
Punkt 'Sicheres DNS im Browser' $(if ($sicher.Count) { 'warn' } else { 'ok' }) $(if ($sicher.Count) { 'eingeschaltet in: ' + ((@($sicher | Select-Object -Unique)) -join ', ') + ' – interne Seiten gehen dort nicht' } else { 'aus (Standard)' })
`,
  },
]

export const THEMEN_NETZ: DgOber[] = [
  {
    id: 'netz', titel: 'Netzwerk & Internet', symbol: 'Network', beschreibung: 'Kein Internet, Kabel ohne Netz, langsam, Webseite oder Firmenserver nicht erreichbar, IP-Konflikt',
    unter: [
      {
        id: 'netz-kein-internet', titel: 'Verbunden, aber kein Internet', beschreibung: 'WLAN oder Kabel ist verbunden, aber keine Webseite lädt, Teams/Outlook sind offline, Weltkugel am Netzwerksymbol',
        sonden: ['net', 'lan', 'dnsweb', 'dnsprx'],
        regeln: [
          { id: 'apipa', wenn: f => ja(f['net.apipa']) && !da(f, 'net.ip'), befund: () => 'Der PC hat nur eine 169.254.x.x-Adresse – vom DHCP-Server kam keine Adresse', problem: 'netz-lan-169-254', schwere: 3 },
          { id: 'dhcp-dienst', wenn: f => da(f, 'lan.dhcpDienst') && txt(f['lan.dhcpDienst']) !== 'Running', befund: f => `Dienst „DHCP-Client“ läuft nicht (${txt(f['lan.dhcpDienst'])}, Start: ${txt(f['lan.dhcpDienstStart'])})`, problem: 'netz-dhcp-dienst-aus', schwere: 3 },
          { id: 'dns-dienst', wenn: f => da(f, 'lan.dnsDienst') && txt(f['lan.dnsDienst']) !== 'Running', befund: f => `Dienst „DNS-Client“ läuft nicht (${txt(f['lan.dnsDienst'])})`, problem: 'netz-dns-client-dienst-aus', schwere: 3 },
          { id: 'dns-tot', wenn: f => nein(f['net.dnsOk']) && da(f, 'net.ip'), befund: f => `Adresse ${txt(f['net.ip'])} ist da, aber Namen werden nicht aufgelöst (DNS: ${txt(f['net.dnsServer']) || 'keiner'})`, problem: 'netz-dns-fehler', schwere: 3 },
          { id: 'zscaler-steht', wenn: f => ja(f['net.zscalerInstalliert']) && da(f, 'net.zscalerDienst') && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])}) – ohne ihn kommt der PC nicht ins Internet`, problem: 'vpn-zscaler-symbol-fehlt', schwere: 3 },
          { id: 'hosts-sperre', wenn: f => ja(f['dnsweb.hostsMs']), befund: f => `Die hosts-Datei sperrt Microsoft-/Zscaler-Adressen: ${txt(f['dnsweb.hostsListe'])}`, problem: 'netz-hosts-sperrliste', schwere: 3 },
          { id: 'proxy-fremd', wenn: f => ja(f['dnsprx.proxyFremd']), befund: f => `Von Hand eingetragener Proxy ${txt(f['dnsprx.proxyServer'])}${nein(f['dnsprx.proxyErreichbar']) ? ' antwortet nicht' : ''}`, problem: 'netz-proxy-antwortet-nicht', schwere: 2 },
          { id: 'kein-gateway', wenn: f => da(f, 'net.ip') && num(f['lan.standardRouten']) === 0, befund: f => `Adresse ${txt(f['net.ip'])} vorhanden, aber kein Standard-Gateway`, problem: 'netz-nach-netzumbau-kein-gateway', schwere: 2 },
        ],
        ohneBefund: ['netz-kein-internet-verbunden', 'netz-weltkugel-kein-internetzugriff', 'netz-winsock-reset'],
      },
      {
        id: 'netz-lan-kabel', titel: 'LAN-Kabel bzw. Netzwerkdose ohne Netz', beschreibung: '„Netzwerkkabel nicht angeschlossen“, rotes Kreuz am Netzwerksymbol, am Dock oder an der Dose kommt kein Netz',
        sonden: ['lan', 'net'],
        regeln: [
          { id: 'lan-deaktiviert', wenn: f => ja(f['lan.lanDeaktiviert']) && nein(f['lan.lanVerbunden']), befund: () => 'Die LAN-Netzwerkkarte ist in Windows deaktiviert', problem: 'netz-adapter-deaktiviert', schwere: 3 },
          { id: 'geraetefehler', wenn: f => liste(f['lan.geraeteFehler']).length > 0, befund: f => `Netzwerkgerät mit Fehler im Geräte-Manager: ${txt(f['lan.geraeteFehler'])}`, problem: 'netz-adapter-fehlt', schwere: 3 },
          { id: 'ipv4-aus', wenn: f => ja(f['lan.ipv4Aus']), befund: () => '„Internetprotokoll, Version 4“ ist am LAN-Adapter abgehakt', problem: 'netz-ipv4-haken-fehlt', schwere: 3 },
          { id: 'kein-link', wenn: f => num(f['lan.lanAnzahl']) > 0 && nein(f['lan.lanVerbunden']) && nein(f['lan.lanDeaktiviert']), befund: f => `LAN-Karte „${txt(f['lan.lanName'])}“ hat keinen Link (${txt(f['lan.lanStatus'])}) – Kabel, Dose oder Switchport`, problem: 'netz-dose-patchen', schwere: 2 },
          { id: 'apipa', wenn: f => ja(f['lan.apipa']), befund: () => 'Am Kabel nur eine 169.254.x.x-Adresse – DHCP antwortet nicht (Dose im falschen Netz oder 802.1X)', problem: 'netz-lan-169-254', schwere: 3 },
          { id: '8021x-dienst', wenn: f => txt(f['lan.dot3DienstStart']) === 'Disabled', befund: () => 'Dienst „Automatische Konfiguration (verkabelt)“ ist deaktiviert – keine 802.1X-Anmeldung am Kabel', problem: 'netz-8021x-dienst-aus', schwere: 3 },
          { id: '8021x-fehler', wenn: f => num(f['lan.dot1xFehler7']) > 0 || (ja(f['lan.domaenePc']) && nein(f['lan.computerZert']) && nein(f['lan.lanVerbunden'])), befund: f => num(f['lan.dot1xFehler7']) > 0 ? `${f['lan.dot1xFehler7']} Fehler bei der Netzwerk-Anmeldung am Kabel (802.1X) in 7 Tagen` : 'Kein gültiges Computerzertifikat für die Netzwerk-Anmeldung', problem: 'netz-lan-8021x', schwere: 2 },
          { id: 'vlan-id', wenn: f => num(f['lan.lanVlanId']) > 0, befund: f => `Im Treiber der LAN-Karte ist die VLAN-ID ${f['lan.lanVlanId']} eingetragen`, problem: 'netz-treiber-vlan-id', schwere: 3 },
        ],
        ohneBefund: ['netz-dose-patchen', 'netz-kabel-nicht-angeschlossen', 'netz-lan-dock', 'netz-usb-lan-adapter'],
      },
      {
        id: 'netz-langsam', titel: 'Netz langsam oder mit Aussetzern', beschreibung: 'Seiten und Laufwerke laden zäh, Kopieren dauert ewig, Verbindung ist immer wieder kurz weg',
        sonden: ['lan', 'dnsweb'],
        regeln: [
          { id: 'nur-100', wenn: f => num(f['lan.lanMbit']) > 0 && num(f['lan.lanMbit']) <= 100, befund: f => `Kabelverbindung läuft nur mit ${f['lan.lanMbit']} MBit/s statt 1000`, problem: 'netz-lan-langsam-100mbit', schwere: 3 },
          { id: 'duplex-fest', wenn: f => ja(f['lan.lanDuplexFest']), befund: () => 'Geschwindigkeit/Duplex der LAN-Karte ist fest eingestellt statt automatisch', problem: 'netz-lan-geschwindigkeit-fest', schwere: 3 },
          { id: 'jumbo', wenn: f => num(f['lan.lanJumbo']) > 1514, befund: f => `Jumbo-Pakete (${f['lan.lanJumbo']} Bytes) sind an der LAN-Karte eingeschaltet`, problem: 'netz-jumbo-frames', schwere: 2 },
          { id: 'trennt', wenn: f => num(f['lan.lanTrennungen7']) >= 10, befund: f => `Kabelverbindung wurde in 7 Tagen ${f['lan.lanTrennungen7']}× getrennt`, problem: 'netz-lan-trennt', schwere: 2 },
          { id: 'wlan-statt-lan', wenn: f => ja(f['lan.wlanStattLan']), befund: () => 'Kabel steckt, aber Windows nutzt bevorzugt das WLAN', problem: 'netz-dock-wlan-statt-lan', schwere: 2 },
          { id: 'dns-langsam', wenn: f => num(f['dnsweb.dnsAntwortMs']) > 1000, befund: f => `DNS-Server antwortet erst nach ${f['dnsweb.dnsAntwortMs']} ms`, problem: 'netz-dns-langsam', schwere: 2 },
          { id: 'autotuning', wenn: f => ja(f['dnsweb.autotuningAus']), befund: f => `TCP-Autotuning ist abgeschaltet (${txt(f['dnsweb.autotuning'])})`, problem: 'netz-tcp-autotuning-aus', schwere: 2 },
          { id: 'mtu', wenn: f => num(f['dnsweb.mtu']) > 0 && num(f['dnsweb.mtu']) < 1400, befund: f => `Paketgröße (MTU) ist auf ${f['dnsweb.mtu']} Bytes verkleinert`, problem: 'netz-mtu-verstellt', schwere: 2 },
        ],
        ohneBefund: ['netz-internet-langsam', 'netz-lan-trennt', 'netz-lan-paketverlust', 'netz-ein-server-langsam'],
      },
      {
        id: 'netz-webseite', titel: 'Bestimmte Webseite oder Server nicht erreichbar', beschreibung: '„Seite nicht gefunden“, „DNS_PROBE_FINISHED“, eine Seite lädt nicht, andere schon, Server öffnet ein altes Ziel',
        sonden: ['dnsweb', 'dnsprx', 'net'],
        regeln: [
          { id: 'hosts-sperre', wenn: f => ja(f['dnsweb.hostsMs']), befund: f => `hosts-Datei sperrt Microsoft-/Zscaler-Adressen: ${txt(f['dnsweb.hostsListe'])}`, problem: 'netz-hosts-sperrliste', schwere: 3 },
          { id: 'hosts', wenn: f => num(f['dnsweb.hostsEintraege']) > 0 && nein(f['dnsweb.hostsMs']), befund: f => `hosts-Datei enthält ${f['dnsweb.hostsEintraege']} feste(n) Eintrag/Einträge: ${txt(f['dnsweb.hostsListe'])}`, problem: 'netz-falsches-ziel-hosts', schwere: 2 },
          { id: 'dns-tot', wenn: f => nein(f['dnsweb.externAufgeloest']) && nein(f['net.dnsOk']), befund: () => 'Externe Namen (www.google.com, login.microsoftonline.com) werden nicht aufgelöst', problem: 'netz-dns-fehler', schwere: 3 },
          { id: 'sicheres-dns', wenn: f => liste(f['dnsprx.sicheresDns']).length > 0, befund: f => `„Sicheres DNS“ ist im Browser eingeschaltet: ${txt(f['dnsprx.sicheresDns'])}`, problem: 'vpn-browser-sicheres-dns', schwere: 2 },
          { id: 'doh-windows', wenn: f => ja(f['dnsweb.dohWindows']), befund: () => 'In Windows ist „DNS über HTTPS“ eingestellt', problem: 'netz-dns-doh-windows', schwere: 2 },
          { id: 'proxy-fremd', wenn: f => ja(f['dnsprx.proxyFremd']), befund: f => `Von Hand eingetragener Proxy: ${txt(f['dnsprx.proxyServer'])}`, problem: 'netz-proxy-antwortet-nicht', schwere: 2 },
          { id: 'dns-manuell', wenn: f => ja(f['dnsweb.dnsExtern']), befund: f => `Öffentliche DNS-Server von Hand eingetragen (${txt(f['dnsweb.dnsServer'])})`, problem: 'netz-dns-manuell', schwere: 2 },
          { id: 'winhttp', wenn: f => nein(f['dnsweb.winhttpDirekt']) && nein(f['net.zscalerInstalliert']), befund: f => `Systemproxy (WinHTTP) ist eingetragen: ${txt(f['dnsweb.winhttpProxy'])}`, problem: 'netz-programme-ohne-internet', schwere: 1 },
        ],
        ohneBefund: ['netz-eine-webseite', 'vpn-zscaler-sperrseite', 'netz-dns-intern-anders-als-extern', 'netz-falsches-ziel-hosts'],
      },
      {
        id: 'netz-intern', titel: 'Firmenserver, Laufwerke oder Intranet im Büro nicht erreichbar', beschreibung: 'Internet geht, aber Laufwerke, Intranet oder Fachprogramme finden ihren Server nicht; „kein Anmeldeserver verfügbar“',
        sonden: ['dnsweb', 'lan', 'net'],
        regeln: [
          { id: 'dns-manuell', wenn: f => ja(f['dnsweb.dnsExtern']), befund: f => `Öffentliche DNS-Server von Hand eingetragen (${txt(f['dnsweb.dnsServer'])}) – interne Namen gehen damit nicht`, problem: 'netz-dns-manuell', schwere: 3 },
          { id: 'kein-dc-dns', wenn: f => ja(f['dnsweb.domaenePc']) && nein(f['dnsweb.dcGefunden']), befund: f => `Für die Domäne ${txt(f['dnsweb.domaene'])} wird im DNS kein Anmeldeserver gefunden`, problem: 'netz-extern-ja-intern-nein', schwere: 3 },
          { id: 'dc-weg', wenn: f => ja(f['dnsweb.dcGefunden']) && nein(f['dnsweb.dcLdap']) && nein(f['dnsweb.dcSmb']), befund: f => `Anmeldeserver ${txt(f['dnsweb.dcName'])} ist gefunden, aber nicht erreichbar`, problem: 'netz-anmeldeserver-nicht-verfuegbar', schwere: 3 },
          { id: 'oeffentlich', wenn: f => ja(f['lan.domaenePc']) && txt(f['lan.kategorie']) === 'Public' && ja(f['net.domaeneErreichbar']), befund: () => 'Firmennetz ist erreichbar, Windows stuft es aber als „Öffentlich“ ein', problem: 'netz-oeffentlich-statt-domaene', schwere: 2 },
          { id: 'suffix', wenn: f => ja(f['dnsweb.suffixFehlt']), befund: () => 'Kein DNS-Suffix der Domäne – Server sind nur mit vollem Namen erreichbar', problem: 'netz-dns-suffix', schwere: 2 },
          { id: 'route-alt', wenn: f => num(f['lan.persistenteRouten']) > 0, befund: f => `${f['lan.persistenteRouten']} fest eingetragene Route(n) (route -p) vorhanden`, problem: 'netz-statische-route-alt', schwere: 2 },
          { id: 'zwei-gateways', wenn: f => num(f['lan.standardRouten']) > 1, befund: f => `${f['lan.standardRouten']} Adapter haben ein Standard-Gateway (z. B. Maschinennetz + Firmennetz)`, problem: 'netz-maschinen-adapter-gateway', schwere: 2 },
          { id: 'virtuell', wenn: f => liste(f['lan.virtuelleAdapter']).length > 0, befund: f => `Virtuelle Netzwerkadapter aktiv: ${txt(f['lan.virtuelleAdapter'])}`, problem: 'netz-virtuelle-adapter', schwere: 1 },
        ],
        ohneBefund: ['netz-extern-ja-intern-nein', 'netz-pc-per-name-nicht-erreichbar', 'netz-anmeldeserver-nicht-verfuegbar', 'netz-port-gesperrt'],
      },
      {
        id: 'netz-ip', titel: 'IP-Adresskonflikt oder keine bzw. falsche Adresse', beschreibung: 'Meldung „IP-Adresskonflikt“, „Nicht identifiziertes Netzwerk“, fremde Adresse wie 192.168.x.x im Büro',
        sonden: ['lan', 'net'],
        regeln: [
          { id: 'konflikt', wenn: f => num(f['lan.ipKonflikt7']) > 0, befund: f => `${f['lan.ipKonflikt7']} Meldung(en) „IP-Adresskonflikt“ in 7 Tagen`, problem: 'netz-ip-konflikt', schwere: 3 },
          { id: 'apipa', wenn: f => ja(f['lan.apipa']) || (ja(f['net.apipa']) && !da(f, 'net.ip')), befund: () => 'Nur eine 169.254.x.x-Adresse – keine Adresse vom DHCP-Server', problem: 'netz-lan-169-254', schwere: 3 },
          { id: 'dhcp-dienst', wenn: f => da(f, 'lan.dhcpDienst') && txt(f['lan.dhcpDienst']) !== 'Running', befund: f => `Dienst „DHCP-Client“ läuft nicht (${txt(f['lan.dhcpDienst'])})`, problem: 'netz-dhcp-dienst-aus', schwere: 3 },
          { id: 'bruecke', wenn: f => ja(f['lan.bruecke']), befund: () => 'Eine Netzwerkbrücke ist eingerichtet', problem: 'netz-netzwerkbruecke', schwere: 3 },
          { id: 'feste-ip', wenn: f => ja(f['lan.dhcpAus']), befund: f => `IP-Adresse ist fest eingetragen (${txt(f['lan.festeIp']) || 'ohne Adresse'}) statt automatisch`, problem: 'netz-feste-ip', schwere: 2 },
          { id: 'zweite-ip', wenn: f => ja(f['lan.mehrereIp']), befund: () => 'Am LAN-Adapter stehen mehrere IPv4-Adressen', problem: 'netz-zweite-ip-am-adapter', schwere: 2 },
          { id: 'mac-fest', wenn: f => ja(f['lan.lanMacFest']), befund: () => 'An der Netzwerkkarte ist eine MAC-Adresse von Hand eingetragen', problem: 'netz-mac-von-hand-gesetzt', schwere: 2 },
          { id: 'fremder-dhcp', wenn: f => ja(f['lan.lanVerbunden']) && ja(f['lan.domaenePc']) && /^192\.168\.(0|1|2|178)\./.test(txt(f['lan.lanIp'])) && nein(f['net.domaeneErreichbar']), befund: f => `Am Kabel die Adresse ${txt(f['lan.lanIp'])} – typisch für einen fremden Router, nicht für das Firmennetz`, problem: 'netz-fremder-dhcp', schwere: 1 },
        ],
        ohneBefund: ['netz-ip-konflikt', 'netz-lan-169-254', 'netz-feste-ip'],
      },
    ],
  },
]
