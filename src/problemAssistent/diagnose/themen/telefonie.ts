// ── Diagnose-Thema „Telefonie & Smartphone“ ──────────────────────────────────
// Sonden: xe = Xelion in der Sitzung des Benutzers (Paket, Laufzeiten, läuft/hängt, Autostart, Benachrichtigungen,
//              Mikrofon-Freigabe, tel:-Links, Abstürze, Server-Erreichbarkeit, Modern Standby)
//         hy = Diensthandy am PC (Uhrzeit gegen Microsoft, Unternehmensportal/Intune, Smartphone-Link, Bluetooth, USB)
// Audio-Fakten kommen aus den Sonden au/aub (Thema Audio), Netz/Anmeldung aus net/aad/sys (gemeinsam). Alles NUR LESEND.
import { ja, liste, nein, num, txt, zahl } from '../motor'
import type { DgOber, DgSonde, DgWert } from '../types'

const laeuftNicht = (v: DgWert | undefined): boolean => v !== null && v !== undefined && txt(v) !== '' && txt(v) !== 'Running'

export const SONDEN_TELEFONIE: DgSonde[] = [
  {
    id: 'xe', titel: 'Xelion (Installation, läuft, Autostart, Benachrichtigungen, Mikrofon, Server)', modus: 'benutzer', timeoutMs: 90000,
    ps: String.raw`
function TcpXe([string]$ziel, [int]$port) { try { $tc = New-Object System.Net.Sockets.TcpClient; $ok = $tc.ConnectAsync($ziel, $port).Wait(3000) -and $tc.Connected; $tc.Close(); return [bool]$ok } catch { return $false } }
$pk = @(Get-AppxPackage -Name 'XelionWindowsDesktop' -EA SilentlyContinue | Sort-Object { [version]$_.Version } -Descending) | Select-Object -First 1
$kl = @()
foreach ($uk in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall', 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall') {
  $kl += @(Get-ChildItem -LiteralPath $uk -EA SilentlyContinue | ForEach-Object { [string](Get-ItemProperty -LiteralPath $_.PSPath -Name DisplayName -EA SilentlyContinue).DisplayName } | Where-Object { $_ -match '(?i)xelion' })
}
$inst = [bool]$pk -or $kl.Count -gt 0
Fakt 'installiert' $inst; Fakt 'version' $(if ($pk) { [string]$pk.Version } else { $null }); Fakt 'paketStatus' $(if ($pk) { [string]$pk.Status } else { $null })
Punkt 'Xelion installiert' $(if ($inst) { 'ok' } else { 'fehler' }) $(if ($pk) { 'Version ' + [string]$pk.Version + ' · Paketzustand ' + [string]$pk.Status } elseif ($kl.Count) { 'klassische Installation: ' + ($kl -join ', ') } else { 'für diesen Benutzer NICHT installiert' })
$mf = ''
if ($pk) { try { $mf = [IO.File]::ReadAllText((Join-Path $pk.InstallLocation 'AppxManifest.xml')) } catch {} }
$fehlt = @()
foreach ($m in [regex]::Matches($mf, '<PackageDependency\b[^>]*>')) {
  $dn = [regex]::Match($m.Value, '\bName="([^"]+)"').Groups[1].Value; $mv = [regex]::Match($m.Value, '\bMinVersion="([^"]+)"').Groups[1].Value
  if (-not $dn) { continue }
  $dep = @(Get-AppxPackage -Name $dn -EA SilentlyContinue | Sort-Object { [version]$_.Version } -Descending) | Select-Object -First 1
  $passt = $false; try { $passt = [bool]$dep -and (-not $mv -or ([version][string]$dep.Version -ge [version]$mv)) } catch {}
  if (-not $passt) { $fehlt += ($dn + $(if ($mv) { ' (mind. ' + $mv + ')' } else { '' }) + $(if ($dep) { ', vorhanden nur ' + [string]$dep.Version } else { ', fehlt' })) }
}
Fakt 'runtimeFehlt' @($fehlt)
if ($pk) { Punkt 'Laufzeiten (Windows App Runtime, VCLibs)' $(if ($fehlt.Count) { 'fehler' } else { 'ok' }) $(if ($fehlt.Count) { $fehlt -join ' · ' } else { 'alle vorhanden' }) }
$proc = @()
if ($pk) { $proc = @(Get-Process -EA SilentlyContinue | Where-Object { $_.Path -and $_.Path -like ($pk.InstallLocation + '\*') }) }
$proc += @(Get-Process -Name '*xelion*' -EA SilentlyContinue | Where-Object { @($proc | ForEach-Object { $_.Id }) -notcontains $_.Id })
$haengt = @($proc | Where-Object { $_.MainWindowHandle -ne 0 -and -not $_.Responding }).Count -gt 0
Fakt 'laeuft' ($proc.Count -gt 0); Fakt 'haengt' $haengt
$seit = ''; try { $seit = ' seit ' + (@($proc | Sort-Object StartTime) | Select-Object -First 1).StartTime.ToString('dd.MM. HH:mm') } catch {}
Punkt 'Xelion läuft' $(if ($haengt) { 'fehler' } elseif ($proc.Count) { 'ok' } elseif ($inst) { 'warn' } else { 'info' }) $(if ($proc.Count) { 'ja (' + $proc.Count + ' Prozess(e)' + $seit + ')' + $(if ($haengt) { ' – reagiert NICHT' } else { '' }) } else { 'nein' })
$tid = [regex]::Match($mf, '<(?:\w+:)?StartupTask\b[^>]*\bTaskId="([^"]+)"').Groups[1].Value
$tEn = [regex]::Match($mf, '<(?:\w+:)?StartupTask\b[^>]*\bEnabled="([^"]+)"').Groups[1].Value
$zst = $null
if ($pk -and $tid) { $zst = (Get-ItemProperty -LiteralPath ('HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData\' + $pk.PackageFamilyName + '\' + $tid) -Name State -EA SilentlyContinue).State }
$taskAn = $(if ($null -ne $zst) { [int]$zst -in 2, 4 } else { $tEn -eq 'true' })
$lnk = @(Get-ChildItem -LiteralPath ([Environment]::GetFolderPath('Startup')) -Filter '*xelion*' -File -EA SilentlyContinue)
$run = @(@((Get-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -EA SilentlyContinue).Property) | Where-Object { $_ -match '(?i)xelion' })
$autoAn = $taskAn -or $lnk.Count -gt 0 -or $run.Count -gt 0
$doppelt = ($taskAn -and ($lnk.Count + $run.Count) -gt 0) -or ($lnk.Count -gt 0 -and $run.Count -gt 0)
Fakt 'autostartAn' $(if ($inst) { $autoAn } else { $null }); Fakt 'autostartRichtlinie' ($null -ne $zst -and [int]$zst -eq 3); Fakt 'doppelterStart' $doppelt
$stTxt = switch ([string]$zst) { '' { 'Voreinstellung des Pakets (' + $(if ($tEn -eq 'true') { 'an' } else { 'aus' }) + ')' } '0' { 'aus' } '1' { 'vom Benutzer abgeschaltet' } '2' { 'an' } '3' { 'per Richtlinie aus' } '4' { 'per Richtlinie an' } default { 'Wert ' + $zst } }
if ($inst) { Punkt 'Autostart' $(if ($doppelt) { 'warn' } elseif ($autoAn) { 'ok' } else { 'warn' }) ($(if ($tid) { 'Startaufgabe: ' + $stTxt } else { 'keine Startaufgabe im Paket' }) + $(if ($lnk.Count) { ' · Verknüpfung im Autostart-Ordner' } else { '' }) + $(if ($run.Count) { ' · Run-Eintrag' } else { '' }) + $(if ($doppelt) { ' – startet DOPPELT' } elseif (-not $autoAn) { ' – startet NICHT automatisch' } else { '' })) }
$toast = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\PushNotifications' -Name ToastEnabled -EA SilentlyContinue).ToastEnabled
$xn = @(Get-ChildItem -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings' -EA SilentlyContinue | Where-Object { $_.PSChildName -match '(?i)xelion' })
$xAus = @($xn | Where-Object { (Get-ItemProperty -LiteralPath $_.PSPath -Name Enabled -EA SilentlyContinue).Enabled -eq 0 }).Count -gt 0
Fakt 'toastsAus' ($toast -eq 0); Fakt 'xelionToastsAus' $xAus
Punkt 'Windows-Benachrichtigungen (Anruffenster)' $(if ($toast -eq 0 -or $xAus) { 'fehler' } else { 'ok' }) $(if ($toast -eq 0) { 'allgemein AUSGESCHALTET' } elseif ($xAus) { 'für Xelion AUSGESCHALTET' } else { 'erlaubt' })
$cs = 'SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone'
$mg = [string](Get-ItemProperty -LiteralPath ('HKLM:\' + $cs) -Name Value -EA SilentlyContinue).Value
$mu = [string](Get-ItemProperty -LiteralPath ('HKCU:\' + $cs) -Name Value -EA SilentlyContinue).Value
$ma = ''; if ($pk) { $ma = [string](Get-ItemProperty -LiteralPath ('HKCU:\' + $cs + '\' + $pk.PackageFamilyName) -Name Value -EA SilentlyContinue).Value }
$gesp = 'Deny' -in @($mg, $mu, $ma)
Fakt 'mikroGesperrt' $gesp; Fakt 'mikroXelion' $(if ($ma) { $ma } else { $null })
Punkt 'Mikrofon-Freigabe' $(if ($gesp) { 'fehler' } else { 'ok' }) ('Gerät ' + $(if ($mg) { $mg } else { 'Standard' }) + ' · Benutzer ' + $(if ($mu) { $mu } else { 'Standard' }) + ' · Xelion ' + $(if ($ma) { $ma } else { 'noch nicht gefragt' }))
$tp = [string](Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\tel\UserChoice' -Name ProgId -EA SilentlyContinue).ProgId
$tz = $tp
if ($tp) { $aumid = [string](Get-ItemProperty -LiteralPath ('Registry::HKEY_CLASSES_ROOT\' + $tp + '\Application') -Name AppUserModelId -EA SilentlyContinue).AppUserModelId; if ($aumid) { $tz = $aumid } }
Fakt 'telZiel' $(if ($tz) { $tz } else { $null }); Fakt 'telTeams' ($tz -match '(?i)teams'); Fakt 'telXelion' ($tz -match '(?i)xelion')
Punkt 'Klick auf Telefonnummern (tel:)' $(if ($tz -match '(?i)xelion') { 'ok' } elseif ($tz) { 'warn' } else { 'info' }) $(if ($tz) { 'öffnet ' + $tz } else { 'keine Auswahl – Windows fragt bzw. nimmt das Standardprogramm' })
$ab = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Error', 'Application Hang'; StartTime = (Get-Date).AddDays(-7) } -MaxEvents 300 -EA SilentlyContinue | Where-Object { ((@($_.Properties | ForEach-Object { [string]$_.Value })) -join ' ') -match '(?i)xelion' }).Count
Fakt 'abstuerze7' $ab
if ($inst) { Punkt 'Abstürze / Hänger (7 Tage)' $(if ($ab -ge 2) { 'fehler' } elseif ($ab) { 'warn' } else { 'ok' }) ('' + $ab + ' Mal') }
$df = @(Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'Packages') -Directory -Filter 'XelionWindowsDesktop_*' -EA SilentlyContinue) | Select-Object -First 1
Fakt 'datenOrdner' ([bool]$df)
$hosts = New-Object System.Collections.Generic.List[string]
if ($df) {
  foreach ($dt in @(Get-ChildItem -LiteralPath $df.FullName -Recurse -File -Force -EA SilentlyContinue | Where-Object { $_.Length -lt 1MB -and $_.Extension -match '^\.(json|xml|ini|config|settings|txt)$' } | Select-Object -First 80)) {
    $roh = ''; try { $roh = [IO.File]::ReadAllText($dt.FullName) } catch {}
    foreach ($hm in [regex]::Matches($roh, '(?i)\b(?:https?|wss?)://([a-z0-9][a-z0-9.-]*\.[a-z]{2,})')) { $hn = $hm.Groups[1].Value.ToLower(); if ($hn -notmatch 'microsoft|windows|msftauth|live\.com|office|w3\.org|xmlsoap|schemas|digicert|verisign|globalsign|appinstaller|adaptivecards|github|google|gstatic|apple\.com|mozilla|cloudflare|jsdelivr|unpkg|sentry|example' -and -not $hosts.Contains($hn)) { $hosts.Add($hn) } }
  }
}
$srv = $null; $srvName = $null
if ($hosts.Count) { $srvName = [string](@(@($hosts | Where-Object { $_ -match 'xelion' }) + @($hosts)) | Select-Object -First 1); $srv = TcpXe $srvName 443 }
Fakt 'serverName' $srvName; Fakt 'serverErreichbar' $srv
if ($inst) {
  Punkt 'Xelion-Server' $(if ($null -eq $srv) { 'info' } elseif ($srv) { 'ok' } else { 'fehler' }) $(if ($null -eq $srv) { 'Adresse aus den App-Daten nicht lesbar' } elseif ($srv) { $srvName + ':443 erreichbar' } else { $srvName + ':443 NICHT erreichbar' })
  $upd = TcpXe 'appinstaller.xelion.com' 443
  Fakt 'updateServer' $upd
  Punkt 'Xelion-Updates (appinstaller.xelion.com)' $(if ($upd) { 'ok' } else { 'warn' }) $(if ($upd) { 'erreichbar' } else { 'NICHT erreichbar – Updates scheitern' })
}
$pc = [string](powercfg /a 2>$null | Out-String)
$verf = ($pc -split '(?im)^.*(not available|nicht verf).*$')[0]
$ms = $verf -match '\bS0\b'
Fakt 'modernStandby' $ms
Punkt 'Standby-Art' 'info' $(if ($ms) { 'Modern Standby (S0) – Netz kann im Standby getrennt werden' } else { 'klassischer Standby (S3)' })
`,
  },
  {
    id: 'hy', titel: 'Diensthandy am PC (Uhrzeit, Unternehmensportal, Smartphone-Link, Bluetooth, USB)', modus: 'benutzer', timeoutMs: 60000,
    ps: String.raw`
$abw = $null
try {
  $rq = [System.Net.WebRequest]::Create('https://login.microsoftonline.com/common/discovery/keys')
  $rq.Method = 'HEAD'; $rq.Timeout = 5000
  $rs = $null
  try { $rs = $rq.GetResponse() } catch [System.Net.WebException] { $rs = $_.Exception.Response }
  if ($rs) {
    $dh = [string]$rs.Headers['Date']; $rs.Close()
    if ($dh) { $sz = [datetime]::Parse($dh, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]'AdjustToUniversal, AssumeUniversal'); $abw = [math]::Round([math]::Abs(((Get-Date).ToUniversalTime() - $sz).TotalSeconds)) }
  }
} catch {}
Fakt 'zeitAbweichungSek' $abw
Punkt 'Uhrzeit (gegen Microsoft-Anmeldeserver)' $(if ($null -eq $abw) { 'info' } elseif ($abw -ge 60) { 'fehler' } elseif ($abw -ge 20) { 'warn' } else { 'ok' }) $(if ($null -eq $abw) { 'nicht prüfbar (Server nicht erreichbar)' } else { 'Abweichung ' + $abw + ' s' + $(if ($abw -ge 60) { ' – MFA-Codes und Anmeldung scheitern' } else { '' }) })
$wt = Get-Service -Name 'W32Time' -EA SilentlyContinue
Fakt 'zeitDienst' $(if ($wt) { [string]$wt.Status } else { $null })
$cp = @(Get-AppxPackage -Name 'Microsoft.CompanyPortal' -EA SilentlyContinue) | Select-Object -First 1
Fakt 'unternehmensportal' ([bool]$cp)
Punkt 'Unternehmensportal (Company Portal)' $(if ($cp) { 'ok' } else { 'warn' }) $(if ($cp) { 'installiert (' + [string]$cp.Version + ')' } else { 'NICHT installiert' })
$mdm = $null
$enr = @(Get-ChildItem -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Enrollments' -EA SilentlyContinue)
if ($enr.Count) { $mdm = @($enr | Where-Object { [string](Get-ItemProperty -LiteralPath $_.PSPath -Name ProviderID -EA SilentlyContinue).ProviderID -eq 'MS DM Server' }).Count -gt 0 }
$ime = Get-Service -Name 'IntuneManagementExtension' -EA SilentlyContinue
Fakt 'intuneVerwaltet' $mdm; Fakt 'imeDienst' $(if ($ime) { [string]$ime.Status } else { $null })
Punkt 'PC in Intune verwaltet' $(if ($mdm) { 'ok' } else { 'info' }) $(if ($null -eq $mdm) { 'nicht feststellbar' } elseif ($mdm) { 'ja' + $(if ($ime) { ' · Intune-Erweiterung ' + [string]$ime.Status } else { '' }) } else { 'nein' })
$yp = @(Get-AppxPackage -Name 'Microsoft.YourPhone' -EA SilentlyContinue) | Select-Object -First 1
$ypL = @(Get-Process -Name 'PhoneExperienceHost', 'YourPhone' -EA SilentlyContinue).Count -gt 0
$ypA = $false
if ($yp) { foreach ($k in @(Get-ChildItem -LiteralPath ('HKCU:\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData\' + $yp.PackageFamilyName) -EA SilentlyContinue)) { $sv = (Get-ItemProperty -LiteralPath $k.PSPath -Name State -EA SilentlyContinue).State; if ($null -ne $sv -and [int]$sv -in 2, 4) { $ypA = $true } } }
$ypV = (Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System' -Name EnableMmx -EA SilentlyContinue).EnableMmx -eq 0
Fakt 'smartphoneLink' ([bool]$yp); Fakt 'smartphoneLinkLaeuft' $ypL; Fakt 'smartphoneLinkAutostart' $ypA; Fakt 'smartphoneLinkVerboten' $ypV
Punkt 'Smartphone-Link' 'info' $(if ($ypV) { 'per Richtlinie abgeschaltet' } elseif (-not $yp) { 'nicht installiert' } else { 'installiert' + $(if ($ypL) { ', läuft' } else { ', läuft nicht' }) + $(if ($ypA) { ', startet mit Windows' } else { '' }) })
$bth = Get-Service -Name 'bthserv' -EA SilentlyContinue
$funk = @(Get-PnpDevice -PresentOnly -Class Bluetooth -EA SilentlyContinue | Where-Object { [string]$_.InstanceId -match '^(USB|PCI)\\' })
Fakt 'btDienst' $(if ($bth) { [string]$bth.Status } else { $null }); Fakt 'btAdapter' $funk.Count; Fakt 'btFehler' @($funk | Where-Object { [string]$_.Status -eq 'Error' }).Count
Punkt 'Bluetooth (Kopplung mit dem Handy)' $(if (-not $funk.Count) { 'info' } elseif ($bth -and $bth.Status -ne 'Running') { 'warn' } else { 'ok' }) $(if (-not $funk.Count) { 'kein Bluetooth-Adapter' } else { [string]$funk[0].FriendlyName + ' · Dienst ' + $(if ($bth) { [string]$bth.Status } else { 'fehlt' }) })
$wpd = @(Get-PnpDevice -PresentOnly -Class WPD -EA SilentlyContinue)
$wpdF = @($wpd | Where-Object { [string]$_.Status -eq 'Error' })
Fakt 'handyUsb' @($wpd | ForEach-Object { [string]$_.FriendlyName } | Select-Object -First 4); Fakt 'wpdFehler' $wpdF.Count
Punkt 'Handy per USB (MTP)' $(if ($wpdF.Count) { 'fehler' } else { 'info' }) $(if ($wpdF.Count) { 'mit Fehler: ' + ((@($wpdF | ForEach-Object { [string]$_.FriendlyName })) -join ', ') } elseif ($wpd.Count) { (@($wpd | ForEach-Object { [string]$_.FriendlyName } | Select-Object -First 3)) -join ', ' } else { 'kein Handy angeschlossen' })
$gb = (Get-ItemProperty -LiteralPath 'HKCU:\Software\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name EnableGoodbye -EA SilentlyContinue).EnableGoodbye -eq 1
Fakt 'dynSperre' $gb
Punkt 'Dynamische Sperre (sperrt beim Weggehen mit dem Handy)' 'info' $(if ($gb) { 'EIN' } else { 'aus' })
`,
  },
]

