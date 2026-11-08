// ── Diagnose: gemeinsame Sonden (von allen Themen nutzbar) ───────────────────
// sys = Grundzustand des PCs · net = Netz/Internet/Domäne/Zscaler · aad = Anmeldung (Entra, PRT, Kerberos)
// Alles NUR LESEND. Fakten-Namen: <sonde>.<name>.
import type { DgSonde } from '../types'

export const SONDEN_GEMEINSAM: DgSonde[] = [
  {
    id: 'sys', titel: 'Grundzustand des PCs (Speicher, Neustart, Abstürze)', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
$os = Get-CimInstance Win32_OperatingSystem -EA SilentlyContinue
$cs = Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue
$c = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -EA SilentlyContinue
if ($c) {
  $frei = [math]::Round([double]$c.FreeSpace / 1GB, 1); $ges = [math]::Round([double]$c.Size / 1GB, 1)
  Fakt 'cFreiGB' $frei; Fakt 'cGesamtGB' $ges
  Punkt 'Laufwerk C:' $(if ($frei -lt 5) { 'fehler' } elseif ($frei -lt 15) { 'warn' } else { 'ok' }) ('' + $frei + ' GB frei von ' + $ges + ' GB')
}
if ($os) {
  $tage = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalDays, 1)
  Fakt 'uptimeTage' $tage; Fakt 'os' ([string]$os.Caption + ' ' + [string]$os.BuildNumber)
  Punkt 'Letzter Neustart' $(if ($tage -gt 14) { 'warn' } else { 'ok' }) ('vor ' + $tage + ' Tagen')
  $ram = [math]::Round([double]$os.TotalVisibleMemorySize / 1MB, 1); $ramFrei = [math]::Round(100 * [double]$os.FreePhysicalMemory / [double]$os.TotalVisibleMemorySize)
  Fakt 'ramGB' $ram; Fakt 'ramFreiProzent' $ramFrei
  Punkt 'Arbeitsspeicher' $(if ($ramFrei -lt 10) { 'warn' } else { 'ok' }) ('' + $ram + ' GB, ' + $ramFrei + ' % frei')
}
if ($cs) { Fakt 'modell' (([string]$cs.Manufacturer + ' ' + [string]$cs.Model).Trim()) }
$aus = $false
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') { $aus = $true }
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') { $aus = $true }
Fakt 'neustartAusstehend' $aus
Punkt 'Neustart ausstehend' $(if ($aus) { 'warn' } else { 'ok' }) $(if ($aus) { 'Updates warten auf einen Neustart' } else { 'nein' })
$bs = 0; try { $bs = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 1001; ProviderName = 'Microsoft-Windows-WER-SystemErrorReporting'; StartTime = (Get-Date).AddDays(-30) } -EA Stop).Count } catch {}
$kp = 0; try { $kp = @(Get-WinEvent -FilterHashtable @{ LogName = 'System'; Id = 41; ProviderName = 'Microsoft-Windows-Kernel-Power'; StartTime = (Get-Date).AddDays(-30) } -EA Stop).Count } catch {}
Fakt 'bluescreens30' $bs; Fakt 'harteAus30' $kp
Punkt 'Bluescreens / harte Abschaltungen (30 Tage)' $(if ($bs -gt 0 -or $kp -gt 2) { 'warn' } else { 'ok' }) ('' + $bs + ' Bluescreen(s), ' + $kp + ' unerwartete Abschaltung(en)')
$akku = [bool](Get-CimInstance Win32_Battery -EA SilentlyContinue | Select-Object -First 1)
Fakt 'akku' $akku
`,
  },
  {
    id: 'net', titel: 'Netz, Internet, Domäne und Zscaler', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
function Tcp([string]$h, [int]$port) { try { $t = New-Object System.Net.Sockets.TcpClient; $ok = $t.ConnectAsync($h, $port).Wait(3000) -and $t.Connected; $t.Close(); return [bool]$ok } catch { return $false } }
$ad = @(Get-NetAdapter -Physical -EA SilentlyContinue | Where-Object { $_.Status -eq 'Up' })
$lan = @($ad | Where-Object { $_.PhysicalMediaType -notmatch '802\.11' -and $_.InterfaceDescription -notmatch 'Wi-?Fi|Wireless|WLAN' })
$wl = @($ad | Where-Object { $_.PhysicalMediaType -match '802\.11' -or $_.InterfaceDescription -match 'Wi-?Fi|Wireless|WLAN' })
Fakt 'adapterAktiv' @($ad | ForEach-Object { [string]$_.Name }); Fakt 'lan' ($lan.Count -gt 0); Fakt 'wlan' ($wl.Count -gt 0)
Punkt 'Netzwerkverbindung' $(if ($ad.Count) { 'ok' } else { 'fehler' }) $(if ($ad.Count) { (@($ad | ForEach-Object { $_.Name + ' (' + $_.LinkSpeed + ')' }) -join ', ') } else { 'kein Adapter verbunden' })
$ip = @(Get-NetIPAddress -AddressFamily IPv4 -EA SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^127\.' -and $_.PrefixOrigin -ne 'WellKnown' })
$apipa = @($ip | Where-Object { $_.IPAddress -match '^169\.254\.' }).Count -gt 0
$ok4 = @($ip | Where-Object { $_.IPAddress -notmatch '^169\.254\.' } | Select-Object -First 1)
Fakt 'ip' $(if ($ok4.Count) { [string]$ok4[0].IPAddress } else { $null }); Fakt 'apipa' $apipa
Punkt 'IP-Adresse' $(if ($ok4.Count) { 'ok' } elseif ($apipa) { 'fehler' } else { 'fehler' }) $(if ($ok4.Count) { [string]$ok4[0].IPAddress } elseif ($apipa) { 'nur 169.254.x.x – keine Adresse vom DHCP' } else { 'keine' })
$gw = [string](@(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -EA SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1).NextHop)
Fakt 'gateway' $gw
$gwOk = $false; if ($gw) { $gwOk = [bool](Test-Connection -ComputerName $gw -Count 1 -Quiet -EA SilentlyContinue) }
Fakt 'gatewayPing' $gwOk
Punkt 'Gateway' $(if ($gwOk) { 'ok' } elseif ($gw) { 'warn' } else { 'fehler' }) $(if ($gw) { $gw + $(if ($gwOk) { ' antwortet' } else { ' antwortet nicht auf Ping' }) } else { 'kein Standardgateway' })
$dns = @(Get-DnsClientServerAddress -AddressFamily IPv4 -EA SilentlyContinue | ForEach-Object { $_.ServerAddresses } | Select-Object -Unique)
Fakt 'dnsServer' @($dns | ForEach-Object { [string]$_ })
$aufl = $false; try { $aufl = [bool](Resolve-DnsName 'login.microsoftonline.com' -DnsOnly -EA Stop | Select-Object -First 1) } catch {}
Fakt 'dnsOk' $aufl
Punkt 'DNS-Auflösung' $(if ($aufl) { 'ok' } else { 'fehler' }) $(if ($aufl) { 'login.microsoftonline.com wird aufgelöst' } else { 'Namen werden nicht aufgelöst (DNS: ' + ($dns -join ', ') + ')' })
$inet = Tcp 'login.microsoftonline.com' 443
Fakt 'internet443' $inet
Punkt 'Internet (Microsoft 365)' $(if ($inet) { 'ok' } else { 'fehler' }) $(if ($inet) { 'erreichbar' } else { 'login.microsoftonline.com:443 nicht erreichbar' })
$dom = [string](Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue).Domain
$domOk = $false; if ($dom -and $dom -notmatch '^(WORKGROUP|ARBEITSGRUPPE)$') { $domOk = Tcp $dom 389 }
Fakt 'domaene' $dom; Fakt 'domaeneErreichbar' $domOk
Punkt 'Firmennetz (Domäne)' $(if ($domOk) { 'ok' } else { 'info' }) $(if ($domOk) { $dom + ' erreichbar' } else { $dom + ' nicht direkt erreichbar (Homeoffice ohne Zscaler-Tunnel?)' })
$zs = Get-Service -Name 'ZSAService' -EA SilentlyContinue
Fakt 'zscalerInstalliert' ([bool]$zs); Fakt 'zscalerDienst' $(if ($zs) { [string]$zs.Status } else { $null })
if ($zs) { Punkt 'Zscaler-Dienst' $(if ($zs.Status -eq 'Running') { 'ok' } else { 'fehler' }) ([string]$zs.Status) } else { Punkt 'Zscaler' 'info' 'nicht installiert' }
$wp = [string](netsh winhttp show proxy 2>$null | Out-String)
$direkt = $wp -match '(?i)Direct ?access|kein Proxy|no proxy'
Fakt 'winhttpDirekt' $direkt
Punkt 'Systemproxy (WinHTTP)' $(if ($direkt) { 'ok' } else { 'warn' }) $(if ($direkt) { 'direkt (Standard)' } else { 'Proxy eingetragen' })
`,
  },
  {
    id: 'aad', titel: 'Anmeldung (Entra ID, Anmeldetoken, Kerberos, Windows Hello)', modus: 'benutzer', timeoutMs: 90000,
    ps: String.raw`
$st = @(& (Join-Path $env:SystemRoot 'System32\dsregcmd.exe') /status 2>$null | ForEach-Object { [string]$_ })
function Feld([string]$n) { $z = $st | Where-Object { $_ -match ('^\s*' + [regex]::Escape($n) + '\s*:\s*(.*)$') } | Select-Object -First 1; if ($z -and $z -match ':\s*(.*)$') { return $Matches[1].Trim() } else { return $null } }
$aj = Feld 'AzureAdJoined'; $dj = Feld 'DomainJoined'; $prt = Feld 'AzureAdPrt'; $ngc = Feld 'NgcSet'; $ten = Feld 'TenantName'
Fakt 'entraJoined' ($aj -eq 'YES'); Fakt 'domainJoined' ($dj -eq 'YES'); Fakt 'prt' ($prt -eq 'YES'); Fakt 'hello' ($ngc -eq 'YES'); Fakt 'tenant' $ten
Punkt 'Entra ID (Azure AD)' $(if ($aj -eq 'YES') { 'ok' } else { 'warn' }) $(if ($aj -eq 'YES') { 'angemeldet' + $(if ($ten) { ' (' + $ten + ')' } else { '' }) } else { 'Gerät nicht in Entra ID' })
Punkt 'Anmeldetoken (PRT)' $(if ($prt -eq 'YES') { 'ok' } else { 'fehler' }) $(if ($prt -eq 'YES') { 'vorhanden – Office/Teams/OneDrive melden sich automatisch an' } else { 'FEHLT – Microsoft-365-Programme fragen nach Anmeldung' })
Punkt 'Windows Hello (PIN)' 'info' $(if ($ngc -eq 'YES') { 'eingerichtet' } else { 'nicht eingerichtet' })
$kl = @(& (Join-Path $env:SystemRoot 'System32\klist.exe') 2>$null | ForEach-Object { [string]$_ })
$tgt = @($kl | Where-Object { $_ -match '(?i)Server:\s*krbtgt/' }).Count -gt 0
$anz = @($kl | Where-Object { $_ -match '^\s*Server:' }).Count
Fakt 'kerberosTgt' $tgt; Fakt 'kerberosTickets' $anz
Punkt 'Kerberos-Anmeldung (Firmennetz)' $(if ($tgt) { 'ok' } else { 'warn' }) $(if ($tgt) { '' + $anz + ' Ticket(s)' } else { 'kein Anmeldeticket – Laufwerke/Intranet fragen ggf. nach Kennwort' })
`,
  },
]
