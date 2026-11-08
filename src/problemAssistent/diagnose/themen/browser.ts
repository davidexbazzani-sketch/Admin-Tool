// ── Diagnose-Thema „Browser & Webseiten“ ─────────────────────────────────────
// web    = Browser des angemeldeten Benutzers (Edge/Chrome/Firefox, Profilgröße, Erweiterungen, Einstellungen
//          aus Preferences/Local State, Standardbrowser, Proxy, Abstürze, fremde Browser)
// websys = PC-weit: Zscaler-Stammzertifikat, TLS-Prüfung (wer stellt das Zertifikat aus?), Uhrzeit-Abweichung,
//          Edge-/Chrome-Richtlinien, Intranetzone, Grafik (RTX Desktop Manager), Edge-Update
// Alles NUR LESEND.
import { ja, liste, nein, num, txt, zahl } from '../motor'
import type { DgOber, DgSonde } from '../types'

export const SONDEN_BROWSER: DgSonde[] = [
  {
    id: 'web', titel: 'Browser des Benutzers (Edge, Chrome, Firefox – Profil, Einstellungen, Abstürze)', modus: 'profil', timeoutMs: 120000,
    ps: String.raw`
NeedHive
$x86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
if (-not $x86) { $x86 = $env:ProgramFiles }
function ErsterPfadWeb([string[]]$kandidaten) { foreach ($k in $kandidaten) { if ($k -and (Test-Path -LiteralPath $k)) { return $k } }; return $null }
$edge = ErsterPfadWeb @((Join-Path $x86 'Microsoft\Edge\Application\msedge.exe'), (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'))
$chromeSys = ErsterPfadWeb @((Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'), (Join-Path $x86 'Google\Chrome\Application\chrome.exe'))
$chromeUsr = ErsterPfadWeb @((Join-Path $uLocal 'Google\Chrome\Application\chrome.exe'))
$ff = ErsterPfadWeb @((Join-Path $env:ProgramFiles 'Mozilla Firefox\firefox.exe'), (Join-Path $x86 'Mozilla Firefox\firefox.exe'))
Fakt 'edgeInstalliert' ([bool]$edge); Fakt 'chromeInstalliert' ([bool]($chromeSys -or $chromeUsr)); Fakt 'chromeDoppelt' ([bool]($chromeSys -and $chromeUsr)); Fakt 'firefoxInstalliert' ([bool]$ff)
$eAlter = $null; $eVer = ''
if ($edge) { $ei = Get-Item -LiteralPath $edge; $eVer = [string]$ei.VersionInfo.ProductVersion; $eAlter = [int][math]::Round(((Get-Date) - $ei.LastWriteTime).TotalDays) }
Fakt 'edgeVersion' $eVer; Fakt 'edgeAlterTage' $eAlter
Punkt 'Microsoft Edge' $(if (-not $edge) { 'fehler' } elseif ($eAlter -gt 60) { 'warn' } else { 'ok' }) $(if ($edge) { 'Version ' + $eVer + ', Stand vor ' + $eAlter + ' Tagen' } else { 'nicht gefunden' })
Punkt 'Weitere Browser' 'info' ('Chrome: ' + $(if ($chromeSys -and $chromeUsr) { 'DOPPELT (Programme + Benutzerprofil)' } elseif ($chromeSys -or $chromeUsr) { 'ja' } else { 'nein' }) + ', Firefox: ' + $(if ($ff) { 'ja' } else { 'nein' }))
$eUd = Join-Path $uLocal 'Microsoft\Edge\User Data'
$cUd = Join-Path $uLocal 'Google\Chrome\User Data'
function CacheGbWeb([string]$ud) {
  $sum = 0.0
  foreach ($pd in @(Get-ChildItem -LiteralPath $ud -Directory -EA SilentlyContinue | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' })) {
    foreach ($sub in @('Cache', 'Code Cache', 'GPUCache', 'Service Worker\CacheStorage')) { $sum += OrdnerGroesse (Join-Path $pd.FullName $sub) }
  }
  return [math]::Round($sum / 1GB, 1)
}
$eCache = CacheGbWeb $eUd; $cCache = CacheGbWeb $cUd
Fakt 'edgeCacheGB' $eCache; Fakt 'chromeCacheGB' $cCache; Fakt 'cacheGB' ([math]::Round($eCache + $cCache, 1))
Punkt 'Browser-Zwischenspeicher' $(if ($eCache + $cCache -ge 2) { 'warn' } else { 'ok' }) ('Edge ' + $eCache + ' GB, Chrome ' + $cCache + ' GB')
$eProf = @(Get-ChildItem -LiteralPath $eUd -Directory -EA SilentlyContinue | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' }).Count
$eExt = @(Get-ChildItem -LiteralPath (Join-Path $eUd 'Default\Extensions') -Directory -EA SilentlyContinue | Where-Object { $_.Name -ne 'Temp' }).Count
Fakt 'edgeProfile' $eProf; Fakt 'edgeErweiterungen' $eExt
Punkt 'Edge-Profile / Erweiterungen' $(if ($eExt -ge 15) { 'warn' } else { 'ok' }) ('' + $eProf + ' Profil(e), ' + $eExt + ' Erweiterung(en) im Standardprofil')
$pref = ''; try { $pref = [System.IO.File]::ReadAllText((Join-Path $eUd 'Default\Preferences')) } catch {}
$lst = ''; try { $lst = [System.IO.File]::ReadAllText((Join-Path $eUd 'Local State')) } catch {}
if ($pref) {
  $exitT = $(if ($pref -match '"exit_type"\s*:\s*"(\w+)"') { $Matches[1] } else { '' })
  Fakt 'edgeExitType' $exitT
  $zoom = 0.0; if ($pref -match '"default_zoom_level"\s*:\s*\{[^}]*?:\s*(-?[\d.]+)') { $zoom = [double]::Parse($Matches[1], [Globalization.CultureInfo]::InvariantCulture) }
  Fakt 'zoomVerstellt' ([math]::Abs($zoom) -gt 0.01)
  if ([math]::Abs($zoom) -gt 0.01) { Punkt 'Standard-Zoom' 'warn' ('verstellt (' + [math]::Round([math]::Pow(1.2, $zoom) * 100) + ' %)') }
  $konto = $(if ($pref -match '"account_info"\s*:\s*\[\s*\{[^\]]*?"email"\s*:\s*"([^"]*)"') { $Matches[1] } else { '' })
  Fakt 'edgeKonto' $konto
  Punkt 'In Edge angemeldet' $(if ($konto) { 'ok' } else { 'warn' }) $(if ($konto) { $konto } else { 'kein Konto angemeldet' })
  Fakt 'fragtWo' ($pref -match '"prompt_for_download"\s*:\s*true')
  $dl = $(if ($pref -match '"default_directory"\s*:\s*"((?:[^"\\]|\\.)*)"') { $Matches[1] -replace '\\\\', '\' } else { '' })
} else { $dl = '' }
if (-not $dl) {
  $usf = Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders') -EA SilentlyContinue
  $dl = [string]$usf.'{374DE290-123F-4565-9164-39C4925E467B}'
  if (-not $dl) { $dl = Join-Path $uProf 'Downloads' }
  $dl = $dl -replace '(?i)%USERPROFILE%', $uProf.Replace('$', '$$')
}
Fakt 'downloadOrdner' $dl
$dlFehlt = $null; if ($dl -and $dl -notmatch '^\\\\') { $dlFehlt = -not (Test-Path -LiteralPath $dl) }
Fakt 'downloadOrdnerFehlt' $dlFehlt; Fakt 'downloadInOneDrive' ($dl -match '(?i)OneDrive')
Punkt 'Download-Ordner' $(if ($dlFehlt) { 'fehler' } else { 'ok' }) ($dl + $(if ($dlFehlt) { ' – existiert NICHT' } else { '' }))
if ($lst) {
  $hwAus = $lst -match '"hardware_acceleration_mode"\s*:\s*\{\s*"enabled"\s*:\s*false'
  $flags = $lst -match '"enabled_labs_experiments"\s*:\s*\[\s*"'
  Fakt 'hwBeschleunigungAus' $hwAus; Fakt 'flagsGeaendert' $flags
  Punkt 'Grafikbeschleunigung in Edge' 'info' $(if ($hwAus) { 'aus' } else { 'an' })
  if ($flags) { Punkt 'Experimentelle Einstellungen (edge://flags)' 'warn' 'verändert' }
}
$sb = [string](Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice') -Name ProgId -EA SilentlyContinue).ProgId
$pdfId = [string](Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice') -Name ProgId -EA SilentlyContinue).ProgId
Fakt 'standardBrowser' $sb; Fakt 'pdfProgId' $pdfId
$acro = ErsterPfadWeb @((Join-Path $env:ProgramFiles 'Adobe\Acrobat DC\Acrobat\Acrobat.exe'), (Join-Path $x86 'Adobe\Acrobat Reader DC\Reader\AcroRd32.exe'), (Join-Path $env:ProgramFiles 'Adobe\Acrobat Reader DC\Reader\AcroRd32.exe'), (Join-Path $x86 'Adobe\Acrobat DC\Acrobat\Acrobat.exe'))
Fakt 'acrobat' ([bool]$acro)
Punkt 'Standardbrowser / PDF-Programm' 'info' ('Links: ' + $(if ($sb) { $sb } else { 'nicht festgelegt' }) + ', PDF: ' + $(if ($pdfId) { $pdfId } else { 'nicht festgelegt' }) + ', Acrobat/Reader: ' + $(if ($acro) { 'installiert' } else { 'nicht installiert' }))
$is = Get-ItemProperty -LiteralPath ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Internet Settings') -EA SilentlyContinue
$pxS = [string]$is.ProxyServer; $pac = [string]$is.AutoConfigURL
$pxLokal = ($is.ProxyEnable -eq 1 -and $pxS -match '(?i)127\.0\.0\.1|localhost') -or ($pac -match '(?i)127\.0\.0\.1|localhost')
$pxManuell = ($is.ProxyEnable -eq 1 -and $pxS -and -not $pxLokal)
Fakt 'proxyLokal' $pxLokal; Fakt 'proxyManuell' $pxManuell; Fakt 'proxyServer' $(if ($is.ProxyEnable -eq 1) { $pxS } else { $pac })
Punkt 'Proxy des Benutzers' $(if ($pxManuell) { 'warn' } else { 'ok' }) $(if ($pxManuell) { 'fest eingetragen: ' + $pxS } elseif ($pxLokal) { 'Zscaler-Proxy (127.0.0.1)' } elseif ($pac) { 'Skript: ' + $pac } else { 'kein Proxy (direkt/Zscaler)' })
$a1000 = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Id = 1000, 1002; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 400 -EA SilentlyContinue)
$eAb = @($a1000 | Where-Object { $_.Message -match '(?i)msedge\.exe' }).Count
$cAb = @($a1000 | Where-Object { $_.Message -match '(?i)chrome\.exe' }).Count
Fakt 'edgeAbstuerze7' $eAb; Fakt 'chromeAbstuerze7' $cAb
Punkt 'Browser-Abstürze/Hänger (7 Tage)' $(if ($eAb -ge 3 -or $cAb -ge 3) { 'fehler' } elseif ($eAb -or $cAb) { 'warn' } else { 'ok' }) ('Edge ' + $eAb + '×, Chrome ' + $cAb + '×')
try {
  $ep = @(UserProcs @('msedge'))
  $ram = 0.0; foreach ($q in $ep) { $ram += [double]$q.WorkingSet64 }
  Fakt 'edgeRamMB' ([int][math]::Round($ram / 1MB)); Fakt 'edgeProzesse' $ep.Count
  Punkt 'Edge läuft gerade' 'info' $(if ($ep.Count) { '' + $ep.Count + ' Prozesse, ' + [math]::Round($ram / 1MB) + ' MB Arbeitsspeicher' } else { 'nein' })
} catch { Punkt 'Edge-Prozesse' 'info' 'nicht lesbar (Adminrechte nötig)' }
$fremd = @()
foreach ($b in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall', ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Uninstall'))) {
  $fremd += @(Get-ChildItem -LiteralPath $b -EA SilentlyContinue | ForEach-Object { [string](Get-ItemProperty -LiteralPath $_.PSPath -Name DisplayName -EA SilentlyContinue).DisplayName } | Where-Object { $_ -match '(?i)^(Wave Browser|OneLaunch|Shift|WebNavigator|PC App Store|Chromium|Search Protect|Web Companion)' })
}
$fremd = @($fremd | Select-Object -Unique)
Fakt 'fremdBrowser' $fremd
Punkt 'Unerwünschte Browser/Such-Programme' $(if ($fremd.Count) { 'fehler' } else { 'ok' }) $(if ($fremd.Count) { $fremd -join ', ' } else { 'keine' })
`,
  },
  {
    id: 'websys', titel: 'Zertifikate, Uhrzeit, Richtlinien und Grafik für Browser', modus: 'system', timeoutMs: 90000,
    ps: String.raw`
function SslWeb([string]$h) {
  $erg = $null
  try {
    $t = New-Object System.Net.Sockets.TcpClient
    $t.ReceiveTimeout = 5000; $t.SendTimeout = 5000
    if ($t.ConnectAsync($h, 443).Wait(3000) -and $t.Connected) {
      $script:sslFehlerWeb = 'None'
      $cb = [System.Net.Security.RemoteCertificateValidationCallback]{ param($snd, $zert, $kette, $fehler) $script:sslFehlerWeb = [string]$fehler; return $true }
      $ss = New-Object System.Net.Security.SslStream($t.GetStream(), $false, $cb)
      $ss.AuthenticateAsClient($h)
      $c2 = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($ss.RemoteCertificate)
      $erg = [pscustomobject]@{ Aussteller = [string]$c2.Issuer; Fehler = [string]$script:sslFehlerWeb }
      $ss.Close()
    }
    $t.Close()
  } catch {}
  return $erg
}
$zs = Get-Service -Name ZSAService -EA SilentlyContinue
$root = @(Get-ChildItem -Path Cert:\LocalMachine\Root -EA SilentlyContinue | Where-Object { $_.Subject -match '(?i)Zscaler' })
Fakt 'zscalerRoot' ($root.Count -gt 0); Fakt 'zscalerRootFehlt' ([bool]$zs -and $root.Count -eq 0)
Punkt 'Zscaler-Stammzertifikat' $(if ($root.Count) { 'ok' } elseif ($zs) { 'fehler' } else { 'info' }) $(if ($root.Count) { 'vorhanden' } elseif ($zs) { 'FEHLT, obwohl Zscaler installiert ist – alle Seiten melden Zertifikatsfehler' } else { 'nicht vorhanden (kein Zscaler)' })
$tls = @()
foreach ($ziel in @('www.microsoft.com', 'www.google.com')) { $r = SslWeb $ziel; if ($r) { $tls += [pscustomobject]@{ Ziel = $ziel; Aussteller = $r.Aussteller; Fehler = $r.Fehler } } }
$kf = @($tls | Where-Object { $_.Fehler -ne 'None' })
Fakt 'tlsGeprueft' $tls.Count; Fakt 'tlsKettenFehler' $(if ($tls.Count) { $kf.Count -gt 0 } else { $null })
Fakt 'tlsZscaler' (@($tls | Where-Object { $_.Aussteller -match '(?i)Zscaler' }).Count -gt 0)
Punkt 'Zertifikatsprüfung (HTTPS)' $(if (-not $tls.Count) { 'info' } elseif ($kf.Count) { 'fehler' } else { 'ok' }) $(if (-not $tls.Count) { 'keine Testverbindung möglich' } elseif ($kf.Count) { 'Windows vertraut dem Zertifikat NICHT: ' + (@($kf | ForEach-Object { $_.Ziel + ' (' + $_.Fehler + ')' }) -join ', ') } else { 'gültig – ausgestellt von ' + ((@($tls | ForEach-Object { ($_.Aussteller -split ',')[0] }) | Select-Object -Unique) -join ' / ') })
$cs = Get-CimInstance Win32_ComputerSystem -EA SilentlyContinue
$zq = $(if ($cs -and $cs.PartOfDomain) { [string]$cs.Domain } else { 'time.windows.com' })
$sc = @(& (Join-Path $env:SystemRoot 'System32\w32tm.exe') /stripchart ('/computer:' + $zq) /samples:1 /dataonly 2>$null | ForEach-Object { [string]$_ })
$abw = $null
foreach ($z in $sc) { if ($z -match '([+-]\d+[\.,]\d+)s') { $abw = [math]::Round([double]::Parse(($Matches[1] -replace ',', '.'), [Globalization.CultureInfo]::InvariantCulture), 1) } }
Fakt 'zeitAbweichungSek' $abw
Punkt 'Uhrzeit' $(if ($null -eq $abw) { 'info' } elseif ([math]::Abs($abw) -ge 300) { 'fehler' } elseif ([math]::Abs($abw) -ge 60) { 'warn' } else { 'ok' }) $(if ($null -eq $abw) { 'Abgleich mit ' + $zq + ' nicht möglich' } else { 'weicht ' + $abw + ' s von ' + $zq + ' ab' })
$ep = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
$epv = Get-ItemProperty -LiteralPath $ep -EA SilentlyContinue
$anz = 0; if ($epv) { $anz = @($epv.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' }).Count }
$anz += @(Get-ChildItem -LiteralPath $ep -EA SilentlyContinue).Count
Fakt 'edgeRichtlinien' $anz
Fakt 'dohModus' $(if ($epv -and $epv.DnsOverHttpsMode) { [string]$epv.DnsOverHttpsMode } else { $null })
Fakt 'downloadRestriktion' $(if ($epv -and $null -ne $epv.DownloadRestrictions) { [int]$epv.DownloadRestrictions } else { $null })
Fakt 'authAllowlist' $(if ($epv) { [string]$epv.AuthServerAllowlist } else { '' })
$blk = @((Get-Item -LiteralPath ($ep + '\URLBlocklist') -EA SilentlyContinue).Property).Count
$pop = @((Get-Item -LiteralPath ($ep + '\PopupsAllowedForUrls') -EA SilentlyContinue).Property).Count
Fakt 'urlBlocklist' $blk; Fakt 'popupAusnahmen' $pop
Punkt 'Edge-Richtlinien' 'info' ('' + $anz + ' gesetzt; gesperrte Adressen: ' + $blk + ', Pop-up-Ausnahmen: ' + $pop + $(if ($epv -and $epv.DnsOverHttpsMode) { ', Sicheres DNS: ' + $epv.DnsOverHttpsMode } else { '' }))
$cp = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Google\Chrome' -EA SilentlyContinue
Fakt 'chromeCloudAp' ($cp -and $cp.CloudAPAuthEnabled -eq 1)
$zm = Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\CurrentVersion\Internet Settings\ZoneMapKey' -EA SilentlyContinue
$intra = 0; if ($zm) { $intra = @($zm.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' -and [string]$_.Value -eq '1' }).Count }
Fakt 'intranetZonen' $intra
Punkt 'Intranetzone (automatische Anmeldung)' $(if ($intra) { 'ok' } else { 'warn' }) $(if ($intra) { '' + $intra + ' Adresse(n) per Richtlinie in der Intranetzone' } else { 'keine Intranet-Adressen per Richtlinie' })
$gpu = @(Get-CimInstance Win32_VideoController -EA SilentlyContinue | ForEach-Object { [string]$_.Name + ' (' + [string]$_.DriverVersion + ')' })
Fakt 'grafik' $gpu
$rtx = Test-Path -LiteralPath (Join-Path $env:ProgramFiles 'NVIDIA Corporation\NVIDIA RTX Desktop Manager')
foreach ($b in @('HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
  if (@(Get-ChildItem -LiteralPath $b -EA SilentlyContinue | Where-Object { [string](Get-ItemProperty -LiteralPath $_.PSPath -Name DisplayName -EA SilentlyContinue).DisplayName -match '(?i)RTX Desktop Manager' }).Count) { $rtx = $true }
}
Fakt 'rtxDesktopManager' $rtx
Punkt 'Grafik' $(if ($rtx) { 'fehler' } else { 'ok' }) ($(if ($gpu.Count) { $gpu -join ', ' } else { 'unbekannt' }) + $(if ($rtx) { ' – NVIDIA RTX Desktop Manager installiert (macht Edge/Chrome weiß)' } else { '' }))
$eu = Get-Service -Name edgeupdate -EA SilentlyContinue
Fakt 'edgeUpdateStart' $(if ($eu) { [string]$eu.StartType } else { $null })
Punkt 'Edge-Updatedienst' $(if (-not $eu) { 'warn' } elseif ([string]$eu.StartType -eq 'Disabled') { 'warn' } else { 'ok' }) $(if ($eu) { [string]$eu.StartType } else { 'fehlt' })
`,
  },
]