export const THEMEN_TELEFONIE: DgOber[] = [
  {
    id: 'telefonie', titel: 'Telefonie & Smartphone', symbol: 'Phone', beschreibung: 'Xelion startet nicht, klingelt nicht, keiner hört mich, Gespräche brechen ab, Rufumleitung, Diensthandy und Authenticator',
    unter: [
      {
        id: 'tel-start', titel: 'Xelion startet nicht, fehlt oder startet nicht automatisch', beschreibung: 'Klick auf Xelion passiert nichts, Fenster geht sofort wieder zu, Xelion ist nach dem Anmelden nicht da',
        sonden: ['xe', 'sys'],
        regeln: [
          { id: 'fehlt', wenn: f => nein(f['xe.installiert']), befund: () => 'Xelion ist für diesen Benutzer nicht installiert', problem: 'sonstiges-xelion-installieren', schwere: 3 },
          { id: 'runtime', wenn: f => liste(f['xe.runtimeFehlt']).length > 0, befund: f => `Für Xelion nötige Laufzeit fehlt: ${txt(f['xe.runtimeFehlt'])}`, problem: 'sonstiges-xelion-windows-app-runtime-fehlt', schwere: 3 },
          { id: 'paket', wenn: f => f['xe.paketStatus'] != null && txt(f['xe.paketStatus']) !== '' && txt(f['xe.paketStatus']) !== 'Ok', befund: f => `Xelion-Paket ist beschädigt (Zustand ${txt(f['xe.paketStatus'])})`, problem: 'sonstiges-xelion-startet-nicht', schwere: 3 },
          { id: 'abstuerze', wenn: f => num(f['xe.abstuerze7']) >= 2, befund: f => `Xelion ist in 7 Tagen ${f['xe.abstuerze7']}× abgestürzt bzw. hing`, problem: 'sonstiges-xelion-startet-nicht', schwere: 2 },
          { id: 'haengt', wenn: f => ja(f['xe.haengt']), befund: () => 'Xelion läuft, reagiert aber nicht (graues/leeres Fenster)', problem: 'sonstiges-xelion-grau-nach-update', schwere: 2 },
          { id: 'autostart', wenn: f => nein(f['xe.autostartAn']), befund: f => ja(f['xe.autostartRichtlinie']) ? 'Xelion-Autostart ist per Richtlinie abgeschaltet' : 'Xelion startet nicht automatisch mit Windows', problem: 'sonstiges-xelion-autostart', schwere: 2 },
          { id: 'doppelt', wenn: f => ja(f['xe.doppelterStart']), befund: () => 'Xelion ist doppelt im Autostart eingetragen', problem: 'sonstiges-xelion-startet-doppelt', schwere: 2 },
          { id: 'platz', wenn: f => num(f['sys.cFreiGB']) < 3, befund: f => `Laufwerk C: hat nur noch ${zahl(f['sys.cFreiGB'])} GB frei – Xelion-Updates scheitern`, problem: 'sonstiges-xelion-update-scheitert', schwere: 1 },
        ],
        ohneBefund: ['sonstiges-xelion-startet-nicht', 'sonstiges-xelion-installieren', 'sonstiges-xelion-autostart', 'sonstiges-xelion-fenster-weg'],
      },
      {
        id: 'tel-offline', titel: 'Xelion offline, Status grau oder Telefonbuch leer', beschreibung: '„Verbindung zum Server verloren“, Kollegen-Status grau, Telefonbuch oder Anrufliste leer, Zertifikatsfehler',
        sonden: ['xe', 'net', 'hy'],
        regeln: [
          { id: 'kein-internet', wenn: f => nein(f['net.internet443']), befund: () => 'Der PC kommt nicht ins Internet', problem: 'netz-kein-internet-verbunden', schwere: 3 },
          { id: 'server', wenn: f => nein(f['xe.serverErreichbar']), befund: f => `Xelion-Server ${txt(f['xe.serverName'])} ist nicht erreichbar`, problem: 'sonstiges-xelion-anmeldung', schwere: 3 },
          { id: 'zscaler', wenn: f => ja(f['net.zscalerInstalliert']) && laeuftNicht(f['net.zscalerDienst']), befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])})`, problem: 'sonstiges-xelion-anmeldung', schwere: 2 },
          { id: 'laeuft-nicht', wenn: f => ja(f['xe.installiert']) && nein(f['xe.laeuft']), befund: () => 'Xelion läuft gerade gar nicht', problem: 'sonstiges-xelion-startet-nicht', schwere: 2 },
          { id: 'haengt', wenn: f => ja(f['xe.haengt']), befund: () => 'Xelion reagiert nicht (hängt bei „Verbinden“)', problem: 'sonstiges-xelion-grau-nach-update', schwere: 2 },
          { id: 'uhrzeit', wenn: f => num(f['hy.zeitAbweichungSek']) >= 300, befund: f => `PC-Uhr weicht um ${f['hy.zeitAbweichungSek']} s ab – Zertifikate gelten dann als ungültig`, problem: 'sonstiges-xelion-zertifikatsfehler', schwere: 2 },
          { id: 'dns', wenn: f => nein(f['net.dnsOk']), befund: () => 'Namensauflösung (DNS) funktioniert nicht', problem: 'netz-kein-internet-verbunden', schwere: 2 },
          { id: 'update', wenn: f => nein(f['xe.updateServer']), befund: () => 'Xelion-Updateserver (appinstaller.xelion.com) ist nicht erreichbar', problem: 'sonstiges-xelion-update-scheitert', schwere: 1 },
        ],
        ohneBefund: ['sonstiges-xelion-anmeldung', 'sonstiges-xelion-status-falsch', 'sonstiges-xelion-kontakte-fehlen', 'sonstiges-xelion-kollegen-status-grau'],
      },
      {
        id: 'tel-anrufe', titel: 'Xelion klingelt nicht oder Anruffenster fehlt', beschreibung: 'Eingehende Anrufe kommen nicht an, kein Klingeln, kein Anruffenster, „Annehmen“ reagiert nicht, Klick auf Telefonnummer öffnet falsches Programm',
        sonden: ['xe', 'au', 'aub'],
        regeln: [
          { id: 'laeuft-nicht', wenn: f => ja(f['xe.installiert']) && nein(f['xe.laeuft']), befund: () => 'Xelion läuft gerade nicht – Anrufe können nicht klingeln', problem: 'sonstiges-xelion-klingelt-nicht', schwere: 3 },
          { id: 'toasts-xelion', wenn: f => ja(f['xe.xelionToastsAus']) || ja(f['xe.toastsAus']), befund: f => ja(f['xe.toastsAus']) ? 'Windows-Benachrichtigungen sind komplett ausgeschaltet' : 'Windows-Benachrichtigungen für Xelion sind ausgeschaltet', problem: 'sonstiges-xelion-anruf-popup-fehlt', schwere: 3 },
          { id: 'audiodienst', wenn: f => laeuftNicht(f['au.audiosrv']), befund: f => `Dienst „Windows-Audio“ läuft nicht (${txt(f['au.audiosrv'])})`, problem: 'audio-dienst-reagiert-nicht', schwere: 3 },
          { id: 'haengt', wenn: f => ja(f['xe.haengt']), befund: () => 'Xelion reagiert nicht', problem: 'sonstiges-xelion-annehmen-reagiert-nicht', schwere: 2 },
          { id: 'kein-ausgang', wenn: f => num(f['au.wiedergabeAktiv']) === 0, befund: () => 'Es gibt kein aktives Wiedergabegerät für den Klingelton', problem: 'audio-kein-ausgabegeraet', schwere: 2 },
          { id: 'stumm', wenn: f => ja(f['aub.standardWiedergabeStumm']), befund: f => `Standard-Wiedergabegerät ${txt(f['aub.standardWiedergabe'])} ist stummgeschaltet`, problem: 'audio-headset-stumm-geschaltet', schwere: 2 },
          { id: 'nur-headset', wenn: f => ja(f['aub.standardIstHeadset']), befund: f => `Ton (auch Klingeln) läuft nur über das Headset: ${txt(f['aub.standardWiedergabe'])}`, problem: 'audio-klingelton-nur-headset', schwere: 1 },
          { id: 'tel-teams', wenn: f => ja(f['xe.telTeams']), befund: () => 'Klick auf Telefonnummern öffnet Teams statt Xelion', problem: 'sonstiges-tel-links-falsches-programm', schwere: 1 },
        ],
        ohneBefund: ['sonstiges-xelion-klingelt-nicht', 'sonstiges-xelion-anruf-popup-fehlt', 'audio-jabra-engage-klingelt-nicht-pc', 'windows-anrufe-sperrbildschirm-unsichtbar'],
      },
      {
        id: 'tel-ton', titel: 'Im Gespräch: Gegenüber hört mich nicht / kein Ton / Headset fehlt in Xelion', beschreibung: 'Gesprächspartner hört nichts, ich höre nichts, Headset taucht in der Xelion-Audioauswahl nicht auf',
        sonden: ['xe', 'au', 'aub'],
        regeln: [
          { id: 'mikro-zugriff', wenn: f => ja(f['xe.mikroGesperrt']), befund: f => txt(f['xe.mikroXelion']) === 'Deny' ? 'Xelion darf nicht auf das Mikrofon zugreifen' : 'Mikrofonzugriff ist in Windows gesperrt', problem: 'sonstiges-xelion-mikrofon-zugriff', schwere: 3 },
          { id: 'mikro-stumm', wenn: f => ja(f['aub.standardAufnahmeStumm']) || ja(f['aub.kommAufnahmeStumm']) || num(f['aub.standardAufnahmePegel']) < 10, befund: f => `Mikrofon ${txt(f['aub.kommAufnahme']) || txt(f['aub.standardAufnahme'])} ist in Windows stumm bzw. auf ${f['aub.standardAufnahmePegel']} %`, problem: 'kamera-mikrofon-stumm-windows', schwere: 3 },
          { id: 'kein-mikro', wenn: f => num(f['au.aufnahmeAktiv']) === 0, befund: () => 'Windows hat kein einziges aktives Mikrofon', problem: 'kamera-kein-mikrofon-gefunden', schwere: 3 },
          { id: 'headset-aus', wenn: f => ja(f['au.headsetDeaktiviert']), befund: f => `Headset ist im Sound-Dialog deaktiviert: ${txt(f['au.headsetName'])}`, problem: 'audio-geraet-deaktiviert', schwere: 3 },
          { id: 'stereomix', wenn: f => ja(f['aub.kommAufnahmeStereomix']), befund: f => `Als Gesprächs-Mikrofon ist „${txt(f['aub.kommAufnahme'])}“ eingestellt`, problem: 'audio-stereomix-als-mikrofon', schwere: 3 },
          { id: 'audiodienst', wenn: f => laeuftNicht(f['au.audiosrv']), befund: f => `Dienst „Windows-Audio“ läuft nicht (${txt(f['au.audiosrv'])})`, problem: 'audio-dienst-reagiert-nicht', schwere: 3 },
          { id: 'kein-headset', wenn: f => nein(f['au.headsetAktiv']) && ja(f['au.headsetBekannt']), befund: () => 'Das Headset ist gerade nicht mit dem PC verbunden', problem: 'sonstiges-xelion-headset-nicht-auswaehlbar', schwere: 2 },
          { id: 'virtuell', wenn: f => ja(f['aub.kommAufnahmeVirtuell']), befund: f => `Als Gesprächs-Mikrofon ist ein virtuelles Gerät eingestellt: ${txt(f['aub.kommAufnahme'])}`, problem: 'kamera-virtuelles-mikrofon', schwere: 2 },
        ],
        ohneBefund: ['sonstiges-xelion-kein-ton', 'sonstiges-xelion-headset-nicht-auswaehlbar', 'sonstiges-xelion-ton-weg-nach-andocken', 'teams-xelion-headset-konflikt'],
      },
      {
        id: 'tel-qualitaet', titel: 'Gespräche brechen ab oder Ton ist abgehackt', beschreibung: 'Ton stockt, klingt roboterhaft oder blechern, Gespräche reißen ab',
        sonden: ['xe', 'net', 'aub', 'sys'],
        regeln: [
          { id: 'nur-wlan', wenn: f => ja(f['net.wlan']) && nein(f['net.lan']), befund: () => 'Der PC telefoniert über WLAN (kein Netzwerkkabel)', problem: 'sonstiges-xelion-gespraech-bricht-ab', schwere: 2 },
          { id: 'zscaler', wenn: f => ja(f['net.zscalerInstalliert']) && laeuftNicht(f['net.zscalerDienst']), befund: f => `Zscaler-Dienst läuft nicht (${txt(f['net.zscalerDienst'])})`, problem: 'sonstiges-xelion-anmeldung', schwere: 2 },
          { id: 'bluetooth', wenn: f => ja(f['aub.kommIstBluetooth']), befund: () => 'Gespräche laufen über das Bluetooth-Freisprechprofil (Telefonqualität, störanfällig)', problem: 'audio-bluetooth-blechern', schwere: 2 },
          { id: 'gateway', wenn: f => nein(f['net.gatewayPing']) && f['net.gateway'] != null && txt(f['net.gateway']) !== '', befund: f => `Router/Gateway ${txt(f['net.gateway'])} antwortet nicht auf Ping`, problem: 'sonstiges-xelion-gespraech-bricht-ab', schwere: 1 },
          { id: 'ram', wenn: f => num(f['sys.ramFreiProzent']) < 10, befund: f => `Arbeitsspeicher fast voll (${f['sys.ramFreiProzent']} % frei)`, problem: 'leistung-pc-sehr-langsam', schwere: 1 },
          { id: 'abstuerze', wenn: f => num(f['xe.abstuerze7']) >= 1, befund: f => `Xelion ist in 7 Tagen ${f['xe.abstuerze7']}× abgestürzt bzw. hing`, problem: 'sonstiges-xelion-startet-nicht', schwere: 1 },
        ],
        ohneBefund: ['sonstiges-xelion-gespraech-bricht-ab', 'wlan-teams-abbrueche', 'audio-knistern'],
      },
      {
        id: 'tel-umleitung', titel: 'Rufumleitung, Mailbox und Erreichbarkeit', beschreibung: 'Anrufe landen beim Kollegen oder auf der Mailbox, klingeln an einem anderen PC, gehen nach dem Zuklappen verloren',
        sonden: ['xe'],
        fragen: [
          { id: 'kollege', text: 'Landen Anrufe beim Kollegen oder auf der Mailbox, obwohl Sie da sind?' },
          { id: 'mailbox', text: 'Geht der Anruf schon nach wenigen Sekunden auf die Mailbox?' },
          { id: 'andererPc', text: 'Sind Sie noch an einem anderen PC bei Xelion angemeldet?' },
          { id: 'standby', text: 'Gehen Anrufe verloren, nachdem der Laptop zugeklappt bzw. im Standby war?' },
        ],
        regeln: [
          { id: 'laeuft-nicht', wenn: f => ja(f['xe.installiert']) && nein(f['xe.laeuft']), befund: () => 'Xelion läuft gerade nicht – Anrufe gehen auf Umleitung bzw. Mailbox', problem: 'sonstiges-xelion-klingelt-nicht', schwere: 2 },
          { id: 'umleitung', wenn: f => f['frage.kollege'] === 'ja' && f['frage.mailbox'] !== 'ja', befund: () => 'Anrufe werden umgeleitet, obwohl Sie erreichbar sind – Umleitung hängt', problem: 'sonstiges-xelion-rufumleitung-haengt', schwere: 3 },
          { id: 'mailbox', wenn: f => f['frage.mailbox'] === 'ja', befund: () => 'Die Mailbox nimmt zu schnell an', problem: 'sonstiges-xelion-mailbox-zu-schnell', schwere: 3 },
          { id: 'anderer-pc', wenn: f => f['frage.andererPc'] === 'ja', befund: () => 'Xelion ist zusätzlich an einem anderen PC angemeldet – dort klingelt es mit', problem: 'sonstiges-xelion-klingelt-am-anderen-pc', schwere: 3 },
          { id: 'standby', wenn: f => f['frage.standby'] === 'ja' && ja(f['xe.modernStandby']), befund: () => 'Der Laptop nutzt Modern Standby – das Netz wird im Standby getrennt, Xelion ist dann offline', problem: 'sonstiges-xelion-offline-nach-standby', schwere: 3 },
          { id: 'standby-s3', wenn: f => f['frage.standby'] === 'ja' && nein(f['xe.modernStandby']), befund: () => 'Im Standby ist der PC ganz offline – Xelion kann dann nicht klingeln', problem: 'sonstiges-xelion-offline-nach-standby', schwere: 2 },
          { id: 'fehlt', wenn: f => nein(f['xe.installiert']), befund: () => 'Xelion ist auf diesem PC nicht installiert', problem: 'sonstiges-xelion-installieren', schwere: 2 },
        ],
        ohneBefund: ['sonstiges-xelion-rufumleitung-einrichten', 'sonstiges-xelion-rufumleitung-haengt', 'sonstiges-xelion-gruppe-an-abmelden', 'sonstiges-xelion-gruppenanrufe-fehlen'],
      },
      {
        id: 'tel-handy', titel: 'Diensthandy, Authenticator und Unternehmensportal', beschreibung: 'MFA-Code wird abgelehnt, neues Diensthandy, Unternehmensportal fehlt, Smartphone-Link stört, Handy wird per USB/Bluetooth nicht erkannt',
        sonden: ['hy', 'aad'],
        fragen: [
          { id: 'neuesHandy', text: 'Haben Sie ein neues bzw. getauschtes Diensthandy bekommen?' },
          { id: 'pcKlingelt', text: 'Klingelt der PC mit, wenn das Handy angerufen wird?' },
        ],
        regeln: [
          { id: 'uhrzeit', wenn: f => num(f['hy.zeitAbweichungSek']) >= 60, befund: f => `PC-Uhr weicht um ${f['hy.zeitAbweichungSek']} s von der Microsoft-Zeit ab`, problem: 'mfa-code-falsch', schwere: 3 },
          { id: 'neues-handy', wenn: f => f['frage.neuesHandy'] === 'ja', befund: () => 'Neues Diensthandy – Authenticator, Outlook und Teams müssen umziehen', problem: 'mfa-everphone-tauschgeraet', schwere: 3 },
          { id: 'smartphone-link', wenn: f => f['frage.pcKlingelt'] === 'ja' && (ja(f['hy.smartphoneLinkLaeuft']) || ja(f['hy.smartphoneLinkAutostart'])), befund: () => 'Smartphone-Link ist mit dem Handy verbunden und läuft', problem: 'mfa-smartphone-link-anrufe-am-pc', schwere: 3 },
          { id: 'kein-prt', wenn: f => nein(f['aad.prt']), befund: () => 'Das Anmeldetoken (PRT) fehlt – der PC verlangt deshalb ständig MFA', problem: 'mfa-staendige-abfrage-am-pc', schwere: 2 },
          { id: 'bt-dienst', wenn: f => num(f['hy.btAdapter']) > 0 && laeuftNicht(f['hy.btDienst']), befund: f => `Bluetooth-Unterstützungsdienst läuft nicht (${txt(f['hy.btDienst'])})`, problem: 'mfa-bluetooth-kopplung-handy', schwere: 2 },
          { id: 'usb', wenn: f => num(f['hy.wpdFehler']) > 0, befund: f => `Angeschlossenes Handy mit Treiberfehler (${f['hy.wpdFehler']} Gerät(e))`, problem: 'mfa-handy-usb-nicht-erkannt', schwere: 2 },
          { id: 'portal', wenn: f => nein(f['hy.unternehmensportal']), befund: () => 'Unternehmensportal (Company Portal) ist auf dem PC nicht installiert', problem: 'update-unternehmensportal-fehlt', schwere: 1 },
          { id: 'sl-autostart', wenn: f => ja(f['hy.smartphoneLinkAutostart']) && f['frage.pcKlingelt'] !== 'ja', befund: () => 'Smartphone-Link startet bei jeder Anmeldung mit', problem: 'mfa-smartphone-link-autostart', schwere: 1 },
        ],
        ohneBefund: ['konto-mfa-authenticator', 'mfa-handy-nicht-konform', 'mfa-diensthandy-firmen-wlan', 'ol-diensthandy-keine-mails', 'mfa-everphone-tauschgeraet'],
      },
    ],
  },
]
