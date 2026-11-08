// ── Problem-Assistent: Lösungsbausteine Gruppe „teams“ (Runde 3) ──
// Regeln wie in ../aktionen.ts. Gemeinsame Bruchstücke: ./gemeinsam (OFFICE_C2R, DRUCKER_PS, OFFICE_APPS).
// Bereiche: Teams · Telefonie & Sonstiges (Xelion) · Smartphone & MFA.
// MSIX-Apps (neues Teams, Xelion) sind je Benutzer registriert — Autostart über die StartupTask
// des Pakets (Classes-Hive des Benutzers), Neu-Registrieren nur in der Sitzung des Benutzers.

import type { PaAktion } from '../motor'

const A = (a: PaAktion): PaAktion => a

/** MSIX-Paket (alle Benutzer) + App-ID/StartupTask aus dem Manifest; Pfad des StartupTask-Schlüssels im Profil. Nur lesend. */
const MSIX_PS = String.raw`
function AppPaket([string]$name) {
  $pk = $null; try { $pk = @(Get-AppxPackage -AllUsers -Name $name -EA Stop) | Sort-Object { [version]$_.Version } -Descending | Select-Object -First 1 } catch {}
  if (-not $pk) { return $null }
  $txt = ''; try { $txt = [IO.File]::ReadAllText((Join-Path $pk.InstallLocation 'AppxManifest.xml')) } catch {}
  [pscustomobject]@{ Pfn = [string]$pk.PackageFamilyName; Version = [string]$pk.Version; Ort = [string]$pk.InstallLocation; Paket = $pk
    App = (AppIdAus $txt)
    Task = [regex]::Match($txt, 'StartupTask\b[^>]*\bTaskId="([^"]+)"').Groups[1].Value }
}
function AppIdAus([string]$txt) {
  $alle = @([regex]::Matches($txt, '(?s)<Application\b[^>]*\bId="([^"]+)"(.*?)</Application>'))
  $gut = @($alle | Where-Object { $_.Groups[2].Value -notmatch 'AppListEntry="none"' })
  if ($gut.Count) { return $gut[0].Groups[1].Value }; if ($alle.Count) { return $alle[0].Groups[1].Value }; return ''
}
function StartTaskKey([string]$pfn, [string]$task) {
  $w = 'Registry::HKEY_USERS\' + $uSid + '_Classes'
  if (-not (Test-Path $w)) { $w = $uHive + '\Software\Classes' }
  $w + '\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\SystemAppData\' + $pfn + '\' + $task
}
function StTxt($v) { if ($null -eq $v) { return 'nicht gesetzt (Voreinstellung des Pakets)' }; switch ([int]$v) { 0 { 'aus' } 1 { 'vom Benutzer abgeschaltet' } 2 { 'an' } 3 { 'per Richtlinie aus' } 4 { 'per Richtlinie an' } default { 'Wert ' + $v } } }
`