export const THEMEN_BROWSER: DgOber[] = [
  {
    id: 'browser', titel: 'Browser & Webseiten', symbol: 'Globe',
    beschreibung: 'Seite lädt nicht, Zertifikatsfehler, Seite gesperrt, Browser langsam oder weiß, PDF/Downloads, Anmeldung in Webportalen',
    unter: [
      {
        id: 'web-laedt', titel: 'Webseite lädt nicht oder Zertifikatsfehler', beschreibung: '„Diese Seite ist nicht erreichbar“, „Ihre Verbindung ist nicht privat“, ERR_… im Browser',
        sonden: ['net', 'websys', 'web'],
        regeln: [
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']), befund: () => 'Der PC kommt nicht ins Internet (Microsoft 365 nicht erreichbar)', problem: 'netz-kein-internet-verbunden', schwere: 3 },
          { id: 'dns', wenn: f => nein(f['net.dnsOk']), befund: f => `Namen werden nicht aufgelöst (DNS: ${txt(f['net.dnsServer']) || 'keiner'})`, problem: 'browser-dns-fehler', schwere: 3 },
          { id: 'zscaler-proxy', wenn: f => ja(f['web.proxyLokal']) && f['net.zscalerDienst'] != null && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Browser nutzt den Zscaler-Proxy 127.0.0.1, aber Zscaler läuft nicht (${txt(f['net.zscalerDienst'])})`, problem: 'vpn-zscaler-proxy-127001-haengt', schwere: 3 },
          { id: 'zscaler-aus', wenn: f => ja(f['net.zscalerInstalliert']) && f['net.zscalerDienst'] != null && txt(f['net.zscalerDienst']) !== 'Running', befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])})`, problem: 'vpn-zscaler-symbol-fehlt', schwere: 2 },
          { id: 'zertifikat', wenn: f => ja(f['websys.zscalerRootFehlt']) || ja(f['websys.tlsKettenFehler']), befund: f => (ja(f['websys.zscalerRootFehlt']) ? 'Das Zscaler-Stammzertifikat fehlt – jede HTTPS-Seite meldet einen Zertifikatsfehler' : 'Windows vertraut den Zertifikaten von Testseiten nicht'), problem: 'browser-zertifikatsfehler-alle-seiten', schwere: 3 },
          { id: 'uhrzeit', wenn: f => Math.abs(num(f['websys.zeitAbweichungSek'])) >= 300, befund: f => `Uhrzeit weicht um ${zahl(f['websys.zeitAbweichungSek'])} Sekunden ab – Zertifikate gelten dann als ungültig`, problem: 'netz-zertifikatfehler-uhrzeit', schwere: 3 },
          { id: 'proxy-manuell', wenn: f => ja(f['web.proxyManuell']), befund: f => `Fester Proxy eingetragen: ${txt(f['web.proxyServer'])}`, problem: 'browser-proxy-fehler', schwere: 2 },
          { id: 'doh', wenn: f => txt(f['websys.dohModus']) === 'secure', befund: () => '„Sicheres DNS“ ist per Richtlinie erzwungen – interne Namen werden darüber nicht gefunden', problem: 'web-sicheres-dns-intern', schwere: 1 },
        ],
        ohneBefund: ['browser-webseite-laedt-nicht', 'browser-interne-seite-nicht-erreichbar', 'browser-zertifikatsfehler-eine-seite', 'web-veralteter-stand-cache'],
      },
      {
        id: 'web-gesperrt', titel: 'Webseite ist gesperrt', beschreibung: 'Statt der Seite kommt eine Sperrseite (Zscaler, „Ihre Organisation hat diese Website blockiert“) oder eine rote Warnung',
        sonden: ['net', 'websys'],
        fragen: [
          { id: 'zscalerSeite', text: 'Zeigt die Sperrseite das Zscaler-Logo?' },
          { id: 'organisation', text: 'Steht dort „Ihre Organisation hat diese Website blockiert“?' },
          { id: 'smartscreen', text: 'Kommt eine rote Warnung „als unsicher gemeldet“?' },
          { id: 'port', text: 'Steht in der Adresse eine Portnummer (z. B. :8443)?' },
        ],
        regeln: [
          { id: 'zscaler-seite', wenn: f => f['frage.zscalerSeite'] === 'ja', befund: f => `Zscaler sperrt die Seite${ja(f['websys.tlsZscaler']) ? ' (der Datenverkehr läuft nachweislich über Zscaler)' : ''}`, problem: 'browser-zscaler-sperrseite', schwere: 3 },
          { id: 'organisation', wenn: f => f['frage.organisation'] === 'ja', befund: f => `Edge-Richtlinie sperrt die Seite (${f['websys.urlBlocklist'] ?? 0} gesperrte Adresse(n) eingetragen)`, problem: 'web-seite-von-organisation-blockiert', schwere: 3 },
          { id: 'smartscreen', wenn: f => f['frage.smartscreen'] === 'ja', befund: () => 'Microsoft Defender SmartScreen stuft die Seite als unsicher ein', problem: 'browser-smartscreen-seite-unsicher', schwere: 3 },
          { id: 'port', wenn: f => f['frage.port'] === 'ja', befund: () => 'Seiten mit ungewöhnlichem Port werden von Zscaler oft nicht durchgelassen', problem: 'vpn-zscaler-ungewoehnlicher-port', schwere: 2 },
          { id: 'blockliste', wenn: f => num(f['websys.urlBlocklist']) > 0 && f['frage.zscalerSeite'] !== 'ja', befund: f => `In Edge sind ${f['websys.urlBlocklist']} Adresse(n) per Richtlinie gesperrt`, problem: 'web-seite-von-organisation-blockiert', schwere: 1 },
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']), befund: () => 'Der PC kommt gar nicht ins Internet – es ist keine Sperre, sondern keine Verbindung', problem: 'netz-kein-internet-verbunden', schwere: 2 },
        ],
        ohneBefund: ['browser-zscaler-sperrseite', 'vpn-zscaler-sperrseite', 'web-seite-von-organisation-blockiert', 'vpn-zscaler-warnseite-weiter'],
      },
      {
        id: 'web-langsam', titel: 'Browser ist langsam, stürzt ab oder bleibt weiß', beschreibung: 'Edge/Chrome hängt, Tabs stürzen ab („Hoppla“), Fenster bleibt weiß, Browser frisst Speicher',
        sonden: ['web', 'websys', 'sys'],
        regeln: [
          { id: 'rtx', wenn: f => ja(f['websys.rtxDesktopManager']), befund: () => 'NVIDIA RTX Desktop Manager ist installiert – er macht Edge und Chrome weiß bzw. bringt sie zum Absturz', problem: 'browser-weiss-rtx-desktop-manager', schwere: 3 },
          { id: 'edge-abstuerze', wenn: f => num(f['web.edgeAbstuerze7']) >= 3, befund: f => `Edge ist in 7 Tagen ${f['web.edgeAbstuerze7']}× abgestürzt bzw. hing`, problem: 'browser-edge-startet-nicht', schwere: 2 },
          { id: 'chrome-abstuerze', wenn: f => num(f['web.chromeAbstuerze7']) >= 3, befund: f => `Chrome ist in 7 Tagen ${f['web.chromeAbstuerze7']}× abgestürzt bzw. hing`, problem: 'web-chrome-langsam', schwere: 2 },
          { id: 'cache', wenn: f => num(f['web.cacheGB']) >= 2, befund: f => `Browser-Zwischenspeicher belegt ${zahl(f['web.cacheGB'])} GB`, problem: 'web-profil-belegt-viel-platz', schwere: 2 },
          { id: 'edge-ram', wenn: f => num(f['web.edgeRamMB']) >= 3000, befund: f => `Edge belegt gerade ${zahl(num(f['web.edgeRamMB']) / 1024)} GB Arbeitsspeicher (${f['web.edgeProzesse']} Prozesse)`, problem: 'browser-edge-langsam', schwere: 2 },
          { id: 'ram', wenn: f => num(f['sys.ramFreiProzent']) < 10, befund: f => `Arbeitsspeicher des PCs fast voll (${f['sys.ramFreiProzent']} % frei)`, problem: 'web-nicht-genuegend-arbeitsspeicher', schwere: 2 },
          { id: 'erweiterungen', wenn: f => num(f['web.edgeErweiterungen']) >= 15, befund: f => `${f['web.edgeErweiterungen']} Erweiterungen im Edge-Profil`, problem: 'browser-edge-langsam', schwere: 1 },
          { id: 'veraltet', wenn: f => num(f['web.edgeAlterTage']) >= 60, befund: f => `Edge wurde seit ${f['web.edgeAlterTage']} Tagen nicht aktualisiert (Version ${txt(f['web.edgeVersion'])})`, problem: 'browser-edge-update-fehler', schwere: 1 },
        ],
        ohneBefund: ['browser-edge-langsam', 'web-chrome-langsam', 'browser-edge-startet-nicht', 'web-tab-absturz-access-violation'],
      },
      {
        id: 'web-pdf', titel: 'PDF öffnet nicht oder Download klappt nicht', beschreibung: 'PDF wird nur heruntergeladen oder bleibt leer, Download wird blockiert oder bricht ab, Datei ist nicht im Download-Ordner',
        sonden: ['web', 'websys', 'sys'],
        regeln: [
          { id: 'c-voll', wenn: f => num(f['sys.cFreiGB']) < 1, befund: f => `Laufwerk C: hat nur ${zahl(f['sys.cFreiGB'])} GB frei`, problem: 'web-download-datentraeger-voll', schwere: 3 },
          { id: 'ordner-fehlt', wenn: f => ja(f['web.downloadOrdnerFehlt']), befund: f => `Download-Ordner existiert nicht: ${txt(f['web.downloadOrdner'])}`, problem: 'web-download-ordner-nicht-gefunden', schwere: 3 },
          { id: 'acrobat-fehlt', wenn: f => /acro/i.test(txt(f['web.pdfProgId'])) && nein(f['web.acrobat']), befund: f => `PDFs sind mit Acrobat verknüpft (${txt(f['web.pdfProgId'])}), Acrobat/Reader ist aber nicht installiert`, problem: 'browser-pdf-oeffnet-nicht', schwere: 3 },
          { id: 'restriktion', wenn: f => num(f['websys.downloadRestriktion']) > 0, befund: f => `Downloads sind per Edge-Richtlinie eingeschränkt (Stufe ${f['websys.downloadRestriktion']})`, problem: 'browser-download-blockiert', schwere: 2 },
          { id: 'onedrive', wenn: f => ja(f['web.downloadInOneDrive']), befund: f => `Downloads landen in OneDrive: ${txt(f['web.downloadOrdner'])}`, problem: 'web-downloads-landen-woanders', schwere: 1 },
          { id: 'fragt', wenn: f => ja(f['web.fragtWo']), befund: () => 'Edge fragt bei jedem Download nach dem Speicherort', problem: 'web-download-fragt-jedes-mal', schwere: 1 },
        ],
        ohneBefund: ['browser-pdf-oeffnet-nicht', 'browser-download-blockiert', 'browser-download-bricht-ab', 'web-pdf-fehler-beim-laden'],
      },
      {
        id: 'web-anmeldung', titel: 'Anmeldung in Webportalen klappt nicht', beschreibung: 'Microsoft 365, Intranet oder ServiceNow fragen ständig nach Kennwort, Anmeldung dreht sich im Kreis, falsches Konto',
        sonden: ['aad', 'websys', 'web', 'net'],
        regeln: [
          { id: 'kein-prt', wenn: f => nein(f['aad.prt']), befund: () => 'Das Windows-Anmeldetoken (PRT) fehlt – Microsoft-Seiten können nicht automatisch anmelden', problem: 'web-m365-fragt-jedes-mal-email', schwere: 3 },
          { id: 'kein-tgt', wenn: f => nein(f['aad.kerberosTgt']), befund: () => 'Kein Kerberos-Anmeldeticket – Intranetseiten fragen nach Kennwort', problem: 'browser-intranet-fragt-anmeldung', schwere: 3 },
          { id: 'uhrzeit', wenn: f => Math.abs(num(f['websys.zeitAbweichungSek'])) >= 300, befund: f => `Uhrzeit weicht um ${zahl(f['websys.zeitAbweichungSek'])} Sekunden ab – Anmeldungen werden abgelehnt`, problem: 'konto-zeitabweichung-kerberos', schwere: 3 },
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']), befund: () => 'login.microsoftonline.com ist nicht erreichbar', problem: 'netz-kein-internet-verbunden', schwere: 3 },
          { id: 'intranetzone', wenn: f => f['websys.intranetZonen'] != null && num(f['websys.intranetZonen']) === 0 && txt(f['websys.authAllowlist']) === '', befund: () => 'Keine Intranet-Adressen in der Intranetzone und keine Anmelde-Freigabeliste für Edge', problem: 'browser-intranet-fragt-anmeldung', schwere: 2 },
          { id: 'chrome-sso', wenn: f => /chrome/i.test(txt(f['web.standardBrowser'])) && nein(f['websys.chromeCloudAp']), befund: () => 'Standardbrowser ist Chrome, die Windows-Anmeldung (CloudAPAuthEnabled) ist dort aber nicht aktiv', problem: 'web-chrome-firefox-kein-sso', schwere: 2 },
          { id: 'falsches-konto', wenn: f => txt(f['web.edgeKonto']) !== '' && !/skf/i.test(txt(f['web.edgeKonto'])), befund: f => `Edge ist mit einem anderen Konto angemeldet: ${txt(f['web.edgeKonto'])}`, problem: 'web-m365-falsches-konto', schwere: 2 },
          { id: 'edge-ohne-konto', wenn: f => f['web.edgeKonto'] === '', befund: () => 'In Edge ist kein Firmenkonto angemeldet', problem: 'web-edge-anmeldung-geht-nicht', schwere: 1 },
        ],
        ohneBefund: ['browser-m365-anmeldeschleife', 'browser-intranet-fragt-anmeldung', 'web-m365-falsches-konto', 'web-servicenow-lokale-anmeldung'],
      },
      {
        id: 'web-einstellungen', titel: 'Pop-ups, Werbung, Standardbrowser oder verstellte Einstellungen', beschreibung: 'Links öffnen im falschen Browser, Werbung/Benachrichtigungen, Webanwendung öffnet kein Fenster, alles riesig oder winzig',
        sonden: ['web', 'websys'],
        fragen: [
          { id: 'falscherBrowser', text: 'Öffnen Links im falschen Browser?' },
          { id: 'werbung', text: 'Kommen unten rechts ständig Werbung oder Benachrichtigungen?' },
          { id: 'popup', text: 'Öffnet eine Webanwendung kein neues Fenster (Pop-up)?' },
        ],
        regeln: [
          { id: 'falscher-browser', wenn: f => f['frage.falscherBrowser'] === 'ja' && txt(f['web.standardBrowser']) !== '', befund: f => `Standardbrowser ist derzeit „${txt(f['web.standardBrowser'])}“`, problem: 'browser-standardbrowser-falsch', schwere: 3 },
          { id: 'werbung', wenn: f => f['frage.werbung'] === 'ja', befund: () => 'Eine Webseite darf Benachrichtigungen senden', problem: 'browser-benachrichtigungen-werbung', schwere: 3 },
          { id: 'fremd', wenn: f => liste(f['web.fremdBrowser']).length > 0, befund: f => `Unerwünschtes Programm installiert: ${txt(f['web.fremdBrowser'])}`, problem: 'web-fremder-browser-installiert', schwere: 3 },
          { id: 'popup', wenn: f => f['frage.popup'] === 'ja', befund: f => `Pop-up-Blocker greift (${f['websys.popupAusnahmen'] ?? 0} Ausnahme(n) per Richtlinie)`, problem: 'browser-popup-blocker-anwendung', schwere: 2 },
          { id: 'zoom', wenn: f => ja(f['web.zoomVerstellt']), befund: () => 'Der Standard-Zoom in Edge ist verstellt', problem: 'web-zoom-verstellt', schwere: 2 },
          { id: 'flags', wenn: f => ja(f['web.flagsGeaendert']), befund: () => 'Experimentelle Einstellungen (edge://flags) wurden verändert', problem: 'web-flags-zuruecksetzen', schwere: 2 },
          { id: 'absturz-ende', wenn: f => txt(f['web.edgeExitType']) === 'Crashed', befund: () => 'Edge wurde zuletzt nicht ordnungsgemäß beendet', problem: 'web-nicht-ordnungsgemaess-beendet', schwere: 1 },
          { id: 'richtlinien', wenn: f => num(f['websys.edgeRichtlinien']) > 0, befund: f => `${f['websys.edgeRichtlinien']} Edge-Einstellung(en) sind von der Firma vorgegeben`, problem: 'browser-von-organisation-verwaltet', schwere: 1 },
        ],
        ohneBefund: ['web-edge-einstellungen-verstellt', 'browser-von-organisation-verwaltet', 'browser-popup-blocker-anwendung', 'browser-standardbrowser-falsch'],
      },
    ],
  },
]
