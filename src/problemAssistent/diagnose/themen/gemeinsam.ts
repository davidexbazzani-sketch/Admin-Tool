// ── Diagnose: gemeinsame Sonden (von allen Themen nutzbar) ───────────────────
// sys = Grundzustand des PCs · net = Netz/Internet/Domäne/Zscaler · aad = Anmeldung (Entra, PRT, Kerberos)
// Alles NUR LESEND. Fakten-Namen: <sonde>.<name>.
import type { DgSonde } from '../types'

/** AD-Helfer für Sonden der Art „lokal“ (laufen auf dem Admin-PC, $S = angemeldeter Benutzer des Ziel-PCs).
 *  Nur lesende LDAP-Abfragen. Variablen bewusst ohne $s/$p (PowerShell unterscheidet nicht $S/$s, $P/$p). */
export const AD_HELFER = String.raw`
$adDoms = @(); try { $adDoms = @([System.DirectoryServices.ActiveDirectory.Forest]::GetCurrentForest().Domains | ForEach-Object { $_.Name }) } catch {}
if (-not $adDoms.Count -and $env:USERDNSDOMAIN) { $adDoms = @($env:USERDNSDOMAIN) }
$adSam = ([string]$S -split '\\')[-1] -replace '[^A-Za-z0-9._-]', ''
function LdapEsc([string]$v) { $v.Replace('\', '\5c').Replace('*', '\2a').Replace('(', '\28').Replace(')', '\29') }
function AdSuche([string]$wurzel, [string]$filter, [string[]]$felder, [int]$max = 0) {
  try {
    $such = New-Object System.DirectoryServices.DirectorySearcher([ADSI]$wurzel)
    $such.Filter = $filter; $such.PageSize = 500; if ($max) { $such.SizeLimit = $max }
    foreach ($fe in $felder) { [void]$such.PropertiesToLoad.Add($fe) }
    @($such.FindAll())
  } catch { @() }
}
function AdWert($tr, [string]$feld) { $w = $tr.Properties[$feld.ToLower()]; if ($w -and $w.Count) { [string]$w[0] } else { '' } }
function AdBenutzer([string]$name) {
  if (-not $name) { return $null }
  foreach ($dm in $adDoms) {
    $r = @(AdSuche ('LDAP://' + $dm) ('(&(objectCategory=person)(objectClass=user)(sAMAccountName=' + (LdapEsc $name) + '))') @('distinguishedName', 'department', 'manager', 'displayName'))
    if ($r.Count) { return [pscustomobject]@{ dn = (AdWert $r[0] 'distinguishedName'); dom = $dm; abt = (AdWert $r[0] 'department'); mgr = (AdWert $r[0] 'manager') } }
  }
  $null
}
function AdGruppenKette($ben, [string]$gfilter) {
  $set = New-Object System.Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)
  foreach ($dm in $adDoms) {
    foreach ($g in (AdSuche ('LDAP://' + $dm) ('(&(objectCategory=group)' + $gfilter + '(member:1.2.840.113556.1.4.1941:=' + (LdapEsc $ben.dn) + '))') @('cn'))) { [void]$set.Add((AdWert $g 'cn')) }
  }
  @($set)
}
function AdDomVonDn([string]$dn) { (@($dn -split '(?<!\\),' | Where-Object { $_ -like 'DC=*' } | ForEach-Object { $_.Substring(3) })) -join '.' }
# Kollegen: gleiche Abteilung (aktive Konten), bei weniger als 4 der gleiche Vorgesetzte
function AdKollegen($ben, [int]$max = 60) {
  $kol = @(); $basis = ''
  if ($ben.abt) { $kol = @(AdSuche ('LDAP://' + $ben.dom) ('(&(objectCategory=person)(objectClass=user)(department=' + (LdapEsc $ben.abt) + ')(!(userAccountControl:1.2.840.113556.1.4.803:=2)))') @('distinguishedName') 80); $basis = 'Abteilung „' + $ben.abt + '“' }
  if ($kol.Count -lt 4 -and $ben.mgr) { $kol = @(AdSuche ('LDAP://' + $ben.dom) ('(&(objectCategory=person)(objectClass=user)(manager=' + (LdapEsc $ben.mgr) + ')(!(userAccountControl:1.2.840.113556.1.4.803:=2)))') @('distinguishedName') 80); $basis = 'gleicher Vorgesetzter' }
  [pscustomobject]@{ dns = @($kol | ForEach-Object { AdWert $_ 'distinguishedName' } | Where-Object { $_ -and $_ -ne $ben.dn } | Select-Object -First $max); basis = $basis }
}
# Alle Sicherheitsgruppen eines Kontos (transitiv, inkl. domänenlokaler) als SIDs
function AdTokenSids([string]$dn, [string]$dm) {
  $set = New-Object System.Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)
  try {
    $e = [ADSI]('LDAP://' + $dm + '/' + $dn.Replace('/', '\/'))
    $e.RefreshCache([string[]]@('tokenGroups'))
    foreach ($b in $e.Properties['tokenGroups']) { [void]$set.Add((New-Object System.Security.Principal.SecurityIdentifier([byte[]]$b, 0)).Value) }
  } catch {}
  ,$set
}
`

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
if ($zs) { Punkt 'Zscaler-Dienst' $(if ($zs.Status -eq 'Running') { 'ok' } else { 'fehler' }) ([string]$zs.Status) } else { Punkt 'Zscaler' 'warn' 'NICHT installiert – ohne Zscaler kein Internet/Intranet über SKF' }
if ($zs) {
  # Ist Zscaler wirklich eingeschaltet? Dienst allein reicht nicht – der Anwender kann „Turn off“ drücken.
  $zTun = @(Get-Process -Name 'ZSATunnel' -EA SilentlyContinue).Count -gt 0
  $zApp = @(Get-Process -Name 'ZSATray' -EA SilentlyContinue).Count -gt 0
  Fakt 'zscalerTunnel' $zTun; Fakt 'zscalerApp' $zApp
  Punkt 'Zscaler-Tunnel (ZSATunnel)' $(if ($zTun) { 'ok' } else { 'fehler' }) $(if ($zTun) { 'läuft' } else { 'läuft NICHT – Zscaler ist nicht verbunden bzw. ausgeschaltet' })
  Punkt 'Zscaler-App (Symbol im Infobereich)' $(if ($zApp) { 'ok' } else { 'warn' }) $(if ($zApp) { 'läuft' } else { 'läuft nicht – Anwender sieht kein Zscaler-Symbol' })
  # Prüfseite von Zscaler: sagt, ob der Datenverkehr über Zscaler läuft (Internet Security an/aus)
  $zia = $null
  try {
    $zrq = [System.Net.HttpWebRequest]::Create('https://ip.zscaler.com/'); $zrq.Timeout = 8000
    $zrs = $zrq.GetResponse(); $zsr = New-Object System.IO.StreamReader($zrs.GetResponseStream()); $h = [string]$zsr.ReadToEnd(); $zsr.Close(); $zrs.Close()
    if ($h -match '(?i)not going through') { $zia = $false } elseif ($h -match '(?i)via Zscaler|Zscaler Cloud') { $zia = $true }
  } catch {}
  Fakt 'zscalerInternet' $zia
  Punkt 'Internet läuft über Zscaler (ip.zscaler.com)' $(if ($zia -eq $true) { 'ok' } elseif ($zia -eq $false) { 'warn' } else { 'info' }) $(if ($zia -eq $true) { 'ja – Zscaler ist eingeschaltet' } elseif ($zia -eq $false) { 'NEIN – „Internet Security“ in der Zscaler-App ausgeschaltet?' } else { 'Prüfseite nicht erreichbar' })
}
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
  {
    // Fernzugriff-Rollen (ZPA/Akamai EAA) des angemeldeten Benutzers — im AD am Admin-PC gelesen.
    id: 'zpa', titel: 'Fernzugriff-Berechtigungen für das Homeoffice (ZPA-Rollen im AD)', modus: 'lokal', timeoutMs: 90000,
    ps: AD_HELFER + String.raw`
$ben = AdBenutzer $adSam
if (-not $ben) {
  Punkt 'Fernzugriff-Rollen (ZPA)' 'info' $(if ($adSam) { 'Konto ' + $adSam + ' im AD nicht gefunden (Admin-PC ohne Verbindung zum AD?)' } else { 'kein angemeldeter Benutzer – Rollen nicht prüfbar' })
} else {
  $grp = @(AdGruppenKette $ben '(|(cn=EAA_*)(cn=Azure_AD_SSO_Akamai_EAA_Client)(cn=Azure_AD_SSO_Akamai_EAA_3Pext))')
  Fakt 'gelesen' $true
  Fakt 'gruppen' @($grp | Where-Object { $_ -like 'EAA_*' } | Sort-Object)
  # Grundrolle „Remote Access“ (ZPA Client Role): Pflicht für JEDE Anwendung im Homeoffice
  $basis = ($grp -contains 'Azure_AD_SSO_Akamai_EAA_Client') -or ($grp -contains 'Azure_AD_SSO_Akamai_EAA_3Pext')
  Fakt 'basis' $basis
  Punkt 'Homeoffice-Grundrolle „Remote Access“' $(if ($basis) { 'ok' } else { 'fehler' }) $(if ($basis) { 'Azure_AD_SSO_Akamai_EAA_Client' } else { 'Azure_AD_SSO_Akamai_EAA_Client fehlt → ohne Grundrolle geht im Homeoffice keine Anwendung („ZPA Client Role“ beantragen)' })
  $karte = [ordered]@{
    fileserver = @('EAA_File_Servers_Marine_Prod', 'Marine-Fileserver (I:, Abteilungslaufwerke)', 'Marine Fileservers')
    sapProd = @('EAA_SAP_Marine_Prod', 'SAP Production', 'Marine Production')
    sapNonProd = @('EAA_SAP_Marine_NonProd', 'SAP Non Production', 'Marine Non Production')
    enaio = @('EAA_Enaoi', 'enaio', 'Marine enaio')
    babtec = @('EAA_Babtec_Marine', 'Babtec', 'Marine Babtec')
    solidworks = @('EAA_Solidworks_Marine', 'Solidworks', 'Solidworks Marine')
  }
  foreach ($n in @($karte.Keys)) {
    $k = $karte[$n]; $hat = $grp -contains $k[0]
    Fakt $n $hat
    $stufe = if ($hat) { 'ok' } elseif ($n -eq 'fileserver') { 'fehler' } else { 'info' }
    $text = if ($hat) { $k[0] } elseif ($n -eq 'fileserver') { $k[0] + ' fehlt → ZPA-Rolle „' + $k[2] + '“ beantragen' } else { $k[0] + ' fehlt (nur nötig, wenn ' + $k[1] + ' im Homeoffice gebraucht wird)' }
    Punkt ('Homeoffice-Zugriff ' + $k[1]) $stufe $text
  }
}
`,
  },
  {
    // ALLE Sicherheitsgruppen des Benutzers mit denen der Kollegen vergleichen (am Admin-PC, nur lesend).
    // Fehlt eine Gruppe, die mind. die Hälfte (min. 2) der Kollegen direkt hat, und hat der Benutzer sie
    // auch nicht verschachtelt (tokenGroups) → Kandidat. Zuordnung zu Antrag/Fehlerbild: berechtigungen.ts.
    id: 'rechte', titel: 'Alle Berechtigungen im AD (Vergleich mit den Kollegen)', modus: 'lokal', timeoutMs: 150000,
    ps: AD_HELFER + String.raw`
$ben = AdBenutzer $adSam
$fehlen = @()
if (-not $ben) {
  Punkt 'Berechtigungen (AD)' 'info' $(if ($adSam) { 'Konto ' + $adSam + ' im AD nicht gefunden (Admin-PC ohne Verbindung zum AD?)' } else { 'kein Benutzer bekannt – Berechtigungen nicht prüfbar' })
} else {
  $ich = @(AdSuche ('LDAP://' + $ben.dom) ('(distinguishedName=' + (LdapEsc $ben.dn) + ')') @('memberOf'))
  $meine = New-Object System.Collections.Generic.HashSet[string]([StringComparer]::OrdinalIgnoreCase)
  if ($ich.Count) { foreach ($m in @($ich[0].Properties['memberof'])) { [void]$meine.Add([string]$m) } }
  $tok = AdTokenSids $ben.dn $ben.dom
  $kol = AdKollegen $ben
  $n = $kol.dns.Count
  Fakt 'gelesen' $true; Fakt 'kollegen' $n; Fakt 'eigene' $meine.Count
  $zaehl = @{}
  for ($i = 0; $i -lt $n; $i += 40) {
    $teil = @($kol.dns[$i..([Math]::Min($i + 39, $n - 1))])
    $flt = '(|' + (($teil | ForEach-Object { '(distinguishedName=' + (LdapEsc $_) + ')' }) -join '') + ')'
    foreach ($r in (AdSuche ('LDAP://' + $ben.dom) $flt @('memberOf'))) { foreach ($m in @($r.Properties['memberof'])) { $zaehl[[string]$m] = 1 + [int]$zaehl[[string]$m] } }
  }
  $kand = @($zaehl.Keys | Where-Object { -not $meine.Contains($_) -and $zaehl[$_] -ge 2 -and ($zaehl[$_] / [Math]::Max(1, $n)) -ge 0.5 })
  foreach ($grp in @($kand | Group-Object -Property { AdDomVonDn $_ })) {
    $liste = @($grp.Group)
    for ($i = 0; $i -lt $liste.Count; $i += 40) {
      $teil = @($liste[$i..([Math]::Min($i + 39, $liste.Count - 1))])
      $flt = '(|' + (($teil | ForEach-Object { '(distinguishedName=' + (LdapEsc $_) + ')' }) -join '') + ')'
      foreach ($r in (AdSuche ('LDAP://' + $grp.Name) $flt @('distinguishedName', 'cn', 'description', 'groupType', 'objectSid'))) {
        $gt = 0L; [void][int64]::TryParse((AdWert $r 'groupType'), [ref]$gt)
        if ($gt -ge 0) { continue }   # Verteilerliste, keine Berechtigung
        $roh = $r.Properties['objectsid']
        if ($roh -and $roh.Count) { $gsid = (New-Object System.Security.Principal.SecurityIdentifier([byte[]]$roh[0], 0)).Value; if ($tok.Contains($gsid)) { continue } }
        $fehlen += [pscustomobject]@{ cn = (AdWert $r 'cn'); desc = ((AdWert $r 'description') -replace '\|', '/'); anz = [int]$zaehl[(AdWert $r 'distinguishedName')] }
      }
    }
  }
  $fehlen = @($fehlen | Sort-Object -Property anz -Descending | Select-Object -First 15)
  Fakt 'fehlen' @($fehlen | ForEach-Object { $_.cn + '|' + $_.desc + '|' + $_.anz + '|' + $n })
  Fakt 'fehlenAnzahl' $fehlen.Count
  if ($n -lt 2) { Punkt 'Vergleich mit Kollegen' 'info' ('zu wenige Kollegen gefunden (' + $kol.basis + ') – kein Vergleich möglich') }
  elseif (-not $fehlen.Count) { Punkt 'Vergleich mit Kollegen' 'ok' ('' + $n + ' Kollegen (' + $kol.basis + '): keine Berechtigung fehlt, die die meisten haben · ' + $meine.Count + ' eigene Gruppen') }
  else { Punkt 'Vergleich mit Kollegen' 'warn' ('' + $n + ' Kollegen (' + $kol.basis + '): ' + $fehlen.Count + ' Berechtigung(en) fehlen dem Benutzer') }
  foreach ($x in $fehlen) { Punkt ('Fehlt: ' + $x.cn) 'warn' ('' + $x.anz + ' von ' + $n + ' Kollegen' + $(if ($x.desc) { ' – ' + $x.desc } else { '' })) }
}
`,
  },
]