export const AKTIONEN_TEAMS: PaAktion[] = [
  // ══ Teams: Diagnose ═════════════════════════════════════════════════════════
  A({ id: 'teams-tiefenpruefung', titel: 'Teams gründlich prüfen (Paket, WebView2, Add-in, Autostart, Abstürze)', modus: 'profil', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Alles rund um das neue Teams des angemeldeten Benutzers auf einen Blick: Paket und Registrierung, WebView2-Laufzeit, Reste des klassischen Teams, Autostart, Chat-App für Outlook, Besprechungs-Add-in, Benachrichtigungen, GPU-Schalter, Abstürze der letzten 7 Tage, Cache und freier Speicher.',
    ps: MSIX_PS + String.raw`
NeedUser
$a = AppPaket 'MSTeams'
if ($a) {
  $st = ''
  foreach ($ui in @($a.Paket.PackageUserInformation)) { $s = [string]$ui.UserSecurityId.Sid; if (-not $s) { $s = [string]$ui.UserSecurityId }; if ($uSid -and $s -match [regex]::Escape([string]$uSid)) { $st = [string]$ui.InstallState } }
  Zeile ('Neues Teams: ' + $a.Version + ' · für ' + $uDomUser + ': ' + $(if ($st) { $st } else { 'NICHT registriert (→ „App neu registrieren“)' }))
} else { Zeile 'Neues Teams: auf dem PC NICHT installiert' }
try { $prov = @(Get-AppxProvisionedPackage -Online -EA Stop | Where-Object { $_.DisplayName -eq 'MSTeams' }); Zeile ('Für neue Benutzer bereitgestellt: ' + (Ja ($prov.Count -gt 0))) } catch {}
$p = @(); try { $p = @(UserProcs @('ms-teams', 'Teams')) } catch {}; Zeile ('Läuft gerade: ' + (Ja ($p.Count -gt 0)) + $(if ($p.Count) { ' (' + ((@($p | ForEach-Object { $_.ProcessName }) | Select-Object -Unique) -join ', ') + ')' } else { '' }))
$wv = $null
foreach ($k in 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}') { $v = [string](Get-ItemProperty $k -EA SilentlyContinue).pv; if ($v -and $v -ne '0.0.0.0' -and -not $wv) { $wv = $v } }
if (-not $wv -and $uHive) { $v = [string](Get-ItemProperty ($uHive + '\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}') -EA SilentlyContinue).pv; if ($v -and $v -ne '0.0.0.0') { $wv = $v + ' (nur für den Benutzer)' } }
Zeile ('WebView2-Laufzeit: ' + $(if ($wv) { $wv } else { 'FEHLT — Teams bleibt dann weiß/leer (→ „Edge reparieren“)' }))
$alt = Join-Path $uLocal 'Microsoft\Teams\current\Teams.exe'
Zeile ('Klassisches Teams im Profil: ' + $(if (Test-Path -LiteralPath $alt) { 'noch vorhanden (sollte entfernt werden)' } else { 'nein' }) + ' · Machine-Wide Installer: ' + (Ja (Test-Path -LiteralPath 'C:\Program Files (x86)\Teams Installer\Teams.exe')))
if ($a -and $uSid) { $task = $a.Task; if (-not $task) { $task = 'TeamsTfwStartupTask' }; $k = StartTaskKey $a.Pfn $task; $sv = $null; if (Test-Path $k) { $sv = (Get-ItemProperty $k -EA SilentlyContinue).State }; Zeile ('Autostart (' + $task + '): ' + (StTxt $sv)) }
if ($uHive) {
  $im = $uHive + '\Software\IM Providers'
  $def = [string](Get-ItemProperty $im -EA SilentlyContinue).DefaultIMApp
  $sub = @(Get-ChildItem $im -EA SilentlyContinue | ForEach-Object { $_.PSChildName })
  Zeile ('Chat-App für Office (DefaultIMApp): ' + $(if ($def) { $def } else { 'nicht gesetzt' }) + ' · registriert: ' + $(if ($sub.Count) { $sub -join ', ' } else { 'keine' }))
  foreach ($w in @(@('HKLM', 'HKLM:\SOFTWARE\Microsoft\Office\Outlook\Addins\TeamsAddin.FastConnect'), @('HKLM 32-Bit', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\Outlook\Addins\TeamsAddin.FastConnect'), @('Benutzer', ($uHive + '\Software\Microsoft\Office\Outlook\Addins\TeamsAddin.FastConnect')))) {
    if (Test-Path $w[1]) { Zeile ('Besprechungs-Add-in (' + $w[0] + '): LoadBehavior ' + [string](Get-ItemProperty $w[1] -EA SilentlyContinue).LoadBehavior + ' (3 = wird geladen)') }
  }
  $dis = $uHive + '\Software\Microsoft\Office\16.0\Outlook\Resiliency\DisabledItems'
  if (Test-Path $dis) { $n = @((Get-Item $dis).GetValueNames()).Count; if ($n) { Zeile ('Von Outlook abgeschaltete Add-ins: ' + $n + ' Eintrag/Einträge (→ „Add-ins wieder einschalten“)') } }
  foreach ($k in @(Get-ChildItem ($uHive + '\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings') -EA SilentlyContinue | Where-Object { $_.PSChildName -match 'MSTeams' })) { $q = Get-ItemProperty $k.PSPath -EA SilentlyContinue; if ($q.Enabled -eq 0) { Zeile ('Windows-Benachrichtigungen für Teams: AUS (' + $k.PSChildName + ')') } }
  $g = $uHive + '\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
  if (Test-Path $g) { $q = Get-ItemProperty $g -EA SilentlyContinue; foreach ($n in 'MSTeams_8wekyb3d8bbwe!MSTeams', 'ms-teams.exe') { if ($q.$n) { Zeile ('WebView2-Schalter für Teams (' + $n + '): ' + $q.$n) } } }
}
$ai = @()
foreach ($d in (Join-Path $uLocal 'Microsoft\TeamsMeetingAdd-in'), 'C:\Program Files (x86)\Microsoft\TeamsMeetingAddin', 'C:\Program Files (x86)\Microsoft\TeamsMeetingAdd-in') { foreach ($x in @(Get-ChildItem -LiteralPath $d -Directory -EA SilentlyContinue)) { $ai += $x.Name } }
Zeile ('Besprechungs-Add-in installiert: ' + $(if ($ai.Count) { ($ai | Select-Object -Unique) -join ', ' } else { 'keine Version gefunden' }))
$seit = (Get-Date).AddDays(-7)
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Error', 'Application Hang'; StartTime = $seit } -MaxEvents 400 -EA SilentlyContinue | Where-Object { [string]$_.Properties[0].Value -match '^(ms-teams|msedgewebview2)\.exe$' })
Zeile ('Abstürze/Hänger in 7 Tagen (ms-teams/WebView2): ' + $ev.Count + $(if ($ev.Count) { ' · zuletzt ' + $ev[0].TimeCreated.ToString('dd.MM. HH:mm') } else { '' }))
$base = Join-Path $uLocal 'Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams'
Zeile ('Cache: ' + (Groesse (OrdnerGroesse $base)) + ' · Protokolle: ' + (Groesse (OrdnerGroesse (Join-Path $base 'Logs'))))
$c = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -EA SilentlyContinue
if ($c) { Zeile ('Laufwerk C: frei ' + (Groesse $c.FreeSpace) + $(if ([double]$c.FreeSpace -lt 5GB) { ' — KNAPP, Teams braucht Platz für Cache und Updates' } else { '' })) }
$z = Get-Service -Name 'ZSAService' -EA SilentlyContinue; if ($z) { Zeile ('Zscaler-Dienst: ' + $z.Status) }` }),
  A({ id: 'teams-medien-test', titel: 'Teams-Medienverbindung testen (UDP 3478–3481, TCP 443)', modus: 'system', risiko: 'lesen', timeoutMs: 90000,
    beschreibung: 'Prüft, ob Ton und Video von Teams den direkten Weg über UDP 3478–3481 zu den Teams-Relays nehmen können (STUN-Anfrage) oder auf TCP 443 ausweichen müssen (abgehackter Ton, Standbilder). Dazu Namensauflösung, TCP 443 und welche Netzwerkkarte benutzt wird. Ändert nichts.',
    ps: String.raw`
$relay = 'worldaz.tr.teams.microsoft.com'
$ips = @(); try { $ips = @([System.Net.Dns]::GetHostAddresses($relay) | Where-Object { $_.AddressFamily -eq 'InterNetwork' }) } catch {}
Zeile ('Namensauflösung ' + $relay + ': ' + $(if ($ips.Count) { ($ips | ForEach-Object { $_.IPAddressToString }) -join ', ' } else { 'FEHLGESCHLAGEN (DNS)' }))
function Stun([string]$ip, [int]$port, [int]$art) {
  $u = New-Object System.Net.Sockets.UdpClient
  try {
    $u.Client.ReceiveTimeout = 2000
    $u.Connect($ip, $port)
    $tid = New-Object byte[] 12; (New-Object System.Random).NextBytes($tid)
    if ($art -eq 1) { $m = [byte[]]((0x00, 0x01, 0x00, 0x00, 0x21, 0x12, 0xA4, 0x42) + $tid) } else { $m = [byte[]]((0x00, 0x03, 0x00, 0x08, 0x21, 0x12, 0xA4, 0x42) + $tid + (0x00, 0x19, 0x00, 0x04, 0x11, 0x00, 0x00, 0x00)) }
    [void]$u.Send($m, $m.Length)
    $ep = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
    $r = $u.Receive([ref]$ep)
    return [pscustomobject]@{ Ok = $true; Typ = ('0x{0:X2}{1:X2}' -f $r[0], $r[1]); Lokal = [string]$u.Client.LocalEndPoint }
  } catch { $l = ''; try { $l = [string]$u.Client.LocalEndPoint } catch {}; return [pscustomobject]@{ Ok = $false; Typ = ''; Lokal = $l } } finally { $u.Close() }
}
$lokal = ''; $udpOk = 0
if ($ips.Count) {
  foreach ($port in 3478, 3479, 3480, 3481) {
    $r = Stun $ips[0].IPAddressToString $port 1
    if (-not $r.Ok) { $r = Stun $ips[0].IPAddressToString $port 3 }
    if ($r.Lokal) { $lokal = $r.Lokal }
    if ($r.Ok) { $udpOk++ }
    Zeile ('UDP ' + $port + ': ' + $(if ($r.Ok) { 'Antwort erhalten (' + $r.Typ + ') — direkter Medienweg möglich' } else { 'keine Antwort' }))
    if ($r.Ok) { Zeile '  (3479–3481 für Ton/Video/Freigabe laufen über dieselbe Freigabe — nicht weiter getestet)'; break }
  }
}
foreach ($h in $relay, 'teams.microsoft.com', 'api.flightproxy.teams.microsoft.com') {
  $ok = $false; $t = New-Object System.Net.Sockets.TcpClient
  try { $ok = $t.ConnectAsync($h, 443).Wait(3000) -and $t.Connected } catch {} finally { $t.Close() }
  Zeile ('TCP 443 ' + $h + ': ' + $(if ($ok) { 'erreichbar' } else { 'NICHT erreichbar' }))
}
if ($lokal) {
  $lip = ($lokal -split ':')[0]
  $ifa = [string](Get-NetIPAddress -IPAddress $lip -EA SilentlyContinue | Select-Object -First 1).InterfaceAlias
  Zeile ('Benutzte Netzwerkkarte: ' + $(if ($ifa) { $ifa } else { '?' }) + ' (' + $lip + ')' + $(if ($ifa -match 'Zscaler') { ' — Medien laufen durch den Zscaler-Tunnel' } else { '' }))
}
if ($ips.Count -and -not $udpOk) { Zeile 'Ergebnis: UDP zu Teams kommt nicht durch (Firewall/Zscaler/Heimrouter) — Teams weicht auf TCP 443 aus: Ton abgehackt, Video ruckelt. Netzwerk/Zscaler-Freigabe für Teams-Medien prüfen lassen.' }
elseif ($udpOk) { Zeile 'Ergebnis: UDP-Medienweg zu Teams ist offen.' }` }),

  // ══ Teams: Beheben ══════════════════════════════════════════════════════════
  A({ id: 'app-paket-neu-registrieren', titel: 'App-Paket (MSIX) für den Benutzer neu registrieren', modus: 'benutzer', risiko: 'aendern', timeoutMs: 180000,
    beschreibung: 'Registriert das neue Teams, Xelion, Smartphone-Link oder das Unternehmensportal in der Sitzung des Benutzers neu (wie eine Reparatur: Startmenü-Eintrag fehlt, „App kann nicht geöffnet werden“, 0x80073CF9/0x80073D02). Die App wird dafür beendet; Daten und Anmeldung bleiben.',
    param: { label: 'Welche App', platzhalter: 'Neues Teams', pflicht: true, optionen: ['Neues Teams', 'Xelion', 'Smartphone-Link', 'Unternehmensportal'] },
    ps: String.raw`
$wahl = $P.Trim()
$name = switch -Regex ($wahl) { '^neues teams$' { 'MSTeams'; break } '^xelion$' { 'XelionWindowsDesktop'; break } '^smartphone-link$' { 'Microsoft.YourPhone'; break } '^unternehmensportal$' { 'Microsoft.CompanyPortal'; break } default { throw ('Unbekannte App: ' + $wahl) } }
$pfn = @{ 'MSTeams' = 'MSTeams_8wekyb3d8bbwe'; 'Microsoft.YourPhone' = 'Microsoft.YourPhone_8wekyb3d8bbwe'; 'Microsoft.CompanyPortal' = 'Microsoft.CompanyPortal_8wekyb3d8bbwe' }[$name]
$vor = Get-AppxPackage -Name $name -EA SilentlyContinue | Sort-Object { [version]$_.Version } -Descending | Select-Object -First 1
Zeile ('Vorher: ' + $(if ($vor) { $name + ' ' + $vor.Version + ' · Zustand ' + $vor.Status } else { $name + ' ist für diesen Benutzer nicht registriert' }))
if ($vor) {
  $lauf = @(Get-Process -EA SilentlyContinue | Where-Object { $_.Path -and $_.Path -like ($vor.InstallLocation + '\*') })
  foreach ($x in $lauf) { try { Stop-Process -Id $x.Id -Force -EA Stop } catch {} }
  if ($lauf.Count) { Zeile ('Beendet: ' + $lauf.Count + ' Prozess(e) der App'); Start-Sleep -Seconds 3 }
  Add-AppxPackage -DisableDevelopmentMode -Register (Join-Path $vor.InstallLocation 'AppxManifest.xml') -EA Stop
} elseif ($pfn) {
  Add-AppxPackage -RegisterByFamilyName -MainPackage $pfn -EA Stop
} else { throw 'Xelion ist für diesen Benutzer nicht vorhanden — über Software-Installationen → Xelion neu einrichten.' }
$nach = Get-AppxPackage -Name $name -EA SilentlyContinue | Sort-Object { [version]$_.Version } -Descending | Select-Object -First 1
Zeile ('Jetzt: ' + $(if ($nach) { $name + ' ' + $nach.Version + ' · Zustand ' + $nach.Status + ' — neu registriert' } else { 'weiterhin nicht registriert (Paket fehlt auf dem PC → neu installieren)' }))` }),
  A({ id: 'teams-autostart-an', titel: 'Teams-Autostart einschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Schaltet den Autostart des neuen Teams für den angemeldeten Benutzer ein (Startaufgabe des Pakets, wie der Schalter in Teams bzw. unter Einstellungen → Apps → Autostart). Wirkt ab der nächsten Anmeldung.',
    ps: MSIX_PS + String.raw`
NeedHive
if (-not $uSid) { throw 'SID des Benutzers unbekannt.' }
$a = AppPaket 'MSTeams'
if (-not $a) { throw 'Neues Teams ist auf diesem PC nicht installiert.' }
$task = $a.Task; if (-not $task) { $task = 'TeamsTfwStartupTask' }
$k = StartTaskKey $a.Pfn $task
$alt = $null; if (Test-Path $k) { $alt = (Get-ItemProperty $k -EA SilentlyContinue).State }
if ($alt -eq 3) { Zeile 'Autostart ist per Richtlinie abgeschaltet (Zustand 3) — das regelt die Gruppenrichtlinie/Intune, das Tool ändert es nicht.' } else {
  if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
  Set-ItemProperty -Path $k -Name State -Value 2 -Type DWord
  Zeile ('Teams-Autostart (' + $task + '): vorher ' + (StTxt $alt) + ' → jetzt an. Wirkt ab der nächsten Anmeldung.')
}
foreach ($pk in 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\System', 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Appx') { $q = Get-ItemProperty $pk -EA SilentlyContinue; foreach ($n in 'SupportFullTrustStartupTasks', 'SupportUwpStartupTasks') { if ($null -ne $q.$n -and $q.$n -eq 0) { Zeile ('Achtung: Richtlinie ' + $n + ' = 0 verhindert Autostart von Store-Apps (Gruppenrichtlinie).') } } }` }),
  A({ id: 'teams-als-chat-app', titel: 'Teams als Chat-App für Outlook/Office eintragen (Präsenz)', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Trägt das (neue) Teams als Chat- und Präsenz-Anbieter für Office ein (DefaultIMApp) — dann zeigt Outlook wieder den Status (grün/rot) und „Chat“/„Anrufen“ in der Kontaktkarte. Outlook danach neu starten; Teams muss laufen.',
    ps: String.raw`
NeedHive
$k = $uHive + '\Software\IM Providers'
$alt = [string](Get-ItemProperty $k -EA SilentlyContinue).DefaultIMApp
$sub = @(Get-ChildItem $k -EA SilentlyContinue | ForEach-Object { $_.PSChildName })
$ziel = $null
if ($sub -contains 'MsTeams') { $ziel = 'MsTeams' } elseif ($sub -contains 'Teams') { $ziel = 'Teams' }
if (-not $ziel) { throw 'Teams hat sich in diesem Profil noch nicht als Chat-App angemeldet — Teams einmal starten und unter Einstellungen → Allgemein „Teams als Chat-App für Microsoft 365 registrieren“ einschalten.' }
Set-ItemProperty -Path $k -Name DefaultIMApp -Value $ziel -Type String
Zeile ('Chat-App für Office: vorher ' + $(if ($alt) { $alt } else { 'nicht gesetzt' }) + ' → jetzt ' + $ziel + $(if ($alt -and $alt -ne $ziel) { ' (ein anderes Programm hatte sich eingetragen)' } else { '' }))
$up = (Get-ItemProperty ($k + '\' + $ziel) -EA SilentlyContinue).UpAndRunning
if ($null -ne $up) { Zeile ('Teams meldet sich als „läuft“: ' + $(if ($up -eq 2) { 'ja' } else { 'nein (Teams starten)' })) }
$tlb = @(Get-ChildItem -LiteralPath (Join-Path $uLocal 'Microsoft\TeamsPresenceAddin') -Filter '*.tlb' -EA SilentlyContinue)
Zeile ('Präsenz-Baustein (TeamsPresenceAddin): ' + $(if ($tlb.Count) { 'vorhanden' } else { 'fehlt — wird beim nächsten Teams-Start angelegt' }))
Zeile 'Outlook neu starten. In Outlook unter Datei → Optionen → Personen muss „Onlinestatus neben dem Namen anzeigen“ angehakt sein.'` }),
  A({ id: 'teams-gpu-beschleunigung', titel: 'GPU-Beschleunigung für Teams ab- oder wieder einschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Schaltet die Grafikbeschleunigung nur für das neue Teams ab (lokaler WebView2-Schalter --disable-gpu für ms-teams.exe) — gegen Flackern, schwarze Flächen, schwarze Bildschirmfreigabe und GPU-Abstürze nach Treiberupdates. Mit „Wieder einschalten“ rückgängig. Wirkt nach dem Neustart von Teams.',
    param: { label: 'Schalten', platzhalter: 'Abschalten', pflicht: true, optionen: ['Abschalten', 'Wieder einschalten'] },
    ps: String.raw`
NeedHive
$wahl = $P.Trim()
if ($wahl -notin 'Abschalten', 'Wieder einschalten') { throw ('Unbekannte Auswahl: ' + $wahl) }
$k = $uHive + '\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
foreach ($n in 'MSTeams_8wekyb3d8bbwe!MSTeams', 'ms-teams.exe') {
  $alt = ''; if (Test-Path $k) { $alt = [string](Get-ItemProperty $k -EA SilentlyContinue).$n }
  if ($wahl -eq 'Abschalten') {
    if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
    $neu = $alt
    if ($alt -notmatch '(^|\s)--disable-gpu(\s|$)') { $neu = ($alt + ' --disable-gpu').Trim() }
    Set-ItemProperty -Path $k -Name $n -Value $neu -Type String
  } else {
    $neu = ($alt -replace '(^|\s)--disable-gpu(?=\s|$)', ' ').Trim()
    if ($alt -and -not $neu) { Remove-ItemProperty -Path $k -Name $n -EA SilentlyContinue } elseif ($alt -ne $neu) { Set-ItemProperty -Path $k -Name $n -Value $neu -Type String }
  }
  Zeile ($n + ': vorher „' + $(if ($alt) { $alt } else { '—' }) + '“ → jetzt „' + $(if ($neu) { $neu } else { '—' }) + '“')
}
$hk = Get-ItemProperty 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments' -EA SilentlyContinue
if ($hk) { Zeile 'Hinweis: Für den ganzen PC sind ebenfalls WebView2-Schalter gesetzt (HKLM) — die gelten zusätzlich.' }
Zeile ('GPU-Beschleunigung für Teams: ' + $(if ($wahl -eq 'Abschalten') { 'AUS' } else { 'wieder AN' }) + '. Wirkt nach dem Neustart von Teams (Teams beenden → Teams starten).')` }),
  A({ id: 'app-benachrichtigung-zulassen', titel: 'Windows-Benachrichtigungen für Teams/Xelion/Outlook zulassen', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Schaltet die Windows-Benachrichtigungen (Banner, Mitteilungscenter, Ton) für die gewählte App wieder ein, wenn sie dort abgeschaltet wurden — sowie die allgemeinen Schalter „Benachrichtigungen“ und „Ton abspielen“. Mit „Alle gesperrten Apps“ werden alle abgeschalteten Apps wieder erlaubt.',
    param: { label: 'Für welche App', platzhalter: 'Teams', pflicht: true, optionen: ['Teams', 'Xelion', 'Outlook', 'Alle gesperrten Apps'] },
    ps: String.raw`
NeedHive
$wahl = $P.Trim()
$muster = switch -Regex ($wahl) { '^teams$' { 'MSTeams|Teams'; break } '^xelion$' { 'Xelion'; break } '^outlook$' { 'OUTLOOK'; break } '^alle gesperrten apps$' { '.'; break } default { throw ('Unbekannte Auswahl: ' + $wahl) } }
$pn = $uHive + '\Software\Microsoft\Windows\CurrentVersion\PushNotifications'
if ((Get-ItemProperty $pn -EA SilentlyContinue).ToastEnabled -eq 0) { Set-ItemProperty -Path $pn -Name ToastEnabled -Value 1 -Type DWord; Zeile 'Windows-Benachrichtigungen allgemein: waren AUS → jetzt an' }
$basis = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Notifications\Settings'
$g = Get-ItemProperty $basis -EA SilentlyContinue
foreach ($n in 'NOC_GLOBAL_SETTING_TOASTS_ENABLED', 'NOC_GLOBAL_SETTING_ALLOW_NOTIFICATION_SOUND') { if ($g -and $null -ne $g.$n -and $g.$n -eq 0) { Set-ItemProperty -Path $basis -Name $n -Value 1 -Type DWord; Zeile ('Windows allgemein: ' + $(if ($n -match 'SOUND') { 'Ton bei Benachrichtigungen' } else { 'Benachrichtigungen' }) + ' war aus → jetzt an') } }
$keys = @(Get-ChildItem $basis -EA SilentlyContinue | Where-Object { $_.PSChildName -match $muster })
$n = 0
foreach ($k in $keys) {
  $q = Get-ItemProperty $k.PSPath -EA SilentlyContinue
  $aend = @()
  if ($null -ne $q.Enabled -and $q.Enabled -eq 0) { Set-ItemProperty -Path $k.PSPath -Name Enabled -Value 1 -Type DWord; $aend += 'Benachrichtigungen aus → an' }
  if ($null -ne $q.ShowInActionCenter -and $q.ShowInActionCenter -eq 0) { Set-ItemProperty -Path $k.PSPath -Name ShowInActionCenter -Value 1 -Type DWord; $aend += 'Mitteilungscenter aus → an' }
  if ($aend.Count) { $n++; Zeile ($k.PSChildName + ': ' + ($aend -join ', ')) } elseif ($wahl -ne 'Alle gesperrten Apps') { Zeile ($k.PSChildName + ': war bereits erlaubt') }
}
if (-not $keys.Count) { Zeile ('Für „' + $wahl + '“ gibt es keine eigene Einstellung — es gilt der Windows-Standard (erlaubt).') }
if ($wahl -eq 'Alle gesperrten Apps') { Zeile ('' + $n + ' App(s) wieder erlaubt.') }
Zeile '„Nicht stören“ (Glocke unten rechts bzw. Windows+N) schaltet der Benutzer selbst ab; in Teams zusätzlich den Status „Nicht stören“ prüfen.'` }),
  A({ id: 'teams-addin-neu-installieren', titel: 'Teams-Besprechungs-Add-in für Outlook neu installieren', modus: 'system', risiko: 'aendern', timeoutMs: 240000,
    beschreibung: 'Installiert das „Microsoft Teams Meeting Add-in“ aus dem Paket des neuen Teams für alle Benutzer neu (msiexec, still). Behebt den fehlenden oder wirkungslosen Knopf „Teams-Besprechung“, wenn das Einschalten allein nicht hilft. Outlook danach neu starten.',
    ps: String.raw`
$pk = @(Get-AppxPackage -AllUsers -Name MSTeams -EA SilentlyContinue) | Sort-Object { [version]$_.Version } -Descending | Select-Object -First 1
if (-not $pk) { throw 'Neues Teams ist auf diesem PC nicht installiert — zuerst Teams installieren.' }
$msi = Join-Path $pk.InstallLocation 'MicrosoftTeamsMeetingAddinInstaller.msi'
if (-not (Test-Path -LiteralPath $msi)) { throw ('Add-in-Installer fehlt im Teams-Paket ' + $pk.Version + ' — Teams aktualisieren.') }
$ver = ''
try { $ver = [string](Get-AppLockerFileInformation -Path $msi -EA Stop).Publisher.BinaryVersion } catch {}
if ($ver -notmatch '^\d+(\.\d+){1,3}$') {
  try {
    $wi = New-Object -ComObject WindowsInstaller.Installer
    $db = $wi.GetType().InvokeMember('OpenDatabase', 'InvokeMethod', $null, $wi, @($msi, 0))
    $vw = $db.GetType().InvokeMember('OpenView', 'InvokeMethod', $null, $db, @("SELECT Value FROM Property WHERE Property='ProductVersion'"))
    [void]$vw.GetType().InvokeMember('Execute', 'InvokeMethod', $null, $vw, $null)
    $rec = $vw.GetType().InvokeMember('Fetch', 'InvokeMethod', $null, $vw, $null)
    $ver = [string]$rec.GetType().InvokeMember('StringData', 'GetProperty', $null, $rec, 1)
    [void]$vw.GetType().InvokeMember('Close', 'InvokeMethod', $null, $vw, $null)
  } catch {}
}
if ($ver -notmatch '^\d+(\.\d+){1,3}$') { throw 'Version des Add-in-Installers nicht lesbar.' }
function AddinStand { @(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { [string]$_.DisplayName -like 'Microsoft Teams Meeting Add-in*' } | ForEach-Object { [string]$_.DisplayVersion }) }
$vor = AddinStand
Zeile ('Vorher (für alle Benutzer): ' + $(if ($vor.Count) { $vor -join ', ' } else { 'nicht installiert' }) + ' · Installer im Teams-Paket: ' + $ver)
if (-not (Test-Path 'C:\Temp')) { New-Item -Path 'C:\Temp' -ItemType Directory -Force | Out-Null }
$log = 'C:\Temp\ITAdminTool_TeamsAddin.log'
$ziel = 'C:\Program Files (x86)\Microsoft\TeamsMeetingAddin\' + $ver + '\'
$pr = Start-Process -FilePath 'msiexec.exe' -ArgumentList @('/i', ('"' + $msi + '"'), 'ALLUSERS=1', ('TARGETDIR="' + $ziel + '"'), 'REBOOT=ReallySuppress', '/qn', '/l*v', ('"' + $log + '"')) -Wait -PassThru
$code = $pr.ExitCode
$txt = @{ 0 = 'installiert'; 3010 = 'installiert (Neustart empfohlen)'; 1638 = 'eine andere Version ist bereits installiert'; 1618 = 'eine andere Installation läuft gerade — später erneut'; 1603 = 'schwerer Fehler (Protokoll ' + $log + ')' }[[int]$code]
if ($code -notin 0, 3010, 1638) { throw ('msiexec meldet Code ' + $code + $(if ($txt) { ': ' + $txt } else { '' })) }
$nach = AddinStand
Zeile ('msiexec: ' + $txt + ' · jetzt: ' + $(if ($nach.Count) { $nach -join ', ' } else { '?' }))
foreach ($w in 'HKLM:\SOFTWARE\Microsoft\Office\Outlook\Addins\TeamsAddin.FastConnect', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Office\Outlook\Addins\TeamsAddin.FastConnect') { if (Test-Path $w) { Zeile ('Outlook-Registrierung ' + $(if ($w -match 'WOW6432') { '32-Bit' } else { '64-Bit' }) + ': LoadBehavior ' + [string](Get-ItemProperty $w -EA SilentlyContinue).LoadBehavior) } }
Zeile 'Outlook neu starten — danach erscheint „Teams-Besprechung“ im Kalender.'` }),
  A({ id: 'teams-protokolle-sammeln', titel: 'Teams-Protokolle für den Support sammeln (ZIP auf den Desktop)', modus: 'profil', risiko: 'aendern', timeoutMs: 180000,
    beschreibung: 'Packt die Protokolle des neuen Teams (Logs, Medien-Protokolle, vom Benutzer erzeugte Support-Dateien aus „Downloads“) und die Teams-Abstürze aus der Ereignisanzeige der letzten 7 Tage in eine ZIP-Datei auf den Desktop des Benutzers — für ein Ticket bei DXC/Microsoft. Nichts wird gelöscht oder auf einen Server geschrieben.',
    ps: String.raw`
NeedHive
$stamp = Get-Date -Format 'yyyyMMdd_HHmm'
$usf = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders'
function Ordner([string]$wert, [string]$std) {
  $roh = $null; try { $roh = (Get-Item $usf -EA Stop).GetValue($wert, $null, 'DoNotExpandEnvironmentNames') } catch {}
  if ($roh) { $roh = ([string]$roh) -replace '%USERPROFILE%', $uProf; if ($roh -notmatch '%' -and (Test-Path -LiteralPath $roh)) { return $roh } }
  return (Join-Path $uProf $std)
}
$desk = Ordner 'Desktop' 'Desktop'
$down = Ordner '{374DE290-123F-4565-9164-39C4925E467B}' 'Downloads'
$tmp = Join-Path $uLocal ('Temp\ITAdminTool_TeamsLogs_' + $stamp)
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$seit = (Get-Date).AddDays(-7); $n = 0; $summe = 0
function Kopie([string]$quelle, [string]$ziel) {
  $in = $null; $out = $null
  try { $in = [IO.File]::Open($quelle, 'Open', 'Read', 'ReadWrite, Delete'); $out = [IO.File]::Create($ziel); $in.CopyTo($out); return $true } catch { return $false } finally { if ($out) { $out.Close() }; if ($in) { $in.Close() } }
}
$base = Join-Path $uLocal 'Packages\MSTeams_8wekyb3d8bbwe\LocalCache\Microsoft\MSTeams'
foreach ($q in @(@('Logs', (Join-Path $base 'Logs')), @('media-stack', (Join-Path $base 'media-stack')))) {
  if (-not (Test-Path -LiteralPath $q[1])) { Zeile ($q[0] + ': nicht vorhanden'); continue }
  foreach ($f in @(Get-ChildItem -LiteralPath $q[1] -Recurse -File -Force -EA SilentlyContinue | Where-Object { $_.LastWriteTime -ge $seit } | Sort-Object LastWriteTime -Descending)) {
    if ($summe + $f.Length -gt 300MB) { break }
    $rel = $f.FullName.Substring($q[1].Length).TrimStart('\'); $z = Join-Path (Join-Path $tmp $q[0]) $rel
    $zd = Split-Path $z -Parent; if (-not (Test-Path -LiteralPath $zd)) { New-Item -ItemType Directory -Path $zd -Force | Out-Null }
    if (Kopie $f.FullName $z) { $n++; $summe += $f.Length }
  }
}
foreach ($f in @(Get-ChildItem -LiteralPath $down -Force -EA SilentlyContinue | Where-Object { $_.Name -match '^(MS Teams Support|PROD-WebLogs|MSTeams Diagnostics)' -and $_.LastWriteTime -ge $seit })) {
  $zd = Join-Path $tmp 'Downloads'; if (-not (Test-Path -LiteralPath $zd)) { New-Item -ItemType Directory -Path $zd -Force | Out-Null }
  if ($f.PSIsContainer) { foreach ($g in @(Get-ChildItem -LiteralPath $f.FullName -Recurse -File -Force -EA SilentlyContinue)) { $z = Join-Path (Join-Path $zd $f.Name) $g.FullName.Substring($f.FullName.Length).TrimStart('\'); $zz = Split-Path $z -Parent; if (-not (Test-Path -LiteralPath $zz)) { New-Item -ItemType Directory -Path $zz -Force | Out-Null }; if (Kopie $g.FullName $z) { $n++; $summe += $g.Length } } }
  elseif (Kopie $f.FullName (Join-Path $zd $f.Name)) { $n++; $summe += $f.Length }
}
$ev = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Error', 'Application Hang'; StartTime = $seit } -MaxEvents 400 -EA SilentlyContinue | Where-Object { [string]$_.Properties[0].Value -match '^(ms-teams|msedgewebview2)\.exe$' })
(@('PC: ' + $env:COMPUTERNAME + ' · Benutzer: ' + $uDomUser + ' · erstellt ' + (Get-Date).ToString('dd.MM.yyyy HH:mm') + ' (Zeiten in Teams-Protokollen sind UTC)') + @($ev | ForEach-Object { $_.TimeCreated.ToString('dd.MM.yyyy HH:mm:ss') + ' · ' + $_.ProviderName + ' · ' + ((([string]$_.Message -split '\r?\n') | Select-Object -First 3) -join ' ') })) | Out-File -LiteralPath (Join-Path $tmp 'Ereignisse.txt') -Encoding UTF8
if (-not $n) { Zeile 'Keine Teams-Protokolle der letzten 7 Tage gefunden (neues Teams nie gestartet?).' }
$zip = Join-Path $desk ('Teams-Protokolle_' + $env:COMPUTERNAME + '_' + $stamp + '.zip')
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($tmp, $zip)
Remove-Item -LiteralPath $tmp -Recurse -Force -EA SilentlyContinue
Zeile ('ZIP erstellt: ' + $zip + ' (' + $n + ' Dateien, ' + (Groesse (Get-Item -LiteralPath $zip).Length) + ', ' + $ev.Count + ' Teams-Abstürze aus der Ereignisanzeige)')
Zeile 'Tipp: Für Microsoft zusätzlich in Teams „Supportdateien sammeln“ (Strg+Alt+Umschalt+1) — die Dateien landen in „Downloads“ und werden beim nächsten Sammeln mitgenommen.'` }),

  // ══ Xelion (Telefonie) ══════════════════════════════════════════════════════
  A({ id: 'xelion-autostart-an', titel: 'Xelion-Autostart einschalten', modus: 'profil', risiko: 'aendern',
    beschreibung: 'Sorgt dafür, dass Xelion bei der Anmeldung des Benutzers startet: über die Startaufgabe des Xelion-Pakets bzw. eine Verknüpfung im Autostart-Ordner; ein im Task-Manager abgeschalteter Eintrag wird wieder eingeschaltet. Wirkt ab der nächsten Anmeldung.',
    ps: MSIX_PS + String.raw`
NeedHive
if (-not $uSid) { throw 'SID des Benutzers unbekannt.' }
$a = AppPaket 'XelionWindowsDesktop'
if (-not $a) { throw 'Xelion (XelionWindowsDesktop) ist auf diesem PC nicht installiert — über Software-Installationen → Xelion einrichten.' }
Zeile ('Xelion ' + $a.Version + ' gefunden.')
if ($a.Task) {
  $k = StartTaskKey $a.Pfn $a.Task
  $alt = $null; if (Test-Path $k) { $alt = (Get-ItemProperty $k -EA SilentlyContinue).State }
  if ($alt -eq 3) { Zeile 'Autostart ist per Richtlinie abgeschaltet — das regelt die Gruppenrichtlinie, nicht das Tool.' } else {
    if (-not (Test-Path $k)) { New-Item -Path $k -Force | Out-Null }
    Set-ItemProperty -Path $k -Name State -Value 2 -Type DWord
    Zeile ('Startaufgabe ' + $a.Task + ': vorher ' + (StTxt $alt) + ' → jetzt an')
  }
} else {
  $ord = Join-Path $uRoam 'Microsoft\Windows\Start Menu\Programs\Startup'
  if (-not (Test-Path -LiteralPath $ord)) { New-Item -ItemType Directory -Path $ord -Force | Out-Null }
  $vorh = @(Get-ChildItem -LiteralPath $ord -Filter '*xelion*' -File -EA SilentlyContinue)
  if ($vorh.Count) { $lnk = $vorh[0].FullName; Zeile ('Autostart-Verknüpfung: vorher vorhanden (' + $vorh[0].Name + ') → bleibt') } else {
    if (-not $a.App) { throw 'App-ID im Xelion-Paket nicht lesbar.' }
    $lnk = Join-Path $ord 'Xelion.lnk'
    $sh = New-Object -ComObject WScript.Shell
    $s = $sh.CreateShortcut($lnk); $s.TargetPath = 'C:\Windows\explorer.exe'; $s.Arguments = ('shell:AppsFolder\' + $a.Pfn + '!' + $a.App); $s.Description = 'Xelion (Autostart, eingerichtet von der IT)'; $s.Save()
    Zeile ('Autostart-Verknüpfung: vorher keine → jetzt ' + $lnk)
  }
  $sa = $uHive + '\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\StartupFolder'
  $ln = Split-Path $lnk -Leaf
  $b = $null; if (Test-Path $sa) { $b = (Get-ItemProperty $sa -EA SilentlyContinue).$ln }
  if ($b -and $b[0] -ne 2) { Set-ItemProperty -Path $sa -Name $ln -Value ([byte[]](2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)) -Type Binary; Zeile ('Im Task-Manager war „' + $ln + '“ deaktiviert → jetzt aktiviert') }
}
Zeile 'Wirkt ab der nächsten Anmeldung. Jetzt sofort starten: „Xelion neu starten“.'` }),
  A({ id: 'xelion-neustart', titel: 'Xelion neu starten', modus: 'benutzer', risiko: 'aendern', timeoutMs: 60000,
    beschreibung: 'Beendet Xelion in der Sitzung des Benutzers und startet es sauber neu (hängende Anmeldung, falscher Status, leeres Telefonbuch, Ton nach Gerätewechsel). Laufende Gespräche werden dabei getrennt.',
    ps: String.raw`
$pk = Get-AppxPackage -Name 'XelionWindowsDesktop' -EA SilentlyContinue | Sort-Object { [version]$_.Version } -Descending | Select-Object -First 1
if (-not $pk) { throw 'Xelion ist für diesen Benutzer nicht installiert — Software-Installationen → Xelion.' }
$txt = ''; try { $txt = [IO.File]::ReadAllText((Join-Path $pk.InstallLocation 'AppxManifest.xml')) } catch {}
$alle = @([regex]::Matches($txt, '(?s)<Application\b[^>]*\bId="([^"]+)"(.*?)</Application>'))
$gut = @($alle | Where-Object { $_.Groups[2].Value -notmatch 'AppListEntry="none"' })
$app = ''; if ($gut.Count) { $app = $gut[0].Groups[1].Value } elseif ($alle.Count) { $app = $alle[0].Groups[1].Value }
if (-not $app) { throw 'App-ID im Xelion-Paket nicht lesbar.' }
$lauf = @(Get-Process -EA SilentlyContinue | Where-Object { $_.Path -and $_.Path -like ($pk.InstallLocation + '\*') })
foreach ($x in $lauf) { try { Stop-Process -Id $x.Id -Force -EA Stop } catch {} }
Zeile ('Xelion ' + $pk.Version + ': ' + $(if ($lauf.Count) { 'beendet (' + $lauf.Count + ' Prozess(e))' } else { 'lief nicht' }))
Start-Sleep -Seconds 2
Start-Process -FilePath 'explorer.exe' -ArgumentList ('shell:AppsFolder\' + $pk.PackageFamilyName + '!' + $app)
Start-Sleep -Seconds 8
$neu = @(Get-Process -EA SilentlyContinue | Where-Object { $_.Path -and $_.Path -like ($pk.InstallLocation + '\*') })
Zeile ('Xelion gestartet: ' + (Ja ($neu.Count -gt 0)) + $(if ($neu.Count) { ' — ggf. einmal neu anmelden und Audiogerät prüfen.' } else { ' — startet nicht: „App-Paket neu registrieren“ (Xelion) versuchen.' }))` }),

  // ══ Smartphone & MFA ════════════════════════════════════════════════════════
  A({ id: 'mfa-uhrzeit-pruefen', titel: 'Uhrzeit-Abweichung prüfen (Domäne und Microsoft 365)', modus: 'system', risiko: 'lesen', timeoutMs: 60000,
    beschreibung: 'Vergleicht die PC-Uhr mit der Zeitquelle (Domänencontroller) und mit der Uhrzeit der Microsoft-Anmeldeserver; zeigt Zeitzone, Zeitquelle und letzte Synchronisierung. Weicht die Uhr um Minuten ab, scheitern Anmeldung, Kerberos und MFA. Ändert nichts.',
    ps: String.raw`
$tz = Get-TimeZone
Zeile ('PC-Uhr: ' + (Get-Date).ToString('dd.MM.yyyy HH:mm:ss') + ' · Zeitzone ' + $tz.Id + $(if ($tz.Id -ne 'W. Europe Standard Time') { ' — NICHT Mitteleuropa' } else { '' }))
$q = (& w32tm.exe /query /status 2>&1 | Out-String)
if ($q -match '0x80070426') { Zeile 'Zeitdienst (W32Time) läuft NICHT — die Uhr wird nicht synchronisiert (→ „Uhrzeit mit der Domäne abgleichen“)' }
foreach ($l in ($q -split '\r?\n')) { if ($l -match '^(Quelle|Source|Letzte erfolgreiche|Last Successful)') { Zeile ('  ' + $l.Trim()) } }
$quelle = ''
$m = [regex]::Match($q, '(?m)^(Quelle|Source):\s*(.+)$'); if ($m.Success) { $quelle = ($m.Groups[2].Value -split ',')[0].Trim() }
if (-not $quelle) { $s = (& w32tm.exe /query /source 2>&1 | Out-String).Trim(); if ($s -notmatch '0x8007|Fehler|error') { $quelle = ($s -split ',')[0].Trim() } }
if ($quelle -match 'CMOS|Free-running|frei laufend') { Zeile ('Zeitquelle: ' + $quelle + ' — die Uhr wird NICHT synchronisiert') }
elseif ($quelle) {
  $sc = (& w32tm.exe /stripchart ('/computer:' + $quelle) /samples:1 /dataonly 2>&1 | Out-String)
  $m = [regex]::Match($sc, '([+-]\d+[\.,]\d+)s')
  if ($m.Success) { $o = [double]($m.Groups[1].Value -replace ',', '.'); Zeile ('Abweichung zur Zeitquelle ' + $quelle + ': ' + [math]::Round($o, 1) + ' s') } else { Zeile ('Zeitquelle ' + $quelle + ' nicht erreichbar') }
}
$ms = $null
try {
  $rq = [System.Net.HttpWebRequest]::Create('https://login.microsoftonline.com/')
  $rq.Method = 'HEAD'; $rq.Timeout = 8000; $rq.AllowAutoRedirect = $false
  $rs = $null
  try { $rs = $rq.GetResponse() } catch { $ex = $_.Exception; while ($ex -and -not ($ex -is [System.Net.WebException])) { $ex = $ex.InnerException }; if ($ex) { $rs = $ex.Response } }
  if ($rs) {
    $d = [regex]::Match([string]$rs.Headers['Date'], '\d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2}')
    if ($d.Success) { $ms = [DateTime]::ParseExact($d.Value, 'dd MMM yyyy HH:mm:ss', [Globalization.CultureInfo]::InvariantCulture, ([Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal)) }
    $rs.Close()
  }
} catch {}
if ($ms) {
  $diff = ((Get-Date).ToUniversalTime() - $ms).TotalSeconds
  $wert = [math]::Round([math]::Abs([double]$diff))
  Zeile ('Abweichung zu Microsoft 365: ' + $wert + ' s ' + $(if ($diff -gt 0) { '(PC geht vor)' } else { '(PC geht nach)' }) + ' — ' + $(if ($wert -gt 300) { 'ZU GROSS: Anmeldungen/Tokens werden abgelehnt → „Uhrzeit mit der Domäne abgleichen“' } elseif ($wert -gt 30) { 'auffällig' } else { 'in Ordnung' }))
} else { Zeile 'Uhrzeit von Microsoft 365 nicht abrufbar (keine Internetverbindung oder Proxy).' }
Zeile 'Hinweis: Falsche Codes in der Authenticator-App kommen fast immer von der Uhr des HANDYS — dort „Datum und Uhrzeit automatisch“ einschalten.'` }),
]
